import asyncio
import logging
import subprocess
import json
import re
import time
from bleak import BleakScanner
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

class BluetoothService:
    def __init__(self):
        self.is_scanning = False
        self.discovered_devices = {}  # { address: { "address": str, "name": str, "rssi": int, "source": str, "rssi_estimated": bool, "paired": bool, "last_seen": float } }
        self.paired_registry = {}     # { "AA:BB:CC:DD:EE:FF": "Friendly Name" }
        self._scanner_task = None
        self._registry_task = None
        self._executor = ThreadPoolExecutor(max_workers=2)
        self.bluetooth_error = None
        self.classic_available = False

    def _extract_mac_from_device_id(self, device_id):
        """Extract MAC from BTHENUM\DEV_AABBCCDDEEFF\..."""
        match = re.search(r'DEV_([0-9A-Fa-f]{12})', device_id)
        if match:
            mac = match.group(1)
            return ":".join(mac[i:i+2] for i in range(0, 12, 2)).upper()
        return None

    async def _powershell_registry_loop(self):
        """Runs every 10s. Builds paired_registry for name resolution only."""
        while self.is_scanning:
            try:
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    self._executor,
                    lambda: subprocess.run(
                        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
                         "Get-PnpDevice -Class Bluetooth | Select-Object FriendlyName, DeviceID | ConvertTo-Json"],
                        capture_output=True, text=True, timeout=8
                    )
                )
                if result.returncode == 0 and result.stdout.strip():
                    raw = json.loads(result.stdout)
                    if isinstance(raw, dict):
                        raw = [raw]
                    
                    new_registry = {}
                    for item in raw:
                        dev_id = item.get("DeviceID", "")
                        name = item.get("FriendlyName", "")
                        if "DEV_" in dev_id and name:
                            mac = self._extract_mac_from_device_id(dev_id)
                            if mac:
                                new_registry[mac] = name
                    self.paired_registry = new_registry
            except Exception as e:
                logger.warning(f"PowerShell registry error: {e}")
            await asyncio.sleep(10)

    def _detection_callback(self, device, advertisement_data):
        """BleakScanner callback. Updates discovered_devices."""
        address = device.address.upper().strip()
        rssi = advertisement_data.rssi
        
        # Name Resolution Logic: Paired Registry -> Local Name -> Device Name -> Unknown
        name = (self.paired_registry.get(address)
                or advertisement_data.local_name
                or device.name
                or "Unknown")

        self.discovered_devices[address] = {
            "address": address,
            "name": name.strip(),
            "rssi": rssi,
            "source": "ble",
            "rssi_estimated": False,
            "paired": (address in self.paired_registry),
            "last_seen": time.time()
        }

    async def _scanner_loop(self):
        """Background loop for BleakScanner and stale cleanup."""
        try:
            async with BleakScanner(
                detection_callback=self._detection_callback,
                scanning_mode="active"
            ) as scanner:
                while self.is_scanning:
                    # Stale device cleanup (remove if not seen for 30s)
                    now = time.time()
                    stale = [addr for addr, d in self.discovered_devices.items()
                             if now - d.get("last_seen", now) > 30]
                    for addr in stale:
                        del self.discovered_devices[addr]
                    
                    await asyncio.sleep(0.5)
        except Exception as e:
            logger.error(f"Bleak scanner error: {e}")
            self.bluetooth_error = "Bluetooth unavailable"
            self.is_scanning = False

    async def start_scan(self):
        """Start both PowerShell registry and Bleak scanning tasks."""
        if self.is_scanning:
            return
        
        self.bluetooth_error = None
        self.is_scanning = True
        self.discovered_devices = {}
        
        # Start both tasks
        self._registry_task = asyncio.create_task(self._powershell_registry_loop())
        self._scanner_task = asyncio.create_task(self._scanner_loop())
        logger.info("BLE Scan + Paired Registry started")

    async def stop_scan(self):
        """Stop all scanning tasks cleanly."""
        self.is_scanning = False
        
        if self._registry_task:
            self._registry_task.cancel()
            try: await self._registry_task
            except asyncio.CancelledError: pass
            self._registry_task = None
            
        if self._scanner_task:
            self._scanner_task.cancel()
            try: await self._scanner_task
            except asyncio.CancelledError: pass
            self._scanner_task = None
            
        self.discovered_devices = {}
        logger.info("BLE scan stopped")

    async def get_discovered_devices(self):
        """Return discovered devices sorted: Paired first, then RSSI descending."""
        if self.bluetooth_error:
            return {"error": self.bluetooth_error}
            
        devices = list(self.discovered_devices.values())
        return sorted(devices, key=lambda x: (not x.get("paired", False), -x["rssi"]))

ble_service = BluetoothService()

import asyncio
import time
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from bleak import BleakScanner

# ERROR HANDLING: Wrap PyBluez in try/except
try:
    import bluetooth
    CLASSIC_BT_AVAILABLE = True
except ImportError:
    CLASSIC_BT_AVAILABLE = False
    logging.warning("Classic Bluetooth (PyBluez) not found. Running in BLE-only mode.")

logger = logging.getLogger(__name__)

class BluetoothService:
    def __init__(self):
        self.is_scanning = False
        self.discovered_devices = {}  # { address: { "address": str, "name": str, "rssi": int, "source": str, "rssi_estimated": bool } }
        self._ble_task = None
        self._classic_loop_task = None
        self._start_time = 0
        self._executor = ThreadPoolExecutor(max_workers=1)
        self.classic_available = CLASSIC_BT_AVAILABLE
        self.RSSI_THRESHOLD = -95  # Problem 1: Updated threshold

    def _classic_scan_worker(self):
        """Blocking classic scan to be run in a thread."""
        if not self.classic_available:
            return []
        try:
            # SCANNER 1 — Classic Bluetooth (PyBluez)
            devices = bluetooth.discover_devices(
                duration=8,
                lookup_names=True,
                flush_cache=True,
                lookup_class=False
            )
            # returns list of (address, name) tuples
            return devices
        except Exception as e:
            logger.error(f"Classic scan error: {e}")
            return []

    async def _classic_scan_loop(self):
        """Loop that runs classic scan periodically."""
        try:
            while self.is_scanning:
                if self.classic_available:
                    loop = asyncio.get_event_loop()
                    devices = await loop.run_in_executor(self._executor, self._classic_scan_worker)
                    
                    for address, name in devices:
                        # For Classic BT devices where RSSI is unavailable → include with rssi = -70
                        self._update_device(
                            address=address,
                            name=name,
                            rssi=-70,
                            source="classic",
                            rssi_estimated=True
                        )
                
                # classic_scan repeats every 15 seconds in a loop
                for _ in range(15):
                    if not self.is_scanning: break
                    await asyncio.sleep(1.0)
        except asyncio.CancelledError:
            logger.info("Classic scan loop cancelled")

    def _update_device(self, address, name, rssi, source, rssi_estimated=False):
        # RSSI FILTER RULE (strict): Threshold -95 dBm
        if rssi < self.RSSI_THRESHOLD and not rssi_estimated:
            return

        # MERGED DEVICE DICT logic
        if address in self.discovered_devices:
            existing = self.discovered_devices[address]
            if existing["source"] == "classic" and source == "ble":
                existing["rssi"] = rssi
                existing["rssi_estimated"] = False
                return
            
        self.discovered_devices[address] = {
            "address": address,
            "name": name,
            "rssi": rssi,
            "source": source,
            "rssi_estimated": rssi_estimated
        }

    async def _ble_scan_loop(self):
        """Continuous BLE scan."""
        def detection_callback(device, advertisement_data):
            # Name resolution priority
            name = device.name or advertisement_data.local_name or f"Unknown ({device.address[:6]})"
            rssi = advertisement_data.rssi
            
            self._update_device(
                address=device.address,
                name=name,
                rssi=rssi,
                source="ble",
                rssi_estimated=False
            )

        try:
            async with BleakScanner(detection_callback) as scanner:
                while self.is_scanning:
                    await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            logger.info("BLE scan loop cancelled")

    async def start_scan(self):
        if self.is_scanning:
            return
        self.is_scanning = True
        self.discovered_devices = {}
        self._start_time = time.time()
        
        # Start both scanners concurrently
        self._ble_task = asyncio.create_task(self._ble_scan_loop())
        self._classic_loop_task = asyncio.create_task(self._classic_scan_loop())
        
        logger.info("Dual Bluetooth Scan started")

    async def stop_scan(self):
        self.is_scanning = False
        
        # Problem 4: Cleanly cancel both tasks
        if self._ble_task:
            self._ble_task.cancel()
            try: await self._ble_task
            except asyncio.CancelledError: pass
            self._ble_task = None
            
        if self._classic_loop_task:
            self._classic_loop_task.cancel()
            try: await self._classic_loop_task
            except asyncio.CancelledError: pass
            self._classic_loop_task = None
            
        self.discovered_devices = {}
        logger.info("Dual Bluetooth Scan stopped")

    async def get_discovered_devices(self):
        # Only return results after 5 seconds
        if time.time() - self._start_time < 5:
            return []
            
        # Problem 3: Correct filter to include estimated RSSI devices
        devices = [d for d in self.discovered_devices.values() 
                  if d.get("rssi_estimated", False) or d["rssi"] >= self.RSSI_THRESHOLD]
        
        # Sort by rssi descending (strongest signal first)
        return sorted(devices, key=lambda x: x["rssi"], reverse=True)

ble_service = BluetoothService()

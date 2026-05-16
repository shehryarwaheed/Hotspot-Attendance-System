import subprocess
import asyncio
import re
import socket
import json
from datetime import datetime
from database import SessionLocal
from models import Student, Attendance, Lecture

class WifiService:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if not self._initialized:
            self._reset_state()
            self.host_mac = None
            self._initialized = True

    def _reset_state(self):
        self.scanning = False
        self.lecture_id = None
        self.scan_task = None
        self.start_time = None
        self.duration_secs = 120

    def normalize_mac(self, mac: str) -> str:
        """Normalize MAC to lowercase with colons (e.g., aa:bb:cc:dd:ee:ff)."""
        if not mac: return ""
        normalized = mac.replace('-', ':').lower().strip()
        if re.match(r'^([0-9a-f]{2}:){5}[0-9a-f]{2}$', normalized):
            return normalized
        clean = re.sub(r'[^a-f0-9]', '', mac.lower())
        if len(clean) == 12:
            return ":".join(clean[i:i+2] for i in range(0, 12, 2))
        return normalized

    def get_hotspot_ip(self) -> str:
        """Dynamically finds the IP address of the Hotspot gateway."""
        try:
            # Query for the IP on the 'Local Area Connection*' or 'Wi-Fi' adapters that usually host hotspots
            ps_cmd = "Get-NetIPAddress | Where-Object { $_.InterfaceAlias -like 'Local Area Connection*' -or $_.InterfaceAlias -like 'vEthernet*' } | Select-Object IPAddress | ConvertTo-Json"
            result = subprocess.check_output(["powershell", "-Command", ps_cmd]).decode().strip()
            if result:
                data = json.loads(result)
                if isinstance(data, list): data = data[0]
                return data.get("IPAddress", "192.168.137.1")
        except:
            pass
        return "192.168.137.1" # Fallback to standard

    async def is_hotspot_active(self) -> bool:
        """Authoritative Hotspot status check using WinRT API."""
        ps_script = """
        try {
            [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime] | Out-Null
            $profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
            if ($profile) {
                $manager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($profile)
                $state = $manager.TetheringOperationalState
                # State 1 is 'On'
                if ($state -eq 1) { $true } else { $false }
            } else { $false }
        } catch { 
            # Fallback to checking if any Hotspot-like adapter exists
            $addr = Get-NetIPAddress | Where-Object { $_.InterfaceAlias -like 'Local Area Connection*' }
            if ($addr) { $true } else { $false }
        }
        """
        try:
            proc = await asyncio.create_subprocess_exec(
                "powershell", "-Command", ps_script,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=3.0)
            if proc.returncode == 0 and stdout:
                return stdout.decode().strip().lower() == "true"
            return False
        except Exception:
            return False

    async def _fetch_host_mac(self) -> str:
        """Fetches the MAC address of the laptop's own Hotspot adapter."""
        try:
            ps_cmd = "Get-NetIPAddress | Where-Object { $_.InterfaceAlias -like 'Local Area Connection*' -or $_.InterfaceAlias -like 'vEthernet*' } | Get-NetAdapter | Select-Object -First 1 | Select-Object LinkLayerAddress | ConvertTo-Json"
            proc = await asyncio.create_subprocess_exec(
                "powershell", "-Command", ps_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=3.0)
            if proc.returncode == 0 and stdout:
                raw = stdout.decode().strip()
                if raw:
                    data = json.loads(raw)
                    if isinstance(data, list): data = data[0]
                    return self.normalize_mac(data.get("LinkLayerAddress"))
        except: pass
        return ""

    async def _fetch_authoritative_clients(self) -> list[dict]:
        """Fetches the actual currently connected clients using WinRT API with a Get-NetNeighbor fallback."""
        ps_script = """
        try {
            [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime] | Out-Null
            $profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
            if ($profile) {
                $manager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($profile)
                $clients = $manager.GetClients()
                if ($clients) {
                    $clients | ForEach-Object { 
                        @{ 
                            MacAddress = $_.MacAddress; 
                            IPAddress = if ($_.HostNames.Count -gt 0) { $_.HostNames[0].CanonicalName } else { "Unknown" }
                        } 
                    } | ConvertTo-Json
                } else { "[]" }
            } else { "[]" }
        } catch { 
            # Fallback to strict Neighbor check if WinRT fails
            Get-NetIPAddress -IPAddress '192.168.137.1' | Get-NetNeighbor | Where-Object { $_.IPAddress -ne '192.168.137.1' -and $_.State -eq 6 } | Select-Object @{Name='MacAddress';Expression={$_.LinkLayerAddress}}, @{Name='IPAddress';Expression={$_.IPAddress}} | ConvertTo-Json
        }
        """
        try:
            proc = await asyncio.create_subprocess_exec(
                "powershell", "-Command", ps_script,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5.0)
            if proc.returncode == 0 and stdout:
                raw = stdout.decode().strip()
                if raw and raw != "[]":
                    data = json.loads(raw)
                    return [data] if isinstance(data, dict) else data
        except Exception as e:
            print(f"[Wi-Fi] Auth Client Fetch Error: {e}")
        return []

    async def get_connected_devices(self) -> list[dict]:
        """Registration scan: Finds devices for MAC assignment using authoritative WinRT data."""
        devices = []
        if not await self.is_hotspot_active(): return devices
        
        try:
            if not self.host_mac:
                self.host_mac = await self._fetch_host_mac()

            clients = await self._fetch_authoritative_clients()
            seen_macs = set()

            for item in clients:
                ip = str(item.get("IPAddress", "Unknown")).strip()
                mac = self.normalize_mac(item.get("MacAddress"))
                
                # Filter out Host, Multicast, and Invalid MACs
                if not mac or mac == self.host_mac or mac in ("00:00:00:00:00:00", "ff:ff:ff:ff:ff:ff"): continue
                if mac.startswith("33:33:") or mac.startswith("01:00:5e:"): continue
                
                if mac not in seen_macs:
                    # Attempt to resolve name if WinRT didn't provide a good one
                    name = ip
                    if ip == "Unknown" or re.match(r'^(\d{1,3}\.){3}\d{1,3}$', ip):
                        try:
                            # If it's an IP, try to get hostname
                            if ip != "Unknown":
                                name = socket.gethostbyaddr(ip)[0]
                        except:
                            name = f"Device ({mac[:8]})"
                    
                    devices.append({"ip": ip, "mac": mac, "name": name})
                    seen_macs.add(mac)
        except Exception as e:
            print(f"Registration Authoritative Scan Error: {e}")
        return devices

    def _get_device_name(self, ip):
        try: return socket.gethostbyaddr(ip)[0]
        except Exception: return ip

    async def _probe_device(self, ip):
        """Async ping probe to trigger ARP update. Note: some devices block ICMP."""
        try:
            # Use a fast ping to refresh the neighbor state
            proc = await asyncio.create_subprocess_exec(
                "ping", "-n", "1", "-w", "500", ip,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await asyncio.wait_for(proc.communicate(), timeout=1.0)
            # Secondary check for Windows-based clients
            try:
                _, writer = await asyncio.wait_for(asyncio.open_connection(ip, 135), timeout=0.2)
                writer.close()
                await writer.wait_closed()
            except: pass
        except: pass

    async def get_live_connected_macs(self) -> set[str]:
        """Authoritative attendance scan using Unified WinRT fetcher."""
        macs = set()
        if not await self.is_hotspot_active(): return macs
        
        if not self.host_mac:
            self.host_mac = await self._fetch_host_mac()
            
        try:
            clients = await self._fetch_authoritative_clients()
            
            for item in clients:
                mac = self.normalize_mac(item.get("MacAddress"))
                if not mac or mac == self.host_mac or mac in ("00:00:00:00:00:00", "ff:ff:ff:ff:ff:ff"): continue
                if mac.startswith("33:33:") or mac.startswith("01:00:5e:"): continue
                macs.add(mac)
            
            print(f"[Wi-Fi] Authoritative Scanned MACs: {list(macs)}")
        except Exception as e:
            print(f"[Wi-Fi] Authoritative Scan Error: {e}")
            
        return macs

    async def start_wifi_attendance_scan(self, lecture_id: int, duration_mins: int = 2):
        # Cancel any lingering task from a previous session first
        if self.scan_task and not self.scan_task.done():
            self.scan_task.cancel()
            try:
                await self.scan_task
            except asyncio.CancelledError:
                pass
        # Now reset all state cleanly
        self._reset_state()
        # Set new session state
        self.scanning = True
        self.lecture_id = lecture_id
        self.start_time = datetime.now()
        self.duration_secs = duration_mins * 60
        self.scan_task = asyncio.create_task(self._scan_loop())

    async def _scan_loop(self):
        print(f"[Wi-Fi] Loop started for {self.lecture_id}")
        while self.scanning:
            if (datetime.now() - self.start_time).total_seconds() >= self.duration_secs:
                self.scanning = False
                break
                
            try:
                # 1. Check if hotspot is active
                if not await self.is_hotspot_active():
                    live_macs = set()
                else:
                    # 2. Get the actual currently connected MAC addresses
                    live_macs = await self.get_live_connected_macs()
                
                # Safeguard: Only proceed if there are genuine connected student devices
                if not live_macs:
                    await asyncio.sleep(3)
                    continue

                db = SessionLocal()
                try:
                    lecture = db.query(Lecture).filter(Lecture.id == self.lecture_id).first()
                    if not lecture:
                        self.scanning = False
                        break
                    
                    # 3. Fetch all students in the section
                    students = db.query(Student).filter(Student.section == lecture.section).all()
                    changed = False
                    
                    # 4. Perform transparent 1-to-1 matching
                    for student in students:
                        if not student.wifi_mac: continue
                        
                        reg_mac = self.normalize_mac(student.wifi_mac)
                        attendance = db.query(Attendance).filter(
                            Attendance.lecture_id == self.lecture_id,
                            Attendance.student_id == student.id
                        ).first()
                        
                        # Verify if this specific student's MAC is in the live list
                        if reg_mac in live_macs:
                            if attendance and attendance.status == "absent":
                                attendance.status = "present"
                                attendance.marked_at = datetime.now()
                                attendance.match_method = "wifi_hotspot"
                                print(f"[Wi-Fi] OK: Student {student.roll_number} matched via {reg_mac}")
                                changed = True
                    
                    if changed:
                        db.commit()
                finally:
                    db.close()
            except Exception as e: 
                print(f"[Wi-Fi] Error in Match Loop: {e}")
                
            await asyncio.sleep(3) # Check every 3 seconds as requested

    def stop_wifi_attendance_scan(self):
        self.scanning = False
        if self.scan_task:
            self.scan_task.cancel()
            self.scan_task = None

    def get_scan_status(self, db) -> dict:
        if not self.lecture_id or not self.start_time:
            return {"session_active": False, "time_remaining": 0, "present": [], "absent": []}
        
        elapsed = (datetime.now() - self.start_time).total_seconds() if self.start_time else 0
        time_remaining = max(0, int(self.duration_secs - elapsed))
        
        attendance_records = db.query(Attendance).filter(Attendance.lecture_id == self.lecture_id).all()
        present = []
        absent = []
        for a in attendance_records:
            student = db.query(Student).filter(Student.id == a.student_id).first()
            if not student: continue
            s_data = {"roll_number": student.roll_number, "name": student.name}
            if a.status == "present": present.append(s_data)
            else: absent.append(s_data)
            
        return {
            "session_active": self.scanning,
            "time_remaining": time_remaining,
            "lecture_id": self.lecture_id,
            "present": present,
            "absent": absent
        }

wifi_service = WifiService()

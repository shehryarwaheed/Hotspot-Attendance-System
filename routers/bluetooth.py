from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
from services.ble_service import ble_service
from pydantic import BaseModel

router = APIRouter(prefix="/bluetooth", tags=["bluetooth"])

class AssignMAC(BaseModel):
    roll_number: str
    device_identifier: str
    device_name: str

@router.get("/scan")
async def start_or_get_scan():
    await ble_service.start_scan()
    live_devices = await ble_service.get_discovered_devices()
    
    # If get_discovered_devices returns an error dict
    if isinstance(live_devices, dict) and "error" in live_devices:
        return live_devices
        
    live_macs = {d["address"] for d in live_devices}

    # Add paired registry devices not yet detected by bleak (for registration dropdown)
    paired_extras = [
        {"address": mac, "name": name, "rssi": -70,
         "rssi_estimated": True, "source": "paired", "paired": True}
        for mac, name in ble_service.paired_registry.items()
        if mac not in live_macs
    ]

    all_devices = live_devices + paired_extras
    # Sort: non-estimated (real detections) first, then by rssi descending
    all_devices.sort(key=lambda x: (x.get("rssi_estimated", False), -x["rssi"]))

    return {
        "devices": all_devices,
        "classic_available": ble_service.classic_available
    }

@router.get("/devices")
async def get_devices():
    devices = await ble_service.get_discovered_devices()
    return {
        "devices": devices,
        "classic_available": ble_service.classic_available
    }

@router.post("/stop")
async def stop_scan():
    await ble_service.stop_scan()
    return {"message": "Scan stopped"}

@router.post("/assign")
def assign_mac(data: AssignMAC, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.roll_number == data.roll_number).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Problem 5: Don't save "Unknown" as a real name
    device_name = data.device_name
    if device_name and device_name.startswith("Unknown"):
        device_name = None

    student.device_identifier = data.device_identifier
    student.device_name = device_name
    db.commit()
    return {"message": f"Device assigned to {student.name}"}

@router.post("/unregister")
def unregister_mac(data: dict, db: Session = Depends(get_db)):
    roll_number = data.get("roll_number")
    if not roll_number:
        raise HTTPException(status_code=400, detail="Roll number is required")
        
    student = db.query(models.Student).filter(models.Student.roll_number == roll_number).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    student.device_identifier = None
    student.device_name = None
    db.commit()
    return {"message": f"Device unassigned from {student.name}"}

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import Student
from services.wifi_service import wifi_service
from pydantic import BaseModel
import re

router = APIRouter(prefix="/wifi", tags=["wifi"])

class WifiAssignRequest(BaseModel):
    student_id: int
    mac: str

def validate_mac(mac: str) -> bool:
    # Normalize and then check regex
    norm = mac.replace('-', ':').lower().strip()
    return bool(re.match(r'^([0-9a-f]{2}:){5}[0-9a-f]{2}$', norm))

@router.get("/scan-devices")
async def scan_devices():
    # wifi_service.get_connected_devices now performs live ping verification
    devices = await wifi_service.get_connected_devices()
    return {"devices": devices}

@router.post("/assign")
def assign_wifi_mac(payload: dict, db: Session = Depends(get_db)):
    student_id = payload.get("student_id")
    mac_raw = payload.get("mac", "").strip()

    if not student_id or not mac_raw:
        raise HTTPException(status_code=400, detail="student_id and mac are required")

    # BUG FIX 3: Always normalize MAC to standard colon-separated lowercase before saving
    mac = wifi_service.normalize_mac(mac_raw)
    
    if not validate_mac(mac):
        raise HTTPException(status_code=400, detail="Invalid MAC address format.")

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Check for duplicates ONLY WITHIN THE SAME SECTION using normalized MAC
    existing = db.query(Student).filter(
        Student.section == student.section,
        Student.wifi_mac == mac,
        Student.id != student_id
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"MAC already assigned to {existing.name} ({existing.roll_number}) in section {existing.section}"
        )

    student.wifi_mac = mac
    try:
        db.commit()
        return {
            "message": "Wi-Fi MAC assigned successfully",
            "student_id": student_id,
            "wifi_mac": mac
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/registered-students")
async def get_registered_students(db: Session = Depends(get_db)):
    students = db.query(Student).filter(Student.wifi_mac != None).all()
    return {
        "students": [
            {
                "id": s.id,
                "name": s.name,
                "roll_number": s.roll_number,
                "section": s.section,
                "wifi_mac": s.wifi_mac
            } for s in students
        ]
    }

@router.delete("/unassign/{student_id}")
async def unassign_wifi_mac(student_id: int, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    student.wifi_mac = None
    db.commit()
    
    return {"message": "Wi-Fi MAC unassigned successfully"}

@router.get("/hotspot-status")
async def get_hotspot_status():
    is_active = await wifi_service.is_hotspot_active()
    ip = wifi_service.get_hotspot_ip()
    return {"active": is_active, "ip": ip}

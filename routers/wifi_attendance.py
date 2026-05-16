from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Lecture, Attendance, Student
from services.wifi_service import wifi_service
from pydantic import BaseModel

router = APIRouter(prefix="/wifi-attendance", tags=["wifi-attendance"])

class StartWifiAttendanceRequest(BaseModel):
    title: str
    date: str
    section: str
    duration: int = 5

@router.post("/start")
async def start_wifi_attendance(request: StartWifiAttendanceRequest, db: Session = Depends(get_db)):
    """Initializes a Wi-Fi attendance session and starts background scanning."""
    # Create lecture entry
    lecture = Lecture(
        title=request.title,
        date=request.date,
        section=request.section
    )
    db.add(lecture)
    db.commit()
    db.refresh(lecture)

    # Initialize all students in the section as absent
    students = db.query(Student).filter(Student.section == request.section).all()
    if not students:
        raise HTTPException(status_code=400, detail="No students found in this section.")

    attendance_records = []
    for student in students:
        attendance_records.append(Attendance(
            lecture_id=lecture.id,
            student_id=student.id,
            status="absent",
            marked_at=None,
            match_method=None
        ))
    db.bulk_save_objects(attendance_records)
    db.commit()

    # Start the scan process with dynamic duration
    await wifi_service.start_wifi_attendance_scan(lecture_id=lecture.id, duration_mins=request.duration)
    return {"message": "Wi-Fi session started", "lecture_id": lecture.id}

@router.get("/status")
async def get_wifi_attendance_status(db: Session = Depends(get_db)):
    """Poll endpoint used by app.js to update the live UI."""
    return wifi_service.get_scan_status(db)

@router.post("/stop")
async def stop_wifi_attendance():
    """Manually stops the session early."""
    wifi_service.stop_wifi_attendance_scan()
    return {"message": "Wi-Fi session stopped"}

@router.get("/live/{lecture_id}")
async def get_live_attendance(lecture_id: int, db: Session = Depends(get_db)):
    """Legacy endpoint compatibility (calls status)."""
    return wifi_service.get_scan_status(db)

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from database import get_db
import models
from services.ble_service import ble_service
from services.excel_service import export_attendance_to_excel
from pydantic import BaseModel
from datetime import date as date_obj
from sqlalchemy.sql import func
import asyncio

router = APIRouter(prefix="/attendance", tags=["attendance"])

class StartSession(BaseModel):
    title: str
    date: date_obj
    section: str

active_sessions = {} # lecture_id: task

async def attendance_background_task(lecture_id: int, db_session_factory):
    # This task runs for 2 minutes or until cancelled
    try:
        await ble_service.start_scan()
        end_time = asyncio.get_event_loop().time() + 120 # 2 minutes
        
        while asyncio.get_event_loop().time() < end_time and ble_service.is_scanning:
            devices = await ble_service.get_discovered_devices()
            
            db = db_session_factory()
            try:
                for device in devices:
                    # RSSI FILTER (new — strict):
                    # Before attempting any match, check if device["rssi"] < -80:
                    # Exception: if rssi_estimated is true → still attempt match
                    if device["rssi"] < -95 and not device.get("rssi_estimated", False):
                        continue

                    # Find student in this section
                    lecture = db.query(models.Lecture).filter(models.Lecture.id == lecture_id).first()
                    if not lecture: continue

                    student = db.query(models.Student).filter(
                        models.Student.section == lecture.section,
                        (models.Student.device_identifier == device["address"]) | 
                        (func.lower(models.Student.device_name) == func.lower(device["name"].strip()))
                    ).first()

                    if student:
                        # Update attendance
                        att = db.query(models.Attendance).filter(
                            models.Attendance.lecture_id == lecture_id,
                            models.Attendance.student_id == student.id,
                            models.Attendance.status == 'absent'
                        ).first()
                        
                        if att:
                            att.status = 'present'
                            att.marked_at = func.now()
                            # MATCH METHOD field — update to reflect source
                            att.match_method = f"bluetooth_{device['source']}"
                            db.commit()
                
            finally:
                db.close()
            
            await asyncio.sleep(3)
    finally:
        await ble_service.stop_scan()
        if lecture_id in active_sessions:
            del active_sessions[lecture_id]

@router.post("/start")
async def start_attendance(data: StartSession, db: Session = Depends(get_db)):
    # 1. Create lecture
    lecture = models.Lecture(title=data.title, date=data.date, section=data.section)
    db.add(lecture)
    db.commit()
    db.refresh(lecture)
    
    # 2. Initialize attendance rows for all registered students in this section
    students = db.query(models.Student).filter(
        models.Student.section == data.section,
        models.Student.device_identifier != None
    ).all()
    
    if not students:
        raise HTTPException(status_code=400, detail="No registered students in this section")
        
    for s in students:
        attendance = models.Attendance(lecture_id=lecture.id, student_id=s.id, status='absent')
        db.add(attendance)
    db.commit()
    
    # 3. Start background task
    from database import SessionLocal
    task = asyncio.create_task(attendance_background_task(lecture.id, SessionLocal))
    active_sessions[lecture.id] = task
    
    return {"lecture_id": lecture.id}

@router.get("/live/{lecture_id}")
def get_live_attendance(lecture_id: int, db: Session = Depends(get_db)):
    attendance = db.query(models.Attendance).filter(models.Attendance.lecture_id == lecture_id).all()
    results = []
    for a in attendance:
        results.append({
            "roll_number": a.student.roll_number,
            "name": a.student.name,
            "status": a.status,
            "marked_at": a.marked_at
        })
    return results

@router.post("/stop")
async def stop_attendance(lecture_id: int = None):
    # If lecture_id is provided, stop that specific session. Otherwise stop all (or global ble)
    await ble_service.stop_scan()
    if lecture_id and lecture_id in active_sessions:
        active_sessions[lecture_id].cancel()
        del active_sessions[lecture_id]
    return {"message": "Attendance session stopped"}

@router.get("/export/{lecture_id}")
def export_attendance(lecture_id: int, db: Session = Depends(get_db)):
    lecture = db.query(models.Lecture).filter(models.Lecture.id == lecture_id).first()
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")
        
    attendance = db.query(models.Attendance).filter(models.Attendance.lecture_id == lecture_id).all()
    data = []
    for a in attendance:
        data.append({
            "Roll Number": a.student.roll_number,
            "Name": a.student.name,
            "Status": a.status,
            "Marked At": a.marked_at.strftime("%Y-%m-%d %H:%M:%S") if a.marked_at else ""
        })
    
    content, filename = export_attendance_to_excel(data, lecture.section, lecture.date, lecture.title)
    
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

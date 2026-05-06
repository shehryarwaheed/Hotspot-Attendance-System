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
            
            # Diagnostic logs
            import time
            print(f"\n[SCAN CYCLE] {time.time():.2f}")
            print(f"[DISCOVERED] MACs in air: {[d['address'].upper() for d in devices]}")

            db = db_session_factory()
            try:
                # Get the section for this lecture once
                lecture = db.query(models.Lecture).filter(models.Lecture.id == lecture_id).first()
                if not lecture:
                    db.close()
                    break
                
                section_name = lecture.section
                used_macs = set() # Safeguard: One device per student per cycle

                for device in devices:
                    # Normalize detected MAC
                    discovered_mac = device["address"].upper().strip()
                    
                    if discovered_mac in used_macs:
                        continue

                    # RSSI FILTER (strict):
                    if device["rssi"] < -95 and not device.get("rssi_estimated", False):
                        continue

                    # Find student in this section by EXACT MAC match ONLY
                    # We use func.upper and func.trim on the DB field to ensure absolute matching
                    student = db.query(models.Student).filter(
                        models.Student.section == section_name,
                        func.upper(func.trim(models.Student.device_identifier)) == discovered_mac
                    ).first()

                    if student:
                        # Diagnostic comparison
                        stored_mac = student.device_identifier.upper().strip()
                        print(f"[COMPARING] {student.name} stored={stored_mac} | match: {stored_mac == discovered_mac}")

                        # Update attendance
                        att = db.query(models.Attendance).filter(
                            models.Attendance.lecture_id == lecture_id,
                            models.Attendance.student_id == student.id,
                            models.Attendance.status == 'absent'
                        ).first()
                        
                        if att:
                            att.status = 'present'
                            att.marked_at = func.now()
                            source = device.get('source', 'unknown')
                            att.match_method = f"bt_{source}"
                            db.commit()
                            used_macs.add(discovered_mac)
                            print(f"[MARKED PRESENT] {student.name} via {discovered_mac}")
                
            except Exception as e:
                print(f"[ERROR] Attendance cycle error: {e}")
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
    
    # 2. Initialize attendance rows for ALL students in this section
    students = db.query(models.Student).filter(
        models.Student.section == data.section
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
    attendance = db.query(models.Attendance).join(models.Student).filter(
        models.Attendance.lecture_id == lecture_id
    ).order_by(models.Student.roll_number.asc()).all()
    results = []
    for a in attendance:
        results.append({
            "roll_number": a.student.roll_number,
            "name": a.student.name,
            "status": a.status,
            "marked_at": a.marked_at.strftime("%H:%M:%S") if a.marked_at else a.lecture.created_at.strftime("%H:%M:%S")
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
            "Section": lecture.section,
            "Date": lecture.date.strftime("%Y-%m-%d"),
            "Status": a.status,
            "Marked At": a.marked_at.strftime("%H:%M:%S") if a.marked_at else lecture.created_at.strftime("%H:%M:%S")
        })
    
    content, filename = export_attendance_to_excel(data, lecture.section, lecture.date, lecture.title)
    
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/sessions")
def get_all_sessions(db: Session = Depends(get_db)):
    # Fetch all lectures ordered by date descending
    return db.query(models.Lecture).order_by(models.Lecture.date.desc()).all()

@router.get("/details/{lecture_id}")
def get_session_details(lecture_id: int, db: Session = Depends(get_db)):
    attendance = db.query(models.Attendance).join(models.Student).filter(
        models.Attendance.lecture_id == lecture_id
    ).order_by(models.Student.roll_number.asc()).all()
    results = []
    for a in attendance:
        results.append({
            "attendance_id": a.id,
            "roll_number": a.student.roll_number,
            "name": a.student.name,
            "status": a.status,
            "marked_at": a.marked_at.strftime("%H:%M:%S") if a.marked_at else a.lecture.created_at.strftime("%H:%M:%S")
        })
    return results

class UpdateAttendance(BaseModel):
    attendance_id: int
    status: str

@router.post("/update")
def update_attendance_status(data: UpdateAttendance, db: Session = Depends(get_db)):
    att = db.query(models.Attendance).filter(models.Attendance.id == data.attendance_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Record not found")
    
    att.status = data.status
    if data.status == 'present' and not att.marked_at:
        att.marked_at = func.now()
    elif data.status == 'absent':
        att.marked_at = None
        
    db.commit()
    return {"message": "Updated successfully"}

@router.delete("/session/{lecture_id}")
def delete_session(lecture_id: int, db: Session = Depends(get_db)):
    # Delete all attendance records for this lecture first
    db.query(models.Attendance).filter(models.Attendance.lecture_id == lecture_id).delete()
    # Delete the lecture itself
    lecture = db.query(models.Lecture).filter(models.Lecture.id == lecture_id).first()
    if lecture:
        db.delete(lecture)
        db.commit()
        return {"message": "Session deleted successfully"}
    raise HTTPException(status_code=404, detail="Lecture not found")

@router.delete("/abort/{lecture_id}")
def abort_attendance_session(lecture_id: int, db: Session = Depends(get_db)):
    # Delete all attendance records and the lecture to "undo" the session
    db.query(models.Attendance).filter(models.Attendance.lecture_id == lecture_id).delete()
    lecture = db.query(models.Lecture).filter(models.Lecture.id == lecture_id).first()
    if lecture:
        db.delete(lecture)
    db.commit()
    return {"message": "Session aborted and deleted"}

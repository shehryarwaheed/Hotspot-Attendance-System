from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
from services.excel_service import parse_student_excel

router = APIRouter(prefix="/students", tags=["students"])

@router.post("/upload")
async def upload_students(
    section: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    content = await file.read()
    try:
        student_data = parse_student_excel(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse Excel: {str(e)}")

    added_count = 0
    for s in student_data:
        # Check if roll number already exists
        exists = db.query(models.Student).filter(models.Student.roll_number == s["roll_number"]).first()
        if not exists:
            new_student = models.Student(
                roll_number=s["roll_number"],
                name=s["name"],
                section=section
            )
            db.add(new_student)
            added_count += 1
    
    db.commit()
    return {"message": f"{added_count} students loaded from Excel", "count": added_count}

@router.get("/list")
def list_students(section: str = None, db: Session = Depends(get_db)):
    query = db.query(models.Student)
    if section:
        query = query.filter(models.Student.section == section)
    return query.all()

@router.get("/sections")
def get_sections(db: Session = Depends(get_db)):
    sections = db.query(models.Student.section).distinct().all()
    return [s[0] for s in sections]

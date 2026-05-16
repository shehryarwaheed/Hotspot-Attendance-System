from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    roll_number = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    section = Column(String(50), nullable=False)
    device_identifier = Column(String(200), nullable=True)
    device_name = Column(String(100), nullable=True)
    wifi_mac = Column(String(50), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    attendance_records = relationship("Attendance", back_populates="student")

class Lecture(Base):
    __tablename__ = "lectures"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    section = Column(String(50), nullable=False)
    date = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    attendance_records = relationship("Attendance", back_populates="lecture")

class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    lecture_id = Column(Integer, ForeignKey("lectures.id"))
    student_id = Column(Integer, ForeignKey("students.id"))
    status = Column(String(10), default="absent")  # 'present' or 'absent'
    match_method = Column(String(20), nullable=True)
    marked_at = Column(DateTime(timezone=True), nullable=True)

    lecture = relationship("Lecture", back_populates="attendance_records")
    student = relationship("Student", back_populates="attendance_records")

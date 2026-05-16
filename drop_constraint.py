from sqlalchemy import create_engine, text
import os

DATABASE_URL = "postgresql://postgres:123456@localhost:5432/attendance_db"
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    try:
        print("Dropping unique constraint 'students_wifi_mac_key'...")
        conn.execute(text("ALTER TABLE students DROP CONSTRAINT IF EXISTS students_wifi_mac_key;"))
        conn.commit()
        print("Constraint dropped successfully.")
    except Exception as e:
        print(f"Error: {e}")

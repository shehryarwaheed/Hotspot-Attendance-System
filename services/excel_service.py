import pandas as pd
from io import BytesIO

def parse_student_excel(file_content: bytes):
    # Based on AttendanceSheet.xlsx: Column B (index 1) = Roll Number, Column C (index 2) = Name
    df = pd.read_excel(BytesIO(file_content))
    students = []
    for _, row in df.iterrows():
        try:
            roll_number = str(row.iloc[1]).strip()
            name = str(row.iloc[2]).strip()
            if roll_number and name and roll_number != "nan" and name != "nan":
                students.append({"roll_number": roll_number, "name": name})
        except:
            continue
    return students

def export_attendance_to_excel(attendance_data, section, date, lecture_title):
    # Columns: Roll Number | Name | Status (Present/Absent)
    df = pd.DataFrame(attendance_data)
    
    filename = f"Attendance_{section}_{date}_{lecture_title}.xlsx".replace(" ", "_")
    
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Attendance')
    
    return output.getvalue(), filename

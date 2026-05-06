import pandas as pd
from io import BytesIO

def parse_student_excel(file_content: bytes):
    df = pd.read_excel(BytesIO(file_content))
    students = []
    
    # Normalize columns to lowercase for easier matching
    orig_cols = list(df.columns)
    low_cols = [str(c).lower().strip() for c in orig_cols]
    
    # Try to find Roll Number and Name columns
    roll_idx = next((i for i, c in enumerate(low_cols) if 'roll' in c or 'id' in c), 0)
    name_idx = next((i for i, c in enumerate(low_cols) if 'name' in c or 'student' in c), 1)

    for _, row in df.iterrows():
        try:
            roll_val = str(row.iloc[roll_idx]).strip()
            name_val = str(row.iloc[name_idx]).strip()
            
            if roll_val and name_val and roll_val.lower() != "nan" and name_val.lower() != "nan":
                students.append({"roll_number": roll_val, "name": name_val})
        except:
            continue
    return students

def export_attendance_to_excel(attendance_data, section, date, lecture_title):
    # Columns: Roll Number | Name | Status (Present/Absent)
    df = pd.DataFrame(attendance_data)
    
    filename = f"{lecture_title}, {section}.xlsx"
    # Basic sanitization for Windows/Unix filenames
    for char in ['/', '\\', ':', '*', '?', '"', '<', '>', '|']:
        filename = filename.replace(char, "_")
    
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Attendance')
    
    return output.getvalue(), filename

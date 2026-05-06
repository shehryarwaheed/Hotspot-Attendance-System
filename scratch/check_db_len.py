from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()
engine = create_engine(os.getenv("DATABASE_URL"))

query = text("SELECT roll_number, name, device_identifier, length(device_identifier) as mac_len FROM students WHERE section = 'BSE-4B'")
with engine.connect() as conn:
    result = conn.execute(query)
    print("Roll Number | Name | MAC Address | Length")
    print("-" * 50)
    for row in result:
        print(f"{row[0]} | {row[1]} | {row[2]} | {row[3]}")

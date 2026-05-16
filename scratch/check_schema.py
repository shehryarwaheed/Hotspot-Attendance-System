import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

def check_schema():
    conn = None
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        print("Checking 'students' table columns:")
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'students';")
        rows = cur.fetchall()
        for row in rows:
            print(f"- {row[0]}")
            
        cur.close()
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    check_schema()

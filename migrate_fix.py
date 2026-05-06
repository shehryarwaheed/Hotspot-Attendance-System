import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

def migrate():
    conn = None
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        print("Starting column size migration...")
        
        # Step: Alter column type to VARCHAR(200)
        try:
            cur.execute("ALTER TABLE students ALTER COLUMN device_identifier TYPE VARCHAR(200);")
            print("Successfully updated device_identifier type to VARCHAR(200).")
        except Exception as e:
            print(f"Error during migration: {e}")
            conn.rollback()
        else:
            conn.commit()

        cur.close()
        print("Migration finished.")
        
    except Exception as e:
        print(f"Connection failed: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    migrate()

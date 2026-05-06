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
        
        print("Starting migration...")
        
        # Step 1: Rename mac_address to device_identifier (or drop if it was incorrectly added)
        try:
            cur.execute("ALTER TABLE students RENAME COLUMN mac_address TO device_identifier;")
            print("Renamed mac_address to device_identifier.")
        except Exception as e:
            print(f"Note: Could not rename mac_address (might already be renamed).")
            conn.rollback()
            # If it already exists, let's make sure we don't have a redundant mac_address column
            try:
                cur.execute("ALTER TABLE students DROP COLUMN IF EXISTS mac_address;")
                print("Dropped redundant mac_address column.")
            except Exception as drop_e:
                print(f"Error dropping mac_address: {drop_e}")
                conn.rollback()
            else:
                conn.commit()
        else:
            conn.commit()

        # Step 2: Add device_name if it does not exist
        try:
            cur.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS device_name VARCHAR(100) DEFAULT NULL;")
            print("Added device_name column if it didn't exist.")
        except Exception as e:
            print(f"Error adding device_name: {e}")
            conn.rollback()
        else:
            conn.commit()

        # Step 3: Add match_method to attendance if it does not exist
        try:
            cur.execute("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS match_method VARCHAR(20) DEFAULT NULL;")
            print("Added match_method column if it didn't exist.")
        except Exception as e:
            print(f"Error adding match_method: {e}")
            conn.rollback()
        else:
            conn.commit()

        # Verification
        print("\nVerifying columns in 'students' table:")
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'students';")
        rows = cur.fetchall()
        for row in rows:
            print(f"- {row[0]}")
            
        cur.close()
        print("\nMigration script finished.")
        
    except Exception as e:
        print(f"Connection failed: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    migrate()

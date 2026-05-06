from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()
engine = create_engine(os.getenv("DATABASE_URL"))

query = text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
with engine.connect() as conn:
    result = conn.execute(query)
    print("Tables:")
    for row in result:
        print(row[0])

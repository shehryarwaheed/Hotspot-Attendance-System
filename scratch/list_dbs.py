from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()
# Connect to default 'postgres' db to list others
base_url = "postgresql://postgres:123456@localhost:5432/postgres"
engine = create_engine(base_url)

query = text("SELECT datname FROM pg_database")
with engine.connect() as conn:
    result = conn.execute(query)
    print("Databases:")
    for row in result:
        print(row[0])

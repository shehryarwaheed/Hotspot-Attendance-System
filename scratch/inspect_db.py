from sqlalchemy import create_engine, inspect
import os
from dotenv import load_dotenv

load_dotenv()
engine = create_engine(os.getenv("DATABASE_URL"))
inspector = inspect(engine)

print(f"Current Database: {engine.url.database}")
print("Tables in public schema:")
for table_name in inspector.get_table_names():
    print(f"- {table_name}")

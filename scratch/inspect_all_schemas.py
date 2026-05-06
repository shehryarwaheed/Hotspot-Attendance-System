from sqlalchemy import create_engine, inspect
import os
from dotenv import load_dotenv

load_dotenv()
engine = create_engine(os.getenv("DATABASE_URL"))
inspector = inspect(engine)

for schema in inspector.get_schema_names():
    print(f"Schema: {schema}")
    for table_name in inspector.get_table_names(schema=schema):
        print(f"  - {table_name}")

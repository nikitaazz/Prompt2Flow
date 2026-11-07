from sqlalchemy import text
from main import engine

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE catalog ADD COLUMN category VARCHAR DEFAULT 'Other'"))
        conn.commit()
        print("✅ Migration done")
    except Exception as e:
        print(f"The column already exists or another error occurred: {e}")
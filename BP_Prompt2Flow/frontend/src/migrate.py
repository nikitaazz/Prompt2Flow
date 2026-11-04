from sqlalchemy import text
from main import engine

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE catalog ADD COLUMN category VARCHAR DEFAULT 'Iné'"))
        conn.commit()
        print("✅ Migrácia hotová")
    except Exception as e:
        print(f"Stĺpec už existuje alebo iná chyba: {e}")
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base, Workplace, Employee, ShiftDefinition, Assignment

# 1. Connection string for local SQLite
DATABASE_URL = "sqlite:///./auto_shift.db"

# 2. Create the engine
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# 3. Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """
    Creates the .db file and all tables defined in models.py
    """
    # By importing the classes above, they are now registered in Base.metadata
    Base.metadata.create_all(bind=engine)
    print("Database and all tables created successfully!")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
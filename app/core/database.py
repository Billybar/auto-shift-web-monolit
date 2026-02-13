import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Retrieve the database connection string
DATABASE_URL = os.getenv("DATABASE_URL")

# Critical check: Ensure DATABASE_URL is provided to prevent runtime failures
if not DATABASE_URL:
    raise ValueError(
        "CRITICAL ERROR: DATABASE_URL is not set in the environment variables. "
        "Please check your .env file or Docker configuration."
    )

# Initialize SQLAlchemy engine for PostgreSQL
# We removed SQLite-specific arguments like 'check_same_thread'
engine = create_engine(DATABASE_URL)

# Configure the session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for SQLAlchemy models
Base = declarative_base()

def init_db():
    """
    Creates all tables defined in the models if they do not exist in the database.
    """
    from app.core.models import Base  # Local import to avoid circular dependencies
    Base.metadata.create_all(bind=engine)

def get_db():
    """
    FastAPI dependency that provides a database session for each request.
    Ensures the session is closed after the request is finished.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
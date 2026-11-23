import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
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

# Initialize SQLAlchemy engine for PostgreSQL.
# pool_pre_ping tests each pooled connection before use, so a Postgres restart
# or a dropped idle connection doesn't fail the next request.
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# Configure the session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""


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
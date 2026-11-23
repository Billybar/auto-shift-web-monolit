import logging
import os
from pathlib import Path

from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# The repo's alembic/ folder (copied into the Docker image with the rest of the source)
ALEMBIC_DIR = Path(__file__).resolve().parents[2] / "alembic"

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


def init_schema() -> None:
    """
    Creates missing tables on startup. On an empty database, also stamps the Alembic head.

    The migration chain has no step that creates the tables (its first revision only alters them),
    so `alembic upgrade head` can't build a fresh DB. create_all builds the current schema instead,
    and the stamp records it as up to date, so later `alembic upgrade head` runs apply only new
    migrations. A DB that already has tables is left to Alembic: create_all adds missing tables
    but never alters existing ones, and nothing is stamped.
    """
    from app.core import models  # noqa: F401  registers every table on Base.metadata

    is_fresh = not inspect(engine).get_table_names()
    Base.metadata.create_all(bind=engine)
    if not is_fresh:
        return

    script = ScriptDirectory(str(ALEMBIC_DIR))
    with engine.begin() as connection:
        # Writes alembic_version directly; running alembic's env.py would reset the app's logging config
        MigrationContext.configure(connection).stamp(script, "head")
    logger.info("Fresh database: created all tables and stamped Alembic head %s", script.get_current_head())


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
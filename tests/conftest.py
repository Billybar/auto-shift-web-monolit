# tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.engine import make_url
from app.core.config import DATABASE_URL
from app.core.database import Base, get_db
from main import app

# Use the DATABASE_URL provided by Docker Compose (db_test) or the throwaway DB on :5433
SQLALCHEMY_DATABASE_URL = DATABASE_URL

# The fixtures below drop every table, so refuse to run against anything that isn't a test database.
_db_name = make_url(SQLALCHEMY_DATABASE_URL).database
if not _db_name or "test" not in _db_name:
    pytest.exit(
        f"Refusing to run: DATABASE_URL points at database {_db_name!r}, whose name doesn't contain 'test'. "
        "The fixtures drop all tables. Use the throwaway DB from docker-compose.pytest-db.yml (port 5433).",
        returncode=2,
    )

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    # StaticPool is used if we were using SQLite in-memory,
    # but for Postgres, default pooling is fine.
)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    """Creates new tables for each test and drops them at the end."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        # Drop tables to ensure a clean state for the next test
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """Creates a TestClient that utilizes the test database."""

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    # Swap the real get_db with our testing version
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    # Clear overrides after the test is done
    app.dependency_overrides.clear()
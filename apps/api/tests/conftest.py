# /apps/api/tests/conftest.py

from __future__ import annotations

# Force the API into AUTH_DISABLED mode before anything imports the
# settings singleton - pydantic-settings reads this at module-load time.
# Tests opt into multi-user scenarios via the X-Dev-User header (the
# headers fixture below sets it for the implicit default user) so we
# never need to mint real JWTs in unit tests.
import os

os.environ.setdefault("AUTH_DISABLED", "1")
os.environ.setdefault("DEV_USER_EMAIL", "dev@frameboard.test")

from collections.abc import Generator  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.engine import Engine  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

# Importing app.models registers every model on Base.metadata before
# create_all runs. app.main also pulls them in, but we import explicitly
# so this fixture works even if main.py's imports change.
import app.models  # noqa: F401, E402
from app.db.session import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402


@event.listens_for(Engine, "connect")
def _enable_sqlite_fk(dbapi_connection, connection_record):  # noqa: ANN001
    """SQLite disables FK enforcement by default. Our cascades (workspace ->
    items -> rice_score) depend on it, so turn it on for every connection."""
    import sqlite3

    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def _override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture()
def client_as():
    """Factory yielding a context manager that scopes a TestClient to a
    given dev-user email via the `X-Dev-User` header. Use for multi-user
    scenarios where you need separate identities mid-test:

        with client_as("alice@example.com") as alice:
            alice.post("/v1/workspaces", json={"name": "Alice WS"})

    Test must own the underlying `client` fixture so the dependency
    override and DB session are shared."""

    class _Scoped:
        def __init__(self, base: TestClient, email: str):
            self._base = base
            self._email = email

        def __enter__(self) -> TestClient:
            # Wrap the existing client; headers are merged into every
            # request via TestClient's `headers` attribute.
            self._prev = dict(self._base.headers)
            self._base.headers["X-Dev-User"] = self._email
            return self._base

        def __exit__(self, *exc):
            # Restore the previous header set so the outer test isn't
            # polluted by this scope.
            self._base.headers.clear()
            self._base.headers.update(self._prev)
            return False

    def factory(base: TestClient, email: str) -> _Scoped:
        return _Scoped(base, email)

    return factory

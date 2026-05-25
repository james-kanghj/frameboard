# /apps/api/Dockerfile
#
# Self-host image for the Frameboard FastAPI backend. Built from
# requirements.txt (the production-only mirror of pyproject.toml's
# [project.dependencies]) so the runtime stays small. Entrypoint runs
# Alembic migrations on start, then uvicorn — no external orchestrator
# needed for the single-instance case.

FROM python:3.12-slim AS base

# psycopg's binary wheel needs nothing on the system side, but keep
# curl around for in-container healthchecks.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (Docker layer cache).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code + migrations.
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

ENV API_HOST=0.0.0.0 \
    API_PORT=8001 \
    PYTHONUNBUFFERED=1

EXPOSE 8001

# Healthcheck hits the unauth probe so a misconfigured DATABASE_URL
# fails the container, not just the request.
HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -sf http://localhost:8001/healthz || exit 1

# Run Alembic on every start. It is idempotent — re-running at HEAD is
# a no-op — so this works for fresh and existing databases alike.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host ${API_HOST} --port ${API_PORT}"]

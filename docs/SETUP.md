/docs/SETUP.md

# Setup

## Prerequisites

- Node.js 20+
- pnpm 9+
- Python 3.12+
- Docker (for local Postgres) or your own Postgres 16+

## 1. Clone and install

```bash
git clone https://github.com/james-kanghj/frameboard.git
cd frameboard
pnpm install
```

## 2. Environment files

Frameboard follows a strict environment file convention:

| Env         | Frontend (`apps/web`)        | Backend (`apps/api`)    |
| ----------- | ---------------------------- | ----------------------- |
| Local       | `.env.development.local`     | `.env.local`            |
| Development | `.env.development`           | `.env.development`      |
| Production  | `.env.production`            | `.env.production`       |

For local development, copy the examples:

```bash
cp apps/web/.env.example apps/web/.env.development.local
cp apps/api/.env.example apps/api/.env.local
```

Then generate secrets:

```bash
# NEXTAUTH_SECRET (for apps/web/.env.development.local)
openssl rand -base64 32

# JWT_SECRET_KEY and APP_SECRET_KEY (for apps/api/.env.local)
openssl rand -hex 32
```

## 3. Database

Start Postgres with Docker:

```bash
docker compose up -d db
```

Or use your own Postgres and update `DATABASE_URL` in `apps/api/.env.local`.

## 4. Install backend dependencies

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cd ../..
```

## 5. Run

Run both apps with one command:

```bash
pnpm dev
```

Or run them separately:

```bash
pnpm dev:web   # http://localhost:3000
pnpm dev:api   # http://localhost:8000  (docs at /docs)
```

## 6. Run tests

```bash
# Backend
cd apps/api && pytest

# Frontend (when added)
cd apps/web && pnpm test
```

## 7. Database migrations (Alembic)

Migrations live in `apps/api/alembic/versions/`. Alembic reads `DATABASE_URL`
from `app.core.config.settings` (which loads `apps/api/.env.local` etc.), so
there is no separate URL to configure in `alembic.ini`.

### Apply migrations

Make sure Postgres is up (see step 3 — `docker compose up -d db`), then from
`apps/api/` with the venv active:

```bash
cd apps/api
alembic upgrade head
```

To check current revision / history:

```bash
alembic current
alembic history --verbose
```

### Create a new migration

After editing a model under `app/models/`, autogenerate the diff:

```bash
alembic revision --autogenerate -m "add foo column" --rev-id 0002_add_foo
```

Notes:

- Pass `--rev-id` to keep filenames sequential (`0002_…`, `0003_…`). Without
  it, Alembic uses a random hex slug.
- **Always review the generated file** before committing — autogenerate
  misses things like server-side defaults, custom types, and renames. Hand-
  edit as needed.
- To roll back one step locally: `alembic downgrade -1`.

# Setup

This guide walks you through running Frameboard locally. The instructions assume macOS; minor adjustments may be needed on Linux or Windows.

## Prerequisites

- **Node.js 20+** (tested with 20 and 26)
- **pnpm 9+** (tested with 11.3.0 from Homebrew)
- **Python 3.12+** (tested with 3.12 and 3.14)
- **Docker** (for local Postgres) or your own Postgres 16+

## 1. Clone and install

```bash
git clone https://github.com/james-kanghj/frameboard.git
cd frameboard
pnpm install
```

After `pnpm install` completes, pnpm 11+ will warn about ignored build scripts for `sharp` and `unrs-resolver`. Approve them once:

```bash
pnpm approve-builds
```

In the interactive prompt, select both packages with `space`, press `Enter`, then confirm with `y`.

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

### Port choices

To avoid conflicts with anything already running on your machine, the defaults are:

| Service  | Default port | Reason |
|----------|--------------|--------|
| Postgres | `5433`       | Avoids clashing with a system or Homebrew Postgres on `5432` |
| Backend  | `8001`       | Avoids common port-8000 collisions |
| Frontend | `3000`       | Next.js default |

If you change one, update the corresponding value in `.env.local` (backend `API_PORT`, `DATABASE_URL`) and `.env.development.local` (frontend `NEXT_PUBLIC_API_BASE_URL`). The compose file's host port is set in `docker-compose.yml` under `services.db.ports`.

## 3. Database

Start Postgres with Docker:

```bash
docker compose up -d db
```

This exposes Postgres on **`localhost:5433`** (Docker maps host `5433` → container `5432`). Update `DATABASE_URL` in `apps/api/.env.local` if you use a different setup.

To check it's healthy:

```bash
docker compose ps
docker compose exec db psql -U frameboard -d frameboard -c '\dt'
```

## 4. Install backend dependencies

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cd ../..
```

If `pip install` fails complaining about `project.authors[0].email`, see [Troubleshooting](#troubleshooting) below.

## 5. Database migrations (Alembic)

Migrations live in `apps/api/alembic/versions/`. Alembic reads `DATABASE_URL` from `app.core.config.settings` (which loads `apps/api/.env.local`), so there's no separate URL to configure in `alembic.ini`.

### Apply migrations

With Postgres running (step 3) and the venv active:

```bash
cd apps/api
alembic upgrade head
```

You should see four tables created: `users`, `workspaces`, `backlog_items`, `rice_scores`.

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

- Pass `--rev-id` to keep filenames sequential (`0002_…`, `0003_…`). Without it, Alembic uses a random hex slug.
- **Always review the generated file** before committing - autogenerate misses things like server-side defaults, custom types, and renames. Hand-edit as needed.
- To roll back one step locally: `alembic downgrade -1`.

## 6. Run

The cleanest local setup uses two terminals.

**Terminal A - backend:**

```bash
cd apps/api && source .venv/bin/activate
uvicorn app.main:app --reload --port 8001
```

The API is at [http://localhost:8001](http://localhost:8001), and the interactive OpenAPI docs are at [http://localhost:8001/docs](http://localhost:8001/docs).

**Terminal B - frontend:**

```bash
pnpm --filter @frameboard/web dev
```

The app is at [http://localhost:3000](http://localhost:3000). The workspaces list is at [/workspaces](http://localhost:3000/workspaces).

You can also run them together via Turbo (less verbose logs):

```bash
pnpm dev
```

## 7. Run tests

```bash
# Backend (42 tests at the time of writing)
cd apps/api && source .venv/bin/activate
pytest -v

# Frontend (Playwright smoke tests are planned in Step 7)
```

## Troubleshooting

A few issues that come up when setting this up cold:

- **`pip install` fails on `project.authors[0].email`** - setuptools 80+ validates IDN-email strictly and rejects underscores in the local part. Use a different email (a `[email protected]` noreply works well), or remove the `email = "..."` field entirely from the `authors` line in `apps/api/pyproject.toml`.

- **`alembic upgrade head` says `SyntaxError: invalid syntax` on a file under `app/`** - a Python file has an unprefixed path string as its first line. Convention: Python and YAML/TOML headers must start with `#`; CSS must use `/* ... */`; TS/JS uses `//`. JSON files have no header.

- **Postgres won't start: `port is already allocated`** - something else is on `5432` (often Homebrew Postgres). Change the host port in `docker-compose.yml` to `"5433:5432"` and update `DATABASE_URL` in `apps/api/.env.local`.

- **Frontend can't reach backend (CORS or connection refused)** - verify that `NEXT_PUBLIC_API_BASE_URL` in `apps/web/.env.development.local` matches the port your `uvicorn` is running on, and that the backend's `API_CORS_ORIGINS` (in `apps/api/.env.local`) includes `http://localhost:3000`.

- **`pnpm dev` fails with `EADDRINUSE :::3000`** - a previous Next.js process is still running. Kill it: `lsof -ti :3000 | xargs kill -9`.

- **`pnpm install` refuses to run, saying the project requires a specific pnpm version** - the `packageManager` field in the root `package.json` is pinned. Either match that version locally, or bump the pin to match what you have (`pnpm --version`).

- **`Cannot find module './XX.js'` or infinite loading after running a production build alongside dev** - Next.js's dev server and production build write incompatible chunk IDs to the same `apps/web/.next` directory. If you've run `next build` for any reason (verification, CI debug, etc.), clear the cache and restart the dev server: `rm -rf apps/web/.next && pnpm --filter @frameboard/web dev`.
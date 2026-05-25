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

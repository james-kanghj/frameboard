<div align="center">

# Frameboard

**An open-source workspace for product teams to run RICE, ICE, MoSCoW, and Kano prioritization — without leaving the browser.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Status: Alpha](https://img.shields.io/badge/status-alpha-orange.svg)](#status)

</div>

---

## Why Frameboard?

Product managers waste hours each sprint debating "what to build next" in spreadsheets, sticky notes, and Slack threads. Existing tools either lock you into one framework (Jira, Linear) or charge per seat for what should be a 10-minute decision.

**Frameboard is different:**

- 🧮 **Multi-framework** — Compare the same backlog across RICE, ICE, MoSCoW, and Value-vs-Effort in one board
- 👥 **Collaborative scoring** — Each teammate scores independently; see distribution and disagreement at a glance
- 📤 **Export-first** — Push results to Jira, Linear, Notion, or CSV. No lock-in
- 🚀 **Self-hostable** — One Docker command. Your data stays yours

## Status

Pre-alpha, built in the open. **Backend is functional** (RICE scoring persisted, 42 tests passing). Frontend workspace list is live; the scoring board UI is next.

| Layer | Status |
|---|---|
| Database schema | ✅ Users, workspaces, items, RICE scores |
| Backend API | ✅ 10 endpoints, full test coverage |
| Frontend workspace list | ✅ Create + browse workspaces |
| Frontend scoring board | 🚧 In progress |
| Auth | ⏳ Single-user hardcoded for MVP |
| Self-host Docker image | ⏳ Planned |

## Quick start

```bash
# Clone
git clone https://github.com/james-kanghj/frameboard.git
cd frameboard

# Install JS dependencies
pnpm install
pnpm approve-builds       # approve native build scripts (sharp, unrs-resolver)

# Start Postgres
docker compose up -d db

# Set up backend
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env.local
alembic upgrade head      # creates all four tables
cd ../..

# Set up frontend env
cp apps/web/.env.example apps/web/.env.development.local
# Defaults point the FE at http://localhost:8001
```

Then in two terminals:

```bash
# Terminal A — backend
cd apps/api && source .venv/bin/activate
uvicorn app.main:app --reload --port 8001
```

```bash
# Terminal B — frontend
pnpm --filter @frameboard/web dev
```

Open [http://localhost:3000/workspaces](http://localhost:3000/workspaces).

See [docs/SETUP.md](docs/SETUP.md) for the full guide, including notes on port choices and common pitfalls.

## Tech stack

| Layer    | Tech                                                       |
| -------- | ---------------------------------------------------------- |
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui   |
| Backend  | FastAPI, Python 3.12+, SQLAlchemy 2.0, Alembic             |
| Database | PostgreSQL 16 (Dockerized, port `5433` to avoid conflicts) |
| Monorepo | pnpm workspaces + Turborepo                                |
| Testing  | pytest (backend), Playwright (frontend, planned Step 7)    |

## Roadmap

- [x] Monorepo scaffolding (Next.js + FastAPI + Postgres)
- [x] Alembic migrations + initial schema
- [x] Workspace and backlog item CRUD endpoints
- [x] RICE score persistence with upsert + board endpoint
- [x] Frontend API client + workspace list page
- [ ] RICE scoring board UI (sortable, inline edit)
- [ ] Item create/edit modal
- [ ] End-to-end smoke tests (Playwright)
- [ ] ICE / MoSCoW / Value-vs-Effort frameworks
- [ ] Collaborative scoring with disagreement visualization
- [ ] Jira / Linear / Notion export
- [ ] Self-host Docker image
- [ ] Multi-user auth (NextAuth.js + JWT)
- [ ] Public hosted instance

See [GitHub Projects](https://github.com/james-kanghj/frameboard/projects) for the live board.

## Contributing

Contributions are welcome — from typo fixes to new prioritization frameworks. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Maintainer

Built and maintained by [James](https://github.com/james-kanghj) — an 11-year QA engineer pivoting to product management. Frameboard is the tool I wished my product managers had used.

## License

[MIT](LICENSE)
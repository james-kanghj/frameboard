<div align="center">

# Frameboard

**An open-source workspace for product teams to run RICE, ICE, MoSCoW, and Kano prioritization — without leaving the browser.**

### 🚀 [Live demo → frameboard.pages.dev](https://frameboard.pages.dev)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Status: Alpha](https://img.shields.io/badge/status-alpha-orange.svg)](#status)
[![CI](https://github.com/james-kanghj/frameboard/actions/workflows/ci.yml/badge.svg)](https://github.com/james-kanghj/frameboard/actions/workflows/ci.yml)
[![Built with Claude Code](https://img.shields.io/badge/built%20with-Claude%20Code-D97757)](https://claude.com/claude-code)

</div>

---

## Screenshots

The board at a glance — filter bar, top-10 bar chart, and the table:

![Board hero — Q2 2026 Roadmap with filters and bar chart](./docs/screenshots/01-board-hero.png)

<table>
  <tr>
    <td width="50%"><strong>Effort × Score scatter</strong><br><sub>PM's classic 2×2 quadrant: Quick wins / Big bets / Fill-ins / Avoid</sub></td>
    <td width="50%"><strong>Multiple workspaces</strong><br><sub>Each workspace holds a backlog and its RICE scoring</sub></td>
  </tr>
  <tr>
    <td><a href="./docs/screenshots/02-scatter-view.png"><img src="./docs/screenshots/02-scatter-view.png" alt="Effort × Score scatter plot"></a></td>
    <td><a href="./docs/screenshots/03-workspaces-list.png"><img src="./docs/screenshots/03-workspaces-list.png" alt="Workspaces list"></a></td>
  </tr>
  <tr>
    <td colspan="2"><strong>Live filtering — search + status with URL state</strong><br><sub>e.g. <code>?q=integration&status=scored&view=scatter</code> survives refresh and is shareable</sub></td>
  </tr>
  <tr>
    <td colspan="2"><a href="./docs/screenshots/04-filter-search.png"><img src="./docs/screenshots/04-filter-search.png" alt="Live filter narrowing 25 items to one match"></a></td>
  </tr>
</table>

> Captured against the live deployment — regenerate any time with `pnpm --filter @frameboard/web exec node scripts/capture-screenshots.mjs`.

## Why Frameboard?

Product managers waste hours each sprint debating "what to build next" in spreadsheets, sticky notes, and Slack threads. Existing tools either lock you into one framework (Jira, Linear) or charge per seat for what should be a 10-minute decision.

**Frameboard is different:**

- 🧮 **Multi-framework** — Compare the same backlog across RICE, ICE, MoSCoW, and Value-vs-Effort in one board
- 👥 **Collaborative scoring** — Each teammate scores independently; see distribution and disagreement at a glance
- 📤 **Export-first** — Push results to Jira, Linear, Notion, or CSV. No lock-in
- 🚀 **Self-hostable** — One Docker command. Your data stays yours

## Status

Alpha, built in the open. **Live and deployed** at [frameboard.pages.dev](https://frameboard.pages.dev) (Cloudflare Pages frontend + Render backend + Neon Postgres). End-to-end happy path is functional: create a workspace, add items, score them with RICE, edit inline or via modal, delete.

| Layer | Status |
|---|---|
| Database schema | ✅ Users, workspaces, items, RICE scores |
| Backend API | ✅ Full CRUD + RICE upsert (44 pytest tests) |
| Frontend workspace list + board | ✅ Create, score, edit (modal + inline), delete |
| End-to-end test suite | ✅ 5 Playwright scenarios, green in CI |
| Production deployment | ✅ Cloudflare Pages + Render + Neon |
| Auth | ⏳ Single-user hardcoded for MVP |
| Self-host Docker image | ⏳ Planned |
| Multi-framework (ICE / MoSCoW / Kano) | ⏳ RICE only for now |

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
| Testing  | pytest (44 tests, backend), Playwright (5 e2e scenarios)   |
| Deploy   | Cloudflare Pages (frontend) + Render (backend) + Neon (DB) |
| CI       | GitHub Actions — web, api, e2e jobs all gated on PRs       |

## Roadmap

- [x] Monorepo scaffolding (Next.js + FastAPI + Postgres)
- [x] Alembic migrations + initial schema
- [x] Workspace and backlog item CRUD endpoints
- [x] RICE score persistence with upsert + board endpoint
- [x] Frontend API client + workspace list page
- [x] RICE scoring board UI (sortable, inline edit)
- [x] Item create/edit modal
- [x] End-to-end smoke tests (Playwright, 5 scenarios)
- [x] CI pipeline (web + api + e2e jobs)
- [x] Public hosted instance ([frameboard.pages.dev](https://frameboard.pages.dev))
- [x] Score distribution chart (top-N horizontal bars above the table)
- [x] Effort × Score scatter plot (PM-style 2×2 quadrant, tab-toggled with the bar chart)
- [x] Board search — title + description, with URL state (`?q=`)
- [x] Board status filter — All / Scored / Unscored segmented toggle (URL `?status=`)
- [ ] Score history / change-log timeline per item
- [ ] Board quick-wins filter — effort threshold + score-range chips
- [ ] Item tags / categories — schema addition + tag filter UI
- [ ] ICE / MoSCoW / Value-vs-Effort frameworks
- [ ] Collaborative scoring with disagreement visualization
- [ ] Jira / Linear / Notion export
- [ ] Self-host Docker image
- [ ] Multi-user auth (NextAuth.js + JWT)

See [GitHub Projects](https://github.com/james-kanghj/frameboard/projects) for the live board.

## Contributing

Contributions are welcome — from typo fixes to new prioritization frameworks. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Maintainer

Built and maintained by [James](https://github.com/james-kanghj) — a 15-year QA/SDET engineer pivoting to product management. Frameboard is the tool I wished my product managers had used.

## Built with Claude Code

Frameboard was bootstrapped from an empty repo to a live production deployment in a single focused day, paired with [Claude Code](https://claude.com/claude-code) as a pair-programming partner. The commit history, CI runs, and architecture decisions are all public — useful as a reference for other solo builders evaluating LLM-assisted development workflows.

## License

[MIT](LICENSE)
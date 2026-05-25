<div align="center">

# Frameboard

**An open-source workspace for product teams to run RICE, ICE, MoSCoW, and Kano prioritization — without leaving the browser.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

## Why Frameboard?

Product managers waste hours each sprint debating "what to build next" in spreadsheets, sticky notes, and Slack threads. Existing tools either lock you into one framework (Jira, Linear) or charge per seat for what should be a 10-minute decision.

**Frameboard is different:**

- 🧮 **Multi-framework** — Compare the same backlog across RICE, ICE, MoSCoW, and Value-vs-Effort in one board
- 👥 **Collaborative scoring** — Each teammate scores independently; see distribution and disagreement at a glance
- 📤 **Export-first** — Push results to Jira, Linear, Notion, or CSV. No lock-in
- 🚀 **Self-hostable** — One Docker command. Your data stays yours

## Quick start

```bash
# Clone
git clone https://github.com/james-kanghj/frameboard.git
cd frameboard

# Install
pnpm install

# Run frontend + backend together
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

See [docs/SETUP.md](docs/SETUP.md) for full setup including database and environment variables.

## Tech stack

| Layer    | Tech                                        |
| -------- | ------------------------------------------- |
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui |
| Backend  | FastAPI, Python 3.12, SQLAlchemy            |
| Database | PostgreSQL 16                               |
| Monorepo | pnpm workspaces + Turborepo                 |

## Roadmap

- [x] Monorepo scaffolding
- [ ] RICE scoring board (MVP)
- [ ] ICE / MoSCoW / Value-vs-Effort frameworks
- [ ] Collaborative scoring with disagreement visualization
- [ ] Jira / Linear / Notion export
- [ ] Self-host Docker image
- [ ] Public hosted instance

See [GitHub Projects](https://github.com/james-kanghj/frameboard/projects) for the live board.

## Contributing

Contributions are welcome — from typo fixes to new prioritization frameworks. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Maintainer

Built and maintained by [James](https://github.com/james-kanghj) — an 11-year QA engineer pivoting to product management. Frameboard is the tool I wished my product managers had used.

## License

[MIT](LICENSE)

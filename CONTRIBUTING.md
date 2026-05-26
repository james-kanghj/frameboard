# Contributing to Frameboard

Thanks for your interest in contributing! Frameboard is built to help product teams make better prioritization decisions, and your contributions help us get there.

## Ways to contribute

- 🐛 **Report bugs** - Use [GitHub Issues](https://github.com/james-kanghj/frameboard/issues)
- 💡 **Propose features** - Open a discussion before large changes
- 📝 **Improve docs** - Typos, clarifications, examples are all welcome
- 🧪 **Add prioritization frameworks** - RICE, ICE, MoSCoW, Kano are in; what's missing?
- 🌐 **Translate** - Frameboard targets a global audience

## Development setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Python 3.12+
- PostgreSQL 16+ (or use the included Docker setup)

### First-time setup

```bash
git clone https://github.com/james-kanghj/frameboard.git
cd frameboard
pnpm install

# Frontend env
cp apps/web/.env.example apps/web/.env.development.local

# Backend env
cp apps/api/.env.example apps/api/.env.local

# Run
pnpm dev
```

## Branch & commit conventions

- Branch naming: `feat/<short-description>`, `fix/<short-description>`, `docs/<short-description>`
- Commit messages: [Conventional Commits](https://www.conventionalcommits.org/)
  - `feat: add Kano framework scoring`
  - `fix: prevent duplicate vote submission`
  - `docs: clarify RICE confidence scale`

## Pull request checklist

- [ ] Tests added or updated
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] README/docs updated if behavior changed
- [ ] PR description explains the "why," not just the "what"

## Code of Conduct

Be kind. Assume good intent. Disagree with ideas, not people.

## Questions?

Open a [Discussion](https://github.com/james-kanghj/frameboard/discussions) or ping the maintainer.

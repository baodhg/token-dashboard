# Contributing to Token Dashboard

Thank you for your interest in contributing! This document covers how to set up the project locally and how to submit changes.

---

## Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL (local instance or a free cloud DB like [Neon](https://neon.tech))

### Steps

```bash
git clone https://github.com/baodhg/token-dashboard.git
cd token-dashboard
npm install
```

Create a `.env` file:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/token_dashboard"
```

Apply the schema:

```bash
npx prisma migrate deploy
```

Start the dev server:

```bash
npm run dev
```

---

## Project Structure

```
app/
  page.tsx              # Main dashboard (client component)
  layout.tsx            # Root layout with i18n + theme
  settings/page.tsx     # Settings page
  api/
    sync/route.ts       # POST — syncs all sources into PostgreSQL
    token-stats/route.ts# GET  — aggregates data for the dashboard

components/
  TokenChart.tsx        # Input/output time-series line chart
  CacheChart.tsx        # Cache read bar chart
  ModelChart.tsx        # Grouped horizontal bar chart by model
  ui/                   # shadcn base components

lib/
  db.ts                 # Prisma singleton
  i18n-context.tsx      # React context for translations
  mock-data.ts          # Period type definitions

messages/
  en.json               # English translations
  vi.json               # Vietnamese translations

scripts/
  cleanup.ts            # Removes old synced log files
```

---

## Adding a New Source

To add a new AI tool integration:

1. Add a sync function in `app/api/sync/route.ts` following the pattern of existing adapters (e.g. `syncCodexSessions`)
2. Add the source identifier to the `source` field values in `prisma/schema.prisma` comments (informational)
3. Add the source badge/filter in `app/page.tsx` in the sources array
4. Add translation keys in `messages/en.json` and `messages/vi.json`

---

## Code Style

- TypeScript strict mode is enabled — avoid `any` where possible
- Keep components focused; large logic belongs in API routes or `lib/`
- No unnecessary abstractions — if a pattern appears once, don't abstract it

---

## Submitting a Pull Request

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes and commit with a descriptive message
4. Push your branch and open a PR against `main`
5. Describe what your PR does and why in the PR description

---

## Reporting Issues

Use GitHub Issues. Please include:

- Your OS and Node.js version
- Steps to reproduce
- What you expected vs. what happened
- Any error messages or logs

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

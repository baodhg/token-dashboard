<div align="center">

# Token Dashboard

**A unified analytics dashboard for tracking AI coding assistant token usage**

Track and visualize token consumption, costs, and cache performance across all your AI tools — in one place.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

## What is Token Dashboard?

Token Dashboard aggregates usage data from multiple AI coding tools into a single, clean interface. Instead of checking each tool separately, you get a unified view of:

- How many tokens you've consumed (input, output, cache)
- Which models you're using most
- Estimated costs over any time period
- Per-project breakdowns

---

## Supported Sources

| Tool | Data Format |
|------|-------------|
| **Claude Code** | JSONL journals (`~/.claude/projects/`) |
| **Cline** | Task JSON files (`~/AppData/Roaming/Code/User/globalStorage/saoudrizwan.claude-dev/tasks/`) |
| **Codex CLI** | JSONL sessions (`~/.codex/`) |
| **Gemini CLI** | JSONL sessions (`~/.gemini/`) |
| **GitHub Copilot** | JSON usage logs (`~/AppData/Roaming/GitHub Copilot/`) |
| **Cursor** | SQLite database (`~/AppData/Roaming/Cursor/`) |

---

## Features

- **Multi-source sync** — pulls data from all supported tools in one click
- **Time-period filtering** — 1d, 3d, 1w, 1m, all-time, or custom date range
- **Source filtering** — toggle individual tools on/off
- **Token charts** — input/output time-series with period-aware bucketing
- **Cache analytics** — visualize cache read hit rates per time bucket
- **Model breakdown** — grouped bar chart showing usage per platform and model
- **Project stats** — searchable, sortable table aggregated by project
- **Cost estimation** — per-session and cumulative cost based on published model pricing
- **Dark / Light / System theme** — persisted to localStorage
- **Vietnamese & English UI** — switchable at runtime

---

## Screenshots

![Token Dashboard](public/demo.png)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Turbopack) |
| Language | TypeScript 5 |
| Database | PostgreSQL via [Prisma 7](https://www.prisma.io) |
| Charts | [Recharts 3](https://recharts.org) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| Runtime | Node.js 20+ |

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (local or hosted)

### 1. Clone & install

```bash
git clone https://github.com/baodhg/token-dashboard.git
cd token-dashboard
npm install
```

### 2. Configure environment

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/token_dashboard"
```

### 3. Set up the database

```bash
npx prisma migrate deploy
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Run with Docker

The whole stack (dashboard + race-server) runs with Docker Compose. The container
reads your local AI-tool logs from the host, so run it on the machine where you
actually use the tools.

**Prerequisites:** Docker + Docker Compose, and `cp .env.example .env`.

### Option A — Bundled database (zero setup)

Best for trying it out. Starts a throwaway PostgreSQL in a container; the app
re-syncs your usage from the local tool logs on first run.

```bash
cp .env.example .env
docker compose --profile bundled up -d --build
```

Open [http://localhost:3000](http://localhost:3000), then click **Sync** to populate it.

### Option B — Your own host PostgreSQL (keep existing data)

Connects to PostgreSQL already running on your machine, so your existing history
shows up immediately.

1. In `.env`, set `DATABASE_URL_DOCKER` (note `host.docker.internal`, not `localhost`):
   ```env
   DATABASE_URL_DOCKER=postgresql://postgres:PASSWORD@host.docker.internal:5432/token_dashboard?schema=public
   ```
2. Allow the container to reach your PostgreSQL (it listens on localhost by default):
   - `postgresql.conf`: `listen_addresses = '*'`
   - `pg_hba.conf`: add `host all all 172.16.0.0/12 scram-sha-256` (Docker's private subnet)
   - restart PostgreSQL
3. Start it:
   ```bash
   docker compose up -d --build
   ```

### Notes

- **Log locations.** Defaults assume Windows. On macOS/Linux set `HOST_HOME` and
  `VSCODE_USER_DIR` in `.env` (examples are in `.env.example`).
- **Ports.** Override with `APP_PORT` / `RACE_PORT` in `.env` if 3000/9876 are taken.
- **Race server.** Leave `RACE_SERVER_DATABASE_URL` unset to use the bundled db, or
  set it (plus `JWT_SECRET` / `ADMIN_KEY`) to join a shared/remote race database.

```bash
docker compose logs -f app     # follow logs
docker compose down            # stop (bundled db data is kept in a volume)
```

---

## Database Schema

```
calls         — individual API call records (model, tokens, cost, timestamp, project, source)
sync_state    — tracks file positions to enable incremental syncing
```

---

## Usage

### Sync data

Click the **Sync** button in the dashboard header (or `POST /api/sync`) to pull the latest usage data from all configured sources.

Sync is incremental — only new records are processed on each run.

### Cleanup old logs

```bash
npm run cleanup
```

Removes synced log files to free disk space (does not delete database records).

---

## Deployment

### Vercel (recommended)

1. Push this repo to GitHub
2. Import into [Vercel](https://vercel.com)
3. Add `DATABASE_URL` as an environment variable
4. Deploy

### Self-hosted

```bash
npm run build
npm start
```

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started.

Areas where help is appreciated:
- Additional source integrations (Windsurf, Aider, Continue, etc.)
- Docker Compose setup
- Tests

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=baodhg/token-dashboard&type=Date)](https://star-history.com/#baodhg/token-dashboard&Date)

---

## License

MIT — see [LICENSE](LICENSE)

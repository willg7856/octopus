# Octopus

The Beyond Stage Zero team hub — one place for everything we make, buy and use.

| Module | What it's for |
|---|---|
| **Home** | Next countdowns, a live BSZ stats panel, code shipped on GitHub (7d / 30d / 90d / 1y), quick actions (log a build, use stock, request a purchase), what needs reordering, open orders, who's on which machine, recent activity, pinned links |
| **Analytics** | Money made vs spent (this month and 12-month chart), website views with live visitors, top pages, referrers and countries, hub usage, and GitHub activity — over 7 days to 1 year |
| **Inventory** | Every part we make or buy. Stock is calculated from the log, never typed in |
| **Build & stock log** | Every part made, received, used, scrapped or recounted — with process, serials, lot and who did it |
| **Processes** | Step-by-step procedures with tick-off checklists, warnings, print view, and the builds logged against them |
| **Remote desktops** | Shop/CAD/DAQ machines with one-click connect (RDP file, VNC, SSH, AnyDesk, TeamViewer, Parsec, Chrome RD, web) and claim/release so people know who's on what |
| **Orders** | Purchase requests → approved → ordered → shipped → received. Receiving adds the items to stock in one step |
| **Income** | Sponsorships, grants, sales, donations and prizes — expected or received |
| **Budget** | Budget lines with allocated / spent / committed / remaining, fed by orders |
| **Contacts** | Suppliers, partners, customers and people |
| **Templates** | Document templates — Google Docs links get a "Make a copy" button; plain-text templates get "Copy text" |
| **Links** | Shared drives, calendars and tools, shown on Home |
| **Countdowns** | T-minus clocks to launches, static fires and deadlines; the next three show on Home, and ones marked public go to the website |
| **Public numbers** | Headline figures for beyondstagezero.com (e.g. static fires, peak thrust) — edit here, the website updates within a minute |
| **Activity** | Every change by everyone, and a Deleted tab to restore anything |
| **People & access** | Team list, admin roles, password resets |

Press **⌘K** (or `/`) anywhere to search everything or jump to an action. Every list has CSV export and CSV import.

## Why it won't lose data

- **Real database, one row per record.** Postgres, not a single shared JSON blob.
- **Conflict-safe edits.** Every save carries the version it was based on. If someone else saved first, nothing is overwritten — you get a choice to keep yours or load theirs.
- **All-or-nothing saves.** Multi-step actions (e.g. receiving an order and adding its stock) commit together or not at all.
- **Full history.** Every create/update/delete is written to a history table in the same statement as the change. Detail pages show who changed what.
- **Nothing is hard-deleted.** Deletes are soft and can be undone from the toast or restored from Activity.
- **No silent fallbacks.** In production the API refuses to run without a database instead of quietly writing somewhere temporary.

## Run locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173 and sign in with any email and the password `octopus`. The first person to sign in locally becomes an admin. Local data lives in `.data/` (an embedded Postgres — no setup needed).

## Deploy (Vercel)

1. **Database:** Vercel → project → Storage → connect a **Neon Postgres** database. This sets `DATABASE_URL`. Tables are created automatically on first request.
2. **Environment variables:**
   - `AUTH_SECRET` — long random string used to sign session cookies (required).
   - `OPS_PASSWORD` — the shared team password new people use until they set their own.
   - `OPS_ADMINS` — comma-separated emails that are always admins and can always sign in (bootstrap).
3. Deploy. Admins sign in first, then add teammates under **People & access**.

Optional:
   - `GITHUB_OWNER` — GitHub user or organisation whose repos count towards "Code shipped" (or `GITHUB_REPOS` — a comma-separated `owner/repo` list).
   - `GITHUB_TOKEN` — a read-only fine-grained token for those repos. Strongly recommended: without it GitHub allows only 60 requests an hour.
   - `PUBLIC_STATS=off` — switches off the public website feed.
   - `VERCEL_DRAIN_SECRET` (and `VERCEL_DRAIN_VERIFY` if Vercel asks) — for website views on Analytics, see below.

## Website views (Vercel Web Analytics)

Vercel has no API for reading Web Analytics, so it pushes page views to Octopus with a **Drain** (Vercel Pro):

1. Turn on Web Analytics for the public website's Vercel project.
2. Vercel → **Team Settings → Drains → Add Drain** → data type **Web Analytics**, the website project, format **JSON**.
3. Endpoint: `https://ops.beyondstagezero.com/api/drains/web`
4. Put the drain's signing secret in `VERCEL_DRAIN_SECRET` on the Octopus project (and the verification value in `VERCEL_DRAIN_VERIFY` if asked), then redeploy.

Octopus checks every delivery's signature and stores only page views: time, host, path, referrer site, country, device type and Vercel's anonymous session/device IDs. About 13 months are kept.

`GET /api/health` reports whether the database is reachable.

## Public website feed

`GET /api/public/stats` is the only data Octopus serves without signing in. It's what beyondstagezero.com reads, and contains only:

- Public numbers marked **Shown**
- Countdowns marked **Shown publicly** (name, date, time, type — never notes)
- Build counts from the log (parts built, builds logged, last 30 days by day)

Budget, orders, suppliers, contacts, people and machines are never included. Responses are cached for 60 seconds and allow cross-origin requests.

## How it's built

- Vite + React + TypeScript frontend (`src/`), Vercel functions (`api/`).
- `src/lib/schema.ts` defines every module (fields, list columns, search). Lists, forms, CSV and detail pages are generated from it, so a new module is mostly a new entry there plus a route in `src/App.tsx`.
- `api/records.ts` is the one generic endpoint for all module data; `api/_lib/records.ts` holds the versioned write + history logic.
- In dev, `devApi.ts` serves `api/` from the Vite server.

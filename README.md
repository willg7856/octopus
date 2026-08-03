# Octopus

Internal ops tool for [Beyond Stage Zero](https://www.beyondstagezero.com) — shared **inventory**, **hardware**, and **vehicle production** tracking.

## Live site

**https://ops.beyondstagezero.com**

Deployed on Vercel as `beyondstagezero/octopus`.

## Sections

- **Inventory** — general stock (parts, consumables, tools)
- **Hardware** — vehicles and subsystems (motors, avionics, pad, GSE)
- **Production** — vehicle production process tracker (ordered build / checkout steps)

Seed defaults live in `src/hardwareSeed.ts`. On the live site, data is **shared for everyone signed in** via `/api/hardware/lab`. Local Vite without the API falls back to browser storage.

Deep links: `#/inventory`, `#/hardware`, `#/vehicles`.

## Sign in

The app is gated behind team sign-in.

Set these Vercel env vars on the `octopus` project:

- `OPS_PASSWORD` — shared team password
- `AUTH_SECRET` — random string used to sign session cookies
- `OPS_USERS` — comma-separated allowed emails for the whole team. If empty, any email + correct password works

### Shared storage (Redis preferred)

Inventory / Hardware / Production prefer **Upstash Redis**. If Redis isn’t connected yet, the app falls back to the connected **Vercel Blob** store.

**Connect Redis (recommended):**

1. Vercel → `octopus` → **Storage**
2. Create or connect an **Upstash Redis** database to **Production** (and Preview if needed)
3. Redeploy Production (uncheck “Use existing Build Cache”)

Prefer connecting through Storage rather than pasting Sensitive env vars by hand — marketplace-connected vars are what the runtime reliably sees.

The integration injects `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_*`).

### Team access checklist

1. Put every teammate’s email in `OPS_USERS` (or clear it if you want any email + the shared password).
2. Connect Upstash Redis under Storage (Blob can stay connected as fallback).
3. Redeploy. Open Inventory — edits should feel snappy and sync for everyone.

Local Vite uses password `goods-shed` (or `VITE_OPS_PASSWORD`) when `/api` isn’t available.

## Run locally

```bash
npm install
npm start
```

Or: `./start.sh` → **http://127.0.0.1:5173**

Requires Node.js 20+.

For local shared API storage with `vercel dev`, put Redis vars in `.env.local`, or the API falls back to a local `.data/` file.

## Build

```bash
npm run build
npm run preview
```

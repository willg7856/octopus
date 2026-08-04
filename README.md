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

- `OPS_PASSWORD` — shared team password (fallback when a user has no personal password)
- `AUTH_SECRET` — random string used to sign session cookies
- `OPS_USERS` — comma-separated allowed emails (bootstrap / break-glass). If empty **and** no shared Team list yet, any email + correct password works
- `OPS_ADMINS` — optional extra admin emails for **Team**. Always includes bootstrap admins `willg7856@gmail.com` and `will.grant@beyondstagezero.com`. Non-admins do not see the Team nav.

### Team accounts (in-app)

**Team** is admin-only (`OPS_ADMINS`, or the built-in bootstrap admins). Admins see it in the nav and can:

- Copy an invite (ops URL + sign-in instructions)
- Add / remove teammate emails on the shared allowlist
- Set or reset personal passwords per teammate (or leave them on the shared `OPS_PASSWORD`)

The allowlist is stored with the same Redis/Blob backend as inventory. `OPS_USERS` emails stay locked (edit those in Vercel env). Sign-in uses a personal password if one is set in **Team**, otherwise the shared `OPS_PASSWORD`. Passwords are stored hashed — admins can set/reset them but cannot view existing ones.

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

Optional: `OPS_ADMINS` — comma-separated emails allowed to `DELETE /api/hardware/lab` (full shared-lab reset). Everyone else can still edit via PUT.

### Sync & conflict handling

- Edits use revision checks (Redis Lua CAS when Redis is primary).
- The UI queues saves, auto-refreshes ~every 20s / on tab focus, and surfaces conflicts so you can re-apply after reviewing.
- Each section exposes **Export CSV**, last updated-by/when, and Live/Saving status.

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

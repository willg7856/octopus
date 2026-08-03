# Octopus

Internal ops tool for [Beyond Stage Zero](https://www.beyondstagezero.com) — shared **inventory**, **hardware**, and **vehicle production** tracking.

## Live site

**https://ops.beyondstagezero.com**

Deployed on Vercel as `beyondstagezero/octopus`.

## Sections

- **Inventory** — add/edit items (serials, qty, location, status)
- **Hardware** — HW/FW versions and status for vehicles, motors, avionics, pad, GSE
- **Production** — vehicle production process tracker (ordered build / checkout steps)

Seed defaults live in `src/hardwareSeed.ts`. On the live site, data is **shared for everyone signed in** via `/api/hardware/lab` (**Vercel Blob**). Local Vite without the API falls back to browser storage.

Deep links: `#/inventory`, `#/hardware`, `#/vehicles`.

## Sign in

The app is gated behind team sign-in.

Set these Vercel env vars on the `octopus` project:

- `OPS_PASSWORD` — shared team password
- `AUTH_SECRET` — random string used to sign session cookies
- `OPS_USERS` — comma-separated allowed emails for the whole team. If empty, any email + correct password works

### Shared storage (Vercel Blob)

Inventory / Hardware / Production sync through a **Vercel Blob** store — not Redis.

1. Vercel → `octopus` → **Storage**
2. Create a Blob store (or connect the existing one) to **Production** (and Preview if needed)
3. Redeploy Production (uncheck “Use existing Build Cache”)

Connected stores inject credentials automatically (`BLOB_STORE_ID` / token / OIDC). You should not need hand-pasted Redis env vars.

Upstash Redis is not used.

### Team access checklist

1. Put every teammate’s email in `OPS_USERS` (or clear it if you want any email + the shared password).
2. Confirm a Blob store is connected under Storage.
3. Redeploy. Open Inventory / Hardware / Production — edits sync for all signed-in users.

Local Vite uses password `goods-shed` (or `VITE_OPS_PASSWORD`) when `/api` isn’t available.

## Run locally

```bash
npm install
npm start
```

Or: `./start.sh` → **http://127.0.0.1:5173**

Requires Node.js 20+.

For local shared API storage with `vercel dev`, either connect Blob (`BLOB_READ_WRITE_TOKEN` in `.env.local`) or the API falls back to a local `.data/` file.

## Build

```bash
npm run build
npm run preview
```

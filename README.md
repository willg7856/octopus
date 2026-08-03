# Octopus

Internal ops tool for [Beyond Stage Zero](https://www.beyondstagezero.com) — shared **inventory**, **hardware**, and **vehicle production** tracking.

## Live site

**https://ops.beyondstagezero.com**

Deployed on Vercel as `beyondstagezero/octopus`.

## Sections

- **Inventory** — add/edit items (serials, qty, location, status)
- **Hardware** — HW/FW versions and status for vehicles, motors, avionics, pad, GSE
- **Production** — vehicle production process tracker (ordered build / checkout steps)

Seed defaults live in `src/hardwareSeed.ts`. On the live site, data is **shared for everyone signed in** via `/api/hardware/lab` (**Upstash Redis**). Local Vite without the API falls back to browser storage.

Deep links: `#/inventory`, `#/hardware`, `#/vehicles`.

## Sign in

The app is gated behind team sign-in.

Set these Vercel env vars on the `octopus` project:

- `OPS_PASSWORD` — shared team password
- `AUTH_SECRET` — random string used to sign session cookies
- `OPS_USERS` — comma-separated allowed emails for the whole team. If empty, any email + correct password works
- `UPSTASH_REDIS_REST_URL` — from Upstash Redis
- `UPSTASH_REDIS_REST_TOKEN` — from Upstash Redis

### Upstash Redis setup

1. Create a free Redis DB at https://console.upstash.com/
2. Copy **REST URL** + **REST TOKEN**
3. Vercel → `octopus` → **Settings → Environment Variables**
4. Add both vars for **Production** and **Preview** (paste values carefully, no quotes)
5. **Deployments → latest Production → Redeploy** (uncheck “Use existing Build Cache”)

Blob storage is not used.

### Team access checklist

1. Put every teammate’s email in `OPS_USERS` (or clear it if you want any email + the shared password).
2. Confirm Redis env vars are on Production.
3. Redeploy. Open Inventory / Hardware / Production — edits sync for all signed-in users.

Local Vite uses password `goods-shed` (or `VITE_OPS_PASSWORD`) when `/api` isn’t available.

## Run locally

```bash
npm install
npm start
```

Or: `./start.sh` → **http://127.0.0.1:5173**

Requires Node.js 20+.

For local shared API storage with `vercel dev`, put the Upstash vars in `.env.local`.

## Build

```bash
npm run build
npm run preview
```

# Octopus

Internal ops tool for [Beyond Stage Zero](https://www.beyondstagezero.com) — shared **inventory**, **hardware**, and **vehicle production** tracking.

## Live site

**https://ops.beyondstagezero.com**

Deployed on Vercel as `beyondstagezero/octopus`.

## Sections

- **Inventory** — add/edit items (serials, qty, location, status)
- **Hardware** — HW/FW versions and status for vehicles, motors, avionics, pad, GSE
- **Production** — vehicle production process tracker (ordered build / checkout steps)

Seed defaults live in `src/hardwareSeed.ts`. On the live site, data is **shared for everyone signed in** via `/api/hardware/lab` (Vercel Blob). Local Vite without the API falls back to browser storage.

Deep links: `#/inventory`, `#/hardware`, `#/vehicles`.

## Sign in

The app is gated behind team sign-in.

Set these Vercel env vars on the `octopus` project:

- `OPS_PASSWORD` — shared team password
- `AUTH_SECRET` — random string used to sign session cookies
- `OPS_USERS` — comma-separated allowed emails for the whole team. If empty, any email + correct password works
- `BLOB_READ_WRITE_TOKEN` and/or `BLOB_STORE_ID` — set automatically when a Blob store is connected to the project
- `BLOB_ACCESS` _(optional)_ — `private` (default) or `public`, must match the Blob store type

### Add Vercel Blob (required for shared inventory)

The app already uses `@vercel/blob`. You only need to create the store once:

1. Open **[octopus → Storage](https://vercel.com/beyondstagezero/octopus/stores)**
2. **Create Database** → **Blob**
3. Choose **Private**
4. Name it e.g. `octopus-lab`
5. Connect to the `octopus` project for **Production** and **Preview**
6. **Redeploy** the latest production deployment

Vercel will inject `BLOB_STORE_ID` (OIDC) and/or `BLOB_READ_WRITE_TOKEN`. After redeploy, Inventory / Hardware / Production sync for everyone signed in.

Or via CLI (from a machine logged into Vercel):

```bash
npx vercel link
npx vercel blob create-store octopus-lab --access private --yes
npx vercel redeploy --prod
```

### Team access checklist

1. Put every teammate’s email in `OPS_USERS` (or clear it if you want any email + the shared password).
2. Create/connect Blob as above.
3. Redeploy. Open Inventory / Hardware / Production — edits sync for all signed-in users.

Local Vite uses password `goods-shed` (or `VITE_OPS_PASSWORD`) when `/api` isn’t available.

## Run locally

```bash
npm install
npm start
```

Or: `./start.sh` → **http://127.0.0.1:5173**

Requires Node.js 20+.

## Build

```bash
npm run build
npm run preview
```

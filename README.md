# Octopus

Internal ops tool for [Beyond Stage Zero](https://www.beyondstagezero.com) — live pad/vehicle data, cameras, shared links (Onshape, Drive, calendars), contacts, and timelines.

Octopus is for looking things up and watching feeds. It is not the control system or the flight computer.

## Live site

**https://ops.beyondstagezero.com**

Deployed on Vercel as `beyondstagezero/octopus`.

## Hub sections

- **Home** — current focus, notices, quick links
- **Live** — view-only telemetry and link health
- **Cameras** — pad / Goods Shed / vehicle camera wall
- **Hardware** — shared team inventory (HW/FW versions), build progress, test log + CSV export
- **Resources** — Onshape, Google Drive, calendars, web links
- **Team** — contact roster
- **Timeline** — milestones and standing notes

Edit shared links/contacts/milestones/events in `src/hubData.ts`.

Hardware seed defaults live in `src/hardwareSeed.ts`. On the live site, inventory is **shared for everyone signed in** via `/api/hardware/lab` (Vercel Blob). Local Vite without the API falls back to browser storage.

Camera stream URLs go in `src/data.ts` (`CAMERA_FEEDS`). Live/cameras stay in **demo** mode until `DATA_MODE` is flipped to `'live'` and real sources exist.

Deep links: `#/`, `#/live`, `#/cameras`, `#/hardware`, `#/resources`, `#/team`, `#/timeline`.

## Sign in

The hub is gated behind team sign-in.

Set these Vercel env vars on the `octopus` project:

- `OPS_PASSWORD` — shared team password
- `AUTH_SECRET` — random string used to sign session cookies
- `OPS_USERS` — comma-separated allowed emails for the whole team (example: `willg@beyondstagezero.com,alex@beyondstagezero.com`). If empty, any email + correct password works
- `BLOB_READ_WRITE_TOKEN` — from a Vercel Blob store connected to the project (Storage → Blob). Required for shared Hardware inventory in production
- `BLOB_ACCESS` _(optional)_ — `private` (default) or `public`, matching the Blob store type

### Team access checklist

1. Put every teammate’s email in `OPS_USERS` (or clear it if you want any email + the shared password).
2. Create/connect a **Blob** store on the `octopus` Vercel project so `BLOB_READ_WRITE_TOKEN` is set.
3. Redeploy. Open **Hardware** — edits sync for all signed-in users.

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

# Octopus

Team hub for [Beyond Stage Zero](https://www.beyondstagezero.com) — live pad/vehicle data, camera walls, shared links (Onshape, Drive, calendars), contacts, and program timelines.

Octopus is an information hub. It is not the control system or the flight computer.

## Live site

**https://ops.beyondstagezero.com**

Deployed on Vercel as `beyondstagezero/octopus`.

## Hub sections

- **Home** — current focus, notices, quick links
- **Live** — view-only telemetry and link health
- **Cameras** — pad / Goods Shed / vehicle camera wall
- **Resources** — Onshape, Google Drive, calendars, web links
- **Team** — contact roster
- **Timeline** — milestones and standing notes

Edit shared links/contacts/milestones in `src/hubData.ts`.

## Sign in

The hub is gated behind team sign-in.

Set these Vercel env vars on the `octopus` project:

- `OPS_PASSWORD` — shared team password
- `AUTH_SECRET` — random string used to sign session cookies
- `OPS_USERS` _(optional)_ — comma-separated allowed emails; if empty, any email + correct password works

Production is locked to `willg@beyondstagezero.com` via `OPS_USERS`.

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

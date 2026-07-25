# Octopus

Mission control for [Beyond Stage Zero](https://www.beyondstagezero.com) — pad/vehicle console for static fires and launches, plus a team hub for links, contacts, and timelines.

Octopus is the Goods Shed ops UI. It is not the flight computer.

## Live site

**https://ops.beyondstagezero.com**

Deployed on Vercel as `beyondstagezero/octopus`.

## Sections

- **Control** (default) — range, arm/checklist, telemetry, mission ops, downlink log
- **Cameras** — pad / Goods Shed / vehicle wall
- **Hub** — status board and shortcuts
- **Resources / Team / Timeline** — shared links, contacts, milestones

Deep links: `#/`, `#/control`, `#/cameras`, `#/home`, `#/resources`, `#/team`, `#/timeline`.

Edit shared links/contacts in `src/hubData.ts`. Camera stream URLs in `src/data.ts` (`CAMERA_FEEDS`). `DATA_MODE` stays `'demo'` until real feeds are wired.

## Sign in

Set these Vercel env vars on the `octopus` project:

- `OPS_PASSWORD` — shared team password
- `AUTH_SECRET` — random string used to sign session cookies
- `OPS_USERS` _(optional)_ — comma-separated allowed emails

Local Vite uses password `goods-shed` (or `VITE_OPS_PASSWORD`) when `/api` isn’t available.

## Run locally

```bash
npm install
npm start
```

Or: `./start.sh` → **http://127.0.0.1:5173**

## Build

```bash
npm run build
npm run preview
```

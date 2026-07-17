# Octopus

Goods Shed mission control UI for [Beyond Stage Zero](https://www.beyondstagezero.com) — the pad and vehicle data link used during static fires and launches.

Octopus moves data into mission control. It is not the flight computer.

## Live site

**https://ops.beyondstagezero.com**

Deployed on Vercel as `beyondstagezero/octopus`.

## Sign in

The console is gated behind team sign-in.

Set these Vercel env vars on the `octopus` project:

- `OPS_PASSWORD` — shared Goods Shed password
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

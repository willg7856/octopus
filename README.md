# Octopus

Goods Shed mission control UI for [Beyond Stage Zero](https://www.beyondstagezero.com) — the pad and vehicle data link used during static fires and launches.

Octopus moves data into mission control. It is not the flight computer.

## Live site

After GitHub Pages is enabled on this repo, the app is at:

**https://willg7856.github.io/octopus/**

One-time setup (repo owner): GitHub → **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Or import the repo on [Vercel](https://vercel.com/new) (same stack as beyondstagezero.com) for a `*.vercel.app` URL / custom domain.

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

# AGENTS.md

## Cursor Cloud specific instructions

Octopus is a single-page **frontend-only** app (React 19 + Vite 6 + TypeScript). There is no backend, database, API, or environment variables — the UI renders from in-repo mock data in `src/data.ts`. So the only service to run is the Vite dev server.

- **Run (dev):** `npm start` (alias `npm run dev`) serves at `http://127.0.0.1:5173`. The server uses `strictPort: true` on host `127.0.0.1` (see `vite.config.ts`), so port 5173 will NOT auto-increment — if it's already in use the server fails instead of picking another port. Stop the process holding 5173 (by PID) before restarting.
- The dev server config has `open: true`, which tries to launch a browser; this is harmless in headless/cloud environments.
- **Build:** `npm run build` runs `tsc -b && vite build` (this is also the effective typecheck since there's no separate typecheck script). `npm run preview` serves the built output on `http://127.0.0.1:4173`.
- **Lint:** there is no lint script or linter configured in this repo.
- **Test:** there is no automated test framework or test script configured. Verify changes manually in the browser dev server.
- The app is interactive: the left Mode panel toggles between `static-fire` / `launch` / `idle`, and the Link Detail panel has Arm / Mark-event / Clear actions that push entries into the DOWNLINK LOG and show transient toasts (toasts auto-dismiss after ~2.6s).

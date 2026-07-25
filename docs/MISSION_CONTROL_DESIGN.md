# Beyond Stage Zero — Mission Control Design Spec

**Purpose of this file:** Hand to a Cursor agent (or engineer) to build a **standalone Mission Control application**. This is **not** the Octopus ops hub website.

**Relationship to Octopus**

| Product | Role |
|---|---|
| **Octopus** (`ops.beyondstagezero.com`) | Team hub — links, contacts, calendars, timelines, camera/live *viewing* when wired |
| **Mission Control** (this app) | Operational console for static fires and launches — range, checklist, ignition enable, telemetry, cameras, event log |

Do **not** merge Mission Control into the Octopus repo UI. Ship as a **separate app / separate repo / separate deploy**.

---

## 1. Product goal

Build a Goods Shed **mission control console** for Beyond Stage Zero:

- Watch pad and vehicle data during static fires and launch days
- Set **range** state (GO / HOLD / NO-GO)
- Complete a **pre-arm checklist** and **arm/disarm ignition enable**
- Scrub/playback burn or vehicle telemetry (demo until live)
- Open **camera wall** (pad / shed / vehicle)
- Keep an **event / downlink log**
- Export session data (CSV)

**Explicit non-goals**

- Not the flight computer
- Not vehicle guidance / flight software
- Not a marketing landing page
- Not the team resource hub (that’s Octopus)
- Arming here means **ignition enable** into the ops path — never imply full vehicle control

---

## 2. Suggested stack

Match Octopus for speed of handoff, unless you prefer otherwise:

- Vite + React 19 + TypeScript
- Single CSS file or CSS modules (no required UI kit)
- Deploy on Vercel (or equivalent)
- Auth: email + shared password + signed HttpOnly session cookie (same pattern as Octopus), or reuse Octopus auth later via shared secret / SSO

**Repo suggestion:** `beyondstagezero/mission-control` (or similar) — separate from `octopus`.

**URL suggestion:** `mc.beyondstagezero.com` or `control.beyondstagezero.com` (not `ops.` — ops stays Octopus).

---

## 3. Visual design (middle ground)

Aim for **polished internal tool** — not a product marketing site, not harsh industrial CLI cosplay.

### Brand / type

- Product name: **Octopus Mission Control** or simply **Mission Control** with Beyond Stage Zero ownership
- Fonts: JetBrains Mono (display / numbers) + IBM Plex Sans (UI) + IBM Plex Mono (meta)
- Accent: ignition orange `#ff5a1f`
- Light paper / dark ink theme with toggle (light default OK; support dark)

### Tokens (start here)

```css
--ignition: #ff5a1f;
--telem-amber: #ffc400;
--telem-green: #18a957;
--telem-red: #e33636;
--telem-cyan: #2dc2d9;
/* light */
--bg: #fafaf7;
--bg-elev: #f1f1ec;
--fg: #0b0d0f;
--line: rgba(11, 13, 15, 0.12);
```

### Layout rules

- Full-width console — don’t trap content in a narrow reading column
- First screen after sign-in = **Control console** (not a marketing hero)
- Clear hierarchy: mission clock + range are always visible on Control
- Readable body type for checklist/actions; mono for T+, rates, statuses
- Soft panel borders; avoid purple SaaS gradients, cream/terracotta “AI slop”, glow spam, emoji

### Motion

- Subtle: panel rise on load, chart line draw, status changes
- No cinematic full-bleed hero imagery

---

## 4. Information architecture

```
Sign in
└── App shell
    ├── Control          ← default
    ├── Cameras
    └── (optional) Settings / About
```

No Resources / Team / Timeline here — those stay on Octopus. Link out to Octopus if useful (`https://ops.beyondstagezero.com`).

Deep links (hash or router):

- `#/` or `/` → Control
- `#/cameras` or `/cameras` → Cameras

---

## 5. Screens & behavior

### 5.1 Sign in

- Email + password
- Team-only copy: “Sign in to Mission Control”
- Theme toggle
- Same security expectations as Octopus (HttpOnly cookie, no password in localStorage in production)

### 5.2 Control (main console)

**Top bar**

- Brand mark (Mission Control / Octopus MC)
- Nav: Control | Cameras
- **Mission clock** (center or prominent):
  - `T+x.xxs` when live/playing
  - `HOLD` when held / paused at zero
  - `SAFE` when range NO-GO
  - `IDLE` when mode idle
- Meta: link state, vehicle name, local clock, user, sign out, Demo badge when applicable

**Ops strip**

- Operation label, vehicle, site, window (from config)

**Range bar**

- State: GO | HOLD | NO-GO
- Buttons to set state
- NO-GO must **disarm** ignition enable and log a critical event
- Visible hint: “Ignition enable safe/armed”

**Three-column console**

| Left | Center | Right |
|---|---|---|
| Mode & channels | Telemetry stage | Mission ops |

#### Left — Mode & channels

Modes:

1. **Static fire** — pad instruments (default)
2. **Launch day** — pad + vehicle telemetry
3. **Idle / bench** — no active burn

Channel list with status dots (nominal / degraded / lost / standby). Selecting a channel updates Mission ops detail.

Changing mode: disarm, set range HOLD, reset checklist manual items, reset scrub index, update vehicle channel standby/live appropriately.

#### Center — Telemetry stage

- Mode-appropriate readouts:
  - Static fire: thrust (N + kgf), chamber P, case temp, T+
  - Launch: altitude, velocity, accel, battery, GPS sats, T+
  - Idle: idle / T+ 0
- Static fire: motor stats (total impulse, burn time, max/avg thrust, max P, impulse @ cursor)
- Chart: thrust+pressure (fire) or altitude+velocity (launch); ghost full curve; scrub cursor; P/B markers on fire
- Play / Pause + scrubber (+ jump buttons: Ignition, Max thrust, Burnout on fire)
- Click/drag chart to scrub
- Status pills: Armed/Safe, Range, Rec on/off, Demo/Live, Playing/Paused
- Channel health snippet + recent events (optional lower panel)

**Demo:** show a clear banner — “Simulated sample curve — not a live burn.”

#### Right — Mission ops

1. **Link path** hops with status: Pad → RF → Goods Shed → Vehicle  
2. **Pre-arm checklist**
   - Auto-derived (examples): load cell OK, chamber path OK, logger recording, pad cams ready, range is GO  
   - Manual: crew brief complete  
3. **Selected channel** detail (status, rate, latency)  
4. **Actions**
   - Arm / Disarm ignition enable (gated: all checks + range GO)
   - Start/Stop shed recording
   - Open cameras
   - Mark timeline event
   - Export session CSV
   - Clear shed buffer (logs event; doesn’t need real buffer yet)

Copy near arm: “Ignition enable only — not the flight computer.”

### 5.3 Cameras

- Groups: Pad | Goods Shed | Vehicle
- Toggle cameras on/off (keep ≥1 on)
- Explicit **Focus** (solo) button — don’t rely on double-click
- Grid or focused single view
- Each feed supports optional `streamUrl` / `snapshotUrl`
- If no stream: show “Stream not connected” empty state (not fake “Live”)
- Back to Control

### 5.4 Event / downlink log

- Collapsible footer on Control only
- Columns: time, level, source, message
- Levels: info / ok / warn / crit
- Persist open/closed in `localStorage`

---

## 6. Domain model (TypeScript sketches)

```ts
type LinkStatus = 'nominal' | 'degraded' | 'lost' | 'standby'
type OpMode = 'static-fire' | 'launch' | 'idle'
type RangeState = 'go' | 'hold' | 'nogo'
type DataMode = 'demo' | 'live'

interface Operation {
  id: string          // e.g. SF-B1M-01
  label: string
  mode: OpMode
  vehicle: string     // e.g. STRAVOX B1M
  site: string        // Creswick Goods Shed · Pad link
  status: string
  window: string
}

interface Channel {
  id: string
  name: string
  kind: 'pad' | 'vehicle' | 'shed'
  status: LinkStatus
  rateHz: number
  latencyMs: number
  lastPacket: string
  dropPct: number
  packetAgeMs: number
  recording: boolean
  owner?: string
}

interface ChecklistItem {
  id: string
  label: string
  auto: boolean
}

interface LinkHop {
  id: string
  label: string
  detail: string
}

interface CameraFeed {
  id: string
  group: 'pad' | 'shed' | 'vehicle'
  name: string
  spot: string
  status: LinkStatus
  latencyMs: number
  streamUrl?: string
  snapshotUrl?: string
  owner?: string
  lastFrameAt?: string
}

interface TelemetryPoint { t: number; thrust: number; pressure: number; temp: number } // thrust in kgf
interface VehicleSample { t: number; altitude: number; velocity: number; accel: number; batteryV: number; gpsSats: number }
interface EventItem { id: string; time: string; level: 'info'|'ok'|'warn'|'crit'; source: string; message: string }
```

Config constants: `OPERATION`, `CHANNELS`, `CAMERA_*`, `CHECKLIST`, `LINK_HOPS`, `DATA_MODE`, curve builders for demo.

---

## 7. Control rules (must implement)

1. **Arm** only if every checklist item is true **and** range === `go`
2. **NO-GO** → force disarm + critical log
3. Mode change → disarm, range HOLD, reset manual checks, reset scrub
4. Recording toggle flips pad channels + shed-log `recording`
5. All operator actions push an event log row
6. Demo mode: simulated curves / jitter OK, but **always labeled Demo**
7. Never claim flight-computer control in UI copy

---

## 8. Demo vs live

```ts
export const DATA_MODE: 'demo' | 'live' = 'demo'
```

Until live:

- Use generated thrust/vehicle curves
- Cameras show empty/no-stream states (or placeholders)
- Banner on Control + Cameras
- Header meta shows Demo

When live sources exist: flip `DATA_MODE`, replace simulators with API/WebSocket/SSE clients — keep the same UI shell.

---

## 9. Content defaults (BSZ)

- Vehicle: STRAVOX B1M  
- Site: Creswick Goods Shed · Pad link  
- Op example: B1M static fire campaign / `SF-B1M-01`  
- Accent: ignition orange  
- Tone: calm ops room, Australian team, practical English  

---

## 10. What to pull from the current Octopus codebase (reference only)

If the agent has access to `willg7856/octopus`, these are useful **references** (copy patterns, don’t glue apps together):

- Telemetry chart / scrubber patterns in `src/components/TelemetryStage.tsx`
- Motor stats in `src/motorStats.ts`
- Auth cookie pattern under `api/auth/*`
- Visual tokens in `src/index.css` (paper/ink + ignition)
- CSV export idea in `src/exportSession.ts`

Rebuild Mission Control as a clean app; don’t keep Hub pages (Resources/Team/Timeline/Home status board).

---

## 11. Acceptance checklist

- [ ] Separate deployable app from Octopus
- [ ] Sign-in required
- [ ] Control is default view with mission clock + range always visible
- [ ] Static fire / launch / idle modes work
- [ ] Checklist gates arm; NO-GO safes
- [ ] Telemetry chart + scrubber + readouts for fire and launch
- [ ] Mission ops actions log events
- [ ] Cameras page with groups, toggles, Focus, no-stream state
- [ ] Demo clearly labeled
- [ ] Desktop usable; mobile doesn’t totally break (stack columns)
- [ ] README explains env vars and that this is not the flight computer

---

## 12. Out of scope for v1 (but design for later)

- Real telemetry ingestion
- Real camera streams
- Multi-user roles (RSO vs propulsion vs viewer)
- Hardware interlocks / real ignition path
- Mobile-first dedicated RSO tablet layout
- Syncing events to Octopus hub

---

## 13. Prompt starter for the other agent

> Build a standalone Beyond Stage Zero Mission Control web app from `docs/MISSION_CONTROL_DESIGN.md`.  
> Separate from the Octopus ops hub. Vite + React + TypeScript.  
> Default screen is the Control console (range, checklist, arm ignition enable, telemetry, mission ops, event log) plus a Cameras page.  
> Use paper/ink + ignition orange design. Label Demo until real feeds exist.  
> Do not implement Resources/Team/Timeline hub pages. Do not build a marketing landing page.

---

*Owner context: Beyond Stage Zero · Goods Shed · STRAVOX. Octopus hub remains at ops.beyondstagezero.com for team links and info.*

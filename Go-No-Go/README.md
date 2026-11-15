# GO / NO-GO (GNG)

> **Design. Validate. Launch.** — *Every decision determines the mission.*

**GO / NO-GO (GNG)** is an interactive browser-based spacecraft mission design, systems-engineering verification, flight-readiness review, and orbital operations simulator. Across six integrated stages, users design spacecraft architectures, evaluate coupled engineering budgets, plan circular and elliptical orbits, pass a strict GO / CAUTION / NO-GO launch-readiness gate, operate a deterministic orbital simulation, and review mission performance.

---

## Six-Stage Gameplay Flow

| Stage | Route | Purpose |
| :--- | :--- | :--- |
| **01 Briefing** | `/` (`/briefing`) | Full-viewport 3D orbital welcome, mission scenario selection (`LUNAR SCOUT`, `MARS OBSERVER`, `ASTEROID EXPLORER`), optional supporting Earth-observation reference context (Planetary Computer / NASA GIBS / Meteomatics), baseline presets, and **Standard / Hard / Expert** difficulty selection. |
| **02 Architecture** | `/architecture` (`/builder`) | Interactive Bus, Payload, Solar, Battery, Comms RF, Propulsion, ADCS & Storage, and Thermal catalog integration with live 3D spacecraft preview and hardware provenance badges (`VERIFIED` / `ILLUSTRATIVE`). |
| **03 Orbit & Launch** | `/orbit` | Circular & elliptical orbit tuning (perigee, apogee, eccentricity $e$, inclination, analytical $J_2$ SSO solver) paired with launch vehicle form-factor and orbital-regime payload checks. |
| **04 Verification** | `/verification` | Authoritative SI Flight Readiness Review (`GO`, `CAUTION`, `NO_GO`), prioritized action-required findings, strict `NO_GO` launch blocking, and integrated 3D ascent transition when cleared. |
| **05 Operations** | `/operations` (`/simulation`) | Frame-rate-independent fixed-timestep (`60 s`) 3D orbital operations guarded against `NO_GO` bypasses, with per-instrument ON/OFF toggles, duty-cycle modes, downlink bursts, trim burns, and deterministic anomalies. |
| **06 Debrief** | `/debrief` (`/report`) | Normalized 100-point mission score (`35/25/15/15/10`), telemetry replay scrubber, expandable technical KPP debrief, formula inspector, `START NEW ATTEMPT`, and embedded **International Leaderboard**. |

---

## Tech Stack

- **Frontend**: React 19, TypeScript, React Router, Vite, Tailwind CSS v4, Zustand, Recharts, Lucide React
- **3D Graphics**: Three.js, `@react-three/fiber`, `@react-three/drei`
- **Backend (Optional Leaderboard)**: Supabase PostgreSQL (RLS + `SECURITY DEFINER` verification RPCs) & Deno Edge Function (`submit-mission-score`)
- **Verification**: Vitest, React Testing Library, Oxlint, Playwright

---

## Local Development Commands (`Go-No-Go/`)

```bash
npm install
npm run dev        # Start local Vite dev server
npm run typecheck  # Strict TypeScript compilation check
npm run lint       # Oxlint static analysis
npm test           # Vitest unit & integration test suite
npm run build      # Production TypeScript + Vite bundle
npm run test:e2e   # Playwright end-to-end browser tests
```

---

## Engineering Honesty, Difficulty & Leaderboard Security

- **SI Physics & Provenance**: All calculations inside `src/engine/` execute internally in SI units and inspectably tag equations as `PHYSICAL_LAW`, `ENGINEERING_APPROXIMATION`, or `GAMEPLAY_RULE` via [`FormulaInspectorModal.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/components/FormulaInspectorModal.tsx). Hardware catalogs explicitly label `VERIFIED` constants vs. `ILLUSTRATIVE` educational models.
- **Meaningful Difficulty Modes**: `STANDARD`, `HARD`, and `EXPERT` scale cost ceilings (`1.0× / 0.92× / 0.85×`), required power/mass/$\Delta V$ reserves (`15% / 18% / 22%`), maximum battery DoD (`35% / 30% / 25%`), link margin floors (`+3.0 / +4.5 / +6.0 dB`), daily science quotas (`1.0× / 1.25× / 1.5×`), and anomaly frequency/stress.
- **Verified International Leaderboard**: Configured via [`../supabase/migrations/20261114000002_international_leaderboard.sql`](file:///workspaces/Go-No-Go/supabase/migrations/20261114000002_international_leaderboard.sql), [`../supabase/migrations/20261115000000_provisional_leaderboard_verification.sql`](file:///workspaces/Go-No-Go/supabase/migrations/20261115000000_provisional_leaderboard_verification.sql), and [`leaderboardService.ts`](file:///workspaces/Go-No-Go/Go-No-Go/src/services/leaderboardService.ts). The database independently validates telemetry bounds and recomputes all 5 score buckets server-side (`Global`, `Country / Region`, `Season`), records browser-submitted runs as `PROVISIONAL` (since interactive orbital ops run client-side without full server replay), supports pseudonymous pilot callsigns plus optional ISO-3166-1 alpha-2 country selection (never IP-inferred), and renders an honest offline message without fabricated competitors when `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` are absent. Server-only secrets (`SUPABASE_SECRET_KEY`, `METEOMATICS_USERNAME`, `METEOMATICS_PASSWORD`) remain strictly in `.dev.vars` / Cloudflare Secrets and never enter frontend bundles.

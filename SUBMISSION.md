# GO / NO-GO (GNG) — Competition Submission Package

> **Taglines:** *Design. Validate. Launch.* — *Every decision determines the mission.*  
> **Primary Scenario:** **FLOODWATCH** (Earth-Observation Satellite Mission for All-Weather Flood Monitoring)

---

## 1. Project Summary

**GO / NO-GO (GNG)** is an interactive, browser-based space mission design, systems-engineering verification, and orbital operations game. Players step into the role of a Mission Architect and Flight Director tasked with fielding **FLOODWATCH**, a flood-monitoring Earth-observation satellite built to image monsoon-obscured river basins and return mission telemetry to global ground stations. Across **six focused gameplay stages**, players trade spacecraft bus architectures, scientific payloads (optical, multispectral SWIR, thermal IR, C-band & X-band SAR), solar arrays, batteries, RF communications, propulsion, ADCS/data storage, and thermal controls; tune circular or elliptical orbits using vis-viva and $J_2$ mechanics; resolve coupled subsystem failures during a strict **GO / CAUTION / NO-GO** Flight Readiness Review; launch into a fixed-timestep 3D orbital operations simulation; and compare verified mission scores on an embedded **International Leaderboard**.

---

## 2. Six-Stage Gameplay Architecture

1. **Stage 01 — Mission Briefing (`/` and `/briefing`)**  
   Full-viewport 3D Earth & Moon welcome experience ([`MissionBriefing.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/pages/MissionBriefing.tsx)) presenting the FLOODWATCH flooding problem, Key Performance Parameters, target river basins with expandable NASA EOSDIS GIBS imagery context ([`NasaEarthObservationPanel.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/components/NasaEarthObservationPanel.tsx)), baseline starting configurations, and interactive **Difficulty Selection** (`STANDARD`, `HARD`, `EXPERT`) that alters cost caps, required engineering margins, daily science quotas, and anomaly intensity.
2. **Stage 02 — Mission Architecture (`/architecture` and `/builder`)**  
   Real-time subsystem integration across Bus, Payload, Solar, Battery, Comms RF, Propulsion, ADCS & Storage, and Thermal catalogs ([`SpacecraftBuilder.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/pages/SpacecraftBuilder.tsx)) paired with a live 3D spacecraft preview ([`Spacecraft.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/scenes/Spacecraft.tsx)), live engineering resource readouts ([`ResourcePanel.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/components/ResourcePanel.tsx)), and explicit `VERIFIED` / `ILLUSTRATIVE` hardware provenance tags ([`EquipmentCard.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/components/EquipmentCard.tsx)).
3. **Stage 03 — Orbit & Launch Planning (`/orbit`)**  
   Circular and elliptical orbit tuning (perigee, apogee, live eccentricity $e$, inclination, and analytical $J_2$ Sun-Synchronous inclination solver) alongside launch vehicle compatibility checks across both structural dispenser/adapter form factor and orbital-regime payload capacity ([`OrbitSelector.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/components/OrbitSelector.tsx), [`OrbitPlanner.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/pages/OrbitPlanner.tsx)).
4. **Stage 04 — Mission Verification (`/verification`)**  
   Authoritative SI engineering gate poll ([`EngineeringVerification.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/pages/EngineeringVerification.tsx), [`Dashboard.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/components/Dashboard.tsx)) that prioritizes `FAIL` and `WARNING` findings with corrective navigation links, blocks launch strictly on `NO_GO`, and runs an integrated 3D ascent transition ([`LaunchAnimation.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/scenes/LaunchAnimation.tsx)) into Stage 5 when `GO` or `CAUTION`.
5. **Stage 05 — Mission Operations (`/operations` and `/simulation`)**  
   Full-screen 3D orbital command viewport running a frame-rate-independent fixed-timestep (`60 s`) Keplerian & subsystem simulation ([`MissionSimulation.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/pages/MissionSimulation.tsx), [`simulationStore.ts`](file:///workspaces/Go-No-Go/Go-No-Go/src/store/simulationStore.ts)) guarded against `NO_GO` bypasses, featuring per-instrument ON/OFF toggles, duty-cycle modes, downlink bursts, orbit trim burns, safe-mode/heater overrides, and deterministic seeded anomalies ([`events.ts`](file:///workspaces/Go-No-Go/Go-No-Go/src/engine/events.ts)).
6. **Stage 06 — Mission Debrief & International Leaderboard (`/debrief` and `/report`)**  
   Post-flight scoring across five weighted aerospace buckets (`35` Science / `25` Reliability / `15` Efficiency / `15` Comms / `10` Risk Management), telemetry replay scrubber, expandable technical KPP matrix & SI formula inspector ([`FormulaInspectorModal.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/components/FormulaInspectorModal.tsx)), `START NEW ATTEMPT` reset flow, and embedded **International Leaderboard** ([`LeaderboardPanel.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/components/LeaderboardPanel.tsx)).

---

## 3. Requirements-to-Evidence Verification Matrix

| Requirement Area | State | Implementation & Evidence |
| :--- | :--- | :--- |
| Strictly 6 gameplay stages without sidebar or extra nav pages | **COMPLETE** | [`App.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/App.tsx), [`AppShell.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/components/AppShell.tsx), [`components.test.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/tests/unit/components.test.tsx) |
| Difficulty modes altering real budgets, margins & anomaly stress | **COMPLETE** | [`DIFFICULTY_PROFILES`](file:///workspaces/Go-No-Go/Go-No-Go/src/data/scenarios.ts), [`validation.ts`](file:///workspaces/Go-No-Go/Go-No-Go/src/engine/validation.ts), [`events.ts`](file:///workspaces/Go-No-Go/Go-No-Go/src/engine/events.ts), [`validation.test.ts`](file:///workspaces/Go-No-Go/Go-No-Go/tests/unit/validation.test.ts) |
| Elliptical & circular Keplerian + J2 orbit mechanics | **COMPLETE** | [`orbital.ts`](file:///workspaces/Go-No-Go/Go-No-Go/src/engine/orbital.ts), [`OrbitSelector.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/components/OrbitSelector.tsx), [`OrbitPlanner.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/pages/OrbitPlanner.tsx) |
| Strict NO-GO launch blocking + integrated Stage 4 ascent transition | **COMPLETE** | [`EngineeringVerification.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/pages/EngineeringVerification.tsx), [`MissionSimulation.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/pages/MissionSimulation.tsx), [`floodwatch.spec.ts`](file:///workspaces/Go-No-Go/Go-No-Go/tests/e2e/floodwatch.spec.ts) |
| Frame-rate-independent fixed-dt orbital simulation & instrument toggles | **COMPLETE** | [`simulationStore.ts`](file:///workspaces/Go-No-Go/Go-No-Go/src/store/simulationStore.ts), [`simulation.ts`](file:///workspaces/Go-No-Go/Go-No-Go/src/engine/simulation.ts), [`floodwatchSimulation.test.ts`](file:///workspaces/Go-No-Go/Go-No-Go/tests/integration/floodwatchSimulation.test.ts) |
| Server-verified International Leaderboard & offline zero-fake-data integrity | **COMPLETE** | [`20261114000002_international_leaderboard.sql`](file:///workspaces/Go-No-Go/supabase/migrations/20261114000002_international_leaderboard.sql), [`submit-mission-score/index.ts`](file:///workspaces/Go-No-Go/supabase/functions/submit-mission-score/index.ts), [`leaderboardService.ts`](file:///workspaces/Go-No-Go/Go-No-Go/src/services/leaderboardService.ts), [`LeaderboardPanel.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/components/LeaderboardPanel.tsx), [`leaderboard.test.ts`](file:///workspaces/Go-No-Go/Go-No-Go/tests/unit/leaderboard.test.ts) |
| Removal of multiplayer, save/load, history, sandbox, learning & settings UI | **COMPLETE** | Removed legacy pages/stores/services; verified clean routing & bundle build |

---

## 4. Security, Anti-Cheat & Data Provenance Architecture

- **Authoritative Server Score Verification (`submit_verified_mission_score`)**: Client claims are never trusted blindly. The browser sends raw physical mission telemetry, which PostgreSQL validates against gate status, mass/launch caps, budget ceilings, region counts, anomaly bounds, and data conservation (`data_downlinked <= data_captured * 1.05`). The database then recomputes all 5 score buckets (`35 / 25 / 15 / 15 / 10`), partial-success/loss rules, and grades server-side, rejecting claimed score tampering beyond `1.0` point.
- **Zero Direct Table Access & Rate Limiting**: `public.leaderboard_entries` and `public.leaderboard_submission_audit` enable RLS with all table privileges revoked from `anon` and `authenticated`; all reads/writes pass strictly through `SECURITY DEFINER` RPCs (`submit_verified_mission_score`, `get_mission_leaderboard`) enforcing a sliding window of max 8 submissions per 10 minutes per hashed player key.
- **Privacy & Explicit Country Selection**: Players choose a pseudonymous callsign (`2–24` chars, sanitized against control/markup characters) and may optionally pick a valid **ISO-3166-1 alpha-2** country code (verified against an official 249-code allowlist on both client and server). Region is never guessed from IP addresses, and `player_key` / `user_id` hashes are never returned in public leaderboard responses.
- **Scientific & Engineering Honesty**: Physical laws (`PHYSICAL_LAW`), SMAD/NASA approximations (`ENGINEERING_APPROXIMATION`), and game-design balance thresholds (`GAMEPLAY_RULE`) are explicitly tagged in [`FormulaInspectorModal.tsx`](file:///workspaces/Go-No-Go/Go-No-Go/src/components/FormulaInspectorModal.tsx), while offline environments report `"International Leaderboard Offline"` rather than inventing placeholder competitors.

---

## 5. Optional Legacy Supabase Cleanup Proposal (Non-Destructive)

To preserve existing migration history, [`20261114000000_initial_gng_schema.sql`](file:///workspaces/Go-No-Go/supabase/migrations/20261114000000_initial_gng_schema.sql) and [`20261114000001_cooperative_multiplayer_rls.sql`](file:///workspaces/Go-No-Go/supabase/migrations/20261114000001_cooperative_multiplayer_rls.sql) were kept intact on disk, and [`20261114000002_international_leaderboard.sql`](file:///workspaces/Go-No-Go/supabase/migrations/20261114000002_international_leaderboard.sql) hardened `mission_reports` inserts cleanly. Once an operator verifies no legacy multiplayer rooms or saved-configuration rows need archival in their live database, those deprecated objects can optionally be retired via SQL:

```sql
-- Optional operator-reviewed cleanup (run only after verifying empty or archived data):
drop function if exists public.create_coop_room(text, text);
drop function if exists public.join_coop_room(text, text, text);
drop function if exists public.update_room_config_optimistic(uuid, integer, jsonb);
drop function if exists public.submit_mission_proposal(uuid, text, text, jsonb);
drop function if exists public.resolve_mission_proposal(uuid, boolean);
drop function if exists public.leave_coop_room(uuid);
drop function if exists public.handover_room_host(uuid, uuid);
drop table if exists public.mission_proposals cascade;
drop table if exists public.multiplayer_members cascade;
drop table if exists public.multiplayer_rooms cascade;
drop table if exists public.mission_configurations cascade;
```

---

## 6. 30-Second Live Demo Script & 7-Slide Pitch Outline

### 30-Second Live Demo Script
1. **0:00–0:06 (Stage 1 — Briefing)**: Open `/` over the live 3D Earth & Moon scene. Highlight **FLOODWATCH** monsoon cloud requirements and toggle **Standard -> Hard** to demonstrate live budget ceiling (`$95.0M -> $87.4M`) and margin tightening. Click **Start Mission Architecture**.
2. **0:06–0:13 (Stages 2 & 3 — Architecture & Orbit)**: Switch to the **6U CubeSat Optical Scout** preset to trigger a real **NO-GO** verdict, click **Plan Orbit & Launch** to show live perigee/apogee eccentricity & dispenser compatibility badges, and jump to Stage 4.
3. **0:13–0:19 (Stage 4 — Verification Lock & Ascent)**: Point out **LAUNCH LOCKED — NO-GO** and prioritized failure diagnostics. Recover using **FLOODWATCH Baseline SAR+SWIR** (`GO`), click **Initiate Launch Sequence**, and step through the 3D rocket launch into Orbit Operations.
4. **0:19–0:25 (Stage 5 — Operations)**: Toggle an active payload sensor ON/OFF and click **+24H SIM** to watch deterministic orbital telemetry, flood-basin captures, battery SoC, and ground downlinks accumulate cleanly, then click **Complete & Debrief**.
5. **0:25–0:30 (Stage 6 — Debrief & Leaderboard)**: Show the normalized `35/25/15/15/10` mission score, telemetry replay scrubber, and embedded **International Leaderboard** (`Global / Country / Season`), finishing with **Start New Attempt**.

### 7-Slide Competition Presentation Outline
1. **Slide 1 — Problem & Mission**: Global flood monitoring needs spaceborne, all-weather SAR + SWIR observation; engineering education lacks interactive mission-level trade-off simulators.
2. **Slide 2 — Product Overview**: **GO / NO-GO (GNG)** — 6-stage interactive spacecraft design, readiness verification, and 3D orbital operations simulator.
3. **Slide 3 — Coupled SI Aerospace Engine**: Two-body + $J_2$ astrodynamics, solar/battery eclipse closure, Tsiolkovsky $\Delta V$, RF link budget, radiative thermal node, reliability, and explicit provenance tags.
4. **Slide 4 — Gameplay Loop & Difficulty**: How **Standard / Hard / Expert** constraints drive meaningful mass, cost, power, and anomaly decisions rather than cosmetic labels.
5. **Slide 5 — Strict Launch Gate Integrity**: Demonstrating why cloud-blind or over-mass designs fail Flight Readiness Review (`NO_GO` lock) while balanced SAR SmallSats earn launch clearance.
6. **Slide 6 — NASA Open Resources Grounding**: Integrating NASA EOSDIS GIBS flood imagery (`MODIS`/`VIIRS`), Triana/DSCOVR 3D geometry (`mission-viz`), and JPL/NASA SE & CubeSat engineering standards.
7. **Slide 7 — International Leaderboard & Competition Readiness**: Server-side score recomputation, ISO-3166-1 opt-in privacy, verified test suite (`Vitest` + `Playwright`), and roadmap.

---

## 7. NASA Data & Super Intelligence (SI) Disclosure

### NASA Data & Technical Standards Cited
- **NASA EOSDIS Global Imagery Browse Services (GIBS)**: WMTS EPSG:3857 tiles (`MODIS_Terra_CorrectedReflectance_TrueColor`, `VIIRS_SNPP_CorrectedReflectance_TrueColor`) — <https://gibs.earthdata.nasa.gov/>
- **NASA `mission-viz` Open Source Repository**: `TrianaSatellite.x3d` geometry and planetary Earth/Moon surface textures — <https://github.com/nasa/mission-viz>
- **NASA Technical Memorandum NASA/TM–20210000030**: *An Ontology-Based Virtual Orrery* (O'Neil & Rovetto)
- **JPL 13-3547_A1b / NASA NPR 7120.5F / NPR 7120.8A / NPR 8705.4B / NASA SE Handbook Rev 2 / CubeSat 101 (NASA CSLI)**

### Super Intelligence (SI) Development Disclosure
Large language models / AI coding assistants were used during software engineering, code simplification, TypeScript/React refactoring, PostgreSQL RLS/RPC security hardening, test generation, and documentation review. All AI-generated code, engineering equations, 3D visuals, and database migrations were audited, refined, and verified against strict TypeScript compilation, static linting, unit/integration suites, and browser end-to-end tests. No NASA logos, flags, or official mission insignia were generated or altered by AI models.

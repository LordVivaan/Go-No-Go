# GO / NO-GO (GNG) — `AIM.md` vs. Actual Implementation Reconciliation (`DIFF.md`)

> **Purpose**: Reconcile the authoritative product vision in `AIM.md` against the actual inspected implementation documented in `PROJECT.md`. Every item below is verified directly against source code, database migrations, and test suites.

---

## 1. Executive Reconciliation Summary

| Classification | Count | Summary |
| :--- | :---: | :--- |
| **Implemented as intended** | 13 | 6-stage flow, Earth-first startup, Stage 2 planning sheets, thin-slice UI, SI coupled budgets, advisory verification + user GO/NO-GO decision, fixed-timestep auto simulation, 35/25/15/15/10 scoring, difficulty scaling, WebGL fallback, provisional leaderboard, EO/weather supporting context |
| **Implemented with deviation** | 3 | Deep-space-only playable scenarios (no playable `FLOODWATCH`), `EARTH_REFERENCE_REGIONS` fallback on Stage 1, legacy "flood" naming in deep-space code |
| **Partially implemented** | 2 | Cooperative multiplayer & saved configs exist in Supabase SQL migrations only (no SPA UI/service); optional AI advisor endpoint hook exists without backend |
| **Not implemented** | 1 | Server-side authoritative simulation replay for `VERIFIED` leaderboard entries (all browser runs are `PROVISIONAL`) |
| **Extra / beyond `AIM.md`** | 4 | Interactive `<TechTerm>` glossary with NASA learning links, Stage 2 `PlanningSheetDiagram` + educational component guidance, 30m `cop-dem-glo-30` DEM dataset + SAS token manager, `FormulaInspectorModal` equation provenance viewer |

---

## 2. Detailed Feature & Requirement Comparison

| # | `AIM.md` Requirement / Concept | Actual Implementation Evidence | Classification | Impact | Theorized Solution |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 1 | **Six-Stage Sequential Workflow** (Briefing → Architecture → Orbit & Launch → Verification → Operations → Debrief) | `App.tsx`, `AppShell.tsx`, `MissionBriefing.tsx`, `SpacecraftBuilder.tsx`, `OrbitPlanner.tsx`, `EngineeringVerification.tsx`, `MissionSimulation.tsx`, `MissionReport.tsx` | **Implemented as intended** | None — core UX matches `AIM.md` verbatim. | Maintain route guards and 6-link `AppShell` nav. |
| 2 | **Coupled SI Engineering Budgets** (Mass, Power, Orbital, Data/Comms, Propulsion, Thermal, Cost, Reliability) | `src/engine/{constants,mass,orbital,power,data,communications,propulsion,thermal,budget,reliability}.ts`, verified by `engine.test.ts` | **Implemented as intended** | High educational & engineering fidelity. | Keep SI internals and `FormulaInspectorModal` provenance tags synchronized. |
| 3 | **Advisory Engineering Verification & User GO / NO-GO Decision** | `validation.ts` (`evaluateMissionEngineering`), `EngineeringVerification.tsx` (`GO — Authorize Launch` / `NO-GO — Hold Launch` + native `<dialog>` risk acknowledgement when overriding `NO_GO`), `MissionSimulation.tsx` (requires `userLaunchAuthorization === 'GO'`) | **Implemented as intended** | The system advises (`ENG: GO/CAUTION/NO-GO`) and the Mission Director decides; full experimentation is never blocked. | Keep advisory engine and explicit risk acknowledgement aligned. |
| 4 | **Frame-Rate-Independent Fixed-Timestep Simulation** | `simulationStore.ts` (`FIXED_PHYSICS_DT_SECONDS = 60`, accumulator, `fastForwardSimulationHours`), `simulation.ts` (`stepSimulationState`), `events.ts` (`createSeededRng` Mulberry32) | **Implemented as intended** | Deterministic 30s vs 300s step invariance proven in `missionSimulation.test.ts`. | None required. |
| 5 | **Operational Controls & Failure States** (payload ON/OFF, duty modes, downlink burst, trim burn, safe mode, anomalies) | `simulationStore.ts`, `MissionSimulation.tsx`, `ResourcePanel.tsx`, `scoring.ts` (`MISSION_LOSS` 40-pt cap, Grade `F`) | **Implemented as intended** | Real-time resource trade-offs work end-to-end. | None required. |
| 6 | **5-Bucket Scoring (`35/25/15/15/10`)** | `scoring.ts` (`evaluateMissionScore`) and `20261115000000_provisional_leaderboard_verification.sql` both compute Science `35`, Reliability `25`, Efficiency `15`, Comms `15`, Risk `10`. | **Implemented as intended** | Client preview and server recomputation align within `1.0` pt rounding. | Keep client/server formulas in lockstep. |
| 7 | **Meaningful Difficulty Modes (`STANDARD`, `HARD`, `EXPERT`)** | `scenarios.ts` (`DIFFICULTY_PROFILES`), `validation.ts`, `events.ts`, `scoring.ts` scale cost caps, reserves, DoD, link margins, and anomaly stress. | **Implemented as intended** | Meaningful challenge progression across difficulties. | None required. |
| 8 | **Playable Scenarios & Earth-Observation Context** (`AIM.md` emphasizes deep-space + Earth context without being a flood app; legacy `seed.sql` has `FLOODWATCH`) | `scenarios.ts` has 3 scenarios (`LUNAR SCOUT`, `MARS OBSERVER`, `ASTEROID EXPLORER`). `FLOODWATCH` is absent from `MISSION_SCENARIOS`, yet `MissionSimulation.tsx`, `weather.ts`, `seed.sql`, and `validation.ts` retain `FLOODWATCH`/`EARTH` branches; `MissionBriefing.tsx` uses `EARTH_REFERENCE_REGIONS` fallback. | **Implemented with deviation** | Minor confusion: Stage 5 EO/Weather buttons never appear for active scenarios, and `floodRegionsMappedCount` / `FloodBasinWeatherPanel` naming persists. | **Option A**: Keep EO/Weather strictly as Stage 1 Earth reference context and rename `flood*` symbols to generic `targetRegions*` / `scienceUtility`. **Option B**: Add a curated Earth-observation scenario if Earth ops are desired. |
| 9 | **Engineering Advisor / Guided Remediation** | `src/engine/advisor.ts` and `src/components/MissionAdvisorPanel.tsx` are mounted in `EngineeringVerification.tsx` (Stage 4) alongside `ValidationFinding` cards and `<TechTerm>` educational explanations. | **Implemented as intended** | Deterministic remediation synthesis and NASA resource context are surfaced directly to the Mission Director. | Keep deterministic advisor and findings synchronized. |
| 10 | **Supporting EO & Weather APIs (Planetary Computer, NASA GIBS, Meteomatics)** | `planetaryComputerService.ts`, `nasaDataService.ts`, `weatherService.ts`, `functions/api/weather.ts`, `meteomaticsWeatherHandler.ts` | **Implemented as intended** | Cleanly separated from scoring/physics; graceful offline fallbacks; server-only Meteomatics secrets. | Keep `EarthEnvironmentalWeatherPanel` naming and document `.dev.vars` / Cloudflare secrets setup. |
| 11 | **International Leaderboard (`PROVISIONAL` vs `VERIFIED`)** | `leaderboardService.ts`, `LeaderboardPanel.tsx`, `20261115000000_provisional_leaderboard_verification.sql` mark all browser runs `PROVISIONAL` (`is_verified = false`) and recompute scores server-side. | **Implemented as intended** (Replay `VERIFIED` tier **Not implemented**) | Honest integrity posture: prevents false claims of full server-side physics replay. | If `VERIFIED` entries are ever needed, run deterministic `stepSimulationState` replay inside a Supabase Edge Function / worker from `{scenarioId, difficulty, config, seed, commandLog}`. |
| 12 | **3D Visualizations & WebGL Resilience** | `EarthScene.tsx`, `Spacecraft.tsx`, `OrbitPath.tsx`, `LaunchAnimation.tsx`, `WebGLFallback.tsx` (`SceneCanvasGuard`) | **Implemented as intended** (+ **Extra**: NASA Triana mesh loader) | Smooth 3D feedback with clean non-WebGL fallback. | Fix `site.webmanifest` `/public/web-app-manifest-*.png` paths to `/web-app-manifest-*.png`. |
| 13 | **Cooperative Multiplayer & Saved Configs (Database Artifacts)** | `20261114000000_initial_gng_schema.sql` & `20261114000001_cooperative_multiplayer_rls.sql` define `multiplayer_rooms`, `room_members`, `mission_proposals`, `mission_decisions`, `mission_configurations`, `mission_reports`, `profiles`; `submit-mission-score/index.ts` Edge Function exists. Zero SPA callers. | **Partially implemented** (SQL/Edge only; **Excluded from 6-stage SPA per `AIM.md`**) | Dead schema/Edge Function surface adds maintenance & audit confusion (`components.test.tsx` explicitly asserts no `Saved` sidebar). | Either drop unused multiplayer/config tables in a cleanup migration for production simplicity or clearly label them as dormant Phase-2 backend scaffolding. |
| 14 | **Workspace Documentation Accuracy (`README.md`)** | Root `README.md` references `/3DModels/*.glb`, 8 NASA PDFs, and `SSAO_Rovetto.owl` in `Resources/`, none of which exist on disk. | **Implemented with deviation** (Doc drift) | Misleads contributors looking for missing PDFs/GLBs. | Update root `README.md` or refer contributors to `PROJECT.md`. |

---

## 3. Prioritized Remediation & Cleanup Roadmap

1. **P1 — Documentation & Naming Alignment (Zero Runtime Risk)**:
   - Align `SUBMISSION.md`, `HostingGuide.md`, and `PROJECT.md` (completed in this audit) so all claims match the 3 playable deep-space scenarios + Stage 1 Earth EO/Weather context + `PROVISIONAL` leaderboard.
   - Fix `Go-No-Go/public/site.webmanifest` icon paths (`/public/web-app-manifest-*.png` → `/web-app-manifest-*.png`).
2. **P2 — Surface or Retire Unused Code**:
   - Decide whether to mount `MissionAdvisorPanel.tsx` in `EngineeringVerification.tsx` (Stage 4) to surface deterministic remediation guidance, or archive it.
   - Rename legacy `flood*` identifiers (`floodScienceUtility`, `floodRegionsMappedCount`, `FloodBasinWeatherPanel.tsx`) to scenario-neutral names (`scienceUtility`, `targetRegionsMappedCount`) in a future refactor.
3. **P3 — Backend Hygiene & Bundle Optimization**:
   - Archive or drop unused `multiplayer_rooms` / `mission_configurations` / `submit-mission-score` if single-player 6-stage scope remains permanent.
   - Optionally lazy-load 3D `SpacecraftScene` / `EarthScene` routes to reduce the `vendor-r3f` (`961.96 kB`) initial chunk size.

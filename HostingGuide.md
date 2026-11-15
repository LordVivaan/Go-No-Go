All commands below assume the hosting runner starts at the repository root (`/workspaces/Go-No-Go`), while the Vite + React + Cloudflare Pages application resides in `Go-No-Go/` and the optional Supabase backend resides in `supabase/`.

# Build command

From the repository root:

```bash
cd Go-No-Go && npm ci && npm run build
```

- **What it runs**: Installs locked dependencies and executes `tsc -b && vite build`, outputting the production static bundle to `Go-No-Go/dist/`.
- **Verified locally**: `npm run build` inside `Go-No-Go/` succeeded (exited `0`, built `dist/` in `3.18s`). `npm run typecheck`, `npm run lint` (`oxlint`: `0` warnings, `0` errors across `83` files), `npm test` (`vitest run`: `9` files, `65` tests passed), and `npm run test:e2e` (`playwright test`: `4` tests passed) also passed locally.
- **Asset staging note**: `Go-No-Go/public/models/triana-spacecraft.json` and `Go-No-Go/public/textures/{EarthImage.jpg,Moon_Flat.jpg}` are already committed/staged in `Go-No-Go/public/`. Re-running `npm run stage-assets` requires the `Resources/mission-viz` submodule to be checked out.

# Deploy command

Deploy the built static output (`Go-No-Go/dist`) together with Cloudflare Pages Functions (`Go-No-Go/functions/api/weather.ts`) from `Go-No-Go/`:

```bash
cd Go-No-Go && npx wrangler pages deploy dist --project-name go-no-go
```

- **Cloudflare Pages Git Integration (Dashboard Manual Step)**:
  - **Root directory**: `Go-No-Go`
  - **Build command**: `npm ci && npm run build`
  - **Build output directory**: `dist`
  - **Production branch**: `main`
  - **Compatibility date**: `2026-11-01` (matches `Go-No-Go/wrangler.toml`)
- **Note**: Not executed against live Cloudflare in this audit (manual Cloudflare authentication/dashboard configuration required).

# Preview command

To preview the static bundle **and** the `/api/weather` Cloudflare Pages Function locally:

```bash
cd Go-No-Go && npx wrangler pages dev dist --port 8788
```

For static-only SPA preview without Cloudflare Pages Functions (note: `/api/weather` returns a `503` guidance payload under `vite preview` as configured in `Go-No-Go/vite.config.js`):

```bash
cd Go-No-Go && npm run preview -- --host 127.0.0.1 --port 4173
```

---

## Environment Variables & Secrets

### Public Build-Time Variables (Frontend / Cloudflare Pages Environment Variables)
Set these in Cloudflare Pages → *Settings → Environment variables* (or locally in `Go-No-Go/.env`, never committed):
- `VITE_SUPABASE_URL` *(optional)* — Supabase project HTTP(S) URL. If omitted or set to a placeholder (such as the default `https://your-project-ref.supabase.co` in `Go-No-Go/.env`), the International Leaderboard cleanly enters offline mode and surfaces the exact `supabaseConfigReason` diagnostic.
- `VITE_SUPABASE_PUBLISHABLE_KEY` *(optional)* — Supabase publishable (`anon`) key (`VITE_SUPABASE_ANON_KEY` is also accepted as fallback).
- `VITE_ADVISOR_ENDPOINT` *(optional)* — Optional HTTP endpoint for AI advisor narrative (`engine/advisor.ts`); disabled by default.

### Server-Only Runtime Secrets (Cloudflare Pages Secrets / Local `Go-No-Go/.dev.vars`)
Never prefix these with `VITE_` and never commit them:
- `METEOMATICS_USERNAME` *(optional)* — Meteomatics API username for `/api/weather` (`functions/api/weather.ts`).
- `METEOMATICS_PASSWORD` *(optional)* — Meteomatics API password for `/api/weather`.
- If either is unset, `/api/weather` returns `503 WEATHER_CREDENTIALS_MISSING` and the UI falls back to deterministic scenario baselines without breaking mission gameplay.

---

## Optional Supabase Leaderboard Setup (Manual Steps)

1. Link or target your Supabase project (PostgreSQL 17, configured in `supabase/config.toml`).
2. Apply migrations in order:
   - `supabase/migrations/20261114000000_initial_gng_schema.sql`
   - `supabase/migrations/20261114000001_cooperative_multiplayer_rls.sql`
   - `supabase/migrations/20261114000002_international_leaderboard.sql`
   - `supabase/migrations/20261115000000_provisional_leaderboard_verification.sql`
3. Optionally seed `public.missions` with `supabase/seed.sql`.
4. Ensure **Anonymous Sign-Ins** are enabled in Supabase Auth settings (used by `leaderboardService.ts`; falls back to pseudonymous `playerToken` if disabled).
5. Note that browser-submitted leaderboard entries are intentionally stored as `PROVISIONAL` (`is_verified = false`) because interactive orbital operations execute client-side without full server replay.

---

## Security Headers & Verification Checklist

- `Go-No-Go/public/_headers` configures `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and immutable caching for `/assets/*`.
- **Pre-deploy local verification**:
  ```bash
  cd Go-No-Go && npm run typecheck && npm run lint && npm test && npm run build
  ```
- **Post-deploy smoke checks**:
  1. Load `/` and confirm the Earth-first 3D briefing renders (with Moon in background) and `ENG: GO` gate status with zero console errors.
  2. Visit `/api/weather?basin=basin-brahmaputra` and verify `200 OK` JSON (when Meteomatics secrets are set) or `503 WEATHER_CREDENTIALS_MISSING` (when intentionally unconfigured), and verify `/api/weather?basin=invalid` returns `400 INVALID_BASIN`.
  3. Complete a simulated flight to `/debrief` and confirm the International Leaderboard displays live `PROVISIONAL` standings (if Supabase is configured) or the honest offline banner (if unconfigured).

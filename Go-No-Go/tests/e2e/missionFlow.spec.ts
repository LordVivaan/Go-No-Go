import { expect, test } from '@playwright/test';

test.describe('GO / NO-GO — 6-Stage End-to-End Mission Flow', () => {
  test('executes full 6-stage flow including difficulty scaling, NO-GO launch block, GO recovery, 24h flight ops, debrief leaderboard & new attempt', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('requestfailed', (req) => {
      failedRequests.push(`${req.method()} ${req.url()} (${req.failure()?.errorText ?? 'failed'})`);
    });
    page.on('response', (res) => {
      if (res.status() >= 400) {
        failedRequests.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.route('**/api/evaluate-mission', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          report: {
            evaluationId: 'eval_e2e_mock',
            evaluationVersion: '2026.11-v1',
            model: 'gpt-4.1-mini',
            snapshotHash: 'e2e-hash-001',
            overallScore: 86.5,
            outcome: 'SUCCESS',
            executiveSummary: 'E2E mocked NASA-informed evaluation summary.',
            categories: {
              science: { weight: 35, score: 88, weightedPoints: 30.8, strengths: ['Objective met'], deductions: [] },
              reliability: { weight: 25, score: 90, weightedPoints: 22.5, strengths: ['High reliability'], deductions: [] },
              resource_efficiency: { weight: 15, score: 84, weightedPoints: 12.6, strengths: ['Balanced margins'], deductions: [] },
              data_comms: { weight: 15, score: 85, weightedPoints: 12.75, strengths: ['Positive link margin'], deductions: [] },
              risk_management: { weight: 10, score: 78.5, weightedPoints: 7.85, strengths: ['ODAR compliant'], deductions: [] },
            },
            criticalFailures: [],
            minorFindings: [],
            engineeringRecommendations: [],
            nasaReferences: [
              {
                code: 'NASA/SP-2016-6105 Rev2',
                title: 'NASA Systems Engineering Handbook',
                version: 'Rev 2',
                url: 'https://www.nasa.gov/reference/systems-engineering-handbook/',
                basis: 'NASA_HANDBOOK_GUIDANCE',
                relevance: 'Verification and margin guidance.',
              },
            ],
            missionSuccesses: ['Mission completed'],
            missionLimitations: [],
            evaluatedAtIso: new Date().toISOString(),
            cached: false,
          },
        }),
      });
    });

    await page.route('**/rest/v1/rpc/get_mission_leaderboard', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalCount: 0,
          entries: [],
          playerEntry: null,
          nearbyEntries: [],
        }),
      });
    });

    // Stage 1 — Mission Briefing (Earth primary on initial startup with Moon in background)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByText(/GO \/ NO-GO/i).first()).toBeVisible();
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(page.getByTestId('earth-scene')).toHaveAttribute('data-primary-body', 'EARTH');
    await expect(page.getByTestId('earth-scene')).toHaveAttribute('data-moon-background', 'true');
    await expect(page.getByTestId('shell-gate-status')).toContainText('ENG: GO');

    // Toggle to inspect Lunar target body prominently, then back to Earth View
    await page.getByRole('button', { name: /Target: MOON/i }).click();
    await expect(page.getByTestId('earth-scene')).toHaveAttribute('data-primary-body', 'MOON');
    await page.getByRole('button', { name: /Earth View/i }).click();
    await expect(page.getByTestId('earth-scene')).toHaveAttribute('data-primary-body', 'EARTH');

    // Switch difficulty to HARD -> cost cap drops from $145.0M to $133.4M, then back to STANDARD
    await page.getByRole('radio', { name: /Hard/i }).click();
    await expect(page.getByText('$133.4M', { exact: true })).toBeVisible();
    await page.getByRole('radio', { name: /Standard/i }).click();
    await expect(page.getByText('$145.0M', { exact: true })).toBeVisible();

    await page.screenshot({ path: '/tmp/gng-e2e-stage1-briefing.png' });

    // Stage 2 — Payload Selection -> Stage 3 — Subsystems (no sidebars)
    await page.getByRole('button', { name: /Continue to Payload Selection/i }).click();
    await expect(page).toHaveURL(/\/payloads/);
    await expect(page.locator('aside')).toHaveCount(0);
    await page.getByRole('button', { name: /Continue to Subsystems/i }).click();
    await expect(page).toHaveURL(/\/subsystems/);
    await expect(page.getByTestId('architecture-planning-sheet')).toBeVisible();
    await expect(page.getByRole('button', { name: /Save Config/i })).toHaveCount(0);

    await page.getByRole('button', { name: /6U CubeSat Optical Scout/i }).click();
    await expect(page.getByTestId('shell-gate-status')).toContainText('ENG: NO-GO');

    // Stage 4 — Orbit & Launch Planning
    await page.getByRole('link', { name: /^ORBIT & LAUNCH$/i }).click();
    await expect(page).toHaveURL(/\/orbit/);
    await expect(page.getByLabel(/Perigee orbital altitude in kilometers/i)).toBeVisible();
    await expect(page.getByLabel(/Apogee orbital altitude in kilometers/i)).toBeVisible();

    // Selecting an Earth orbit preset previews Earth; selecting Lunar orbit previews Moon
    await page.getByRole('button', { name: /400 km ISS LEO/i }).click();
    await expect(page.getByTestId('earth-scene')).toHaveAttribute('data-primary-body', 'EARTH');
    await page.getByRole('button', { name: /100 km Lunar Polar/i }).click();
    await expect(page.getByTestId('earth-scene')).toHaveAttribute('data-primary-body', 'MOON');

    // Navigating directly to Stage 7 before user authorization prompts for Stage 6 launch decision
    await page
      .locator('nav[aria-label="Mission Gameplay Stages"]')
      .getByRole('link', { name: /07.*Operations/i })
      .click();
    await expect(page).toHaveURL(/\/operations/);
    await expect(page.getByText(/AWAITING MISSION DIRECTOR LAUNCH AUTHORIZATION/i)).toBeVisible();

    // Stage 4 — Engineering Verification: advisory NO-GO still allows user GO with risk acknowledgement
    await page.getByRole('link', { name: /Go to Launch Decision/i }).click();
    await expect(page).toHaveURL(/\/verification/);
    await expect(page.getByTestId('final-launch-decision-panel')).toBeVisible();
    await expect(page.getByRole('button', { name: /GO — Authorize Launch/i })).toBeEnabled();
    await page.getByRole('button', { name: /GO — Authorize Launch/i }).click();
    await expect(page.getByText(/Acknowledge Critical Flight Risks Before Launch/i)).toBeVisible();
    await page.getByRole('button', { name: /Cancel & Review Design/i }).click();

    // Recover spacecraft via Stage 3 Subsystems Baseline GO preset
    await page
      .locator('nav[aria-label="Mission Gameplay Stages"]')
      .getByRole('link', { name: /03.*Subsystems/i })
      .click();
    await expect(page).toHaveURL(/\/subsystems/);
    await page.getByRole('button', { name: /Lunar Scout Polar Baseline/i }).click();
    await expect(page.getByTestId('shell-gate-status')).toContainText('ENG: GO');

    // Return to Stage 4 -> Authorize Launch -> Full-Screen Launch Sequence -> Auto-Start Operations
    await page.getByRole('link', { name: /06.*Verification/i }).click();
    await expect(page).toHaveURL(/\/verification/);
    await page.screenshot({ path: '/tmp/gng-e2e-stage4-verification.png' });

    await page.getByRole('button', { name: /GO — Authorize Launch/i }).click();
    await expect(page.getByTestId('launch-sequence-overlay')).toBeVisible();
    await page.getByRole('button', { name: /Skip to Orbital Insertion/i }).click();

    // Stage 5 — Mission Operations starts automatically (PAUSE button visible = running)
    await expect(page).toHaveURL(/\/operations/);
    await expect(page.getByRole('button', { name: /PAUSE/i })).toBeVisible();
    await page.getByRole('button', { name: /\+24H SIM/i }).click();
    await page.getByRole('button', { name: /COMPLETE & DEBRIEF/i }).click();

    // Stage 6 — Mission Debrief & Embedded International Leaderboard
    await expect(page).toHaveURL(/\/debrief/);
    await expect(page.getByText(/Overall Normalized Mission Score/i)).toBeVisible();
    await expect(page.getByLabel(/Replay mission telemetry timeline/i)).toBeVisible();
    await expect(page.getByText(/No verified runs recorded yet/i)).toBeVisible();
    await page.getByRole('button', { name: /Country \/ Region/i }).click();
    await expect(page.getByLabel(/Filter country/i)).toBeVisible();
    await page.screenshot({ path: '/tmp/gng-e2e-stage6-debrief.png', fullPage: true });

    // Start New Attempt resets cleanly to Stage 1
    await page.getByRole('button', { name: /START NEW ATTEMPT/i }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('shell-gate-status')).toContainText('ENG: GO');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });

  test('renders cleanly across desktop, tablet, and mobile viewports with zero horizontal overflow or extra nav routes', async ({
    page,
  }) => {
    const viewports = [
      { name: 'desktop-fhd', width: 1919, height: 1079 },
      { name: 'desktop-hd', width: 1366, height: 768 },
      { name: 'tablet', width: 1024, height: 768 },
      { name: 'mobile', width: 390, height: 844 },
    ];

    await page.route('**/api/evaluate-mission', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          report: {
            evaluationId: 'eval_e2e_mock',
            evaluationVersion: '2026.11-v1',
            model: 'gpt-4.1-mini',
            snapshotHash: 'e2e-hash-001',
            overallScore: 86.5,
            outcome: 'SUCCESS',
            executiveSummary: 'E2E mocked NASA-informed evaluation summary.',
            categories: {
              science: { weight: 35, score: 88, weightedPoints: 30.8, strengths: ['Objective met'], deductions: [] },
              reliability: { weight: 25, score: 90, weightedPoints: 22.5, strengths: ['High reliability'], deductions: [] },
              resource_efficiency: { weight: 15, score: 84, weightedPoints: 12.6, strengths: ['Balanced margins'], deductions: [] },
              data_comms: { weight: 15, score: 85, weightedPoints: 12.75, strengths: ['Positive link margin'], deductions: [] },
              risk_management: { weight: 10, score: 78.5, weightedPoints: 7.85, strengths: ['ODAR compliant'], deductions: [] },
            },
            criticalFailures: [],
            minorFindings: [],
            engineeringRecommendations: [],
            nasaReferences: [
              {
                code: 'NASA/SP-2016-6105 Rev2',
                title: 'NASA Systems Engineering Handbook',
                version: 'Rev 2',
                url: 'https://www.nasa.gov/reference/systems-engineering-handbook/',
                basis: 'NASA_HANDBOOK_GUIDANCE',
                relevance: 'Verification and margin guidance.',
              },
            ],
            missionSuccesses: ['Mission completed'],
            missionLimitations: [],
            evaluatedAtIso: new Date().toISOString(),
            cached: false,
          },
        }),
      });
    });

    await page.route('**/rest/v1/rpc/get_mission_leaderboard', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalCount: 0,
          entries: [],
          playerEntry: null,
          nearbyEntries: [],
        }),
      });
    });

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      // Exactly 8 nav stage links & zero legacy <aside>
      await expect(page.locator('aside')).toHaveCount(0);
      await expect(page.locator('nav[aria-label="Mission Gameplay Stages"] a')).toHaveCount(8);

      // Earth & Moon 3D canvas visible without overflow
      await expect(page.locator('canvas').first()).toBeVisible();
      const overflowBriefing = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(overflowBriefing).toBe(false);
      await page.screenshot({ path: `/tmp/gng-e2e-${vp.name}-briefing.png` });

      // Stage 6 Debrief + Leaderboard mobile check
      await page.goto('/debrief');
      await expect(page.getByRole('region', { name: /International Leaderboard/i })).toBeVisible();
      const overflowDebrief = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(overflowDebrief).toBe(false);
    }
  });

  test('displays Planetary Computer Sentinel-1 RTC & Sentinel-2 L2A EO metadata in Briefing, Operations, and Debrief provenance', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const svgTile =
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#0ea5e9"/></svg>';

    await page.route('https://planetarycomputer.microsoft.com/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/api/stac/v1/search')) {
        const body = route.request().postDataJSON() as { collections?: string[] } | null;
        const collection = body?.collections?.[0] ?? 'sentinel-1-rtc';
        if (collection === 'sentinel-1-rtc') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              features: [
                {
                  id: 'S1D_IW_GRDH_1SDV_E2E_TEST_rtc',
                  bbox: [89.0, 23.0, 91.5, 24.8],
                  properties: {
                    datetime: '2024-09-04T23:56:43.631950Z',
                    platform: 'sentinel-1d',
                    'sat:orbit_state': 'descending',
                    'sar:instrument_mode': 'IW',
                    'sar:polarizations': ['VV', 'VH'],
                    'proj:epsg': 32646,
                  },
                  assets: {
                    tilejson: {
                      href: 'https://planetarycomputer.microsoft.com/api/data/v1/item/tilejson.json?collection=sentinel-1-rtc&item=S1D_E2E',
                    },
                  },
                },
              ],
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            features: [
              {
                id: 'S2A_MSIL2A_E2E_TEST',
                bbox: [89.0, 23.0, 91.5, 24.8],
                properties: {
                  datetime: '2024-09-02T04:27:01.024000Z',
                  platform: 'Sentinel-2A',
                  instruments: ['msi'],
                  'eo:cloud_cover': 83.9,
                  'proj:epsg': 32646,
                },
                assets: {
                  tilejson: {
                    href: 'https://planetarycomputer.microsoft.com/api/data/v1/item/tilejson.json?collection=sentinel-2-l2a&item=S2A_E2E',
                  },
                },
              },
            ],
          }),
        });
        return;
      }
      if (url.includes('/api/data/v1/item/tilejson.json')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tiles: [
              'https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?item=E2E',
            ],
            bounds: [89.0, 23.0, 91.5, 24.8],
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: svgTile,
      });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Stage 1: Inspect Supporting Earth-Observation Reference Imagery modal
    await page.getByRole('button', { name: /EO Imagery Reference/i }).click();
    await expect(page.getByRole('dialog', { name: /Earth Observation Reference Data/i })).toBeVisible();
    await expect(page.getByText('S1D_IW_GRDH_1SDV_E2E_TEST_rtc')).toBeVisible();
    await expect(page.getByText('S2A_MSIL2A_E2E_TEST')).toBeVisible();
    await expect(page.getByText(/83.9% \(eo:cloud_cover\)/i)).toBeVisible();
    await page.getByRole('button', { name: /Close EO imagery modal/i }).click();

    // Stage 4 -> Stage 5 -> Stage 6 Debrief provenance (Lunar mission does NOT show Earth EO button in Operations)
    await page
      .locator('nav[aria-label="Mission Gameplay Stages"]')
      .getByRole('link', { name: /06.*Verification/i })
      .click();
    await expect(page).toHaveURL(/\/verification/);
    await page.getByRole('button', { name: /GO — Authorize Launch/i }).click();
    await page.getByRole('button', { name: /Skip to Orbital Insertion/i }).click();
    await expect(page).toHaveURL(/\/operations/);
    await expect(page.getByRole('button', { name: /EO Scene/i })).toHaveCount(0);

    await page.getByRole('button', { name: /COMPLETE & DEBRIEF/i }).click();
    await expect(page).toHaveURL(/\/debrief/);
    await page.getByRole('button', { name: /Expand Technical Debrief & KPP Matrix/i }).click();
    await expect(page.getByText(/External Earth-Observation Datasets & Provenance/i)).toBeVisible();
    await expect(page.getByText(/sentinel-1-rtc \(SAR\)/i)).toBeVisible();
  });

  test('displays Meteomatics basin weather context across Briefing, Operations, and Debrief provenance with safe fallback', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.route('**/api/weather**', async (route) => {
      const url = new URL(route.request().url());
      const basin = url.searchParams.get('basin') ?? 'basin-brahmaputra';
      const windowMode = url.searchParams.get('window') ?? 'current';

      if (basin === 'basin-danube') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: {
              code: 'WEATHER_CREDENTIALS_MISSING',
              message: 'Server-side Meteomatics credentials are not configured.',
            },
            retrievedAtUtc: '2026-11-15T06:12:00Z',
          }),
        });
        return;
      }

      const classification =
        windowMode === 'forecast_24h'
          ? 'FORECAST'
          : windowMode === 'historical_24h'
            ? 'HISTORICAL'
            : 'CURRENT_ANALYSIS';

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          snapshot: {
            basinId: basin,
            basinName:
              basin === 'basin-mekong'
                ? 'Lower Mekong Floodplain'
                : 'Brahmaputra-Ganges Delta',
            location: { lat: 23.8, lon: 90.4 },
            windowMode,
            classification,
            classificationNote: `${classification} test snapshot`,
            dataTimeUtc: '2026-11-15T06:00:00Z',
            retrievedAtUtc: '2026-11-15T06:12:00Z',
            current: {
              validTimeUtc: '2026-11-15T06:00:00Z',
              classification,
              metrics: {
                temperature2mC: 28.5,
                precip1hMm: 11.2,
                windSpeed10mMs: 6.4,
                totalCloudCoverPct: 88,
                globalSolarRadiationWm2: 390,
              },
            },
            series: [
              {
                validTimeUtc: '2026-11-15T06:00:00Z',
                classification,
                metrics: {
                  temperature2mC: 28.5,
                  precip1hMm: 11.2,
                  windSpeed10mMs: 6.4,
                  totalCloudCoverPct: 88,
                  globalSolarRadiationWm2: 390,
                },
              },
            ],
            caveats: [
              'Precipitation values represent modeled/blended surface rain flux (mm/h) and are NOT proof of river inundation.',
            ],
            source: {
              provider: 'Meteomatics Weather API',
              model: 'mix',
              endpointHost: 'api.meteomatics.com',
              requestedParameters: ['t_2m:C', 'precip_1h:mm'],
              units: {
                temperature2m: '°C',
                precip1h: 'mm',
                windSpeed10m: 'm/s',
                totalCloudCover: '%',
                globalSolarRadiation: 'W/m²',
              },
              cacheStatus: 'MISS',
              quotaNote: 'Bounded to 4 basins',
            },
          },
        }),
      });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Stage 1: Open Supporting Earth Weather Reference modal and inspect Current + Forecast + Fallback
    await page.getByRole('button', { name: /Earth Weather Reference/i }).click();
    await expect(page.getByRole('dialog', { name: /Earth-Observation Environmental Weather Context/i })).toBeVisible();
    await expect(page.getByText('11.2 mm')).toBeVisible();
    await expect(page.getByText('CURRENT ANALYSIS')).toBeVisible();

    await page.getByRole('button', { name: /\+24h Outlook/i }).click();
    await expect(page.getByText('MODEL FORECAST')).toBeVisible();

    await page.getByRole('button', { name: /Danube-Tisza Confluence/i }).click();
    await expect(page.getByText(/Fallback State · UNCONFIGURED/i)).toBeVisible();
    await page.getByRole('button', { name: /Close environmental weather modal/i }).click();

    // Stage 4 -> Stage 5 -> Stage 6 Debrief provenance (Lunar operations must NOT display terrestrial weather)
    await page
      .locator('nav[aria-label="Mission Gameplay Stages"]')
      .getByRole('link', { name: /06.*Verification/i })
      .click();
    await expect(page).toHaveURL(/\/verification/);
    await page.getByRole('button', { name: /GO — Authorize Launch/i }).click();
    await page.getByRole('button', { name: /Skip to Orbital Insertion/i }).click();
    await expect(page).toHaveURL(/\/operations/);
    await expect(page.getByRole('button', { name: /^Weather$/i })).toHaveCount(0);

    await page.getByRole('button', { name: /COMPLETE & DEBRIEF/i }).click();
    await expect(page).toHaveURL(/\/debrief/);
    await page.getByRole('button', { name: /Expand Technical Debrief & KPP Matrix/i }).click();
    await expect(page.getByText(/Weather Snapshot Provenance \(Meteomatics\)/i)).toBeVisible();
    await expect(page.getByText(/Brahmaputra-Ganges Delta · forecast_24h \(FORECAST\)/i)).toBeVisible();
  });
});

test.describe('Leaderboard States & Supabase RPC Mocking', () => {
  test('renders populated PROVISIONAL and VERIFIED standings from mocked RPC response', async ({
    page,
  }) => {
    await page.route('**/api/evaluate-mission', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          report: {
            evaluationId: 'eval_e2e_mock',
            evaluationVersion: '2026.11-v1',
            model: 'gpt-4.1-mini',
            snapshotHash: 'e2e-hash-001',
            overallScore: 86.5,
            outcome: 'SUCCESS',
            executiveSummary: 'E2E mocked NASA-informed evaluation summary.',
            categories: {
              science: { weight: 35, score: 88, weightedPoints: 30.8, strengths: ['Objective met'], deductions: [] },
              reliability: { weight: 25, score: 90, weightedPoints: 22.5, strengths: ['High reliability'], deductions: [] },
              resource_efficiency: { weight: 15, score: 84, weightedPoints: 12.6, strengths: ['Balanced margins'], deductions: [] },
              data_comms: { weight: 15, score: 85, weightedPoints: 12.75, strengths: ['Positive link margin'], deductions: [] },
              risk_management: { weight: 10, score: 78.5, weightedPoints: 7.85, strengths: ['ODAR compliant'], deductions: [] },
            },
            criticalFailures: [],
            minorFindings: [],
            engineeringRecommendations: [],
            nasaReferences: [
              {
                code: 'NASA/SP-2016-6105 Rev2',
                title: 'NASA Systems Engineering Handbook',
                version: 'Rev 2',
                url: 'https://www.nasa.gov/reference/systems-engineering-handbook/',
                basis: 'NASA_HANDBOOK_GUIDANCE',
                relevance: 'Verification and margin guidance.',
              },
            ],
            missionSuccesses: ['Mission completed'],
            missionLimitations: [],
            evaluatedAtIso: new Date().toISOString(),
            cached: false,
          },
        }),
      });
    });

    await page.route('**/rest/v1/rpc/get_mission_leaderboard', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalCount: 2,
          entries: [
            {
              id: 'entry-verified-1',
              rank: 1,
              playerAlias: 'ARTEMIS-LEAD',
              countryCode: 'US',
              missionCode: 'LUNAR SCOUT',
              difficulty: 'STANDARD',
              seasonCode: '2026-S1',
              configurationName: 'GNG Baseline',
              totalScore: 98.4,
              scienceScore: 34.5,
              reliabilityScore: 24.5,
              efficiencyScore: 15.0,
              commsScore: 14.4,
              riskCollabScore: 10.0,
              grade: 'S',
              outcome: 'SUCCESS',
              completionDurationSec: 86400,
              dataDownlinkedGb: 62.4,
              regionsMappedCount: 3,
              isVerified: true,
              verificationStatus: 'VERIFIED',
              achievedAtIso: '2026-11-15T10:00:00Z',
            },
            {
              id: 'entry-provisional-2',
              rank: 2,
              playerAlias: 'SELENE-02',
              countryCode: 'JP',
              missionCode: 'LUNAR SCOUT',
              difficulty: 'STANDARD',
              seasonCode: '2026-S1',
              configurationName: 'Lunar Polar Custom',
              totalScore: 94.1,
              scienceScore: 32.0,
              reliabilityScore: 23.1,
              efficiencyScore: 14.5,
              commsScore: 14.5,
              riskCollabScore: 10.0,
              grade: 'S',
              outcome: 'SUCCESS',
              completionDurationSec: 86400,
              dataDownlinkedGb: 55.2,
              regionsMappedCount: 3,
              isVerified: false,
              verificationStatus: 'PROVISIONAL',
              achievedAtIso: '2026-11-15T11:00:00Z',
            },
          ],
          playerEntry: null,
          nearbyEntries: [],
        }),
      });
    });

    await page.goto('/debrief');
    await expect(page.getByText('ARTEMIS-LEAD')).toBeVisible();
    await expect(page.getByText('SELENE-02')).toBeVisible();
    await expect(page.getByText('VERIFIED', { exact: true })).toBeVisible();
    await expect(page.getByText('PROVISIONAL', { exact: true })).toBeVisible();
  });

  test('renders empty standings when mocked RPC returns zero entries', async ({ page }) => {
    await page.route('**/api/evaluate-mission', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          report: {
            evaluationId: 'eval_e2e_mock',
            evaluationVersion: '2026.11-v1',
            model: 'gpt-4.1-mini',
            snapshotHash: 'e2e-hash-001',
            overallScore: 86.5,
            outcome: 'SUCCESS',
            executiveSummary: 'E2E mocked NASA-informed evaluation summary.',
            categories: {
              science: { weight: 35, score: 88, weightedPoints: 30.8, strengths: ['Objective met'], deductions: [] },
              reliability: { weight: 25, score: 90, weightedPoints: 22.5, strengths: ['High reliability'], deductions: [] },
              resource_efficiency: { weight: 15, score: 84, weightedPoints: 12.6, strengths: ['Balanced margins'], deductions: [] },
              data_comms: { weight: 15, score: 85, weightedPoints: 12.75, strengths: ['Positive link margin'], deductions: [] },
              risk_management: { weight: 10, score: 78.5, weightedPoints: 7.85, strengths: ['ODAR compliant'], deductions: [] },
            },
            criticalFailures: [],
            minorFindings: [],
            engineeringRecommendations: [],
            nasaReferences: [
              {
                code: 'NASA/SP-2016-6105 Rev2',
                title: 'NASA Systems Engineering Handbook',
                version: 'Rev 2',
                url: 'https://www.nasa.gov/reference/systems-engineering-handbook/',
                basis: 'NASA_HANDBOOK_GUIDANCE',
                relevance: 'Verification and margin guidance.',
              },
            ],
            missionSuccesses: ['Mission completed'],
            missionLimitations: [],
            evaluatedAtIso: new Date().toISOString(),
            cached: false,
          },
        }),
      });
    });

    await page.route('**/rest/v1/rpc/get_mission_leaderboard', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalCount: 0,
          entries: [],
          playerEntry: null,
          nearbyEntries: [],
        }),
      });
    });

    await page.goto('/debrief');
    await expect(page.getByText(/No verified runs recorded yet/i)).toBeVisible();
  });

  test('renders concise RPC error with expandable technical details on PGRST202 schema cache failure', async ({
    page,
  }) => {
    await page.route('**/api/evaluate-mission', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          report: {
            evaluationId: 'eval_e2e_mock',
            evaluationVersion: '2026.11-v1',
            model: 'gpt-4.1-mini',
            snapshotHash: 'e2e-hash-001',
            overallScore: 86.5,
            outcome: 'SUCCESS',
            executiveSummary: 'E2E mocked NASA-informed evaluation summary.',
            categories: {
              science: { weight: 35, score: 88, weightedPoints: 30.8, strengths: ['Objective met'], deductions: [] },
              reliability: { weight: 25, score: 90, weightedPoints: 22.5, strengths: ['High reliability'], deductions: [] },
              resource_efficiency: { weight: 15, score: 84, weightedPoints: 12.6, strengths: ['Balanced margins'], deductions: [] },
              data_comms: { weight: 15, score: 85, weightedPoints: 12.75, strengths: ['Positive link margin'], deductions: [] },
              risk_management: { weight: 10, score: 78.5, weightedPoints: 7.85, strengths: ['ODAR compliant'], deductions: [] },
            },
            criticalFailures: [],
            minorFindings: [],
            engineeringRecommendations: [],
            nasaReferences: [
              {
                code: 'NASA/SP-2016-6105 Rev2',
                title: 'NASA Systems Engineering Handbook',
                version: 'Rev 2',
                url: 'https://www.nasa.gov/reference/systems-engineering-handbook/',
                basis: 'NASA_HANDBOOK_GUIDANCE',
                relevance: 'Verification and margin guidance.',
              },
            ],
            missionSuccesses: ['Mission completed'],
            missionLimitations: [],
            evaluatedAtIso: new Date().toISOString(),
            cached: false,
          },
        }),
      });
    });

    await page.route('**/rest/v1/rpc/get_mission_leaderboard', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'PGRST202',
          details: null,
          hint: null,
          message:
            'Could not find the function public.get_mission_leaderboard(p_country_code, p_difficulty, p_limit, p_mission_code, p_offset, p_player_token, p_season_code) in the schema cache',
        }),
      });
    });

    await page.goto('/debrief');
    await expect(
      page.getByText('Leaderboard unavailable: RPC function not found.', { exact: true })
    ).toBeVisible();
    await page.getByText('Technical details').click();
    await expect(page.getByText(/in the schema cache/i)).toBeVisible();
  });

  test('renders temporary connection error when leaderboard network request fails', async ({
    page,
  }) => {
    await page.route('**/api/evaluate-mission', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          report: {
            evaluationId: 'eval_e2e_mock',
            evaluationVersion: '2026.11-v1',
            model: 'gpt-4.1-mini',
            snapshotHash: 'e2e-hash-001',
            overallScore: 86.5,
            outcome: 'SUCCESS',
            executiveSummary: 'E2E mocked NASA-informed evaluation summary.',
            categories: {
              science: { weight: 35, score: 88, weightedPoints: 30.8, strengths: ['Objective met'], deductions: [] },
              reliability: { weight: 25, score: 90, weightedPoints: 22.5, strengths: ['High reliability'], deductions: [] },
              resource_efficiency: { weight: 15, score: 84, weightedPoints: 12.6, strengths: ['Balanced margins'], deductions: [] },
              data_comms: { weight: 15, score: 85, weightedPoints: 12.75, strengths: ['Positive link margin'], deductions: [] },
              risk_management: { weight: 10, score: 78.5, weightedPoints: 7.85, strengths: ['ODAR compliant'], deductions: [] },
            },
            criticalFailures: [],
            minorFindings: [],
            engineeringRecommendations: [],
            nasaReferences: [
              {
                code: 'NASA/SP-2016-6105 Rev2',
                title: 'NASA Systems Engineering Handbook',
                version: 'Rev 2',
                url: 'https://www.nasa.gov/reference/systems-engineering-handbook/',
                basis: 'NASA_HANDBOOK_GUIDANCE',
                relevance: 'Verification and margin guidance.',
              },
            ],
            missionSuccesses: ['Mission completed'],
            missionLimitations: [],
            evaluatedAtIso: new Date().toISOString(),
            cached: false,
          },
        }),
      });
    });

    await page.route('**/rest/v1/rpc/get_mission_leaderboard', async (route) => {
      await route.abort('failed');
    });

    await page.goto('/debrief');
    await expect(
      page.getByText('Leaderboard temporarily unavailable: unable to reach server.')
    ).toBeVisible();
  });

  test('registers window.__GNG_DIAGNOSTICS__ in production build and returns safe diagnostics', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('earth-scene')).toBeVisible();

    const result = await page.evaluate(() => {
      const w = window as unknown as { __GNG_DIAGNOSTICS__?: () => unknown };
      return {
        fnType: typeof w.__GNG_DIAGNOSTICS__,
        payload: typeof w.__GNG_DIAGNOSTICS__ === 'function' ? w.__GNG_DIAGNOSTICS__() : null,
      };
    });

    expect(result.fnType).toBe('function');
    expect(result.payload).toBeTruthy();
    const payload = result.payload as {
      supabase: {
        configured: boolean;
        hasUrl: boolean;
        hasPublishableKey: boolean;
        keyKind: string;
      };
      planetaryTextures: Array<{ body: string; materialMode: string; status: string }>;
    };
    expect(typeof payload.supabase.configured).toBe('boolean');
    expect(typeof payload.supabase.hasUrl).toBe('boolean');
    expect(typeof payload.supabase.hasPublishableKey).toBe('boolean');
    expect(payload.planetaryTextures.map((p) => p.body)).toEqual([
      'EARTH',
      'MOON',
      'MARS',
      'ASTEROID',
    ]);

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain('sb_publishable_');
    expect(serialized).not.toContain('sb_secret_');
    expect(serialized).not.toContain('supabase.co');
  });
});

import { expect, test } from '@playwright/test';

test.describe('GO / NO-GO — 6-Stage FLOODWATCH End-to-End Mission Flow', () => {
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

    // Stage 1 — Mission Briefing (integrated startup experience over 3D Earth + Moon)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByText(/GO \/ NO-GO/i).first()).toBeVisible();
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(page.getByTestId('shell-gate-status')).toContainText('GO');

    // Switch difficulty to HARD -> cost cap drops to $87.4M, then back to STANDARD
    await page.getByRole('radio', { name: /Hard/i }).click();
    await expect(page.getByText('$87.4M', { exact: true })).toBeVisible();
    await page.getByRole('radio', { name: /Standard/i }).click();
    await expect(page.getByText('$95.0M', { exact: true })).toBeVisible();

    await page.screenshot({ path: '/tmp/gng-e2e-stage1-briefing.png' });

    // Stage 2 — Mission Architecture (no Save Config control, NO-GO triggers gate)
    await page.getByRole('button', { name: /Start Mission Architecture/i }).click();
    await expect(page).toHaveURL(/\/architecture/);
    await expect(page.getByRole('button', { name: /Save Config/i })).toHaveCount(0);

    await page.getByRole('button', { name: /6U CubeSat Optical Scout/i }).click();
    await expect(page.getByTestId('shell-gate-status')).toContainText('NO-GO');

    // Stage 3 — Orbit & Launch Planning
    await page.getByRole('link', { name: /^ORBIT & LAUNCH$/i }).click();
    await expect(page).toHaveURL(/\/orbit/);
    await expect(page.getByLabel(/Perigee orbital altitude in kilometers/i)).toBeVisible();
    await expect(page.getByLabel(/Apogee orbital altitude in kilometers/i)).toBeVisible();

    // Attempt Stage 5 navigation while NO-GO -> blocked by Launch Hold guard
    await page
      .locator('nav[aria-label="Mission Gameplay Stages"]')
      .getByRole('link', { name: /05.*Operations/i })
      .click();
    await expect(page).toHaveURL(/\/operations/);
    await expect(page.getByText(/LAUNCH HOLD · NO-GO FLIGHT READINESS VERDICT/i)).toBeVisible();

    // Stage 4 — Mission Verification: strict NO-GO lock
    await page.getByRole('link', { name: /Review Verification Gates/i }).click();
    await expect(page).toHaveURL(/\/verification/);
    await expect(page.getByRole('button', { name: /LAUNCH LOCKED — NO-GO/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /INITIATE LAUNCH SEQUENCE/i })).toHaveCount(0);

    // Recover spacecraft via Stage 2 Baseline GO preset
    await page.getByRole('link', { name: /RESOLVE IN ARCHITECTURE/i }).click();
    await expect(page).toHaveURL(/\/architecture/);
    await page.getByRole('button', { name: /FLOODWATCH Baseline SAR\+SWIR/i }).click();
    await expect(page.getByTestId('shell-gate-status')).toContainText('GO');

    // Return to Stage 4 -> Launch Transition Overlay -> Stage 5 Operations
    await page.getByRole('link', { name: /04.*Verification/i }).click();
    await expect(page).toHaveURL(/\/verification/);
    await page.screenshot({ path: '/tmp/gng-e2e-stage4-verification.png' });

    await page.getByRole('button', { name: /INITIATE LAUNCH SEQUENCE/i }).click();
    await expect(page.getByRole('dialog', { name: /Integrated Launch Sequence/i })).toBeVisible();
    await page.getByRole('button', { name: /Enter Mission Operations/i }).click();

    // Stage 5 — Mission Operations: toggle payload, step +24h, complete to Debrief
    await expect(page).toHaveURL(/\/operations/);
    await page.getByRole('button', { name: /\+24H SIM/i }).click();
    await page.getByRole('button', { name: /COMPLETE & DEBRIEF/i }).click();

    // Stage 6 — Mission Debrief & Embedded International Leaderboard
    await expect(page).toHaveURL(/\/debrief/);
    await expect(page.getByText(/Overall Normalized Mission Score/i)).toBeVisible();
    await expect(page.getByLabel(/Replay mission telemetry timeline/i)).toBeVisible();
    await expect(page.getByText(/International Leaderboard Offline/i)).toBeVisible();
    await page.getByRole('button', { name: /Country \/ Region/i }).click();
    await expect(page.getByLabel(/Filter country/i)).toBeVisible();
    await page.screenshot({ path: '/tmp/gng-e2e-stage6-debrief.png', fullPage: true });

    // Start New Attempt resets cleanly to Stage 1
    await page.getByRole('button', { name: /START NEW ATTEMPT/i }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('shell-gate-status')).toContainText('GO');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });

  test('renders cleanly across desktop, tablet, and mobile viewports with zero horizontal overflow or extra nav routes', async ({
    page,
  }) => {
    const viewports = [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'tablet', width: 820, height: 1180 },
      { name: 'mobile', width: 390, height: 844 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      // Exactly 6 nav stage links & zero legacy <aside>
      await expect(page.locator('aside')).toHaveCount(0);
      await expect(page.locator('nav[aria-label="Mission Gameplay Stages"] a')).toHaveCount(6);

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

    // Stage 1: Inspect Satellite EO Imagery modal
    await page.getByRole('button', { name: /Inspect Satellite EO Imagery/i }).click();
    await expect(page.getByRole('dialog', { name: /Earth Observation Reference Data/i })).toBeVisible();
    await expect(page.getByText('S1D_IW_GRDH_1SDV_E2E_TEST_rtc')).toBeVisible();
    await expect(page.getByText('S2A_MSIL2A_E2E_TEST')).toBeVisible();
    await expect(page.getByText(/83.9% \(eo:cloud_cover\)/i)).toBeVisible();
    await page.getByRole('button', { name: /Close EO imagery modal/i }).click();

    // Stage 4 -> Stage 5 -> Inspect EO Scene -> Stage 6 Debrief provenance
    await page.goto('/verification');
    await page.getByRole('button', { name: /INITIATE LAUNCH SEQUENCE/i }).click();
    await page.getByRole('button', { name: /Enter Mission Operations/i }).click();
    await expect(page).toHaveURL(/\/operations/);

    await page.getByRole('button', { name: /EO Scene/i }).click();
    await expect(
      page.getByRole('dialog', { name: /Orbital Operations Earth Observation Context/i })
    ).toBeVisible();
    await expect(page.getByText('S1D_IW_GRDH_1SDV_E2E_TEST_rtc')).toBeVisible();
    await page.getByRole('button', { name: /Close EO scene modal/i }).click();

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

    // Stage 1: Open Basin Weather modal and inspect Current + Forecast + Fallback
    await page.getByRole('button', { name: /Basin Weather/i }).click();
    await expect(page.getByRole('dialog', { name: /FLOODWATCH Basin Weather Context/i })).toBeVisible();
    await expect(page.getByText('11.2 mm')).toBeVisible();
    await expect(page.getByText('CURRENT ANALYSIS')).toBeVisible();

    await page.getByRole('button', { name: /\+24h Outlook/i }).click();
    await expect(page.getByText('MODEL FORECAST')).toBeVisible();

    await page.getByRole('button', { name: /Danube-Tisza Confluence/i }).click();
    await expect(page.getByText(/Fallback State · UNCONFIGURED/i)).toBeVisible();
    await page.getByRole('button', { name: /Close basin weather modal/i }).click();

    // Stage 4 -> Stage 5 -> Operations Weather -> Stage 6 Debrief provenance
    await page.goto('/verification');
    await page.getByRole('button', { name: /INITIATE LAUNCH SEQUENCE/i }).click();
    await page.getByRole('button', { name: /Enter Mission Operations/i }).click();
    await expect(page).toHaveURL(/\/operations/);

    await page.getByRole('button', { name: /^Weather$/i }).click();
    await expect(
      page.getByRole('dialog', { name: /Orbital Operations Basin Weather Context/i }),
    ).toBeVisible();
    await expect(page.getByText('11.2 mm')).toBeVisible();
    await page.getByRole('button', { name: /Close operations weather modal/i }).click();

    await page.getByRole('button', { name: /COMPLETE & DEBRIEF/i }).click();
    await expect(page).toHaveURL(/\/debrief/);
    await page.getByRole('button', { name: /Expand Technical Debrief & KPP Matrix/i }).click();
    await expect(page.getByText(/Weather Snapshot Provenance \(Meteomatics\)/i)).toBeVisible();
    await expect(page.getByText(/Brahmaputra-Ganges Delta · forecast_24h \(FORECAST\)/i)).toBeVisible();
  });
});

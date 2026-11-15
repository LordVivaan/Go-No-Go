import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from '../../functions/api/weather';
import {
  handleWeatherRequest,
  resetServerWeatherStateForTests,
} from '../../src/server/meteomaticsWeatherHandler';
import {
  clearClientWeatherCache,
  clearRecordedWeatherUsage,
  fetchBasinWeather,
  getRecordedWeatherUsage,
} from '../../src/services/weatherService';

function buildMeteomaticsPayload(timestamps: string[], valuesOffset = 0) {
  const makeDates = (baseValue: number) =>
    timestamps.map((date, idx) => ({
      date,
      value: Number((baseValue + idx * 1.5 + valuesOffset).toFixed(2)),
    }));

  return {
    version: '3.0',
    user: 'internal_test_user',
    dateGenerated: '2026-11-15T06:00:00Z',
    status: 'OK',
    data: [
      {
        parameter: 't_2m:C',
        coordinates: [{ lat: 23.8, lon: 90.4, dates: makeDates(27.4) }],
      },
      {
        parameter: 'precip_1h:mm',
        coordinates: [{ lat: 23.8, lon: 90.4, dates: makeDates(4.2) }],
      },
      {
        parameter: 'wind_speed_10m:ms',
        coordinates: [{ lat: 23.8, lon: 90.4, dates: makeDates(5.8) }],
      },
      {
        parameter: 'total_cloud_cover:p',
        coordinates: [{ lat: 23.8, lon: 90.4, dates: makeDates(82.0) }],
      },
      {
        parameter: 'global_rad:W',
        coordinates: [{ lat: 23.8, lon: 90.4, dates: makeDates(410.0) }],
      },
    ],
  };
}

describe('Meteomatics server weather handler & Cloudflare Pages function', () => {
  const FIXED_NOW_MS = Date.parse('2026-11-15T06:12:00Z');
  const TEST_ENV = {
    METEOMATICS_USERNAME: 'secret-user-alpha',
    METEOMATICS_PASSWORD: 'secret-password-omega',
  };

  beforeEach(() => {
    resetServerWeatherStateForTests();
    clearClientWeatherCache();
    clearRecordedWeatherUsage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('handles a valid basin request via Cloudflare Pages onRequestGet and returns normalized units & provenance', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toContain('https://api.meteomatics.com/');
      expect(url).toContain('t_2m:C,precip_1h:mm,wind_speed_10m:ms,total_cloud_cover:p,global_rad:W');
      expect(url).toContain('/23.8,90.4/json?model=mix');
      const authHeader = (init?.headers as Record<string, string>)?.Authorization;
      expect(authHeader).toMatch(/^Basic /);

      return new Response(
        JSON.stringify(buildMeteomaticsPayload(['2026-11-15T06:00:00Z'])),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });

    vi.stubGlobal('fetch', fetchSpy);

    const req = new Request('https://go-no-go.pages.dev/api/weather?basin=basin-brahmaputra');
    const res = await onRequestGet({
      request: req,
      env: TEST_ENV,
      waitUntil: () => undefined,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('max-age=1800');
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.snapshot.basinId).toBe('basin-brahmaputra');
    expect(body.snapshot.basinName).toBe('Brahmaputra-Ganges Delta');
    expect(body.snapshot.classification).toBe('CURRENT_ANALYSIS');
    expect(body.snapshot.current.metrics).toEqual({
      temperature2mC: 27.4,
      precip1hMm: 4.2,
      windSpeed10mMs: 5.8,
      totalCloudCoverPct: 82,
      globalSolarRadiationWm2: 410,
    });
    expect(body.snapshot.source.units).toEqual({
      temperature2m: '°C',
      precip1h: 'mm',
      windSpeed10m: 'm/s',
      totalCloudCover: '%',
      globalSolarRadiation: 'W/m²',
    });
    const rawSerialized = JSON.stringify(body);
    expect(rawSerialized).not.toContain(TEST_ENV.METEOMATICS_USERNAME);
    expect(rawSerialized).not.toContain(TEST_ENV.METEOMATICS_PASSWORD);
  });

  it('rejects invalid basin identifiers, arbitrary coordinates, excessive dates, and non-GET methods', async () => {
    const fetchSpy = vi.fn();

    const invalidBasin = await handleWeatherRequest(
      new Request('https://example.com/api/weather?basin=amazon-delta'),
      TEST_ENV,
      { fetchFn: fetchSpy, nowMs: () => FIXED_NOW_MS, edgeCache: null },
    );
    expect(invalidBasin.status).toBe(400);
    expect((await invalidBasin.json()).error.code).toBe('INVALID_BASIN');

    const arbitraryCoords = await handleWeatherRequest(
      new Request('https://example.com/api/weather?basin=basin-mekong&lat=51.5&lon=-0.1'),
      TEST_ENV,
      { fetchFn: fetchSpy, nowMs: () => FIXED_NOW_MS, edgeCache: null },
    );
    expect(arbitraryCoords.status).toBe(400);
    expect((await arbitraryCoords.json()).error.code).toBe('ARBITRARY_COORDINATES_REJECTED');

    const arbitraryDates = await handleWeatherRequest(
      new Request(
        'https://example.com/api/weather?basin=basin-mekong&start=2026-01-01T00:00:00Z&end=2026-02-01T00:00:00Z',
      ),
      TEST_ENV,
      { fetchFn: fetchSpy, nowMs: () => FIXED_NOW_MS, edgeCache: null },
    );
    expect(arbitraryDates.status).toBe(400);
    expect((await arbitraryDates.json()).error.code).toBe('INVALID_DATE_RANGE');

    const postMethod = await handleWeatherRequest(
      new Request('https://example.com/api/weather?basin=basin-danube', {
        method: 'POST',
      }),
      TEST_ENV,
      { fetchFn: fetchSpy, nowMs: () => FIXED_NOW_MS, edgeCache: null },
    );
    expect(postMethod.status).toBe(405);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 503 WEATHER_CREDENTIALS_MISSING without contacting upstream when secrets are absent', async () => {
    const fetchSpy = vi.fn();
    const res = await handleWeatherRequest(
      new Request('https://example.com/api/weather?basin=basin-mississippi'),
      {},
      { fetchFn: fetchSpy, nowMs: () => FIXED_NOW_MS, edgeCache: null },
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('WEATHER_CREDENTIALS_MISSING');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('handles upstream 401 and 403 auth failures without retries and without leaking secrets', async () => {
    const fetch401 = vi.fn(async () => new Response('Unauthorized', { status: 401 }));
    const res401 = await handleWeatherRequest(
      new Request('https://example.com/api/weather?basin=basin-danube'),
      TEST_ENV,
      { fetchFn: fetch401, nowMs: () => FIXED_NOW_MS, edgeCache: null },
    );
    expect(res401.status).toBe(502);
    const body401 = await res401.json();
    expect(body401.error.code).toBe('UPSTREAM_AUTH_FAILED');
    expect(fetch401).toHaveBeenCalledTimes(1);
    const text401 = JSON.stringify(body401);
    expect(text401).not.toContain(TEST_ENV.METEOMATICS_USERNAME);
    expect(text401).not.toContain(TEST_ENV.METEOMATICS_PASSWORD);

    const fetch403 = vi.fn(async () => new Response('Forbidden', { status: 403 }));
    const res403 = await handleWeatherRequest(
      new Request('https://example.com/api/weather?basin=basin-mekong'),
      TEST_ENV,
      { fetchFn: fetch403, nowMs: () => FIXED_NOW_MS, edgeCache: null },
    );
    expect(res403.status).toBe(502);
    expect((await res403.json()).error.code).toBe('UPSTREAM_FORBIDDEN');
    expect(fetch403).toHaveBeenCalledTimes(1);
  });

  it('handles upstream 429 rate limiting and activates local isolate cooldown to protect quota', async () => {
    let now = FIXED_NOW_MS;
    const fetch429 = vi.fn(
      async () =>
        new Response('Too Many Requests', {
          status: 429,
          headers: { 'Retry-After': '180' },
        }),
    );

    const first = await handleWeatherRequest(
      new Request('https://example.com/api/weather?basin=basin-brahmaputra'),
      TEST_ENV,
      { fetchFn: fetch429, nowMs: () => now, edgeCache: null },
    );
    expect(first.status).toBe(429);
    const firstBody = await first.json();
    expect(firstBody.error.code).toBe('UPSTREAM_RATE_LIMITED');
    expect(firstBody.error.retryAfterSeconds).toBe(180);

    // Subsequent call within cooldown must NOT call Meteomatics again.
    now += 30_000;
    const second = await handleWeatherRequest(
      new Request('https://example.com/api/weather?basin=basin-danube'),
      TEST_ENV,
      { fetchFn: fetch429, nowMs: () => now, edgeCache: null },
    );
    expect(second.status).toBe(429);
    expect(fetch429).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent requests and serves isolate cache hits on repeat queries', async () => {
    let calls = 0;
    const fetchSpy = vi.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return new Response(
        JSON.stringify(buildMeteomaticsPayload(['2026-11-15T06:00:00Z'])),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const [resA, resB] = await Promise.all([
      handleWeatherRequest(
        new Request('https://example.com/api/weather?basin=basin-danube'),
        TEST_ENV,
        { fetchFn: fetchSpy, nowMs: () => FIXED_NOW_MS, edgeCache: null },
      ),
      handleWeatherRequest(
        new Request('https://example.com/api/weather?basin=basin-danube'),
        TEST_ENV,
        { fetchFn: fetchSpy, nowMs: () => FIXED_NOW_MS, edgeCache: null },
      ),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(calls).toBe(1);

    // Third call hits isolate cache
    const resC = await handleWeatherRequest(
      new Request('https://example.com/api/weather?basin=basin-danube'),
      TEST_ENV,
      { fetchFn: fetchSpy, nowMs: () => FIXED_NOW_MS + 60_000, edgeCache: null },
    );
    expect(resC.status).toBe(200);
    expect(resC.headers.get('x-weather-cache')).toBe('HIT_ISOLATE_CACHE');
    expect(calls).toBe(1);
  });

  it('returns 504 UPSTREAM_TIMEOUT when upstream request exceeds timeout', async () => {
    const slowFetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted.');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    const res = await handleWeatherRequest(
      new Request('https://example.com/api/weather?basin=basin-mekong'),
      TEST_ENV,
      {
        fetchFn: slowFetch as unknown as typeof fetch,
        nowMs: () => FIXED_NOW_MS,
        timeoutMs: 15,
        edgeCache: null,
      },
    );
    expect(res.status).toBe(504);
    expect((await res.json()).error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('performs at most one bounded retry on transient 503 upstream errors', async () => {
    let attempt = 0;
    const transientFetch = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        return new Response('Bad Gateway', { status: 503 });
      }
      return new Response(
        JSON.stringify(buildMeteomaticsPayload(['2026-11-15T06:00:00Z'])),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const recovered = await handleWeatherRequest(
      new Request('https://example.com/api/weather?basin=basin-mississippi'),
      TEST_ENV,
      {
        fetchFn: transientFetch,
        nowMs: () => FIXED_NOW_MS,
        retryDelayMs: 0,
        edgeCache: null,
      },
    );
    expect(recovered.status).toBe(200);
    expect(attempt).toBe(2);

    const persistent502 = vi.fn(async () => new Response('Down', { status: 502 }));
    const failed = await handleWeatherRequest(
      new Request('https://example.com/api/weather?basin=basin-mekong'),
      TEST_ENV,
      {
        fetchFn: persistent502,
        nowMs: () => FIXED_NOW_MS,
        retryDelayMs: 0,
        edgeCache: null,
      },
    );
    expect(failed.status).toBe(502);
    expect((await failed.json()).error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(persistent502).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed upstream JSON or schema and avoids leaking credentials even if echoed upstream', async () => {
    const malformedJsonFetch = vi.fn(
      async () => new Response('{not-valid-json', { status: 200 }),
    );
    const badJsonRes = await handleWeatherRequest(
      new Request('https://example.com/api/weather?basin=basin-danube'),
      TEST_ENV,
      { fetchFn: malformedJsonFetch, nowMs: () => FIXED_NOW_MS, edgeCache: null },
    );
    expect(badJsonRes.status).toBe(502);
    expect((await badJsonRes.json()).error.code).toBe('MALFORMED_UPSTREAM_RESPONSE');

    const badSchemaFetch = vi.fn(async () =>
      new Response(JSON.stringify({ status: 'OK', data: [] }), { status: 200 }),
    );
    const badSchemaRes = await handleWeatherRequest(
      new Request('https://example.com/api/weather?basin=basin-mekong'),
      TEST_ENV,
      { fetchFn: badSchemaFetch, nowMs: () => FIXED_NOW_MS, edgeCache: null },
    );
    expect(badSchemaRes.status).toBe(502);
    expect((await badSchemaRes.json()).error.code).toBe('MALFORMED_UPSTREAM_RESPONSE');

    const leakyErrFetch = vi.fn(async () => {
      throw new Error(
        `Proxy error with Basic c2VjcmV0 and ${TEST_ENV.METEOMATICS_USERNAME} / ${TEST_ENV.METEOMATICS_PASSWORD}`,
      );
    });
    const scrubbedRes = await handleWeatherRequest(
      new Request('https://example.com/api/weather?basin=basin-brahmaputra'),
      TEST_ENV,
      { fetchFn: leakyErrFetch, nowMs: () => FIXED_NOW_MS, edgeCache: null },
    );
    const scrubbedText = await scrubbedRes.text();
    expect(scrubbedText).not.toContain(TEST_ENV.METEOMATICS_USERNAME);
    expect(scrubbedText).not.toContain(TEST_ENV.METEOMATICS_PASSWORD);
    expect(scrubbedText).not.toContain('Basic c2VjcmV0');
    expect(scrubbedText).toContain('[REDACTED]');
  });

  it('labels forecast vs historical time windows accurately', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(String(input));
      if (url.includes('2026-11-15T06:00:00Z--2026-11-16T06:00:00Z:PT6H')) {
        return new Response(
          JSON.stringify(
            buildMeteomaticsPayload([
              '2026-11-15T06:00:00Z',
              '2026-11-15T12:00:00Z',
              '2026-11-16T06:00:00Z',
            ]),
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify(
          buildMeteomaticsPayload([
            '2026-11-14T06:00:00Z',
            '2026-11-15T00:00:00Z',
          ]),
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const forecastRes = await handleWeatherRequest(
      new Request('https://example.com/api/weather?basin=basin-brahmaputra&window=forecast_24h'),
      TEST_ENV,
      { fetchFn: fetchSpy, nowMs: () => FIXED_NOW_MS, edgeCache: null },
    );
    const forecastBody = await forecastRes.json();
    expect(forecastBody.snapshot.classification).toBe('FORECAST');
    expect(forecastBody.snapshot.series[0].classification).toBe('CURRENT_ANALYSIS');
    expect(forecastBody.snapshot.series[1].classification).toBe('FORECAST');
    expect(forecastBody.snapshot.series[2].classification).toBe('FORECAST');

    const histRes = await handleWeatherRequest(
      new Request('https://example.com/api/weather?basin=basin-brahmaputra&window=historical_24h'),
      TEST_ENV,
      { fetchFn: fetchSpy, nowMs: () => FIXED_NOW_MS, edgeCache: null },
    );
    const histBody = await histRes.json();
    expect(histBody.snapshot.classification).toBe('HISTORICAL');
    expect(histBody.snapshot.series.every((s: { classification: string }) => s.classification === 'HISTORICAL')).toBe(
      true,
    );
  });

  it('client weatherService fetches /api/weather safely, records provenance, and falls back honestly', async () => {
    const livePayload = {
      ok: true,
      snapshot: {
        basinId: 'basin-mekong',
        basinName: 'Lower Mekong Floodplain',
        location: { lat: 10.6, lon: 105.5 },
        windowMode: 'current',
        classification: 'CURRENT_ANALYSIS',
        classificationNote: 'Blended analysis',
        dataTimeUtc: '2026-11-15T06:00:00Z',
        retrievedAtUtc: '2026-11-15T06:12:00Z',
        current: {
          validTimeUtc: '2026-11-15T06:00:00Z',
          classification: 'CURRENT_ANALYSIS',
          metrics: {
            temperature2mC: 29.1,
            precip1hMm: 8.4,
            windSpeed10mMs: 3.9,
            totalCloudCoverPct: 76,
            globalSolarRadiationWm2: 512,
          },
        },
        series: [],
        caveats: ['Rainfall is not inundation.'],
        source: {
          provider: 'Meteomatics Weather API',
          model: 'mix',
          endpointHost: 'api.meteomatics.com',
          requestedParameters: ['t_2m:C'],
          units: {
            temperature2m: '°C',
            precip1h: 'mm',
            windSpeed10m: 'm/s',
            totalCloudCover: '%',
            globalSolarRadiation: 'W/m²',
          },
          cacheStatus: 'MISS',
          quotaNote: 'Bounded',
        },
      },
    };

    const clientFetch = vi.fn(
      async () =>
        new Response(JSON.stringify(livePayload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', clientFetch);

    const liveResult = await fetchBasinWeather({ basinId: 'basin-mekong' });
    expect(liveResult.status).toBe('LIVE');
    expect(getRecordedWeatherUsage()).toHaveLength(1);
    expect(getRecordedWeatherUsage()[0].precip1hMm).toBe(8.4);

    // Offline / missing proxy fallback
    clearClientWeatherCache();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: false,
              error: {
                code: 'WEATHER_CREDENTIALS_MISSING',
                message: 'Credentials not configured.',
              },
              retrievedAtUtc: '2026-11-15T06:12:00Z',
            }),
            { status: 503, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    const unconfigured = await fetchBasinWeather({ basinId: 'basin-danube' });
    expect(unconfigured.status).toBe('UNCONFIGURED');
    expect(unconfigured.fallbackBaselineCloudFraction).toBe(0.5);
  });
});

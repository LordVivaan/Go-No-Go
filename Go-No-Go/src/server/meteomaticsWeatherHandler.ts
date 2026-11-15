import {
  FLOODWATCH_BASIN_BY_ID,
  METEOMATICS_PARAMETER_SPECS,
  METEOMATICS_PARAMETER_STRING,
  isFloodwatchBasinId,
  isWeatherWindowMode,
  type FloodwatchWeatherBasin,
  type NormalizedWeatherSnapshot,
  type WeatherClassification,
  type WeatherErrorCode,
  type WeatherErrorPayload,
  type WeatherMetrics,
  type WeatherSamplePoint,
  type WeatherSuccessPayload,
  type WeatherWindowMode,
} from '../types/weather';

export interface WeatherRuntimeEnv {
  METEOMATICS_USERNAME?: string;
  METEOMATICS_PASSWORD?: string;
}

export interface EdgeCacheStore {
  match(request: Request | string): Promise<Response | undefined>;
  put(request: Request | string, response: Response): Promise<void>;
}

export interface HandleWeatherOptions {
  fetchFn?: typeof fetch;
  nowMs?: () => number;
  timeoutMs?: number;
  retryDelayMs?: number;
  edgeCache?: EdgeCacheStore | null;
  waitUntil?: (promise: Promise<unknown>) => void;
  bypassMemoryCache?: boolean;
}

interface MemoryCacheEntry {
  snapshot: NormalizedWeatherSnapshot;
  expiresAtMs: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SLOT_MS = 30 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_COOLDOWN_SECONDS = 300;
const MAX_COOLDOWN_SECONDS = 3_600;
const MAX_ISOLATE_CACHE_ENTRIES = 32;

const FORBIDDEN_COORDINATE_PARAMS = [
  'lat',
  'lon',
  'lng',
  'latitude',
  'longitude',
  'coords',
  'coord',
  'location',
  'bbox',
  'point',
  'area',
] as const;

const FORBIDDEN_DATE_PARAMS = [
  'date',
  'datetime',
  'validdate',
  'validdatetime',
  'start',
  'end',
  'from',
  'to',
  'range',
  'hours',
  'days',
  'step',
  'interval',
] as const;

const QUOTA_LIMITATION_NOTE =
  'Bounded to 4 FLOODWATCH basins, 30-min cache slots, single retry on 502/503/504, and 1,000 queries/day operational target. Per-isolate memory cache and edge cache reduce upstream calls without external KV/D1 state.';

const SCIENTIFIC_CAVEATS = [
  'Precipitation values represent modeled/blended surface rain flux (mm/h) and are NOT proof of river inundation.',
  'Total cloud cover degrades Sentinel-2 L2A optical imagery; Sentinel-1 C-band SAR penetrates cloud cover.',
  'Current Meteomatics mix output blends observational streams with NWP nowcasting; forecast horizons (+6h to +24h) are numerical predictions, not measurements.',
  'Weather snapshots provide situational awareness only and do not alter deterministic orbital mechanics or mission scoring.',
];

// Isolate-scoped state (note: Cloudflare isolates are ephemeral and not shared globally).
const isolateResponseCache = new Map<string, MemoryCacheEntry>();
const isolateInflightRequests = new Map<string, Promise<UpstreamFetchResult>>();
let isolateRateLimitCooldownUntilMs = 0;

export function resetServerWeatherStateForTests(): void {
  isolateResponseCache.clear();
  isolateInflightRequests.clear();
  isolateRateLimitCooldownUntilMs = 0;
}

function encodeBasicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function scrubSecrets(text: string, username?: string, password?: string): string {
  let sanitized = text.replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]');
  if (username && username.length > 0) {
    sanitized = sanitized.split(username).join('[REDACTED_USER]');
  }
  if (password && password.length > 0) {
    sanitized = sanitized.split(password).join('[REDACTED_SECRET]');
  }
  return sanitized;
}

function jsonResponse(
  status: number,
  body: WeatherSuccessPayload | WeatherErrorPayload,
  extraHeaders?: Record<string, string>,
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...(extraHeaders ?? {}),
  });
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(
  status: number,
  code: WeatherErrorCode,
  message: string,
  retrievedAtUtc: string,
  retryAfterSeconds?: number,
  extraHeaders?: Record<string, string>,
): Response {
  const payload: WeatherErrorPayload = {
    ok: false,
    error: {
      code,
      message,
      ...(typeof retryAfterSeconds === 'number' ? { retryAfterSeconds } : {}),
    },
    retrievedAtUtc,
  };
  return jsonResponse(status, payload, {
    'Cache-Control': 'no-store',
    ...(typeof retryAfterSeconds === 'number'
      ? { 'Retry-After': String(retryAfterSeconds) }
      : {}),
    ...(extraHeaders ?? {}),
  });
}

function formatUtcIsoSecond(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function getSlotAnchorMs(nowMs: number): number {
  return Math.floor(nowMs / SLOT_MS) * SLOT_MS;
}

function buildMeteomaticsValidDateTime(
  anchorMs: number,
  windowMode: WeatherWindowMode,
): string {
  if (windowMode === 'forecast_24h') {
    const start = formatUtcIsoSecond(anchorMs);
    const end = formatUtcIsoSecond(anchorMs + 24 * 60 * 60 * 1000);
    return `${start}--${end}:PT6H`;
  }
  if (windowMode === 'historical_24h') {
    const start = formatUtcIsoSecond(anchorMs - 24 * 60 * 60 * 1000);
    const end = formatUtcIsoSecond(anchorMs);
    return `${start}--${end}:PT6H`;
  }
  return formatUtcIsoSecond(anchorMs);
}

function buildMeteomaticsUrl(
  basin: FloodwatchWeatherBasin,
  validDateTime: string,
): string {
  return `https://api.meteomatics.com/${encodeURIComponent(validDateTime)}/${METEOMATICS_PARAMETER_STRING}/${basin.lat},${basin.lon}/json?model=mix`;
}

function classifySample(
  sampleMs: number,
  retrievalMs: number,
  windowMode: WeatherWindowMode,
): WeatherClassification {
  if (windowMode === 'historical_24h' || sampleMs < retrievalMs - 45 * 60 * 1000) {
    return 'HISTORICAL';
  }
  if (sampleMs > retrievalMs + 15 * 60 * 1000) {
    return 'FORECAST';
  }
  return 'CURRENT_ANALYSIS';
}

function getSnapshotClassificationSummary(
  windowMode: WeatherWindowMode,
  series: readonly WeatherSamplePoint[],
): { classification: WeatherClassification; note: string } {
  if (windowMode === 'historical_24h') {
    return {
      classification: 'HISTORICAL',
      note: 'Historical meteorological archive (past 24h at 6h intervals, Meteomatics mix).',
    };
  }
  if (windowMode === 'forecast_24h') {
    const hasForecastSteps = series.some((s) => s.classification === 'FORECAST');
    return {
      classification: hasForecastSteps ? 'FORECAST' : 'CURRENT_ANALYSIS',
      note: 'Short-range 24h forecast window (6h intervals). Forecast steps represent numerical model projections, not observations.',
    };
  }
  return {
    classification: 'CURRENT_ANALYSIS',
    note: 'Current-slot blended atmospheric analysis (Meteomatics mix: observations, radar, satellite, and NWP).',
  };
}

interface MeteomaticsRawDateEntry {
  date?: unknown;
  value?: unknown;
}

interface MeteomaticsRawCoordinateEntry {
  lat?: unknown;
  lon?: unknown;
  dates?: unknown;
}

interface MeteomaticsRawParameterBlock {
  parameter?: unknown;
  coordinates?: unknown;
}

interface MeteomaticsRawPayload {
  version?: unknown;
  status?: unknown;
  data?: unknown;
}

function isFiniteOrNullNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function normalizeMeteomaticsPayload(
  rawJson: unknown,
  basin: FloodwatchWeatherBasin,
  windowMode: WeatherWindowMode,
  retrievedAtMs: number,
): NormalizedWeatherSnapshot {
  if (!rawJson || typeof rawJson !== 'object') {
    throw new Error('Meteomatics JSON root is not an object');
  }
  const payload = rawJson as MeteomaticsRawPayload;
  if (typeof payload.status === 'string' && payload.status.toUpperCase() !== 'OK') {
    throw new Error(`Meteomatics returned non-OK status: ${payload.status}`);
  }
  if (!Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error('Meteomatics JSON missing non-empty data array');
  }

  const byTimestamp = new Map<string, Partial<WeatherMetrics>>();

  for (const item of payload.data as MeteomaticsRawParameterBlock[]) {
    if (!item || typeof item !== 'object' || typeof item.parameter !== 'string') {
      throw new Error('Malformed parameter block in Meteomatics response');
    }
    if (!Array.isArray(item.coordinates) || item.coordinates.length === 0) {
      throw new Error(`Missing coordinates for parameter ${item.parameter}`);
    }
    const coord = item.coordinates[0] as MeteomaticsRawCoordinateEntry;
    if (!coord || typeof coord !== 'object' || !Array.isArray(coord.dates)) {
      throw new Error(`Missing dates array for parameter ${item.parameter}`);
    }

    for (const dateEntry of coord.dates as MeteomaticsRawDateEntry[]) {
      if (
        !dateEntry ||
        typeof dateEntry !== 'object' ||
        typeof dateEntry.date !== 'string'
      ) {
        throw new Error(`Malformed date entry for parameter ${item.parameter}`);
      }
      const parsedDateMs = Date.parse(dateEntry.date);
      if (!Number.isFinite(parsedDateMs)) {
        throw new Error(`Invalid timestamp ${dateEntry.date}`);
      }
      const canonicalDate = new Date(parsedDateMs).toISOString();
      const numericValue = isFiniteOrNullNumber(dateEntry.value);
      const metrics = byTimestamp.get(canonicalDate) ?? {};

      switch (item.parameter) {
        case 't_2m:C':
          metrics.temperature2mC = numericValue;
          break;
        case 'precip_1h:mm':
          metrics.precip1hMm = numericValue;
          break;
        case 'wind_speed_10m:ms':
          metrics.windSpeed10mMs = numericValue;
          break;
        case 'total_cloud_cover:p':
          metrics.totalCloudCoverPct = numericValue;
          break;
        case 'global_rad:W':
          metrics.globalSolarRadiationWm2 = numericValue;
          break;
        default:
          break;
      }
      byTimestamp.set(canonicalDate, metrics);
    }
  }

  const sortedTimestamps = Array.from(byTimestamp.keys()).sort(
    (a, b) => Date.parse(a) - Date.parse(b),
  );

  if (sortedTimestamps.length === 0) {
    throw new Error('No valid meteorological sample timestamps returned');
  }

  const series: WeatherSamplePoint[] = sortedTimestamps.map((ts) => {
    const partial = byTimestamp.get(ts) ?? {};
    const sampleMs = Date.parse(ts);
    return {
      validTimeUtc: ts,
      classification: classifySample(sampleMs, retrievedAtMs, windowMode),
      metrics: {
        temperature2mC: partial.temperature2mC ?? null,
        precip1hMm: partial.precip1hMm ?? null,
        windSpeed10mMs: partial.windSpeed10mMs ?? null,
        totalCloudCoverPct: partial.totalCloudCoverPct ?? null,
        globalSolarRadiationWm2: partial.globalSolarRadiationWm2 ?? null,
      },
    };
  });

  // Choose primary sample: closest to retrieval for forecast (first slot), latest for historical/current.
  const primarySample =
    windowMode === 'forecast_24h' ? series[0] : series[series.length - 1];
  const summary = getSnapshotClassificationSummary(windowMode, series);

  return {
    basinId: basin.id,
    basinName: basin.name,
    location: {
      lat: basin.lat,
      lon: basin.lon,
    },
    windowMode,
    classification: summary.classification,
    classificationNote: summary.note,
    dataTimeUtc: primarySample.validTimeUtc,
    retrievedAtUtc: new Date(retrievedAtMs).toISOString(),
    current: primarySample,
    series,
    caveats: SCIENTIFIC_CAVEATS,
    source: {
      provider: 'Meteomatics Weather API',
      model: 'mix',
      endpointHost: 'api.meteomatics.com',
      requestedParameters: METEOMATICS_PARAMETER_SPECS.map((p) => p.id),
      units: {
        temperature2m: '°C',
        precip1h: 'mm',
        windSpeed10m: 'm/s',
        totalCloudCover: '%',
        globalSolarRadiation: 'W/m²',
      },
      cacheStatus: 'MISS',
      quotaNote: QUOTA_LIMITATION_NOTE,
    },
  };
}

function setIsolateCache(key: string, snapshot: NormalizedWeatherSnapshot, nowMs: number): void {
  if (isolateResponseCache.size >= MAX_ISOLATE_CACHE_ENTRIES) {
    const oldestKey = isolateResponseCache.keys().next().value;
    if (oldestKey) {
      isolateResponseCache.delete(oldestKey);
    }
  }
  isolateResponseCache.set(key, {
    snapshot,
    expiresAtMs: nowMs + CACHE_TTL_MS,
  });
}

function getIsolateCache(key: string, nowMs: number): NormalizedWeatherSnapshot | null {
  const entry = isolateResponseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAtMs <= nowMs) {
    isolateResponseCache.delete(key);
    return null;
  }
  return entry.snapshot;
}

type UpstreamFetchResult =
  | { ok: true; snapshot: NormalizedWeatherSnapshot }
  | {
      ok: false;
      status: number;
      code: WeatherErrorCode;
      message: string;
      retryAfterSeconds?: number;
    };

function parseRetryAfterSeconds(headerValue: string | null): number {
  if (!headerValue) return DEFAULT_COOLDOWN_SECONDS;
  const parsed = Number(headerValue);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(Math.max(Math.ceil(parsed), 5), MAX_COOLDOWN_SECONDS);
  }
  return DEFAULT_COOLDOWN_SECONDS;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMeteomaticsOnce(
  basin: FloodwatchWeatherBasin,
  windowMode: WeatherWindowMode,
  anchorMs: number,
  username: string,
  password: string,
  options: Required<
    Pick<HandleWeatherOptions, 'fetchFn' | 'nowMs' | 'timeoutMs' | 'retryDelayMs'>
  >,
): Promise<UpstreamFetchResult> {
  const validDateTime = buildMeteomaticsValidDateTime(anchorMs, windowMode);
  const upstreamUrl = buildMeteomaticsUrl(basin, validDateTime);
  const authHeader = `Basic ${encodeBasicAuth(username, password)}`;
  const transientStatuses = new Set([502, 503, 504]);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        options.fetchFn,
        upstreamUrl,
        {
          method: 'GET',
          headers: {
            Authorization: authHeader,
            Accept: 'application/json',
          },
        },
        options.timeoutMs,
      );
    } catch (error) {
      const isAbort =
        error instanceof Error &&
        (error.name === 'AbortError' ||
          error.message.toLowerCase().includes('abort') ||
          error.message.toLowerCase().includes('timeout'));
      if (isAbort) {
        return {
          ok: false,
          status: 504,
          code: 'UPSTREAM_TIMEOUT',
          message: `Meteomatics weather request timed out after ${options.timeoutMs} ms.`,
        };
      }
      const rawMsg = error instanceof Error ? error.message : 'Network error';
      return {
        ok: false,
        status: 502,
        code: 'UPSTREAM_UNAVAILABLE',
        message: scrubSecrets(
          `Unable to reach Meteomatics API: ${rawMsg}`,
          username,
          password,
        ),
      };
    }

    if (response.status === 401) {
      return {
        ok: false,
        status: 502,
        code: 'UPSTREAM_AUTH_FAILED',
        message:
          'Meteomatics rejected server authentication (HTTP 401). Verify Cloudflare secret rotation.',
      };
    }

    if (response.status === 403) {
      return {
        ok: false,
        status: 502,
        code: 'UPSTREAM_FORBIDDEN',
        message:
          'Meteomatics access forbidden for requested parameter or account tier (HTTP 403).',
      };
    }

    if (response.status === 429) {
      const retryAfterSeconds = parseRetryAfterSeconds(
        response.headers.get('Retry-After'),
      );
      isolateRateLimitCooldownUntilMs =
        options.nowMs() + retryAfterSeconds * 1000;
      return {
        ok: false,
        status: 429,
        code: 'UPSTREAM_RATE_LIMITED',
        message:
          'Meteomatics upstream rate/quota limit reached (HTTP 429). Temporary cooldown active.',
        retryAfterSeconds,
      };
    }

    if (!response.ok) {
      if (transientStatuses.has(response.status) && attempt === 0) {
        await sleep(options.retryDelayMs);
        continue;
      }
      return {
        ok: false,
        status: 502,
        code: 'UPSTREAM_UNAVAILABLE',
        message: `Meteomatics upstream returned HTTP ${response.status}.`,
      };
    }

    let rawJson: unknown;
    try {
      rawJson = await response.json();
    } catch {
      return {
        ok: false,
        status: 502,
        code: 'MALFORMED_UPSTREAM_RESPONSE',
        message: 'Meteomatics returned invalid JSON payload.',
      };
    }

    try {
      const snapshot = normalizeMeteomaticsPayload(
        rawJson,
        basin,
        windowMode,
        options.nowMs(),
      );
      return { ok: true, snapshot };
    } catch (normErr) {
      const detail =
        normErr instanceof Error ? normErr.message : 'Unexpected schema';
      return {
        ok: false,
        status: 502,
        code: 'MALFORMED_UPSTREAM_RESPONSE',
        message: scrubSecrets(
          `Malformed Meteomatics payload: ${detail}`,
          username,
          password,
        ),
      };
    }
  }

  return {
    ok: false,
    status: 502,
    code: 'UPSTREAM_UNAVAILABLE',
    message: 'Meteomatics upstream unavailable after bounded retry.',
  };
}

function getDefaultEdgeCache(): EdgeCacheStore | null {
  if (typeof caches !== 'undefined' && 'default' in caches && caches.default) {
    return (caches as unknown as { default: EdgeCacheStore }).default;
  }
  return null;
}

export async function handleWeatherRequest(
  request: Request,
  env: WeatherRuntimeEnv,
  options: HandleWeatherOptions = {},
): Promise<Response> {
  const nowMs = options.nowMs ?? (() => Date.now());
  const retrievedAtUtc = new Date(nowMs()).toISOString();

  if (request.method.toUpperCase() !== 'GET') {
    return errorResponse(
      405,
      'METHOD_NOT_ALLOWED',
      'Only HTTP GET requests are permitted on /api/weather.',
      retrievedAtUtc,
      undefined,
      { Allow: 'GET' },
    );
  }

  const url = new URL(request.url);
  const params = url.searchParams;

  for (const forbidden of FORBIDDEN_COORDINATE_PARAMS) {
    if (params.has(forbidden)) {
      return errorResponse(
        400,
        'ARBITRARY_COORDINATES_REJECTED',
        `Arbitrary coordinate parameter "${forbidden}" is rejected. Select one of the four FLOODWATCH basins via ?basin=...`,
        retrievedAtUtc,
      );
    }
  }

  for (const forbiddenDate of FORBIDDEN_DATE_PARAMS) {
    if (params.has(forbiddenDate)) {
      return errorResponse(
        400,
        'INVALID_DATE_RANGE',
        `Arbitrary date parameter "${forbiddenDate}" is rejected. Use ?window=current|forecast_24h|historical_24h.`,
        retrievedAtUtc,
      );
    }
  }

  const rawBasin = params.get('basin')?.trim() ?? '';
  if (!rawBasin || !isFloodwatchBasinId(rawBasin)) {
    return errorResponse(
      400,
      'INVALID_BASIN',
      'Invalid or missing basin identifier. Allowed basins: basin-brahmaputra, basin-mekong, basin-mississippi, basin-danube.',
      retrievedAtUtc,
    );
  }
  const basin = FLOODWATCH_BASIN_BY_ID[rawBasin];

  const rawWindow = params.get('window')?.trim() || 'current';
  if (!isWeatherWindowMode(rawWindow)) {
    return errorResponse(
      400,
      'INVALID_WINDOW',
      'Invalid window parameter. Allowed values: current, forecast_24h, historical_24h.',
      retrievedAtUtc,
    );
  }
  const windowMode: WeatherWindowMode = rawWindow;

  const username = env.METEOMATICS_USERNAME?.trim() ?? '';
  const password = env.METEOMATICS_PASSWORD?.trim() ?? '';
  if (!username || !password) {
    return errorResponse(
      503,
      'WEATHER_CREDENTIALS_MISSING',
      'Server-side Meteomatics credentials are not configured in runtime environment.',
      retrievedAtUtc,
    );
  }

  const currentNowMs = nowMs();
  const anchorMs = getSlotAnchorMs(currentNowMs);
  const cacheKey = `${basin.id}:${windowMode}:${anchorMs}`;
  const cacheControlHeader = 'public, max-age=1800, s-maxage=1800';

  if (!options.bypassMemoryCache) {
    const cachedSnapshot = getIsolateCache(cacheKey, currentNowMs);
    if (cachedSnapshot) {
      const hitSnapshot: NormalizedWeatherSnapshot = {
        ...cachedSnapshot,
        source: {
          ...cachedSnapshot.source,
          cacheStatus: 'HIT_ISOLATE_CACHE',
        },
      };
      return jsonResponse(
        200,
        { ok: true, snapshot: hitSnapshot },
        {
          'Cache-Control': cacheControlHeader,
          'X-Weather-Cache': 'HIT_ISOLATE_CACHE',
        },
      );
    }
  }

  const edgeCache =
    options.edgeCache !== undefined ? options.edgeCache : getDefaultEdgeCache();
  const normalizedEdgeCacheRequest = new Request(
    `${url.origin}/api/weather?basin=${encodeURIComponent(basin.id)}&window=${encodeURIComponent(windowMode)}`,
    { method: 'GET' },
  );

  if (edgeCache && !options.bypassMemoryCache) {
    try {
      const edgeMatch = await edgeCache.match(normalizedEdgeCacheRequest);
      if (edgeMatch) {
        const cloned = edgeMatch.clone();
        const edgeBody = (await cloned.json()) as WeatherSuccessPayload;
        if (edgeBody?.ok && edgeBody.snapshot) {
          const hitSnapshot: NormalizedWeatherSnapshot = {
            ...edgeBody.snapshot,
            source: {
              ...edgeBody.snapshot.source,
              cacheStatus: 'HIT_EDGE_CACHE',
            },
          };
          setIsolateCache(cacheKey, hitSnapshot, currentNowMs);
          return jsonResponse(
            200,
            { ok: true, snapshot: hitSnapshot },
            {
              'Cache-Control': cacheControlHeader,
              'X-Weather-Cache': 'HIT_EDGE_CACHE',
            },
          );
        }
      }
    } catch {
      // Edge cache lookup failures fall back cleanly to isolate/upstream fetch.
    }
  }

  if (isolateRateLimitCooldownUntilMs > currentNowMs) {
    const remainingSeconds = Math.max(
      1,
      Math.ceil((isolateRateLimitCooldownUntilMs - currentNowMs) / 1000),
    );
    return errorResponse(
      429,
      'UPSTREAM_RATE_LIMITED',
      'Local isolate rate-limit cooldown active following upstream HTTP 429.',
      retrievedAtUtc,
      remainingSeconds,
    );
  }

  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  let inflightPromise = isolateInflightRequests.get(cacheKey);
  if (!inflightPromise) {
    inflightPromise = fetchMeteomaticsOnce(
      basin,
      windowMode,
      anchorMs,
      username,
      password,
      {
        fetchFn,
        nowMs,
        timeoutMs,
        retryDelayMs,
      },
    ).finally(() => {
      isolateInflightRequests.delete(cacheKey);
    });
    isolateInflightRequests.set(cacheKey, inflightPromise);
  }

  const result = await inflightPromise;
  if (!result.ok) {
    return errorResponse(
      result.status,
      result.code,
      result.message,
      new Date(nowMs()).toISOString(),
      result.retryAfterSeconds,
    );
  }

  setIsolateCache(cacheKey, result.snapshot, nowMs());

  const successResponse = jsonResponse(
    200,
    { ok: true, snapshot: result.snapshot },
    {
      'Cache-Control': cacheControlHeader,
      'X-Weather-Cache': 'MISS',
    },
  );

  if (edgeCache) {
    const cacheWrite = edgeCache.put(
      normalizedEdgeCacheRequest,
      successResponse.clone(),
    );
    if (options.waitUntil) {
      options.waitUntil(cacheWrite);
    } else {
      await cacheWrite.catch(() => undefined);
    }
  }

  return successResponse;
}

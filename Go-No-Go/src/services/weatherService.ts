import {
  FLOODWATCH_BASIN_BY_ID,
  type FloodwatchBasinId,
  type NormalizedWeatherSnapshot,
  type WeatherApiResponsePayload,
  type WeatherProvenanceRecord,
  type WeatherQueryResult,
  type WeatherWindowMode,
} from '../types/weather';

const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;
const CLIENT_CACHE_MAX_ENTRIES = 16;
const CLIENT_PROVENANCE_MAX_ENTRIES = 12;

interface ClientCacheEntry {
  result: WeatherQueryResult;
  expiresAtMs: number;
}

const WEATHER_PROVENANCE_STORAGE_KEY = 'gng_weather_provenance_v1';

function loadStoredWeatherProvenance(): WeatherProvenanceRecord[] {
  if (typeof window === 'undefined' || !window.sessionStorage) return [];
  try {
    const raw = window.sessionStorage.getItem(WEATHER_PROVENANCE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistWeatherProvenance(): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(
      WEATHER_PROVENANCE_STORAGE_KEY,
      JSON.stringify(recordedWeatherProvenance),
    );
  } catch {
    // Gracefully handle storage quota or access issues
  }
}

const clientWeatherCache = new Map<string, ClientCacheEntry>();
const recordedWeatherProvenance: WeatherProvenanceRecord[] = loadStoredWeatherProvenance();

export function clearClientWeatherCache(): void {
  clientWeatherCache.clear();
}

export function clearRecordedWeatherUsage(): void {
  recordedWeatherProvenance.length = 0;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem(WEATHER_PROVENANCE_STORAGE_KEY);
    } catch {
      // Gracefully handle storage removal issues
    }
  }
}

export function getRecordedWeatherUsage(): WeatherProvenanceRecord[] {
  return [...recordedWeatherProvenance];
}

function recordWeatherUsage(snapshot: NormalizedWeatherSnapshot): void {
  const duplicateIndex = recordedWeatherProvenance.findIndex(
    (entry) =>
      entry.basinId === snapshot.basinId &&
      entry.windowMode === snapshot.windowMode &&
      entry.dataTimeUtc === snapshot.dataTimeUtc,
  );
  if (duplicateIndex !== -1) {
    recordedWeatherProvenance.splice(duplicateIndex, 1);
  }
  recordedWeatherProvenance.unshift({
    basinId: snapshot.basinId,
    basinName: snapshot.basinName,
    windowMode: snapshot.windowMode,
    classification: snapshot.classification,
    dataTimeUtc: snapshot.dataTimeUtc,
    retrievedAtUtc: snapshot.retrievedAtUtc,
    provider: snapshot.source.provider,
    model: snapshot.source.model,
    cacheStatus: snapshot.source.cacheStatus,
    precip1hMm: snapshot.current.metrics.precip1hMm,
    totalCloudCoverPct: snapshot.current.metrics.totalCloudCoverPct,
    windSpeed10mMs: snapshot.current.metrics.windSpeed10mMs,
    temperature2mC: snapshot.current.metrics.temperature2mC,
    globalSolarRadiationWm2: snapshot.current.metrics.globalSolarRadiationWm2,
  });
  if (recordedWeatherProvenance.length > CLIENT_PROVENANCE_MAX_ENTRIES) {
    recordedWeatherProvenance.length = CLIENT_PROVENANCE_MAX_ENTRIES;
  }
  persistWeatherProvenance();
}

function setClientCache(key: string, result: WeatherQueryResult): void {
  if (clientWeatherCache.size >= CLIENT_CACHE_MAX_ENTRIES) {
    const oldest = clientWeatherCache.keys().next().value;
    if (oldest) clientWeatherCache.delete(oldest);
  }
  clientWeatherCache.set(key, {
    result,
    expiresAtMs: Date.now() + CLIENT_CACHE_TTL_MS,
  });
}

export interface FetchBasinWeatherParams {
  basinId: FloodwatchBasinId;
  windowMode?: WeatherWindowMode;
  signal?: AbortSignal;
  bypassClientCache?: boolean;
}

/**
 * Fetches normalized weather context for an allowlisted FLOODWATCH basin via
 * the same-origin `/api/weather` Cloudflare Pages Function.
 * Never accesses external weather credentials or stores secrets in browser storage.
 */
export async function fetchBasinWeather({
  basinId,
  windowMode = 'current',
  signal,
  bypassClientCache = false,
}: FetchBasinWeatherParams): Promise<WeatherQueryResult> {
  const basin = FLOODWATCH_BASIN_BY_ID[basinId];
  const fallbackCloud = basin ? basin.baselineCloudCoverFraction : 0.65;
  const cacheKey = `${basinId}:${windowMode}`;
  const nowIso = new Date().toISOString();

  if (!bypassClientCache) {
    const cached = clientWeatherCache.get(cacheKey);
    if (cached && cached.expiresAtMs > Date.now()) {
      if (cached.result.snapshot) {
        recordWeatherUsage(cached.result.snapshot);
      }
      return cached.result;
    }
  }

  const endpoint = `/api/weather?basin=${encodeURIComponent(basinId)}&window=${encodeURIComponent(windowMode)}`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return {
        status: 'OFFLINE_FALLBACK',
        snapshot: null,
        message:
          'Weather proxy endpoint is not mounted in this static environment. Using scenario monsoon cloud baseline.',
        fallbackBaselineCloudFraction: fallbackCloud,
        retrievedAtUtc: nowIso,
      };
    }

    const payload = (await response.json()) as WeatherApiResponsePayload;

    if (response.ok && payload && payload.ok === true && payload.snapshot) {
      const liveResult: WeatherQueryResult = {
        status: 'LIVE',
        snapshot: payload.snapshot,
        message: 'Live Meteomatics environmental context retrieved.',
        fallbackBaselineCloudFraction: fallbackCloud,
        retrievedAtUtc: payload.snapshot.retrievedAtUtc,
      };
      setClientCache(cacheKey, liveResult);
      recordWeatherUsage(payload.snapshot);
      return liveResult;
    }

    const errCode =
      payload && payload.ok === false ? payload.error.code : 'UPSTREAM_UNAVAILABLE';
    const errMsg =
      payload && payload.ok === false
        ? payload.error.message
        : `Weather service unavailable (HTTP ${response.status}).`;

    if (errCode === 'WEATHER_CREDENTIALS_MISSING') {
      return {
        status: 'UNCONFIGURED',
        snapshot: null,
        message: errMsg,
        errorCode: errCode,
        fallbackBaselineCloudFraction: fallbackCloud,
        retrievedAtUtc: payload?.ok === false ? payload.retrievedAtUtc : nowIso,
      };
    }

    if (response.status === 429 || errCode === 'UPSTREAM_RATE_LIMITED') {
      return {
        status: 'RATE_LIMITED',
        snapshot: null,
        message: errMsg,
        errorCode: 'UPSTREAM_RATE_LIMITED',
        fallbackBaselineCloudFraction: fallbackCloud,
        retrievedAtUtc: payload?.ok === false ? payload.retrievedAtUtc : nowIso,
      };
    }

    return {
      status: 'ERROR',
      snapshot: null,
      message: errMsg,
      errorCode: errCode,
      fallbackBaselineCloudFraction: fallbackCloud,
      retrievedAtUtc: payload?.ok === false ? payload.retrievedAtUtc : nowIso,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    return {
      status: 'OFFLINE_FALLBACK',
      snapshot: null,
      message:
        'Network unavailable while contacting /api/weather. Mission continues safely with deterministic scenario baseline.',
      errorCode: 'CLIENT_NETWORK_ERROR',
      fallbackBaselineCloudFraction: fallbackCloud,
      retrievedAtUtc: nowIso,
    };
  }
}

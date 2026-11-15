import type { TargetRegion } from '../types/mission';
import type {
  EoArchiveStatus,
  EoDatasetDescriptor,
  EoDatasetUsageRecord,
  EoSceneAcquisition,
  EoSceneQueryResult,
  EoTileReference,
  PlanetaryComputerCollectionId,
  SasTokenEntry,
  TemporalSearchMode,
} from '../types/earthObservation';
import { latLonToWebMercatorTile } from './nasaDataService';

export const PC_STAC_API_BASE = 'https://planetarycomputer.microsoft.com/api/stac/v1';
export const PC_SAS_API_BASE = 'https://planetarycomputer.microsoft.com/api/sas/v1';
export const PC_CATALOG_BASE = 'https://planetarycomputer.microsoft.com/catalog';

/**
 * Floodwatch monsoon window centered around the 2024-08-22 observation date configured in GIBS/FLOODWATCH.
 */
export const FLOODWATCH_MONSOON_DATETIME_INTERVAL =
  '2024-08-08T00:00:00Z/2024-09-05T23:59:59Z';

const DEFAULT_TIMEOUT_MS = 8500;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 24;
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const RECENT_ARCHIVE_DAYS = 45;
const MAX_USAGE_RECORDS = 16;
const DEFAULT_SCENE_LIMIT = 4;

export const PLANETARY_COMPUTER_DATASETS: Record<
  PlanetaryComputerCollectionId,
  EoDatasetDescriptor
> = {
  'sentinel-1-rtc': {
    collectionId: 'sentinel-1-rtc',
    title: 'Sentinel-1 Radiometrically Terrain Corrected (RTC)',
    observationType: 'SAR',
    sensorName: 'C-Band Synthetic Aperture Radar (C-SAR, IW)',
    constellation: 'Copernicus Sentinel-1 (1A/1B/1C/1D)',
    spatialResolutionLabel: '20 m × 22 m native (~10 m RTC pixel spacing)',
    coordinateSystemNote:
      'Native UTM (per-tile EPSG) for COG assets · EPSG:3857 WebMercatorQuad for rendered tiles',
    assetKeys: ['vv', 'vh', 'hh', 'hv', 'tilejson', 'rendered_preview'],
    requiresSasForRawAssets: true,
    license: 'CC-BY-4.0',
    attribution:
      'Copernicus Sentinel-1 data processed to RTC by Catalyst, hosted on Microsoft Planetary Computer (CC-BY-4.0).',
    cloudPenetrating: true,
    nightCapable: true,
    scientificLimitationNote:
      'Active C-band microwave radar penetrates storm clouds and operates day/night. Low backscatter (dark pixels) can represent calm open water, radar shadow, paved surfaces, or dry sand — not automated flood proof without baseline & terrain context.',
  },
  'sentinel-2-l2a': {
    collectionId: 'sentinel-2-l2a',
    title: 'Sentinel-2 Level-2A Surface Reflectance',
    observationType: 'OPTICAL',
    sensorName: 'Multispectral Instrument (MSI)',
    constellation: 'Copernicus Sentinel-2 (2A/2B/2C)',
    spatialResolutionLabel: '10 m RGB/NIR · 20 m Red-Edge/SWIR',
    coordinateSystemNote:
      'Native UTM (per-tile EPSG) for COG assets · EPSG:3857 WebMercatorQuad for rendered tiles',
    assetKeys: ['visual', 'B02', 'B03', 'B04', 'B08', 'B11', 'B12', 'SCL', 'tilejson', 'rendered_preview'],
    requiresSasForRawAssets: true,
    license: 'Copernicus Sentinel Data Terms (ESA / Esri / Microsoft)',
    attribution:
      'Copernicus Sentinel-2 Level-2A data (ESA), processed by Esri & Microsoft, hosted on Microsoft Planetary Computer.',
    cloudPenetrating: false,
    nightCapable: false,
    scientificLimitationNote:
      'Passive solar reflectance is obstructed by monsoon cloud decks (reported per-scene via eo:cloud_cover) and cannot image during nightside passes.',
  },
  'cop-dem-glo-30': {
    collectionId: 'cop-dem-glo-30',
    title: 'Copernicus DEM GLO-30 (30 m Elevation)',
    observationType: 'ELEVATION',
    sensorName: 'TanDEM-X / WorldDEM Interferometric DSM',
    constellation: 'Copernicus DEM',
    spatialResolutionLabel: '30 m (1 arc-second)',
    coordinateSystemNote:
      'EPSG:4326 geographic COG · EPSG:3857 WebMercatorQuad for rendered tiles',
    assetKeys: ['data', 'tilejson', 'rendered_preview'],
    requiresSasForRawAssets: true,
    license: 'Copernicus DEM License (ESA / Sinergise / OpenTopography / Microsoft)',
    attribution:
      'Copernicus DEM GLO-30 (ESA, Sinergise, OpenTopography), hosted on Microsoft Planetary Computer.',
    cloudPenetrating: true,
    nightCapable: true,
    scientificLimitationNote:
      'Static 30 m Digital Surface Model (reference epoch 2021-04-22) used for hydrological slope context and Sentinel-1 RTC terrain correction.',
  },
};

interface StacAssetRaw {
  href?: string;
  type?: string;
}

interface StacItemRaw {
  id?: string;
  bbox?: number[];
  properties?: Record<string, unknown>;
  assets?: Record<string, StacAssetRaw>;
}

interface StacSearchResponseRaw {
  features?: StacItemRaw[];
}

interface TileJsonRaw {
  tiles?: string[];
  bounds?: number[];
}

interface CachedSearchEntry {
  expiresAtMs: number;
  scenes: EoSceneAcquisition[];
}

interface CachedTileJsonEntry {
  expiresAtMs: number;
  tiles: string[];
  bounds?: [number, number, number, number];
}

const searchCache = new Map<string, CachedSearchEntry>();
const tileJsonCache = new Map<string, CachedTileJsonEntry>();
const inflightSearches = new Map<string, Promise<EoSceneAcquisition[]>>();
const sasTokenCache = new Map<PlanetaryComputerCollectionId, SasTokenEntry>();
const inflightSasTokens = new Map<PlanetaryComputerCollectionId, Promise<SasTokenEntry>>();
const usageRecords = new Map<string, EoDatasetUsageRecord>();

function setBoundedCache<K, V>(cache: Map<K, V>, key: K, value: V, maxEntries = MAX_CACHE_ENTRIES): void {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, value);
}

/**
 * Clears in-memory STAC search, TileJSON, and SAS token caches (primarily for deterministic tests).
 */
export function clearPlanetaryComputerCaches(): void {
  searchCache.clear();
  tileJsonCache.clear();
  inflightSearches.clear();
  sasTokenCache.clear();
  inflightSasTokens.clear();
}

export function recordEoDatasetUsage(record: EoDatasetUsageRecord): void {
  const key = `${record.source}:${record.datasetId}:${record.basinName}:${record.itemId ?? 'none'}:${record.isFallback ? 'fb' : 'live'}`;
  if (usageRecords.has(key)) {
    usageRecords.delete(key);
  } else if (usageRecords.size >= MAX_USAGE_RECORDS) {
    const oldestKey = usageRecords.keys().next().value;
    if (oldestKey !== undefined) {
      usageRecords.delete(oldestKey);
    }
  }
  usageRecords.set(key, record);
}

export function getRecordedEoDatasetUsage(): EoDatasetUsageRecord[] {
  return Array.from(usageRecords.values());
}

export function clearRecordedEoDatasetUsage(): void {
  usageRecords.clear();
}

/**
 * Builds a bounded [west, south, east, north] WGS-84 bounding box around a FLOODWATCH basin center.
 */
export function buildBasinBoundingBox(
  latitudeDeg: number,
  longitudeDeg: number,
  halfSpanDeg = 0.35
): [number, number, number, number] {
  const span = Math.max(0.05, Math.min(1.5, halfSpanDeg));
  const west = Math.max(-180, Number((longitudeDeg - span).toFixed(4)));
  const south = Math.max(-85, Number((latitudeDeg - span).toFixed(4)));
  const east = Math.min(180, Number((longitudeDeg + span).toFixed(4)));
  const north = Math.min(85, Number((latitudeDeg + span).toFixed(4)));
  return [west, south, east, north];
}

export function buildTemporalInterval(
  temporalMode: TemporalSearchMode,
  nowMs = Date.now()
): string {
  if (temporalMode === 'MONSOON_2024') {
    return FLOODWATCH_MONSOON_DATETIME_INTERVAL;
  }
  const end = new Date(nowMs);
  const start = new Date(nowMs - RECENT_ARCHIVE_DAYS * 24 * 60 * 60 * 1000);
  return `${start.toISOString()}/${end.toISOString()}`;
}

function classifyArchiveStatus(
  collectionId: PlanetaryComputerCollectionId,
  datetimeIso: string | null,
  nowMs = Date.now()
): EoArchiveStatus {
  if (collectionId === 'cop-dem-glo-30') {
    return 'STATIC_REFERENCE';
  }
  if (!datetimeIso) return 'ARCHIVED';
  const ts = Date.parse(datetimeIso);
  if (!Number.isFinite(ts)) return 'ARCHIVED';
  const ageDays = (nowMs - ts) / (24 * 60 * 60 * 1000);
  return ageDays <= RECENT_ARCHIVE_DAYS ? 'RECENT' : 'ARCHIVED';
}

function createLinkedAbortController(
  timeoutMs: number,
  externalSignal?: AbortSignal
): { controller: AbortController; cleanup: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let didTimeout = false;

  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort(new Error('Planetary Computer request timed out'));
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    controller,
    timedOut: () => didTimeout,
    cleanup: () => {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  options: { timeoutMs?: number; signal?: AbortSignal; maxRetries?: number } = {}
): Promise<T> {
  if (typeof fetch !== 'function') {
    throw new Error('Fetch API is unavailable in this environment.');
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const linked = createLinkedAbortController(timeoutMs, options.signal);
    try {
      const resp = await fetch(url, {
        ...init,
        signal: linked.controller.signal,
      });

      if (resp.ok) {
        return (await resp.json()) as T;
      }

      const retryable = resp.status === 429 || resp.status === 502 || resp.status === 503 || resp.status === 504;
      if (retryable && attempt < maxRetries && !options.signal?.aborted) {
        const retryAfterSec = Number(resp.headers?.get?.('Retry-After') ?? '0');
        const delayMs =
          Number.isFinite(retryAfterSec) && retryAfterSec > 0
            ? Math.min(2500, retryAfterSec * 1000)
            : 450 * (attempt + 1);
        await sleep(delayMs, options.signal);
        continue;
      }

      throw new Error(`Planetary Computer API responded HTTP ${resp.status}`);
    } catch (err) {
      if (options.signal?.aborted) {
        throw err;
      }
      if (linked.timedOut() || attempt >= maxRetries) {
        throw err;
      }
      await sleep(350 * (attempt + 1), options.signal);
    } finally {
      linked.cleanup();
    }
  }

  throw new Error('Planetary Computer request failed after retries.');
}

function normalizeStacItem(
  item: StacItemRaw,
  collectionId: PlanetaryComputerCollectionId,
  nowMs = Date.now()
): EoSceneAcquisition | null {
  if (!item.id) return null;
  const descriptor = PLANETARY_COMPUTER_DATASETS[collectionId];
  const props = item.properties ?? {};
  const assets = item.assets ?? {};

  const datetimeIso =
    typeof props.datetime === 'string' && props.datetime.length > 0
      ? props.datetime
      : null;

  const rawBbox = Array.isArray(item.bbox) && item.bbox.length >= 4
    ? ([
        Number(item.bbox[0]),
        Number(item.bbox[1]),
        Number(item.bbox[2]),
        Number(item.bbox[3]),
      ] as [number, number, number, number])
    : ([-180, -85, 180, 85] as [number, number, number, number]);

  const rawPlatform = typeof props.platform === 'string' ? props.platform : descriptor.constellation;
  const instruments = Array.isArray(props.instruments)
    ? props.instruments.filter((v): v is string => typeof v === 'string')
    : [];
  const sarMode = typeof props['sar:instrument_mode'] === 'string' ? props['sar:instrument_mode'] : null;
  const instrument =
    instruments.length > 0
      ? instruments.map((s) => s.toUpperCase()).join(', ')
      : sarMode
        ? `${descriptor.sensorName} (${sarMode})`
        : descriptor.sensorName;

  const cloudCoverPct =
    typeof props['eo:cloud_cover'] === 'number' && Number.isFinite(props['eo:cloud_cover'])
      ? Number(props['eo:cloud_cover'].toFixed(1))
      : null;

  const epsg =
    typeof props['proj:epsg'] === 'number' && Number.isFinite(props['proj:epsg'])
      ? props['proj:epsg']
      : null;

  const orbitState = typeof props['sat:orbit_state'] === 'string' ? props['sat:orbit_state'] : null;
  const polarizations = Array.isArray(props['sar:polarizations'])
    ? props['sar:polarizations'].filter((v): v is string => typeof v === 'string')
    : [];

  const rawAssetKey =
    collectionId === 'sentinel-1-rtc'
      ? assets.vv?.href
        ? 'vv'
        : assets.vh?.href
          ? 'vh'
          : 'hh'
      : collectionId === 'sentinel-2-l2a'
        ? 'visual'
        : 'data';

  return {
    itemId: item.id,
    collectionId,
    observationType: descriptor.observationType,
    platform: rawPlatform,
    instrument,
    datetimeIso,
    archiveStatus: classifyArchiveStatus(collectionId, datetimeIso, nowMs),
    bbox: rawBbox,
    epsg,
    cloudCoverPct,
    orbitState,
    polarizations,
    tileJsonHref: assets.tilejson?.href ?? null,
    renderedPreviewHref: assets.rendered_preview?.href ?? null,
    rawAssetHref: assets[rawAssetKey]?.href ?? null,
    attribution: descriptor.attribution,
  };
}

/**
 * Obtains or refreshes a short-lived Planetary Computer SAS token for raw COG asset access.
 * Tokens are stored strictly in transient memory (never localStorage or Zustand) and never logged.
 */
export async function getCollectionSasToken(
  collectionId: PlanetaryComputerCollectionId,
  options: { nowMs?: number; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<SasTokenEntry> {
  const nowMs = options.nowMs ?? Date.now();
  const cached = sasTokenCache.get(collectionId);
  if (cached && nowMs < cached.expiresAtMs - TOKEN_REFRESH_BUFFER_MS) {
    return cached;
  }

  const inflight = inflightSasTokens.get(collectionId);
  if (inflight) {
    return inflight;
  }

  const reqPromise = (async () => {
    const raw = await fetchJsonWithRetry<{ token?: string; 'msft:expiry'?: string }>(
      `${PC_SAS_API_BASE}/token/${encodeURIComponent(collectionId)}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      { timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, signal: options.signal }
    );

    if (!raw.token || !raw['msft:expiry']) {
      throw new Error(`Invalid SAS token response for collection ${collectionId}`);
    }

    const expiresAtMs = Date.parse(raw['msft:expiry']);
    if (!Number.isFinite(expiresAtMs)) {
      throw new Error(`Unparseable SAS expiry timestamp for collection ${collectionId}`);
    }

    const entry: SasTokenEntry = {
      collectionId,
      token: raw.token,
      expiryIso: raw['msft:expiry'],
      expiresAtMs,
    };
    sasTokenCache.set(collectionId, entry);
    return entry;
  })();

  inflightSasTokens.set(collectionId, reqPromise);
  try {
    return await reqPromise;
  } finally {
    inflightSasTokens.delete(collectionId);
  }
}

/**
 * Signs a raw Planetary Computer blob asset URL only when explicitly required,
 * automatically refreshing expired or near-expiry SAS tokens.
 */
export async function signPlanetaryComputerAssetUrl(
  rawAssetHref: string,
  collectionId: PlanetaryComputerCollectionId,
  options: { nowMs?: number; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<{ signedUrl: string; expiryIso: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawAssetHref);
  } catch {
    throw new Error('Invalid Planetary Computer asset URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Refusing to sign non-HTTPS Planetary Computer asset URL.');
  }

  const entry = await getCollectionSasToken(collectionId, options);
  const signedParams = new URLSearchParams(entry.token);
  const merged = new URLSearchParams(parsed.search);
  signedParams.forEach((value, key) => {
    merged.set(key, value);
  });
  parsed.search = merged.toString();

  return {
    signedUrl: parsed.toString(),
    expiryIso: entry.expiryIso,
  };
}

/**
 * Queries the public Microsoft Planetary Computer STAC API with bounded bbox, datetime, and limit.
 */
export async function searchPlanetaryComputerScenes(params: {
  collectionId: PlanetaryComputerCollectionId;
  latitudeDeg: number;
  longitudeDeg: number;
  temporalMode: TemporalSearchMode;
  maxCloudCoverPct?: number;
  limit?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  nowMs?: number;
}): Promise<{ scenes: EoSceneAcquisition[]; fromCache: boolean }> {
  const {
    collectionId,
    latitudeDeg,
    longitudeDeg,
    temporalMode,
    maxCloudCoverPct = 100,
    limit = DEFAULT_SCENE_LIMIT,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    nowMs = Date.now(),
  } = params;

  const boundedLimit = Math.max(1, Math.min(6, Math.floor(limit)));
  const bbox = buildBasinBoundingBox(latitudeDeg, longitudeDeg, 0.35);
  const datetime =
    collectionId === 'cop-dem-glo-30'
      ? undefined
      : buildTemporalInterval(temporalMode, nowMs);

  const cacheKey = `${collectionId}|${bbox.join(',')}|${temporalMode}|${maxCloudCoverPct}|${boundedLimit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && nowMs < cached.expiresAtMs) {
    return { scenes: cached.scenes, fromCache: true };
  }

  const existingInflight = inflightSearches.get(cacheKey);
  if (existingInflight && !signal) {
    const scenes = await existingInflight;
    return { scenes, fromCache: false };
  }

  const payload: Record<string, unknown> = {
    collections: [collectionId],
    bbox,
    limit: boundedLimit,
  };
  if (datetime) {
    payload.datetime = datetime;
  }
  if (collectionId === 'sentinel-2-l2a' && maxCloudCoverPct < 100) {
    payload.query = {
      'eo:cloud_cover': { lte: Math.max(0, Math.min(100, maxCloudCoverPct)) },
    };
  }

  const runSearch = async (): Promise<EoSceneAcquisition[]> => {
    const raw = await fetchJsonWithRetry<StacSearchResponseRaw>(
      `${PC_STAC_API_BASE}/search`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/geo+json, application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      { timeoutMs, signal }
    );

    const normalized = (raw.features ?? [])
      .map((item) => normalizeStacItem(item, collectionId, nowMs))
      .filter((item): item is EoSceneAcquisition => item !== null);

    setBoundedCache(searchCache, cacheKey, {
      expiresAtMs: nowMs + CACHE_TTL_MS,
      scenes: normalized,
    });
    return normalized;
  };

  if (!signal) {
    const promise = runSearch();
    inflightSearches.set(cacheKey, promise);
    try {
      const scenes = await promise;
      return { scenes, fromCache: false };
    } finally {
      inflightSearches.delete(cacheKey);
    }
  }

  const scenes = await runSearch();
  return { scenes, fromCache: false };
}

function pointInsideBbox(
  lat: number,
  lon: number,
  bbox: [number, number, number, number]
): boolean {
  const [west, south, east, north] = bbox;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

function selectBestScene(
  scenes: EoSceneAcquisition[],
  latitudeDeg: number,
  longitudeDeg: number
): EoSceneAcquisition | null {
  if (scenes.length === 0) return null;
  const covering = scenes.find((s) => pointInsideBbox(latitudeDeg, longitudeDeg, s.bbox));
  return covering ?? scenes[0];
}

function buildBoundedPreviewUrl(previewHref: string | null): string | null {
  if (!previewHref) return null;
  try {
    const url = new URL(previewHref);
    if (url.hostname === 'planetarycomputer.microsoft.com' && url.pathname.includes('/api/data/v1/')) {
      url.searchParams.set('width', '512');
      url.searchParams.set('height', '512');
      return url.toString();
    }
    return previewHref;
  } catch {
    return null;
  }
}

async function resolveSceneImagery(
  scene: EoSceneAcquisition,
  basinLat: number,
  basinLon: number,
  zoom = 9,
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  nowMs = Date.now()
): Promise<{ url: string | null; tileRef: EoTileReference }> {
  const safeZoom = Math.max(7, Math.min(11, Math.floor(zoom)));
  const useBasinCenter = pointInsideBbox(basinLat, basinLon, scene.bbox);
  const targetLat = useBasinCenter ? basinLat : (scene.bbox[1] + scene.bbox[3]) / 2;
  const targetLon = useBasinCenter ? basinLon : (scene.bbox[0] + scene.bbox[2]) / 2;
  const tile = latLonToWebMercatorTile(targetLat, targetLon, safeZoom, 12);

  if (scene.tileJsonHref) {
    try {
      let cachedTj = tileJsonCache.get(scene.tileJsonHref);
      if (!cachedTj || nowMs >= cachedTj.expiresAtMs) {
        const tj = await fetchJsonWithRetry<TileJsonRaw>(
          scene.tileJsonHref,
          { method: 'GET', headers: { Accept: 'application/json' } },
          { timeoutMs, signal }
        );
        const tiles = Array.isArray(tj.tiles) ? tj.tiles : [];
        if (tiles.length > 0) {
          cachedTj = {
            expiresAtMs: nowMs + CACHE_TTL_MS,
            tiles,
            bounds:
              Array.isArray(tj.bounds) && tj.bounds.length >= 4
                ? [tj.bounds[0], tj.bounds[1], tj.bounds[2], tj.bounds[3]]
                : undefined,
          };
          setBoundedCache(tileJsonCache, scene.tileJsonHref, cachedTj);
        }
      }

      if (cachedTj && cachedTj.tiles.length > 0) {
        const template = cachedTj.tiles[0];
        const url = template
          .replace('{z}', String(tile.z))
          .replace('{x}', String(tile.x))
          .replace('{y}', String(tile.y));
        return {
          url,
          tileRef: { ...tile, renderMode: 'WEBMERCATOR_TILE' },
        };
      }
    } catch (err) {
      if (signal?.aborted) throw err;
    }
  }

  const boundedPreview = buildBoundedPreviewUrl(scene.renderedPreviewHref);
  if (boundedPreview) {
    return {
      url: boundedPreview,
      tileRef: { ...tile, renderMode: 'RENDERED_PREVIEW' },
    };
  }

  return {
    url: null,
    tileRef: { ...tile, renderMode: 'OFFLINE_FALLBACK' },
  };
}

/**
 * Fetches real STAC scene metadata and a lightweight rendered tile/preview URL for a FLOODWATCH target region.
 * Never throws; always returns an explicit LIVE, EMPTY, or OFFLINE_FALLBACK state.
 */
export async function fetchBasinEarthObservationScene(params: {
  collectionId: PlanetaryComputerCollectionId;
  region: TargetRegion;
  temporalMode: TemporalSearchMode;
  zoom?: number;
  maxCloudCoverPct?: number;
  signal?: AbortSignal;
}): Promise<EoSceneQueryResult> {
  const {
    collectionId,
    region,
    temporalMode,
    zoom = 9,
    maxCloudCoverPct = 100,
    signal,
  } = params;

  const descriptor = PLANETARY_COMPUTER_DATASETS[collectionId];
  const fallbackTile = latLonToWebMercatorTile(
    region.latitudeDeg,
    region.longitudeDeg,
    Math.max(7, Math.min(11, Math.floor(zoom))),
    12
  );

  try {
    const { scenes, fromCache } = await searchPlanetaryComputerScenes({
      collectionId,
      latitudeDeg: region.latitudeDeg,
      longitudeDeg: region.longitudeDeg,
      temporalMode,
      maxCloudCoverPct,
      signal,
    });

    const selectedScene = selectBestScene(scenes, region.latitudeDeg, region.longitudeDeg);
    if (!selectedScene) {
      const emptyResult: EoSceneQueryResult = {
        status: 'EMPTY',
        collectionId,
        basinId: region.id,
        basinName: region.name,
        temporalMode,
        scenes: [],
        selectedScene: null,
        imageryUrl: null,
        tileRef: { ...fallbackTile, renderMode: 'OFFLINE_FALLBACK' },
        isFallback: true,
        fromCache,
        detail: `No ${descriptor.title} scenes matched ${region.name} in this search window.`,
      };
      return emptyResult;
    }

    const imagery = await resolveSceneImagery(
      selectedScene,
      region.latitudeDeg,
      region.longitudeDeg,
      zoom,
      signal
    );

    const result: EoSceneQueryResult = {
      status: imagery.url ? 'LIVE' : 'OFFLINE_FALLBACK',
      collectionId,
      basinId: region.id,
      basinName: region.name,
      temporalMode,
      scenes,
      selectedScene,
      imageryUrl: imagery.url,
      tileRef: imagery.tileRef,
      isFallback: !imagery.url,
      fromCache,
      detail: imagery.url
        ? `Live STAC acquisition ${selectedScene.itemId} (${imagery.tileRef.renderMode === 'WEBMERCATOR_TILE' ? '256px WebMercatorQuad tile' : '512px Data API preview'})`
        : 'STAC metadata loaded, but no renderable preview endpoint was available.',
    };

    recordEoDatasetUsage({
      source: 'PLANETARY_COMPUTER',
      datasetId: collectionId,
      label: descriptor.title,
      observationType: descriptor.observationType,
      basinName: region.name,
      itemId: selectedScene.itemId,
      acquisitionDatetimeIso: selectedScene.datetimeIso,
      archiveStatus: selectedScene.archiveStatus,
      isFallback: result.isFallback,
      attribution: descriptor.attribution,
    });

    return result;
  } catch (err) {
    if (signal?.aborted) {
      throw err;
    }

    const detailMessage =
      err instanceof Error && err.message
        ? `${err.message} — explicitly labelled offline baseline context active.`
        : 'Planetary Computer STAC API unreachable — explicitly labelled offline baseline context active.';

    recordEoDatasetUsage({
      source: 'PLANETARY_COMPUTER',
      datasetId: collectionId,
      label: descriptor.title,
      observationType: descriptor.observationType,
      basinName: region.name,
      itemId: null,
      acquisitionDatetimeIso: null,
      archiveStatus: 'BASELINE_FALLBACK',
      isFallback: true,
      attribution: descriptor.attribution,
    });

    return {
      status: 'OFFLINE_FALLBACK',
      collectionId,
      basinId: region.id,
      basinName: region.name,
      temporalMode,
      scenes: [],
      selectedScene: null,
      imageryUrl: null,
      tileRef: { ...fallbackTile, renderMode: 'OFFLINE_FALLBACK' },
      isFallback: true,
      fromCache: false,
      detail: detailMessage,
    };
  }
}

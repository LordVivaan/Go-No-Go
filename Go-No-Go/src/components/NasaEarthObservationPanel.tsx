import {
  AlertTriangle,
  Cloud,
  Globe,
  Layers,
  Mountain,
  Radar,
  RefreshCw,
  Satellite,
  WifiOff,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  EoSceneQueryResult,
  PlanetaryComputerCollectionId,
  TemporalSearchMode,
} from '../types/earthObservation';
import type { TargetRegion } from '../types/mission';
import {
  NASA_GIBS_ATTRIBUTION,
  NASA_GIBS_LAYERS,
  type NasaGibsLayerId,
  buildNasaGibsWmtsTileUrl,
} from '../services/nasaDataService';
import {
  PLANETARY_COMPUTER_DATASETS,
  fetchBasinEarthObservationScene,
  recordEoDatasetUsage,
} from '../services/planetaryComputerService';

export type EoPanelViewMode =
  | 'SAR_OPTICAL_COMPARE'
  | 'sentinel-1-rtc'
  | 'sentinel-2-l2a'
  | 'cop-dem-glo-30'
  | 'NASA_GIBS';

export interface NasaEarthObservationPanelProps {
  targetRegions: TargetRegion[];
  initialRegionId?: string;
  initialMode?: EoPanelViewMode;
  hasCloudPenetratingPayload?: boolean;
}

const VIEW_MODES: Array<{ id: EoPanelViewMode; label: string }> = [
  { id: 'SAR_OPTICAL_COMPARE', label: 'SAR vs Optical (PC)' },
  { id: 'sentinel-1-rtc', label: 'Sentinel-1 RTC (SAR)' },
  { id: 'sentinel-2-l2a', label: 'Sentinel-2 L2A (Opt)' },
  { id: 'cop-dem-glo-30', label: 'Copernicus DEM 30m' },
  { id: 'NASA_GIBS', label: 'NASA GIBS WMTS' },
];

function formatUtcShort(iso: string | null): string {
  if (!iso) return 'Static Reference';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function formatBbox(bbox: [number, number, number, number]): string {
  return `[${bbox[0].toFixed(2)}°, ${bbox[1].toFixed(2)}°] to [${bbox[2].toFixed(2)}°, ${bbox[3].toFixed(2)}°]`;
}

function EoSceneCard({
  collectionId,
  region,
  result,
  loading,
}: {
  collectionId: PlanetaryComputerCollectionId;
  region: TargetRegion;
  result: EoSceneQueryResult | null;
  loading: boolean;
}) {
  const descriptor = PLANETARY_COMPUTER_DATASETS[collectionId];
  const [failedImageryUrl, setFailedImageryUrl] = useState<string | null>(null);

  const scene = result?.selectedScene ?? null;
  const imgFailed = Boolean(result?.imageryUrl && failedImageryUrl === result.imageryUrl);
  const showImage = !loading && result?.imageryUrl && !imgFailed;
  const isFallback = !loading && (!result || result.isFallback || imgFailed);

  return (
    <div className="flex flex-col rounded-xl border border-[#1E2D45] bg-[#0D1422] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2D45] pb-2">
        <div className="flex items-center gap-2">
          {descriptor.observationType === 'SAR' ? (
            <Radar className="h-4 w-4 text-[#38D996]" aria-hidden="true" />
          ) : descriptor.observationType === 'ELEVATION' ? (
            <Mountain className="h-4 w-4 text-[#42D9F5]" aria-hidden="true" />
          ) : (
            <Cloud className="h-4 w-4 text-[#FFB547]" aria-hidden="true" />
          )}
          <div>
            <div className="text-xs font-bold text-[#F1F5FA]">{descriptor.title}</div>
            <div className="font-mono text-[10px] text-[#8E9BAD]">
              {descriptor.observationType} · {descriptor.sensorName}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
              loading
                ? 'bg-[#42D9F5]/15 text-[#42D9F5]'
                : isFallback
                  ? 'bg-[#FFB547]/15 text-[#FFB547]'
                  : 'bg-[#38D996]/15 text-[#38D996]'
            }`}
          >
            {loading
              ? 'QUERYING STAC...'
              : isFallback
                ? 'OFFLINE / FALLBACK SAMPLE'
                : 'ACTUAL SATELLITE DATA'}
          </span>
          {scene && !loading && (
            <span className="rounded-full border border-[#2A3B57] bg-[#141E2E] px-2 py-0.5 font-mono text-[10px] text-[#8E9BAD]">
              {scene.archiveStatus === 'RECENT'
                ? 'RECENT'
                : scene.archiveStatus === 'STATIC_REFERENCE'
                  ? 'STATIC DEM'
                  : 'ARCHIVED'}
            </span>
          )}
        </div>
      </div>

      {/* Rendered Tile / Preview or Honest Fallback */}
      <div className="relative mt-3 overflow-hidden rounded-lg border border-[#1E2D45] bg-[#080B12]">
        {loading ? (
          <div className="flex h-48 flex-col items-center justify-center p-4 text-center">
            <RefreshCw className="h-5 w-5 animate-spin text-[#42D9F5]" aria-hidden="true" />
            <p className="mt-2 font-mono text-[11px] text-[#8E9BAD]">
              Searching Planetary Computer STAC for {region.name}...
            </p>
          </div>
        ) : showImage && result?.imageryUrl ? (
          <img
            src={result.imageryUrl}
            alt={`${descriptor.title} observation over ${region.name}`}
            onError={() => setFailedImageryUrl(result.imageryUrl)}
            className="h-48 w-full object-cover"
          />
        ) : (
          <div className="flex h-48 flex-col items-center justify-center p-4 text-center">
            <WifiOff className="h-5 w-5 text-[#FFB547]" aria-hidden="true" />
            <p className="mt-2 font-mono text-xs font-bold text-[#F1F5FA]">
              {result?.status === 'EMPTY'
                ? 'No Matching STAC Acquisition'
                : 'Explicitly Labelled Offline Baseline Fallback'}
            </p>
            <p className="mt-1 max-w-sm text-[11px] text-[#8E9BAD]">
              {imgFailed
                ? 'Planetary Computer rendered tile image could not be loaded.'
                : result?.detail ??
                  `Offline fallback for ${region.name} (${region.latitudeDeg.toFixed(2)}°, ${region.longitudeDeg.toFixed(2)}°).`}
            </p>
            <p className="mt-1.5 font-mono text-[10px] text-[#42D9F5]">
              Collection: {collectionId} · Mode: {descriptor.observationType} · Basin Cloud Baseline:{' '}
              {Math.round(region.cloudCoverFraction * 100)}%
            </p>
          </div>
        )}
      </div>

      {/* Acquisition Metadata */}
      <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[10px] text-[#8E9BAD]">
        <div className="rounded-lg border border-[#1E2D45] bg-[#080B12]/70 p-2">
          <span className="block uppercase text-[#8E9BAD]/80">Platform / Sensor</span>
          <span className="mt-0.5 block truncate font-semibold text-[#F1F5FA]">
            {scene ? `${scene.platform} · ${scene.instrument}` : descriptor.constellation}
          </span>
        </div>
        <div className="rounded-lg border border-[#1E2D45] bg-[#080B12]/70 p-2">
          <span className="block uppercase text-[#8E9BAD]/80">Acquisition (UTC)</span>
          <span className="mt-0.5 block truncate font-semibold text-[#F1F5FA]">
            {scene ? formatUtcShort(scene.datetimeIso) : 'Unavailable (Fallback)'}
          </span>
        </div>
        <div className="rounded-lg border border-[#1E2D45] bg-[#080B12]/70 p-2">
          <span className="block uppercase text-[#8E9BAD]/80">Coverage / CRS</span>
          <span className="mt-0.5 block truncate text-[#F1F5FA]">
            {scene
              ? `${formatBbox(scene.bbox)}${scene.epsg ? ` · EPSG:${scene.epsg}` : ''}`
              : `${region.latitudeDeg.toFixed(2)}°, ${region.longitudeDeg.toFixed(2)}°`}
          </span>
        </div>
        <div className="rounded-lg border border-[#1E2D45] bg-[#080B12]/70 p-2">
          <span className="block uppercase text-[#8E9BAD]/80">
            {descriptor.observationType === 'OPTICAL'
              ? 'Scene Cloud Cover'
              : descriptor.observationType === 'SAR'
                ? 'SAR Polarizations / Orbit'
                : 'Spatial Resolution'}
          </span>
          <span className="mt-0.5 block truncate font-semibold text-[#F1F5FA]">
            {descriptor.observationType === 'OPTICAL'
              ? scene?.cloudCoverPct !== null && scene?.cloudCoverPct !== undefined
                ? `${scene.cloudCoverPct}% (eo:cloud_cover)`
                : `Basin est. ${Math.round(region.cloudCoverFraction * 100)}%`
              : descriptor.observationType === 'SAR'
                ? scene
                  ? `${scene.polarizations.join('/') || 'VV/VH'} · ${scene.orbitState ?? 'SSO'} (All-weather)`
                  : 'C-Band VV/VH (Cloud-Penetrating)'
                : descriptor.spatialResolutionLabel}
          </span>
        </div>
      </div>

      {scene && (
        <div className="mt-2 truncate font-mono text-[10px] text-[#8E9BAD]" title={scene.itemId}>
          STAC Item: <span className="text-[#42D9F5]">{scene.itemId}</span>
          {result?.tileRef.renderMode === 'WEBMERCATOR_TILE' && (
            <>
              {' '}
              · Tile z{result.tileRef.z}/x{result.tileRef.x}/y{result.tileRef.y}
            </>
          )}
        </div>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-[#8E9BAD]">
        {descriptor.scientificLimitationNote}
      </p>
      <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-[#8E9BAD]/90">
        Attribution: {descriptor.attribution}
      </p>
    </div>
  );
}

export function NasaEarthObservationPanel({
  targetRegions,
  initialRegionId,
  initialMode = 'SAR_OPTICAL_COMPARE',
  hasCloudPenetratingPayload,
}: NasaEarthObservationPanelProps) {
  const [selectedRegionId, setSelectedRegionId] = useState(
    initialRegionId ?? targetRegions[0]?.id ?? ''
  );
  const [viewMode, setViewMode] = useState<EoPanelViewMode>(initialMode);
  const [temporalMode, setTemporalMode] = useState<TemporalSearchMode>('MONSOON_2024');
  const [refreshNonce, setRefreshNonce] = useState(0);

  // NASA GIBS auxiliary state
  const [gibsLayerId, setGibsLayerId] = useState<NasaGibsLayerId>(
    'MODIS_Terra_CorrectedReflectance_TrueColor'
  );
  const [gibsDateIso, setGibsDateIso] = useState('2024-08-22');
  const [gibsZoom, setGibsZoom] = useState(6);
  const [gibsImageState, setGibsImageState] = useState<'LOADING' | 'LIVE' | 'OFFLINE_FALLBACK'>(
    'LOADING'
  );

  // Planetary Computer STAC state
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const [pcResults, setPcResults] = useState<
    Partial<Record<PlanetaryComputerCollectionId, EoSceneQueryResult>>
  >({});

  const region =
    targetRegions.find((r) => r.id === selectedRegionId) ?? targetRegions[0];

  const activeQueryKey =
    region && viewMode !== 'NASA_GIBS'
      ? `${region.id}:${viewMode}:${temporalMode}:${refreshNonce}`
      : null;
  const pcLoading = Boolean(activeQueryKey && loadedQueryKey !== activeQueryKey);

  useEffect(() => {
    if (!region || !activeQueryKey || viewMode === 'NASA_GIBS') return;

    const collections: PlanetaryComputerCollectionId[] =
      viewMode === 'SAR_OPTICAL_COMPARE'
        ? ['sentinel-1-rtc', 'sentinel-2-l2a']
        : [viewMode];

    const controller = new AbortController();

    Promise.all(
      collections.map((collectionId) =>
        fetchBasinEarthObservationScene({
          collectionId,
          region,
          temporalMode,
          zoom: 9,
          signal: controller.signal,
        }).then((res) => [collectionId, res] as const)
      )
    )
      .then((entries) => {
        if (controller.signal.aborted) return;
        setPcResults((prev) => {
          const next = { ...prev };
          for (const [cid, res] of entries) {
            next[cid] = res;
          }
          return next;
        });
        setLoadedQueryKey(activeQueryKey);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadedQueryKey(activeQueryKey);
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeQueryKey, region, temporalMode, viewMode]);

  if (!region) return null;

  const gibsTile = buildNasaGibsWmtsTileUrl({
    layerId: gibsLayerId,
    dateIso: gibsDateIso,
    latitudeDeg: region.latitudeDeg,
    longitudeDeg: region.longitudeDeg,
    zoom: gibsZoom,
  });

  const gibsLayerSpec =
    NASA_GIBS_LAYERS.find((l) => l.id === gibsLayerId) ?? NASA_GIBS_LAYERS[0];

  return (
    <div className="rounded-2xl border border-[#1E2D45] bg-[#141E2E] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E2D45] pb-3">
        <div className="flex items-center gap-2">
          <Satellite className="h-4 w-4 text-[#42D9F5]" aria-hidden="true" />
          <div>
            <h3 className="font-display text-sm font-bold text-[#F1F5FA]">
              EARTH-OBSERVATION SATELLITE IMAGERY & SENSOR CONTEXT
            </h3>
            <p className="text-[11px] text-[#8E9BAD]">
              Microsoft Planetary Computer STAC (Sentinel-1 RTC SAR · Sentinel-2 L2A Optical ·
              Copernicus DEM) & NASA GIBS WMTS over Earth-observation reference basins
            </p>
          </div>
        </div>
      </div>

      {hasCloudPenetratingPayload === false && region.cloudCoverFraction >= 0.7 && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#FFB547]/40 bg-[#FFB547]/10 p-3 text-xs text-[#FFB547]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Spacecraft Payload Notice:</strong> Your active payload has no cloud-penetrating
            radar. Optical sensors cannot image through {region.name}&apos;s{' '}
            {Math.round(region.cloudCoverFraction * 100)}% monsoon cloud deck; compare Sentinel-1
            C-SAR below.
          </span>
        </div>
      )}

      {/* Mode Tabs */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {VIEW_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setViewMode(m.id)}
            className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
              viewMode === m.id
                ? 'border-[#42D9F5]/60 bg-[#42D9F5]/15 text-[#42D9F5]'
                : 'border-[#2A3B57] bg-[#0D1422] text-[#8E9BAD] hover:text-[#F1F5FA]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label
            htmlFor="eo-basin-select"
            className="block font-mono text-[11px] uppercase text-[#8E9BAD]"
          >
            Target Flood Basin
          </label>
          <select
            id="eo-basin-select"
            value={region.id}
            onChange={(e) => {
              setSelectedRegionId(e.target.value);
              setGibsImageState('LOADING');
            }}
            className="mt-1 w-full rounded-lg border border-[#2A3B57] bg-[#0D1422] px-2.5 py-1.5 text-xs text-[#F1F5FA]"
          >
            {targetRegions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        {viewMode !== 'NASA_GIBS' ? (
          <>
            <div>
              <label
                htmlFor="eo-window-select"
                className="block font-mono text-[11px] uppercase text-[#8E9BAD]"
              >
                STAC Temporal Window
              </label>
              <select
                id="eo-window-select"
                value={temporalMode}
                onChange={(e) => setTemporalMode(e.target.value as TemporalSearchMode)}
                disabled={viewMode === 'cop-dem-glo-30'}
                className="mt-1 w-full rounded-lg border border-[#2A3B57] bg-[#0D1422] px-2.5 py-1.5 text-xs text-[#F1F5FA] disabled:opacity-60"
              >
                <option value="MONSOON_2024">2024 Monsoon Archive (Aug–Sep 2024)</option>
                <option value="RECENT_ARCHIVE">Recent Archive (Last 45 Days)</option>
              </select>
            </div>

            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0 flex-1 rounded-lg border border-[#2A3B57] bg-[#0D1422] px-2.5 py-1.5 font-mono text-[11px] text-[#8E9BAD]">
                <span className="block truncate text-[#F1F5FA]">
                  {region.latitudeDeg.toFixed(2)}°, {region.longitudeDeg.toFixed(2)}°
                </span>
                <span className="block truncate text-[10px]">
                  Basin Monsoon Cloud: {Math.round(region.cloudCoverFraction * 100)}%
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRefreshNonce((n) => n + 1)}
                title="Re-query Planetary Computer STAC"
                className="inline-flex items-center gap-1 rounded-lg border border-[#2A3B57] bg-[#0D1422] px-3 py-2 font-mono text-[11px] font-semibold text-[#42D9F5] hover:border-[#42D9F5]"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Refresh
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <label
                htmlFor="gibs-layer-select"
                className="block font-mono text-[11px] uppercase text-[#8E9BAD]"
              >
                NASA GIBS Layer
              </label>
              <select
                id="gibs-layer-select"
                value={gibsLayerId}
                onChange={(e) => {
                  setGibsLayerId(e.target.value as NasaGibsLayerId);
                  setGibsImageState('LOADING');
                }}
                className="mt-1 w-full rounded-lg border border-[#2A3B57] bg-[#0D1422] px-2.5 py-1.5 text-xs text-[#F1F5FA]"
              >
                {NASA_GIBS_LAYERS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="gibs-date-input"
                  className="block font-mono text-[11px] uppercase text-[#8E9BAD]"
                >
                  UTC Date
                </label>
                <input
                  id="gibs-date-input"
                  type="date"
                  value={gibsDateIso}
                  max="2026-12-31"
                  onChange={(e) => {
                    setGibsDateIso(e.target.value);
                    setGibsImageState('LOADING');
                  }}
                  className="mt-1 w-full rounded-lg border border-[#2A3B57] bg-[#0D1422] px-2 py-1.5 font-mono text-xs text-[#F1F5FA]"
                />
              </div>
              <div>
                <label
                  htmlFor="gibs-zoom-input"
                  className="block font-mono text-[11px] uppercase text-[#8E9BAD]"
                >
                  Zoom (z={gibsZoom})
                </label>
                <input
                  id="gibs-zoom-input"
                  type="range"
                  min={3}
                  max={8}
                  value={gibsZoom}
                  onChange={(e) => {
                    setGibsZoom(Number(e.target.value));
                    setGibsImageState('LOADING');
                  }}
                  className="mt-2.5 w-full accent-[#42D9F5]"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Main Imagery Content */}
      {viewMode === 'SAR_OPTICAL_COMPARE' ? (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <EoSceneCard
            collectionId="sentinel-1-rtc"
            region={region}
            result={pcResults['sentinel-1-rtc'] ?? null}
            loading={pcLoading}
          />
          <EoSceneCard
            collectionId="sentinel-2-l2a"
            region={region}
            result={pcResults['sentinel-2-l2a'] ?? null}
            loading={pcLoading}
          />
        </div>
      ) : viewMode !== 'NASA_GIBS' ? (
        <div className="mt-4">
          <EoSceneCard
            collectionId={viewMode}
            region={region}
            result={pcResults[viewMode] ?? null}
            loading={pcLoading}
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="relative overflow-hidden rounded-xl border border-[#1E2D45] bg-[#080B12] md:col-span-5">
            {gibsImageState !== 'OFFLINE_FALLBACK' ? (
              <img
                src={gibsTile.url}
                alt={`NASA GIBS ${gibsLayerId} tile for ${region.name}`}
                onLoad={() => {
                  setGibsImageState('LIVE');
                  recordEoDatasetUsage({
                    source: 'NASA_GIBS',
                    datasetId: gibsLayerId,
                    label: gibsLayerSpec.label,
                    observationType: 'OPTICAL',
                    basinName: region.name,
                    itemId: `${gibsDateIso}/z${gibsTile.tile.z}/x${gibsTile.tile.x}/y${gibsTile.tile.y}`,
                    acquisitionDatetimeIso: `${gibsDateIso}T00:00:00Z`,
                    archiveStatus: 'ARCHIVED',
                    isFallback: false,
                    attribution: NASA_GIBS_ATTRIBUTION,
                  });
                }}
                onError={() => {
                  setGibsImageState('OFFLINE_FALLBACK');
                  recordEoDatasetUsage({
                    source: 'NASA_GIBS',
                    datasetId: gibsLayerId,
                    label: gibsLayerSpec.label,
                    observationType: 'OPTICAL',
                    basinName: region.name,
                    itemId: null,
                    acquisitionDatetimeIso: `${gibsDateIso}T00:00:00Z`,
                    archiveStatus: 'BASELINE_FALLBACK',
                    isFallback: true,
                    attribution: NASA_GIBS_ATTRIBUTION,
                  });
                }}
                className="h-52 w-full object-cover"
              />
            ) : (
              <div className="flex h-52 flex-col items-center justify-center p-4 text-center">
                <WifiOff className="h-6 w-6 text-[#FFB547]" aria-hidden="true" />
                <p className="mt-2 font-mono text-xs font-bold text-[#F1F5FA]">
                  Offline / Sandboxed Tile Fallback
                </p>
                <p className="mt-1 text-[11px] text-[#8E9BAD]">
                  {region.name} ({region.latitudeDeg.toFixed(2)}°, {region.longitudeDeg.toFixed(2)}
                  °) · Simulated Monsoon Cloud Opacity:{' '}
                  {Math.round(region.cloudCoverFraction * 100)}%
                </p>
                <p className="mt-2 font-mono text-[11px] text-[#42D9F5]">
                  Tile z{gibsTile.tile.z}/y{gibsTile.tile.y}/x{gibsTile.tile.x} · Switch network on
                  to fetch live MODIS/VIIRS
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3 md:col-span-7">
            <div className="rounded-xl border border-[#1E2D45] bg-[#0D1422] p-3.5 text-xs">
              <div className="flex items-center justify-between gap-2 font-mono text-[11px] font-bold uppercase text-[#42D9F5]">
                <span className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                  Basin Coordinates & Cloud Obscuration
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    gibsImageState === 'LIVE'
                      ? 'bg-[#38D996]/15 text-[#38D996]'
                      : gibsImageState === 'OFFLINE_FALLBACK'
                        ? 'bg-[#FFB547]/15 text-[#FFB547]'
                        : 'bg-[#42D9F5]/15 text-[#42D9F5]'
                  }`}
                >
                  {gibsImageState === 'LIVE'
                    ? 'LIVE NASA GIBS'
                    : gibsImageState === 'OFFLINE_FALLBACK'
                      ? 'OFFLINE FALLBACK'
                      : 'LOADING'}
                </span>
              </div>
              <p className="mt-1.5 text-[#F1F5FA]">{region.description}</p>
              <div className="mt-2 flex flex-wrap gap-3 font-mono text-[11px] text-[#8E9BAD]">
                <span>
                  Lat/Lon: {region.latitudeDeg}°, {region.longitudeDeg}°
                </span>
                <span>Sensor: {gibsLayerSpec.satellite} (OPTICAL)</span>
                <span>
                  Tile: z={gibsTile.tile.z}, x={gibsTile.tile.x}, y={gibsTile.tile.y}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-[#1E2D45] bg-[#0D1422] p-3.5 text-xs">
              <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase text-[#38D996]">
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Why Active SAR Complements Optical Imagery</span>
              </div>
              <p className="mt-1 text-[#8E9BAD]">
                Terra MODIS and Suomi-NPP VIIRS optical reflectance bands capture top-of-atmosphere
                storm cloud decks, showing why Earth-observation missions use C-Band / X-Band Synthetic Aperture
                Radar (such as Sentinel-1 RTC) when storm clouds obscure river basins.
              </p>
            </div>

            <p className="font-mono text-[11px] leading-relaxed text-[#8E9BAD]">
              Attribution: {NASA_GIBS_ATTRIBUTION}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

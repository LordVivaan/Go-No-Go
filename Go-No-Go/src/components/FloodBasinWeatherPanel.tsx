import {
  Cloud,
  CloudRain,
  Compass,
  RefreshCw,
  Satellite,
  Sun,
  Thermometer,
  Wind,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  FLOODWATCH_BASIN_BY_ID,
  FLOODWATCH_WEATHER_BASINS,
  type FloodwatchBasinId,
  type WeatherClassification,
  type WeatherQueryResult,
  type WeatherWindowMode,
} from '../types/weather';
import { fetchBasinWeather } from '../services/weatherService';

interface FloodBasinWeatherPanelProps {
  initialBasinId?: FloodwatchBasinId;
  hasCloudPenetratingPayload?: boolean;
  autoFetchOnMount?: boolean;
}

const WINDOW_MODES: ReadonlyArray<{
  id: WeatherWindowMode;
  label: string;
  tag: string;
}> = [
  { id: 'current', label: 'Current Slot', tag: 'ANALYSIS' },
  { id: 'forecast_24h', label: '+24h Outlook', tag: 'FORECAST' },
  { id: 'historical_24h', label: '-24h Archive', tag: 'HISTORICAL' },
];

function classificationBadgeClass(classification: WeatherClassification): string {
  switch (classification) {
    case 'FORECAST':
      return 'border-[#FFB547]/40 bg-[#FFB547]/15 text-[#FFB547]';
    case 'HISTORICAL':
      return 'border-[#42D9F5]/40 bg-[#42D9F5]/15 text-[#42D9F5]';
    default:
      return 'border-[#38D996]/40 bg-[#38D996]/15 text-[#38D996]';
  }
}

function classificationLabel(classification: WeatherClassification): string {
  switch (classification) {
    case 'FORECAST':
      return 'MODEL FORECAST';
    case 'HISTORICAL':
      return 'HISTORICAL ARCHIVE';
    default:
      return 'CURRENT ANALYSIS';
  }
}

function formatMetric(value: number | null, unit: string, decimals = 1): string {
  if (value === null || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(decimals)} ${unit}`;
}

export function FloodBasinWeatherPanel({
  initialBasinId = 'basin-brahmaputra',
  hasCloudPenetratingPayload = true,
  autoFetchOnMount = true,
}: FloodBasinWeatherPanelProps) {
  const [selectedBasinId, setSelectedBasinId] =
    useState<FloodwatchBasinId>(initialBasinId);
  const [windowMode, setWindowMode] = useState<WeatherWindowMode>('current');
  const [manualLoading, setManualLoading] = useState(false);
  const [loadedState, setLoadedState] = useState<{
    key: string;
    result: WeatherQueryResult;
  } | null>(null);

  const activeKey = `${selectedBasinId}:${windowMode}`;
  const result = loadedState?.key === activeKey ? loadedState.result : null;
  const loading = manualLoading || (autoFetchOnMount && result === null);

  const loadWeather = useCallback(
    async (
      basinId: FloodwatchBasinId,
      mode: WeatherWindowMode,
      bypassClientCache = false,
      signal?: AbortSignal,
    ) => {
      setManualLoading(true);
      try {
        const res = await fetchBasinWeather({
          basinId,
          windowMode: mode,
          bypassClientCache,
          signal,
        });
        setLoadedState({ key: `${basinId}:${mode}`, result: res });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      } finally {
        setManualLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!autoFetchOnMount) return;
    const controller = new AbortController();
    let cancelled = false;
    fetchBasinWeather({
      basinId: selectedBasinId,
      windowMode,
      signal: controller.signal,
    })
      .then((res) => {
        if (!cancelled) {
          setLoadedState({ key: `${selectedBasinId}:${windowMode}`, result: res });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [autoFetchOnMount, selectedBasinId, windowMode]);

  const basin = FLOODWATCH_BASIN_BY_ID[selectedBasinId];
  const snapshot = result?.snapshot ?? null;

  const cloudPct = snapshot?.current.metrics.totalCloudCoverPct ?? null;
  const precipMm = snapshot?.current.metrics.precip1hMm ?? null;

  return (
    <div className="space-y-3 text-slate-200">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#1E2D45] bg-[#0D1422] p-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="FLOODWATCH Target Basin">
          {FLOODWATCH_WEATHER_BASINS.map((b) => {
            const active = b.id === selectedBasinId;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBasinId(b.id)}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  active
                    ? 'border-[#42D9F5]/60 bg-[#42D9F5]/15 text-[#F1F5FA]'
                    : 'border-white/10 bg-black/25 text-slate-400 hover:border-white/25 hover:text-slate-200'
                }`}
              >
                {b.name}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {WINDOW_MODES.map((w) => {
            const active = w.id === windowMode;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => setWindowMode(w.id)}
                className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider transition ${
                  active
                    ? 'border-[#38D996]/60 bg-[#38D996]/15 text-[#38D996]'
                    : 'border-white/10 bg-black/25 text-slate-400 hover:text-slate-200'
                }`}
              >
                {w.label}
              </button>
            );
          })}

          <button
            type="button"
            disabled={loading}
            onClick={() => void loadWeather(selectedBasinId, windowMode, true)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Querying...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Basin Coordinate Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[11px]">
        <div className="flex items-center gap-2">
          <Compass className="h-3.5 w-3.5 text-[#42D9F5]" />
          <span className="font-semibold text-[#F1F5FA]">{basin.name}</span>
          <span className="font-mono text-slate-400">
            {basin.lat.toFixed(2)}°, {basin.lon.toFixed(2)}°
          </span>
        </div>
        <div className="font-mono text-[10px] text-slate-400">
          {basin.regionLabel} · Scenario baseline cloud:{' '}
          <span className="text-slate-200">
            {Math.round(basin.baselineCloudCoverFraction * 100)}%
          </span>
        </div>
      </div>

      {/* Live Snapshot */}
      {snapshot ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#1E2D45] bg-[#0D1422] px-3 py-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${classificationBadgeClass(
                  snapshot.classification,
                )}`}
              >
                {classificationLabel(snapshot.classification)}
              </span>
              <span className="text-slate-300">{snapshot.classificationNote}</span>
            </div>
            <div className="font-mono text-[10px] text-slate-400">
              Source: {snapshot.source.provider} ({snapshot.source.model}) · Cache:{' '}
              <span className="text-slate-200">{snapshot.source.cacheStatus}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-black/25 p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#42D9F5]">
                <CloudRain className="h-3.5 w-3.5" /> 1h Precip
              </div>
              <div className="mt-1 font-mono text-sm font-bold text-[#F1F5FA]">
                {formatMetric(precipMm, 'mm', 1)}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                Rainfall context (not flood extent)
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/25 p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                <Cloud className="h-3.5 w-3.5 text-cyan-300" /> Cloud Cover
              </div>
              <div className="mt-1 font-mono text-sm font-bold text-[#F1F5FA]">
                {formatMetric(cloudPct, '%', 0)}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                {cloudPct !== null && cloudPct >= 60
                  ? 'Optical occluded · SAR suited'
                  : 'Optical window viable'}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/25 p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                <Wind className="h-3.5 w-3.5 text-emerald-300" /> 10m Wind
              </div>
              <div className="mt-1 font-mono text-sm font-bold text-[#F1F5FA]">
                {formatMetric(snapshot.current.metrics.windSpeed10mMs, 'm/s', 1)}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                Surface synoptic flow
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/25 p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                <Thermometer className="h-3.5 w-3.5 text-amber-300" /> 2m Temp
              </div>
              <div className="mt-1 font-mono text-sm font-bold text-[#F1F5FA]">
                {formatMetric(snapshot.current.metrics.temperature2mC, '°C', 1)}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                Near-surface air temp
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/25 p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                <Sun className="h-3.5 w-3.5 text-amber-300" /> Solar Flux
              </div>
              <div className="mt-1 font-mono text-sm font-bold text-[#F1F5FA]">
                {formatMetric(snapshot.current.metrics.globalSolarRadiationWm2, 'W/m²', 0)}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                Surface GHI (not 1361 W/m² orbit)
              </div>
            </div>
          </div>

          {/* Sensor Suitability Callout */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-3 py-2 text-[11px]">
            <div className="flex items-center gap-2 text-cyan-200">
              <Satellite className="h-3.5 w-3.5 shrink-0 text-[#42D9F5]" />
              <span>
                <strong>Observation Suitability:</strong>{' '}
                {cloudPct !== null && cloudPct >= 60
                  ? `Heavy cloud (${Math.round(cloudPct)}%) degrades Sentinel-2 L2A optical passes.`
                  : 'Moderate/low cloud deck permits multispectral optical inspection.'}{' '}
                {hasCloudPenetratingPayload
                  ? 'Active microwave SAR penetrates cloud cover.'
                  : 'Current spacecraft manifest lacks SAR cloud penetration.'}
              </span>
            </div>
            <div className="font-mono text-[10px] text-slate-400">
              Data UTC: {snapshot.dataTimeUtc} · Retrieved UTC: {snapshot.retrievedAtUtc}
            </div>
          </div>

          {/* Multi-step Series (Forecast or Historical windows) */}
          {snapshot.series.length > 1 && (
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/25">
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="border-b border-white/10 bg-white/5 text-[10px] uppercase text-slate-400">
                  <tr>
                    <th className="px-2.5 py-1.5">Valid Time (UTC)</th>
                    <th className="px-2.5 py-1.5">Class</th>
                    <th className="px-2.5 py-1.5">Precip (mm)</th>
                    <th className="px-2.5 py-1.5">Cloud (%)</th>
                    <th className="px-2.5 py-1.5">Wind (m/s)</th>
                    <th className="px-2.5 py-1.5">Temp (°C)</th>
                    <th className="px-2.5 py-1.5">Solar (W/m²)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {snapshot.series.map((step) => (
                    <tr key={step.validTimeUtc}>
                      <td className="px-2.5 py-1.5">{step.validTimeUtc}</td>
                      <td className="px-2.5 py-1.5">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${classificationBadgeClass(
                            step.classification,
                          )}`}
                        >
                          {step.classification}
                        </span>
                      </td>
                      <td className="px-2.5 py-1.5">
                        {formatMetric(step.metrics.precip1hMm, 'mm', 1)}
                      </td>
                      <td className="px-2.5 py-1.5">
                        {formatMetric(step.metrics.totalCloudCoverPct, '%', 0)}
                      </td>
                      <td className="px-2.5 py-1.5">
                        {formatMetric(step.metrics.windSpeed10mMs, 'm/s', 1)}
                      </td>
                      <td className="px-2.5 py-1.5">
                        {formatMetric(step.metrics.temperature2mC, '°C', 1)}
                      </td>
                      <td className="px-2.5 py-1.5">
                        {formatMetric(step.metrics.globalSolarRadiationWm2, 'W/m²', 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[10px] text-slate-400">
            <ul className="list-disc space-y-0.5 pl-4">
              {snapshot.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </>
      ) : result ? (
        <div
          role="status"
          className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-[#FFB547]">
            <span>Fallback State · {result.status}</span>
            <span>
              Scenario Baseline Cloud:{' '}
              {Math.round(result.fallbackBaselineCloudFraction * 100)}%
            </span>
          </div>
          <p className="mt-1.5 text-slate-200">{result.message}</p>
          <p className="mt-1 text-[11px] text-slate-300">
            Mission simulation continues unaffected using deterministic FLOODWATCH orbital mechanics
            and static basin cloud assumptions.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-slate-300">
          {loading
            ? 'Requesting Meteomatics weather context via same-origin /api/weather...'
            : 'Click Refresh to query weather context for the selected basin.'}
        </div>
      )}
    </div>
  );
}

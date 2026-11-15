import {
  ArrowRight,
  CloudRain,
  Compass,
  Droplets,
  Gauge,
  Satellite,
  ShieldAlert,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { EarthEnvironmentalWeatherPanel } from '../components/FloodBasinWeatherPanel';
import { NasaEarthObservationPanel } from '../components/NasaEarthObservationPanel';
import { DIFFICULTY_PROFILES, MISSION_SCENARIOS } from '../data/scenarios';
import { EarthScene } from '../scenes/EarthScene';
import { MISSION_PRESETS, useMissionStore, useResolvedMission } from '../store/missionStore';
import type { MissionDifficulty, TargetRegion } from '../types/mission';
import {
  FLOODWATCH_WEATHER_BASINS,
  isFloodwatchBasinId,
  type FloodwatchBasinId,
} from '../types/weather';

const EARTH_REFERENCE_REGIONS: TargetRegion[] = FLOODWATCH_WEATHER_BASINS.map((b) => ({
  id: b.id,
  name: b.name,
  latitudeDeg: b.lat,
  longitudeDeg: b.lon,
  radiusKm: 360,
  cloudCoverFraction: b.baselineCloudCoverFraction,
  priorityWeight: 0.25,
  description: b.regionLabel,
}));

const DIFFICULTY_KEYS: MissionDifficulty[] = ['STANDARD', 'HARD', 'EXPERT'];

export function MissionBriefing() {
  const navigate = useNavigate();
  const [showNasaModal, setShowNasaModal] = useState(false);
  const [showWeatherModal, setShowWeatherModal] = useState(false);
  const [weatherBasinId, setWeatherBasinId] =
    useState<FloodwatchBasinId>('basin-brahmaputra');

  const scenarioId = useMissionStore((s) => s.scenarioId);
  const difficulty = useMissionStore((s) => s.difficulty);
  const setDifficulty = useMissionStore((s) => s.setDifficulty);
  const selectScenario = useMissionStore((s) => s.selectScenario);
  const applyPreset = useMissionStore((s) => s.applyPreset);

  const { scenario, orbit, instruments, engineering } = useResolvedMission();
  const hasCloudPenetrating = instruments.some((inst) => inst.cloudPenetrating);
  const profile = DIFFICULTY_PROFILES[difficulty];
  const dailyDataTargetGb = Number(
    scenario.kpps.find((k) => k.metricKey === 'dailyDataGb')?.thresholdValue ?? 20
  );

  useEffect(() => {
    if (!showNasaModal && !showWeatherModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNasaModal(false);
        setShowWeatherModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showNasaModal, showWeatherModal]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#040914]">
      {/* Full-viewport 3D Earth & Moon backdrop */}
      <div className="absolute inset-0 z-0">
        <EarthScene
          celestialBody={scenario.celestialBody}
          orbit={orbit}
          periodSeconds={engineering.orbital.orbitalPeriodSec}
          heightClass="h-full"
          ambientMode
          showMoonInBackground={scenario.celestialBody === 'EARTH'}
          showHudControls={false}
          showSwathCone={false}
          showGroundStations={false}
        />
      </div>

      {/* Subtle directional readability scrim leaving 3D Earth + Moon clearly visible */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-r from-[#040914]/92 via-[#040914]/65 to-[#040914]/25" />

      {/* Floating Liquid-Glass Briefing Overlay */}
      <div className="relative z-10 flex h-full w-full items-start overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          {/* Left Primary Mission Briefing Deck */}
          <section className="w-full max-w-2xl rounded-2xl border border-white/12 bg-[#070f20]/78 p-4 shadow-2xl backdrop-blur-xl sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/35 bg-cyan-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-cyan-200">
                <Satellite className="h-3.5 w-3.5" /> Stage 01 · Mission Briefing
              </div>
              <span className="font-mono text-[11px] text-slate-400">
                {scenario.riskClass}-Class · {scenario.simulationDurationDays}-Day Flight Test
              </span>
            </div>

            <div className="mt-3">
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                GO / NO-GO
              </h1>
              <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-cyan-300/90">
                Design. Validate. Launch. · Every decision determines the mission.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                Interactive spacecraft mission engineering and flight-readiness simulator. Trade
                bus architectures, payloads, orbits, and launch vehicles across six integrated
                stages—from systems verification and strict NO-GO launch locks to deterministic
                orbital operations and mission debrief.
              </p>
              <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                    Active Scenario · {scenario.code}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {scenario.celestialBody} · {scenario.title}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-200">
                  {scenario.briefing.primaryObjective}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  {scenario.briefing.context}
                </p>
              </div>
            </div>

            {/* Difficulty Selection (materially alters margins, cost cap & anomaly stress) */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  Flight Complexity & Engineering Difficulty
                </span>
                <span className="font-mono text-[11px] text-cyan-300">
                  Cap ${scenario.budgetCapMusd.toFixed(1)}M · {dailyDataTargetGb.toFixed(0)} GB/day
                </span>
              </div>

              <div
                role="radiogroup"
                aria-label="Mission Difficulty"
                className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3"
              >
                {DIFFICULTY_KEYS.map((key) => {
                  const item = DIFFICULTY_PROFILES[key];
                  const selected = difficulty === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setDifficulty(key)}
                      className={`rounded-xl border p-2.5 text-left transition ${
                        selected
                          ? 'border-cyan-400/60 bg-cyan-500/18 text-white ring-1 ring-cyan-400/35'
                          : 'border-white/10 bg-black/30 text-slate-300 hover:border-white/25 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider">
                          {item.label}
                        </span>
                        <span className="font-mono text-[10px] text-cyan-300">
                          {Math.round(item.budgetMultiplier * 100)}% Cap
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] font-medium text-slate-400">
                        {item.subtitle}
                      </div>
                      <div className="mt-1.5 font-mono text-[10px] text-slate-300">
                        Margin {item.minPowerMarginPct}% · {item.anomalyRateMultiplier}× Anom
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="mt-2 text-xs text-slate-400">{profile.description}</p>
            </div>

            {/* Active Constraints Summary */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Budget Ceiling</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-emerald-300">
                  ${scenario.budgetCapMusd.toFixed(1)}M
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Daily Science</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-cyan-300">
                  {dailyDataTargetGb.toFixed(0)} GB/day
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">RF Link Floor</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-amber-300">
                  +{profile.minLinkMarginDb.toFixed(1)} dB
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Max DoD / Anom</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-slate-100">
                  {profile.maxBatteryDodPct}% / {profile.anomalyStressMultiplier}×
                </div>
              </div>
            </div>

            {/* Target Scenarios & Starting Configurations */}
            <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-3.5">
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <Compass className="h-3.5 w-3.5 text-cyan-300" /> Mission Scenario
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MISSION_SCENARIOS.map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => selectScenario(sc.id)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                        sc.id === scenarioId
                          ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-100'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {sc.code}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Quick Architecture Baselines
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MISSION_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                      className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-left text-[11px] font-medium text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-500/10"
                    >
                      {preset.badge} · {preset.name.split(' (')[0]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Primary CTA */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => navigate('/architecture')}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-black tracking-wide text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300"
              >
                Start Mission Architecture
                <ArrowRight className="h-4 w-4" />
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNasaModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                  title="Optional terrestrial Earth-observation reference imagery (Planetary Computer & NASA GIBS)"
                >
                  <Droplets className="h-3.5 w-3.5 text-cyan-300" />
                  EO Imagery Reference
                </button>
                <button
                  type="button"
                  onClick={() => setShowWeatherModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#42D9F5]/30 bg-[#42D9F5]/10 px-3 py-2 text-xs font-semibold text-[#42D9F5] transition hover:bg-[#42D9F5]/20"
                  title="Optional terrestrial Earth weather reference (Meteomatics)"
                >
                  <CloudRain className="h-3.5 w-3.5" />
                  Earth Weather Reference
                </button>
              </div>
            </div>
          </section>

          {/* Right Compact Mission Success Criteria & Target Card */}
          <section
            aria-label="Mission Key Performance Parameters"
            className="w-full max-w-md rounded-2xl border border-white/12 bg-[#070f20]/72 p-4 backdrop-blur-xl sm:p-5 lg:w-88"
          >
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
              <Gauge className="h-4 w-4" /> Key Performance Parameters
            </div>
            <ul className="mt-3 space-y-2">
              {scenario.kpps.map((kpp) => (
                <li
                  key={kpp.id}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 font-semibold text-slate-100">
                    <span>{kpp.name}</span>
                    <span className="font-mono text-[11px] text-emerald-300">
                      {typeof kpp.goalValue === 'boolean'
                        ? kpp.goalValue
                          ? 'REQUIRED'
                          : 'OPTIONAL'
                        : `${kpp.goalValue} ${kpp.unit}`.trim()}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    Threshold:{' '}
                    {typeof kpp.thresholdValue === 'boolean'
                      ? kpp.thresholdValue
                        ? 'All-Weather / Cloud Penetrating'
                        : 'Optional'
                      : `${kpp.thresholdValue} ${kpp.unit}`.trim()}
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
                <Target className="h-4 w-4" />{' '}
                {scenario.celestialBody === 'MOON'
                  ? 'Lunar Target Regions'
                  : scenario.celestialBody === 'MARS'
                    ? 'Martian Target Regions'
                    : scenario.celestialBody === 'ASTEROID'
                      ? 'Asteroid Target Zones'
                      : 'Target Observation Zones'}{' '}
                ({scenario.targetRegions.length})
              </div>
              <div className="mt-2 space-y-1.5">
                {scenario.targetRegions.map((region) => (
                  <div
                    key={region.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="font-medium text-slate-200">{region.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-400">
                        {Math.round(region.cloudCoverFraction * 100)}% cloud
                      </span>
                      {scenario.celestialBody === 'EARTH' &&
                        isFloodwatchBasinId(region.id) && (
                          <button
                            type="button"
                            onClick={() => {
                              setWeatherBasinId(region.id as FloodwatchBasinId);
                              setShowWeatherModal(true);
                            }}
                            className="rounded border border-[#42D9F5]/30 bg-[#42D9F5]/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#42D9F5] transition hover:bg-[#42D9F5]/20"
                            title={`Inspect Meteomatics weather context for ${region.name}`}
                          >
                            WX
                          </button>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {difficulty !== 'STANDARD' && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <span>
                  <strong>{profile.label} Mode Active:</strong> Baseline designs may require thermal/RF optimization to maintain GO reserves.
                </span>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Expandable Earth Observation Reference Modal */}
      {showNasaModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Earth Observation Reference Data"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/15 bg-[#070f20] p-4 shadow-2xl sm:p-5">
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
              <h2 className="text-sm font-bold text-slate-100">
                Earth-Observation Reference Context (Planetary Computer Sentinel-1/2 · NASA GIBS)
              </h2>
              <button
                type="button"
                onClick={() => setShowNasaModal(false)}
                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 hover:bg-white/10"
                aria-label="Close EO imagery modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NasaEarthObservationPanel
              targetRegions={
                scenario.celestialBody === 'EARTH' ? scenario.targetRegions : EARTH_REFERENCE_REGIONS
              }
            />
          </div>
        </div>
      )}

      {/* Expandable Earth-Observation Meteomatics Environmental Weather Modal */}
      {showWeatherModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Earth-Observation Environmental Weather Context"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/15 bg-[#070f20] p-4 shadow-2xl sm:p-5">
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
              <h2 className="text-sm font-bold text-slate-100">
                Earth-Observation Environmental Weather Context (Meteomatics Mix · Same-Origin /api/weather)
              </h2>
              <button
                type="button"
                onClick={() => setShowWeatherModal(false)}
                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 hover:bg-white/10"
                aria-label="Close environmental weather modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <EarthEnvironmentalWeatherPanel
              initialBasinId={weatherBasinId}
              hasCloudPenetratingPayload={hasCloudPenetrating}
            />
          </div>
        </div>
      )}
    </div>
  );
}

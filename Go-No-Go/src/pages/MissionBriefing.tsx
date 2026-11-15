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
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { EarthEnvironmentalWeatherPanel } from '../components/FloodBasinWeatherPanel';
import { NasaEarthObservationPanel } from '../components/NasaEarthObservationPanel';
import { TechTerm } from '../components/TechTerm';
import { SPACECRAFT_BUSES } from '../data/components';
import { DIFFICULTY_PROFILES, MISSION_SCENARIOS } from '../data/scenarios';
import { ORBIT_CATALOG } from '../data/orbits';
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
  const [sceneFocus, setSceneFocus] = useState<'EARTH' | 'TARGET'>('EARTH');
  const [weatherBasinId, setWeatherBasinId] =
    useState<FloodwatchBasinId>('basin-brahmaputra');
  const nasaDialogRef = useRef<HTMLDialogElement>(null);
  const weatherDialogRef = useRef<HTMLDialogElement>(null);

  const scenarioId = useMissionStore((s) => s.scenarioId);
  const busId = useMissionStore((s) => s.busId);
  const difficulty = useMissionStore((s) => s.difficulty);
  const setDifficulty = useMissionStore((s) => s.setDifficulty);
  const selectScenario = useMissionStore((s) => s.selectScenario);
  const selectBus = useMissionStore((s) => s.selectBus);
  const applyPreset = useMissionStore((s) => s.applyPreset);

  const { scenario, orbit, instruments, engineering } = useResolvedMission();
  const hasCloudPenetrating = instruments.some((inst) => inst.cloudPenetrating);
  const profile = DIFFICULTY_PROFILES[difficulty];
  const dailyDataTargetGb = Number(
    scenario.kpps.find((k) => k.metricKey === 'dailyDataGb')?.thresholdValue ?? 20
  );

  // Initial scene is always Earth with Moon in background; user can toggle to inspect target body
  const effectiveBody = sceneFocus === 'EARTH' ? 'EARTH' : scenario.celestialBody;
  const displayOrbit =
    effectiveBody === 'EARTH' && orbit.celestialBody !== 'EARTH'
      ? (ORBIT_CATALOG.find((o) => o.celestialBody === 'EARTH') ?? orbit)
      : orbit;

  useEffect(() => {
    const dialog = nasaDialogRef.current;
    if (!dialog) return;
    if (showNasaModal && !dialog.open) {
      dialog.showModal();
    } else if (!showNasaModal && dialog.open) {
      dialog.close();
    }
  }, [showNasaModal]);

  useEffect(() => {
    const dialog = weatherDialogRef.current;
    if (!dialog) return;
    if (showWeatherModal && !dialog.open) {
      dialog.showModal();
    } else if (!showWeatherModal && dialog.open) {
      dialog.close();
    }
  }, [showWeatherModal]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#060911]">
      {/* Full-viewport 3D Earth (primary on startup) + Moon backdrop */}
      <div className="absolute inset-0 z-0">
        <EarthScene
          celestialBody={effectiveBody}
          orbit={displayOrbit}
          periodSeconds={engineering.orbital.orbitalPeriodSec}
          heightClass="h-full"
          ambientMode
          showMoonInBackground={effectiveBody === 'EARTH'}
          showHudControls={false}
          showSwathCone={false}
          showGroundStations={false}
        />
      </div>

      {/* Subtle directional readability scrim leaving 3D Earth + Moon clearly visible */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-r from-[#060911]/90 via-[#060911]/55 to-[#060911]/20" />

      {/* Thin-Slice Liquid-Glass Briefing Overlay */}
      <div className="relative z-10 flex h-full w-full items-start overflow-y-auto px-3 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          {/* Left Primary Mission Briefing Deck */}
          <section className="gng-glass-panel w-full max-w-2xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
              <div className="inline-flex items-center gap-2 font-mono-tech text-[11px] font-semibold uppercase tracking-widest text-cyan-300">
                <Satellite className="h-3.5 w-3.5" aria-hidden="true" /> Stage 01 · Mission Briefing
              </div>
              <div className="flex items-center gap-2">
                {scenario.celestialBody !== 'EARTH' && (
                  <div
                    role="group"
                    aria-label="Briefing celestial view"
                    className="gng-glass-slice inline-flex p-0.5 font-mono-tech text-[10px]"
                  >
                    <button
                      type="button"
                      onClick={() => setSceneFocus('EARTH')}
                      className={`rounded px-2 py-0.5 transition ${
                        sceneFocus === 'EARTH'
                          ? 'bg-cyan-400/20 text-cyan-200'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Earth View
                    </button>
                    <button
                      type="button"
                      onClick={() => setSceneFocus('TARGET')}
                      className={`rounded px-2 py-0.5 transition ${
                        sceneFocus === 'TARGET'
                          ? 'bg-cyan-400/20 text-cyan-200'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Target: {scenario.celestialBody}
                    </button>
                  </div>
                )}
                <span className="font-mono-tech text-[11px] text-slate-400">
                  {scenario.riskClass}-Class · {scenario.simulationDurationDays}-Day Flight
                </span>
              </div>
            </div>

            <div className="mt-3">
              <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                GO / NO-GO
              </h1>
              <p className="mt-0.5 font-mono-tech text-[11px] uppercase tracking-widest text-cyan-300/90">
                Spacecraft Systems Engineering &amp; Mission Director Console
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                Design a spacecraft, configure its subsystems and scientific instruments, plan its
                orbit and launch vehicle, review engineering trade-offs, and authorize launch.{' '}
                <strong className="font-semibold text-slate-100">
                  The system advises; you decide.
                </strong>
              </p>
              <div className="gng-glass-card mt-3 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono-tech text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                    Active Scenario · {scenario.code}
                  </span>
                  <span className="font-mono-tech text-[10px] text-slate-400">
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
                <span className="font-mono-tech text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                  Flight Complexity &amp; Engineering Difficulty
                </span>
                <span className="font-mono-tech text-[11px] text-cyan-300">
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
                      data-selected={selected}
                      onClick={() => setDifficulty(key)}
                      className="gng-glass-option p-2.5 text-left"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-100">
                          {item.label}
                        </span>
                        <span className="font-mono-tech text-[10px] text-cyan-300">
                          {Math.round(item.budgetMultiplier * 100)}% Cap
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] font-medium text-slate-400">
                        {item.subtitle}
                      </div>
                      <div className="mt-1 font-mono-tech text-[10px] text-slate-300">
                        Margin {item.minPowerMarginPct}% · {item.anomalyRateMultiplier}× Anom
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="mt-1.5 text-xs text-slate-400">{profile.description}</p>
            </div>

            {/* Active Constraints Summary */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="gng-glass-slice p-2.5">
                <div className="font-mono-tech text-[10px] uppercase tracking-wider text-slate-400">
                  Budget Ceiling
                </div>
                <div className="mt-0.5 font-mono-tech text-sm font-bold text-emerald-300">
                  ${scenario.budgetCapMusd.toFixed(1)}M
                </div>
              </div>
              <div className="gng-glass-slice p-2.5">
                <div className="font-mono-tech text-[10px] uppercase tracking-wider text-slate-400">
                  Daily Science
                </div>
                <div className="mt-0.5 font-mono-tech text-sm font-bold text-cyan-300">
                  {dailyDataTargetGb.toFixed(0)} GB/day
                </div>
              </div>
              <div className="gng-glass-slice p-2.5">
                <div className="flex items-center gap-1 font-mono-tech text-[10px] uppercase tracking-wider text-slate-400">
                  <TechTerm termKey="RF" label="RF" /> Link Floor
                </div>
                <div className="mt-0.5 font-mono-tech text-sm font-bold text-amber-300">
                  +{profile.minLinkMarginDb.toFixed(1)} dB
                </div>
              </div>
              <div className="gng-glass-slice p-2.5">
                <div className="flex items-center gap-1 font-mono-tech text-[10px] uppercase tracking-wider text-slate-400">
                  Max <TechTerm termKey="DOD" label="DoD" />
                </div>
                <div className="mt-0.5 font-mono-tech text-sm font-bold text-slate-100">
                  {profile.maxBatteryDodPct}% / {profile.anomalyStressMultiplier}×
                </div>
              </div>
            </div>

            {/* Target Scenarios & Starting Configurations */}
            <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-3">
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 font-mono-tech text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <Compass className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" /> Mission Scenario
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MISSION_SCENARIOS.map((sc) => {
                    const selected = sc.id === scenarioId;
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        data-selected={selected}
                        onClick={() => selectScenario(sc.id)}
                        className="gng-glass-option px-3 py-1.5 font-mono-tech text-[11px] font-semibold text-slate-200"
                      >
                        {sc.code}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-1.5 font-mono-tech text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <Satellite className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" /> Spacecraft Bus Model
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {SPACECRAFT_BUSES.map((b) => {
                    const selected = b.id === busId;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        data-selected={selected}
                        onClick={() => selectBus(b.id)}
                        className="gng-glass-option p-2.5 text-left"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-slate-100">{b.name}</span>
                          <span className="font-mono-tech text-[10px] text-cyan-300">
                            ${b.costMusd}M
                          </span>
                        </div>
                        <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono-tech text-[10px] text-slate-300">
                          <span>Dry: {b.massKg} kg</span>
                          <span>Max PL: {b.maxPayloadMassKg ?? 0} kg</span>
                          <span>Form: {b.compatibleFormFactors.join('/')}</span>
                          <span>Slots: {b.payloadSlots ?? 2}</span>
                          <span>Base Pwr: {b.powerDrawW} W</span>
                          <span>SSR: {b.storageCapacityGb ?? 64} GB</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-1.5 font-mono-tech text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" /> Quick
                  Architecture Baselines
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MISSION_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                      className="gng-glass-slice px-2.5 py-1 text-left text-[11px] font-medium text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200"
                    >
                      {preset.badge} · {preset.name.split(' (')[0]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Primary CTA */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3.5">
              <button
                type="button"
                onClick={() => navigate('/payloads')}
                className="inline-flex items-center gap-2 rounded-md border border-cyan-300/60 bg-cyan-400 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 transition hover:bg-cyan-300"
              >
                Continue to Payload Selection
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNasaModal(true)}
                  className="gng-glass-slice inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-cyan-400/40"
                  title="Supporting Earth-observation reference imagery (Planetary Computer & NASA GIBS)"
                >
                  <Droplets className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
                  EO Imagery Reference
                </button>
                <button
                  type="button"
                  onClick={() => setShowWeatherModal(true)}
                  className="gng-glass-slice inline-flex items-center gap-1.5 border-[#42D9F5]/25 px-3 py-1.5 text-xs font-medium text-[#42D9F5] transition hover:border-[#42D9F5]/55"
                  title="Supporting Earth weather reference (Meteomatics)"
                >
                  <CloudRain className="h-3.5 w-3.5" aria-hidden="true" />
                  Earth Weather Reference
                </button>
              </div>
            </div>
          </section>

          {/* Right Compact Mission Success Criteria & Target Card */}
          <section
            aria-label="Mission Key Performance Parameters"
            className="gng-glass-panel w-full max-w-md p-4 sm:p-5 lg:w-88"
          >
            <div className="flex items-center gap-2 font-mono-tech text-xs font-bold uppercase tracking-wider text-cyan-300">
              <Gauge className="h-4 w-4" aria-hidden="true" /> Key Performance Parameters
            </div>
            <ul className="mt-3 space-y-1.5">
              {scenario.kpps.map((kpp) => (
                <li key={kpp.id} className="gng-glass-slice px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2 font-semibold text-slate-100">
                    <span>{kpp.name}</span>
                    <span className="font-mono-tech text-[11px] text-emerald-300">
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
              <div className="flex items-center gap-2 font-mono-tech text-xs font-bold uppercase tracking-wider text-emerald-300">
                <Target className="h-4 w-4" aria-hidden="true" />{' '}
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
                    className="gng-glass-slice flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="font-medium text-slate-200">{region.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-tech text-slate-400">
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
                            className="rounded border border-[#42D9F5]/30 bg-[#42D9F5]/10 px-1.5 py-0.5 font-mono-tech text-[10px] font-semibold text-[#42D9F5] transition hover:bg-[#42D9F5]/20"
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
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-400/25 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                <span>
                  <strong>{profile.label} Mode Active:</strong> Baseline designs may require
                  thermal/RF optimization to maintain GO reserves.
                </span>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Native <dialog> for Earth Observation Reference Modal */}
      <dialog
        ref={nasaDialogRef}
        aria-labelledby="eo-modal-title"
        onClose={() => setShowNasaModal(false)}
        className="m-auto max-h-[90vh] w-[min(95vw,64rem)] overflow-y-auto rounded-lg border border-white/15 bg-[#070f20] p-4 shadow-2xl sm:p-5"
      >
        <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
          <h2 id="eo-modal-title" className="text-sm font-bold text-slate-100">
            Earth Observation Reference Data (Planetary Computer Sentinel-1/2 · NASA GIBS)
          </h2>
          <button
            type="button"
            onClick={() => setShowNasaModal(false)}
            className="gng-glass-slice p-1.5 text-slate-300 hover:text-white"
            aria-label="Close EO imagery modal"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {showNasaModal && (
          <NasaEarthObservationPanel
            targetRegions={
              scenario.celestialBody === 'EARTH' ? scenario.targetRegions : EARTH_REFERENCE_REGIONS
            }
          />
        )}
      </dialog>

      {/* Native <dialog> for Earth-Observation Meteomatics Environmental Weather Modal */}
      <dialog
        ref={weatherDialogRef}
        aria-labelledby="wx-modal-title"
        onClose={() => setShowWeatherModal(false)}
        className="m-auto max-h-[90vh] w-[min(95vw,64rem)] overflow-y-auto rounded-lg border border-white/15 bg-[#070f20] p-4 shadow-2xl sm:p-5"
      >
        <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
          <h2 id="wx-modal-title" className="text-sm font-bold text-slate-100">
            Earth-Observation Environmental Weather Context (Meteomatics Mix · Same-Origin /api/weather)
          </h2>
          <button
            type="button"
            onClick={() => setShowWeatherModal(false)}
            className="gng-glass-slice p-1.5 text-slate-300 hover:text-white"
            aria-label="Close environmental weather modal"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {showWeatherModal && (
          <EarthEnvironmentalWeatherPanel
            initialBasinId={weatherBasinId}
            hasCloudPenetratingPayload={hasCloudPenetrating}
          />
        )}
      </dialog>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudRain,
  FastForward,
  Flame,
  Lock,
  Pause,
  Play,
  Power,
  Radio,
  RotateCcw,
  Satellite,
  ShieldAlert,
  Thermometer,
  X,
  Zap,
} from 'lucide-react';
import { EarthScene } from '../scenes/EarthScene';
import { getShortTargetRegionName } from '../data/displayNames';
import { useMissionStore, useResolvedMission } from '../store/missionStore';
import { FIXED_PHYSICS_DT_SECONDS, useSimulationStore } from '../store/simulationStore';
import { NotificationPanel } from '../components/NotificationPanel';
import { MissionTimeline } from '../components/MissionTimeline';
import { NasaEarthObservationPanel } from '../components/NasaEarthObservationPanel';
import { EarthEnvironmentalWeatherPanel } from '../components/FloodBasinWeatherPanel';
import { isFloodwatchBasinId } from '../types/weather';
import type { InstrumentMode } from '../types/simulation';

const SPEEDS: Array<1 | 10 | 60 | 300> = [1, 10, 60, 300];
const MODES: Array<{ id: InstrumentMode; label: string }> = [
  { id: 'OFF', label: 'OFF' },
  { id: 'STANDBY', label: 'STBY' },
  { id: 'NOMINAL_SURVEY', label: 'SURVEY' },
  { id: 'HIGH_RES', label: 'HIGH-RES' },
];

function formatMetShort(metSeconds: number): string {
  const hours = Math.floor(metSeconds / 3600);
  const mins = Math.floor((metSeconds % 3600) / 60);
  return `T+${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
}

export function MissionSimulation() {
  const navigate = useNavigate();
  const { scenario, orbit, instruments, engineering } = useResolvedMission();

  const isRunning = useSimulationStore((s) => s.isRunning);
  const speedMultiplier = useSimulationStore((s) => s.speedMultiplier);
  const seed = useSimulationStore((s) => s.seed);
  const instrumentMode = useSimulationStore((s) => s.instrumentMode);
  const disabledInstrumentIds = useSimulationStore((s) => s.disabledInstrumentIds);
  const safeModeActive = useSimulationStore((s) => s.safeModeActive);
  const heaterOverrideOn = useSimulationStore((s) => s.heaterOverrideOn);
  const downlinkPriorityActive = useSimulationStore((s) => s.downlinkPriorityActive);
  const currentTelemetry = useSimulationStore((s) => s.currentTelemetry);
  const telemetryHistory = useSimulationStore((s) => s.telemetryHistory);
  const events = useSimulationStore((s) => s.events);
  const activeAnomalies = useSimulationStore((s) => s.activeAnomalies);
  const mappedRegionIds = useSimulationStore((s) => s.mappedRegionIds);

  const syncWithMissionIfIdle = useSimulationStore((s) => s.syncWithMissionIfIdle);
  const initializeSimulation = useSimulationStore((s) => s.initializeSimulation);
  const advanceSimulationByElapsedSeconds = useSimulationStore(
    (s) => s.advanceSimulationByElapsedSeconds
  );
  const fastForwardSimulationHours = useSimulationStore((s) => s.fastForwardSimulationHours);
  const togglePlayPause = useSimulationStore((s) => s.togglePlayPause);
  const setSpeedMultiplier = useSimulationStore((s) => s.setSpeedMultiplier);
  const setInstrumentMode = useSimulationStore((s) => s.setInstrumentMode);
  const toggleInstrumentActive = useSimulationStore((s) => s.toggleInstrumentActive);
  const toggleSafeMode = useSimulationStore((s) => s.toggleSafeMode);
  const toggleHeaterOverride = useSimulationStore((s) => s.toggleHeaterOverride);
  const toggleDownlinkPriority = useSimulationStore((s) => s.toggleDownlinkPriority);
  const executeMitigationCommand = useSimulationStore((s) => s.executeMitigationCommand);
  const executeManualDownlinkBurst = useSimulationStore((s) => s.executeManualDownlinkBurst);
  const executeOrbitTrimBurn = useSimulationStore((s) => s.executeOrbitTrimBurn);
  const completeMissionAndGenerateReport = useSimulationStore(
    (s) => s.completeMissionAndGenerateReport
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [eoModalOpen, setEoModalOpen] = useState(false);
  const [weatherModalOpen, setWeatherModalOpen] = useState(false);
  const userLaunchAuthorization = useMissionStore((s) => s.userLaunchAuthorization);
  const isAuthorized = userLaunchAuthorization === 'GO';

  useEffect(() => {
    if (!eoModalOpen && !weatherModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEoModalOpen(false);
        setWeatherModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [eoModalOpen, weatherModalOpen]);

  // Automatically start the orbital simulation once the user has authorized launch
  useEffect(() => {
    if (!isAuthorized) return;
    syncWithMissionIfIdle();
    const simState = useSimulationStore.getState();
    if (simState.currentTelemetry.metSeconds === 0 && !simState.isRunning) {
      simState.initializeSimulation(simState.seed, true);
    }
  }, [isAuthorized, syncWithMissionIfIdle]);

  useEffect(() => {
    if (!isRunning || !isAuthorized) return;
    let rafId = 0;
    let lastMs = performance.now();

    const frame = (nowMs: number) => {
      const dtWallSec = Math.min(0.25, Math.max(0, (nowMs - lastMs) / 1000));
      lastMs = nowMs;
      advanceSimulationByElapsedSeconds(dtWallSec * speedMultiplier);
      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, [advanceSimulationByElapsedSeconds, isAuthorized, isRunning, speedMultiplier]);

  const durationHours = scenario.simulationDurationDays * 24;
  const durationSeconds = durationHours * 3600;
  const missionEnded =
    isAuthorized &&
    (currentTelemetry.metSeconds >= durationSeconds || currentTelemetry.systemHealthPct <= 0);

  // Automatically transition to Mission Debrief when planned timeline completes or mission is lost
  useEffect(() => {
    if (!missionEnded) return;
    const timer = window.setTimeout(() => {
      completeMissionAndGenerateReport();
      navigate('/debrief');
    }, 600);
    return () => window.clearTimeout(timer);
  }, [completeMissionAndGenerateReport, missionEnded, navigate]);

  const maxSwathKm = useMemo(
    () => instruments.reduce((m, i) => Math.max(m, i.swathWidthKm), 185),
    [instruments]
  );

  const unresolvedAnomalies = useMemo(
    () => activeAnomalies.filter((a) => !a.resolved),
    [activeAnomalies]
  );

  const activeRegion = useMemo(
    () =>
      scenario.targetRegions.find((r) => r.id === currentTelemetry.activeTargetRegionId) ?? null,
    [currentTelemetry.activeTargetRegionId, scenario.targetRegions]
  );

  const metHours = currentTelemetry.metSeconds / 3600;
  const missionPct = Math.min(100, (metHours / Math.max(1, durationHours)) * 100);
  const hasCloudPenetrating = instruments.some(
    (i) => i.cloudPenetrating && !disabledInstrumentIds.includes(i.id)
  );

  const handleComplete = () => {
    completeMissionAndGenerateReport();
    navigate('/debrief');
  };

  if (!isAuthorized) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#060911] p-4">
        <div className="gng-glass-panel max-w-lg space-y-4 border border-cyan-400/35 p-6 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md border border-cyan-400/40 bg-cyan-500/12 text-cyan-300">
            <Lock className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <div className="font-mono-tech text-[11px] font-bold uppercase tracking-widest text-cyan-300">
              AWAITING MISSION DIRECTOR LAUNCH AUTHORIZATION
            </div>
            <h1 className="font-display text-xl font-bold text-[#F1F5FA]">
              Authorize Launch in Stage 04 Before Entering Orbit
            </h1>
            <p className="text-xs leading-relaxed text-[#8E9BAD]">
              Review the engineering assessment in Verification and select{' '}
              <strong className="text-slate-200">GO — Authorize Launch</strong> to initiate the
              launch sequence and automatic orbital operations. Even if engineering advises NO-GO,
              you may authorize launch after acknowledging the risks.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <Link
              to="/verification"
              className="rounded-md border border-cyan-300/60 bg-cyan-400 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 transition hover:bg-cyan-300"
            >
              Go to Launch Decision (Stage 04)
            </Link>
            <Link
              to="/architecture"
              className="gng-glass-slice px-4 py-2 text-xs font-semibold text-[#F1F5FA] hover:border-[#42D9F5]/50"
            >
              Return to Architecture
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#080B12]">
      {/* Full-Bleed Interactive Orbital Globe */}
      <EarthScene
        celestialBody={scenario.celestialBody}
        orbit={orbit}
        periodSeconds={engineering.orbital.orbitalPeriodSec}
        currentMetSeconds={currentTelemetry.metSeconds}
        swathWidthKm={maxSwathKm}
        targetRegions={scenario.targetRegions}
        showGroundStations={true}
        showSwathCone={true}
        showMoonInBackground={scenario.celestialBody === 'EARTH'}
        showHudControls={false}
        syncToMissionTime={true}
        activeTargetRegionId={currentTelemetry.activeTargetRegionId}
        activeGroundStationId={currentTelemetry.activeGroundStationId}
        heightClass="h-full"
        className="rounded-none border-0"
      />

      {/* Non-blocking Floating Glass HUD Overlay */}
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between gap-3 overflow-y-auto px-3 pb-3 pt-28 sm:px-5 sm:pb-4 sm:pt-24 xl:pt-20">
        {/* Top Row: Left Live Telemetry Strip & Right Basin Coverage / Drawer */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* Top-Left Telemetry Island */}
          <div className="gng-glass-panel pointer-events-auto w-full max-w-md space-y-2.5 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    isRunning ? 'bg-[#38D996]' : 'bg-[#FFB547]'
                  }`}
                />
                <span className="font-mono-tech text-xs font-bold tabular-nums text-[#F1F5FA]">
                  {formatMetShort(currentTelemetry.metSeconds)}
                </span>
                <span className="font-mono-tech text-[11px] tabular-nums text-[#8E9BAD]">
                  | Orbit #{currentTelemetry.orbitNumber} | {missionPct.toFixed(0)}%
                </span>
              </div>
              <span className="gng-glass-pill px-2.5 py-0.5 font-mono-tech text-[11px] tabular-nums text-[#42D9F5]">
                Seed #{seed}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 font-mono-tech text-[11px] tabular-nums sm:grid-cols-6">
              <div className="gng-glass-card p-2">
                <div className="text-[#8E9BAD]">SoC</div>
                <div
                  className={`font-bold ${
                    currentTelemetry.batterySocPct <= 25
                      ? 'text-[#FF5364]'
                      : currentTelemetry.batterySocPct <= 45
                        ? 'text-[#FFB547]'
                        : 'text-[#38D996]'
                  }`}
                >
                  {currentTelemetry.batterySocPct.toFixed(1)}%
                </div>
              </div>
              <div className="gng-glass-card p-2">
                <div className="text-[#8E9BAD]">SSR</div>
                <div className="font-bold text-[#42D9F5]">
                  {currentTelemetry.ssrBacklogGb.toFixed(1)} GB
                </div>
              </div>
              <div className="gng-glass-card p-2">
                <div className="text-[#8E9BAD]">Temp</div>
                <div className="font-bold text-[#F1F5FA]">
                  {currentTelemetry.temperatureC.toFixed(1)}°C
                </div>
              </div>
              <div className="gng-glass-card p-2">
                <div className="text-[#8E9BAD]">Prop</div>
                <div className="font-bold text-[#F1F5FA]">
                  {currentTelemetry.propellantRemainingKg.toFixed(1)} kg
                </div>
              </div>
              <div className="gng-glass-card p-2">
                <div className="text-[#8E9BAD]">Down</div>
                <div className="font-bold text-[#38D996]">
                  {currentTelemetry.cumulativeDataDownlinkedGb.toFixed(1)} GB
                </div>
              </div>
              <div className="gng-glass-card p-2">
                <div className="text-[#8E9BAD]">Health</div>
                <div className="font-bold text-[#F1F5FA]">
                  {currentTelemetry.systemHealthPct.toFixed(0)}%
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="flex items-center gap-1.5 text-[#8E9BAD]">
                <Radio
                  className={`h-3.5 w-3.5 ${
                    currentTelemetry.activeGroundStationId ? 'text-[#38D996]' : 'text-[#8E9BAD]'
                  }`}
                  aria-hidden="true"
                />
                {currentTelemetry.activeGroundStationId
                  ? `Pass Active: ${currentTelemetry.activeGroundStationId}`
                  : 'Ground Station: Out of Pass'}
              </span>
              <span className="font-mono-tech text-[#42D9F5]" title={activeRegion?.name}>
                {activeRegion
                  ? `Overflight: ${getShortTargetRegionName(activeRegion)}`
                  : currentTelemetry.inEclipse
                    ? 'Umbra Eclipse'
                    : 'Sunlit Transit'}
              </span>
            </div>
          </div>

          {/* Top-Right Flood Basin Coverage + Anomalies + Drawer Toggle */}
          <div className="pointer-events-auto flex w-full max-w-sm flex-col gap-2.5">
            <div className="gng-glass-panel space-y-2.5 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono-tech text-[11px] font-semibold uppercase tracking-wider text-[#F1F5FA]">
                  Target Coverage ({mappedRegionIds.length}/{scenario.targetRegions.length})
                </span>
                <div className="flex items-center gap-1.5">
                  {scenario.celestialBody === 'EARTH' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEoModalOpen(true)}
                        className="gng-glass-pill flex items-center gap-1 border-[#38D996]/40 px-2.5 py-1 font-mono-tech text-[11px] font-semibold text-[#38D996] transition hover:bg-[#38D996]/15"
                      >
                        <Satellite className="h-3.5 w-3.5" aria-hidden="true" />
                        EO Scene
                      </button>
                      <button
                        type="button"
                        onClick={() => setWeatherModalOpen(true)}
                        className="gng-glass-pill flex items-center gap-1 border-[#42D9F5]/40 px-2.5 py-1 font-mono-tech text-[11px] font-semibold text-[#42D9F5] transition hover:bg-[#42D9F5]/15"
                      >
                        <CloudRain className="h-3.5 w-3.5" aria-hidden="true" />
                        Weather
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setDrawerOpen((o) => !o)}
                    className="gng-glass-pill flex items-center gap-1 border-[#42D9F5]/40 px-2.5 py-1 font-mono-tech text-[11px] font-semibold text-[#42D9F5] transition hover:bg-[#42D9F5]/15"
                  >
                    <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                    Telemetry Drawer
                    {drawerOpen ? (
                      <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {scenario.targetRegions.map((reg) => {
                  const mapped = mappedRegionIds.includes(reg.id);
                  const blockedByCloud =
                    scenario.code === 'FLOODWATCH' &&
                    reg.cloudCoverFraction >= 0.7 &&
                    !hasCloudPenetrating;
                  return (
                    <div
                      key={reg.id}
                      className={`gng-glass-card flex items-center justify-between gap-1.5 border px-2.5 py-1.5 text-[11px] ${
                        mapped
                          ? 'border-[#38D996]/45 text-[#38D996]'
                          : blockedByCloud
                            ? 'border-[#FFB547]/40 text-[#FFB547]'
                            : 'border-[#F1F5FA]/10 text-[#8E9BAD]'
                      }`}
                    >
                      <span className="truncate font-medium" title={reg.name}>
                        {getShortTargetRegionName(reg)}
                      </span>
                      {mapped ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <span className="shrink-0 font-mono-tech tabular-nums">
                          {Math.round(reg.cloudCoverFraction * 100)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {unresolvedAnomalies.length > 0 && (
                <div className="space-y-1.5 border-t border-[#F1F5FA]/10 pt-2">
                  {unresolvedAnomalies.map((anom) => (
                    <div
                      key={anom.id}
                      className="rounded-xl border border-[#FF5364]/45 bg-[#FF5364]/12 p-2.5 text-[11px]"
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-[#FF5364]">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {anom.title}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => executeMitigationCommand(anom.mitigationCommand)}
                          className="rounded-full border border-[#42D9F5]/50 bg-[#0D1422] px-2.5 py-1 text-[11px] font-semibold text-[#42D9F5] transition hover:bg-[#42D9F5] hover:text-[#080B12]"
                        >
                          {anom.mitigationLabel}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {drawerOpen && (
              <div className="gng-glass-panel max-h-[48dvh] space-y-3 overflow-y-auto p-3.5">
                <MissionTimeline history={telemetryHistory} />
                <NotificationPanel events={events} maxItems={15} />
              </div>
            )}
          </div>
        </div>

        {/* Bottom-Center Flight Operations Command Dock */}
        <div className="gng-glass-panel pointer-events-auto mx-auto flex w-full max-w-5xl flex-col gap-2.5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Automatic Playback & Speed Controls */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={togglePlayPause}
                className="flex items-center gap-1.5 rounded-md border border-cyan-300/60 bg-[#42D9F5] px-3 py-1.5 text-xs font-bold text-[#080B12] transition hover:bg-[#42D9F5]/90"
              >
                {isRunning ? (
                  <>
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                    PAUSE
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    RESUME
                  </>
                )}
              </button>

              <div className="gng-glass-slice flex items-center p-0.5">
                {SPEEDS.map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setSpeedMultiplier(spd)}
                    className={`rounded px-2 py-1 font-mono-tech text-[11px] font-semibold transition ${
                      speedMultiplier === spd
                        ? 'bg-[#3978F6] text-[#F1F5FA]'
                        : 'text-[#8E9BAD] hover:text-[#F1F5FA]'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => fastForwardSimulationHours(24, FIXED_PHYSICS_DT_SECONDS)}
                className="gng-glass-slice flex items-center gap-1 border-[#42D9F5]/35 px-2.5 py-1.5 font-mono-tech text-[11px] font-semibold text-[#42D9F5] transition hover:bg-[#42D9F5]/15"
              >
                <FastForward className="h-3.5 w-3.5" aria-hidden="true" />
                +24H SIM
              </button>

              <button
                type="button"
                onClick={() => initializeSimulation(seed, true)}
                aria-label="Reset simulation"
                className="gng-glass-slice p-1.5 text-[#8E9BAD] transition hover:text-[#F1F5FA]"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            {/* Optional Advanced Controls Toggle & Debrief */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen((o) => !o)}
                className="gng-glass-slice flex items-center gap-1 px-2.5 py-1.5 font-mono-tech text-[11px] text-slate-300 transition hover:text-white"
              >
                Advanced Controls
                {advancedOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                onClick={handleComplete}
                className="rounded-md border border-emerald-300/60 bg-[#38D996] px-3.5 py-1.5 text-xs font-bold text-[#080B12] transition hover:bg-[#38D996]/90"
              >
                COMPLETE &amp; DEBRIEF
              </button>
            </div>
          </div>

          {/* Optional Manual Spacecraft Controls (not required for standard automatic mission) */}
          {advancedOpen && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5">
              {/* Payload Mode Selector & Per-Instrument Power Toggles */}
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="gng-glass-slice flex items-center p-0.5">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setInstrumentMode(m.id)}
                      className={`rounded px-2 py-1 font-mono-tech text-[11px] font-semibold transition ${
                        instrumentMode === m.id
                          ? 'bg-[#38D996] text-[#080B12]'
                          : 'text-[#8E9BAD] hover:text-[#F1F5FA]'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {instruments.map((inst) => {
                  const enabled = !disabledInstrumentIds.includes(inst.id);
                  return (
                    <button
                      key={inst.id}
                      type="button"
                      onClick={() => toggleInstrumentActive(inst.id)}
                      title={`${enabled ? 'Disable' : 'Enable'} ${inst.name} (${inst.powerOperatingW}W)`}
                      className={`gng-glass-slice flex items-center gap-1 px-2 py-1 font-mono text-[10px] font-semibold transition ${
                        enabled
                          ? 'border-[#38D996]/50 bg-[#38D996]/15 text-[#38D996]'
                          : 'border-[#F1F5FA]/15 text-[#8E9BAD] line-through'
                      }`}
                    >
                      <Power className="h-3 w-3" aria-hidden="true" />
                      {inst.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>

              {/* Bus Overrides & Action Commands */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleSafeMode}
                  className={`gng-glass-slice flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold transition ${
                    safeModeActive
                      ? 'border-[#FF5364]/60 bg-[#FF5364]/20 text-[#FF5364]'
                      : 'text-[#8E9BAD] hover:text-[#F1F5FA]'
                  }`}
                >
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  Safe
                </button>

                <button
                  type="button"
                  onClick={toggleHeaterOverride}
                  className={`gng-glass-slice flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold transition ${
                    heaterOverrideOn
                      ? 'border-[#FFB547]/60 bg-[#FFB547]/20 text-[#FFB547]'
                      : 'text-[#8E9BAD] hover:text-[#F1F5FA]'
                  }`}
                >
                  <Thermometer className="h-3.5 w-3.5" aria-hidden="true" />
                  Heater
                </button>

                <button
                  type="button"
                  onClick={toggleDownlinkPriority}
                  className={`gng-glass-slice flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold transition ${
                    downlinkPriorityActive
                      ? 'border-[#38D996]/55 bg-[#38D996]/15 text-[#38D996]'
                      : 'text-[#8E9BAD] hover:text-[#F1F5FA]'
                  }`}
                >
                  <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                  Auto-DL
                </button>

                <button
                  type="button"
                  onClick={executeManualDownlinkBurst}
                  className="gng-glass-slice flex items-center gap-1 border-[#42D9F5]/40 px-2.5 py-1 text-[11px] font-semibold text-[#42D9F5] transition hover:bg-[#42D9F5]/15"
                >
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                  Burst DL
                </button>

                <button
                  type="button"
                  onClick={executeOrbitTrimBurn}
                  className="gng-glass-slice flex items-center gap-1 border-[#FFB547]/40 px-2.5 py-1 text-[11px] font-semibold text-[#FFB547] transition hover:bg-[#FFB547]/15"
                >
                  <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                  Trim Burn
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* On-Demand Earth-Observation Scene Context Modal */}
      {eoModalOpen && scenario.celestialBody === 'EARTH' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Orbital Operations Earth Observation Context"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/15 bg-[#070f20] p-4 shadow-2xl sm:p-5">
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
              <h2 className="text-sm font-bold text-slate-100">
                Orbital Operations · Real Satellite Observation Context
              </h2>
              <button
                type="button"
                onClick={() => setEoModalOpen(false)}
                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 hover:bg-white/10"
                aria-label="Close EO scene modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NasaEarthObservationPanel
              targetRegions={scenario.targetRegions}
              initialRegionId={activeRegion?.id ?? scenario.targetRegions[0]?.id}
              initialMode={hasCloudPenetrating ? 'sentinel-1-rtc' : 'SAR_OPTICAL_COMPARE'}
              hasCloudPenetratingPayload={hasCloudPenetrating}
            />
          </div>
        </div>
      )}

      {/* On-Demand Meteomatics Environmental Weather Context Modal */}
      {weatherModalOpen && scenario.celestialBody === 'EARTH' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Orbital Operations Environmental Weather Context"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/15 bg-[#070f20] p-4 shadow-2xl sm:p-5">
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
              <h2 className="text-sm font-bold text-slate-100">
                Orbital Operations · Environmental Weather Context (Meteomatics)
              </h2>
              <button
                type="button"
                onClick={() => setWeatherModalOpen(false)}
                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 hover:bg-white/10"
                aria-label="Close operations weather modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <EarthEnvironmentalWeatherPanel
              initialBasinId={
                activeRegion?.id && isFloodwatchBasinId(activeRegion.id)
                  ? activeRegion.id
                  : 'basin-brahmaputra'
              }
              hasCloudPenetratingPayload={hasCloudPenetrating}
            />
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { FastForward, Flame, Rocket, X } from 'lucide-react';
import { LaunchAnimation, type LaunchPhaseId } from '../scenes/LaunchAnimation';
import type { GateStatus, ScenarioDefinition } from '../types/mission';
import type { LaunchVehicle, OrbitalParameters } from '../types/spacecraft';

interface LaunchPhaseMeta {
  id: LaunchPhaseId;
  tPlus: string;
  label: string;
  description: string;
  progress: number;
  altitudeKm: number;
  velocityKms: number;
  accelG: number;
}

const LAUNCH_PHASES: LaunchPhaseMeta[] = [
  {
    id: 'PRELAUNCH_POLL',
    tPlus: 'T-00:08',
    label: 'Terminal Count & Engine Chilldown',
    description: 'Flight Director launch authorization confirmed. Propellant tanks pressurized for ignition.',
    progress: 0.08,
    altitudeKm: 0.0,
    velocityKms: 0.0,
    accelG: 1.0,
  },
  {
    id: 'LIFTOFF_MAXQ',
    tPlus: 'T+01:12',
    label: 'Main Engine Ignition, Liftoff & Max-Q',
    description: 'Booster clears launch pad and pitches downrange through maximum dynamic pressure.',
    progress: 0.34,
    altitudeKm: 18.4,
    velocityKms: 0.86,
    accelG: 2.9,
  },
  {
    id: 'MECO_STAGE_SEP',
    tPlus: 'T+02:35',
    label: 'MECO & Stage Separation',
    description: 'Main engine cutoff and pneumatic separation of upper stage transfer stack.',
    progress: 0.58,
    altitudeKm: 78.2,
    velocityKms: 2.34,
    accelG: 1.4,
  },
  {
    id: 'FAIRING_JETTISON',
    tPlus: 'T+03:20',
    label: 'Payload Fairing Jettison',
    description: 'Protective payload fairing halves separate cleanly above sensible atmosphere.',
    progress: 0.8,
    altitudeKm: 132.5,
    velocityKms: 4.92,
    accelG: 2.3,
  },
  {
    id: 'SECO_DEPLOYMENT',
    tPlus: 'T+09:40',
    label: 'SECO & Orbital Insertion',
    description: 'Upper stage engine cutoff and spacecraft separation into target mission orbit.',
    progress: 1.0,
    altitudeKm: 215.0,
    velocityKms: 7.78,
    accelG: 0.0,
  },
];

export interface LaunchSequenceOverlayProps {
  isOpen: boolean;
  scenario: ScenarioDefinition;
  configurationName: string;
  launchVehicle: LaunchVehicle;
  orbit: OrbitalParameters;
  engineeringRecommendation: GateStatus;
  riskAcknowledged: boolean;
  onAbort: () => void;
  onInsertionComplete: () => void;
}

export function LaunchSequenceOverlay({
  isOpen,
  scenario,
  configurationName,
  launchVehicle,
  orbit,
  engineeringRecommendation,
  riskAcknowledged,
  onAbort,
  onInsertionComplete,
}: LaunchSequenceOverlayProps) {
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onAbort();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onAbort]);

  useEffect(() => {
    if (!isOpen) return;

    if (phaseIndex < LAUNCH_PHASES.length - 1) {
      const timer = window.setTimeout(() => {
        setPhaseIndex((prev) => Math.min(LAUNCH_PHASES.length - 1, prev + 1));
      }, 1250);
      return () => window.clearTimeout(timer);
    }

    // Automatically transition directly into orbital operations once SECO & insertion completes
    const completeTimer = window.setTimeout(() => {
      onInsertionComplete();
    }, 950);
    return () => window.clearTimeout(completeTimer);
  }, [isOpen, onInsertionComplete, phaseIndex]);

  if (!isOpen) return null;

  const activePhase = LAUNCH_PHASES[phaseIndex] ?? LAUNCH_PHASES[0];
  const targetAlt = Math.max(activePhase.altitudeKm, Math.round(orbit.altitudePerigeeKm));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Full-Screen Cinematic Launch Sequence"
      data-testid="launch-sequence-overlay"
      className="fixed inset-0 z-50 flex h-dvh w-screen flex-col overflow-hidden bg-[#040812]"
    >
      {/* Full-Viewport 3D Launch Vehicle & Earth Backdrop */}
      <div className="absolute inset-0 z-0">
        <LaunchAnimation
          phase={activePhase.id}
          progress={activePhase.progress}
          heightClass="h-full"
          className="rounded-none border-0"
        />
      </div>

      {/* Subtle top & bottom scrims for telemetry legibility */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-36 bg-gradient-to-b from-[#040812]/90 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-48 bg-gradient-to-t from-[#040812]/95 via-[#040812]/70 to-transparent" />

      {/* Top Mission Identification & Telemetry Strip */}
      <div className="relative z-10 flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-6">
        <div className="gng-glass-panel flex flex-col gap-1 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2 font-mono-tech text-[10px] font-bold uppercase tracking-widest text-cyan-300">
            <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{scenario.code} · {launchVehicle.name}</span>
            {riskAcknowledged && (
              <span className="rounded border border-amber-400/50 bg-amber-500/15 px-1.5 py-0.5 text-amber-200">
                RISK OVERRIDE AUTHORIZED
              </span>
            )}
          </div>
          <div className="font-display text-sm font-bold text-white sm:text-base">
            {configurationName}
          </div>
          <div className="font-mono-tech text-[10px] text-slate-400">
            Eng Advisory: {engineeringRecommendation === 'NO_GO' ? 'NO-GO' : engineeringRecommendation} ·
            User Auth: GO · Target {orbit.altitudePerigeeKm}×{orbit.altitudeApogeeKm} km (i={orbit.inclinationDeg.toFixed(1)}°)
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onInsertionComplete}
            className="gng-glass-slice inline-flex items-center gap-1.5 border-cyan-400/40 px-3 py-1.5 font-mono-tech text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
          >
            <FastForward className="h-3.5 w-3.5" aria-hidden="true" />
            Skip to Orbital Insertion
          </button>
          <button
            type="button"
            onClick={onAbort}
            aria-label="Abort launch sequence"
            className="gng-glass-slice inline-flex items-center gap-1 px-2.5 py-1.5 font-mono-tech text-[11px] text-slate-300 hover:border-red-400/50 hover:text-red-200"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Hold
          </button>
        </div>
      </div>

      {/* Center Countdown / Phase Callout */}
      <div className="pointer-events-none relative z-10 mt-auto flex flex-col gap-3 px-4 pb-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="gng-glass-panel max-w-xl px-4 py-3">
            <div className="flex items-center gap-2 font-mono-tech text-xs font-bold tracking-widest text-emerald-300">
              <Flame className="h-4 w-4 text-amber-300" aria-hidden="true" />
              <span>{activePhase.tPlus}</span>
              <span className="text-slate-500">|</span>
              <span className="text-white">{activePhase.label}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              {activePhase.description}
            </p>
          </div>

          {/* Live Ascent Telemetry */}
          <div className="gng-glass-panel grid grid-cols-3 gap-3 px-4 py-2.5 font-mono-tech text-xs tabular-nums">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Altitude</div>
              <div className="font-bold text-cyan-300">
                {(phaseIndex === LAUNCH_PHASES.length - 1 ? targetAlt : activePhase.altitudeKm).toFixed(1)} km
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Velocity</div>
              <div className="font-bold text-emerald-300">
                {activePhase.velocityKms.toFixed(2)} km/s
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Load</div>
              <div className="font-bold text-amber-300">{activePhase.accelG.toFixed(1)} g</div>
            </div>
          </div>
        </div>

        {/* Ascent Phase Progress Strip */}
        <div className="grid grid-cols-5 gap-1.5">
          {LAUNCH_PHASES.map((phase, idx) => (
            <button
              key={phase.id}
              type="button"
              onClick={() => setPhaseIndex(idx)}
              className={`gng-glass-slice px-2.5 py-1.5 text-left transition ${
                idx <= phaseIndex
                  ? 'border-emerald-400/55 bg-emerald-500/18 text-emerald-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="font-mono-tech text-[10px] font-bold">{phase.tPlus}</div>
              <div className="truncate text-[10px]">{phase.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

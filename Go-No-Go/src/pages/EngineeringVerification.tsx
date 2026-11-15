import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  FastForward,
  Lock,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Dashboard } from '../components/Dashboard';
import { FormulaInspectorModal } from '../components/FormulaInspectorModal';
import { LaunchAnimation, type LaunchPhaseId } from '../scenes/LaunchAnimation';
import { useResolvedMission } from '../store/missionStore';
import { useSimulationStore } from '../store/simulationStore';

interface LaunchPhaseMeta {
  id: LaunchPhaseId;
  tPlus: string;
  label: string;
  description: string;
  progress: number;
}

const LAUNCH_PHASES: LaunchPhaseMeta[] = [
  {
    id: 'PRELAUNCH_POLL',
    tPlus: 'T-00:10',
    label: 'Terminal Count & Flight Poll',
    description: 'Flight directors confirm GO/NO-GO telemetry lock across GNC, RF, Power, and Thermal.',
    progress: 0.12,
  },
  {
    id: 'LIFTOFF_MAXQ',
    tPlus: 'T+01:12',
    label: 'Liftoff & Max-Q Pitchover',
    description: 'Main booster throttling through maximum dynamic pressure ascent corridor.',
    progress: 0.36,
  },
  {
    id: 'MECO_STAGE_SEP',
    tPlus: 'T+02:35',
    label: 'MECO & Stage Separation',
    description: 'First stage cutoff and nominal pneumatic separation of the upper stage stack.',
    progress: 0.58,
  },
  {
    id: 'FAIRING_JETTISON',
    tPlus: 'T+03:20',
    label: 'Payload Fairing Jettison',
    description: 'Clean fairing separation exposes optical & SAR spacecraft payload to vacuum.',
    progress: 0.8,
  },
  {
    id: 'SECO_DEPLOYMENT',
    tPlus: 'T+09:40',
    label: 'SECO & Spacecraft Insertion',
    description: 'Upper stage cutoff and nominal orbital separation into mission insertion arc.',
    progress: 1.0,
  },
];

export function EngineeringVerification() {
  const navigate = useNavigate();
  const initializeSimulation = useSimulationStore((s) => s.initializeSimulation);
  const { scenario, orbit, launchVehicle, engineering } = useResolvedMission();
  const [inspectOpen, setInspectOpen] = useState(false);
  const [launchModalOpen, setLaunchModalOpen] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);

  const isNoGo = engineering.validation.overallStatus === 'NO_GO';
  const activePhase = LAUNCH_PHASES[phaseIndex] ?? LAUNCH_PHASES[0];
  const insertionComplete = phaseIndex >= LAUNCH_PHASES.length - 1;

  useEffect(() => {
    if (!launchModalOpen || isNoGo) return;
    if (phaseIndex >= LAUNCH_PHASES.length - 1) return;

    const timer = window.setInterval(() => {
      setPhaseIndex((prev) => Math.min(LAUNCH_PHASES.length - 1, prev + 1));
    }, 1400);

    return () => window.clearInterval(timer);
  }, [isNoGo, launchModalOpen, phaseIndex]);

  const handleOpenLaunchSequence = () => {
    if (isNoGo) return;
    setPhaseIndex(0);
    setLaunchModalOpen(true);
  };

  const handleEnterOperations = () => {
    setLaunchModalOpen(false);
    initializeSimulation(20261114);
    navigate('/operations');
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
      {/* Header & Gate Verdict Bar */}
      <div className="gng-glass-panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {isNoGo ? (
              <ShieldAlert className="h-4 w-4 text-[#FF5364]" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-[#38D996]" aria-hidden="true" />
            )}
            <span className="font-mono-tech text-[11px] font-semibold uppercase tracking-widest text-[#42D9F5]">
              Stage 04 · Flight Readiness Review — {scenario.code}
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold text-[#F1F5FA]">
            Mission Verification & Launch Clearance
          </h1>
          <p className="text-xs text-[#8E9BAD]">
            Coupled SI physics verification across bus mass, orbital mechanics, solar/battery closure,
            RF link margin, ΔV propellant, thermal balance, and budget reserve.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setInspectOpen(true)}
            className="gng-glass-pill flex items-center gap-1.5 border-[#F1F5FA]/20 px-4 py-2 text-xs font-semibold text-[#F1F5FA] transition hover:border-[#42D9F5]/60 hover:text-[#42D9F5]"
          >
            <Calculator className="h-3.5 w-3.5 text-[#42D9F5]" aria-hidden="true" />
            INSPECT SI EQUATIONS
          </button>

          {isNoGo ? (
            <>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-[#FF5364]/40 bg-[#FF5364]/15 px-4 py-2.5 text-xs font-bold text-[#FF5364]/90"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                LAUNCH LOCKED — NO-GO
              </button>
              <Link
                to="/architecture"
                className="flex items-center gap-2 rounded-full bg-[#FF5364] px-5 py-2.5 text-xs font-bold text-[#F1F5FA] transition hover:bg-[#FF5364]/90"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                RESOLVE IN ARCHITECTURE
              </Link>
            </>
          ) : (
            <button
              type="button"
              onClick={handleOpenLaunchSequence}
              className="flex items-center gap-2 rounded-full bg-[#38D996] px-5 py-2.5 text-xs font-bold text-[#080B12] transition hover:bg-[#38D996]/90"
            >
              <Rocket className="h-4 w-4" aria-hidden="true" />
              INITIATE LAUNCH SEQUENCE
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Verification Dashboard (prioritizes failing & caution gates first) */}
      <Dashboard engineering={engineering} />

      <FormulaInspectorModal
        isOpen={inspectOpen}
        onClose={() => setInspectOpen(false)}
        engineering={engineering}
      />

      {/* Integrated 3D Launch Transition Sequence (only available when GO / CAUTION) */}
      {launchModalOpen && !isNoGo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Integrated Launch Sequence"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-5"
        >
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#070f20] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
              <div>
                <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-emerald-300">
                  FLIGHT POLL CLEARED ({engineering.validation.overallStatus}) ·{' '}
                  {launchVehicle.name}
                </div>
                <h2 className="text-base font-bold text-white">
                  {activePhase.tPlus} — {activePhase.label}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setLaunchModalOpen(false)}
                aria-label="Abort or close launch overlay"
                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative p-3 sm:p-4">
              <LaunchAnimation
                phase={activePhase.id}
                progress={activePhase.progress}
                heightClass="h-[280px] sm:h-[360px]"
              />

              <div className="mt-3 rounded-xl border border-white/10 bg-black/35 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-300">{activePhase.description}</span>
                  <span className="font-mono text-cyan-300">
                    Target Orbit: {orbit.altitudePerigeeKm}×{orbit.altitudeApogeeKm} km · i=
                    {orbit.inclinationDeg.toFixed(1)}°
                  </span>
                </div>

                {/* Phase Progress Strip */}
                <div className="mt-3 grid grid-cols-5 gap-1.5">
                  {LAUNCH_PHASES.map((phase, idx) => (
                    <button
                      key={phase.id}
                      type="button"
                      onClick={() => setPhaseIndex(idx)}
                      className={`rounded-lg border px-2 py-1.5 text-left transition ${
                        idx <= phaseIndex
                          ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                          : 'border-white/10 bg-white/5 text-slate-400'
                      }`}
                    >
                      <div className="font-mono text-[10px] font-bold">{phase.tPlus}</div>
                      <div className="truncate text-[10px]">{phase.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={handleEnterOperations}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
              >
                <FastForward className="h-3.5 w-3.5 text-cyan-300" />
                {insertionComplete ? 'Skip Ascent Hold' : 'Fast-Forward to Orbit Insertion'}
              </button>

              <button
                type="button"
                onClick={handleEnterOperations}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2 text-xs font-black tracking-wide text-slate-950 transition hover:bg-emerald-300"
              >
                Enter Mission Operations
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

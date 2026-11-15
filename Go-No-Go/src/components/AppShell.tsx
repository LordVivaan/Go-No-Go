import { Calculator, Rocket } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useResolvedMission } from '../store/missionStore';
import type { GateStatus } from '../types/mission';
import { FormulaInspectorModal } from './FormulaInspectorModal';

interface StageLink {
  number: string;
  to: string;
  label: string;
  matchPaths: readonly string[];
}

const MISSION_STAGES: StageLink[] = [
  { number: '01', to: '/', label: 'Briefing', matchPaths: ['/', '/briefing'] },
  {
    number: '02',
    to: '/architecture',
    label: 'Architecture',
    matchPaths: ['/architecture', '/builder'],
  },
  { number: '03', to: '/orbit', label: 'Orbit & Launch', matchPaths: ['/orbit'] },
  { number: '04', to: '/verification', label: 'Verification', matchPaths: ['/verification'] },
  {
    number: '05',
    to: '/operations',
    label: 'Operations',
    matchPaths: ['/operations', '/simulation'],
  },
  { number: '06', to: '/debrief', label: 'Debrief', matchPaths: ['/debrief', '/report'] },
];

const GATE_BADGE_CLASS: Record<GateStatus, string> = {
  GO: 'border-emerald-400/35 bg-emerald-500/15 text-emerald-300',
  CAUTION: 'border-amber-400/35 bg-amber-500/15 text-amber-300',
  NO_GO: 'border-red-400/35 bg-red-500/15 text-red-300',
};

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [formulasOpen, setFormulasOpen] = useState(false);
  const { engineering, difficulty, scenario } = useResolvedMission();

  const overallGate = engineering.validation.overallStatus;
  const isFullViewportStage =
    location.pathname === '/' ||
    location.pathname === '/briefing' ||
    location.pathname === '/operations' ||
    location.pathname === '/simulation';

  return (
    <div
      className={
        isFullViewportStage
          ? 'relative flex h-dvh w-screen flex-col overflow-hidden bg-[#040914] text-slate-100'
          : 'relative flex min-h-dvh w-full flex-col bg-[#040914] text-slate-100'
      }
    >
      {/* Unified 6-Stage Thin-Slice Liquid-Glass Header */}
      <header className="sticky top-0 z-40 shrink-0 border-b border-white/10 bg-[#050914]/82 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-2 px-3 py-1.5 sm:px-5">
          {/* Brand */}
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-white/5"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded border border-cyan-400/35 bg-cyan-500/12 text-cyan-300">
              <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <div className="flex items-center gap-1.5 text-xs font-bold tracking-widest text-slate-100">
                GO / NO-GO
                <span className="hidden rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] font-medium text-cyan-300 sm:inline-block">
                  {scenario.code}
                </span>
              </div>
              <div className="hidden text-[10px] tracking-wide text-slate-400 sm:block">
                System Advises · Mission Director Decides
              </div>
            </div>
          </Link>

          {/* 6 Gameplay Stage Stepper */}
          <nav
            aria-label="Mission Gameplay Stages"
            className="order-3 flex w-full items-center gap-1 overflow-x-auto pb-0.5 lg:order-2 lg:w-auto lg:justify-center lg:pb-0"
          >
            {MISSION_STAGES.map((stage) => {
              const active = stage.matchPaths.includes(location.pathname);
              return (
                <Link
                  key={stage.to}
                  to={stage.to}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                    active
                      ? 'border-cyan-400/45 bg-cyan-500/12 text-cyan-100 shadow-[inset_0_1px_0_rgba(66,217,245,0.22)]'
                      : 'border-transparent text-slate-400 hover:border-white/10 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <span
                    className={`font-mono text-[10px] ${
                      active ? 'text-cyan-300' : 'text-slate-500'
                    }`}
                  >
                    {stage.number}
                  </span>
                  <span>{stage.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Live Engineering Advisory Status & Equations Trigger */}
          <div className="order-2 flex shrink-0 items-center gap-1.5 lg:order-3">
            <span className="hidden rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] font-medium tracking-wider text-slate-300 sm:inline-flex">
              {difficulty}
            </span>

            <span
              data-testid="shell-gate-status"
              title="Live Engineering Advisory Assessment (non-blocking)"
              className={`rounded border px-2 py-1 font-mono text-[10px] font-bold tracking-wider ${GATE_BADGE_CLASS[overallGate]}`}
            >
              ENG: {overallGate === 'NO_GO' ? 'NO-GO' : overallGate}
            </span>

            <button
              type="button"
              onClick={() => setFormulasOpen(true)}
              title="Open verified aerospace physics formulas"
              className="gng-glass-slice inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200"
            >
              <Calculator className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
              <span className="hidden sm:inline">Formulas</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Stage Container */}
      <main className={isFullViewportStage ? 'relative min-h-0 flex-1' : 'flex-1'}>
        {children}
      </main>

      <FormulaInspectorModal
        isOpen={formulasOpen}
        onClose={() => setFormulasOpen(false)}
        engineering={engineering}
      />
    </div>
  );
}

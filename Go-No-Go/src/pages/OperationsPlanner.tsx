import { AlertTriangle, ArrowLeft, ArrowRight, BatteryCharging, CalendarClock, CheckCircle2, Radio } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useMissionStore, useResolvedMission } from '../store/missionStore';
import type { OperationsPlanConfig } from '../types/aiEvaluation';

export function OperationsPlanner() {
  const navigate = useNavigate();
  const operationsPlan = useMissionStore((s) => s.operationsPlan);
  const setOperationsPlan = useMissionStore((s) => s.setOperationsPlan);
  const { scenario, engineering, instruments } = useResolvedMission();

  // Detect operational conflicts against spacecraft capabilities
  const conflicts: string[] = [];
  if (
    operationsPlan.observationSchedule === 'CONTINUOUS' &&
    engineering.commsData.netDataBacklogPerDayGb > 0
  ) {
    conflicts.push(
      `Continuous observation schedule generates a net SSR backlog of +${engineering.commsData.netDataBacklogPerDayGb.toFixed(1)} GB/day; consider Targeted Windows or Ground-Pass-Only downlink.`,
    );
  }
  if (
    operationsPlan.payloadDutyCyclePct > 65 &&
    engineering.power.powerMarginPct < 15
  ) {
    conflicts.push(
      `Payload duty cycle (${operationsPlan.payloadDutyCyclePct}%) leaves narrow orbit-average power margin (${engineering.power.powerMarginPct.toFixed(1)}%).`,
    );
  }
  if (
    operationsPlan.powerReservePct > 100 - engineering.power.maxAllowedDodPct &&
    engineering.power.eclipseDodPct > engineering.power.maxAllowedDodPct * 0.85
  ) {
    conflicts.push(
      `Minimum power reserve (${operationsPlan.powerReservePct}%) is tight relative to eclipse Depth of Discharge (${engineering.power.eclipseDodPct.toFixed(1)}% vs ${engineering.power.maxAllowedDodPct}% cap).`,
    );
  }
  if (instruments.length === 0) {
    conflicts.push('No scientific payloads selected; operations plan cannot execute science windows.');
  }

  const updateField = <K extends keyof OperationsPlanConfig>(
    key: K,
    value: OperationsPlanConfig[K],
  ) => {
    setOperationsPlan({ [key]: value });
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="font-mono-tech text-[11px] uppercase tracking-widest text-cyan-300">
            Stage 05 · Concept of Operations &amp; Resource Plan
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-50">
            Configure Mission Operations Plan
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Define observation cadence, payload duty cycle, downlink schedule, power reserve floor, and attitude priority for <span className="font-semibold text-slate-200">{scenario.title}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono-tech text-xs">
          <div className="gng-glass-slice px-3 py-1.5">
            <span className="text-slate-400">Power Margin: </span>
            <span className="font-bold text-cyan-300">{engineering.power.powerMarginPct.toFixed(1)}%</span>
          </div>
          <div className="gng-glass-slice px-3 py-1.5">
            <span className="text-slate-400">Net Data Backlog: </span>
            <span
              className={`font-bold ${
                engineering.commsData.netDataBacklogPerDayGb > 0 ? 'text-amber-300' : 'text-emerald-300'
              }`}
            >
              {engineering.commsData.netDataBacklogPerDayGb.toFixed(1)} GB/day
            </span>
          </div>
        </div>
      </div>

      {/* Conflict / Health Banner */}
      {conflicts.length > 0 ? (
        <div className="mb-6 space-y-1.5 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          <div className="flex items-center gap-2 font-semibold text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Operational Plan Conflict Warnings ({conflicts.length})
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            {conflicts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
          Operations plan aligns with current power, eclipse DoD, and SSR downlink capacity.
        </div>
      )}

      {/* Full-Width Operations Grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Observation & Duration */}
        <div className="gng-glass-panel space-y-4 p-5">
          <div className="flex items-center gap-2 font-mono-tech text-xs font-semibold uppercase tracking-wider text-cyan-300">
            <CalendarClock className="h-4 w-4" aria-hidden="true" /> Observation Schedule &amp; Duration
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Mission Duration Window</span>
              <span className="font-mono-tech font-bold text-cyan-300">
                {operationsPlan.missionDurationDays} days
              </span>
            </div>
            <input
              type="range"
              min={3}
              max={90}
              step={1}
              value={operationsPlan.missionDurationDays}
              aria-label="Mission duration in days"
              onChange={(e) => updateField('missionDurationDays', Number(e.target.value))}
              className="mt-2 w-full accent-cyan-400"
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-300">Observation Mode</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'TARGET_WINDOWS', label: 'Targeted Windows' },
                  { id: 'ECLIPSE_SAFE', label: 'Eclipse Safe' },
                  { id: 'CONTINUOUS', label: 'Continuous' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-selected={operationsPlan.observationSchedule === opt.id}
                  onClick={() => updateField('observationSchedule', opt.id)}
                  className="gng-glass-option px-2.5 py-2 text-center font-mono-tech text-[11px] font-semibold text-slate-200"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Target Payload Duty Cycle</span>
              <span className="font-mono-tech font-bold text-cyan-300">
                {operationsPlan.payloadDutyCyclePct}%
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={operationsPlan.payloadDutyCyclePct}
              aria-label="Global payload duty cycle percentage"
              onChange={(e) => updateField('payloadDutyCyclePct', Number(e.target.value))}
              className="mt-2 w-full accent-cyan-400"
            />
          </div>
        </div>

        {/* Downlink, Power Reserve & Attitude */}
        <div className="gng-glass-panel space-y-4 p-5">
          <div className="flex items-center gap-2 font-mono-tech text-xs font-semibold uppercase tracking-wider text-cyan-300">
            <Radio className="h-4 w-4" aria-hidden="true" /> Downlink, Power Reserves &amp; Attitude
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Downlink Passes Per Day</span>
              <span className="font-mono-tech font-bold text-cyan-300">
                {operationsPlan.downlinkCadencePerDay} / day
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={16}
              step={1}
              value={operationsPlan.downlinkCadencePerDay}
              aria-label="Downlink passes per day"
              onChange={(e) => updateField('downlinkCadencePerDay', Number(e.target.value))}
              className="mt-2 w-full accent-cyan-400"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center gap-1.5">
                <BatteryCharging className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                Minimum Battery Reserve Floor
              </span>
              <span className="font-mono-tech font-bold text-emerald-300">
                {operationsPlan.powerReservePct}%
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={50}
              step={5}
              value={operationsPlan.powerReservePct}
              aria-label="Minimum battery reserve percentage"
              onChange={(e) => updateField('powerReservePct', Number(e.target.value))}
              className="mt-2 w-full accent-emerald-400"
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-300">Attitude Control Priority</span>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  { id: 'SCIENCE_NADIR', label: 'Nadir Science' },
                  { id: 'BALANCED', label: 'Balanced' },
                  { id: 'SUN_TRACKING', label: 'Sun Tracking' },
                  { id: 'COMMS_POINTING', label: 'Comms Pointing' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-selected={operationsPlan.attitudePriority === opt.id}
                  onClick={() => updateField('attitudePriority', opt.id)}
                  className="gng-glass-option px-2.5 py-2 text-center font-mono-tech text-[11px] font-semibold text-slate-200"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sequential Navigation */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
        <button
          type="button"
          onClick={() => navigate('/orbit')}
          className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-200 transition hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Previous: Orbit &amp; Launch
        </button>
        <button
          type="button"
          onClick={() => navigate('/verification')}
          className="inline-flex items-center gap-2 rounded-md border border-cyan-300/60 bg-cyan-400 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 transition hover:bg-cyan-300"
        >
          Continue to Engineering Verification
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

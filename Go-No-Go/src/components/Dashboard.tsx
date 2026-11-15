import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Info, XCircle } from 'lucide-react';
import { useResolvedMission } from '../store/missionStore';
import { FormulaInspectorModal } from './FormulaInspectorModal';
import type {
  EngineeringSummary,
  ValidationFindingSeverity,
} from '../types/engineering';
import type { GateStatus } from '../types/mission';

function GateBadge({ status }: { status: GateStatus }) {
  if (status === 'GO') {
    return (
      <span className="gng-glass-pill inline-flex items-center gap-1 border-[#38D996]/45 bg-[#38D996]/12 px-2.5 py-0.5 font-mono-tech text-[11px] font-bold text-[#38D996]">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        GO
      </span>
    );
  }
  if (status === 'CAUTION') {
    return (
      <span className="gng-glass-pill inline-flex items-center gap-1 border-[#FFB547]/45 bg-[#FFB547]/12 px-2.5 py-0.5 font-mono-tech text-[11px] font-bold text-[#FFB547]">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        CAUTION
      </span>
    );
  }
  return (
    <span className="gng-glass-pill inline-flex items-center gap-1 border-[#FF5364]/45 bg-[#FF5364]/12 px-2.5 py-0.5 font-mono-tech text-[11px] font-bold text-[#FF5364]">
      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
      NO-GO
    </span>
  );
}

const FINDING_ORDER: Record<ValidationFindingSeverity, number> = {
  FAIL: 0,
  WARNING: 1,
  INFORMATION: 2,
  PASS: 3,
};

export interface DashboardProps {
  engineering?: EngineeringSummary;
}

export function Dashboard({ engineering: propEngineering }: DashboardProps) {
  const resolved = useResolvedMission();
  const engineering = propEngineering ?? resolved.engineering;
  const [inspectOpen, setInspectOpen] = useState(false);
  const [showPassing, setShowPassing] = useState(false);

  const sortedFindings = useMemo(
    () =>
      [...engineering.validation.findings].sort(
        (a, b) => FINDING_ORDER[a.severity] - FINDING_ORDER[b.severity]
      ),
    [engineering.validation.findings]
  );

  const attentionFindings = useMemo(
    () => sortedFindings.filter((f) => f.severity === 'FAIL' || f.severity === 'WARNING'),
    [sortedFindings]
  );

  const passingFindings = useMemo(
    () => sortedFindings.filter((f) => f.severity === 'PASS' || f.severity === 'INFORMATION'),
    [sortedFindings]
  );

  const visibleFindings =
    attentionFindings.length === 0 || showPassing ? sortedFindings : attentionFindings;

  const failCount = engineering.validation.noGoCount;
  const warnCount = engineering.validation.cautionCount;
  const ssrUtilPct =
    (engineering.commsData.dataGeneratedPerDayGb /
      Math.max(1, engineering.commsData.storageCapacityGb)) *
    100;

  return (
    <div className="space-y-6">
      <div className="gng-glass-panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-lg font-bold tracking-wide text-[#F1F5FA]">
              Engineering Readiness Gate Summary
            </h2>
            <GateBadge status={engineering.validation.overallStatus} />
          </div>
          <p className="text-xs text-[#8E9BAD]">
            {failCount > 0
              ? `${failCount} blocking failure${failCount > 1 ? 's' : ''} preventing flight certification. Resolve red gates before launch.`
              : warnCount > 0
                ? `All blocking gates passed with ${warnCount} caution advisory item${warnCount > 1 ? 's' : ''}.`
                : 'All coupled subsystem physics checks verified with nominal flight margins.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setInspectOpen(true)}
          className="gng-glass-pill flex items-center gap-2 border-[#42D9F5]/45 px-3.5 py-2 text-xs font-semibold text-[#42D9F5] transition hover:border-[#42D9F5] hover:bg-[#42D9F5]/12"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          Inspect All Physics Equations
        </button>
      </div>

      {/* Quick 4-Card Numerical Gate Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="gng-glass-card p-4">
          <div className="font-mono-tech text-[11px] uppercase tracking-wider text-[#8E9BAD]">
            Launch Mass Margin
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono-tech text-xl font-bold tabular-nums text-[#F1F5FA]">
              {engineering.mass.launchMarginPct.toFixed(1)}%
            </span>
            <GateBadge status={engineering.mass.status} />
          </div>
          <div className="mt-1 font-mono-tech text-[11px] tabular-nums text-[#8E9BAD]">
            {engineering.mass.wetMassKg.toFixed(1)} kg /{' '}
            {engineering.mass.maxLaunchMassKg.toFixed(0)} kg LV limit
          </div>
        </div>

        <div className="gng-glass-card p-4">
          <div className="font-mono-tech text-[11px] uppercase tracking-wider text-[#8E9BAD]">
            Eclipse DoD / Margin
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono-tech text-xl font-bold tabular-nums text-[#F1F5FA]">
              {engineering.power.eclipseDodPct.toFixed(1)}%
            </span>
            <GateBadge status={engineering.power.status} />
          </div>
          <div className="mt-1 font-mono-tech text-[11px] tabular-nums text-[#8E9BAD]">
            Net {engineering.power.powerMarginW >= 0 ? '+' : ''}
            {engineering.power.powerMarginW.toFixed(1)} W orbit balance
          </div>
        </div>

        <div className="gng-glass-card p-4">
          <div className="font-mono-tech text-[11px] uppercase tracking-wider text-[#8E9BAD]">
            RF Link Margin
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono-tech text-xl font-bold tabular-nums text-[#F1F5FA]">
              {engineering.commsData.linkMarginDb >= 0 ? '+' : ''}
              {engineering.commsData.linkMarginDb.toFixed(2)} dB
            </span>
            <GateBadge status={engineering.commsData.status} />
          </div>
          <div className="mt-1 font-mono-tech text-[11px] tabular-nums text-[#8E9BAD]">
            SSR {ssrUtilPct.toFixed(0)}% daily load
          </div>
        </div>

        <div className="gng-glass-card p-4">
          <div className="font-mono-tech text-[11px] uppercase tracking-wider text-[#8E9BAD]">
            Δv & Reliability
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono-tech text-xl font-bold tabular-nums text-[#F1F5FA]">
              {engineering.propulsion.availableDeltaVMps.toFixed(0)} m/s
            </span>
            <GateBadge status={engineering.propulsion.status} />
          </div>
          <div className="mt-1 font-mono-tech text-[11px] tabular-nums text-[#8E9BAD]">
            Rel {(engineering.reliability.combinedMissionReliability * 100).toFixed(1)}% | Budget{' '}
            {engineering.budget.budgetMarginPct.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Full Findings List (failing & warning gates prioritized first) */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-mono-tech text-xs font-semibold uppercase tracking-widest text-[#8E9BAD]">
            STRUCTURED ENGINEERING VALIDATION FINDINGS (
            {attentionFindings.length > 0
              ? `${attentionFindings.length} ACTION REQUIRED`
              : `${sortedFindings.length} CHECKS VERIFIED`}
            )
          </h3>
          {attentionFindings.length > 0 && passingFindings.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPassing((v) => !v)}
              className="rounded-full border border-[#F1F5FA]/15 bg-[#080B12]/70 px-3 py-1 font-mono text-[11px] font-medium text-[#8E9BAD] transition hover:border-[#42D9F5]/45 hover:text-[#F1F5FA]"
            >
              {showPassing
                ? `Hide ${passingFindings.length} Passing Checks`
                : `Show ${passingFindings.length} Passing Checks`}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visibleFindings.map((f) => {
            const borderCls =
              f.severity === 'FAIL'
                ? 'border-[#FF5364]/45'
                : f.severity === 'WARNING'
                  ? 'border-[#FFB547]/40'
                  : 'border-[#38D996]/30';
            const badgeCls =
              f.severity === 'FAIL'
                ? 'border-[#FF5364]/45 bg-[#FF5364]/15 text-[#FF5364]'
                : f.severity === 'WARNING'
                  ? 'border-[#FFB547]/45 bg-[#FFB547]/15 text-[#FFB547]'
                  : 'border-[#38D996]/45 bg-[#38D996]/15 text-[#38D996]';

            return (
              <div
                key={f.id}
                className={`gng-glass-card flex flex-col justify-between border p-4 ${borderCls}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono-tech text-[11px] uppercase tracking-wider text-[#8E9BAD]">
                        {f.subsystem}
                      </span>
                      <h4 className="mt-0.5 text-sm font-semibold text-[#F1F5FA]">{f.title}</h4>
                    </div>
                    <span
                      className={`gng-glass-pill shrink-0 px-2.5 py-0.5 font-mono-tech text-[11px] font-bold ${badgeCls}`}
                    >
                      {f.severity}
                    </span>
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-[#8E9BAD]">{f.explanation}</p>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#F1F5FA]/10 pt-2.5 text-[11px]">
                  <span className="font-mono-tech tabular-nums text-[#F1F5FA]/80">
                    Measured:{' '}
                    <strong className="text-[#F1F5FA]">{f.actualValue}</strong> (Req:{' '}
                    {f.requiredValue} {f.units})
                  </span>
                  <Link
                    to={f.resourceRoute}
                    className="inline-flex items-center gap-1 font-medium text-[#42D9F5] hover:underline"
                  >
                    Open {f.subsystem} Configuration
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>

                {f.suggestedCorrectiveAction && (
                  <div className="mt-2 rounded-xl border border-[#FFB547]/25 bg-[#FFB547]/10 px-3 py-1.5 text-[11px] text-[#FFB547]">
                    Action: {f.suggestedCorrectiveAction}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <FormulaInspectorModal
        isOpen={inspectOpen}
        onClose={() => setInspectOpen(false)}
        engineering={engineering}
      />
    </div>
  );
}

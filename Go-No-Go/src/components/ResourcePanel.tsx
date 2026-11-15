import type { EngineeringSummary } from '../types/engineering';
import type { GateStatus } from '../types/mission';

function statusBadge(status: GateStatus) {
  if (status === 'GO') {
    return (
      <span className="rounded-full border border-[#38D996]/50 bg-[#38D996]/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-[#38D996]">
        GO
      </span>
    );
  }
  if (status === 'CAUTION') {
    return (
      <span className="rounded-full border border-[#FFB547]/50 bg-[#FFB547]/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-[#FFB547]">
        CAUTION
      </span>
    );
  }
  return (
    <span className="rounded-full border border-[#FF5364]/50 bg-[#FF5364]/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-[#FF5364]">
      NO-GO
    </span>
  );
}

function barColor(status: GateStatus) {
  return status === 'GO'
    ? 'bg-[#38D996]'
    : status === 'CAUTION'
      ? 'bg-[#FFB547]'
      : 'bg-[#FF5364]';
}

export interface ResourcePanelProps {
  engineering: EngineeringSummary;
  budgetCapMusd: number;
  onOpenFormulaInspector?: () => void;
}

export function ResourcePanel({
  engineering,
  budgetCapMusd,
  onOpenFormulaInspector,
}: ResourcePanelProps) {
  const { mass, power, commsData, propulsion, thermal, budget, reliability, validation } =
    engineering;

  const massRatio = Math.min(100, (mass.wetMassKg / Math.max(1, mass.maxLaunchMassKg)) * 100);
  const powerRatio = Math.min(
    100,
    (power.orbitAverageRequiredPowerW / Math.max(1, power.eolSolarPowerW)) * 100
  );
  const dataRatio = Math.min(
    100,
    (commsData.dataGeneratedPerDayGb /
      Math.max(0.1, commsData.downlinkCapacityPerDayGb)) *
      100
  );
  const budgetRatio = Math.min(100, (budget.totalSpentMusd / Math.max(1, budgetCapMusd)) * 100);

  return (
    <div className="gng-glass-panel space-y-3 p-4 sm:p-5">
      <div className="flex items-center justify-between border-b border-[#F1F5FA]/10 pb-3">
        <div>
          <span className="font-mono text-[11px] text-[#8E9BAD]">
            Flight Readiness Gate · CML {validation.achievedCmlLevel}/6
          </span>
          <h3 className="font-display text-sm font-bold text-[#F1F5FA]">
            Systems Engineering Budgets
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge(validation.overallStatus)}
          {onOpenFormulaInspector && (
            <button
              type="button"
              onClick={onOpenFormulaInspector}
              className="rounded-full border border-[#42D9F5]/45 bg-[#080B12]/70 px-3 py-1 font-mono text-[11px] font-semibold text-[#42D9F5] transition-colors hover:bg-[#42D9F5]/15"
            >
              Equations
            </button>
          )}
        </div>
      </div>

      {/* 1. Wet Mass & Launch Margin */}
      <div className="gng-glass-card p-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-[#F1F5FA]">Wet Mass / Fairing Cap</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs tabular-nums text-[#F1F5FA]">
              {mass.wetMassKg} / {mass.maxLaunchMassKg} kg ({mass.launchMarginPct}%)
            </span>
            {statusBadge(mass.status)}
          </div>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#080B12]/80">
          <div
            className={`h-full transition-all ${barColor(mass.status)}`}
            style={{ width: `${massRatio}%` }}
          />
        </div>
      </div>

      {/* 2. EOL Solar Power & Battery DoD */}
      <div className="gng-glass-card p-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-[#F1F5FA]">EOL Solar & Battery DoD</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs tabular-nums text-[#F1F5FA]">
              {power.orbitAverageRequiredPowerW}W / {power.eolSolarPowerW}W · {power.eclipseDodPct}% DoD
            </span>
            {statusBadge(power.status)}
          </div>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#080B12]/80">
          <div
            className={`h-full transition-all ${barColor(power.status)}`}
            style={{ width: `${powerRatio}%` }}
          />
        </div>
      </div>

      {/* 3. RF Link & Daily Data Closure */}
      <div className="gng-glass-card p-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-[#F1F5FA]">RF Link & Daily Data</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs tabular-nums text-[#F1F5FA]">
              {commsData.linkMarginDb >= 0 ? '+' : ''}
              {commsData.linkMarginDb} dB · {commsData.dataGeneratedPerDayGb}/
              {commsData.downlinkCapacityPerDayGb} GB/d
            </span>
            {statusBadge(commsData.status)}
          </div>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#080B12]/80">
          <div
            className={`h-full transition-all ${barColor(commsData.status)}`}
            style={{ width: `${dataRatio}%` }}
          />
        </div>
      </div>

      {/* 4. Propulsion Delta-V & Thermal */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="gng-glass-card p-3">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs text-[#8E9BAD]">Propulsion Δv</span>
            {statusBadge(propulsion.status)}
          </div>
          <div className="mt-1.5 font-mono text-xs font-bold tabular-nums text-[#F1F5FA]">
            {propulsion.availableDeltaVMps} / {propulsion.requiredDeltaVMps} m/s
          </div>
        </div>

        <div className="gng-glass-card p-3">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs text-[#8E9BAD]">Thermal Eq.</span>
            {statusBadge(thermal.status)}
          </div>
          <div className="mt-1.5 font-mono text-xs font-bold tabular-nums text-[#F1F5FA]">
            [{thermal.equilibriumColdTempC}°C, +{thermal.equilibriumHotTempC}°C]
          </div>
        </div>
      </div>

      {/* 5. Life-Cycle Cost & NPR 8705.4B Reliability */}
      <div className="gng-glass-card p-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-[#F1F5FA]">Cost Cap & Reliability</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs tabular-nums text-[#F1F5FA]">
              ${budget.totalSpentMusd}M / ${budgetCapMusd}M · R=
              {(reliability.combinedMissionReliability * 100).toFixed(1)}%
            </span>
            {statusBadge(
              budget.status === 'NO_GO' || reliability.status === 'NO_GO'
                ? 'NO_GO'
                : budget.status === 'CAUTION' || reliability.status === 'CAUTION'
                  ? 'CAUTION'
                  : 'GO'
            )}
          </div>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#080B12]/80">
          <div
            className={`h-full transition-all ${barColor(budget.status)}`}
            style={{ width: `${budgetRatio}%` }}
          />
        </div>
        <div className="mt-2 font-mono text-[11px] tabular-nums text-[#8E9BAD]">
          HW ${budget.hardwareCostMusd}M · Dev ${budget.developmentCostMusd}M · AI&T $
          {(budget.integrationCostMusd + budget.testingCostMusd).toFixed(1)}M · LV $
          {budget.launchCostMusd}M · Ops ${budget.operationsCostMusd}M · Res $
          {budget.contingencyReserveMusd}M
        </div>
      </div>
    </div>
  );
}

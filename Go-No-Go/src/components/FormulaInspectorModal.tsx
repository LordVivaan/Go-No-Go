import { BookOpen, Calculator, X } from 'lucide-react';
import { useEffect } from 'react';
import type { EngineeringSummary } from '../types/engineering';
import type { FormulaClassification, FormulaTrace } from '../types/mission';

interface FormulaInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  engineering: EngineeringSummary;
}

const CLASSIFICATION_STYLES: Record<
  FormulaClassification,
  { label: string; colorClass: string }
> = {
  PHYSICAL_LAW: {
    label: 'Physical Equation (SI Exact)',
    colorClass: 'border-[#38D996]/50 bg-[#38D996]/12 text-[#38D996]',
  },
  ENGINEERING_APPROXIMATION: {
    label: 'SMAD / NASA Engineering Model',
    colorClass: 'border-[#42D9F5]/50 bg-[#42D9F5]/12 text-[#42D9F5]',
  },
  GAMEPLAY_RULE: {
    label: 'Mission Policy Rule',
    colorClass: 'border-[#FFB547]/50 bg-[#FFB547]/12 text-[#FFB547]',
  },
};

export function FormulaInspectorModal({
  isOpen,
  onClose,
  engineering,
}: FormulaInspectorModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const allTraces: FormulaTrace[] = [
    engineering.mass.trace,
    ...engineering.orbital.traces,
    ...engineering.power.traces,
    ...engineering.commsData.traces,
    engineering.propulsion.trace,
    ...engineering.thermal.traces,
    engineering.budget.trace,
    engineering.reliability.trace,
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="formula-inspector-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B12]/80 p-4 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="gng-glass-panel flex max-h-[88dvh] w-full max-w-5xl flex-col overflow-hidden text-[#F1F5FA]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#F1F5FA]/12 bg-[#0D1422]/75 px-6 py-4">
          <div className="flex items-center gap-3">
            <Calculator className="h-5 w-5 text-[#42D9F5]" />
            <div>
              <h2
                id="formula-inspector-title"
                className="font-display text-base font-bold tracking-wide text-[#F1F5FA] sm:text-lg"
              >
                SI Engineering Formula Inspector
              </h2>
              <p className="text-xs text-[#8E9BAD]">
                Live symbolic equations, SI input parameters, and reference standards
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close formula inspector"
            onClick={onClose}
            className="rounded-xl border border-[#F1F5FA]/15 bg-[#141E2E]/80 p-2 text-[#8E9BAD] transition-colors hover:border-[#42D9F5] hover:text-[#F1F5FA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Trace List */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
          {allTraces.map((trace) => {
            const badge = CLASSIFICATION_STYLES[trace.classification];
            return (
              <div key={trace.id} className="gng-glass-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F5FA]/10 pb-3">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-[#F1F5FA]">
                      {trace.title}
                    </h3>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#8E9BAD]">
                      <BookOpen className="h-3.5 w-3.5 text-[#42D9F5]" />
                      <span>Reference: {trace.referenceStandard}</span>
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold ${badge.colorClass}`}
                  >
                    {badge.label}
                  </span>
                </div>

                {/* Symbolic Equation */}
                <div className="mt-3 rounded-xl border border-[#F1F5FA]/10 bg-[#080B12]/80 px-4 py-2.5 font-mono text-xs text-[#42D9F5]">
                  {trace.symbolicEquation}
                </div>

                {/* Live Inputs & Evaluated Output */}
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:col-span-3">
                    {Object.entries(trace.inputs).map(([key, input]) => (
                      <div
                        key={key}
                        className="rounded-xl border border-[#F1F5FA]/10 bg-[#080B12]/60 px-3 py-2"
                      >
                        <div className="flex items-baseline justify-between gap-1.5">
                          <span className="font-mono text-[11px] font-semibold text-[#42D9F5]">
                            {key}
                          </span>
                          <span className="font-mono text-xs font-bold tabular-nums text-[#F1F5FA]">
                            {input.value} {input.unit}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-[#8E9BAD]">
                          {input.description}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col justify-center rounded-xl border border-[#3978F6]/50 bg-[#080B12]/80 px-3.5 py-2.5">
                    <span className="font-mono text-[11px] text-[#8E9BAD]">
                      Evaluated Result
                    </span>
                    <span className="mt-1 font-mono text-sm font-bold tabular-nums text-[#38D996]">
                      {trace.output.formatted}
                    </span>
                  </div>
                </div>

                {trace.notes && (
                  <p className="mt-2.5 text-xs text-[#8E9BAD]">Note: {trace.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

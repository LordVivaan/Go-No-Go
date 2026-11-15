import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Cpu,
  ExternalLink,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  buildMissionEvaluationPayload,
  getCachedAiEvaluation,
  requestAiMissionEvaluation,
  type AiEvaluationError,
} from '../services/aiEvaluationService';
import type {
  AiCategoryEvaluation,
  AiMissionEvaluationReport,
  OperationsPlanConfig,
} from '../types/aiEvaluation';
import type { EngineeringSummary } from '../types/engineering';
import type { MissionDifficulty, ScenarioDefinition } from '../types/mission';
import type { MissionScoreReport } from '../types/simulation';
import type {
  LaunchVehicle,
  OrbitalParameters,
  ScientificInstrument,
  SpacecraftComponent,
} from '../types/spacecraft';

export interface AiEngineeringDebriefPanelProps {
  completedReport: MissionScoreReport | null;
  scenario: ScenarioDefinition;
  difficulty: MissionDifficulty;
  bus: SpacecraftComponent;
  instruments: ScientificInstrument[];
  instrumentDutyOverrides: Record<string, number>;
  subsystems: SpacecraftComponent[];
  orbit: OrbitalParameters;
  launcher: LaunchVehicle;
  operationsPlan: OperationsPlanConfig;
  engineering: EngineeringSummary;
  finalSystemHealthPct: number;
  onEvaluationReady?: (report: AiMissionEvaluationReport | null) => void;
}

const CATEGORY_META: Array<{
  key: keyof AiMissionEvaluationReport['categories'];
  label: string;
}> = [
  { key: 'science', label: 'Science Return (35%)' },
  { key: 'reliability', label: 'Reliability (25%)' },
  { key: 'resource_efficiency', label: 'Resource Efficiency (15%)' },
  { key: 'data_comms', label: 'Data & Comms (15%)' },
  { key: 'risk_management', label: 'Risk Management (10%)' },
];

export function AiEngineeringDebriefPanel({
  completedReport,
  scenario,
  difficulty,
  bus,
  instruments,
  instrumentDutyOverrides,
  subsystems,
  orbit,
  launcher,
  operationsPlan,
  engineering,
  finalSystemHealthPct,
  onEvaluationReady,
}: AiEngineeringDebriefPanelProps) {
  const runId = completedReport?.runId ?? null;
  const cachedInitial = runId ? getCachedAiEvaluation(runId) : null;

  const [aiReport, setAiReport] = useState<AiMissionEvaluationReport | null>(cachedInitial);
  const [error, setError] = useState<AiEvaluationError | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(runId && !cachedInitial));
  const [retryNonce, setRetryNonce] = useState(0);
  const [expandedDeductions, setExpandedDeductions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!completedReport) return;

    const cached = getCachedAiEvaluation(completedReport.runId);
    if (cached && retryNonce === 0) {
      Promise.resolve().then(() => {
        setAiReport(cached);
        setError(null);
        setLoading(false);
        onEvaluationReady?.(cached);
      });
      return;
    }

    let cancelled = false;

    const payload = buildMissionEvaluationPayload({
      runId: completedReport.runId,
      scenario,
      difficulty,
      bus,
      instruments,
      instrumentDutyOverrides,
      subsystems,
      orbit,
      launcher,
      operationsPlan,
      engineering,
      simulationReport: completedReport,
      finalSystemHealthPct,
      batteryExhausted:
        completedReport.outcome === 'MISSION_LOSS' &&
        completedReport.failureReason?.includes('battery') === true,
    });

    void requestAiMissionEvaluation(payload, { forceRefresh: retryNonce > 0 }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setAiReport(res.report);
        setError(null);
        onEvaluationReady?.(res.report);
      } else {
        setAiReport(null);
        setError(res.error);
        onEvaluationReady?.(null);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    completedReport,
    scenario,
    difficulty,
    bus,
    instruments,
    instrumentDutyOverrides,
    subsystems,
    orbit,
    launcher,
    operationsPlan,
    engineering,
    finalSystemHealthPct,
    retryNonce,
    onEvaluationReady,
  ]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setRetryNonce((n) => n + 1);
  };

  if (!completedReport) {
    return (
      <section
        aria-label="NASA-Informed AI Engineering Evaluation"
        className="gng-glass-panel border border-cyan-400/20 p-5"
      >
        <div className="flex items-center gap-2 font-mono-tech text-xs font-semibold uppercase tracking-wider text-cyan-300">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          NASA-Informed AI Engineering Report
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Authorize launch and complete orbital simulation to run the post-flight OpenAI engineering evaluation against official NASA systems-engineering standards.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="NASA-Informed AI Engineering Evaluation"
      data-testid="ai-engineering-debrief-panel"
      className="gng-glass-panel space-y-4 border border-cyan-400/25 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <div className="flex items-center gap-2 font-mono-tech text-xs font-semibold uppercase tracking-wider text-cyan-300">
            <Cpu className="h-4 w-4" aria-hidden="true" />
            NASA-Informed AI Engineering Evaluation
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Educational systems-engineering review grounded in NASA SEH &amp; NASA-STD-7009B/5001B/7001C/7002B (not an official NASA endorsement).
          </p>
        </div>

        <button
          type="button"
          onClick={handleRetry}
          disabled={loading}
          className="gng-glass-slice inline-flex items-center gap-1.5 px-3 py-1.5 font-mono-tech text-[11px] font-semibold text-cyan-200 transition hover:border-cyan-400/50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {loading ? 'Evaluating...' : 'Re-run Evaluation'}
        </button>
      </div>

      {loading && (
        <div
          role="status"
          className="rounded-lg border border-cyan-400/25 bg-cyan-950/20 p-4 text-xs text-cyan-200"
        >
          Requesting structured NASA-informed engineering evaluation from OpenAI Responses API...
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            AI Engineering Evaluation Unavailable ({error.code})
          </div>
          <p className="mt-1 text-xs text-amber-100/90">{error.message}</p>
          <p className="mt-2 text-[11px] text-slate-300">
            Your deterministic mission score and simulation telemetry remain intact above. You can retry the AI evaluation or submit your deterministic score to the leaderboard.
          </p>
        </div>
      )}

      {!loading && aiReport && (
        <div className="space-y-5">
          {/* Executive Summary + AI Overall Score */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/25 p-4">
            <div className="max-w-3xl space-y-1">
              <div className="font-mono-tech text-[11px] uppercase tracking-wider text-slate-400">
                Model {aiReport.model} · Rubric {aiReport.evaluationVersion} · ID{' '}
                {aiReport.evaluationId}
              </div>
              <p className="text-sm leading-relaxed text-slate-100">{aiReport.executiveSummary}</p>
            </div>
            <div className="shrink-0 rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-4 py-2.5 text-right">
              <div className="font-mono-tech text-[10px] uppercase text-cyan-300">
                AI Rubric Score
              </div>
              <div className="font-mono-tech text-2xl font-bold text-cyan-200">
                {aiReport.overallScore.toFixed(1)}{' '}
                <span className="text-xs text-slate-400">/ 100</span>
              </div>
              <div className="font-mono-tech text-[10px] font-semibold text-emerald-300">
                {aiReport.outcome}
              </div>
            </div>
          </div>

          {/* 5 Category Assessments + Expandable Deductions */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {CATEGORY_META.map(({ key, label }) => {
              const cat: AiCategoryEvaluation = aiReport.categories[key];
              const expanded = Boolean(expandedDeductions[key]);
              return (
                <div
                  key={key}
                  className="rounded-xl border border-white/10 bg-[#0d1424]/80 p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-100">
                      {label}
                    </span>
                    <div className="flex items-center gap-2 font-mono-tech text-xs">
                      <span className="font-bold text-cyan-300">
                        {cat.weightedPoints.toFixed(1)} / {cat.weight} pts
                      </span>
                    </div>
                  </div>
                  {cat.strengths.length > 0 && (
                    <p className="mt-1.5 text-xs text-slate-300">{cat.strengths[0]}</p>
                  )}

                  {cat.deductions.length > 0 && (
                    <div className="mt-2.5 border-t border-white/10 pt-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedDeductions((prev) => ({
                            ...prev,
                            [key]: !expanded,
                          }))
                        }
                        className="flex w-full items-center justify-between font-mono-tech text-[11px] font-semibold text-amber-300"
                      >
                        <span>
                          {cat.deductions.length} Evidence-Based Deduction
                          {cat.deductions.length === 1 ? '' : 's'}
                        </span>
                        {expanded ? (
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </button>

                      {expanded && (
                        <ul className="mt-2 space-y-1.5 text-[11px]">
                          {cat.deductions.map((ded, idx) => (
                            <li
                              key={`${ded.criterion}-${idx}`}
                              className="rounded border border-amber-400/25 bg-amber-500/5 p-2 text-slate-200"
                            >
                              <div className="flex items-center justify-between font-mono-tech">
                                <span className="font-semibold text-amber-300">{ded.criterion}</span>
                                <span className="text-red-300">
                                  -{ded.pointsDeducted.toFixed(1)} pts ({ded.status})
                                </span>
                              </div>
                              <div className="mt-0.5 text-slate-300">{ded.technicalExplanation}</div>
                              <div className="mt-0.5 font-mono-tech text-[10px] text-slate-400">
                                Observed: {ded.observedValue} {ded.unit} · Limit:{' '}
                                {ded.expectedValueOrLimit} {ded.unit} · Ref:{' '}
                                {ded.nasaReferenceCode ?? 'Simulator Rule'}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Recommendations & Official NASA References */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <h3 className="font-mono-tech text-xs font-semibold uppercase tracking-wider text-emerald-300">
                Prioritized Engineering Recommendations
              </h3>
              <ul className="mt-2.5 space-y-2 text-xs">
                {aiReport.engineeringRecommendations.map((rec, idx) => (
                  <li
                    key={`${rec.title}-${idx}`}
                    className="rounded-lg border border-white/10 bg-white/5 p-2.5"
                  >
                    <div className="font-semibold text-slate-100">{rec.title}</div>
                    <p className="mt-1 text-slate-300">{rec.recommendedChange}</p>
                    <p className="mt-1 font-mono-tech text-[10px] text-emerald-300">
                      Target: {rec.targetComponentOrParameter} ({rec.suggestedParameterRange})
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <h3 className="flex items-center gap-1.5 font-mono-tech text-xs font-semibold uppercase tracking-wider text-cyan-300">
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                NASA Reference Basis
              </h3>
              <ul className="mt-2.5 space-y-2 text-xs">
                {aiReport.nasaReferences.map((ref) => (
                  <li key={ref.code} className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tech font-bold text-cyan-200">{ref.code}</span>
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono-tech text-[10px] text-cyan-300 hover:underline"
                      >
                        Official Source <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </div>
                    <div className="mt-0.5 font-semibold text-slate-100">{ref.title}</div>
                    <p className="mt-0.5 text-slate-400">{ref.relevance}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-mono-tech text-[10px] text-slate-400">
                Educational simulation debrief — NASA-informed engineering guidance only; not an
                official NASA endorsement.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

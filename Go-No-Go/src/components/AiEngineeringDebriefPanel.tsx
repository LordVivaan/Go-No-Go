import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  RefreshCw,
  ShieldAlert,
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
  AiCategoryKey,
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
  key: AiCategoryKey;
  label: string;
  maxPoints: number;
}> = [
  { key: 'science', label: 'Science Return', maxPoints: 35 },
  { key: 'reliability', label: 'Reliability', maxPoints: 25 },
  { key: 'resourceEfficiency', label: 'Resource Efficiency', maxPoints: 15 },
  { key: 'communications', label: 'Data & Comms', maxPoints: 15 },
  { key: 'riskManagement', label: 'Risk Management', maxPoints: 10 },
];

function getGeminiErrorTitle(code: AiEvaluationError['code']): string {
  switch (code) {
    case 'EVALUATION_CREDENTIALS_MISSING':
      return 'API configuration missing';
    case 'EVALUATION_INVALID_CREDENTIALS':
      return 'Gemini evaluation unavailable (Invalid API credentials)';
    case 'EVALUATION_RATE_LIMITED':
      return 'Rate limit reached';
    case 'EVALUATION_INVALID_RESPONSE':
      return 'Invalid evaluation response';
    case 'EVALUATION_TIMEOUT':
      return 'Temporary Gemini service failure (Request timed out)';
    case 'EVALUATION_SERVICE_UNAVAILABLE':
      return 'Temporary Gemini service failure';
    default:
      return 'Gemini evaluation unavailable';
  }
}

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
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
        Complete a mission simulation run to trigger the Gemini AI systems engineering debrief.
      </div>
    );
  }

  return (
    <section
      className="rounded-xl border border-cyan-500/30 bg-slate-900/75 p-5 shadow-lg space-y-5"
      data-testid="ai-engineering-debrief-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">
              Gemini AI Systems Engineering Debrief
            </h2>
            <p className="text-xs text-slate-400">
              Independent NASA-informed rubric evaluation (kept separate from deterministic physics score)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {loading ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Evaluating mission...
            </span>
          ) : aiReport ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Evaluation completed
              </span>
              <span className="rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[11px] font-mono text-slate-300">
                {aiReport.model} · v{aiReport.evaluationVersion}
              </span>
            </>
          ) : error ? (
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry Gemini Evaluation
            </button>
          ) : null}
        </div>
      </div>

      {loading && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-6 text-center space-y-2">
          <Cpu className="h-6 w-6 text-cyan-400 mx-auto animate-pulse" />
          <p className="text-sm font-medium text-slate-200">
            Evaluating mission with Google Gemini...
          </p>
          <p className="text-xs text-slate-400">
            Analyzing payload utility, orbital mechanics, power/thermal margins, downlink balance, and risk posture.
          </p>
        </div>
      )}

      {!loading && error && (
        <div
          className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-4 space-y-2"
          data-testid="ai-evaluation-error"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-rose-300 font-semibold text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                {getGeminiErrorTitle(error.code)} ({error.code})
              </span>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1 rounded border border-rose-400/40 bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-100 hover:bg-rose-500/25"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
          <p className="text-xs text-rose-200/90">{error.message}</p>
          <p className="text-[11px] text-slate-300">
            Your deterministic simulation score ({completedReport.totalScore.toFixed(1)} / 100) remains preserved and can still be submitted to the leaderboard.
          </p>
        </div>
      )}

      {!loading && aiReport && (
        <div className="space-y-5" data-testid="ai-evaluation-report">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-cyan-500/30 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-wider text-cyan-300">
                Gemini AI Engineering Score
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white">
                  {aiReport.overallScore.toFixed(1)}
                </span>
                <span className="text-sm text-slate-400">/ 100</span>
              </div>
              <div className="mt-2 inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold border border-slate-700 bg-slate-800 text-slate-200">
                Assessment: {aiReport.assessment}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
              <div className="text-xs uppercase tracking-wider text-slate-400">
                Deterministic Simulation Score
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-200">
                  {completedReport.totalScore.toFixed(1)}
                </span>
                <span className="text-sm text-slate-500">/ 100</span>
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Physics engine grade: <span className="font-semibold text-slate-200">{completedReport.grade}</span> · {completedReport.outcome}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
              <div className="text-xs uppercase tracking-wider text-slate-400">
                Evaluation Snapshot
              </div>
              <div className="mt-1 text-xs font-mono text-slate-300 break-all">
                ID: {aiReport.evaluationId}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                Hash: <span className="font-mono">{aiReport.snapshotHash}</span>
                {aiReport.cached ? ' · Cached' : ''}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Executive Engineering Summary
            </h3>
            <p className="text-sm leading-relaxed text-slate-200">{aiReport.summary}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {CATEGORY_META.map(({ key, label, maxPoints }) => {
              const score = aiReport.categoryScores[key];
              const pct = Math.max(0, Math.min(100, (score / maxPoints) * 100));
              return (
                <div
                  key={key}
                  className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2"
                >
                  <div className="text-xs font-medium text-slate-300">{label}</div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-bold text-white">{score.toFixed(1)}</span>
                    <span className="text-xs text-slate-500">/ {maxPoints}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-cyan-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {aiReport.criticalFailures.length > 0 && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/25 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-300">
                <ShieldAlert className="h-4 w-4" />
                Critical Engineering Failures
              </div>
              <ul className="list-disc pl-5 space-y-1 text-xs text-rose-100">
                {aiReport.criticalFailures.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {aiReport.strengths.length > 0 && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/15 p-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                Verified Engineering Strengths
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-200">
                {aiReport.strengths.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Engineering Deductions & Corrective Actions ({aiReport.deductions.length})
            </h3>
            {aiReport.deductions.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
                No rubric deductions recorded for this mission run.
              </div>
            ) : (
              <div className="space-y-2">
                {aiReport.deductions.map((ded, idx) => {
                  const idKey = `${ded.category}-${idx}`;
                  const expanded = expandedDeductions[idKey] ?? true;
                  return (
                    <div
                      key={idKey}
                      className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedDeductions((prev) => ({ ...prev, [idKey]: !expanded }))
                        }
                        className="flex w-full items-center justify-between text-left gap-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                            -{ded.points.toFixed(1)} pts
                          </span>
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-mono text-slate-300">
                            {ded.category}
                          </span>
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-200">
                            {ded.severity}
                          </span>
                          <span className="text-xs font-medium text-white">{ded.finding}</span>
                        </div>
                        {expanded ? (
                          <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                        )}
                      </button>
                      {expanded && (
                        <div className="border-t border-slate-800 pt-2 text-xs space-y-1 text-slate-300">
                          <div>
                            <span className="font-semibold text-slate-200">Engineering Impact: </span>
                            {ded.engineeringImpact}
                          </div>
                          <div>
                            <span className="font-semibold text-cyan-300">Recommended Correction: </span>
                            {ded.recommendedCorrection}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {aiReport.engineeringRationale.length > 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-300">
                <BookOpen className="h-4 w-4" />
                NASA Systems Engineering Rationale
              </div>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-300">
                {aiReport.engineeringRationale.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {aiReport.limitations.length > 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Simulation & Evaluation Limitations
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-xs text-slate-400">
                {aiReport.limitations.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-slate-500 border-t border-slate-800 pt-3">
            {aiReport.educationalDisclaimer}
          </p>
        </div>
      )}
    </section>
  );
}

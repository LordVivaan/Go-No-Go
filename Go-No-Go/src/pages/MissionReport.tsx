import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  AlertOctagon,
  AlertTriangle,
  Award,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AiEngineeringDebriefPanel } from '../components/AiEngineeringDebriefPanel';
import { FormulaInspectorModal } from '../components/FormulaInspectorModal';
import { LeaderboardPanel } from '../components/LeaderboardPanel';
import { getCompactConfigName } from '../data/displayNames';
import type { AiMissionEvaluationReport } from '../types/aiEvaluation';
import { getRecordedEoDatasetUsage } from '../services/planetaryComputerService';
import { getRecordedWeatherUsage } from '../services/weatherService';
import {
  getMissionConfigSignature,
  useMissionStore,
  useResolvedMission,
} from '../store/missionStore';
import { useSimulationStore } from '../store/simulationStore';

export function MissionReport() {
  const navigate = useNavigate();
  const difficulty = useMissionStore((s) => s.difficulty);
  const instrumentDutyOverrides = useMissionStore((s) => s.instrumentDutyOverrides);
  const operationsPlan = useMissionStore((s) => s.operationsPlan);
  const userLaunchAuthorization = useMissionStore((s) => s.userLaunchAuthorization);
  const riskAcknowledged = useMissionStore((s) => s.riskAcknowledged);
  const resetMissionForNewAttempt = useMissionStore((s) => s.resetMissionForNewAttempt);
  const configSignature = useMissionStore(getMissionConfigSignature);
  const { scenario, bus, subsystems, instruments, orbit, launchVehicle, engineering, scorePreview } =
    useResolvedMission();

  const completedReport = useSimulationStore((s) => s.completedReport);
  const telemetryHistory = useSimulationStore((s) => s.telemetryHistory);
  const mappedRegionIds = useSimulationStore((s) => s.mappedRegionIds);
  const finalSystemHealthPct = useSimulationStore((s) => s.currentTelemetry.systemHealthPct);
  const initializeSimulation = useSimulationStore((s) => s.initializeSimulation);

  const report = completedReport ?? scorePreview;
  const isLivePreview = completedReport === null;
  const [formulasOpen, setFormulasOpen] = useState(false);
  const [aiEvaluation, setAiEvaluation] = useState<AiMissionEvaluationReport | null>(null);
  const externalEoUsage = getRecordedEoDatasetUsage();
  const externalWeatherUsage = getRecordedWeatherUsage();

  const [replayIndex, setReplayIndex] = useState(
    Math.max(0, telemetryHistory.length - 1)
  );
  const [showKppMatrix, setShowKppMatrix] = useState(false);

  const safeReplayIndex = Math.min(
    replayIndex,
    Math.max(0, telemetryHistory.length - 1)
  );
  const replayPoint = telemetryHistory[safeReplayIndex];

  const breakdownData = useMemo(
    () => [
      {
        name: 'Science',
        earned: Number(report.scienceScore.toFixed(1)),
        max: 35,
      },
      {
        name: 'Reliability',
        earned: Number(report.completionReliabilityScore.toFixed(1)),
        max: 25,
      },
      {
        name: 'Resource Eff.',
        earned: Number(report.resourceEfficiencyScore.toFixed(1)),
        max: 15,
      },
      {
        name: 'Data/Comms',
        earned: Number(report.dataCommsScore.toFixed(1)),
        max: 15,
      },
      {
        name: 'Ops/Risk',
        earned: Number(report.riskCollabScore.toFixed(1)),
        max: 10,
      },
    ],
    [report]
  );

  const handleStartNewAttempt = () => {
    resetMissionForNewAttempt();
    initializeSimulation(20261114);
    navigate('/');
  };

  const outcomeBadgeCls =
    report.outcome === 'SUCCESS'
      ? 'border-[#38D996]/50 bg-[#38D996]/15 text-[#38D996]'
      : report.outcome === 'PARTIAL_SUCCESS'
        ? 'border-[#FFB547]/50 bg-[#FFB547]/15 text-[#FFB547]'
        : 'border-[#FF5364]/50 bg-[#FF5364]/15 text-[#FF5364]';

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
      {/* Top Score & Outcome Verdict Banner */}
      <div className="gng-glass-panel flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono-tech text-[11px] font-semibold uppercase tracking-widest text-[#42D9F5]">
              Post-Flight Debrief — {scenario.code}
            </span>
            <span
              className={`gng-glass-pill px-2.5 py-0.5 font-mono-tech text-[11px] font-bold ${outcomeBadgeCls}`}
            >
              {report.outcome}
            </span>
            <span className="gng-glass-slice px-2 py-0.5 font-mono-tech text-[10px] text-slate-300">
              ENG: {engineering.validation.overallStatus === 'NO_GO' ? 'NO-GO' : engineering.validation.overallStatus} ·
              AUTH: {userLaunchAuthorization === 'NO_GO' ? 'NO-GO' : userLaunchAuthorization}
              {riskAcknowledged ? ' (RISK OVERRIDE)' : ''}
            </span>
            {isLivePreview && (
              <span className="gng-glass-pill border-[#FFB547]/40 px-2.5 py-0.5 font-mono-tech text-[11px] text-[#FFB547]">
                Pre-Flight Projection
              </span>
            )}
          </div>
          <h1
            title={report.configurationName}
            className="break-words font-display text-2xl font-bold text-[#F1F5FA] sm:text-3xl"
          >
            {getCompactConfigName(report.configurationName)}
          </h1>
          <p className="text-xs text-[#8E9BAD]">
            Overall Normalized Mission Score across 5 aerospace engineering & operations buckets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="gng-glass-card flex items-baseline gap-3 px-5 py-3">
            <div>
              <div className="text-[11px] text-[#8E9BAD]">Total Score</div>
              <div className="font-mono-tech text-3xl font-bold tabular-nums text-[#42D9F5]">
                {report.totalScore.toFixed(1)}
                <span className="text-sm text-[#8E9BAD]"> / 100</span>
              </div>
            </div>
            <div className="border-l border-[#F1F5FA]/15 pl-3 text-center">
              <div className="text-[11px] text-[#8E9BAD]">Grade</div>
              <div className="font-display text-3xl font-bold text-[#38D996]">
                {report.grade}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setFormulasOpen(true)}
              className="gng-glass-pill flex items-center gap-1.5 border-[#F1F5FA]/20 px-4 py-2.5 text-xs font-semibold text-[#F1F5FA] transition hover:border-[#42D9F5]/60 hover:text-[#42D9F5]"
            >
              <Calculator className="h-3.5 w-3.5 text-[#42D9F5]" aria-hidden="true" />
              INSPECT EQUATIONS
            </button>
            <Link
              to="/subsystems"
              className="gng-glass-pill flex items-center gap-1.5 border-[#F1F5FA]/20 px-4 py-2.5 text-xs font-semibold text-[#F1F5FA] transition hover:border-[#42D9F5]/60 hover:text-[#42D9F5]"
            >
              <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
              ADJUST SUBSYSTEMS
            </Link>
            <button
              type="button"
              onClick={handleStartNewAttempt}
              className="flex items-center gap-1.5 rounded-full bg-[#42D9F5] px-5 py-2.5 text-xs font-bold text-[#080B12] transition hover:bg-[#42D9F5]/90"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              START NEW ATTEMPT
            </button>
          </div>
        </div>
      </div>

      {/* Failure Autopsy Banner (when not full SUCCESS) */}
      {report.outcome !== 'SUCCESS' && report.failureReason && (
        <div
          role="alert"
          className="gng-glass-panel flex items-start gap-3 border-[#FF5364]/45 bg-[#FF5364]/12 p-4"
        >
          <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-[#FF5364]" aria-hidden="true" />
          <div>
            <h2 className="font-display text-sm font-bold text-[#FF5364]">
              Mission Anomaly & Failure Autopsy
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[#F1F5FA]/90">
              {report.failureReason}
            </p>
          </div>
        </div>
      )}

      {/* Main Analytics Split: 5-Bucket Score Breakdown + Telemetry Timeline Scrubber */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="gng-glass-panel space-y-4 p-5 lg:col-span-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-[#42D9F5]" aria-hidden="true" />
              <h2 className="font-mono-tech text-xs font-semibold uppercase tracking-wider text-[#F1F5FA]">
                5-Bucket Normalized Score Breakdown
              </h2>
            </div>
            <span className="font-mono-tech text-[11px] tabular-nums text-[#8E9BAD]">
              Mapped Basins: {mappedRegionIds.length}/{scenario.targetRegions.length}
            </span>
          </div>

          <div className="h-60 w-full min-w-0">
            <ResponsiveContainer width="100%" height={240} minWidth={240}>
              <BarChart data={breakdownData} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(142, 155, 173, 0.16)" />
                <XAxis dataKey="name" stroke="#8E9BAD" fontSize={11} />
                <YAxis stroke="#8E9BAD" fontSize={11} domain={[0, 35]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0D1422',
                    borderColor: 'rgba(241, 245, 250, 0.16)',
                    borderRadius: '12px',
                    fontSize: '11px',
                    color: '#F1F5FA',
                  }}
                />
                <Bar
                  dataKey="earned"
                  name="Score Earned"
                  fill="#42D9F5"
                  radius={[8, 8, 0, 0]}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="max"
                  name="Max Bucket Points"
                  fill="#2A3B57"
                  radius={[8, 8, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-5 gap-2 text-center font-mono-tech text-[11px] tabular-nums">
            {breakdownData.map((b) => (
              <div key={b.name} className="gng-glass-card p-2">
                <div className="text-[#8E9BAD]">{b.name}</div>
                <div className="mt-0.5 font-bold text-[#F1F5FA]">
                  {b.earned}/{b.max}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Replay Scrubber */}
        <div className="gng-glass-panel flex flex-col justify-between space-y-4 p-5 lg:col-span-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-mono-tech text-xs font-semibold uppercase tracking-wider text-[#F1F5FA]">
                Telemetry Black-Box Replay
              </h2>
              <span className="font-mono-tech text-[11px] tabular-nums text-[#42D9F5]">
                Sample {safeReplayIndex + 1} / {Math.max(1, telemetryHistory.length)}
              </span>
            </div>

            <div className="gng-glass-card space-y-2 p-4">
              <label
                htmlFor="report-replay-scrubber"
                className="block text-xs font-medium text-[#8E9BAD]"
              >
                Replay mission telemetry timeline
              </label>
              <input
                id="report-replay-scrubber"
                aria-label="Replay mission telemetry timeline"
                type="range"
                min={0}
                max={Math.max(0, telemetryHistory.length - 1)}
                value={safeReplayIndex}
                onChange={(e) => setReplayIndex(Number(e.target.value))}
                className="w-full accent-[#42D9F5]"
              />
            </div>

            {replayPoint && (
              <div className="grid grid-cols-2 gap-2.5 font-mono-tech text-xs tabular-nums sm:grid-cols-3">
                <div className="gng-glass-card p-3">
                  <div className="text-[11px] text-[#8E9BAD]">Mission Elapsed</div>
                  <div className="mt-1 font-bold text-[#42D9F5]">
                    {(replayPoint.metSeconds / 3600).toFixed(2)} hrs
                  </div>
                </div>
                <div className="gng-glass-card p-3">
                  <div className="text-[11px] text-[#8E9BAD]">Battery SoC</div>
                  <div className="mt-1 font-bold text-[#38D996]">
                    {replayPoint.batterySocPct.toFixed(1)}%
                  </div>
                </div>
                <div className="gng-glass-card p-3">
                  <div className="text-[11px] text-[#8E9BAD]">SSR Backlog</div>
                  <div className="mt-1 font-bold text-[#F1F5FA]">
                    {replayPoint.ssrBacklogGb.toFixed(2)} GB
                  </div>
                </div>
                <div className="gng-glass-card p-3">
                  <div className="text-[11px] text-[#8E9BAD]">Thermal Bus</div>
                  <div className="mt-1 font-bold text-[#FFB547]">
                    {replayPoint.temperatureC.toFixed(1)} °C
                  </div>
                </div>
                <div className="gng-glass-card p-3">
                  <div className="text-[11px] text-[#8E9BAD]">Downlinked</div>
                  <div className="mt-1 font-bold text-[#38D996]">
                    {replayPoint.cumulativeDataDownlinkedGb.toFixed(2)} GB
                  </div>
                </div>
                <div className="gng-glass-card p-3">
                  <div className="text-[11px] text-[#8E9BAD]">Bus Health</div>
                  <div className="mt-1 font-bold text-[#F1F5FA]">
                    {replayPoint.systemHealthPct.toFixed(1)}%
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowKppMatrix((v) => !v)}
            className="gng-glass-card flex items-center justify-between px-4 py-3 text-xs font-semibold text-[#F1F5FA] transition hover:border-[#42D9F5]/45"
          >
            <span>
              Expand Technical Debrief & KPP Matrix ({report.kppEvaluations.length} Objectives)
            </span>
            {showKppMatrix ? (
              <ChevronUp className="h-4 w-4 text-[#42D9F5]" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#42D9F5]" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Expandable Technical Debrief & KPP Verification Matrix */}
      {showKppMatrix && (
        <div className="gng-glass-panel space-y-4 p-5">
          <h2 className="font-mono-tech text-xs font-semibold uppercase tracking-wider text-[#F1F5FA]">
            Key Performance Parameter Verification & Engineering Debrief
          </h2>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {report.kppEvaluations.map((kpp) => (
              <div key={kpp.kppId} className="gng-glass-card flex items-start gap-3 p-3.5">
                {kpp.status === 'GO' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#38D996]" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#FFB547]" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#F1F5FA]">{kpp.name}</span>
                    <span className="font-mono-tech text-[11px] tabular-nums text-[#42D9F5]">
                      {kpp.measuredText}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#8E9BAD]">
                    Threshold: {kpp.thresholdText} · Goal: {kpp.goalText}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {report.debriefNotes.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-black/25 p-3.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Flight Director Engineering Notes
              </div>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-slate-300">
                {report.debriefNotes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {report.penaltiesApplied.length > 0 && (
            <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Caps & Penalties Applied
              </div>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-amber-200">
                {report.penaltiesApplied.map((p, idx) => (
                  <li key={idx}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {(scenario.celestialBody === 'EARTH' ||
            externalEoUsage.length > 0 ||
            externalWeatherUsage.length > 0) && (
            <div className="rounded-xl border border-cyan-400/20 bg-black/25 p-3.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                External Earth-Observation Datasets & Provenance
              </div>
              {externalEoUsage.length > 0 ? (
                <ul className="mt-2 space-y-1.5 text-xs text-slate-300">
                  {externalEoUsage.map((item, idx) => (
                    <li
                      key={`${item.datasetId}-${item.itemId ?? idx}`}
                      className="rounded-lg border border-white/10 bg-[#0D1422]/80 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                        <span className="font-semibold text-[#F1F5FA]">
                          {item.datasetId} ({item.observationType}) — {item.basinName}
                        </span>
                        <span className={item.isFallback ? 'text-[#FFB547]' : 'text-[#38D996]'}>
                          {item.isFallback ? 'OFFLINE FALLBACK' : item.archiveStatus}
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-[#8E9BAD]">
                        {item.itemId ? `Item: ${item.itemId}` : 'No live item fetched'}
                        {item.acquisitionDatetimeIso ? ` · ${item.acquisitionDatetimeIso}` : ''}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[#8E9BAD]">{item.attribution}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-xs text-slate-400">
                  No external Planetary Computer or NASA GIBS scenes were queried during this flight
                  run (simulation used deterministic orbital &amp; scenario target parameters).
                  {scenario.celestialBody === 'EARTH'
                    ? ' Open the EO imagery inspector in Briefing or Operations to attach real Sentinel-1 RTC / Sentinel-2 L2A acquisitions.'
                    : ''}
                </p>
              )}

              <div className="mt-4 border-t border-white/10 pt-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                  Weather Snapshot Provenance (Meteomatics)
                </div>
                {externalWeatherUsage.length > 0 ? (
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-300">
                    {externalWeatherUsage.map((wx, idx) => (
                      <li
                        key={`${wx.basinId}-${wx.windowMode}-${wx.dataTimeUtc}-${idx}`}
                        className="rounded-lg border border-white/10 bg-[#0D1422]/80 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                          <span className="font-semibold text-[#F1F5FA]">
                            {wx.basinName} · {wx.windowMode} ({wx.classification})
                          </span>
                          <span className="text-[#38D996]">
                            {wx.provider} ({wx.model}) · {wx.cacheStatus}
                          </span>
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] text-[#8E9BAD]">
                          Data UTC: {wx.dataTimeUtc} · Retrieved UTC: {wx.retrievedAtUtc}
                          {wx.precip1hMm !== null ? ` · Precip: ${wx.precip1hMm.toFixed(1)} mm` : ''}
                          {wx.totalCloudCoverPct !== null
                            ? ` · Cloud: ${Math.round(wx.totalCloudCoverPct)}%`
                            : ''}
                          {wx.windSpeed10mMs !== null
                            ? ` · Wind: ${wx.windSpeed10mMs.toFixed(1)} m/s`
                            : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-xs text-slate-400">
                    No live Meteomatics weather snapshots were requested during this flight attempt
                    (deterministic orbital simulation & static basin cloud baseline used). Open
                    Basin Weather in Briefing or Operations to attach weather provenance.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* NASA-Informed AI Engineering Debrief */}
      <AiEngineeringDebriefPanel
        completedReport={completedReport}
        scenario={scenario}
        difficulty={difficulty}
        bus={bus}
        instruments={instruments}
        instrumentDutyOverrides={instrumentDutyOverrides}
        subsystems={subsystems}
        orbit={orbit}
        launcher={launchVehicle}
        operationsPlan={operationsPlan}
        engineering={engineering}
        finalSystemHealthPct={finalSystemHealthPct}
        onEvaluationReady={setAiEvaluation}
      />

      {/* Embedded International Leaderboard (Global / Country / Season) */}
      <LeaderboardPanel
        report={report}
        engineering={engineering}
        scenario={scenario}
        instruments={instruments}
        difficulty={difficulty}
        configSignature={configSignature}
        isLivePreview={isLivePreview}
        aiEvaluation={aiEvaluation}
      />

      <FormulaInspectorModal
        isOpen={formulasOpen}
        onClose={() => setFormulasOpen(false)}
        engineering={engineering}
      />
    </div>
  );
}

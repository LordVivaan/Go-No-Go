import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flag,
  Globe,
  RefreshCw,
  Send,
  ShieldCheck,
  Trophy,
  WifiOff,
} from 'lucide-react';
import { MISSION_SCENARIOS } from '../data/scenarios';
import {
  buildLeaderboardVerificationTelemetry,
  fetchMissionLeaderboard,
  getOrCreatePlayerIdentity,
  submitVerifiedMissionScore,
  validatePlayerAlias,
} from '../services/leaderboardService';
import { isSupabaseConfigured, supabaseConfigReason } from '../services/supabaseClient';
import { useSimulationStore } from '../store/simulationStore';
import type { EngineeringSummary } from '../types/engineering';
import {
  CURRENT_SEASON_CODE,
  ISO_COUNTRY_OPTIONS,
  SEASON_OPTIONS,
  type LeaderboardQueryResult,
  type LeaderboardScope,
  type LeaderboardSubmissionResult,
} from '../types/leaderboard';
import type { MissionDifficulty, ScenarioDefinition } from '../types/mission';
import type { MissionScoreReport } from '../types/simulation';
import type { ScientificInstrument } from '../types/spacecraft';

export interface LeaderboardPanelProps {
  report: MissionScoreReport;
  engineering: EngineeringSummary;
  scenario: ScenarioDefinition;
  instruments: ScientificInstrument[];
  difficulty: MissionDifficulty;
  configSignature: string;
  isLivePreview?: boolean;
}

const PAGE_SIZE = 15;

function formatDurationCompact(sec: number): string {
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

export function LeaderboardPanel({
  report,
  engineering,
  scenario,
  instruments,
  difficulty,
  configSignature,
  isLivePreview = false,
}: LeaderboardPanelProps) {
  const initialIdentity = getOrCreatePlayerIdentity();
  const finalSystemHealthPct = useSimulationStore((s) => s.currentTelemetry.systemHealthPct);

  const [scope, setScope] = useState<LeaderboardScope>('GLOBAL');
  const [filterMission, setFilterMission] = useState<string>(scenario.code);
  const [filterDifficulty, setFilterDifficulty] = useState<MissionDifficulty>(difficulty);
  const [filterSeason, setFilterSeason] = useState<string>(CURRENT_SEASON_CODE);
  const [filterCountry, setFilterCountry] = useState<string>(initialIdentity.countryCode ?? 'US');
  const [offset, setOffset] = useState(0);

  const [playerAlias, setPlayerAlias] = useState(initialIdentity.playerAlias);
  const [playerCountry, setPlayerCountry] = useState<string>(initialIdentity.countryCode ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [submittedRunId, setSubmittedRunId] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<LeaderboardSubmissionResult | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [board, setBoard] = useState<LeaderboardQueryResult>(() => ({
    status: isSupabaseConfigured ? 'OK' : 'OFFLINE',
    totalCount: 0,
    entries: [],
    playerEntry: null,
    nearbyEntries: [],
  }));

  const activeCountryParam = scope === 'COUNTRY' ? filterCountry : null;
  const activeSeasonParam = scope === 'SEASON' ? CURRENT_SEASON_CODE : filterSeason;

  const refreshLeaderboard = useCallback(async () => {
    setLoading(true);
    const res = await fetchMissionLeaderboard({
      missionCode: filterMission,
      difficulty: filterDifficulty,
      seasonCode: activeSeasonParam,
      countryCode: activeCountryParam,
      limit: PAGE_SIZE,
      offset,
    });
    setBoard(res);
    setLoading(false);
  }, [activeCountryParam, activeSeasonParam, filterDifficulty, filterMission, offset]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    void fetchMissionLeaderboard({
      missionCode: filterMission,
      difficulty: filterDifficulty,
      seasonCode: activeSeasonParam,
      countryCode: activeCountryParam,
      limit: PAGE_SIZE,
      offset,
    }).then((res) => {
      if (!active) return;
      setBoard(res);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [activeCountryParam, activeSeasonParam, filterDifficulty, filterMission, offset]);

  const alreadySubmitted = submittedRunId === report.runId;

  const canSubmitScore =
    !isLivePreview &&
    engineering.validation.overallStatus !== 'NO_GO' &&
    report.outcome !== 'MISSION_LOSS' &&
    report.totalScore >= 50;

  const aliasCheck = validatePlayerAlias(playerAlias);

  const handleScopeChange = (nextScope: LeaderboardScope) => {
    setScope(nextScope);
    setOffset(0);
    if (nextScope === 'COUNTRY' && playerCountry) {
      setFilterCountry(playerCountry);
    }
    if (nextScope === 'SEASON') {
      setFilterSeason(CURRENT_SEASON_CODE);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmitScore || submitting || alreadySubmitted) return;
    setSubmitting(true);
    setSubmitResult(null);

    const telemetry = buildLeaderboardVerificationTelemetry({
      report,
      engineering,
      scenario,
      instruments,
      configSignature,
      finalSystemHealthPct,
    });

    const result = await submitVerifiedMissionScore({
      playerAlias,
      countryCode: playerCountry || null,
      missionCode: scenario.code,
      difficulty,
      seasonCode: CURRENT_SEASON_CODE,
      configurationName: report.configurationName,
      telemetry,
    });

    setSubmitResult(result);
    setSubmitting(false);

    if (result.ok) {
      setSubmittedRunId(report.runId);
      setFilterMission(scenario.code);
      setFilterDifficulty(difficulty);
      setFilterSeason(CURRENT_SEASON_CODE);
      if (playerCountry) {
        setFilterCountry(playerCountry);
      }
      setOffset(0);
      await refreshLeaderboard();
    }
  };

  const pageNumber = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(board.totalCount / PAGE_SIZE));

  return (
    <section
      aria-label="International Leaderboard"
      className="mt-5 rounded-2xl border border-white/10 bg-slate-950/75 p-4 backdrop-blur-md sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-300">
            <Trophy className="h-4 w-4" /> International Leaderboard
          </div>
          <h2 className="mt-1 text-base font-bold text-slate-100">
            Global, Regional & Seasonal Standings (Provisional)
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Scores are recomputed server-side from submitted mission telemetry (35/25/15/15/10) with deterministic tie-breakers (Score → Flight Duration → Earliest Run). Because interactive orbital ops run client-side without full server replay, browser submissions are marked Provisional.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refreshLeaderboard()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Scope Tabs + Filter Controls */}
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex rounded-xl border border-white/10 bg-black/35 p-1">
          {(
            [
              { id: 'GLOBAL', label: 'Global', icon: Globe },
              { id: 'COUNTRY', label: 'Country / Region', icon: Flag },
              { id: 'SEASON', label: `Season (${CURRENT_SEASON_CODE})`, icon: Calendar },
            ] as const
          ).map(({ id, label, icon: Icon }) => {
            const active = scope === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleScopeChange(id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/35'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter mission"
            value={filterMission}
            onChange={(e) => {
              setFilterMission(e.target.value);
              setOffset(0);
            }}
            className="rounded-lg border border-white/10 bg-slate-900/90 px-2.5 py-1.5 text-xs font-medium text-slate-200 outline-none focus:border-cyan-400/50"
          >
            {MISSION_SCENARIOS.map((sc) => (
              <option key={sc.id} value={sc.code}>
                {sc.code}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter difficulty"
            value={filterDifficulty}
            onChange={(e) => {
              setFilterDifficulty(e.target.value as MissionDifficulty);
              setOffset(0);
            }}
            className="rounded-lg border border-white/10 bg-slate-900/90 px-2.5 py-1.5 text-xs font-medium text-slate-200 outline-none focus:border-cyan-400/50"
          >
            <option value="STANDARD">STANDARD</option>
            <option value="HARD">HARD</option>
            <option value="EXPERT">EXPERT</option>
          </select>

          {scope !== 'SEASON' && (
            <select
              aria-label="Filter season"
              value={filterSeason}
              onChange={(e) => {
                setFilterSeason(e.target.value);
                setOffset(0);
              }}
              className="rounded-lg border border-white/10 bg-slate-900/90 px-2.5 py-1.5 text-xs font-medium text-slate-200 outline-none focus:border-cyan-400/50"
            >
              {SEASON_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          {scope === 'COUNTRY' && (
            <select
              aria-label="Filter country"
              value={filterCountry}
              onChange={(e) => {
                setFilterCountry(e.target.value);
                setOffset(0);
              }}
              className="rounded-lg border border-white/10 bg-slate-900/90 px-2.5 py-1.5 text-xs font-medium text-slate-200 outline-none focus:border-cyan-400/50"
            >
              {ISO_COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Verified Score Submission Form */}
      <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3.5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="gng-player-alias"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400"
              >
                Pilot Callsign (Pseudonymous, 2–24 chars)
              </label>
              <input
                id="gng-player-alias"
                type="text"
                maxLength={24}
                value={playerAlias}
                onChange={(e) => setPlayerAlias(e.target.value)}
                placeholder="FLIGHT-01"
                className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/90 px-3 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-cyan-400/60"
              />
            </div>

            <div>
              <label
                htmlFor="gng-player-country"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400"
              >
                Country / Region (Optional ISO Opt-In)
              </label>
              <select
                id="gng-player-country"
                value={playerCountry}
                onChange={(e) => setPlayerCountry(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-400/60"
              >
                <option value="">Global / Prefer Not to Say</option>
                {ISO_COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmitScore || !aliasCheck.valid || submitting || alreadySubmitted}
            className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              canSubmitScore && aliasCheck.valid && !alreadySubmitted
                ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                : 'cursor-not-allowed bg-slate-800 text-slate-500'
            }`}
          >
            <Send className="h-3.5 w-3.5" />
            {submitting
              ? 'Verifying...'
              : alreadySubmitted
                ? 'Run Submitted'
                : `Submit Run (${report.totalScore.toFixed(1)} · ${difficulty})`}
          </button>
        </div>

        {!aliasCheck.valid && (
          <p className="mt-2 text-xs text-amber-300">{aliasCheck.error}</p>
        )}

        {!canSubmitScore && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {isLivePreview
              ? 'Complete a flight simulation in Stage 5 (Mission Operations) before submitting to the verified leaderboard.'
              : 'Mission Loss and NO-GO flights are excluded from verified leaderboard rankings (minimum 50.0 pts required).'}
          </p>
        )}

        {submitResult && (
          <div
            className={`mt-2.5 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
              submitResult.ok
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                : 'border-amber-400/30 bg-amber-500/10 text-amber-200'
            }`}
          >
            {submitResult.ok ? (
              <>
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" />
                <span>
                  {submitResult.verificationStatus === 'VERIFIED'
                    ? 'Verified score'
                    : 'Provisional score (telemetry-checked)'}{' '}
                  <strong>{submitResult.verifiedScore?.toFixed(1)}</strong> (Grade{' '}
                  {submitResult.grade}).{' '}
                  {submitResult.isNewPersonalBest
                    ? 'New personal best recorded!'
                    : `Existing personal best (${submitResult.bestScore?.toFixed(1)}) retained.`}
                  {submitResult.authWarning ? ` (${submitResult.authWarning})` : ''}
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                <span>
                  {submitResult.error}
                  {submitResult.authWarning ? ` (${submitResult.authWarning})` : ''}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Player Rank Summary Strip */}
      {board.status === 'OK' && board.playerEntry && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3.5 py-2.5 text-xs text-cyan-100">
          <div className="flex items-center gap-2">
            <span className="rounded bg-cyan-400/20 px-2 py-0.5 font-mono font-bold text-cyan-200">
              RANK #{board.playerEntry.rank}
            </span>
            <span className="font-semibold">{board.playerEntry.playerAlias}</span>
            {board.playerEntry.countryCode && (
              <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px]">
                {board.playerEntry.countryCode}
              </span>
            )}
          </div>
          <div className="font-mono text-xs">
            Best Score: <strong>{Number(board.playerEntry.totalScore).toFixed(1)}</strong> / 100 (Grade{' '}
            {board.playerEntry.grade})
          </div>
        </div>
      )}

      {/* Standings Body */}
      <div className="mt-4">
        {board.status === 'OFFLINE' ? (
          <div className="gng-glass-slice p-5 text-center">
            <WifiOff className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
            <div className="mt-2 text-sm font-semibold text-slate-200">
              International Leaderboard Offline
            </div>
            <p className="mx-auto mt-1 max-w-lg text-xs text-slate-400">
              {supabaseConfigReason ??
                'Public Supabase configuration is missing or invalid.'}{' '}
              Your local mission score (
              <span className="font-mono font-semibold text-cyan-300">
                {report.totalScore.toFixed(1)} / 100 · {difficulty}
              </span>
              ) has been computed accurately on-device without placeholder rankings.
            </p>
          </div>
        ) : board.status === 'ERROR' ? (
          <div className="min-w-0 break-words rounded-xl border border-red-400/25 bg-red-500/10 p-4 text-xs text-red-200">
            {board.errorMessage?.startsWith('Leaderboard unavailable: RPC function not found.') ||
            board.errorMessage?.startsWith('Leaderboard temporarily unavailable: connection error') ? (
              <>
                <div className="font-semibold">
                  {board.errorMessage.startsWith('Leaderboard unavailable: RPC function not found.')
                    ? 'Leaderboard unavailable: RPC function not found.'
                    : 'Leaderboard temporarily unavailable: unable to reach server.'}
                </div>
                <details className="mt-2 text-[11px] text-red-300/85">
                  <summary className="cursor-pointer select-none hover:text-red-100">
                    Technical details
                  </summary>
                  <p className="mt-1 break-all font-mono">{board.errorMessage}</p>
                </details>
              </>
            ) : (
              <div>
                Unable to load leaderboard standings: {board.errorMessage ?? 'Unknown server error'}
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="rounded-xl border border-white/10 bg-black/25 p-5 text-center text-xs text-slate-400">
            Loading verified standings...
          </div>
        ) : board.entries.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/25 p-5 text-center text-xs text-slate-400">
            No verified runs recorded yet for{' '}
            <span className="font-mono text-slate-200">
              {filterMission} · {filterDifficulty}
            </span>
            {scope === 'COUNTRY' ? ` · ${filterCountry}` : ''}. Complete and submit the first run!
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/25">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="border-b border-white/10 bg-white/5 text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5">Rank</th>
                    <th className="px-3 py-2.5">Callsign</th>
                    <th className="px-3 py-2.5">Region</th>
                    <th className="px-3 py-2.5">Spacecraft</th>
                    <th className="px-3 py-2.5 text-right">Data</th>
                    <th className="px-3 py-2.5 text-right">Duration</th>
                    <th className="px-3 py-2.5 text-right">Score</th>
                    <th className="px-3 py-2.5 text-center">Grade</th>
                    <th className="px-3 py-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {board.entries.map((entry) => (
                    <tr
                      key={entry.id}
                      className={
                        entry.isCurrentPlayer
                          ? 'bg-cyan-500/15 text-cyan-100'
                          : 'text-slate-200 hover:bg-white/5'
                      }
                    >
                      <td className="px-3 py-2 font-mono font-bold">#{entry.rank}</td>
                      <td className="px-3 py-2 font-semibold">
                        {entry.playerAlias}
                        {entry.isCurrentPlayer && (
                          <span className="ml-1.5 rounded bg-cyan-400/20 px-1.5 py-0.5 text-[10px] text-cyan-200">
                            YOU
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-300">
                        {entry.countryCode ?? '—'}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-slate-300">
                        {entry.configurationName}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-300">
                        {Number(entry.dataDownlinkedGb).toFixed(1)} GB
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-300">
                        {formatDurationCompact(entry.completionDurationSec)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-emerald-300">
                        {Number(entry.totalScore).toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-center font-mono font-bold">
                        {entry.grade}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                            entry.verificationStatus === 'VERIFIED' || entry.isVerified
                              ? 'bg-emerald-500/20 text-emerald-200'
                              : 'bg-amber-500/15 text-amber-200'
                          }`}
                        >
                          {entry.verificationStatus ?? (entry.isVerified ? 'VERIFIED' : 'PROVISIONAL')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {board.nearbyEntries.length > 0 &&
              !board.entries.some((e) => e.isCurrentPlayer) && (
                <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Nearby Standings Around Your Rank
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {board.nearbyEntries.map((entry) => (
                      <div
                        key={`nearby-${entry.id}`}
                        className={`rounded-lg border px-2.5 py-1 text-xs ${
                          entry.isCurrentPlayer
                            ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100'
                            : 'border-white/10 bg-white/5 text-slate-300'
                        }`}
                      >
                        <span className="font-mono font-bold">#{entry.rank}</span>{' '}
                        <span>{entry.playerAlias}</span> ·{' '}
                        <span className="font-mono text-emerald-300">
                          {Number(entry.totalScore).toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>
                Showing {offset + 1}–{Math.min(offset + board.entries.length, board.totalCount)} of{' '}
                {board.totalCount} verified runs (Page {pageNumber} / {totalPages})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  disabled={offset === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200 disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </button>
                <button
                  type="button"
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= board.totalCount}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200 disabled:opacity-40"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

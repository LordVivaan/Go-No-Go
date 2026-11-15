import { ArrowUpRight, Bot, Compass, Cpu, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  generateMissionAdvisorReport,
  isOptionalAiProviderConfigured,
  requestOptionalAiExplanation,
  type AdvisorPriority,
  type OptionalAiAdvisorResponse,
} from '../engine/advisor';
import { useResolvedMission } from '../store/missionStore';

function priorityBadge(priority: AdvisorPriority) {
  if (priority === 'CRITICAL') {
    return (
      <span className="rounded border border-[#FF5364]/60 bg-[#FF5364]/15 px-2 py-0.5 font-mono text-[11px] font-bold text-[#FF5364]">
        CRITICAL BLOCKER
      </span>
    );
  }
  if (priority === 'HIGH') {
    return (
      <span className="rounded border border-[#FFB547]/60 bg-[#FFB547]/15 px-2 py-0.5 font-mono text-[11px] font-bold text-[#FFB547]">
        HIGH PRIORITY TRADE
      </span>
    );
  }
  return (
    <span className="rounded border border-[#38D996]/60 bg-[#38D996]/15 px-2 py-0.5 font-mono text-[11px] font-bold text-[#38D996]">
      OPTIMIZATION
    </span>
  );
}

export function MissionAdvisorPanel() {
  const resolved = useResolvedMission();
  const report = generateMissionAdvisorReport(resolved);
  const aiConfigured = isOptionalAiProviderConfigured();
  const [aiResult, setAiResult] = useState<OptionalAiAdvisorResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const handleRequestAi = async () => {
    setAiLoading(true);
    const response = await requestOptionalAiExplanation({
      scenarioCode: resolved.scenario.code,
      report,
    });
    setAiResult(response);
    setAiLoading(false);
  };

  return (
    <div
      data-testid="mission-advisor-panel"
      className="rounded-2xl border border-[#1E2D45] bg-[#141E2E] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1E2D45] pb-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs uppercase text-[#42D9F5]">
            <Compass className="h-4 w-4" />
            <span>Systems Engineering Mission Advisor · Deterministic Rule Engine</span>
          </div>
          <h3 className="mt-1 font-display text-sm font-bold text-[#F1F5FA]">
            PRIORITIZED ENGINEERING TRADE & REMEDIATION GUIDANCE
          </h3>
          <p className="mt-1 text-xs text-[#8E9BAD]">{report.summary}</p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <button
            type="button"
            disabled={!aiConfigured || aiLoading}
            onClick={() => void handleRequestAi()}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[11px] font-semibold transition ${
              aiConfigured
                ? 'border-[#42D9F5]/60 bg-[#0D1422] text-[#42D9F5] hover:bg-[#42D9F5]/15'
                : 'cursor-not-allowed border-[#2A3B57] bg-[#0D1422] text-[#8E9BAD]'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>
              {aiLoading
                ? 'Requesting Server Summary...'
                : aiConfigured
                  ? 'Request Server AI Narrative'
                  : 'Server AI Hook: Deterministic Mode'}
            </span>
          </button>
          <span className="font-mono text-[11px] text-[#8E9BAD]">
            <Cpu className="mr-1 inline h-3 w-3 text-[#38D996]" />
            {aiConfigured
              ? 'Optional VITE_ADVISOR_ENDPOINT detected'
              : 'No external AI key needed — 100% local deterministic evaluation'}
          </span>
        </div>
      </div>

      {aiResult && (
        <div className="mt-3 rounded-xl border border-[#42D9F5]/40 bg-[#0D1422] p-3 text-xs text-[#F1F5FA]">
          <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase text-[#42D9F5]">
            <Bot className="h-3.5 w-3.5" />
            <span>{aiResult.providerNote}</span>
          </div>
          {aiResult.narrative && <p className="mt-1.5 leading-relaxed">{aiResult.narrative}</p>}
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        {report.recommendations.map((rec) => (
          <div
            key={rec.id}
            className="flex flex-col justify-between gap-3 rounded-xl border border-[#1E2D45] bg-[#0D1422] p-4 md:flex-row md:items-center"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {priorityBadge(rec.priority)}
                <span className="rounded bg-[#141E2E] px-2 py-0.5 font-mono text-[11px] text-[#42D9F5]">
                  {rec.domain}
                </span>
                <h4 className="font-display text-xs font-bold text-[#F1F5FA]">{rec.title}</h4>
              </div>
              <p className="text-xs text-[#8E9BAD]">
                <strong className="text-[#F1F5FA]">Engineering basis:</strong> {rec.engineeringBasis}
              </p>
              <p className="text-xs text-[#F1F5FA]/90">
                <strong className="text-[#38D996]">Recommended trade:</strong> {rec.action}{' '}
                <span className="text-[#8E9BAD]">({rec.estimatedImpact})</span>
              </p>
            </div>

            <Link
              to={rec.route}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#42D9F5]/50 bg-[#141E2E] px-3 py-1.5 font-mono text-[11px] font-bold text-[#42D9F5] hover:bg-[#42D9F5]/15"
            >
              Open <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-[#8E9BAD]">{report.disclaimer}</p>
    </div>
  );
}

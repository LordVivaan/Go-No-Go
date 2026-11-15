import type {
  AiMissionEvaluationReport,
  MissionEvaluationRequestPayload,
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

export interface AiEvaluationError {
  code:
    | 'EVALUATION_CREDENTIALS_MISSING'
    | 'EVALUATION_INVALID_REQUEST'
    | 'EVALUATION_RATE_LIMITED'
    | 'EVALUATION_UPSTREAM_ERROR'
    | 'EVALUATION_SCHEMA_ERROR'
    | 'EVALUATION_NETWORK_ERROR';
  message: string;
  httpStatus?: number;
}

export type AiEvaluationResult =
  | { ok: true; report: AiMissionEvaluationReport; cached: boolean }
  | { ok: false; error: AiEvaluationError };

const evaluationReportCache = new Map<string, AiMissionEvaluationReport>();

export function getCachedAiEvaluation(runId: string): AiMissionEvaluationReport | null {
  return evaluationReportCache.get(runId) ?? null;
}

export function clearAiEvaluationCache(): void {
  evaluationReportCache.clear();
}

export function buildMissionEvaluationPayload(params: {
  runId: string;
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
  simulationReport: MissionScoreReport;
  finalSystemHealthPct?: number;
  batteryExhausted?: boolean;
  userLaunchAuthorization?: 'PENDING' | 'GO' | 'NO_GO';
  riskAcknowledged?: boolean;
  eventsLog?: string[];
}): MissionEvaluationRequestPayload {
  const {
    runId,
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
    simulationReport,
    finalSystemHealthPct = 100,
    batteryExhausted = false,
    userLaunchAuthorization = 'GO',
    riskAcknowledged = false,
    eventsLog = [],
  } = params;

  return {
    runId,
    configurationName: simulationReport.configurationName,
    difficulty,
    scenario: {
      id: scenario.id,
      code: scenario.code,
      title: scenario.title,
      celestialBody: scenario.celestialBody,
      budgetCapMusd: scenario.budgetCapMusd,
      simulationDurationDays: scenario.simulationDurationDays,
      primaryObjective: scenario.briefing.primaryObjective,
      targetRegionsCount: scenario.targetRegions.length,
    },
    bus: {
      id: bus.id,
      name: bus.name,
      massKg: bus.massKg,
      powerDrawW: bus.powerDrawW,
      costMusd: bus.costMusd,
      maxPayloadMassKg: bus.maxPayloadMassKg,
      compatibleFormFactors: bus.compatibleFormFactors,
    },
    instruments: instruments.map((inst) => ({
      id: inst.id,
      name: inst.name,
      type: inst.type,
      massKg: inst.massKg,
      powerOperatingW: inst.powerOperatingW,
      dataRateMbps: inst.dataRateMbps,
      resolutionM: inst.resolutionM,
      defaultDutyCycle: inst.defaultDutyCycle,
      nightCapable: inst.nightCapable,
      cloudPenetrating: inst.cloudPenetrating,
      effectiveDutyCyclePct:
        instrumentDutyOverrides[inst.id] ?? Math.round(inst.defaultDutyCycle * 100),
    })),
    subsystems: subsystems.map((sub) => ({
      id: sub.id,
      category: sub.category,
      name: sub.name,
      massKg: sub.massKg,
      powerDrawW: sub.powerDrawW,
      powerOutputW: sub.powerOutputW,
      costMusd: sub.costMusd,
    })),
    orbit,
    launchVehicle: {
      id: launcher.id,
      name: launcher.name,
      provider: launcher.provider,
      costMusd: launcher.costMusd,
      reliability: launcher.reliability,
    },
    operationsPlan: { ...operationsPlan },
    userLaunchAuthorization,
    riskAcknowledged,
    engineering,
    simulation: {
      completed: true,
      outcome: simulationReport.outcome,
      failureReason: simulationReport.failureReason,
      completionDurationSec: simulationReport.completionDurationSec,
      totalDataCapturedGb: simulationReport.totalDataCapturedGb,
      totalDataDownlinkedGb: simulationReport.totalDataDownlinkedGb,
      totalDataLostGb: simulationReport.totalDataLostGb,
      regionsMappedCount: simulationReport.floodRegionsMappedCount,
      anomaliesResolvedCount: simulationReport.anomaliesResolvedCount,
      anomaliesTotalCount: simulationReport.anomaliesTotalCount,
      finalSystemHealthPct,
      batteryExhausted,
      eventsLog,
    },
  };
}

export async function requestAiMissionEvaluation(
  payload: MissionEvaluationRequestPayload,
  options?: { forceRefresh?: boolean; fetchImpl?: typeof fetch },
): Promise<AiEvaluationResult> {
  if (!options?.forceRefresh) {
    const cached = evaluationReportCache.get(payload.runId);
    if (cached) {
      return { ok: true, report: cached, cached: true };
    }
  }

  const fetchFn = options?.fetchImpl ?? fetch;

  try {
    const response = await fetchFn('/api/evaluate-mission', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      report?: AiMissionEvaluationReport;
      code?: string;
      error?: string | { code?: string; message?: string };
    } | null;

    if (!response.ok || !data?.ok || !data.report) {
      const errorObj =
        data?.error && typeof data.error === 'object' ? data.error : undefined;
      const rawCode = data?.code ?? errorObj?.code;
      const errorMessage =
        typeof data?.error === 'string'
          ? data.error
          : typeof errorObj?.message === 'string'
            ? errorObj.message
            : `Mission evaluation service returned HTTP ${response.status}.`;
      const code: AiEvaluationError['code'] =
        rawCode === 'EVALUATION_CREDENTIALS_MISSING' ||
        rawCode === 'EVALUATION_INVALID_REQUEST' ||
        rawCode === 'EVALUATION_RATE_LIMITED' ||
        rawCode === 'EVALUATION_SCHEMA_ERROR' ||
        rawCode === 'EVALUATION_UPSTREAM_ERROR'
          ? rawCode
          : rawCode === 'INVALID_MISSION_PAYLOAD'
            ? 'EVALUATION_INVALID_REQUEST'
            : rawCode === 'EVALUATION_INVALID_RESPONSE'
              ? 'EVALUATION_SCHEMA_ERROR'
              : response.status === 429
                ? 'EVALUATION_RATE_LIMITED'
                : response.status === 503
                  ? 'EVALUATION_CREDENTIALS_MISSING'
                  : 'EVALUATION_UPSTREAM_ERROR';

      return {
        ok: false,
        error: {
          code,
          message: errorMessage,
          httpStatus: response.status,
        },
      };
    }

    evaluationReportCache.set(payload.runId, data.report);
    return {
      ok: true,
      report: data.report,
      cached: Boolean(data.report.cached),
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'EVALUATION_NETWORK_ERROR',
        message:
          err instanceof Error
            ? `Failed to reach evaluation endpoint: ${err.message}`
            : 'Failed to reach evaluation endpoint.',
      },
    };
  }
}

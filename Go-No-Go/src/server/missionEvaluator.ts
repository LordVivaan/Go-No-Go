import { getNasaReferenceList } from '../data/nasaReferences';
import type {
  AiCategoryEvaluation,
  AiMissionEvaluationReport,
  MissionEvaluationRequestPayload,
} from '../types/aiEvaluation';

export interface EvaluateMissionRuntimeEnv {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}

export const EVALUATION_RUBRIC_VERSION = '2026.11-v1';
export const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
const MAX_REQUEST_BYTES = 96 * 1024;

const CATEGORY_WEIGHTS = {
  science: 35,
  reliability: 25,
  resource_efficiency: 15,
  data_comms: 15,
  risk_management: 10,
} as const;

const evaluationCache = new Map<string, AiMissionEvaluationReport>();

export function clearEvaluationCacheForTest(): void {
  evaluationCache.clear();
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function computeMissionSnapshotHash(
  payload: MissionEvaluationRequestPayload
): Promise<string> {
  const canonical = JSON.stringify({
    rubric: EVALUATION_RUBRIC_VERSION,
    runId: payload.runId,
    scenarioId: payload.scenario.id,
    difficulty: payload.difficulty,
    busId: payload.bus.id,
    instruments: payload.instruments.map((i) => ({
      id: i.id,
      duty: i.effectiveDutyCyclePct,
    })),
    subsystems: payload.subsystems.map((s) => s.id).sort(),
    orbit: {
      id: payload.orbit.id,
      p: payload.orbit.altitudePerigeeKm,
      a: payload.orbit.altitudeApogeeKm,
      i: payload.orbit.inclinationDeg,
    },
    launchVehicleId: payload.launchVehicle.id,
    operationsPlan: payload.operationsPlan,
    userLaunchAuthorization: payload.userLaunchAuthorization,
    riskAcknowledged: payload.riskAcknowledged,
    simulation: {
      outcome: payload.simulation.outcome,
      completionDurationSec: payload.simulation.completionDurationSec,
      totalDataCapturedGb: payload.simulation.totalDataCapturedGb,
      totalDataDownlinkedGb: payload.simulation.totalDataDownlinkedGb,
      totalDataLostGb: payload.simulation.totalDataLostGb,
      regionsMappedCount: payload.simulation.regionsMappedCount,
      anomaliesResolvedCount: payload.simulation.anomaliesResolvedCount,
      anomaliesTotalCount: payload.simulation.anomaliesTotalCount,
      finalSystemHealthPct: payload.simulation.finalSystemHealthPct,
      batteryExhausted: payload.simulation.batteryExhausted,
    },
  });

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(canonical);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a_${(hash >>> 0).toString(16)}`;
}

export function validateEvaluationPayload(
  raw: unknown
): { ok: true; payload: MissionEvaluationRequestPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const p = raw as Partial<MissionEvaluationRequestPayload>;
  if (typeof p.runId !== 'string' || p.runId.trim().length < 4) {
    return { ok: false, error: 'Missing or invalid runId.' };
  }
  if (!p.scenario || typeof p.scenario.id !== 'string' || typeof p.scenario.code !== 'string') {
    return { ok: false, error: 'Missing scenario metadata.' };
  }
  if (!p.bus || typeof p.bus.id !== 'string') {
    return { ok: false, error: 'Missing spacecraft bus metadata.' };
  }
  if (!Array.isArray(p.instruments) || !Array.isArray(p.subsystems)) {
    return { ok: false, error: 'Missing instruments or subsystems array.' };
  }
  if (!p.orbit || typeof p.orbit.celestialBody !== 'string') {
    return { ok: false, error: 'Missing orbit parameters.' };
  }
  if (!p.engineering || !p.engineering.validation) {
    return { ok: false, error: 'Missing engineering verification summary.' };
  }
  if (!p.simulation || p.simulation.completed !== true) {
    return { ok: false, error: 'Mission simulation must be completed before AI evaluation.' };
  }
  if (
    p.simulation.outcome !== 'SUCCESS' &&
    p.simulation.outcome !== 'PARTIAL_SUCCESS' &&
    p.simulation.outcome !== 'MISSION_LOSS'
  ) {
    return { ok: false, error: 'Invalid simulation outcome.' };
  }
  return { ok: true, payload: p as MissionEvaluationRequestPayload };
}

const DEDUCTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'criterion',
    'category',
    'status',
    'maxPoints',
    'pointsAwarded',
    'pointsDeducted',
    'severity',
    'observedValue',
    'expectedValueOrLimit',
    'unit',
    'evidence',
    'technicalExplanation',
    'consequence',
    'recommendedCorrection',
    'tradeOffs',
    'basis',
    'nasaReferenceCode',
    'nasaReferenceVersion',
    'nasaReferenceUrl',
  ],
  properties: {
    criterion: { type: 'string' },
    category: {
      type: 'string',
      enum: ['science', 'reliability', 'resource_efficiency', 'data_comms', 'risk_management'],
    },
    status: { type: 'string', enum: ['ASSESSED', 'NOT_ASSESSED'] },
    maxPoints: { type: 'number' },
    pointsAwarded: { type: 'number' },
    pointsDeducted: { type: 'number' },
    severity: { type: 'string', enum: ['CRITICAL', 'MAJOR', 'MINOR', 'INFO'] },
    observedValue: { type: 'string' },
    expectedValueOrLimit: { type: 'string' },
    unit: { type: 'string' },
    evidence: { type: 'string' },
    technicalExplanation: { type: 'string' },
    consequence: { type: 'string' },
    recommendedCorrection: { type: 'string' },
    tradeOffs: { type: 'string' },
    basis: {
      type: 'string',
      enum: [
        'NASA_STANDARD_REQUIREMENT',
        'NASA_HANDBOOK_GUIDANCE',
        'PHYSICAL_LAW',
        'ENGINEERING_APPROXIMATION',
        'GAMEPLAY_RULE',
      ],
    },
    nasaReferenceCode: { type: ['string', 'null'] },
    nasaReferenceVersion: { type: ['string', 'null'] },
    nasaReferenceUrl: { type: ['string', 'null'] },
  },
};

const CATEGORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'strengths', 'deductions'],
  properties: {
    score: { type: 'number' },
    strengths: { type: 'array', items: { type: 'string' } },
    deductions: { type: 'array', items: DEDUCTION_SCHEMA },
  },
};

export const MISSION_EVALUATION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'outcome',
    'executive_summary',
    'categories',
    'critical_failures',
    'minor_findings',
    'engineering_recommendations',
    'nasa_references',
    'mission_successes',
    'mission_limitations',
  ],
  properties: {
    outcome: { type: 'string', enum: ['SUCCESS', 'PARTIAL_SUCCESS', 'MISSION_LOSS'] },
    executive_summary: { type: 'string' },
    categories: {
      type: 'object',
      additionalProperties: false,
      required: ['science', 'reliability', 'resource_efficiency', 'data_comms', 'risk_management'],
      properties: {
        science: CATEGORY_SCHEMA,
        reliability: CATEGORY_SCHEMA,
        resource_efficiency: CATEGORY_SCHEMA,
        data_comms: CATEGORY_SCHEMA,
        risk_management: CATEGORY_SCHEMA,
      },
    },
    critical_failures: { type: 'array', items: { type: 'string' } },
    minor_findings: { type: 'array', items: { type: 'string' } },
    engineering_recommendations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'whatFailed',
          'whyItFailed',
          'rootCause',
          'recommendedChange',
          'targetComponentOrParameter',
          'suggestedParameterRange',
          'tradeOff',
          'verificationToRepeat',
        ],
        properties: {
          title: { type: 'string' },
          whatFailed: { type: 'string' },
          whyItFailed: { type: 'string' },
          rootCause: { type: 'string' },
          recommendedChange: { type: 'string' },
          targetComponentOrParameter: { type: 'string' },
          suggestedParameterRange: { type: 'string' },
          tradeOff: { type: 'string' },
          verificationToRepeat: { type: 'string' },
        },
      },
    },
    nasa_references: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'title', 'version', 'url', 'basis', 'relevance'],
        properties: {
          code: { type: 'string' },
          title: { type: 'string' },
          version: { type: 'string' },
          url: { type: 'string' },
          basis: {
            type: 'string',
            enum: [
              'NASA_STANDARD_REQUIREMENT',
              'NASA_HANDBOOK_GUIDANCE',
              'PHYSICAL_LAW',
              'ENGINEERING_APPROXIMATION',
              'GAMEPLAY_RULE',
            ],
          },
          relevance: { type: 'string' },
        },
      },
    },
    mission_successes: { type: 'array', items: { type: 'string' } },
    mission_limitations: { type: 'array', items: { type: 'string' } },
  },
};

const SYSTEM_INSTRUCTION = `You are the GO / NO-GO Aerospace Mission Evaluation Board (Rubric ${EVALUATION_RUBRIC_VERSION}).
Evaluate the completed spacecraft mission strictly from the provided engineering snapshot and simulated telemetry.

FAIRNESS & ARCHITECTURE RULES:
- Apply the exact same engineering principles to every spacecraft architecture.
- NEVER reward or penalize a spacecraft bus, payload brand, or component ID merely by name.
- Evaluate whether the selected architecture satisfies the stated mission objective, engineering feasibility, resource allocation balance, communications closure, and simulated mission outcome.
- Score each of the 5 categories on a 0 to 100 scale:
  1. science (35% weight): objective fulfillment, payload-to-objective fit, orbit/geometry access, data quality, meaningful progress.
  2. reliability (25% weight): actual mission completion, subsystem compatibility, power/thermal/propulsion margins, anomalies/safe-mode events, verification adequacy.
  3. resource_efficiency (15% weight): balanced mass, propellant, delta-v margin, power generation vs demand, DoD, thermal, storage efficiency (penalize undersized OR grossly oversized waste).
  4. data_comms (15% weight): data collected vs downlinked, link margin, antenna compatibility, comms windows, storage limits, data loss.
  5. risk_management (10% weight): hazard identification, mitigation decisions, verification coverage, response to engineering warnings, risk acknowledgement.

EVIDENCE & NASA REFERENCE RULES:
- Every deduction MUST cite real observed values and expected limits from the provided snapshot.
- NEVER invent technical failures or missing telemetry; mark unavailable criteria as NOT_ASSESSED.
- ONLY cite NASA references from the provided NASA_REFERENCE_CATALOGUE. Never invent section numbers, clause numbers, or unverified test thresholds.
- Clearly distinguish NASA_STANDARD_REQUIREMENT, NASA_HANDBOOK_GUIDANCE, PHYSICAL_LAW, ENGINEERING_APPROXIMATION, and GAMEPLAY_RULE.`;

function validateAndComputeWeightedReport(params: {
  rawAi: unknown;
  model: string;
  evaluationId: string;
  snapshotHash: string;
  simulationOutcome: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'MISSION_LOSS';
}): { ok: true; report: AiMissionEvaluationReport } | { ok: false; error: string } {
  const { rawAi, model, evaluationId, snapshotHash, simulationOutcome } = params;
  if (!rawAi || typeof rawAi !== 'object') {
    return { ok: false, error: 'AI response is not a JSON object.' };
  }

  const r = rawAi as Record<string, unknown>;
  const cats = r.categories as Record<string, Record<string, unknown>> | undefined;
  if (!cats || typeof cats !== 'object') {
    return { ok: false, error: 'AI response missing categories object.' };
  }

  const keys = ['science', 'reliability', 'resource_efficiency', 'data_comms', 'risk_management'] as const;
  const builtCategories = {} as AiMissionEvaluationReport['categories'];

  let weightedSum = 0;
  for (const key of keys) {
    const c = cats[key];
    if (!c || typeof c.score !== 'number' || !Number.isFinite(c.score) || c.score < 0 || c.score > 100) {
      return { ok: false, error: `Invalid or out-of-range score for category "${key}".` };
    }
    const weight = CATEGORY_WEIGHTS[key];
    const cleanScore = Number(c.score.toFixed(1));
    const weightedPoints = Number(((cleanScore * weight) / 100).toFixed(2));
    weightedSum += (cleanScore * weight) / 100;

    builtCategories[key] = {
      weight,
      score: cleanScore,
      weightedPoints,
      strengths: Array.isArray(c.strengths) ? c.strengths.filter((s): s is string => typeof s === 'string') : [],
      deductions: Array.isArray(c.deductions)
        ? (c.deductions as AiCategoryEvaluation['deductions'])
        : [],
    };
  }

  const overallScore = Number(Math.max(0, Math.min(100, weightedSum)).toFixed(1));

  return {
    ok: true,
    report: {
      evaluationId,
      evaluationVersion: EVALUATION_RUBRIC_VERSION,
      model,
      snapshotHash,
      overallScore,
      outcome: simulationOutcome,
      executiveSummary:
        typeof r.executive_summary === 'string' && r.executive_summary.trim()
          ? r.executive_summary.trim()
          : 'Mission evaluation completed.',
      categories: builtCategories,
      criticalFailures: Array.isArray(r.critical_failures)
        ? r.critical_failures.filter((s): s is string => typeof s === 'string')
        : [],
      minorFindings: Array.isArray(r.minor_findings)
        ? r.minor_findings.filter((s): s is string => typeof s === 'string')
        : [],
      engineeringRecommendations: Array.isArray(r.engineering_recommendations)
        ? (r.engineering_recommendations as AiMissionEvaluationReport['engineeringRecommendations'])
        : [],
      nasaReferences: Array.isArray(r.nasa_references)
        ? (r.nasa_references as AiMissionEvaluationReport['nasaReferences'])
        : [],
      missionSuccesses: Array.isArray(r.mission_successes)
        ? r.mission_successes.filter((s): s is string => typeof s === 'string')
        : [],
      missionLimitations: Array.isArray(r.mission_limitations)
        ? r.mission_limitations.filter((s): s is string => typeof s === 'string')
        : [],
      evaluatedAtIso: new Date().toISOString(),
      cached: false,
    },
  };
}

function extractOpenAiOutputText(data: Record<string, unknown>): string | null {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item && typeof item === 'object' && Array.isArray((item as { content?: unknown[] }).content)) {
        for (const block of (item as { content: unknown[] }).content) {
          if (
            block &&
            typeof block === 'object' &&
            typeof (block as { text?: unknown }).text === 'string'
          ) {
            return (block as { text: string }).text;
          }
        }
      }
    }
  }
  return null;
}

export async function handleEvaluateMissionRequest(
  request: Request,
  env: EvaluateMissionRuntimeEnv,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse(
      { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Use POST /api/evaluate-mission.' },
      405
    );
  }

  let rawBodyText = '';
  try {
    rawBodyText = await request.text();
  } catch {
    return jsonResponse({ ok: false, code: 'INVALID_BODY', error: 'Unable to read request body.' }, 400);
  }

  if (rawBodyText.length > MAX_REQUEST_BYTES) {
    return jsonResponse(
      { ok: false, code: 'PAYLOAD_TOO_LARGE', error: 'Evaluation request exceeds maximum payload size.' },
      413
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBodyText);
  } catch {
    return jsonResponse({ ok: false, code: 'INVALID_JSON', error: 'Malformed JSON body.' }, 400);
  }

  const check = validateEvaluationPayload(parsedBody);
  if (!check.ok) {
    return jsonResponse({ ok: false, code: 'INVALID_MISSION_PAYLOAD', error: check.error }, 400);
  }

  const payload = check.payload;
  const snapshotHash = await computeMissionSnapshotHash(payload);
  const cacheKey = `${payload.runId}:${snapshotHash}`;
  const cachedReport = evaluationCache.get(cacheKey);
  if (cachedReport) {
    return jsonResponse({ ok: true, report: { ...cachedReport, cached: true } }, 200);
  }

  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return jsonResponse(
      {
        ok: false,
        code: 'EVALUATION_CREDENTIALS_MISSING',
        error: 'OpenAI mission evaluator is not configured on the server (OPENAI_API_KEY missing).',
      },
      503
    );
  }

  const model = env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  const userPrompt = JSON.stringify({
    missionSnapshot: payload,
    nasaReferenceCatalogue: getNasaReferenceList(),
  });

  let openAiRes: Response;
  try {
    openAiRes = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        instructions: SYSTEM_INSTRUCTION,
        input: userPrompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'mission_evaluation_report',
            strict: true,
            schema: MISSION_EVALUATION_JSON_SCHEMA,
          },
        },
      }),
    });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        code: 'EVALUATION_UPSTREAM_UNREACHABLE',
        error:
          err instanceof Error
            ? `Unable to reach OpenAI evaluation service (${err.message}).`
            : 'Unable to reach OpenAI evaluation service.',
      },
      502
    );
  }

  if (openAiRes.status === 429) {
    return jsonResponse(
      {
        ok: false,
        code: 'EVALUATION_RATE_LIMITED',
        error: 'OpenAI evaluation service rate limit reached. Please retry in a moment.',
      },
      429
    );
  }

  if (!openAiRes.ok) {
    return jsonResponse(
      {
        ok: false,
        code: 'EVALUATION_UPSTREAM_ERROR',
        error: `OpenAI evaluation service returned HTTP ${openAiRes.status}.`,
      },
      502
    );
  }

  let responseData: Record<string, unknown>;
  try {
    responseData = (await openAiRes.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse(
      {
        ok: false,
        code: 'EVALUATION_INVALID_RESPONSE',
        error: 'OpenAI returned non-JSON response.',
      },
      502
    );
  }

  const outputText = extractOpenAiOutputText(responseData);
  if (!outputText) {
    return jsonResponse(
      {
        ok: false,
        code: 'EVALUATION_INVALID_RESPONSE',
        error: 'OpenAI response did not include structured output text.',
      },
      502
    );
  }

  let parsedAiJson: unknown;
  try {
    parsedAiJson = JSON.parse(outputText);
  } catch {
    return jsonResponse(
      {
        ok: false,
        code: 'EVALUATION_INVALID_RESPONSE',
        error: 'OpenAI structured output could not be parsed as JSON.',
      },
      502
    );
  }

  const evaluationId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `eval_${crypto.randomUUID()}`
      : `eval_${snapshotHash.slice(0, 16)}`;

  const validated = validateAndComputeWeightedReport({
    rawAi: parsedAiJson,
    model,
    evaluationId,
    snapshotHash,
    simulationOutcome: payload.simulation.outcome,
  });

  if (!validated.ok) {
    return jsonResponse(
      {
        ok: false,
        code: 'EVALUATION_INVALID_RESPONSE',
        error: validated.error,
      },
      502
    );
  }

  evaluationCache.set(cacheKey, validated.report);
  return jsonResponse({ ok: true, report: validated.report }, 200);
}

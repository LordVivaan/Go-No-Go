import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearEvaluationCacheForTest,
  handleEvaluateMissionRequest,
} from '../../src/server/missionEvaluator';
import { buildMissionEvaluationPayload } from '../../src/services/aiEvaluationService';
import { resolveMissionEntities } from '../../src/store/missionStore';
import { evaluateMissionScore } from '../../src/engine/scoring';

function makeValidPayload(runId = 'run-test-001') {
  const resolved = resolveMissionEntities({
    scenarioId: 'lunar-ice',
    difficulty: 'STANDARD',
    busId: 'bus-espa-smallsat',
    instrumentIds: ['inst-thermal-ir'],
    instrumentDutyOverrides: {},
    subsystemIds: {
      SOLAR_ARRAY: 'solar-gaas-medium',
      BATTERY: 'batt-liion-600wh',
      PROPULSION: 'prop-monoprop-hydrazine',
      ANTENNA: 'ant-xband-highgain',
      AVIONICS: 'av-radhard-dual',
      THERMAL: 'therm-ml-louver',
    },
    orbitId: 'orbit-lunar-polar',
    customInclinationDeg: null,
    launchVehicleId: 'lv-falcon9-rideshare',
  });

  const simReport = evaluateMissionScore({
    scenario: resolved.scenario,
    difficulty: 'STANDARD',
    configurationName: 'Lunar Test Config',
    engineering: resolved.engineering,
    instruments: resolved.instruments,
  });

  return buildMissionEvaluationPayload({
    runId,
    scenario: resolved.scenario,
    difficulty: 'STANDARD',
    bus: resolved.bus,
    instruments: resolved.instruments,
    instrumentDutyOverrides: {},
    subsystems: resolved.subsystems,
    orbit: resolved.orbit,
    launcher: resolved.launchVehicle,
    operationsPlan: {
      missionDurationDays: 14,
      observationSchedule: 'TARGET_WINDOWS',
      payloadDutyCyclePct: 75,
      downlinkCadencePerDay: 4,
      powerReservePct: 25,
      attitudePriority: 'SCIENCE_NADIR',
    },
    engineering: resolved.engineering,
    simulationReport: simReport,
    finalSystemHealthPct: 98,
    batteryExhausted: false,
  });
}

function makeOpenAiStructuredResponse(override?: Partial<Record<string, unknown>>) {
  const structured = {
    outcome: 'SUCCESS',
    executiveSummary: 'Strong lunar polar mission closure with healthy mass and RF margins.',
    categories: {
      science: {
        score: 90,
        strengths: ['Night-capable LWIR payload resolves permanently shadowed lunar craters.'],
        deductions: [
          {
            criterion: 'Single-instrument spectral breadth',
            category: 'science',
            status: 'ASSESSED',
            maxPoints: 35,
            pointsAwarded: 31.5,
            pointsDeducted: 3.5,
            severity: 'MINOR',
            observedValue: '1',
            expectedValueOrLimit: '2',
            unit: 'payloads',
            evidence: 'Only LWIR radiometer manifested.',
            technicalExplanation: 'Adding a complementary spectrometer would improve volatile confirmation.',
            consequence: 'Reduced mineralogical cross-checking.',
            recommendedCorrection: 'Pair with a neutron or hyperspectral sensor.',
            tradeOffs: 'Increases mass by ~8-12 kg.',
            basis: 'NASA_HANDBOOK_GUIDANCE',
            nasaReferenceCode: 'NASA-SEH',
            nasaReferenceVersion: 'SP-2016-6105 Rev2',
            nasaReferenceUrl: 'https://www.nasa.gov/reference/systems-engineering-handbook/',
          },
        ],
      },
      reliability: {
        score: 92,
        strengths: ['High combined mission reliability and nominal end-of-mission health.'],
        deductions: [],
      },
      resource_efficiency: {
        score: 90,
        strengths: ['Balanced mass and power allocation within budget cap.'],
        deductions: [],
      },
      data_comms: {
        score: 93,
        strengths: ['Positive RF link margin and zero SSR overflow.'],
        deductions: [],
      },
      risk_management: {
        score: 90,
        strengths: ['ODAR compliant and thermal margins nominal.'],
        deductions: [],
      },
    },
    criticalFailures: [],
    minorFindings: ['Consider adding a complementary spectrometer.'],
    engineeringRecommendations: [
      {
        title: 'Add Volatile Spectrometer',
        whatFailed: 'Single-instrument payload',
        whyItFailed: 'Only thermal IR band sampled',
        rootCause: 'Single payload selection',
        recommendedChange: 'Add compact spectrometer in Stage 02.',
        targetComponentOrParameter: 'Payload Manifest',
        suggestedParameterRange: '2 complementary payloads',
        tradeOff: '+10 kg mass, +18 W power',
        verificationToRepeat: 'Re-check mass and power margin in Stage 06.',
      },
    ],
    nasa_references: [
      {
        code: 'NASA/SP-2016-6105 Rev2',
        title: 'NASA Systems Engineering Handbook',
        version: 'Rev 2',
        url: 'https://www.nasa.gov/reference/systems-engineering-handbook/',
        basis: 'NASA_HANDBOOK_GUIDANCE',
        relevance: 'Margin management and verification.',
      },
    ],
    missionSuccesses: ['PSR crater thermal mapping achieved'],
    missionLimitations: ['Single-band science return'],
    ...override,
  };

  return new Response(
    JSON.stringify({
      id: 'resp_test_123',
      output_text: JSON.stringify(structured),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

describe('handleEvaluateMissionRequest', () => {
  afterEach(() => {
    clearEvaluationCacheForTest();
    vi.restoreAllMocks();
  });

  it('returns 503 EVALUATION_CREDENTIALS_MISSING when OPENAI_API_KEY is absent', async () => {
    const req = new Request('http://127.0.0.1/api/evaluate-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeValidPayload()),
    });

    const res = await handleEvaluateMissionRequest(req, {});
    expect(res.status).toBe(503);
    const json = (await res.json()) as { ok: boolean; code: string };
    expect(json.ok).toBe(false);
    expect(json.code).toBe('EVALUATION_CREDENTIALS_MISSING');
  });

  it('recomputes overallScore server-side, attaches NASA URLs, caches idempotently, and never leaks key', async () => {
    const secretKey = 'sk-test-super-secret-value-do-not-leak';
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(makeOpenAiStructuredResponse());

    const payload = makeValidPayload('run-cache-test');
    const makeReq = () =>
      new Request('http://127.0.0.1/api/evaluate-mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

    const res1 = await handleEvaluateMissionRequest(
      makeReq(),
      { OPENAI_API_KEY: secretKey, OPENAI_MODEL: 'gpt-4.1-mini' },
      fetchMock,
    );
    expect(res1.status).toBe(200);
    const bodyText1 = await res1.text();
    expect(bodyText1).not.toContain(secretKey);

    const parsed1 = JSON.parse(bodyText1) as {
      ok: boolean;
      report: {
        overallScore: number;
        model: string;
        cached?: boolean;
        nasaReferences: Array<{ code: string; url: string }>;
      };
    };
    expect(parsed1.ok).toBe(true);
    expect(parsed1.report.cached).toBe(false);
    // 90*0.35 + 92*0.25 + 90*0.15 + 93*0.15 + 90*0.10 = 31.5 + 23.0 + 13.5 + 13.95 + 9.0 = 90.95 -> 91.0
    expect(parsed1.report.overallScore).toBe(91.0);
    expect(parsed1.report.model).toBe('gpt-4.1-mini');
    expect(parsed1.report.nasaReferences.some((r) => r.url.startsWith('https://'))).toBe(true);

    // Second identical call hits idempotency cache without calling OpenAI again
    const res2 = await handleEvaluateMissionRequest(
      makeReq(),
      { OPENAI_API_KEY: secretKey },
      fetchMock,
    );
    const parsed2 = (await res2.json()) as { report: { cached?: boolean } };
    expect(parsed2.report.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 429 EVALUATION_RATE_LIMITED on upstream 429', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('rate limited', { status: 429 }));

    const req = new Request('http://127.0.0.1/api/evaluate-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeValidPayload('run-429')),
    });

    const res = await handleEvaluateMissionRequest(
      req,
      { OPENAI_API_KEY: 'sk-test-key' },
      fetchMock,
    );
    expect(res.status).toBe(429);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe('EVALUATION_RATE_LIMITED');
  });

  it('returns 502 EVALUATION_INVALID_RESPONSE when OpenAI returns out-of-range category scores', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      makeOpenAiStructuredResponse({
        categories: {
          science: { score: 150, strengths: [], deductions: [] },
          reliability: { score: 90, strengths: [], deductions: [] },
          resource_efficiency: { score: 90, strengths: [], deductions: [] },
          data_comms: { score: 90, strengths: [], deductions: [] },
          risk_management: { score: 90, strengths: [], deductions: [] },
        },
      }),
    );

    const req = new Request('http://127.0.0.1/api/evaluate-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeValidPayload('run-bad-schema')),
    });

    const res = await handleEvaluateMissionRequest(
      req,
      { OPENAI_API_KEY: 'sk-test-key' },
      fetchMock,
    );
    expect(res.status).toBe(502);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe('EVALUATION_INVALID_RESPONSE');
  });

  it('returns 400 EVALUATION_INVALID_REQUEST for malformed payload', async () => {
    const req = new Request('http://127.0.0.1/api/evaluate-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: '' }),
    });

    const res = await handleEvaluateMissionRequest(req, { OPENAI_API_KEY: 'sk-test-key' });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe('INVALID_MISSION_PAYLOAD');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearEvaluationCacheForTest,
  DEFAULT_GEMINI_MODEL,
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

function makeGeminiStructuredResponse(override?: Partial<Record<string, unknown>>) {
  const structured = {
    overallScore: 90.0,
    categoryScores: {
      science: 31.5,
      reliability: 23.0,
      resourceEfficiency: 13.5,
      communications: 13.0,
      riskManagement: 9.0,
    },
    assessment: 'GO',
    summary: 'Strong lunar polar mission closure with healthy mass, power, and RF margins.',
    strengths: [
      'Night-capable LWIR payload resolves permanently shadowed lunar craters.',
      'Positive RF link margin and zero SSR overflow.',
    ],
    deductions: [
      {
        category: 'science',
        points: 3.5,
        finding: 'Single-instrument spectral breadth',
        engineeringImpact: 'Only thermal IR band sampled; reduced mineralogical cross-checking.',
        recommendedCorrection: 'Pair with a compact neutron or hyperspectral spectrometer.',
        severity: 'LOW',
      },
    ],
    criticalFailures: [],
    engineeringRationale: [
      'NASA/SP-2016-6105 Rev2: Mass, power, and RF link margins meet nominal Phase C/D thresholds.',
    ],
    limitations: ['Single-band thermal IR observation limits mineralogical diversity.'],
    ...override,
  };

  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(structured) }],
          },
        },
      ],
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

describe('handleEvaluateMissionRequest (Gemini)', () => {
  afterEach(() => {
    clearEvaluationCacheForTest();
    vi.restoreAllMocks();
  });

  it('returns 503 EVALUATION_CREDENTIALS_MISSING when GEMINI_API_KEY is absent', async () => {
    const req = new Request('http://127.0.0.1/api/evaluate-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeValidPayload()),
    });

    const res = await handleEvaluateMissionRequest(req, {});
    expect(res.status).toBe(503);
    const json = (await res.json()) as { ok: boolean; errorCode: string };
    expect(json.ok).toBe(false);
    expect(json.errorCode).toBe('EVALUATION_CREDENTIALS_MISSING');
  });

  it('calls Gemini API with default model, validates structured output, caches idempotently, and never leaks key', async () => {
    const secretKey = 'AIzaSyTestSuperSecretKeyDoNotLeak';
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(makeGeminiStructuredResponse());

    const payload = makeValidPayload('run-cache-test');
    const makeReq = () =>
      new Request('http://127.0.0.1/api/evaluate-mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

    const res1 = await handleEvaluateMissionRequest(
      makeReq(),
      { GEMINI_API_KEY: secretKey },
      fetchMock,
    );
    expect(res1.status).toBe(200);
    const bodyText1 = await res1.text();
    expect(bodyText1).not.toContain(secretKey);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`,
    );
    const headers = (calledInit?.headers ?? {}) as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe(secretKey);

    const parsed1 = JSON.parse(bodyText1) as {
      ok: boolean;
      report: {
        overallScore: number;
        model: string;
        assessment: string;
        categoryScores: Record<string, number>;
        cached?: boolean;
      };
    };
    expect(parsed1.ok).toBe(true);
    expect(parsed1.report.overallScore).toBe(90.0);
    expect(parsed1.report.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(parsed1.report.assessment).toBe('GO');

    const res2 = await handleEvaluateMissionRequest(
      makeReq(),
      { GEMINI_API_KEY: secretKey },
      fetchMock,
    );
    const parsed2 = (await res2.json()) as { cached?: boolean; report: { cached?: boolean } };
    expect(parsed2.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('respects custom GEMINI_MODEL override', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(makeGeminiStructuredResponse());
    const req = new Request('http://127.0.0.1/api/evaluate-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeValidPayload('run-custom-model')),
    });

    const res = await handleEvaluateMissionRequest(
      req,
      { GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'gemini-3.8-pro' },
      fetchMock,
    );
    expect(res.status).toBe(200);
    const [calledUrl] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain('/models/gemini-3.8-pro:generateContent');
  });

  it('returns 502 EVALUATION_INVALID_CREDENTIALS on 401/403 without retrying', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('API key invalid', { status: 403 }));

    const req = new Request('http://127.0.0.1/api/evaluate-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeValidPayload('run-403')),
    });

    const res = await handleEvaluateMissionRequest(
      req,
      { GEMINI_API_KEY: 'bad-key' },
      fetchMock,
    );
    expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const json = (await res.json()) as { errorCode: string };
    expect(json.errorCode).toBe('EVALUATION_INVALID_CREDENTIALS');
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
      { GEMINI_API_KEY: 'test-key' },
      fetchMock,
    );
    expect(res.status).toBe(429);
    const json = (await res.json()) as { errorCode: string };
    expect(json.errorCode).toBe('EVALUATION_RATE_LIMITED');
  });

  it('returns 504 EVALUATION_TIMEOUT when Gemini request aborts', async () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(abortErr);

    const req = new Request('http://127.0.0.1/api/evaluate-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeValidPayload('run-timeout')),
    });

    const res = await handleEvaluateMissionRequest(
      req,
      { GEMINI_API_KEY: 'test-key' },
      fetchMock,
    );
    expect(res.status).toBe(504);
    const json = (await res.json()) as { errorCode: string };
    expect(json.errorCode).toBe('EVALUATION_TIMEOUT');
  });

  it('returns 502 EVALUATION_SERVICE_UNAVAILABLE on repeated 503', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(new Response('unavailable', { status: 503 })));

    const req = new Request('http://127.0.0.1/api/evaluate-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeValidPayload('run-503')),
    });

    const res = await handleEvaluateMissionRequest(
      req,
      { GEMINI_API_KEY: 'test-key' },
      fetchMock,
    );
    expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const json = (await res.json()) as { errorCode: string };
    expect(json.errorCode).toBe('EVALUATION_SERVICE_UNAVAILABLE');
  });

  it('returns 502 EVALUATION_INVALID_RESPONSE when Gemini returns malformed JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{not-json' }] } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const req = new Request('http://127.0.0.1/api/evaluate-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeValidPayload('run-bad-json')),
    });

    const res = await handleEvaluateMissionRequest(
      req,
      { GEMINI_API_KEY: 'test-key' },
      fetchMock,
    );
    expect(res.status).toBe(502);
    const json = (await res.json()) as { errorCode: string };
    expect(json.errorCode).toBe('EVALUATION_INVALID_RESPONSE');
  });

  it('returns 502 EVALUATION_INVALID_RESPONSE when category score exceeds max or totals mismatch', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      makeGeminiStructuredResponse({
        overallScore: 95.0,
        categoryScores: {
          science: 40.0, // exceeds 35 max
          reliability: 20.0,
          resourceEfficiency: 15.0,
          communications: 10.0,
          riskManagement: 10.0,
        },
      }),
    );

    const req = new Request('http://127.0.0.1/api/evaluate-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeValidPayload('run-bad-bounds')),
    });

    const res = await handleEvaluateMissionRequest(
      req,
      { GEMINI_API_KEY: 'test-key' },
      fetchMock,
    );
    expect(res.status).toBe(502);
    const json = (await res.json()) as { errorCode: string };
    expect(json.errorCode).toBe('EVALUATION_INVALID_RESPONSE');
  });

  it('returns 502 EVALUATION_INVALID_RESPONSE when overallScore does not match categoryScores sum', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      makeGeminiStructuredResponse({
        overallScore: 50.0,
        categoryScores: {
          science: 31.5,
          reliability: 23.0,
          resourceEfficiency: 13.5,
          communications: 13.0,
          riskManagement: 9.0,
        },
      }),
    );

    const req = new Request('http://127.0.0.1/api/evaluate-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeValidPayload('run-sum-mismatch')),
    });

    const res = await handleEvaluateMissionRequest(
      req,
      { GEMINI_API_KEY: 'test-key' },
      fetchMock,
    );
    expect(res.status).toBe(502);
    const json = (await res.json()) as { errorCode: string };
    expect(json.errorCode).toBe('EVALUATION_INVALID_RESPONSE');
  });

  it('returns 400 EVALUATION_INVALID_REQUEST for missing telemetry payload', async () => {
    const req = new Request('http://127.0.0.1/api/evaluate-mission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: '' }),
    });

    const res = await handleEvaluateMissionRequest(req, { GEMINI_API_KEY: 'test-key' });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { errorCode: string };
    expect(json.errorCode).toBe('EVALUATION_INVALID_REQUEST');
  });
});

import { describe, expect, it } from 'vitest';
import { MISSION_SCENARIOS } from '../../src/data/scenarios';
import { evaluateMissionScore } from '../../src/engine/scoring';
import { evaluateMissionEngineering } from '../../src/engine/validation';
import {
  MISSION_PRESETS,
  resolveMissionEntities,
  useMissionStore,
} from '../../src/store/missionStore';

describe('GO / NO-GO Phase 3 — CML 1–6 Validation Gate, Findings, Scoring & Store', () => {
  it('validates the default FLOODWATCH SAR+SWIR preset as Flight-Ready GO (CML 6) with 35/25/15/15/10 normalized score', () => {
    const state = useMissionStore.getState();
    const resolved = resolveMissionEntities(state);

    expect(resolved.scenario.code).toBe('FLOODWATCH');
    expect(resolved.engineering.validation.overallStatus).toBe('GO');
    expect(resolved.engineering.validation.achievedCmlLevel).toBe(6);
    expect(resolved.engineering.validation.checklist).toHaveLength(7);
    expect(
      resolved.engineering.validation.checklist.every((c) => c.status === 'GO')
    ).toBe(true);

    // Structured findings verification
    const findings = resolved.engineering.validation.findings;
    expect(findings.length).toBeGreaterThanOrEqual(9);
    for (const f of findings) {
      expect(['PASS', 'WARNING', 'FAIL', 'INFORMATION']).toContain(f.severity);
      expect(f.id).toBeTruthy();
      expect(f.units).toBeTruthy();
      expect(f.suggestedCorrectiveAction).toBeTruthy();
      expect(f.resourceRoute.startsWith('/')).toBe(true);
    }

    // 35 + 25 + 15 + 15 + 10 = 100 scale
    expect(resolved.scorePreview.totalScore).toBeGreaterThanOrEqual(78);
    expect(resolved.scorePreview.totalScore).toBeLessThanOrEqual(100);
    expect(['S', 'A']).toContain(resolved.scorePreview.grade);
  });

  it('flags the 6U CubeSat optical-only preset as NO-GO with failure cap and clear findings', () => {
    const cubesatPreset = MISSION_PRESETS.find(
      (p) => p.id === 'preset-floodwatch-cubesat-optical'
    )!;
    const resolved = resolveMissionEntities({
      ...cubesatPreset,
      customAltitudeKm: null,
      customInclinationDeg: null,
    });

    expect(resolved.engineering.validation.overallStatus).toBe('NO_GO');
    expect(resolved.engineering.validation.canLaunch).toBe(false);

    const scienceItem = resolved.engineering.validation.checklist.find(
      (c) => c.id === 'chk-cml1-science'
    )!;
    expect(scienceItem.status).toBe('CAUTION');

    const commItem = resolved.engineering.validation.checklist.find(
      (c) => c.id === 'chk-cml4-comms'
    )!;
    expect(commItem.status).toBe('NO_GO');

    expect(resolved.scorePreview.outcome).toBe('MISSION_LOSS');
    expect(resolved.scorePreview.totalScore).toBeLessThanOrEqual(40);
    expect(resolved.scorePreview.grade).toBe('F');
  });

  it('enforces MissionDifficulty rules, supports elliptical orbits, and resets cleanly for new attempts', () => {
    const store = useMissionStore.getState();
    store.applyPreset('preset-floodwatch-nominal-go');

    store.setDifficulty('STANDARD');
    const stdResolved = resolveMissionEntities(useMissionStore.getState());
    expect(stdResolved.scenario.budgetCapMusd).toBe(95);
    expect(stdResolved.engineering.validation.overallStatus).toBe('GO');

    store.setDifficulty('EXPERT');
    const expertResolved = resolveMissionEntities(useMissionStore.getState());
    expect(expertResolved.scenario.budgetCapMusd).toBe(80.8);
    expect(expertResolved.engineering.budget.contingencyReserveMusd).toBeLessThan(
      stdResolved.engineering.budget.contingencyReserveMusd
    );

    // Custom circular -> elliptical orbit tuning
    store.setCustomOrbitParams(500, 97.4, 500);
    const circularResolved = resolveMissionEntities(useMissionStore.getState());
    expect(circularResolved.engineering.orbital.eccentricity).toBeCloseTo(0, 5);

    store.setCustomOrbitParams(500, 97.4, 1500);
    const ellipticalResolved = resolveMissionEntities(useMissionStore.getState());
    expect(ellipticalResolved.orbit.altitudeApogeeKm).toBe(1500);
    expect(ellipticalResolved.engineering.orbital.eccentricity).toBeGreaterThan(0.05);

    // Reset restores STANDARD difficulty and clean baseline configuration
    store.resetMissionForNewAttempt();
    const afterReset = useMissionStore.getState();
    expect(afterReset.difficulty).toBe('STANDARD');
    expect(afterReset.busId).toBe('bus-espa-smallsat');
    expect(afterReset.customPerigeeKm).toBeNull();
    expect(afterReset.customApogeeKm).toBeNull();
  });

  it('scoring: awards 0 science points with 0 instruments and stays bounded without rewarding over-budget cost', () => {
    const resolved = resolveMissionEntities(useMissionStore.getState());
    const emptyScienceEng = evaluateMissionEngineering({
      scenario: resolved.scenario,
      bus: resolved.bus,
      subsystems: resolved.subsystems,
      instruments: [],
      orbit: resolved.orbit,
      launchVehicle: resolved.launchVehicle,
    });
    expect(emptyScienceEng.validation.overallStatus).toBe('NO_GO');

    const zeroInstScore = evaluateMissionScore({
      scenario: resolved.scenario,
      configurationName: 'No Instruments',
      engineering: emptyScienceEng,
      instruments: [],
    });
    expect(zeroInstScore.scienceScore).toBe(0);
    expect(zeroInstScore.totalScore).toBeLessThanOrEqual(40);
    expect(zeroInstScore.outcome).toBe('MISSION_LOSS');

    // Expensive observatory hardware exceeding budget ceiling should yield lower resource score than balanced GO baseline
    const overBudgetEng = evaluateMissionEngineering({
      scenario: { ...resolved.scenario, budgetCapMusd: 30 },
      bus: resolved.bus,
      subsystems: resolved.subsystems,
      instruments: resolved.instruments,
      orbit: resolved.orbit,
      launchVehicle: resolved.launchVehicle,
    });
    const overBudgetScore = evaluateMissionScore({
      scenario: { ...resolved.scenario, budgetCapMusd: 30 },
      configurationName: 'Over Budget',
      engineering: overBudgetEng,
      instruments: resolved.instruments,
    });
    expect(overBudgetEng.budget.status).toBe('NO_GO');
    expect(overBudgetScore.resourceEfficiencyScore).toBeLessThan(
      resolved.scorePreview.resourceEfficiencyScore
    );
  });

  it('supports data-driven switching across FLOODWATCH, LUNAR SCOUT, MARS OBSERVER, and ASTEROID EXPLORER', () => {
    const store = useMissionStore.getState();
    const initialScenarioId = store.scenarioId;

    const codes = MISSION_SCENARIOS.map((s) => s.code);
    expect(codes).toEqual([
      'FLOODWATCH',
      'LUNAR SCOUT',
      'MARS OBSERVER',
      'ASTEROID EXPLORER',
    ]);

    for (const scen of MISSION_SCENARIOS) {
      store.selectScenario(scen.id);
      const resolved = resolveMissionEntities(useMissionStore.getState());
      expect(resolved.scenario.id).toBe(scen.id);
      expect(resolved.orbit.id).toBe(scen.recommendedOrbitId);
      expect(resolved.orbit.celestialBody).toBe(scen.celestialBody);
      expect(resolved.engineering.orbital.isValidOrbit).toBe(true);
      expect(resolved.scenario.telemetryConstraints).toBeDefined();
      expect(resolved.scenario.scenarioEvents?.length).toBeGreaterThanOrEqual(2);
      expect(resolved.scenario.scoringProfile?.scienceWeight).toBe(35);
      expect(resolved.scorePreview.totalScore).toBeGreaterThanOrEqual(0);
      expect(resolved.scorePreview.totalScore).toBeLessThanOrEqual(100);
    }

    // Restore default FLOODWATCH scenario
    store.selectScenario(initialScenarioId);
  });
});

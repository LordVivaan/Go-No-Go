import { describe, expect, it } from 'vitest';
import {
  generateMissionAdvisorReport,
  requestOptionalAiExplanation,
} from '../../src/engine/advisor';
import { MISSION_PRESETS, resolveMissionEntities, useMissionStore } from '../../src/store/missionStore';

describe('Deterministic Rule-Based Mission Advisor', () => {
  it('marks baseline GO LUNAR SCOUT preset as FLIGHT_READY with zero critical blockers', () => {
    const baseline = MISSION_PRESETS[0];
    const resolved = resolveMissionEntities({
      ...useMissionStore.getState(),
      scenarioId: baseline.scenarioId,
      busId: baseline.busId,
      subsystemIds: { ...baseline.subsystemIds },
      instrumentIds: [...baseline.instrumentIds],
      orbitId: baseline.orbitId,
      launchVehicleId: baseline.launchVehicleId,
      customAltitudeKm: null,
      customInclinationDeg: null,
    });

    const report = generateMissionAdvisorReport(resolved);
    expect(report.overallVerdict).toBe('FLIGHT_READY');
    expect(report.criticalCount).toBe(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.disclaimer).toContain('Deterministic rule-based');
  });

  it('flags optical-only CubeSat in LUNAR SCOUT with PSR/night and power/comms/mass findings', () => {
    const cubesat = MISSION_PRESETS[1];
    const resolved = resolveMissionEntities({
      ...useMissionStore.getState(),
      scenarioId: cubesat.scenarioId,
      busId: cubesat.busId,
      subsystemIds: { ...cubesat.subsystemIds },
      instrumentIds: [...cubesat.instrumentIds],
      orbitId: cubesat.orbitId,
      launchVehicleId: cubesat.launchVehicleId,
      customAltitudeKm: null,
      customInclinationDeg: null,
    });

    const report = generateMissionAdvisorReport(resolved);
    expect(report.overallVerdict).toBe('CRITICAL_REDESIGN');
    expect(report.criticalCount).toBeGreaterThan(0);
    expect(report.recommendations.some((r) => r.priority === 'CRITICAL')).toBe(true);
    expect(report.recommendations.every((r) => r.route.startsWith('/'))).toBe(true);
  });

  it('detects 0 instruments and invalid orbital altitudes (Lunar < 15 km, LEO < 120 km) while accepting valid altitudes', () => {
    const baseline = MISSION_PRESETS[0];
    // Invalid Lunar altitude (5 km < 15 km minimum safe lunar altitude)
    const invalidLunar = resolveMissionEntities({
      ...useMissionStore.getState(),
      scenarioId: baseline.scenarioId,
      busId: baseline.busId,
      subsystemIds: { ...baseline.subsystemIds },
      instrumentIds: [],
      orbitId: baseline.orbitId,
      launchVehicleId: baseline.launchVehicleId,
      customAltitudeKm: 5,
      customInclinationDeg: 89.5,
    });
    const lunarReport = generateMissionAdvisorReport(invalidLunar);
    expect(lunarReport.overallVerdict).toBe('CRITICAL_REDESIGN');
    expect(lunarReport.recommendations.some((r) => r.id === 'adv-orbit-invalid')).toBe(true);
    expect(lunarReport.recommendations.some((r) => r.id === 'adv-science-empty')).toBe(true);

    // Valid Lunar altitude (50 km >= 15 km)
    const validLunar = resolveMissionEntities({
      ...useMissionStore.getState(),
      scenarioId: baseline.scenarioId,
      busId: baseline.busId,
      subsystemIds: { ...baseline.subsystemIds },
      instrumentIds: [...baseline.instrumentIds],
      orbitId: baseline.orbitId,
      launchVehicleId: baseline.launchVehicleId,
      customAltitudeKm: 50,
      customInclinationDeg: 89.5,
    });
    expect(validLunar.engineering.orbital.isValidOrbit).toBe(true);

    // Invalid Earth LEO altitude (50 km < 120 km Earth minimum safe altitude)
    const invalidLeo = resolveMissionEntities({
      ...useMissionStore.getState(),
      scenarioId: baseline.scenarioId,
      busId: baseline.busId,
      subsystemIds: { ...baseline.subsystemIds },
      instrumentIds: [...baseline.instrumentIds],
      orbitId: 'orbit-sso-550-dd',
      launchVehicleId: baseline.launchVehicleId,
      customAltitudeKm: 50,
      customInclinationDeg: 97.6,
    });
    expect(invalidLeo.engineering.orbital.isValidOrbit).toBe(false);

    // Valid Earth LEO altitude (550 km >= 120 km)
    const validLeo = resolveMissionEntities({
      ...useMissionStore.getState(),
      scenarioId: baseline.scenarioId,
      busId: baseline.busId,
      subsystemIds: { ...baseline.subsystemIds },
      instrumentIds: [...baseline.instrumentIds],
      orbitId: 'orbit-sso-550-dd',
      launchVehicleId: baseline.launchVehicleId,
      customAltitudeKm: 550,
      customInclinationDeg: 97.6,
    });
    expect(validLeo.engineering.orbital.isValidOrbit).toBe(true);
  });

  it('keeps optional AI narrative hook cleanly separated and fails closed when unconfigured or unreachable', async () => {
    const baseline = MISSION_PRESETS[0];
    const resolved = resolveMissionEntities({
      ...useMissionStore.getState(),
      scenarioId: baseline.scenarioId,
      busId: baseline.busId,
      subsystemIds: { ...baseline.subsystemIds },
      instrumentIds: [...baseline.instrumentIds],
      orbitId: baseline.orbitId,
      launchVehicleId: baseline.launchVehicleId,
      customAltitudeKm: null,
      customInclinationDeg: null,
    });
    const report = generateMissionAdvisorReport(resolved);

    const disabled = await requestOptionalAiExplanation({
      scenarioCode: resolved.scenario.code,
      report,
      endpointOverride: '',
    });
    expect(disabled.status).toBe('DISABLED');

    const unreachable = await requestOptionalAiExplanation({
      scenarioCode: resolved.scenario.code,
      report,
      endpointOverride: 'https://example.invalid/advisor',
      fetchImpl: async () => {
        throw new Error('Network disabled');
      },
    });
    expect(unreachable.status).toBe('UNAVAILABLE');
    expect(unreachable.narrative).toBeUndefined();
  });
});

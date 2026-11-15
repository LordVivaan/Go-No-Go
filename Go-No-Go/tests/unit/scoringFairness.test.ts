import { describe, expect, it } from 'vitest';
import { evaluateMissionScore } from '../../src/engine/scoring';
import { resolveMissionEntities } from '../../src/store/missionStore';
import { applyCompetitionTieRanking } from '../../src/services/leaderboardService';

describe('Architecture-neutral mission scoring & competition tie ranking', () => {
  it('allows diverse valid architectures across Lunar, Mars, and Asteroid missions to score fairly', () => {
    const configs = [
      {
        name: 'Lunar SmallSat LWIR',
        scenarioId: 'lunar-ice-02',
        busId: 'bus-espa-smallsat',
        instrumentIds: ['inst-thermal-ir'],
        orbitId: 'orbit-lunar-polar-100',
        launchVehicleId: 'lv-dedicated-smallsat',
        subsystemIds: {
          SOLAR_ARRAY: 'solar-wings-espa',
          BATTERY: 'batt-liion-650wh',
          PROPULSION: 'prop-hall-xenon',
          ANTENNA: 'comm-kaband-hga',
          AVIONICS: 'avio-rad750-redundant',
          THERMAL: 'therm-active-louvers',
        },
      },
      {
        name: 'Lunar SmallSat Neutron + Thermal IR',
        scenarioId: 'lunar-ice-02',
        busId: 'bus-espa-smallsat',
        instrumentIds: ['inst-neutron-spectrometer', 'inst-thermal-ir'],
        orbitId: 'orbit-lunar-polar-100',
        launchVehicleId: 'lv-dedicated-smallsat',
        subsystemIds: {
          SOLAR_ARRAY: 'solar-wings-espa',
          BATTERY: 'batt-liion-650wh',
          PROPULSION: 'prop-hall-xenon',
          ANTENNA: 'comm-kaband-hga',
          AVIONICS: 'avio-rad750-redundant',
          THERMAL: 'therm-active-louvers',
        },
      },
      {
        name: 'Asteroid Explorer Magnetometer + Radiation',
        scenarioId: 'nea-rendezvous-04',
        busId: 'bus-medium-observatory',
        instrumentIds: ['inst-fluxgate-mag', 'inst-particle-radiation'],
        orbitId: 'orbit-asteroid-prox-5',
        launchVehicleId: 'lv-medium-eelv',
        subsystemIds: {
          SOLAR_ARRAY: 'solar-wings-deep-space',
          BATTERY: 'batt-liion-1500wh',
          PROPULSION: 'prop-hall-xenon',
          ANTENNA: 'comm-kaband-hga',
          AVIONICS: 'avio-rad750-redundant',
          THERMAL: 'therm-active-louvers',
        },
      },
    ];

    for (const cfg of configs) {
      const resolved = resolveMissionEntities({
        scenarioId: cfg.scenarioId,
        difficulty: 'STANDARD',
        busId: cfg.busId,
        instrumentIds: cfg.instrumentIds,
        instrumentDutyOverrides: {},
        subsystemIds: cfg.subsystemIds,
        orbitId: cfg.orbitId,
        customInclinationDeg: null,
        launchVehicleId: cfg.launchVehicleId,
      });

      const report = evaluateMissionScore({
        scenario: resolved.scenario,
        difficulty: 'STANDARD',
        configurationName: cfg.name,
        engineering: resolved.engineering,
        instruments: resolved.instruments,
      });

      expect(
        resolved.engineering.validation.overallStatus,
        `${cfg.name}: ${resolved.engineering.validation.findings
          .filter((f) => f.severity === 'FAIL')
          .map((f) => `${f.id} (${f.explanation})`)
          .join('; ')}`,
      ).not.toBe('NO_GO');
      expect(report.scienceScore).toBeGreaterThan(15);
      expect(report.resourceEfficiencyScore).toBeGreaterThan(8);
      expect(report.totalScore).toBeGreaterThan(60);
    }
  });

  it('gives zero science score when no instruments are manifested', () => {
    const resolved = resolveMissionEntities({
      scenarioId: 'lunar-ice',
      difficulty: 'STANDARD',
      busId: 'bus-espa-smallsat',
      instrumentIds: [],
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

    const report = evaluateMissionScore({
      scenario: resolved.scenario,
      difficulty: 'STANDARD',
      configurationName: 'No Payload',
      engineering: resolved.engineering,
      instruments: [],
    });

    expect(report.scienceScore).toBe(0);
    expect(report.outcome).toBe('MISSION_LOSS');
  });

  it('applies standard competition tie-ranking (1, 2, 2, 4) ordered by earliest submission', () => {
    const ranked = applyCompetitionTieRanking([
      { id: 'c', totalScore: 88.4, achievedAtIso: '2026-11-15T12:00:00Z' },
      { id: 'a', totalScore: 94.2, achievedAtIso: '2026-11-15T10:00:00Z' },
      { id: 'b', totalScore: 88.4, achievedAtIso: '2026-11-15T09:00:00Z' },
      { id: 'd', totalScore: 79.0, achievedAtIso: '2026-11-15T08:00:00Z' },
    ]);

    expect(ranked.map((r) => ({ id: r.id, rank: r.rank }))).toEqual([
      { id: 'a', rank: 1 },
      { id: 'b', rank: 2 },
      { id: 'c', rank: 2 },
      { id: 'd', rank: 4 },
    ]);
  });

  it('ranks by aiScore when present (1, 1, 3, 4) and preserves earliest-submission tie order', () => {
    const ranked = applyCompetitionTieRanking([
      { id: 'late-tie', totalScore: 95.0, aiScore: 92.0, achievedAtIso: '2026-11-15T12:00:00Z' },
      { id: 'early-tie', totalScore: 80.0, aiScore: 92.0, achievedAtIso: '2026-11-15T09:00:00Z' },
      { id: 'third', totalScore: 90.0, aiScore: null, achievedAtIso: '2026-11-15T08:00:00Z' },
      { id: 'fourth', totalScore: 85.0, aiScore: 84.5, achievedAtIso: '2026-11-15T07:00:00Z' },
    ]);

    expect(ranked.map((r) => ({ id: r.id, rank: r.rank }))).toEqual([
      { id: 'early-tie', rank: 1 },
      { id: 'late-tie', rank: 1 },
      { id: 'third', rank: 3 },
      { id: 'fourth', rank: 4 },
    ]);
  });
});

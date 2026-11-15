import { DIFFICULTY_PROFILES } from '../data/scenarios';
import type { EngineeringSummary } from '../types/engineering';
import type { GateStatus, MissionDifficulty, ScenarioDefinition } from '../types/mission';
import type { KPPEvaluationItem, MissionScoreReport } from '../types/simulation';
import type { ScientificInstrument } from '../types/spacecraft';

/**
 * Evaluates mission Key Performance Parameters (KPPs) and produces an explainable
 * 0–100 normalized aerospace score:
 * - 35 pts Science Return & Flood Utility
 * - 25 pts Mission Completion & Reliability
 * - 15 pts Resource Efficiency (Mass, Power, Propulsion, Budget Reserve)
 * - 15 pts Data & Communications Closure
 * - 10 pts Risk Management (ODAR, Anomaly Resolution & Thermal Margin)
 * Enforces explicit failed-mission caps and penalties.
 */
export function evaluateMissionScore(params: {
  scenario: ScenarioDefinition;
  difficulty?: MissionDifficulty;
  configurationName: string;
  engineering: EngineeringSummary;
  instruments: ScientificInstrument[];
  seed?: number;
  completionDurationSec?: number;
  totalDataCapturedGb?: number;
  totalDataDownlinkedGb?: number;
  totalDataLostGb?: number;
  floodRegionsMappedCount?: number;
  anomaliesResolvedCount?: number;
  anomaliesTotalCount?: number;
  batteryExhausted?: boolean;
  finalSystemHealthPct?: number;
}): MissionScoreReport {
  const {
    scenario,
    difficulty = 'STANDARD',
    configurationName,
    engineering,
    instruments,
    seed = 20261114,
    completionDurationSec = scenario.simulationDurationDays * 86400,
    totalDataCapturedGb = engineering.commsData.dataGeneratedPerDayGb * scenario.simulationDurationDays,
    totalDataDownlinkedGb = Math.min(
      engineering.commsData.dataGeneratedPerDayGb,
      engineering.commsData.downlinkCapacityPerDayGb
    ) * scenario.simulationDurationDays,
    totalDataLostGb = 0,
    floodRegionsMappedCount = scenario.targetRegions.length,
    anomaliesResolvedCount = 0,
    anomaliesTotalCount = 0,
    batteryExhausted = false,
    finalSystemHealthPct = 100,
  } = params;

  const profile = DIFFICULTY_PROFILES[difficulty];

  const hasCloudPenetrating = instruments.some((i) => i.cloudPenetrating);
  const hasNightCapable = instruments.some((i) => i.nightCapable);
  const bestResolutionM =
    instruments.length > 0 ? Math.min(...instruments.map((i) => i.resolutionM)) : 999;

  // 1. Science Return (out of 35)
  const isFloodwatch = scenario.code === 'FLOODWATCH';
  const isLunar =
    scenario.celestialBody === 'MOON' ||
    scenario.code === 'LUNAR ICE MAPPER' ||
    scenario.code === 'LUNAR SCOUT';

  const avgFloodUtility =
    instruments.length > 0
      ? Math.min(
          1.0,
          instruments.reduce((sum, i) => sum + i.floodScienceUtility, 0) /
            Math.max(1, instruments.length * 0.75)
        )
      : 0;
  const downlinkCompletionRatio =
    totalDataCapturedGb > 0 ? Math.min(1.0, totalDataDownlinkedGb / totalDataCapturedGb) : 0;
  const regionCoverageRatio =
    instruments.length === 0
      ? 0
      : scenario.targetRegions.length > 0
        ? Math.min(1.0, floodRegionsMappedCount / scenario.targetRegions.length)
        : 1.0;

  const domainPayloadBonus =
    instruments.length === 0
      ? 0
      : isFloodwatch
        ? hasCloudPenetrating
          ? 8
          : 2
        : isLunar
          ? hasNightCapable
            ? 8
            : 2
          : instruments.length >= 2
            ? 8
            : 5;

  const scienceScore =
    instruments.length === 0
      ? 0
      : Number(
          Math.max(
            0,
            Math.min(
              35,
              avgFloodUtility * 17 +
                domainPayloadBonus +
                downlinkCompletionRatio * 5 +
                regionCoverageRatio * 5
            )
          ).toFixed(1)
        );

  // 2. Mission Completion & Reliability (out of 25)
  const relPts = engineering.reliability.combinedMissionReliability * 14;
  const healthFactor = Math.max(0, Math.min(1, finalSystemHealthPct / 100)) * 7;
  const validationGateBonus =
    engineering.validation.overallStatus === 'GO'
      ? 4
      : engineering.validation.overallStatus === 'CAUTION'
        ? 2
        : 0;
  const completionReliabilityScore = Number(
    Math.min(25, relPts + healthFactor + validationGateBonus).toFixed(1)
  );

  // 3. Resource Efficiency (out of 15): Mass, Power, Propulsion, Budget
  const statusRatio = (s: GateStatus) => (s === 'GO' ? 1.0 : s === 'CAUTION' ? 0.6 : 0.15);
  const resourceRaw =
    statusRatio(engineering.mass.status) * 3.75 +
    statusRatio(engineering.power.status) * 3.75 +
    statusRatio(engineering.propulsion.status) * 3.75 +
    statusRatio(engineering.budget.status) * 3.75;
  const resourceEfficiencyScore = Number(Math.min(15, resourceRaw).toFixed(1));

  // 4. Data & Communications (out of 15)
  const linkMarginRatio =
    engineering.commsData.linkMarginDb >= profile.minLinkMarginDb
      ? 1.0
      : engineering.commsData.linkMarginDb >= 0
        ? 0.6
        : 0.1;
  const ssrClosureRatio =
    engineering.commsData.netDataBacklogPerDayGb <= 0
      ? 1.0
      : engineering.commsData.netDataBacklogPerDayGb < engineering.commsData.storageCapacityGb * 0.5
        ? 0.5
        : 0.15;
  const overflowPenalty = totalDataLostGb > 0 ? Math.min(3.0, totalDataLostGb * 0.1) : 0;
  const dataCommsScore = Number(
    Math.max(
      0,
      Math.min(
        15,
        linkMarginRatio * 6 + ssrClosureRatio * 5 + downlinkCompletionRatio * 4 - overflowPenalty
      )
    ).toFixed(1)
  );

  // 5. Risk Management (out of 10: ODAR 4.0 + Anomaly Mitigation 4.0 + Thermal 2.0)
  const odarPts = engineering.propulsion.odarCompliant ? 4.0 : 0;
  const unresolvedAnomalies = Math.max(0, anomaliesTotalCount - anomaliesResolvedCount);
  const anomalyPts =
    anomaliesTotalCount === 0
      ? 4.0
      : Math.max(0, 4.0 * (anomaliesResolvedCount / anomaliesTotalCount) - unresolvedAnomalies * 0.5);
  const thermalRiskPts = statusRatio(engineering.thermal.status) * 2.0;
  const riskCollabScore = Number(
    Math.max(0, Math.min(10, odarPts + anomalyPts + thermalRiskPts)).toFixed(1)
  );

  let rawTotal =
    scienceScore +
    completionReliabilityScore +
    resourceEfficiencyScore +
    dataCommsScore +
    riskCollabScore;

  const penaltiesApplied: string[] = [];
  if (overflowPenalty > 0) {
    penaltiesApplied.push(`SSR Overflow Data Loss (-${overflowPenalty.toFixed(1)} pts)`);
  }
  if (unresolvedAnomalies > 0) {
    penaltiesApplied.push(`${unresolvedAnomalies} Unresolved Anomalies`);
  }

  const missionLost =
    engineering.validation.overallStatus === 'NO_GO' ||
    batteryExhausted ||
    finalSystemHealthPct <= 0;

  let failureReason: string | undefined;
  if (batteryExhausted) {
    failureReason = 'Spacecraft bus suffered complete battery exhaustion (0% SoC) during eclipse.';
  } else if (finalSystemHealthPct <= 0) {
    failureReason = 'Spacecraft critical subsystem health degraded to 0%, resulting in loss of mission.';
  } else if (engineering.validation.overallStatus === 'NO_GO') {
    failureReason = 'Configuration failed Flight Readiness Review (NO_GO) blocking nominal mission certification.';
  }

  const scienceGateUnmet =
    (isFloodwatch && !hasCloudPenetrating) || (isLunar && !hasNightCapable);

  let outcome: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'MISSION_LOSS';
  if (missionLost || rawTotal < 50) {
    outcome = 'MISSION_LOSS';
    if (rawTotal > 40) {
      penaltiesApplied.push('Mission Loss Score Cap Applied (Max 40 / 100)');
      rawTotal = 40;
    }
  } else if (
    engineering.validation.overallStatus === 'CAUTION' ||
    rawTotal < 78 ||
    scienceGateUnmet
  ) {
    outcome = 'PARTIAL_SUCCESS';
    if (rawTotal > 74) {
      penaltiesApplied.push(
        'Partial Success Cap Applied (Max 74 / 100 due to CAUTION / Mission Science Limits)'
      );
      rawTotal = 74;
    }
  } else {
    outcome = 'SUCCESS';
  }

  const totalScore = Number(Math.max(0, Math.min(100, rawTotal)).toFixed(1));

  const grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F' =
    outcome === 'MISSION_LOSS'
      ? 'F'
      : totalScore >= 89 && engineering.validation.overallStatus === 'GO'
        ? 'S'
        : totalScore >= 78
          ? 'A'
          : totalScore >= 66
            ? 'B'
            : totalScore >= 54
              ? 'C'
              : totalScore >= 42
                ? 'D'
                : 'F';

  const kppEvaluations: KPPEvaluationItem[] = scenario.kpps.map((kpp) => {
    let rawVal: number | boolean = 0;
    let measuredText = '';

    switch (kpp.metricKey) {
      case 'allWeatherCapable':
        rawVal = hasCloudPenetrating;
        measuredText = hasCloudPenetrating ? 'YES (Active SAR/Radar)' : 'NO (Blocked by Clouds)';
        break;
      case 'nightCapable':
        rawVal = hasNightCapable;
        measuredText = hasNightCapable ? 'YES (Night Capable)' : 'NO (Daylight Only)';
        break;
      case 'revisitHours':
        rawVal = engineering.orbital.revisitHours;
        measuredText = `${engineering.orbital.revisitHours} hr`;
        break;
      case 'bestResolutionM':
        rawVal = bestResolutionM;
        measuredText = `${bestResolutionM} m GSD`;
        break;
      case 'dailyDataGb':
        rawVal = Math.min(
          engineering.commsData.dataGeneratedPerDayGb,
          engineering.commsData.downlinkCapacityPerDayGb
        );
        measuredText = `${rawVal.toFixed(1)} GB/day`;
        break;
      case 'deltaVMarginPct':
        rawVal = engineering.propulsion.deltaVMarginPct;
        measuredText = `${engineering.propulsion.deltaVMarginPct}%`;
        break;
      case 'systemReliability':
        rawVal = engineering.reliability.combinedMissionReliability;
        measuredText = `${(rawVal * 100).toFixed(1)}%`;
        break;
    }

    let status: GateStatus = 'GO';
    let scoreNormalized = 1.0;

    if (kpp.comparison === 'BOOL_TRUE') {
      status = rawVal === true ? 'GO' : 'NO_GO';
      scoreNormalized = rawVal === true ? 1.0 : 0.0;
    } else if (kpp.comparison === 'LTE') {
      const nVal = Number(rawVal);
      const thresh = Number(kpp.thresholdValue);
      const goal = Number(kpp.goalValue);
      status = nVal <= goal ? 'GO' : nVal <= thresh ? 'CAUTION' : 'NO_GO';
      scoreNormalized = nVal <= goal ? 1.0 : nVal <= thresh ? 0.7 : 0.2;
    } else {
      const nVal = Number(rawVal);
      const thresh = Number(kpp.thresholdValue);
      const goal = Number(kpp.goalValue);
      status = nVal >= goal ? 'GO' : nVal >= thresh ? 'CAUTION' : 'NO_GO';
      scoreNormalized = nVal >= goal ? 1.0 : nVal >= thresh ? 0.75 : 0.2;
    }

    return {
      kppId: kpp.id,
      name: kpp.name,
      measuredText,
      thresholdText:
        typeof kpp.thresholdValue === 'boolean'
          ? kpp.thresholdValue
            ? 'Required'
            : 'Optional'
          : `${kpp.thresholdValue} ${kpp.unit}`,
      goalText:
        typeof kpp.goalValue === 'boolean'
          ? kpp.goalValue
            ? 'Required'
            : 'Optional'
          : `${kpp.goalValue} ${kpp.unit}`,
      status,
      scoreNormalized,
    };
  });

  const linkMarginFormatted = `${engineering.commsData.linkMarginDb >= 0 ? '+' : ''}${engineering.commsData.linkMarginDb} dB`;
  const debriefNotes: string[] = [
    `Flight Readiness Verdict: ${engineering.validation.overallStatus} (Concept Maturity Level CML-${engineering.validation.achievedCmlLevel}).`,
    isFloodwatch
      ? hasCloudPenetrating
        ? 'Active microwave radar penetrated 85% monsoon cloud cover across Brahmaputra-Ganges and Lower Mekong deltas.'
        : 'Optical/passive payload suffered cloud obscuration over monsoon flood zones; add C-Band or X-Band SAR to reach S-Grade.'
      : isLunar
        ? hasNightCapable
          ? 'Night/PSR-capable instrumentation resolved permanently shadowed lunar polar craters.'
          : 'Daylight-only payload could not resolve permanently shadowed craters.'
        : `Executed ${scenario.code} nominal scientific observation plan across ${scenario.targetRegions.length} target zones.`,
    `Downlinked ${totalDataDownlinkedGb.toFixed(1)} GB of ${totalDataCapturedGb.toFixed(1)} GB captured science telemetry (${linkMarginFormatted} Eb/N0 link margin).`,
    `Total Life-Cycle Cost: $${engineering.budget.totalSpentMusd}M of $${scenario.budgetCapMusd}M cap ($${engineering.budget.safeRemainingMusd}M safe reserve after 20% contingency).`,
  ];

  return {
    runId: `run-${Date.now()}`,
    scenarioId: scenario.id,
    difficulty,
    configurationName,
    completedAtIso: new Date().toISOString(),
    seed,
    completionDurationSec: Math.max(60, Math.round(completionDurationSec)),
    outcome,
    failureReason,
    totalScore,
    grade,
    scienceScore,
    completionReliabilityScore,
    resourceEfficiencyScore,
    dataCommsScore,
    riskCollabScore,
    penaltiesApplied,
    totalDataCapturedGb: Number(totalDataCapturedGb.toFixed(2)),
    totalDataDownlinkedGb: Number(totalDataDownlinkedGb.toFixed(2)),
    totalDataLostGb: Number(totalDataLostGb.toFixed(2)),
    floodRegionsMappedCount,
    anomaliesResolvedCount,
    anomaliesTotalCount,
    kppEvaluations,
    debriefNotes,
  };
}

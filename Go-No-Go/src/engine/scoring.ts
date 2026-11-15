import { DIFFICULTY_PROFILES } from '../data/scenarios';
import type { EngineeringSummary } from '../types/engineering';
import type { GateStatus, MissionDifficulty, ScenarioDefinition } from '../types/mission';
import type { KPPEvaluationItem, MissionScoreReport } from '../types/simulation';
import type { ScientificInstrument } from '../types/spacecraft';

/**
 * Evaluates mission Key Performance Parameters (KPPs) and produces an explainable
 * 0–100 normalized aerospace score:
 * - 35 pts Science Return & Objective Fulfillment
 * - 25 pts Mission Completion & Reliability
 * - 15 pts Resource Efficiency (Balanced Mass, Power, Propulsion, Budget Allocation)
 * - 15 pts Data & Communications Closure
 * - 10 pts Risk Management (ODAR, Anomaly Resolution & Thermal Margin)
 * Evaluates mission capability and engineering closure without privileging
 * a single bus class or payload family.
 */
function scoreBalancedRatio(utilization: number, idealMin: number, idealMax: number): number {
  if (!Number.isFinite(utilization)) return 0.5;
  if (utilization >= idealMin && utilization <= idealMax) return 1.0;
  if (utilization < idealMin) {
    // Undersized or vastly oversized reserve: linearly ramp down to 0.45 at 0 utilization
    return Math.max(0.45, 0.45 + 0.55 * (utilization / Math.max(0.01, idealMin)));
  }
  // Over-utilized above idealMax (tight margin)
  return Math.max(0.2, 1.0 - (utilization - idealMax) / Math.max(0.05, 1.0 - idealMax));
}

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

  // Evaluate KPPs first so science scoring reflects actual scenario requirements
  const kppEvaluations: KPPEvaluationItem[] = scenario.kpps.map((kpp) => {
    let rawVal: number | boolean = 0;
    let measuredText = '';

    switch (kpp.metricKey) {
      case 'allWeatherCapable':
        rawVal = hasCloudPenetrating;
        measuredText = hasCloudPenetrating ? 'YES (Cloud-Penetrating)' : 'NO (Clear-Sky Only)';
        break;
      case 'nightCapable':
        rawVal = hasNightCapable;
        measuredText = hasNightCapable ? 'YES (Night / Low-Light Capable)' : 'NO (Daylight Only)';
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

  // 1. Science Return (out of 35) — Architecture-neutral objective fulfillment
  const kppScienceAvg =
    kppEvaluations.length > 0
      ? kppEvaluations.reduce((sum, item) => sum + item.scoreNormalized, 0) / kppEvaluations.length
      : 1.0;
  const distinctInstrumentTypes = new Set(instruments.map((i) => i.type)).size;
  const multiInstrumentSynergy =
    instruments.length === 0
      ? 0
      : Math.min(1.0, 0.65 + (distinctInstrumentTypes - 1) * 0.2 + (instruments.length > 1 ? 0.15 : 0));
  const resolutionScore =
    instruments.length === 0
      ? 0
      : bestResolutionM <= 10
        ? 1.0
        : bestResolutionM <= 50
          ? 0.9
          : bestResolutionM <= 250
            ? 0.8
            : 0.7;

  const downlinkCompletionRatio =
    totalDataCapturedGb > 0 ? Math.min(1.0, totalDataDownlinkedGb / totalDataCapturedGb) : 0;
  const regionCoverageRatio =
    instruments.length === 0
      ? 0
      : scenario.targetRegions.length > 0
        ? Math.min(1.0, floodRegionsMappedCount / scenario.targetRegions.length)
        : 1.0;

  const scienceScore =
    instruments.length === 0
      ? 0
      : Number(
          Math.max(
            0,
            Math.min(
              35,
              kppScienceAvg * 17 +
                multiInstrumentSynergy * 5 +
                resolutionScore * 3 +
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

  // 3. Resource Efficiency (out of 15): Gate Closure (10) + Balanced Sizing Efficiency (5)
  const statusRatio = (s: GateStatus) => (s === 'GO' ? 1.0 : s === 'CAUTION' ? 0.6 : 0.15);
  const resourceGatePts =
    (statusRatio(engineering.mass.status) +
      statusRatio(engineering.power.status) +
      statusRatio(engineering.propulsion.status) +
      statusRatio(engineering.budget.status)) *
    2.5;

  const massUtilization =
    engineering.mass.maxLaunchMassKg > 0
      ? engineering.mass.wetMassKg / engineering.mass.maxLaunchMassKg
      : 0.5;
  const powerUtilization =
    engineering.power.peakSupplyW > 0
      ? engineering.power.peakLoadW / engineering.power.peakSupplyW
      : 0.5;
  const budgetUtilization =
    scenario.budgetCapMusd > 0 ? engineering.budget.totalSpentMusd / scenario.budgetCapMusd : 0.5;
  const sizingBalance =
    (scoreBalancedRatio(massUtilization, 0.25, 0.92) +
      scoreBalancedRatio(powerUtilization, 0.25, 0.88) +
      scoreBalancedRatio(budgetUtilization, 0.2, 0.92)) /
    3;
  const resourceEfficiencyScore = Number(
    Math.min(15, resourceGatePts + sizingBalance * 5).toFixed(1)
  );

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

  const failedCriticalKpp = kppEvaluations.some((item) => item.status === 'NO_GO');

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
    failedCriticalKpp
  ) {
    outcome = 'PARTIAL_SUCCESS';
    if (rawTotal > 74) {
      penaltiesApplied.push(
        'Partial Success Cap Applied (Max 74 / 100 due to CAUTION / Unmet Threshold KPP)'
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

  const linkMarginFormatted = `${engineering.commsData.linkMarginDb >= 0 ? '+' : ''}${engineering.commsData.linkMarginDb} dB`;
  const metKppCount = kppEvaluations.filter((k) => k.status === 'GO').length;
  const debriefNotes: string[] = [
    `Flight Readiness Verdict: ${engineering.validation.overallStatus} (Concept Maturity Level CML-${engineering.validation.achievedCmlLevel}).`,
    `Key Performance Parameters: ${metKppCount} of ${kppEvaluations.length} scenario KPPs met goal criteria.`,
    `Executed ${scenario.code} observation plan across ${scenario.targetRegions.length} target regions with ${instruments.length} active payload(s).`,
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

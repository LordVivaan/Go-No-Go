export type LaunchPhaseId =
  | 'PRELAUNCH_POLL'
  | 'LIFTOFF_MAXQ'
  | 'MECO_STAGE_SEP'
  | 'FAIRING_JETTISON'
  | 'SECO_DEPLOYMENT';

export interface LaunchAssemblyTargets {
  stage1OffsetY: number;
  stage2OffsetY: number;
  fairingSpreadX: number;
  fairingDropY: number;
  fairingTiltRad: number;
  showStage1: boolean;
  showStage2: boolean;
  showFairing: boolean;
  showSolarWings: boolean;
  engineActive: boolean;
}

export function getLaunchAssemblyTargets(phase: LaunchPhaseId): LaunchAssemblyTargets {
  const stage1Separated =
    phase === 'MECO_STAGE_SEP' ||
    phase === 'FAIRING_JETTISON' ||
    phase === 'SECO_DEPLOYMENT';
  const fairingJettisoned = phase === 'FAIRING_JETTISON' || phase === 'SECO_DEPLOYMENT';
  const spacecraftDeployed = phase === 'SECO_DEPLOYMENT';

  return {
    stage1OffsetY: stage1Separated ? -2.8 : 0,
    stage2OffsetY: spacecraftDeployed ? -2.2 : 0,
    fairingSpreadX: phase === 'FAIRING_JETTISON' ? 0.95 : spacecraftDeployed ? 3.0 : 0,
    fairingDropY: phase === 'FAIRING_JETTISON' ? -0.35 : spacecraftDeployed ? -1.4 : 0,
    fairingTiltRad: fairingJettisoned ? 0.32 : 0,
    showStage1: phase !== 'SECO_DEPLOYMENT',
    showStage2: true,
    showFairing: phase !== 'SECO_DEPLOYMENT',
    showSolarWings: spacecraftDeployed,
    engineActive: phase !== 'PRELAUNCH_POLL' && phase !== 'SECO_DEPLOYMENT',
  };
}

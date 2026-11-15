import type { CostBudgetResult } from '../types/engineering';
import type { GateStatus } from '../types/mission';
import type { LaunchVehicle, ScientificInstrument, SpacecraftComponent } from '../types/spacecraft';
import { calculateRemainingBudget } from './mass';

/**
 * Evaluates full Mission Life-Cycle Cost & NPR 7120.5F 20% Unallocated Reserve Margin ($M USD).
 */
export function evaluateCostBudget(params: {
  budgetCapMusd: number;
  developmentCostMusd: number;
  operationsCostMusd: number;
  integrationCostMusd?: number;
  testingCostMusd?: number;
  bus: SpacecraftComponent;
  subsystems: SpacecraftComponent[];
  instruments: ScientificInstrument[];
  launchVehicle: LaunchVehicle;
}): CostBudgetResult {
  const {
    budgetCapMusd,
    developmentCostMusd,
    operationsCostMusd,
    bus,
    subsystems,
    instruments,
    launchVehicle,
  } = params;

  const allHardware = [bus, ...subsystems, ...instruments];
  const hardwareCostMusd = allHardware.reduce((sum, item) => sum + item.costMusd, 0);
  const splitDevMode =
    params.integrationCostMusd === undefined && params.testingCostMusd === undefined;
  const effectiveDevCostMusd = splitDevMode
    ? Number((developmentCostMusd * 0.55).toFixed(2))
    : developmentCostMusd;
  const integrationCostMusd =
    params.integrationCostMusd ?? Number((developmentCostMusd * 0.25).toFixed(2));
  const testingCostMusd =
    params.testingCostMusd ?? Number((developmentCostMusd - effectiveDevCostMusd - integrationCostMusd).toFixed(2));
  const launchCostMusd = launchVehicle.costMusd;

  const { totalRemaining, safeRemaining } = calculateRemainingBudget(
    budgetCapMusd,
    allHardware,
    effectiveDevCostMusd,
    launchCostMusd,
    operationsCostMusd,
    integrationCostMusd,
    testingCostMusd
  );

  const totalSpentMusd =
    hardwareCostMusd +
    effectiveDevCostMusd +
    integrationCostMusd +
    testingCostMusd +
    launchCostMusd +
    operationsCostMusd;
  const contingencyReserveMusd = budgetCapMusd * 0.20;
  const budgetMarginPct = budgetCapMusd > 0 ? (totalRemaining / budgetCapMusd) * 100 : -100;

  let status: GateStatus = 'GO';
  if (totalRemaining < 0) {
    status = 'NO_GO';
  } else if (safeRemaining < 0) {
    status = 'CAUTION'; // Encroaching into the 20% contingency reserve
  }

  return {
    hardwareCostMusd: Number(hardwareCostMusd.toFixed(2)),
    developmentCostMusd: Number(effectiveDevCostMusd.toFixed(2)),
    integrationCostMusd: Number(integrationCostMusd.toFixed(2)),
    testingCostMusd: Number(testingCostMusd.toFixed(2)),
    launchCostMusd: Number(launchCostMusd.toFixed(2)),
    operationsCostMusd: Number(operationsCostMusd.toFixed(2)),
    totalSpentMusd: Number(totalSpentMusd.toFixed(2)),
    contingencyReserveMusd: Number(contingencyReserveMusd.toFixed(2)),
    totalRemainingMusd: Number(totalRemaining.toFixed(2)),
    safeRemainingMusd: Number(safeRemaining.toFixed(2)),
    budgetMarginPct: Number(budgetMarginPct.toFixed(1)),
    status,
    trace: {
      id: 'cost-reserve-budget',
      title: 'Life-Cycle Cost & 20% Unallocated Reserve (NPR 7120.5F)',
      symbolicEquation:
        'C_total = C_hw + C_dev + C_int + C_test + C_LV + C_ops;   C_safe = (0.80 × C_cap) - C_total',
      classification: 'GAMEPLAY_RULE',
      referenceStandard: 'NASA NPR 7120.5F & JPL CML Cost Reserve Policy (20% Phase B Reserve)',
      inputs: {
        C_cap: { value: budgetCapMusd, unit: '$M', description: 'Authorized mission cost ceiling' },
        C_hw: { value: Number(hardwareCostMusd.toFixed(2)), unit: '$M', description: 'Bus + Subsystems + Payload hardware' },
        C_ait: {
          value: Number((integrationCostMusd + testingCostMusd).toFixed(2)),
          unit: '$M',
          description: 'Assembly, Integration & Environmental Testing (AI&T)',
        },
        C_LV: { value: launchCostMusd, unit: '$M', description: 'Launch vehicle & integration services' },
        C_dev_ops: {
          value: Number((developmentCostMusd + operationsCostMusd).toFixed(2)),
          unit: '$M',
          description: 'Phase A-D SE/PM + Phase E Ground Ops',
        },
      },
      output: {
        value: Number(totalRemaining.toFixed(2)),
        unit: '$M',
        formatted: `$${totalSpentMusd.toFixed(1)}M / $${budgetCapMusd.toFixed(1)}M ($${safeRemaining.toFixed(1)}M post-reserve)`,
      },
    },
  };
}

import type { TargetRegion } from '../types/mission';
import type { OrbitalParameters, SpacecraftComponent } from '../types/spacecraft';

const COMPONENT_SHORT_NAMES: Record<string, string> = {
  // Buses
  'bus-cubesat-6u': '6U CubeSat Bus',
  'bus-espa-smallsat': 'ESPA SmallSat Bus',
  'bus-medium-observatory': 'Medium Observatory Bus',
  // Solar arrays
  'solar-body-6u': '6U GaAs Solar Wings',
  'solar-wings-espa': '2-Axis GaAs Solar Array',
  'solar-wings-deep-space': 'ROSA Roll-Out Solar Array',
  // Batteries
  'batt-liion-120wh': '120 Wh Li-Ion Pack',
  'batt-liion-650wh': '650 Wh Li-Ion Battery',
  'batt-liion-1500wh': '1,500 Wh Li-Ion Bank',
  // Antennas
  'comm-sband-patch': 'S-Band Patch Transceiver',
  'comm-xband-horn': 'X-Band Gimbaled Horn',
  'comm-kaband-hga': 'Ka-Band Dish Antenna',
  // Propulsion
  'prop-cold-gas': 'N2 Cold-Gas Thruster',
  'prop-monoprop-afm315e': 'ASCENT Monoprop Module',
  'prop-hall-xenon': 'Xenon Hall Thruster',
  // Thermal
  'therm-passive-mli': 'MLI + Survival Heaters',
  'therm-active-louvers': 'Thermal Louvers + Heat Pipes',
  // Avionics
  'avio-rad-tolerant-single': 'COTS OBC + 128 GB SSR',
  'avio-rad750-redundant': 'RAD750 Avionics + 512 GB SSR',
};

const ORBIT_SHORT_NAMES: Record<string, string> = {
  'orbit-leo-400-iss': '400 km ISS LEO',
  'orbit-sso-550-dawn': '550 km Dawn-Dusk SSO',
  'orbit-sso-700-noon': '700 km Noon-Midnight SSO',
  'orbit-leo-1000-wide': '1,000 km Wide-Swath LEO',
  'orbit-geo-35786': 'GEO',
  'orbit-molniya-heo': 'Molniya Orbit',
  'orbit-lunar-polar-100': '100 km Lunar Polar',
  'orbit-mars-sso-400': '400 km Mars SSO',
  'orbit-nea-proximity': 'Asteroid Proximity',
};

const TARGET_REGION_SHORT_NAMES: Record<string, string> = {
  'crater-shackleton': 'Shackleton Rim',
  'crater-cabeus': 'Cabeus Basin',
  'crater-tycho': 'Tycho Highlands',
};

export function getShortComponentName(component: Pick<SpacecraftComponent, 'id' | 'name'>): string {
  return COMPONENT_SHORT_NAMES[component.id] ?? component.name;
}

export function getShortOrbitName(orbit: Pick<OrbitalParameters, 'id' | 'name'>): string {
  return ORBIT_SHORT_NAMES[orbit.id] ?? orbit.name;
}

export function getShortTargetRegionName(region: Pick<TargetRegion, 'id' | 'name'>): string {
  return TARGET_REGION_SHORT_NAMES[region.id] ?? region.name;
}

export function getCompactConfigName(name: string): string {
  if (name.trim() === 'GNG-Baseline Spacecraft Config') {
    return 'GNG Baseline';
  }
  return name;
}

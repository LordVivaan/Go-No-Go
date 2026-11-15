import type { ComponentCategory, InstrumentType } from '../types/spacecraft';

export interface ComponentEducationalGuidance {
  purpose: string;
  whatItDoes: string;
  whyItMatters: string;
  advantages: string;
  limitations: string;
  nasaUrl: string;
  nasaLabel: string;
}

const CATEGORY_DEFAULT_GUIDANCE: Record<ComponentCategory, ComponentEducationalGuidance> = {
  BUS: {
    purpose: 'Primary structural chassis, avionics backbone, and payload accommodation frame.',
    whatItDoes:
      'Provides mechanical mounting, structural stiffness during launch, thermal radiator area, and onboard data storage.',
    whyItMatters:
      'Determines maximum payload mass, number of instrument bays, and which launch vehicle dispensers can carry the spacecraft.',
    advantages: 'Defines the mechanical and electrical envelope for every other subsystem.',
    limitations: 'Larger buses increase launch mass and cost; smaller buses restrict payload slots.',
    nasaUrl: 'https://www.nasa.gov/johnson/frontdoor/capabilities/spacecraft-subsystems/',
    nasaLabel: 'NASA Spacecraft Subsystems',
  },
  SOLAR_ARRAY: {
    purpose: 'Primary electrical power generation from solar irradiance.',
    whatItDoes:
      'Converts sunlight into DC bus power to run instruments, heaters, and avionics while recharging batteries.',
    whyItMatters:
      'Solar flux drops with distance squared (e.g., ~43% at Mars vs Earth), making array sizing critical for deep space.',
    advantages: 'Continuous renewable orbital power without consumable fuel.',
    limitations: 'Generates zero power in eclipse; articulated wings add deployment complexity.',
    nasaUrl: 'https://www.nasa.gov/johnson/frontdoor/capabilities/spacecraft-subsystems/',
    nasaLabel: 'NASA Spacecraft Subsystems',
  },
  BATTERY: {
    purpose: 'Secondary energy storage for eclipse and peak-load operations.',
    whatItDoes:
      'Supplies regulated bus power when solar arrays are shadowed or when radar/RF bursts exceed array output.',
    whyItMatters:
      'Exceeding safe Depth of Discharge (DoD) degrades cells rapidly and risks mid-eclipse spacecraft brownout.',
    advantages: 'Bridges orbital night and smooths high-power instrument duty cycles.',
    limitations: 'Adds dense mass and requires thermal protection against freezing.',
    nasaUrl: 'https://www.nasa.gov/johnson/frontdoor/capabilities/spacecraft-subsystems/',
    nasaLabel: 'NASA Spacecraft Subsystems',
  },
  ANTENNA: {
    purpose: 'RF communications link between spacecraft and Earth ground stations.',
    whatItDoes:
      'Transmits stored science data to ground receivers and receives flight commands over S, X, or Ka frequency bands.',
    whyItMatters:
      'Determines link margin and downlink throughput; insufficient bandwidth causes SSR data overflow.',
    advantages: 'Higher-gain / higher-frequency dishes dramatically increase science return.',
    limitations: 'Narrow-beam high-gain dishes require precise ADCS pointing and higher RF power.',
    nasaUrl: 'https://science.nasa.gov/learn/basics-of-space-flight/chapter11-1/',
    nasaLabel: 'NASA Basics of Space Flight: Onboard Systems',
  },
  PROPULSION: {
    purpose: 'Orbital maneuvering, station-keeping, and end-of-life disposal.',
    whatItDoes:
      'Expels propellant to produce ΔV for orbit insertion, drag/perturbation compensation, and deorbit compliance.',
    whyItMatters:
      'Without adequate ΔV, the spacecraft cannot maintain its science orbit or meet orbital debris disposal rules.',
    advantages: 'Enables orbital agility, longer mission life, and ODAR compliance.',
    limitations: 'Propellant and tanks add wet mass; electric propulsion requires high bus power.',
    nasaUrl: 'https://www.nasa.gov/reference/jsc-planning-architecture-analysis/',
    nasaLabel: 'NASA Mission Planning & Trajectory Design',
  },
  THERMAL: {
    purpose: 'Thermal equilibrium and component temperature protection.',
    whatItDoes:
      'Balances absorbed solar/planetary heat against internal dissipation and deep-space radiation.',
    whyItMatters:
      'Electronics, batteries, and IR detectors fail if temperatures exceed hot or cold survival limits.',
    advantages: 'Active louvers and heaters adapt across wide hot/cold orbital extremes.',
    limitations: 'Active thermal hardware draws electrical power and adds mass.',
    nasaUrl: 'https://www.nasa.gov/johnson/frontdoor/capabilities/spacecraft-subsystems/',
    nasaLabel: 'NASA Spacecraft Subsystems',
  },
  AVIONICS: {
    purpose: 'Command & Data Handling (OBC) and Attitude Control (ADCS).',
    whatItDoes:
      'Processes flight software, manages Solid-State Recorder memory, and points the spacecraft using star trackers and reaction wheels.',
    whyItMatters:
      'Radiation tolerance, redundancy, and pointing accuracy govern mission reliability and data integrity.',
    advantages: 'Dual-redundant rad-hard avionics sharply reduce single-point-of-failure risk.',
    limitations: 'Higher-grade radiation-hardened computers carry higher procurement cost.',
    nasaUrl: 'https://science.nasa.gov/learn/basics-of-space-flight/chapter11-1/',
    nasaLabel: 'NASA Basics of Space Flight: Onboard Systems',
  },
};

const COMPONENT_OVERRIDES: Record<string, Partial<ComponentEducationalGuidance>> = {
  'bus-cubesat-6u': {
    advantages: 'Lowest cost and rideshare-ready 6U dispenser compatibility.',
    limitations: 'Tight mass/volume limit; cannot host heavy radar or deep-space payloads.',
  },
  'bus-espa-smallsat': {
    advantages: 'Dual star trackers, redundant avionics, and 3 payload bays for agile science.',
    limitations: 'Requires SmallSat-class or larger launch vehicle.',
  },
  'bus-medium-observatory': {
    advantages: 'Highest structural stiffness, 4 payload bays, and 1 TB radiation-hardened SSR.',
    limitations: 'High dry mass and bus cost; demands Medium EELV launch capacity.',
  },
  'prop-cold-gas': {
    advantages: 'Simple, non-toxic, contamination-free attitude and minor trim impulses.',
    limitations: 'Very low specific impulse (Isp); insufficient ΔV for major orbit transfers.',
  },
  'prop-monoprop-hydrazine': {
    advantages: 'High thrust-to-weight for rapid orbital insertion and trim burns.',
    limitations: 'Moderate Isp requires heavier propellant mass for deep-space ΔV.',
  },
  'prop-hall-xenon': {
    advantages: 'Ultra-high specific impulse delivers massive ΔV with minimal propellant mass.',
    limitations: 'Low thrust and high electrical power demand during thruster firing.',
  },
  'comm-sband-patch': {
    advantages: 'Wide beamwidth tolerates coarse pointing and is cheap/lightweight.',
    limitations: 'Low data rate; unsuitable for deep-space distances or high-rate imaging.',
  },
  'comm-xband-helical': {
    advantages: 'Strong balance of medium data rate and moderate pointing requirements.',
    limitations: 'Lower throughput than Ka-band for multi-instrument radar/IR missions.',
  },
  'comm-kaband-hga': {
    advantages: 'High-gain parabolic dish supports deep-space links and massive daily downlink.',
    limitations: 'Narrow beamwidth demands precise ADCS pointing and higher RF power.',
  },
};

const INSTRUMENT_GUIDANCE: Record<InstrumentType, ComponentEducationalGuidance> = {
  OPTICAL: {
    purpose: 'Visible-spectrum high-resolution surface imaging.',
    whatItDoes: 'Captures reflected sunlight across RGB bands for detailed surface morphology.',
    whyItMatters: 'Provides intuitive visual context and sharp spatial resolution in clear daylight.',
    advantages: 'Lightweight, low power, and very fine ground sample distance.',
    limitations: 'Blocked by clouds and darkness; cannot observe permanently shadowed craters.',
    nasaUrl: 'https://science.nasa.gov/moon/image-galleries/',
    nasaLabel: 'NASA Lunar & Planetary Imaging Galleries',
  },
  MULTISPECTRAL: {
    purpose: 'Mineral, moisture, and spectral signature mapping.',
    whatItDoes: 'Measures reflected light across visible and short-wave infrared (VNIR/SWIR) bands.',
    whyItMatters: 'Identifies surface composition, water indices, and mineral deposits.',
    advantages: 'Wide swath coverage and rich spectral science return.',
    limitations: 'Requires solar illumination and is attenuated by thick cloud decks.',
    nasaUrl: 'https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab',
    nasaLabel: 'NASA GSFC Mission Design Lab',
  },
  THERMAL_IR: {
    purpose: 'Day/night surface temperature and thermal inertia mapping.',
    whatItDoes: 'Detects emitted thermal infrared radiation independent of reflected sunlight.',
    whyItMatters: 'Enables 24/7 mapping of cold traps, volcanic anomalies, and thermal contrasts.',
    advantages: 'Operates continuously on both day and night hemispheres.',
    limitations: 'Cryo-cooled optics draw continuous standby power.',
    nasaUrl: 'https://science.nasa.gov/solar-system/resources/resource-packages/earths-moon-resources/',
    nasaLabel: 'NASA Moon & Planetary Science Resources',
  },
  SAR: {
    purpose: 'All-weather, day/night active radar surface mapping.',
    whatItDoes: 'Transmits microwave pulses and measures backscatter to image through clouds and darkness.',
    whyItMatters: 'Delivers guaranteed observations regardless of solar lighting or atmospheric cover.',
    advantages: 'Cloud-penetrating, night-capable, and high spatial resolution.',
    limitations: 'Highest peak power draw, mass, and downlink data rate.',
    nasaUrl: 'https://www.nasa.gov/johnson/frontdoor/capabilities/spacecraft-subsystems/',
    nasaLabel: 'NASA Spacecraft Subsystems',
  },
  ALTIMETER: {
    purpose: 'Precision surface elevation and topography profiling.',
    whatItDoes: 'Times radar/laser returns to measure terrain height and crater depth to centimeter precision.',
    whyItMatters: 'Essential for landing-site safety, slope mapping, and subsurface structure studies.',
    advantages: 'Works day and night and penetrates clouds (radar altimetry).',
    limitations: 'Requires SmallSat-class bus and steady nadir pointing.',
    nasaUrl: 'https://www.nasa.gov/reference/jsc-planning-architecture-analysis/',
    nasaLabel: 'NASA Mission Planning & Trajectory Design',
  },
  SPECTROMETER: {
    purpose: 'Elemental, hydrogen, and volatile composition detection.',
    whatItDoes: 'Measures neutron/gamma-ray or spectral emissions from the top meter of regolith.',
    whyItMatters: 'Directly detects subsurface water-ice and volatile deposits in shadowed polar craters.',
    advantages: 'Low data rate and uniquely capable of detecting subsurface hydrogen/ice.',
    limitations: 'Requires low-altitude polar orbit for strong signal-to-noise ratio.',
    nasaUrl: 'https://science.nasa.gov/solar-system/resources/resource-packages/earths-moon-resources/',
    nasaLabel: 'NASA Moon & Planetary Science Resources',
  },
};

export function getComponentGuidance(
  category: ComponentCategory,
  componentId: string
): ComponentEducationalGuidance {
  const base = CATEGORY_DEFAULT_GUIDANCE[category];
  const override = COMPONENT_OVERRIDES[componentId];
  return override ? { ...base, ...override } : base;
}

export function getInstrumentGuidance(type: InstrumentType): ComponentEducationalGuidance {
  return INSTRUMENT_GUIDANCE[type];
}

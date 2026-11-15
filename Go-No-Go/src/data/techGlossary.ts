export interface TechGlossaryEntry {
  code: string;
  fullTerm: string;
  shortExplanation: string;
  whyItMatters: string;
  consequenceIfWrong: string;
  nasaUrl?: string;
  nasaLabel?: string;
}

export const TECH_GLOSSARY: Record<string, TechGlossaryEntry> = {
  EPS: {
    code: 'EPS',
    fullTerm: 'Electrical Power System',
    shortExplanation:
      'Generates, regulates, stores, and distributes electrical power from solar arrays and batteries to all spacecraft subsystems.',
    whyItMatters:
      'Every instrument, computer, heater, and radio depends on continuous power across sunlit and eclipse phases.',
    consequenceIfWrong:
      'Undersized solar arrays or batteries cause brownouts during eclipse, forcing payload shutdowns or mission loss.',
    nasaUrl: 'https://www.nasa.gov/johnson/frontdoor/capabilities/spacecraft-subsystems/',
    nasaLabel: 'NASA Spacecraft Subsystems',
  },
  ADCS: {
    code: 'ADCS',
    fullTerm: 'Attitude Determination and Control System',
    shortExplanation:
      'Sensors (star trackers, sun sensors, IMUs) and actuators (reaction wheels, thrusters) that measure and control spacecraft orientation.',
    whyItMatters:
      'High-resolution imagers must point accurately at surface targets, while high-gain antennas must point toward Earth.',
    consequenceIfWrong:
      'Poor pointing blurs science observations, reduces solar array incidence, and breaks narrow-beam RF communications.',
    nasaUrl: 'https://science.nasa.gov/learn/basics-of-space-flight/chapter11-1/',
    nasaLabel: 'NASA Basics of Space Flight: Onboard Systems',
  },
  OBC: {
    code: 'OBC',
    fullTerm: 'On-Board Computer',
    shortExplanation:
      'Radiation-hardened flight processor executing command & data handling, fault protection, and autonomous sequencing.',
    whyItMatters:
      'Manages telemetry, instrument scheduling, and anomaly recovery when the spacecraft is out of ground contact.',
    consequenceIfWrong:
      'Single-string or low-heritage avionics increase vulnerability to single-event upsets and unrecovered safe-mode resets.',
    nasaUrl: 'https://science.nasa.gov/learn/basics-of-space-flight/chapter11-1/',
    nasaLabel: 'NASA Basics of Space Flight: Onboard Systems',
  },
  RF: {
    code: 'RF',
    fullTerm: 'Radio Frequency Communications',
    shortExplanation:
      'Transceivers and antennas (S-Band, X-Band, Ka-Band) that transmit science telemetry to ground stations and receive commands.',
    whyItMatters:
      'Link margin and data rate determine how much captured science data can actually be returned to Earth.',
    consequenceIfWrong:
      'Negative link margin or low bandwidth causes Solid-State Recorder overflow and permanent science data loss.',
    nasaUrl: 'https://www.nasa.gov/johnson/frontdoor/capabilities/spacecraft-subsystems/',
    nasaLabel: 'NASA Spacecraft Subsystems',
  },
  DELTA_V: {
    code: 'ΔV',
    fullTerm: 'Change in Velocity (Delta-V)',
    shortExplanation:
      'The total propulsive impulse budget available for orbit insertion, station-keeping, inclination changes, and end-of-life disposal.',
    whyItMatters:
      'Governs whether the spacecraft can maintain its mission orbit against perturbations and execute required maneuvers.',
    consequenceIfWrong:
      'Insufficient ΔV leaves the spacecraft unable to counter orbital decay, reach target geometry, or comply with disposal rules.',
    nasaUrl: 'https://www.nasa.gov/reference/jsc-planning-architecture-analysis/',
    nasaLabel: 'NASA Mission Planning & Trajectory Design',
  },
  TCS: {
    code: 'TCS',
    fullTerm: 'Thermal Control System',
    shortExplanation:
      'Multi-layer insulation (MLI), radiators, louvers, and survival heaters that keep components within safe operating temperatures.',
    whyItMatters:
      'Spacecraft experience extreme solar heating in sunlight and deep-space radiative cooling during eclipse.',
    consequenceIfWrong:
      'Overheating degrades electronics and detectors, while freezing damages lithium-ion batteries and propellant lines.',
    nasaUrl: 'https://www.nasa.gov/johnson/frontdoor/capabilities/spacecraft-subsystems/',
    nasaLabel: 'NASA Spacecraft Subsystems',
  },
  CML: {
    code: 'CML',
    fullTerm: 'Concept Maturity Level',
    shortExplanation:
      'NASA framework (CML 1–6) measuring how completely a mission concept’s requirements, margins, and interfaces have been verified.',
    whyItMatters:
      'Higher CML indicates that mass, power, thermal, communications, and cost budgets close together coherently.',
    consequenceIfWrong:
      'Advancing with low maturity hides coupled subsystem conflicts until late integration or flight.',
    nasaUrl: 'https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab',
    nasaLabel: 'NASA GSFC Mission Design Lab',
  },
  SSO: {
    code: 'SSO',
    fullTerm: 'Sun-Synchronous Orbit',
    shortExplanation:
      'A near-polar orbit whose J2 nodal precession matches Earth’s orbital rate around the Sun, keeping local solar lighting consistent.',
    whyItMatters:
      'Provides repeatable illumination angles for optical/multispectral imaging and predictable solar power geometry.',
    consequenceIfWrong:
      'Incorrect inclination breaks sun-synchronous lighting stability or demands excessive plane-change propellant.',
    nasaUrl: 'https://www.nasa.gov/reference/jsc-planning-architecture-analysis/',
    nasaLabel: 'NASA Mission Planning & Trajectory Design',
  },
  DOD: {
    code: 'DoD',
    fullTerm: 'Battery Depth of Discharge',
    shortExplanation:
      'Percentage of total battery capacity drained during each eclipse or peak-load interval.',
    whyItMatters:
      'Limiting DoD preserves lithium-ion cycle life and leaves an energy reserve for unexpected anomalies.',
    consequenceIfWrong:
      'Excessive DoD accelerates cell degradation and risks complete bus power loss before sunrise.',
    nasaUrl: 'https://www.nasa.gov/johnson/frontdoor/capabilities/spacecraft-subsystems/',
    nasaLabel: 'NASA Spacecraft Subsystems',
  },
  SSR: {
    code: 'SSR',
    fullTerm: 'Solid-State Recorder',
    shortExplanation:
      'Non-volatile onboard memory storing science observations and engineering telemetry between ground station passes.',
    whyItMatters:
      'Bridges the gap between high-rate instrument data capture and intermittent ground-station downlink windows.',
    consequenceIfWrong:
      'If daily capture exceeds downlink capacity and SSR buffer fills, new science observations are overwritten or dropped.',
    nasaUrl: 'https://science.nasa.gov/learn/basics-of-space-flight/chapter11-1/',
    nasaLabel: 'NASA Basics of Space Flight: Onboard Systems',
  },
  TRL: {
    code: 'TRL',
    fullTerm: 'Technology Readiness Level',
    shortExplanation:
      'Scale from 1 (basic principles) to 9 (flight-proven) indicating hardware maturity and spaceflight heritage.',
    whyItMatters:
      'Higher TRL hardware carries lower integration risk and more predictable reliability over the mission lifetime.',
    consequenceIfWrong:
      'Low-TRL components can introduce unexpected failures or require additional redundancy and margin.',
    nasaUrl: 'https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab',
    nasaLabel: 'NASA GSFC Mission Design Lab',
  },
  ODAR: {
    code: 'ODAR',
    fullTerm: 'Orbital Debris Assessment Report',
    shortExplanation:
      'Compliance check verifying that the spacecraft has sufficient post-mission disposal capability (e.g. 5–25 year deorbit rule).',
    whyItMatters:
      'Protects crowded orbital regimes by ensuring retired spacecraft do not remain long-term collision hazards.',
    consequenceIfWrong:
      'Non-compliant disposal ΔV flags regulatory and mission-risk warnings during flight readiness review.',
    nasaUrl: 'https://www.nasa.gov/reference/jsc-planning-architecture-analysis/',
    nasaLabel: 'NASA Mission Planning & Trajectory Design',
  },
};

export type TechGlossaryKey = keyof typeof TECH_GLOSSARY;

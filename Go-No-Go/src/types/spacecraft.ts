export type FormFactor = '1U' | '3U' | '6U' | 'SMALLSAT' | 'ESPA';

export type ComponentCategory =
  | 'BUS'
  | 'SOLAR_ARRAY'
  | 'BATTERY'
  | 'ANTENNA'
  | 'PROPULSION'
  | 'THERMAL'
  | 'AVIONICS';

export type InstrumentType =
  | 'OPTICAL'
  | 'MULTISPECTRAL'
  | 'HYPERSPECTRAL'
  | 'THERMAL_IR'
  | 'SAR'
  | 'ALTIMETER'
  | 'SPECTROMETER'
  | 'MAGNETOMETER'
  | 'RADIATION_DETECTOR'
  | 'ATMOSPHERIC_SENSOR'
  | 'COMMS_EXPERIMENT';

export type RFBand = 'UHF' | 'S_BAND' | 'X_BAND' | 'KA_BAND';

export type DataProvenance = 'VERIFIED' | 'ILLUSTRATIVE' | 'UNKNOWN';

export interface SpacecraftComponent {
  id: string;
  name: string;
  category: ComponentCategory;
  compatibleFormFactors: FormFactor[];
  massKg: number;
  powerDrawW: number; // Nominal operating power draw (W)
  powerOutputW?: number; // BOL peak output at 1 AU for solar arrays (W)
  solarAreaM2?: number; // Effective cell area (m^2)
  cellEfficiency?: number; // e.g., 0.295 for triple-junction GaAs
  batteryCapacityWh?: number; // Nominal energy capacity (Wh)
  maxDodFraction?: number; // Recommended max Depth of Discharge (e.g., 0.30)
  rfBand?: RFBand;
  txPowerW?: number; // RF transmitter output power (W)
  antennaGainDbi?: number; // Peak boresight gain (dBi)
  downlinkRateMbps?: number; // Nominal downlink data rate (Mbps)
  storageCapacityGb?: number; // Onboard SSR storage (GB)
  propellantMassKg?: number; // Wet propellant capacity (kg)
  ispSeconds?: number; // Specific impulse (s)
  thrustNewtons?: number;
  radiatorAreaM2?: number;
  absorptivityAlpha?: number; // Solar absorptivity (0-1)
  emissivityEpsilon?: number; // IR emissivity (0-1)
  heaterPowerW?: number; // Eclipse survival heater power (W)
  maxPayloadMassKg?: number; // For BUS category: max supported total wet mass (kg)
  payloadSlots?: number; // For BUS category: max number of scientific instruments
  isRedundant?: boolean; // Dual-string fault-tolerant design
  trl: number; // NASA Technology Readiness Level (1-9)
  reliability3Yr: number; // 0.0 to 1.0
  costMusd: number; // $M USD
  description: string;
  provenance?: DataProvenance;
  sourceReference?: string;
}

export interface ScientificInstrument {
  id: string;
  name: string;
  shortCode: string;
  type: InstrumentType;
  minFormFactor: FormFactor;
  massKg: number;
  powerOperatingW: number;
  powerStandbyW: number;
  dataRateMbps: number; // Science generation rate while active (Mbps)
  defaultDutyCycle: number; // Fraction of orbit active (0.05 to 1.0)
  swathWidthKm: number;
  resolutionM: number; // Ground sample distance (m)
  cloudPenetrating: boolean;
  nightCapable: boolean;
  trl: number;
  reliability3Yr: number;
  costMusd: number;
  floodScienceUtility: number; // 0.0 to 1.0 effectiveness for FLOODWATCH
  description: string;
  tradeOffNote: string;
  provenance?: DataProvenance;
  sourceReference?: string;
}

export type OrbitalRegime =
  | 'LEO'
  | 'LEO_ISS'
  | 'SSO_DAWN_DUSK'
  | 'SSO_NOON_MIDNIGHT'
  | 'MEO'
  | 'MOLNIYA'
  | 'GEO'
  | 'LUNAR_POLAR'
  | 'MARS_SSO'
  | 'ASTEROID_PROXIMITY';

export interface OrbitalParameters {
  id: string;
  name: string;
  regime: OrbitalRegime;
  celestialBody: 'EARTH' | 'MOON' | 'MARS' | 'ASTEROID';
  altitudePerigeeKm: number;
  altitudeApogeeKm: number;
  inclinationDeg: number;
  raanDeg: number; // Right Ascension of Ascending Node (deg)
  argPerigeeDeg: number; // Argument of Perigee (deg)
  meanAnomalyDeg: number; // Mean Anomaly at Epoch (deg)
  solarBetaAngleDeg: number; // Angle between orbital plane and Sun vector (deg)
  requiredDeltaVReserveMps: number; // Orbit maintenance + ODAR disposal delta-V (m/s)
  description: string;
}

export interface LaunchVehicle {
  id: string;
  name: string;
  provider: string;
  supportedFormFactors: FormFactor[];
  maxMassLeoKg: number;
  maxMassSsoKg: number;
  maxMassCislunarKg: number;
  fairingDiameterM: number;
  fairingHeightM: number;
  costMusd: number;
  reliability: number;
  injectionAccuracyMps: number; // Trim delta-V needed from spacecraft (m/s)
  description: string;
}

export interface GroundStation {
  id: string;
  name: string;
  location: string;
  latitudeDeg: number;
  longitudeDeg: number;
  minElevationDeg: number;
  supportedBands: RFBand[];
  gOverTDbPerK: number; // Receiver Figure of Merit G/T (dB/K)
  avgPassDurationSec: number;
}

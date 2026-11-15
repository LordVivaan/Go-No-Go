export type FloodwatchBasinId =
  | 'basin-brahmaputra'
  | 'basin-mekong'
  | 'basin-mississippi'
  | 'basin-danube';

export type WeatherWindowMode = 'current' | 'forecast_24h' | 'historical_24h';

export type WeatherClassification =
  | 'CURRENT_ANALYSIS'
  | 'FORECAST'
  | 'HISTORICAL';

export interface FloodwatchWeatherBasin {
  id: FloodwatchBasinId;
  name: string;
  regionLabel: string;
  lat: number;
  lon: number;
  baselineCloudCoverFraction: number;
}

/**
 * Fixed allowlist of the four FLOODWATCH basins defined in scenarios.ts.
 * Keeping this in a dependency-free shared module ensures both the Cloudflare Pages
 * Function and the React client enforce identical basin bounds without duplicating logic.
 */
export const FLOODWATCH_WEATHER_BASINS: readonly FloodwatchWeatherBasin[] = [
  {
    id: 'basin-brahmaputra',
    name: 'Brahmaputra-Ganges Delta',
    regionLabel: 'South Asia · Monsoon Cloud Deck',
    lat: 23.8,
    lon: 90.4,
    baselineCloudCoverFraction: 0.85,
  },
  {
    id: 'basin-mekong',
    name: 'Lower Mekong Floodplain',
    regionLabel: 'Southeast Asia · Convective Cloud Cover',
    lat: 10.6,
    lon: 105.5,
    baselineCloudCoverFraction: 0.78,
  },
  {
    id: 'basin-mississippi',
    name: 'Lower Mississippi Alluvial Valley',
    regionLabel: 'North America · Alluvial Valley',
    lat: 32.3,
    lon: -90.9,
    baselineCloudCoverFraction: 0.45,
  },
  {
    id: 'basin-danube',
    name: 'Danube-Tisza Confluence',
    regionLabel: 'Central Europe · Precipitation Corridor',
    lat: 45.2,
    lon: 19.8,
    baselineCloudCoverFraction: 0.5,
  },
] as const;

export const FLOODWATCH_BASIN_BY_ID: Readonly<
  Record<FloodwatchBasinId, FloodwatchWeatherBasin>
> = {
  'basin-brahmaputra': FLOODWATCH_WEATHER_BASINS[0],
  'basin-mekong': FLOODWATCH_WEATHER_BASINS[1],
  'basin-mississippi': FLOODWATCH_WEATHER_BASINS[2],
  'basin-danube': FLOODWATCH_WEATHER_BASINS[3],
};

export interface MeteomaticsParameterSpec {
  id:
    | 't_2m:C'
    | 'precip_1h:mm'
    | 'wind_speed_10m:ms'
    | 'total_cloud_cover:p'
    | 'global_rad:W';
  label: string;
  unit: string;
  scientificRole: string;
}

export const METEOMATICS_PARAMETER_SPECS: readonly MeteomaticsParameterSpec[] = [
  {
    id: 't_2m:C',
    label: '2m Air Temperature',
    unit: '°C',
    scientificRole: 'Surface thermal state at 2 m above ground level',
  },
  {
    id: 'precip_1h:mm',
    label: '1h Precipitation',
    unit: 'mm',
    scientificRole:
      'Hourly rainfall context (indicates surface rain flux, not confirmed inundation)',
  },
  {
    id: 'wind_speed_10m:ms',
    label: '10m Wind Speed',
    unit: 'm/s',
    scientificRole: 'Near-surface wind context for airborne/ground operations',
  },
  {
    id: 'total_cloud_cover:p',
    label: 'Total Cloud Cover',
    unit: '%',
    scientificRole:
      'Degrades optical Sentinel-2 L2A visibility; C-band SAR (Sentinel-1 RTC) penetrates cloud',
  },
  {
    id: 'global_rad:W',
    label: 'Global Solar Irradiance',
    unit: 'W/m²',
    scientificRole:
      'Instantaneous surface horizontal solar flux (distinct from 1361 W/m² orbital solar constant)',
  },
] as const;

export const METEOMATICS_PARAMETER_STRING = METEOMATICS_PARAMETER_SPECS.map(
  (spec) => spec.id,
).join(',');

export interface WeatherMetrics {
  temperature2mC: number | null;
  precip1hMm: number | null;
  windSpeed10mMs: number | null;
  totalCloudCoverPct: number | null;
  globalSolarRadiationWm2: number | null;
}

export interface WeatherSamplePoint {
  validTimeUtc: string;
  classification: WeatherClassification;
  metrics: WeatherMetrics;
}

export interface WeatherSourceProvenance {
  provider: 'Meteomatics Weather API';
  model: 'mix';
  endpointHost: 'api.meteomatics.com';
  requestedParameters: readonly string[];
  units: {
    temperature2m: '°C';
    precip1h: 'mm';
    windSpeed10m: 'm/s';
    totalCloudCover: '%';
    globalSolarRadiation: 'W/m²';
  };
  cacheStatus: 'MISS' | 'HIT_EDGE_CACHE' | 'HIT_ISOLATE_CACHE';
  quotaNote: string;
}

export interface NormalizedWeatherSnapshot {
  basinId: FloodwatchBasinId;
  basinName: string;
  location: {
    lat: number;
    lon: number;
  };
  windowMode: WeatherWindowMode;
  classification: WeatherClassification;
  classificationNote: string;
  dataTimeUtc: string;
  retrievedAtUtc: string;
  current: WeatherSamplePoint;
  series: WeatherSamplePoint[];
  caveats: string[];
  source: WeatherSourceProvenance;
}

export type WeatherErrorCode =
  | 'METHOD_NOT_ALLOWED'
  | 'INVALID_BASIN'
  | 'ARBITRARY_COORDINATES_REJECTED'
  | 'INVALID_WINDOW'
  | 'INVALID_DATE_RANGE'
  | 'WEATHER_CREDENTIALS_MISSING'
  | 'UPSTREAM_AUTH_FAILED'
  | 'UPSTREAM_FORBIDDEN'
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'MALFORMED_UPSTREAM_RESPONSE'
  | 'CLIENT_NETWORK_ERROR';

export interface WeatherErrorPayload {
  ok: false;
  error: {
    code: WeatherErrorCode;
    message: string;
    retryAfterSeconds?: number;
  };
  retrievedAtUtc: string;
}

export interface WeatherSuccessPayload {
  ok: true;
  snapshot: NormalizedWeatherSnapshot;
}

export type WeatherApiResponsePayload =
  | WeatherSuccessPayload
  | WeatherErrorPayload;

export type WeatherClientStatus =
  | 'LIVE'
  | 'UNCONFIGURED'
  | 'RATE_LIMITED'
  | 'OFFLINE_FALLBACK'
  | 'ERROR';

export interface WeatherQueryResult {
  status: WeatherClientStatus;
  snapshot: NormalizedWeatherSnapshot | null;
  message: string;
  errorCode?: WeatherErrorCode;
  fallbackBaselineCloudFraction: number;
  retrievedAtUtc: string;
}

export interface WeatherProvenanceRecord {
  basinId: FloodwatchBasinId;
  basinName: string;
  windowMode: WeatherWindowMode;
  classification: WeatherClassification;
  dataTimeUtc: string;
  retrievedAtUtc: string;
  provider: 'Meteomatics Weather API';
  model: string;
  cacheStatus: WeatherSourceProvenance['cacheStatus'];
  precip1hMm: number | null;
  totalCloudCoverPct: number | null;
  windSpeed10mMs: number | null;
  temperature2mC: number | null;
  globalSolarRadiationWm2: number | null;
}

export function isFloodwatchBasinId(value: string): value is FloodwatchBasinId {
  return Object.prototype.hasOwnProperty.call(FLOODWATCH_BASIN_BY_ID, value);
}

export function isWeatherWindowMode(value: string): value is WeatherWindowMode {
  return (
    value === 'current' ||
    value === 'forecast_24h' ||
    value === 'historical_24h'
  );
}

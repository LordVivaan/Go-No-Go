export type ObservationModality = 'SAR' | 'OPTICAL' | 'ELEVATION';

export type PlanetaryComputerCollectionId =
  | 'sentinel-1-rtc'
  | 'sentinel-2-l2a'
  | 'cop-dem-glo-30';

export type TemporalSearchMode = 'MONSOON_2024' | 'RECENT_ARCHIVE';

export type EoArchiveStatus = 'RECENT' | 'ARCHIVED' | 'STATIC_REFERENCE';

export interface EoDatasetDescriptor {
  collectionId: PlanetaryComputerCollectionId;
  title: string;
  observationType: ObservationModality;
  sensorName: string;
  constellation: string;
  spatialResolutionLabel: string;
  coordinateSystemNote: string;
  assetKeys: string[];
  requiresSasForRawAssets: boolean;
  license: string;
  attribution: string;
  cloudPenetrating: boolean;
  nightCapable: boolean;
  scientificLimitationNote: string;
}

export interface EoSceneAcquisition {
  itemId: string;
  collectionId: PlanetaryComputerCollectionId;
  observationType: ObservationModality;
  platform: string;
  instrument: string;
  datetimeIso: string | null;
  archiveStatus: EoArchiveStatus;
  bbox: [number, number, number, number];
  epsg: number | null;
  cloudCoverPct: number | null;
  orbitState: string | null;
  polarizations: string[];
  tileJsonHref: string | null;
  renderedPreviewHref: string | null;
  rawAssetHref: string | null;
  attribution: string;
}

export interface EoTileReference {
  z: number;
  x: number;
  y: number;
  renderMode: 'WEBMERCATOR_TILE' | 'RENDERED_PREVIEW' | 'OFFLINE_FALLBACK';
}

export type EoQueryStatus = 'LIVE' | 'EMPTY' | 'OFFLINE_FALLBACK' | 'ERROR';

export interface EoSceneQueryResult {
  status: EoQueryStatus;
  collectionId: PlanetaryComputerCollectionId;
  basinId: string;
  basinName: string;
  temporalMode: TemporalSearchMode;
  scenes: EoSceneAcquisition[];
  selectedScene: EoSceneAcquisition | null;
  imageryUrl: string | null;
  tileRef: EoTileReference;
  isFallback: boolean;
  fromCache: boolean;
  detail: string;
}

export interface SasTokenEntry {
  collectionId: PlanetaryComputerCollectionId;
  token: string;
  expiryIso: string;
  expiresAtMs: number;
}

export interface EoDatasetUsageRecord {
  source: 'PLANETARY_COMPUTER' | 'NASA_GIBS';
  datasetId: string;
  label: string;
  observationType: ObservationModality;
  basinName: string;
  itemId: string | null;
  acquisitionDatetimeIso: string | null;
  archiveStatus: EoArchiveStatus | 'BASELINE_FALLBACK';
  isFallback: boolean;
  attribution: string;
}

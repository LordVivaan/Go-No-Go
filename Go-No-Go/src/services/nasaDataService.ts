/**
 * NASA Earth-Observation & Reference Data Integration Service
 *
 * Verified external endpoints & attribution:
 * - NASA Global Imagery Browse Services (GIBS) WMTS (EPSG:3857 RESTful):
 *   https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{Layer}/default/{Time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg
 * - Layers:
 *   - MODIS_Terra_CorrectedReflectance_TrueColor
 *   - VIIRS_SNPP_CorrectedReflectance_TrueColor
 */

export const NASA_GIBS_ATTRIBUTION =
  "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Observing System Data and Information System (EOSDIS).";

export type NasaGibsLayerId =
  | 'MODIS_Terra_CorrectedReflectance_TrueColor'
  | 'VIIRS_SNPP_CorrectedReflectance_TrueColor';

export interface NasaGibsLayerSpec {
  id: NasaGibsLayerId;
  label: string;
  satellite: string;
  resolutionNote: string;
  tileMatrixSet: 'GoogleMapsCompatible_Level9';
  format: 'jpg';
}

export const NASA_GIBS_LAYERS: NasaGibsLayerSpec[] = [
  {
    id: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    label: 'Terra MODIS True Color (250 m)',
    satellite: 'NASA Terra',
    resolutionNote: '250 m / day global optical reflectance (shows flood basin cloud decks)',
    tileMatrixSet: 'GoogleMapsCompatible_Level9',
    format: 'jpg',
  },
  {
    id: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    label: 'Suomi-NPP VIIRS True Color (375 m)',
    satellite: 'NASA/NOAA Suomi-NPP',
    resolutionNote: '375 m / day corrected reflectance optical swath',
    tileMatrixSet: 'GoogleMapsCompatible_Level9',
    format: 'jpg',
  },
];

export interface WebMercatorTileCoord {
  z: number;
  x: number;
  y: number;
}

/**
 * Converts geodetic latitude/longitude (deg) and zoom z into OGC GoogleMapsCompatible
 * Web Mercator slippy tile coordinates (x, y, z).
 */
export function latLonToWebMercatorTile(
  latitudeDeg: number,
  longitudeDeg: number,
  zoom: number,
  maxZoom = 9
): WebMercatorTileCoord {
  const z = Math.max(0, Math.min(maxZoom, Math.floor(zoom)));
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, latitudeDeg));
  const latRad = (clampedLat * Math.PI) / 180;
  const n = Math.pow(2, z);
  const x = Math.max(0, Math.min(n - 1, Math.floor(((longitudeDeg + 180) / 360) * n)));
  const y = Math.max(
    0,
    Math.min(
      n - 1,
      Math.floor(
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
      )
    )
  );
  return { z, x, y };
}

/**
 * Builds an official NASA GIBS EPSG:3857 WMTS REST tile URL.
 */
export function buildNasaGibsWmtsTileUrl(params: {
  layerId: NasaGibsLayerId;
  dateIso: string; // YYYY-MM-DD
  latitudeDeg: number;
  longitudeDeg: number;
  zoom?: number;
}): {
  url: string;
  tile: WebMercatorTileCoord;
} {
  const { layerId, dateIso, latitudeDeg, longitudeDeg, zoom = 6 } = params;
  const spec = NASA_GIBS_LAYERS.find((l) => l.id === layerId) ?? NASA_GIBS_LAYERS[0];
  const tile = latLonToWebMercatorTile(latitudeDeg, longitudeDeg, zoom);
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? dateIso : '2024-08-22';

  const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${spec.id}/default/${safeDate}/${spec.tileMatrixSet}/${tile.z}/${tile.y}/${tile.x}.${spec.format}`;
  return { url, tile };
}

/**
 * Non-blocking connectivity check for NASA GIBS imagery endpoint.
 * Never throws; returns explicit live vs offline-fallback status.
 */
export async function probeNasaGibsTile(
  url: string,
  timeoutMs = 3500
): Promise<{ available: boolean; status: 'LIVE' | 'UNAVAILABLE'; detail: string }> {
  if (typeof fetch !== 'function') {
    return { available: false, status: 'UNAVAILABLE', detail: 'Fetch API unavailable' };
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const resp = await fetch(url, {
      method: 'HEAD',
      signal: controller?.signal,
    });
    if (resp.ok) {
      return {
        available: true,
        status: 'LIVE',
        detail: `HTTP ${resp.status} OK from gibs.earthdata.nasa.gov`,
      };
    }
    return {
      available: false,
      status: 'UNAVAILABLE',
      detail: `NASA GIBS responded HTTP ${resp.status}; cached baseline context active`,
    };
  } catch {
    return {
      available: false,
      status: 'UNAVAILABLE',
      detail: 'External NASA GIBS network unreachable; offline hydrology fallback active',
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

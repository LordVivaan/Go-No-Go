import type { CelestialBodyId } from '../types/mission';

export type CelestialMaterialMode = 'image' | 'procedural';

export interface CelestialTextureConfig {
  body: CelestialBodyId;
  materialMode: CelestialMaterialMode;
  textureUrl: string | null;
  fallbackColor: string;
  bumpScale: number;
  roughness: number;
  hasAtmosphere: boolean;
  hasClouds: boolean;
  useDerivedEarthPbr: boolean;
}

export const CELESTIAL_TEXTURE_MANIFEST: Record<CelestialBodyId, CelestialTextureConfig> = {
  EARTH: {
    body: 'EARTH',
    materialMode: 'image',
    textureUrl: '/textures/EarthImage.jpg',
    fallbackColor: '#1b4f8c',
    bumpScale: 0.015,
    roughness: 0.84,
    hasAtmosphere: true,
    hasClouds: true,
    useDerivedEarthPbr: true,
  },
  MOON: {
    body: 'MOON',
    materialMode: 'image',
    textureUrl: '/textures/Moon_Flat.jpg',
    fallbackColor: '#8d949e',
    bumpScale: 0.02,
    roughness: 0.94,
    hasAtmosphere: false,
    hasClouds: false,
    useDerivedEarthPbr: false,
  },
  MARS: {
    body: 'MARS',
    materialMode: 'procedural',
    textureUrl: null,
    fallbackColor: '#c45937',
    bumpScale: 0.028,
    roughness: 0.92,
    hasAtmosphere: false,
    hasClouds: false,
    useDerivedEarthPbr: false,
  },
  ASTEROID: {
    body: 'ASTEROID',
    materialMode: 'procedural',
    textureUrl: null,
    fallbackColor: '#6c6860',
    bumpScale: 0.045,
    roughness: 0.95,
    hasAtmosphere: false,
    hasClouds: false,
    useDerivedEarthPbr: false,
  },
};

export function getCelestialTextureConfig(body: CelestialBodyId): CelestialTextureConfig {
  return CELESTIAL_TEXTURE_MANIFEST[body];
}

export function getAllCelestialTextureConfigs(): CelestialTextureConfig[] {
  return Object.values(CELESTIAL_TEXTURE_MANIFEST);
}

export function validateTextureManifest(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const seenUrls = new Map<string, CelestialBodyId>();

  for (const config of getAllCelestialTextureConfigs()) {
    if (config.materialMode === 'image') {
      if (!config.textureUrl) {
        errors.push(`${config.body} is configured as 'image' mode but has no textureUrl.`);
        continue;
      }
      if (!config.textureUrl.startsWith('/textures/')) {
        errors.push(
          `${config.body} textureUrl "${config.textureUrl}" must be a root-relative /textures/ path.`
        );
      }
      const existingOwner = seenUrls.get(config.textureUrl);
      if (existingOwner && existingOwner !== config.body) {
        errors.push(
          `${config.body} reuses textureUrl "${config.textureUrl}" already assigned to ${existingOwner}.`
        );
      }
      seenUrls.set(config.textureUrl, config.body);
    } else if (config.textureUrl !== null) {
      errors.push(`${config.body} is 'procedural' mode and should not specify a textureUrl.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

import type { CelestialBodyId } from '../types/mission';

export interface CelestialTextureConfig {
  body: CelestialBodyId;
  textureUrl: string | null;
  fallbackColor: string;
  bumpScale: number;
  hasAtmosphere: boolean;
  hasClouds: boolean;
  useDerivedEarthPbr: boolean;
}

export const CELESTIAL_TEXTURE_MANIFEST: Record<CelestialBodyId, CelestialTextureConfig> = {
  EARTH: {
    body: 'EARTH',
    textureUrl: '/textures/EarthImage.jpg',
    fallbackColor: '#1b4f8c',
    bumpScale: 0.015,
    hasAtmosphere: true,
    hasClouds: true,
    useDerivedEarthPbr: true,
  },
  MOON: {
    body: 'MOON',
    textureUrl: '/textures/Moon_Flat.jpg',
    fallbackColor: '#8d949e',
    bumpScale: 0.02,
    hasAtmosphere: false,
    hasClouds: false,
    useDerivedEarthPbr: false,
  },
  MARS: {
    body: 'MARS',
    textureUrl: null,
    fallbackColor: '#c45937',
    bumpScale: 0,
    hasAtmosphere: false,
    hasClouds: false,
    useDerivedEarthPbr: false,
  },
  ASTEROID: {
    body: 'ASTEROID',
    textureUrl: null,
    fallbackColor: '#6c6860',
    bumpScale: 0,
    hasAtmosphere: false,
    hasClouds: false,
    useDerivedEarthPbr: false,
  },
};

export function getCelestialTextureConfig(body: CelestialBodyId): CelestialTextureConfig {
  return CELESTIAL_TEXTURE_MANIFEST[body];
}

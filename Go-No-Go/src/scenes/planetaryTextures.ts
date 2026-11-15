import * as THREE from 'three';
import type { CelestialBodyId } from '../types/mission';
import { getAllCelestialTextureConfigs, getCelestialTextureConfig } from './textureManifest';

export interface DerivedPlanetMaps {
  colorMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

export type TextureLoadStatus = 'idle' | 'loading' | 'loaded' | 'procedural' | 'fallback-error';

export interface PlanetaryTextureDiagnostic {
  body: CelestialBodyId;
  materialMode: 'image' | 'procedural';
  textureUrl: string | null;
  status: TextureLoadStatus;
  cached: boolean;
  errorMessage?: string;
}

export interface TextureLoaderLike {
  load: (
    url: string,
    onLoad?: (tex: THREE.Texture<HTMLImageElement>) => void,
    onProgress?: (event: ProgressEvent<EventTarget>) => void,
    onError?: (err: unknown) => void
  ) => void;
}

const rawTextureCache = new Map<string, THREE.Texture>();
const inFlightLoads = new Map<string, Promise<THREE.Texture>>();
const textureErrorCache = new Map<string, string>();
const bodyStatusMap = new Map<CelestialBodyId, TextureLoadStatus>();

let cachedEarthDerivedMaps: DerivedPlanetMaps | null = null;
let cachedProceduralCloudTexture: THREE.CanvasTexture | null = null;
let cachedMarsMaps: DerivedPlanetMaps | null = null;
let cachedAsteroidMaps: DerivedPlanetMaps | null = null;

function periodicHash(ix: number, iy: number, px: number, seedOffset = 0): number {
  const wx = ((ix % px) + px) % px;
  const n = Math.sin(wx * 127.1 + iy * 311.7 + seedOffset) * 43758.5453123;
  return n - Math.floor(n);
}

function periodicNoise(
  u: number,
  v: number,
  freqX: number,
  freqY: number,
  seedOffset = 0
): number {
  const gx = u * freqX;
  const gy = v * freqY;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = periodicHash(x0, y0, freqX, seedOffset);
  const n10 = periodicHash(x0 + 1, y0, freqX, seedOffset);
  const n01 = periodicHash(x0, y0 + 1, freqX, seedOffset);
  const n11 = periodicHash(x0 + 1, y0 + 1, freqX, seedOffset);

  const nx0 = n00 + sx * (n10 - n00);
  const nx1 = n01 + sx * (n11 - n01);
  return nx0 + sy * (nx1 - nx0);
}

function configureCanvasTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  anisotropy = 4
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
  }
  tex.anisotropy = anisotropy;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates an enhanced equirectangular Earth texture set from the staged NASA texture:
 * - Softens baked 1px lat/long graticule lines without blurring continental coastlines
 * - Derives an ocean-vs-land roughness map (subtle solar sheen on oceans, matte land)
 * - Derives a subtle terrain relief bump map
 */
export function buildEarthDerivedMaps(image: HTMLImageElement): DerivedPlanetMaps | null {
  try {
    const srcW = image.naturalWidth || image.width || 446;
    const srcH = image.naturalHeight || image.height || 224;

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = srcW;
    srcCanvas.height = srcH;
    const sCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
    if (!sCtx) return null;
    sCtx.drawImage(image, 0, 0, srcW, srcH);

    const srcData = sCtx.getImageData(0, 0, srcW, srcH);
    const sd = srcData.data;
    const scopy = new Uint8ClampedArray(sd);

    for (let y = 2; y < srcH - 2; y++) {
      for (let x = 2; x < srcW - 2; x++) {
        const idx = (y * srcW + x) * 4;
        const lum = scopy[idx] * 0.299 + scopy[idx + 1] * 0.587 + scopy[idx + 2] * 0.114;

        const lIdx = (y * srcW + (x - 2)) * 4;
        const rIdx = (y * srcW + (x + 2)) * 4;
        const lrDiff =
          Math.abs(scopy[lIdx] - scopy[rIdx]) +
          Math.abs(scopy[lIdx + 1] - scopy[rIdx + 1]) +
          Math.abs(scopy[lIdx + 2] - scopy[rIdx + 2]);
        const lrLum =
          (scopy[lIdx] + scopy[rIdx]) * 0.5 * 0.299 +
          (scopy[lIdx + 1] + scopy[rIdx + 1]) * 0.5 * 0.587 +
          (scopy[lIdx + 2] + scopy[rIdx + 2]) * 0.5 * 0.114;

        if (lrDiff < 55 && Math.abs(lum - lrLum) > 12) {
          sd[idx] = Math.round((scopy[lIdx] + scopy[rIdx]) * 0.5);
          sd[idx + 1] = Math.round((scopy[lIdx + 1] + scopy[rIdx + 1]) * 0.5);
          sd[idx + 2] = Math.round((scopy[lIdx + 2] + scopy[rIdx + 2]) * 0.5);
          continue;
        }

        const uIdx = ((y - 2) * srcW + x) * 4;
        const bIdx = ((y + 2) * srcW + x) * 4;
        const ubDiff =
          Math.abs(scopy[uIdx] - scopy[bIdx]) +
          Math.abs(scopy[uIdx + 1] - scopy[bIdx + 1]) +
          Math.abs(scopy[uIdx + 2] - scopy[bIdx + 2]);
        const ubLum =
          (scopy[uIdx] + scopy[bIdx]) * 0.5 * 0.299 +
          (scopy[uIdx + 1] + scopy[bIdx + 1]) * 0.5 * 0.587 +
          (scopy[uIdx + 2] + scopy[bIdx + 2]) * 0.5 * 0.114;

        if (ubDiff < 55 && Math.abs(lum - ubLum) > 12) {
          sd[idx] = Math.round((scopy[uIdx] + scopy[bIdx]) * 0.5);
          sd[idx + 1] = Math.round((scopy[uIdx + 1] + scopy[bIdx + 1]) * 0.5);
          sd[idx + 2] = Math.round((scopy[uIdx + 2] + scopy[bIdx + 2]) * 0.5);
        }
      }
    }
    sCtx.putImageData(srcData, 0, 0);

    const w = 1024;
    const h = 512;

    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = w;
    colorCanvas.height = h;
    const cCtx = colorCanvas.getContext('2d', { willReadFrequently: true });
    if (!cCtx) return null;

    cCtx.imageSmoothingEnabled = true;
    cCtx.imageSmoothingQuality = 'high';
    cCtx.drawImage(srcCanvas, 0, 0, w, h);

    const imgData = cCtx.getImageData(0, 0, w, h);
    const d = imgData.data;

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = w;
    roughCanvas.height = h;
    const rCtx = roughCanvas.getContext('2d');
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = w;
    bumpCanvas.height = h;
    const bCtx = bumpCanvas.getContext('2d');
    if (!rCtx || !bCtx) return null;

    const rData = rCtx.createImageData(w, h);
    const bData = bCtx.createImageData(w, h);

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const isOcean = b > r * 1.12 && b >= g * 0.94 && b > 64;
      const lum = Math.round(r * 0.299 + g * 0.587 + b * 0.114);

      const roughVal = isOcean ? 162 : 226;
      rData.data[i] = roughVal;
      rData.data[i + 1] = roughVal;
      rData.data[i + 2] = roughVal;
      rData.data[i + 3] = 255;

      const bumpVal = isOcean ? 36 : Math.min(255, 86 + Math.round(lum * 0.52));
      bData.data[i] = bumpVal;
      bData.data[i + 1] = bumpVal;
      bData.data[i + 2] = bumpVal;
      bData.data[i + 3] = 255;
    }

    rCtx.putImageData(rData, 0, 0);
    bCtx.putImageData(bData, 0, 0);

    return {
      colorMap: configureCanvasTexture(colorCanvas, true, 8),
      roughnessMap: configureCanvasTexture(roughCanvas, false, 4),
      bumpMap: configureCanvasTexture(bumpCanvas, false, 4),
    };
  } catch {
    return null;
  }
}

export function getEarthDerivedMaps(image?: unknown): DerivedPlanetMaps | null {
  if (cachedEarthDerivedMaps) return cachedEarthDerivedMaps;
  if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) {
    cachedEarthDerivedMaps = buildEarthDerivedMaps(image);
  }
  return cachedEarthDerivedMaps;
}

/**
 * Generates a seamless periodic equirectangular procedural cloud layer texture
 * so monsoon cloud bands drift smoothly without antimeridian seams.
 */
export function getProceduralCloudTexture(): THREE.CanvasTexture | null {
  if (cachedProceduralCloudTexture) return cachedProceduralCloudTexture;
  try {
    const w = 512;
    const h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const img = ctx.createImageData(w, h);
    const out = img.data;

    for (let y = 0; y < h; y++) {
      const v = y / h;
      const lat = (v - 0.5) * Math.PI;
      const beltBoost =
        0.08 * Math.cos(lat * 2.5) +
        0.06 * Math.exp(-Math.pow((Math.abs(lat) - 0.78) / 0.35, 2));

      for (let x = 0; x < w; x++) {
        const u = x / w;
        const shearU = (u + Math.sin(lat * 2.0) * 0.05 + 1.0) % 1.0;

        const fbm =
          0.52 * periodicNoise(shearU, v, 8, 4) +
          0.28 * periodicNoise(u, v, 16, 8) +
          0.14 * periodicNoise(shearU, v, 32, 16) +
          0.06 * periodicNoise(u, v, 64, 32);

        const density = Math.max(0, Math.min(1, (fbm + beltBoost - 0.54) * 2.7));
        const alpha = Math.round(Math.pow(density, 1.35) * 190);
        const idx = (y * w + x) * 4;
        out[idx] = 241;
        out[idx + 1] = 245;
        out[idx + 2] = 250;
        out[idx + 3] = alpha;
      }
    }

    ctx.putImageData(img, 0, 0);
    cachedProceduralCloudTexture = configureCanvasTexture(canvas, true, 4);
    return cachedProceduralCloudTexture;
  } catch {
    return null;
  }
}

/**
 * Generates an intentional seamless procedural Mars texture set:
 * rust-ochre regolith highlands, dark basaltic maria, polar ice caps, and crater/canyon relief.
 */
function buildMarsProceduralMaps(): DerivedPlanetMaps | null {
  try {
    const w = 512;
    const h = 256;
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = w;
    colorCanvas.height = h;
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = w;
    bumpCanvas.height = h;
    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = w;
    roughCanvas.height = h;

    const cCtx = colorCanvas.getContext('2d');
    const bCtx = bumpCanvas.getContext('2d');
    const rCtx = roughCanvas.getContext('2d');
    if (!cCtx || !bCtx || !rCtx) return null;

    const cData = cCtx.createImageData(w, h);
    const bData = bCtx.createImageData(w, h);
    const rData = rCtx.createImageData(w, h);

    for (let y = 0; y < h; y++) {
      const v = y / h;
      const latNorm = Math.abs(v - 0.5) * 2; // 0 equator -> 1 poles
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const macro =
          0.55 * periodicNoise(u, v, 4, 2, 11.3) +
          0.3 * periodicNoise(u, v, 8, 4, 23.7) +
          0.15 * periodicNoise(u, v, 16, 8, 41.1);
        const detail =
          0.6 * periodicNoise(u, v, 24, 12, 7.9) + 0.4 * periodicNoise(u, v, 48, 24, 19.4);
        const canyon = Math.exp(-Math.pow((v - 0.52) / 0.045, 2)) *
          Math.exp(-Math.pow((u - 0.48) / 0.14, 2));

        // Polar CO2 / water ice cap blend
        const polarThreshold = 0.87 + (detail - 0.5) * 0.07;
        const isPolarCap = latNorm > polarThreshold;

        let r: number;
        let g: number;
        let b: number;
        let bumpVal: number;
        let roughVal: number;

        if (isPolarCap) {
          const iceShade = 222 + Math.round(detail * 24);
          r = iceShade;
          g = iceShade - 4;
          b = iceShade - 8;
          bumpVal = 170;
          roughVal = 205;
        } else {
          // Basaltic dark maria vs bright dusty highlands
          const mariaFactor = Math.max(0, Math.min(1, (0.48 - macro) * 3.1));
          const dustFactor = Math.max(0, Math.min(1, (macro - 0.52) * 2.6));
          r = Math.round(196 - mariaFactor * 74 + dustFactor * 26 + (detail - 0.5) * 22 - canyon * 48);
          g = Math.round(94 - mariaFactor * 40 + dustFactor * 24 + (detail - 0.5) * 16 - canyon * 26);
          b = Math.round(58 - mariaFactor * 22 + dustFactor * 14 + (detail - 0.5) * 10 - canyon * 18);
          bumpVal = Math.max(
            0,
            Math.min(255, Math.round(115 + (macro - 0.5) * 85 + (detail - 0.5) * 70 - canyon * 90))
          );
          roughVal = Math.round(224 + (detail - 0.5) * 22);
        }

        const idx = (y * w + x) * 4;
        cData.data[idx] = Math.max(0, Math.min(255, r));
        cData.data[idx + 1] = Math.max(0, Math.min(255, g));
        cData.data[idx + 2] = Math.max(0, Math.min(255, b));
        cData.data[idx + 3] = 255;

        bData.data[idx] = bumpVal;
        bData.data[idx + 1] = bumpVal;
        bData.data[idx + 2] = bumpVal;
        bData.data[idx + 3] = 255;

        rData.data[idx] = roughVal;
        rData.data[idx + 1] = roughVal;
        rData.data[idx + 2] = roughVal;
        rData.data[idx + 3] = 255;
      }
    }

    cCtx.putImageData(cData, 0, 0);
    bCtx.putImageData(bData, 0, 0);
    rCtx.putImageData(rData, 0, 0);

    return {
      colorMap: configureCanvasTexture(colorCanvas, true, 4),
      bumpMap: configureCanvasTexture(bumpCanvas, false, 4),
      roughnessMap: configureCanvasTexture(roughCanvas, false, 4),
    };
  } catch {
    return null;
  }
}

/**
 * Generates an intentional seamless procedural Asteroid regolith texture set:
 * carbonaceous/silicate mottling with high-relief cratered surface.
 */
function buildAsteroidProceduralMaps(): DerivedPlanetMaps | null {
  try {
    const w = 256;
    const h = 128;
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = w;
    colorCanvas.height = h;
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = w;
    bumpCanvas.height = h;
    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = w;
    roughCanvas.height = h;

    const cCtx = colorCanvas.getContext('2d');
    const bCtx = bumpCanvas.getContext('2d');
    const rCtx = roughCanvas.getContext('2d');
    if (!cCtx || !bCtx || !rCtx) return null;

    const cData = cCtx.createImageData(w, h);
    const bData = bCtx.createImageData(w, h);
    const rData = rCtx.createImageData(w, h);

    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const regolith =
          0.5 * periodicNoise(u, v, 6, 3, 55.2) +
          0.32 * periodicNoise(u, v, 14, 7, 71.8) +
          0.18 * periodicNoise(u, v, 28, 14, 93.4);
        const craterPits = periodicNoise(u, v, 20, 10, 109.1);
        const pitDepression = craterPits < 0.24 ? (0.24 - craterPits) * 2.4 : 0;

        const lum = Math.round(98 + (regolith - 0.5) * 52 - pitDepression * 34);
        const r = Math.max(35, Math.min(185, lum + 6));
        const g = Math.max(33, Math.min(180, lum + 2));
        const b = Math.max(30, Math.min(172, lum - 5));

        const bumpVal = Math.max(
          0,
          Math.min(255, Math.round(128 + (regolith - 0.5) * 130 - pitDepression * 110))
        );
        const roughVal = Math.round(234 + (regolith - 0.5) * 18);

        const idx = (y * w + x) * 4;
        cData.data[idx] = r;
        cData.data[idx + 1] = g;
        cData.data[idx + 2] = b;
        cData.data[idx + 3] = 255;

        bData.data[idx] = bumpVal;
        bData.data[idx + 1] = bumpVal;
        bData.data[idx + 2] = bumpVal;
        bData.data[idx + 3] = 255;

        rData.data[idx] = roughVal;
        rData.data[idx + 1] = roughVal;
        rData.data[idx + 2] = roughVal;
        rData.data[idx + 3] = 255;
      }
    }

    cCtx.putImageData(cData, 0, 0);
    bCtx.putImageData(bData, 0, 0);
    rCtx.putImageData(rData, 0, 0);

    return {
      colorMap: configureCanvasTexture(colorCanvas, true, 4),
      bumpMap: configureCanvasTexture(bumpCanvas, false, 4),
      roughnessMap: configureCanvasTexture(roughCanvas, false, 4),
    };
  } catch {
    return null;
  }
}

export function getProceduralPlanetMaps(body: CelestialBodyId): DerivedPlanetMaps | null {
  if (body === 'MARS') {
    if (!cachedMarsMaps) cachedMarsMaps = buildMarsProceduralMaps();
    return cachedMarsMaps;
  }
  if (body === 'ASTEROID') {
    if (!cachedAsteroidMaps) cachedAsteroidMaps = buildAsteroidProceduralMaps();
    return cachedAsteroidMaps;
  }
  return null;
}

export function getCachedTexture(url: string): THREE.Texture | null {
  return rawTextureCache.get(url) ?? null;
}

export function loadTextureByUrl(
  url: string,
  loaderOverride?: TextureLoaderLike
): Promise<THREE.Texture> {
  const cached = rawTextureCache.get(url);
  if (cached) {
    return Promise.resolve(cached);
  }

  const existingInFlight = inFlightLoads.get(url);
  if (existingInFlight) {
    return existingInFlight;
  }

  const promise = new Promise<THREE.Texture>((resolve, reject) => {
    const loader: TextureLoaderLike = loaderOverride ?? new THREE.TextureLoader();
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        rawTextureCache.set(url, tex);
        textureErrorCache.delete(url);
        inFlightLoads.delete(url);
        resolve(tex);
      },
      undefined,
      (err) => {
        const message =
          err instanceof Error ? err.message : `Failed to load planetary texture: ${url}`;
        textureErrorCache.set(url, message);
        inFlightLoads.delete(url);
        if (import.meta.env?.DEV) {
          console.warn(`[PlanetaryTextures] ${message}`);
        }
        reject(new Error(message));
      }
    );
  });

  inFlightLoads.set(url, promise);
  return promise;
}

export function setBodyTextureStatus(body: CelestialBodyId, status: TextureLoadStatus): void {
  bodyStatusMap.set(body, status);
}

export function getPlanetaryTextureDiagnostics(): PlanetaryTextureDiagnostic[] {
  return getAllCelestialTextureConfigs().map((cfg) => {
    const cached = cfg.textureUrl ? rawTextureCache.has(cfg.textureUrl) : false;
    const errorMessage = cfg.textureUrl ? textureErrorCache.get(cfg.textureUrl) : undefined;
    const recordedStatus = bodyStatusMap.get(cfg.body);
    const status: TextureLoadStatus =
      recordedStatus ??
      (cfg.materialMode === 'procedural'
        ? 'procedural'
        : cached
          ? 'loaded'
          : errorMessage
            ? 'fallback-error'
            : 'idle');

    return {
      body: cfg.body,
      materialMode: cfg.materialMode,
      textureUrl: cfg.textureUrl,
      status,
      cached,
      ...(errorMessage ? { errorMessage } : {}),
    };
  });
}

export function getBodyTextureSummary(body: CelestialBodyId): {
  textureUrl: string | null;
  status: TextureLoadStatus;
} {
  const cfg = getCelestialTextureConfig(body);
  const status =
    bodyStatusMap.get(body) ??
    (cfg.materialMode === 'procedural'
      ? 'procedural'
      : cfg.textureUrl && rawTextureCache.has(cfg.textureUrl)
        ? 'loaded'
        : cfg.textureUrl && textureErrorCache.has(cfg.textureUrl)
          ? 'fallback-error'
          : 'idle');
  return { textureUrl: cfg.textureUrl, status };
}

export function clearPlanetaryTextureCachesForTest(): void {
  rawTextureCache.clear();
  inFlightLoads.clear();
  textureErrorCache.clear();
  bodyStatusMap.clear();
  cachedEarthDerivedMaps = null;
  cachedProceduralCloudTexture = null;
  cachedMarsMaps = null;
  cachedAsteroidMaps = null;
}

import { render, screen, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPlanetaryTextureCachesForTest,
  getCachedTexture,
  getPlanetaryTextureDiagnostics,
  getProceduralPlanetMaps,
  loadTextureByUrl,
  type TextureLoaderLike,
} from '../../src/scenes/planetaryTextures';
import {
  getCelestialTextureConfig,
  validateTextureManifest,
} from '../../src/scenes/textureManifest';
import { ORBIT_CATALOG } from '../../src/data/orbits';
import { EarthScene } from '../../src/scenes/EarthScene';

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="mock-r3f-canvas">{children}</div>
  ),
  useFrame: () => {},
  useThree: () => ({
    camera: { position: { set: vi.fn() }, lookAt: vi.fn() },
    size: { width: 1280, height: 720 },
  }),
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Stars: () => null,
  Line: () => null,
}));

vi.mock('../../src/scenes/WebGLFallback', () => ({
  SceneCanvasGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../src/scenes/OrbitPath', () => ({
  OrbitPath: () => null,
}));

describe('Planetary Texture Manifest, Caching & Mission Switching', () => {
  beforeEach(() => {
    clearPlanetaryTextureCachesForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearPlanetaryTextureCachesForTest();
  });

  it('selects valid root-relative asset URLs for Earth & Moon and intentional procedural modes for Mars & Asteroid', () => {
    const validation = validateTextureManifest();
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);

    const earth = getCelestialTextureConfig('EARTH');
    const moon = getCelestialTextureConfig('MOON');
    const mars = getCelestialTextureConfig('MARS');
    const asteroid = getCelestialTextureConfig('ASTEROID');

    expect(earth.textureUrl).toBe('/textures/EarthImage.jpg');
    expect(moon.textureUrl).toBe('/textures/Moon_Flat.jpg');
    expect(mars.textureUrl).toBeNull();
    expect(mars.materialMode).toBe('procedural');
    expect(asteroid.textureUrl).toBeNull();
    expect(asteroid.materialMode).toBe('procedural');
  });

  it('caches loaded textures by URL without cross-contaminating Earth and Moon', async () => {
    const loader: TextureLoaderLike = {
      load: (url, onLoad) => {
        const tex = new THREE.Texture() as THREE.Texture<HTMLImageElement>;
        tex.name = url;
        queueMicrotask(() => onLoad?.(tex));
      },
    };

    const earthTex = await loadTextureByUrl('/textures/EarthImage.jpg', loader);
    const moonTex = await loadTextureByUrl('/textures/Moon_Flat.jpg', loader);

    expect(earthTex.name).toBe('/textures/EarthImage.jpg');
    expect(moonTex.name).toBe('/textures/Moon_Flat.jpg');
    expect(getCachedTexture('/textures/EarthImage.jpg')).toBe(earthTex);
    expect(getCachedTexture('/textures/Moon_Flat.jpg')).toBe(moonTex);
    expect(getCachedTexture('/textures/EarthImage.jpg')).not.toBe(
      getCachedTexture('/textures/Moon_Flat.jpg')
    );
  });

  it('records missing texture fallback diagnostics without substituting another planet texture', async () => {
    const failingLoader: TextureLoaderLike = {
      load: (_url, _onLoad, _onProgress, onError) => {
        queueMicrotask(() => onError?.(new Error('404 Not Found')));
      },
    };

    await expect(loadTextureByUrl('/textures/Moon_Flat.jpg', failingLoader)).rejects.toThrow(
      /404 Not Found/
    );

    expect(getCachedTexture('/textures/Moon_Flat.jpg')).toBeNull();
    const diag = getPlanetaryTextureDiagnostics().find((d) => d.body === 'MOON');
    expect(diag?.status).toBe('fallback-error');
    expect(diag?.errorMessage).toContain('404 Not Found');
  });

  it('handles Earth -> Moon -> Mars -> Asteroid -> Earth -> Moon switching cleanly without stale textures', async () => {
    const loadedUrls: string[] = [];
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function (
      this: THREE.TextureLoader,
      url: string,
      onLoad?: (tex: THREE.Texture<HTMLImageElement>) => void
    ) {
      loadedUrls.push(url);
      const tex = new THREE.Texture() as THREE.Texture<HTMLImageElement>;
      tex.name = url;
      queueMicrotask(() => onLoad?.(tex));
      return tex;
    });

    const earthOrbit = ORBIT_CATALOG.find((o) => o.celestialBody === 'EARTH')!;
    const moonOrbit = ORBIT_CATALOG.find((o) => o.celestialBody === 'MOON')!;
    const marsOrbit = ORBIT_CATALOG.find((o) => o.celestialBody === 'MARS')!;
    const asteroidOrbit = ORBIT_CATALOG.find((o) => o.celestialBody === 'ASTEROID')!;

    // 1. Start on Earth
    const { rerender, unmount } = render(
      <EarthScene celestialBody="EARTH" orbit={earthOrbit} periodSeconds={5400} />
    );
    await waitFor(() => {
      const el = screen.getByTestId('earth-scene');
      expect(el.getAttribute('data-primary-body')).toBe('EARTH');
      expect(el.getAttribute('data-texture-url')).toBe('/textures/EarthImage.jpg');
      expect(el.getAttribute('data-texture-status')).toBe('loaded');
    });

    // 2. Earth -> Moon
    rerender(<EarthScene celestialBody="MOON" orbit={moonOrbit} periodSeconds={7000} />);
    await waitFor(() => {
      const el = screen.getByTestId('earth-scene');
      expect(el.getAttribute('data-primary-body')).toBe('MOON');
      expect(el.getAttribute('data-texture-url')).toBe('/textures/Moon_Flat.jpg');
      expect(el.getAttribute('data-texture-status')).toBe('loaded');
    });

    // 3. Earth/Moon -> Mars (procedural)
    rerender(<EarthScene celestialBody="MARS" orbit={marsOrbit} periodSeconds={7200} />);
    await waitFor(() => {
      const el = screen.getByTestId('earth-scene');
      expect(el.getAttribute('data-primary-body')).toBe('MARS');
      expect(el.getAttribute('data-texture-url')).toBe('procedural');
      expect(el.getAttribute('data-texture-status')).toBe('procedural');
    });

    // 4. Mars -> Asteroid (procedural)
    rerender(<EarthScene celestialBody="ASTEROID" orbit={asteroidOrbit} periodSeconds={14400} />);
    await waitFor(() => {
      const el = screen.getByTestId('earth-scene');
      expect(el.getAttribute('data-primary-body')).toBe('ASTEROID');
      expect(el.getAttribute('data-texture-url')).toBe('procedural');
      expect(el.getAttribute('data-texture-status')).toBe('procedural');
    });

    // 5. Repeated switch back to Earth -> Moon (served from cache without duplicate loads)
    rerender(<EarthScene celestialBody="EARTH" orbit={earthOrbit} periodSeconds={5400} />);
    await waitFor(() => {
      expect(screen.getByTestId('earth-scene').getAttribute('data-texture-status')).toBe('loaded');
    });
    rerender(<EarthScene celestialBody="MOON" orbit={moonOrbit} periodSeconds={7000} />);
    await waitFor(() => {
      const el = screen.getByTestId('earth-scene');
      expect(el.getAttribute('data-texture-url')).toBe('/textures/Moon_Flat.jpg');
      expect(el.getAttribute('data-texture-status')).toBe('loaded');
    });

    // Verify each image URL was only requested once despite repeated switching
    expect(loadedUrls.filter((u) => u === '/textures/EarthImage.jpg').length).toBe(1);
    expect(loadedUrls.filter((u) => u === '/textures/Moon_Flat.jpg').length).toBe(1);

    // Unmount cleanly
    unmount();
  });

  it('handles missing texture load failure inside EarthScene without throwing', async () => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function (
      this: THREE.TextureLoader,
      _url: string,
      _onLoad?: (tex: THREE.Texture<HTMLImageElement>) => void,
      _onProgress?: (event: ProgressEvent<EventTarget>) => void,
      onError?: (err: unknown) => void
    ) {
      queueMicrotask(() => onError?.(new Error('Network error')));
      return new THREE.Texture() as THREE.Texture<HTMLImageElement>;
    });

    const moonOrbit = ORBIT_CATALOG.find((o) => o.celestialBody === 'MOON')!;
    render(<EarthScene celestialBody="MOON" orbit={moonOrbit} periodSeconds={7000} />);

    await waitFor(() => {
      const el = screen.getByTestId('earth-scene');
      expect(el.getAttribute('data-primary-body')).toBe('MOON');
      expect(el.getAttribute('data-texture-status')).toBe('fallback-error');
    });
  });

  it('returns null procedural maps for Earth/Moon (never substitutes)', () => {
    expect(getProceduralPlanetMaps('EARTH')).toBeNull();
    expect(getProceduralPlanetMaps('MOON')).toBeNull();
  });
});

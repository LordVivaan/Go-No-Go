import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GROUND_STATIONS } from '../data/groundStations';
import { OMEGA_EARTH_RAD_S } from '../engine/constants';
import type { CelestialBodyId, TargetRegion } from '../types/mission';
import type { OrbitalParameters } from '../types/spacecraft';
import { OrbitPath } from './OrbitPath';
import { SceneCanvasGuard } from './WebGLFallback';
import { usePrefersReducedMotion } from './webglUtils';

type EarthCameraPreset = 'OVERVIEW' | 'POLAR' | 'EQUATORIAL';

interface DerivedEarthMaps {
  colorMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

const rawTextureCache = new Map<string, THREE.Texture>();
let cachedEarthDerivedMaps: DerivedEarthMaps | null = null;
let cachedProceduralCloudTexture: THREE.CanvasTexture | null = null;

function getProceduralCloudTexture(): THREE.CanvasTexture | null {
  const tex = cachedProceduralCloudTexture ?? buildProceduralCloudTexture();
  cachedProceduralCloudTexture = tex;
  return tex;
}

/**
 * Generates an enhanced equirectangular Earth texture set from the staged NASA texture:
 * - Softens baked 1px lat/long graticule lines without blurring continental coastlines
 * - Derives an ocean-vs-land roughness map (subtle solar sheen on oceans, matte land)
 * - Derives a subtle terrain relief bump map
 */
function buildEarthDerivedMaps(image: HTMLImageElement): DerivedEarthMaps | null {
  try {
    const srcW = image.naturalWidth || image.width || 446;
    const srcH = image.naturalHeight || image.height || 224;

    // Step 1: Heal 1px baked lat/long graticule lines at native source resolution before upscaling
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

        // Vertical grid check (compare left-2 vs right-2)
        const lIdx = (y * srcW + (x - 2)) * 4;
        const rIdx = (y * srcW + (x + 2)) * 4;
        const lrDiff =
          Math.abs(scopy[lIdx] - scopy[rIdx]) +
          Math.abs(scopy[lIdx + 1] - scopy[rIdx + 1]) +
          Math.abs(scopy[lIdx + 2] - scopy[rIdx + 2]);
        const lrLum =
          ((scopy[lIdx] + scopy[rIdx]) * 0.5) * 0.299 +
          ((scopy[lIdx + 1] + scopy[rIdx + 1]) * 0.5) * 0.587 +
          ((scopy[lIdx + 2] + scopy[rIdx + 2]) * 0.5) * 0.114;

        if (lrDiff < 55 && Math.abs(lum - lrLum) > 12) {
          sd[idx] = Math.round((scopy[lIdx] + scopy[rIdx]) * 0.5);
          sd[idx + 1] = Math.round((scopy[lIdx + 1] + scopy[rIdx + 1]) * 0.5);
          sd[idx + 2] = Math.round((scopy[lIdx + 2] + scopy[rIdx + 2]) * 0.5);
          continue;
        }

        // Horizontal grid check (compare up-2 vs down-2)
        const uIdx = ((y - 2) * srcW + x) * 4;
        const bIdx = ((y + 2) * srcW + x) * 4;
        const ubDiff =
          Math.abs(scopy[uIdx] - scopy[bIdx]) +
          Math.abs(scopy[uIdx + 1] - scopy[bIdx + 1]) +
          Math.abs(scopy[uIdx + 2] - scopy[bIdx + 2]);
        const ubLum =
          ((scopy[uIdx] + scopy[bIdx]) * 0.5) * 0.299 +
          ((scopy[uIdx + 1] + scopy[bIdx + 1]) * 0.5) * 0.587 +
          ((scopy[uIdx + 2] + scopy[bIdx + 2]) * 0.5) * 0.114;

        if (ubDiff < 55 && Math.abs(lum - ubLum) > 12) {
          sd[idx] = Math.round((scopy[uIdx] + scopy[bIdx]) * 0.5);
          sd[idx + 1] = Math.round((scopy[uIdx + 1] + scopy[bIdx + 1]) * 0.5);
          sd[idx + 2] = Math.round((scopy[uIdx + 2] + scopy[bIdx + 2]) * 0.5);
        }
      }
    }
    sCtx.putImageData(srcData, 0, 0);

    // Step 2: Upscale cleaned texture onto 1024x512 color map & derive PBR maps
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

    const colorMap = new THREE.CanvasTexture(colorCanvas);
    colorMap.colorSpace = THREE.SRGBColorSpace;
    colorMap.anisotropy = 8;
    colorMap.generateMipmaps = true;
    colorMap.minFilter = THREE.LinearMipmapLinearFilter;
    colorMap.magFilter = THREE.LinearFilter;
    colorMap.wrapS = THREE.RepeatWrapping;
    colorMap.wrapT = THREE.ClampToEdgeWrapping;
    colorMap.needsUpdate = true;

    const roughnessMap = new THREE.CanvasTexture(roughCanvas);
    roughnessMap.anisotropy = 4;
    roughnessMap.wrapS = THREE.RepeatWrapping;
    roughnessMap.wrapT = THREE.ClampToEdgeWrapping;
    roughnessMap.needsUpdate = true;

    const bumpMap = new THREE.CanvasTexture(bumpCanvas);
    bumpMap.anisotropy = 4;
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.ClampToEdgeWrapping;
    bumpMap.needsUpdate = true;

    return { colorMap, roughnessMap, bumpMap };
  } catch {
    return null;
  }
}

/**
 * Generates a seamless periodic equirectangular procedural cloud layer texture
 * so monsoon cloud bands drift smoothly without antimeridian seams.
 */
function buildProceduralCloudTexture(): THREE.CanvasTexture | null {
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

    // Periodic hash on integer torus lattice
    const hash = (ix: number, iy: number, px: number) => {
      const wx = ((ix % px) + px) % px;
      const n = Math.sin(wx * 127.1 + iy * 311.7) * 43758.5453123;
      return n - Math.floor(n);
    };

    const periodicNoise = (u: number, v: number, freqX: number, freqY: number) => {
      const gx = u * freqX;
      const gy = v * freqY;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const fx = gx - x0;
      const fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);

      const n00 = hash(x0, y0, freqX);
      const n10 = hash(x0 + 1, y0, freqX);
      const n01 = hash(x0, y0 + 1, freqX);
      const n11 = hash(x0 + 1, y0 + 1, freqX);

      const nx0 = n00 + sx * (n10 - n00);
      const nx1 = n01 + sx * (n11 - n01);
      return nx0 + sy * (nx1 - nx0);
    };

    for (let y = 0; y < h; y++) {
      const v = y / h;
      const lat = (v - 0.5) * Math.PI;
      // Modulate cloud density along mid-latitude storm belts and ITCZ
      const beltBoost =
        0.08 * Math.cos(lat * 2.5) + 0.06 * Math.exp(-Math.pow((Math.abs(lat) - 0.78) / 0.35, 2));

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
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  } catch {
    return null;
  }
}

function latLonToVector3(
  latDeg: number,
  lonDeg: number,
  radius = 1.008
): [number, number, number] {
  const phi = (90 - latDeg) * (Math.PI / 180);
  const theta = (lonDeg + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return [x, y, z];
}

const SUN_DIRECTION = new THREE.Vector3(6, 2.5, 4.5).normalize();

/**
 * Custom Fresnel atmospheric limb shader for realistic Rayleigh edge glow
 * modulated by solar illumination so the nightside fades smoothly into space.
 */
function EarthAtmosphereLimb() {
  const outerUniforms = useMemo(
    () => ({
      uSunDir: { value: SUN_DIRECTION.clone() },
      uColor: { value: new THREE.Color('#42D9F5') },
    }),
    []
  );

  const innerUniforms = useMemo(
    () => ({
      uSunDir: { value: SUN_DIRECTION.clone() },
      uColor: { value: new THREE.Color('#64B5F6') },
    }),
    []
  );

  return (
    <group>
      {/* Subtle front-hemisphere horizon scattering */}
      <mesh>
        <sphereGeometry args={[1.006, 64, 64]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={innerUniforms}
          vertexShader={`
            varying vec3 vWorldNormal;
            varying vec3 vViewDir;
            void main() {
              vec4 worldPos = modelMatrix * vec4(position, 1.0);
              vWorldNormal = normalize(mat3(modelMatrix) * normal);
              vViewDir = normalize(cameraPosition - worldPos.xyz);
              gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
          `}
          fragmentShader={`
            uniform vec3 uSunDir;
            uniform vec3 uColor;
            varying vec3 vWorldNormal;
            varying vec3 vViewDir;
            void main() {
              float ndotv = clamp(dot(normalize(vWorldNormal), normalize(vViewDir)), 0.0, 1.0);
              float fresnel = pow(1.0 - ndotv, 4.2);
              float sunMask = smoothstep(-0.35, 0.55, dot(normalize(vWorldNormal), uSunDir));
              float alpha = fresnel * (0.12 + 0.34 * sunMask);
              gl_FragColor = vec4(uColor, alpha);
            }
          `}
        />
      </mesh>

      {/* Outer atmospheric limb halo */}
      <mesh>
        <sphereGeometry args={[1.05, 64, 64]} />
        <shaderMaterial
          side={THREE.BackSide}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={outerUniforms}
          vertexShader={`
            varying vec3 vWorldNormal;
            varying vec3 vViewDir;
            void main() {
              vec4 worldPos = modelMatrix * vec4(position, 1.0);
              vWorldNormal = normalize(mat3(modelMatrix) * normal);
              vViewDir = normalize(cameraPosition - worldPos.xyz);
              gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
          `}
          fragmentShader={`
            uniform vec3 uSunDir;
            uniform vec3 uColor;
            varying vec3 vWorldNormal;
            varying vec3 vViewDir;
            void main() {
              float ndotv = dot(normalize(vWorldNormal), normalize(vViewDir));
              float rim = pow(clamp(-ndotv / 0.32, 0.0, 1.0), 2.4);
              float sunMask = smoothstep(-0.3, 0.6, dot(normalize(vWorldNormal), uSunDir));
              float alpha = rim * (0.08 + 0.28 * sunMask);
              gl_FragColor = vec4(uColor, alpha);
            }
          `}
        />
      </mesh>
    </group>
  );
}

/**
 * Distant Moon rendered in cislunar composition using Moon_Flat.jpg
 * with R1-safe material keying and automatic viewport-aware framing.
 */
function DistantMoon({
  ambientMode,
  prefersReducedMotion,
}: {
  ambientMode: boolean;
  prefersReducedMotion: boolean;
}) {
  const { size } = useThree();
  const isPortrait = size.height > size.width;
  const moonRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const [moonTexture, setMoonTexture] = useState<THREE.Texture | null>(
    () => rawTextureCache.get('/textures/Moon_Flat.jpg') ?? null
  );

  useEffect(() => {
    const cached = rawTextureCache.get('/textures/Moon_Flat.jpg');
    if (cached) {
      return;
    }

    let cancelled = false;
    const loader = new THREE.TextureLoader();

    loader.load(
      '/textures/Moon_Flat.jpg',
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        rawTextureCache.set('/textures/Moon_Flat.jpg', tex);
        if (!cancelled) {
          setMoonTexture(tex);
        }
      },
      undefined,
      () => {
        if (!cancelled) setMoonTexture(null);
      }
    );

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (matRef.current) {
      matRef.current.needsUpdate = true;
    }
  }, [moonTexture]);

  useFrame((_, delta) => {
    if (moonRef.current && !prefersReducedMotion) {
      moonRef.current.rotation.y += delta * 0.004;
    }
  });

  // Position Moon in the upper-right sky inside the camera frustum so Earth and Moon
  // compose together in full-viewport briefing and orbital scenes.
  const moonTransform: { position: [number, number, number]; radius: number } = ambientMode
    ? isPortrait
      ? { position: [0.38, 0.42, -2.2], radius: 0.24 }
      : { position: [0.85, 0.42, -2.2], radius: 0.28 }
    : { position: [1.2, 0.35, -2.6], radius: 0.22 };

  return (
    <mesh
      ref={moonRef}
      position={moonTransform.position}
      rotation={[0.14, -Math.PI * 0.56, 0.06]}
    >
      <sphereGeometry args={[moonTransform.radius, 48, 48]} />
      <meshStandardMaterial
        ref={matRef}
        key={moonTexture ? 'distant-moon-tex' : 'distant-moon-solid'}
        map={moonTexture}
        bumpMap={moonTexture}
        bumpScale={0.018}
        color={moonTexture ? '#e6ebf2' : '#9aa3b2'}
        roughness={0.94}
        metalness={0.02}
      />
    </mesh>
  );
}

/**
 * Controls camera framing for startup ambient mode (with subtle camera breathing)
 * vs interactive preset views in operational / planner viewports.
 */
function CameraController({
  preset,
  ambientMode,
  prefersReducedMotion,
}: {
  preset: EarthCameraPreset;
  ambientMode: boolean;
  prefersReducedMotion: boolean;
}) {
  const { camera, size } = useThree();
  const isPortrait = size.height > size.width;

  useEffect(() => {
    if (ambientMode) {
      if (isPortrait) {
        camera.position.set(0, -0.1, 4.6);
        camera.lookAt(0, -0.25, 0);
      } else {
        camera.position.set(-0.42, 0.25, 3.45);
        camera.lookAt(-0.25, 0.0, 0);
      }
      return;
    }

    const pos: [number, number, number] =
      preset === 'POLAR'
        ? [0.1, 3.05, 0.35]
        : preset === 'EQUATORIAL'
          ? [3.1, 0.15, 0.3]
          : [0, 1.35, 2.75];
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(0, 0, 0);
  }, [preset, ambientMode, isPortrait, camera]);

  useFrame((state) => {
    if (!ambientMode || prefersReducedMotion) return;
    const t = state.clock.elapsedTime;
    const baseX = isPortrait ? 0 : -0.42;
    const baseY = isPortrait ? -0.1 : 0.25;
    const baseZ = isPortrait ? 4.6 : 3.45;
    const lookX = isPortrait ? 0 : -0.25;
    const lookY = isPortrait ? -0.25 : 0.0;

    camera.position.set(
      baseX + Math.sin(t * 0.14) * 0.08,
      baseY + Math.cos(t * 0.11) * 0.05,
      baseZ + Math.sin(t * 0.09) * 0.06
    );
    camera.lookAt(lookX, lookY, 0);
  });

  return null;
}

interface PlanetCoreProps {
  celestialBody: CelestialBodyId;
  targetRegions: TargetRegion[];
  showGroundStations: boolean;
  showClouds: boolean;
  rotatePlanet: boolean;
  currentMetSeconds: number;
  isSimDriven: boolean;
  ambientMode: boolean;
  prefersReducedMotion: boolean;
  activeTargetRegionId: string | null;
  activeGroundStationId: string | null;
}

function PlanetCore({
  celestialBody,
  targetRegions,
  showGroundStations,
  showClouds,
  rotatePlanet,
  currentMetSeconds,
  isSimDriven,
  ambientMode,
  prefersReducedMotion,
  activeTargetRegionId,
  activeGroundStationId,
}: PlanetCoreProps) {
  const groupRef = useRef<THREE.Group>(null);
  const cloudRef = useRef<THREE.Mesh>(null);
  const planetMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const initialTexUrl =
    celestialBody === 'EARTH'
      ? '/textures/EarthImage.jpg'
      : celestialBody === 'MOON'
        ? '/textures/Moon_Flat.jpg'
        : null;

  const [rawTexture, setRawTexture] = useState<THREE.Texture | null>(() =>
    initialTexUrl ? (rawTextureCache.get(initialTexUrl) ?? null) : null
  );
  const [earthMaps, setEarthMaps] = useState<DerivedEarthMaps | null>(() => {
    if (celestialBody !== 'EARTH') return null;
    if (cachedEarthDerivedMaps) return cachedEarthDerivedMaps;
    const cached = rawTextureCache.get('/textures/EarthImage.jpg');
    if (cached && cached.image instanceof HTMLImageElement) {
      cachedEarthDerivedMaps = buildEarthDerivedMaps(cached.image);
      return cachedEarthDerivedMaps;
    }
    return null;
  });

  const cloudTexture = useMemo(() => {
    if (celestialBody !== 'EARTH') return null;
    return getProceduralCloudTexture();
  }, [celestialBody]);

  useEffect(() => {
    const texUrl =
      celestialBody === 'EARTH'
        ? '/textures/EarthImage.jpg'
        : celestialBody === 'MOON'
          ? '/textures/Moon_Flat.jpg'
          : null;

    if (!texUrl) {
      return;
    }

    const cachedRaw = rawTextureCache.get(texUrl);
    if (cachedRaw) {
      return;
    }

    let cancelled = false;
    const loader = new THREE.TextureLoader();

    loader.load(
      texUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        rawTextureCache.set(texUrl, tex);

        if (celestialBody === 'EARTH' && tex.image instanceof HTMLImageElement) {
          if (!cachedEarthDerivedMaps) {
            cachedEarthDerivedMaps = buildEarthDerivedMaps(tex.image);
          }
          if (!cancelled) {
            setEarthMaps(cachedEarthDerivedMaps);
            setRawTexture(tex);
          }
          return;
        }
        if (!cancelled) {
          setEarthMaps(null);
          setRawTexture(tex);
        }
      },
      undefined,
      () => {
        if (!cancelled) {
          setEarthMaps(null);
          setRawTexture(null);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [celestialBody]);

  const activeColorMap =
    celestialBody === 'EARTH'
      ? (earthMaps?.colorMap ?? rawTexture)
      : celestialBody === 'MOON'
        ? rawTexture
        : null;

  useEffect(() => {
    if (planetMatRef.current) {
      planetMatRef.current.needsUpdate = true;
    }
  }, [activeColorMap, earthMaps]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    if (isSimDriven) {
      // R2: Lock Earth rotation strictly to mission elapsed time (omega_E * MET)
      // so ground stations, flood basins, and orbital sub-satellite points stay aligned.
      const rate = celestialBody === 'EARTH' ? OMEGA_EARTH_RAD_S : 0;
      groupRef.current.rotation.y = rate * currentMetSeconds;
      if (cloudRef.current) {
        cloudRef.current.rotation.y = currentMetSeconds * 1.2e-5;
      }
      return;
    }

    if (rotatePlanet && !prefersReducedMotion) {
      groupRef.current.rotation.y += delta * (ambientMode ? 0.025 : 0.04);
      if (cloudRef.current) {
        cloudRef.current.rotation.y += delta * 0.009;
      }
    }
  });

  const baseColor =
    celestialBody === 'EARTH'
      ? activeColorMap
        ? '#ffffff'
        : '#1b4f8c'
      : celestialBody === 'MARS'
        ? '#c45937'
        : celestialBody === 'MOON'
          ? activeColorMap
            ? '#e6ebf2'
            : '#8d949e'
          : '#6c6860';

  const regionMarkers = useMemo(
    () =>
      targetRegions.map((reg) => ({
        ...reg,
        pos: latLonToVector3(reg.latitudeDeg, reg.longitudeDeg, 1.014),
      })),
    [targetRegions]
  );

  const stationMarkers = useMemo(
    () =>
      GROUND_STATIONS.map((gs) => ({
        ...gs,
        pos: latLonToVector3(gs.latitudeDeg, gs.longitudeDeg, 1.011),
      })),
    []
  );

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry
          args={[
            1.0,
            celestialBody === 'ASTEROID' ? 24 : 64,
            celestialBody === 'ASTEROID' ? 18 : 64,
          ]}
        />
        <meshStandardMaterial
          ref={planetMatRef}
          key={`${celestialBody}-${activeColorMap ? 'tex' : 'solid'}-${earthMaps ? 'pbr' : 'std'}`}
          map={activeColorMap}
          roughnessMap={celestialBody === 'EARTH' ? (earthMaps?.roughnessMap ?? null) : null}
          bumpMap={
            celestialBody === 'EARTH'
              ? (earthMaps?.bumpMap ?? null)
              : celestialBody === 'MOON'
                ? rawTexture
                : null
          }
          bumpScale={celestialBody === 'EARTH' ? 0.015 : celestialBody === 'MOON' ? 0.02 : 0}
          color={baseColor}
          roughness={celestialBody === 'EARTH' && earthMaps ? 1.0 : 0.84}
          metalness={0.04}
        />
      </mesh>

      {/* Atmospheric Limb & Monsoon Cloud Deck for Earth */}
      {celestialBody === 'EARTH' && (
        <>
          <EarthAtmosphereLimb />
          {showClouds && (
            <mesh ref={cloudRef}>
              <sphereGeometry args={[1.012, 48, 48]} />
              <meshStandardMaterial
                key={cloudTexture ? 'clouds-proc' : 'clouds-flat'}
                map={cloudTexture}
                color="#F1F5FA"
                transparent
                opacity={cloudTexture ? 0.58 : 0.14}
                roughness={0.95}
                metalness={0.0}
                depthWrite={false}
              />
            </mesh>
          )}
        </>
      )}

      {/* Flood Basin / Target Region Markers */}
      {regionMarkers.map((reg) => {
        const isActive = activeTargetRegionId === reg.id;
        const markerColor = isActive
          ? '#38D996'
          : reg.cloudCoverFraction > 0.7
            ? '#FF5364'
            : '#FFB547';
        return (
          <group key={reg.id} position={reg.pos}>
            <mesh>
              <sphereGeometry args={[isActive ? 0.032 : 0.024, 16, 16]} />
              <meshBasicMaterial color={markerColor} />
            </mesh>
            <mesh scale={isActive ? 2.4 : 1.75}>
              <sphereGeometry args={[0.024, 12, 12]} />
              <meshBasicMaterial color={markerColor} transparent opacity={isActive ? 0.35 : 0.22} />
            </mesh>
          </group>
        );
      })}

      {/* Ground Station Network Markers */}
      {showGroundStations &&
        celestialBody === 'EARTH' &&
        stationMarkers.map((gs) => {
          const isActive = activeGroundStationId === gs.id;
          return (
            <group key={gs.id} position={gs.pos}>
              <mesh>
                <boxGeometry
                  args={isActive ? [0.032, 0.032, 0.032] : [0.022, 0.022, 0.022]}
                />
                <meshBasicMaterial color={isActive ? '#38D996' : '#42D9F5'} />
              </mesh>
            </group>
          );
        })}
    </group>
  );
}

export interface EarthSceneProps {
  celestialBody: CelestialBodyId;
  orbit: OrbitalParameters;
  periodSeconds: number;
  currentMetSeconds?: number;
  swathWidthKm?: number;
  targetRegions?: TargetRegion[];
  showGroundStations?: boolean;
  showSwathCone?: boolean;
  heightClass?: string;
  showMoonInBackground?: boolean;
  ambientMode?: boolean;
  showHudControls?: boolean;
  syncToMissionTime?: boolean;
  activeTargetRegionId?: string | null;
  activeGroundStationId?: string | null;
  className?: string;
}

export function EarthScene({
  celestialBody,
  orbit,
  periodSeconds,
  currentMetSeconds = 0,
  swathWidthKm = 185,
  targetRegions = [],
  showGroundStations = true,
  showSwathCone = true,
  heightClass = 'h-[460px]',
  showMoonInBackground = celestialBody === 'EARTH',
  ambientMode = false,
  showHudControls = !ambientMode,
  syncToMissionTime = false,
  activeTargetRegionId = null,
  activeGroundStationId = null,
  className = '',
}: EarthSceneProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [showClouds, setShowClouds] = useState(true);
  const [rotatePlanet, setRotatePlanet] = useState(() => !prefersReducedMotion);
  const [cameraPreset, setCameraPreset] = useState<EarthCameraPreset>('OVERVIEW');

  const isSimDriven = syncToMissionTime || currentMetSeconds > 0;
  const effectiveGroundStations = showGroundStations && !ambientMode;
  const effectiveTargets = ambientMode ? [] : targetRegions;

  const containerClasses = ambientMode
    ? `relative w-full ${heightClass} overflow-hidden bg-[#080B12] ${className}`
    : `relative w-full ${heightClass} overflow-hidden rounded-2xl border border-[#F1F5FA]/15 bg-[#080B12] ${className}`;

  return (
    <SceneCanvasGuard
      title={`${celestialBody} Orbital Telemetry Viewport`}
      subtitle="Displaying Keplerian orbital metrics and ground target parameters via numeric telemetry panels."
      heightClass={heightClass}
      className={ambientMode ? 'rounded-none border-0' : className}
    >
      <div className={containerClasses}>
        {/* Non-overlapping top flex HUD bar */}
        {showHudControls && (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-center justify-between gap-2">
            <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
              {(['OVERVIEW', 'POLAR', 'EQUATORIAL'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCameraPreset(preset)}
                  className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${
                    cameraPreset === preset
                      ? 'border-[#42D9F5] bg-[#141E2E]/90 text-[#42D9F5]'
                      : 'border-[#F1F5FA]/15 bg-[#0D1422]/80 text-[#8E9BAD] hover:text-[#F1F5FA]'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
              {celestialBody === 'EARTH' && (
                <button
                  type="button"
                  onClick={() => setShowClouds((v) => !v)}
                  className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${
                    showClouds
                      ? 'border-[#42D9F5]/70 bg-[#141E2E]/90 text-[#42D9F5]'
                      : 'border-[#F1F5FA]/15 bg-[#0D1422]/80 text-[#8E9BAD]'
                  }`}
                >
                  CLOUDS: {showClouds ? 'ON' : 'OFF'}
                </button>
              )}
              {isSimDriven ? (
                <span className="rounded-full border border-[#38D996]/50 bg-[#0D1422]/85 px-2.5 py-1 font-mono text-[11px] text-[#38D996]">
                  ROTATION: MET SYNCED
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setRotatePlanet((v) => !v)}
                  className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${
                    rotatePlanet
                      ? 'border-[#38D996]/70 bg-[#141E2E]/90 text-[#38D996]'
                      : 'border-[#F1F5FA]/15 bg-[#0D1422]/80 text-[#8E9BAD]'
                  }`}
                >
                  SPIN: {rotatePlanet ? 'ON' : 'PAUSED'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Bottom Legend & Active Targets (hidden in ambient startup mode) */}
        {showHudControls && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3 rounded-full border border-[#F1F5FA]/15 bg-[#0D1422]/85 px-3 py-1 font-mono text-[11px] text-[#8E9BAD] backdrop-blur-md">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-[#38D996]" />
                S/C &amp; Swath
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-[#FF5364]" />
                Flood Basin
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 bg-[#42D9F5]" />
                Ground Station
              </span>
            </div>
            {targetRegions.length > 0 && (
              <div className="hidden flex-wrap gap-1.5 sm:flex">
                {targetRegions.slice(0, 3).map((reg) => {
                  const isActive = activeTargetRegionId === reg.id;
                  return (
                    <span
                      key={reg.id}
                      className={`rounded-full border px-2.5 py-1 font-mono text-[11px] backdrop-blur-md ${
                        isActive
                          ? 'border-[#38D996] bg-[#141E2E]/90 text-[#38D996]'
                          : 'border-[#F1F5FA]/15 bg-[#080B12]/80 text-[#F1F5FA]'
                      }`}
                    >
                      {reg.name} ({Math.round(reg.cloudCoverFraction * 100)}%)
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <Canvas
          dpr={prefersReducedMotion ? [1, 1] : [1, 1.75]}
          camera={{
            position: ambientMode ? [-0.42, 0.25, 3.45] : [0, 1.35, 2.75],
            fov: ambientMode ? 42 : 44,
          }}
        >
          <color attach="background" args={['#080B12']} />
          <CameraController
            preset={cameraPreset}
            ambientMode={ambientMode}
            prefersReducedMotion={prefersReducedMotion}
          />
          <ambientLight intensity={0.28} />
          <directionalLight position={[6, 2.5, 4.5]} intensity={2.1} color="#fff7ea" />
          <directionalLight position={[-6, -1.5, -5]} intensity={0.14} color="#8EC5FC" />
          <Stars
            radius={110}
            depth={50}
            count={prefersReducedMotion ? 500 : 1200}
            factor={2.2}
            saturation={0.15}
            fade
            speed={0}
          />

          <Suspense fallback={null}>
            <PlanetCore
              key={celestialBody}
              celestialBody={celestialBody}
              targetRegions={effectiveTargets}
              showGroundStations={effectiveGroundStations}
              showClouds={showClouds}
              rotatePlanet={rotatePlanet}
              currentMetSeconds={currentMetSeconds}
              isSimDriven={isSimDriven}
              ambientMode={ambientMode}
              prefersReducedMotion={prefersReducedMotion}
              activeTargetRegionId={activeTargetRegionId}
              activeGroundStationId={activeGroundStationId}
            />

            {celestialBody === 'EARTH' && showMoonInBackground && (
              <DistantMoon
                ambientMode={ambientMode}
                prefersReducedMotion={prefersReducedMotion}
              />
            )}

            <OrbitPath
              orbit={orbit}
              periodSeconds={periodSeconds}
              currentMetSeconds={currentMetSeconds}
              swathWidthKm={swathWidthKm}
              showSwathCone={showSwathCone && !ambientMode}
              subtle={ambientMode}
            />
          </Suspense>

          {!ambientMode && (
            <OrbitControls
              enablePan={false}
              minDistance={1.45}
              maxDistance={6.8}
              dampingFactor={0.08}
            />
          )}
        </Canvas>
      </div>
    </SceneCanvasGuard>
  );
}

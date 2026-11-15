import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GROUND_STATIONS } from '../data/groundStations';
import { getShortTargetRegionName } from '../data/displayNames';
import { OMEGA_EARTH_RAD_S } from '../engine/constants';
import { getBodyConstants } from '../engine/orbital';
import type { CelestialBodyId, TargetRegion } from '../types/mission';
import type { OrbitalParameters } from '../types/spacecraft';
import { OrbitPath } from './OrbitPath';
import {
  getCachedTexture,
  getEarthDerivedMaps,
  getProceduralCloudTexture,
  getProceduralPlanetMaps,
  loadTextureByUrl,
  setBodyTextureStatus,
  type DerivedPlanetMaps,
  type TextureLoadStatus,
} from './planetaryTextures';
import { getCelestialTextureConfig } from './textureManifest';
import { SceneCanvasGuard } from './WebGLFallback';
import { usePrefersReducedMotion } from './webglUtils';

type EarthCameraPreset = 'OVERVIEW' | 'POLAR' | 'EQUATORIAL';

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
  const [moonTexture, setMoonTexture] = useState<THREE.Texture | null>(() =>
    getCachedTexture('/textures/Moon_Flat.jpg')
  );

  useEffect(() => {
    const cached = getCachedTexture('/textures/Moon_Flat.jpg');
    if (cached) {
      return;
    }

    let cancelled = false;
    loadTextureByUrl('/textures/Moon_Flat.jpg')
      .then((tex) => {
        if (!cancelled) setMoonTexture(tex);
      })
      .catch(() => {
        if (!cancelled) setMoonTexture(null);
      });

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
  maxOrbitRadiusUnits,
}: {
  preset: EarthCameraPreset;
  ambientMode: boolean;
  prefersReducedMotion: boolean;
  maxOrbitRadiusUnits: number;
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

    const baseDist = Math.max(3.85, maxOrbitRadiusUnits * 2.15) * (isPortrait ? 1.25 : 1.0);
    const pos: [number, number, number] =
      preset === 'POLAR'
        ? [0.12 * (baseDist / 3.85), baseDist * 0.96, 0.42 * (baseDist / 3.85)]
        : preset === 'EQUATORIAL'
          ? [baseDist * 0.98, 0.18 * (baseDist / 3.85), 0.36 * (baseDist / 3.85)]
          : [0, baseDist * 0.44, baseDist * 0.89];
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(0, 0, 0);
  }, [preset, ambientMode, isPortrait, maxOrbitRadiusUnits, camera]);

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
  onTextureStatusChange?: (body: CelestialBodyId, status: TextureLoadStatus) => void;
}

interface PlanetTextureState {
  body: CelestialBodyId;
  rawTexture: THREE.Texture | null;
  earthMaps: DerivedPlanetMaps | null;
  proceduralMaps: DerivedPlanetMaps | null;
  status: TextureLoadStatus;
}

function resolveSyncPlanetTextureState(celestialBody: CelestialBodyId): PlanetTextureState {
  const manifest = getCelestialTextureConfig(celestialBody);
  if (manifest.materialMode === 'procedural') {
    return {
      body: celestialBody,
      rawTexture: null,
      earthMaps: null,
      proceduralMaps: getProceduralPlanetMaps(celestialBody),
      status: 'procedural',
    };
  }

  const cached = manifest.textureUrl ? getCachedTexture(manifest.textureUrl) : null;
  if (cached) {
    const earthMaps = manifest.useDerivedEarthPbr ? getEarthDerivedMaps(cached.image) : null;
    return {
      body: celestialBody,
      rawTexture: cached,
      earthMaps,
      proceduralMaps: null,
      status: 'loaded',
    };
  }

  return {
    body: celestialBody,
    rawTexture: null,
    earthMaps: null,
    proceduralMaps: null,
    status: 'loading',
  };
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
  onTextureStatusChange,
}: PlanetCoreProps) {
  const groupRef = useRef<THREE.Group>(null);
  const cloudRef = useRef<THREE.Mesh>(null);
  const planetMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const texManifest = getCelestialTextureConfig(celestialBody);
  const [texState, setTexState] = useState<PlanetTextureState>(() =>
    resolveSyncPlanetTextureState(celestialBody)
  );

  // Synchronously derive fallback/cached state if celestialBody prop changes before effect runs
  const currentTexState =
    texState.body === celestialBody ? texState : resolveSyncPlanetTextureState(celestialBody);

  const cloudTexture = useMemo(() => {
    if (!texManifest.hasClouds) return null;
    return getProceduralCloudTexture();
  }, [texManifest.hasClouds]);

  useEffect(() => {
    const manifest = getCelestialTextureConfig(celestialBody);
    const syncState = resolveSyncPlanetTextureState(celestialBody);
    setBodyTextureStatus(celestialBody, syncState.status);

    if (manifest.materialMode !== 'image' || !manifest.textureUrl || syncState.rawTexture) {
      return;
    }

    let cancelled = false;
    loadTextureByUrl(manifest.textureUrl)
      .then((tex) => {
        if (cancelled) return;
        const earthMaps = manifest.useDerivedEarthPbr ? getEarthDerivedMaps(tex.image) : null;
        setBodyTextureStatus(celestialBody, 'loaded');
        onTextureStatusChange?.(celestialBody, 'loaded');
        setTexState({
          body: celestialBody,
          rawTexture: tex,
          earthMaps,
          proceduralMaps: null,
          status: 'loaded',
        });
      })
      .catch(() => {
        if (cancelled) return;
        setBodyTextureStatus(celestialBody, 'fallback-error');
        onTextureStatusChange?.(celestialBody, 'fallback-error');
        setTexState({
          body: celestialBody,
          rawTexture: null,
          earthMaps: null,
          proceduralMaps: null,
          status: 'fallback-error',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [celestialBody, onTextureStatusChange]);

  const activeColorMap =
    celestialBody === 'EARTH'
      ? (currentTexState.earthMaps?.colorMap ?? currentTexState.rawTexture)
      : texManifest.materialMode === 'procedural'
        ? (currentTexState.proceduralMaps?.colorMap ?? null)
        : currentTexState.rawTexture;

  const activeRoughnessMap =
    celestialBody === 'EARTH'
      ? (currentTexState.earthMaps?.roughnessMap ?? null)
      : texManifest.materialMode === 'procedural'
        ? (currentTexState.proceduralMaps?.roughnessMap ?? null)
        : null;

  const activeBumpMap =
    celestialBody === 'EARTH'
      ? (currentTexState.earthMaps?.bumpMap ?? null)
      : celestialBody === 'MOON'
        ? currentTexState.rawTexture
        : (currentTexState.proceduralMaps?.bumpMap ?? null);

  useEffect(() => {
    if (planetMatRef.current) {
      planetMatRef.current.needsUpdate = true;
    }
  }, [activeColorMap, activeBumpMap, activeRoughnessMap]);

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
        : texManifest.fallbackColor
      : celestialBody === 'MOON'
        ? activeColorMap
          ? '#e6ebf2'
          : texManifest.fallbackColor
        : activeColorMap
          ? '#ffffff'
          : texManifest.fallbackColor;

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
          key={`${celestialBody}-${activeColorMap ? 'tex' : 'solid'}-${currentTexState.earthMaps ? 'pbr' : currentTexState.proceduralMaps ? 'proc' : 'std'}`}
          map={activeColorMap}
          roughnessMap={activeRoughnessMap}
          bumpMap={activeBumpMap}
          bumpScale={activeBumpMap ? texManifest.bumpScale : 0}
          color={baseColor}
          roughness={
            activeRoughnessMap
              ? 1.0
              : texManifest.roughness
          }
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
  const texManifest = getCelestialTextureConfig(celestialBody);
  const [asyncStatus, setAsyncStatus] = useState<{
    body: CelestialBodyId;
    status: TextureLoadStatus;
  } | null>(null);
  const textureStatus =
    asyncStatus?.body === celestialBody
      ? asyncStatus.status
      : resolveSyncPlanetTextureState(celestialBody).status;

  const isSimDriven = syncToMissionTime || currentMetSeconds > 0;
  const effectiveGroundStations = showGroundStations && !ambientMode;
  const effectiveTargets = ambientMode ? [] : targetRegions;
  const bodyConstants = getBodyConstants(orbit.celestialBody);
  const maxOrbitRadiusUnits =
    (bodyConstants.radiusKm + Math.max(orbit.altitudePerigeeKm, orbit.altitudeApogeeKm)) /
    Math.max(1, bodyConstants.radiusKm);
  const initialCamDist = Math.max(3.85, maxOrbitRadiusUnits * 2.15);

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
      <div
        data-testid="earth-scene"
        data-primary-body={celestialBody}
        data-moon-background={String(celestialBody === 'EARTH' && showMoonInBackground)}
        data-texture-url={texManifest.textureUrl ?? 'procedural'}
        data-texture-status={textureStatus}
        className={containerClasses}
      >
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
                Target Region
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
                      title={reg.name}
                      className={`rounded-full border px-2.5 py-1 font-mono text-[11px] backdrop-blur-md ${
                        isActive
                          ? 'border-[#38D996] bg-[#141E2E]/90 text-[#38D996]'
                          : 'border-[#F1F5FA]/15 bg-[#080B12]/80 text-[#F1F5FA]'
                      }`}
                    >
                      {getShortTargetRegionName(reg)} ({Math.round(reg.cloudCoverFraction * 100)}%)
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
            position: ambientMode
              ? [-0.42, 0.25, 3.45]
              : [0, initialCamDist * 0.44, initialCamDist * 0.89],
            fov: ambientMode ? 42 : 44,
          }}
        >
          <color attach="background" args={['#080B12']} />
          <CameraController
            preset={cameraPreset}
            ambientMode={ambientMode}
            prefersReducedMotion={prefersReducedMotion}
            maxOrbitRadiusUnits={maxOrbitRadiusUnits}
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
              onTextureStatusChange={(body, status) => setAsyncStatus({ body, status })}
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
              minDistance={1.6}
              maxDistance={Math.max(8.0, maxOrbitRadiusUnits * 3.2)}
              dampingFactor={0.08}
            />
          )}
        </Canvas>
      </div>
    </SceneCanvasGuard>
  );
}

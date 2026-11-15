import { ContactShadows, OrbitControls, Stars } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ScientificInstrument, SpacecraftComponent } from '../types/spacecraft';
import { SceneCanvasGuard } from './WebGLFallback';
import { usePrefersReducedMotion } from './webglUtils';

interface TrianaJsonData {
  name: string;
  vertexCount: number;
  sharedPositions: number[];
  groups: {
    id: string;
    diffuse: number[];
    specular: number[];
    triangleCount: number;
    indices: number[];
  }[];
}

function TrianaHeritageMesh({
  onStatusChange,
}: {
  onStatusChange: (status: 'loading' | 'ready' | 'error') => void;
}) {
  const [data, setData] = useState<TrianaJsonData | null>(null);

  useEffect(() => {
    let cancelled = false;
    onStatusChange('loading');

    fetch('/models/triana-spacecraft.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: TrianaJsonData) => {
        if (!cancelled) {
          setData(json);
          onStatusChange('ready');
        }
      })
      .catch(() => {
        if (!cancelled) onStatusChange('error');
      });

    return () => {
      cancelled = true;
    };
  }, [onStatusChange]);

  const meshes = useMemo(() => {
    if (!data || !data.sharedPositions?.length) return [];
    const posArray = new Float32Array(data.sharedPositions);

    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < posArray.length; i += 3) {
      const x = posArray[i];
      const y = posArray[i + 1];
      const z = posArray[i + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const maxSpan = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
    const scale = 3.0 / maxSpan;

    const centeredPos = new Float32Array(posArray.length);
    for (let i = 0; i < posArray.length; i += 3) {
      centeredPos[i] = (posArray[i] - cx) * scale;
      centeredPos[i + 1] = (posArray[i + 1] - cy) * scale;
      centeredPos[i + 2] = (posArray[i + 2] - cz) * scale;
    }

    return data.groups.map((grp) => {
      const indexedGeom = new THREE.BufferGeometry();
      indexedGeom.setAttribute('position', new THREE.BufferAttribute(centeredPos, 3));
      indexedGeom.setIndex(grp.indices);
      // Convert to non-indexed for crisp CAD faceted normals instead of smoothed shared vertices
      const geom = indexedGeom.toNonIndexed();
      indexedGeom.dispose();
      geom.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(
          grp.diffuse[0] ?? 0.7,
          grp.diffuse[1] ?? 0.75,
          grp.diffuse[2] ?? 0.8
        ),
        metalness: 0.52,
        roughness: 0.36,
        side: THREE.DoubleSide,
      });

      return { id: grp.id, geom, mat };
    });
  }, [data]);

  // Dispose geometries and materials cleanly on unmount or model change (P2)
  useEffect(() => {
    return () => {
      for (const item of meshes) {
        item.geom.dispose();
        item.mat.dispose();
      }
    };
  }, [meshes]);

  if (!meshes.length) return null;

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {meshes.map((item) => (
        <mesh key={item.id} geometry={item.geom} material={item.mat} />
      ))}
    </group>
  );
}

interface SpacecraftAssemblyModelProps {
  bus: SpacecraftComponent;
  subsystems: SpacecraftComponent[];
  instruments: ScientificInstrument[];
  useTrianaMesh: boolean;
  autoSpin: boolean;
  onTrianaStatus: (status: 'loading' | 'ready' | 'error') => void;
}

function SpacecraftAssemblyModel({
  bus,
  subsystems,
  instruments,
  useTrianaMesh,
  autoSpin,
  onTrianaStatus,
}: SpacecraftAssemblyModelProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current && autoSpin) {
      groupRef.current.rotation.y += delta * 0.24;
    }
  });

  const ffSet = bus.compatibleFormFactors as string[];
  const is1U = ffSet.includes('1U') && !ffSet.includes('3U') && !ffSet.includes('6U');
  const is3U = ffSet.includes('3U') && !ffSet.includes('6U');
  const is6U = ffSet.includes('6U');
  const is12U = ffSet.includes('12U');
  const isEspa = ffSet.includes('ESPA');
  const isCubeSat = is1U || is3U || is6U || is12U;

  const busDimensions: [number, number, number] = is1U
    ? [0.46, 0.46, 0.46]
    : is3U
      ? [0.44, 0.44, 1.02]
      : is6U
        ? [0.64, 0.46, 0.96]
        : is12U
          ? [0.84, 0.64, 0.98]
          : isEspa
            ? [1.14, 1.28, 1.14]
            : [0.94, 1.06, 0.94];

  const [bx, by, bz] = busDimensions;

  const solarArray = subsystems.find((s) => s.category === 'SOLAR_ARRAY');
  const battery = subsystems.find((s) => s.category === 'BATTERY');
  const antenna = subsystems.find((s) => s.category === 'ANTENNA');
  const thruster = subsystems.find((s) => s.category === 'PROPULSION');
  const thermal = subsystems.find((s) => s.category === 'THERMAL');
  const avionics = subsystems.find((s) => s.category === 'AVIONICS');

  const hasSar = instruments.some((i) => i.type === 'SAR');
  const hasOptical = instruments.some(
    (i) => i.type === 'OPTICAL' || i.type === 'MULTISPECTRAL' || i.type === 'THERMAL_IR'
  );
  const hasAltimeter = instruments.some(
    (i) => i.type === 'ALTIMETER' || i.type === 'SPECTROMETER'
  );

  const isDeepSpaceSolar = solarArray?.id === 'solar-wings-deep-space';
  const isEspaSolar = solarArray?.id === 'solar-wings-espa';
  const wingSpan = isDeepSpaceSolar ? 2.2 : isEspaSolar ? 1.55 : 0.92;
  const wingChord = isDeepSpaceSolar ? 0.72 : isEspaSolar ? 0.58 : 0.42;

  const isDualBattery = battery?.id === 'batt-liion-1500wh';
  const isMidBattery = battery?.id === 'batt-liion-650wh';

  const isRedundantAvionics = avionics?.id === 'avio-rad750-redundant';

  const isActiveThermal = thermal?.id === 'therm-active-louvers';
  const isPassiveMli = thermal?.id === 'therm-passive-mli';

  return (
    <group ref={groupRef}>
      {useTrianaMesh ? (
        <TrianaHeritageMesh onStatusChange={onTrianaStatus} />
      ) : (
        <>
          {/* 1. Primary Spacecraft Bus Structure (1U / 3U / 6U / 12U / SmallSat / Hexagonal ESPA) */}
          {isEspa ? (
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[bx * 0.58, bx * 0.58, by, 6]} />
              <meshStandardMaterial
                color={isPassiveMli ? '#C8922A' : '#1E2A3B'}
                metalness={0.76}
                roughness={0.28}
              />
            </mesh>
          ) : (
            <mesh castShadow receiveShadow>
              <boxGeometry args={busDimensions} />
              <meshStandardMaterial
                color={isCubeSat ? '#1E2A3B' : isPassiveMli ? '#C8922A' : '#B88728'}
                metalness={0.74}
                roughness={0.3}
              />
            </mesh>
          )}

          {/* Structural corner rails for CubeSat form factors */}
          {isCubeSat && (
            <mesh>
              <boxGeometry args={[bx + 0.025, by + 0.025, bz + 0.025]} />
              <meshStandardMaterial
                color="#8E9BAD"
                wireframe
                transparent
                opacity={0.4}
              />
            </mesh>
          )}

          {/* 2. Thermal Control Subsystem (Gold Kapton MLI vs Active Silver Radiator Louvers) */}
          {isActiveThermal && (
            <group>
              <mesh position={[0, 0, bz / 2 + 0.03]}>
                <boxGeometry args={[bx * 0.74, by * 0.64, 0.035]} />
                <meshStandardMaterial color="#E2E8F0" metalness={0.86} roughness={0.16} />
              </mesh>
              {[-0.18, 0, 0.18].map((offsetY) => (
                <mesh key={offsetY} position={[0, offsetY * by, bz / 2 + 0.055]}>
                  <boxGeometry args={[bx * 0.68, 0.03, 0.025]} />
                  <meshStandardMaterial color="#8E9BAD" metalness={0.88} roughness={0.14} />
                </mesh>
              ))}
            </group>
          )}
          {isPassiveMli && (
            <mesh position={[0, 0, bz / 2 + 0.015]}>
              <boxGeometry args={[bx * 0.82, by * 0.78, 0.02]} />
              <meshStandardMaterial color="#D49B27" metalness={0.82} roughness={0.26} />
            </mesh>
          )}

          {/* 3. Deployable GaAs / ROSA Solar Array Wings (+X and -X) */}
          {solarArray && (
            <>
              {[1, -1].map((dir) => (
                <group
                  key={dir}
                  position={[dir * (bx / 2 + wingSpan / 2 + 0.12), 0, 0]}
                >
                  {/* Deployment yoke strut */}
                  <mesh position={[-dir * (wingSpan / 2 + 0.06), 0, 0]}>
                    <boxGeometry args={[0.14, 0.035, 0.06]} />
                    <meshStandardMaterial color="#8E9BAD" metalness={0.8} roughness={0.25} />
                  </mesh>
                  {/* Solar blanket / GaAs wing */}
                  <mesh>
                    <boxGeometry args={[wingSpan, 0.028, wingChord]} />
                    <meshStandardMaterial
                      color="#102240"
                      emissive="#3978F6"
                      emissiveIntensity={0.22}
                      metalness={0.78}
                      roughness={0.22}
                    />
                  </mesh>
                  {/* ROSA roll-out tension boom canister */}
                  {isDeepSpaceSolar && (
                    <mesh
                      position={[dir * (wingSpan / 2 + 0.02), 0, 0]}
                      rotation={[Math.PI / 2, 0, 0]}
                    >
                      <cylinderGeometry args={[0.042, 0.042, wingChord + 0.06, 16]} />
                      <meshStandardMaterial color="#DCE3ED" metalness={0.8} roughness={0.22} />
                    </mesh>
                  )}
                </group>
              ))}
            </>
          )}

          {/* 4. Li-Ion Battery Pack Subsystem (lower lateral EPS bay) */}
          {battery && (
            <group position={[-(bx / 2 + 0.055), -by * 0.18, bz * 0.18]}>
              <mesh>
                <boxGeometry
                  args={[
                    0.11,
                    isDualBattery ? 0.36 : isMidBattery ? 0.28 : 0.18,
                    isDualBattery ? 0.38 : isMidBattery ? 0.28 : 0.2,
                  ]}
                />
                <meshStandardMaterial color="#141E2E" metalness={0.65} roughness={0.32} />
              </mesh>
              {/* Charge bus bar indicator */}
              <mesh position={[-0.06, 0, 0]}>
                <boxGeometry args={[0.015, isDualBattery ? 0.28 : 0.14, 0.06]} />
                <meshStandardMaterial
                  color="#38D996"
                  emissive="#38D996"
                  emissiveIntensity={0.45}
                />
              </mesh>
              {isDualBattery && (
                <mesh position={[0, 0, -0.22]}>
                  <boxGeometry args={[0.1, 0.32, 0.16]} />
                  <meshStandardMaterial color="#1F2D42" metalness={0.65} roughness={0.32} />
                </mesh>
              )}
            </group>
          )}

          {/* 5. Avionics & SSR C&DH Subsystem (upper lateral deck + star tracker) */}
          {avionics && (
            <group position={[bx / 2 + 0.055, by * 0.2, bz * 0.18]}>
              <mesh>
                <boxGeometry
                  args={[0.1, isRedundantAvionics ? 0.32 : 0.2, isRedundantAvionics ? 0.34 : 0.22]}
                />
                <meshStandardMaterial color="#273549" metalness={0.72} roughness={0.28} />
              </mesh>
              {/* SSR telemetry strip */}
              <mesh position={[0.055, 0, 0]}>
                <boxGeometry args={[0.015, 0.14, 0.05]} />
                <meshStandardMaterial
                  color="#42D9F5"
                  emissive="#42D9F5"
                  emissiveIntensity={0.5}
                />
              </mesh>
              {/* Optical star tracker baffle(s) on top edge */}
              <mesh position={[-0.08, by * 0.32, 0.06]} rotation={[0.35, 0, -0.35]}>
                <cylinderGeometry args={[0.055, 0.038, 0.14, 16]} />
                <meshStandardMaterial color="#DCE3ED" metalness={0.8} roughness={0.22} />
              </mesh>
              {isRedundantAvionics && (
                <mesh position={[-0.08, by * 0.32, -0.1]} rotation={[-0.3, 0, -0.35]}>
                  <cylinderGeometry args={[0.055, 0.038, 0.14, 16]} />
                  <meshStandardMaterial color="#DCE3ED" metalness={0.8} roughness={0.22} />
                </mesh>
              )}
            </group>
          )}

          {/* 6. RF Downlink Antenna Assembly (+Y Zenith Deck) */}
          {antenna && (
            <group position={[0.18, by / 2 + 0.2, 0.14]}>
              {antenna.rfBand === 'KA_BAND' ? (
                <group rotation={[Math.PI / 4, 0, 0]}>
                  <mesh>
                    <cylinderGeometry args={[0.38, 0.09, 0.16, 24]} />
                    <meshStandardMaterial color="#F1F5FA" metalness={0.62} roughness={0.25} />
                  </mesh>
                  <mesh position={[0, 0.16, 0]}>
                    <cylinderGeometry args={[0.018, 0.018, 0.22, 12]} />
                    <meshStandardMaterial color="#8E9BAD" metalness={0.8} roughness={0.2} />
                  </mesh>
                </group>
              ) : antenna.rfBand === 'X_BAND' ? (
                <mesh>
                  <coneGeometry args={[0.16, 0.28, 16]} />
                  <meshStandardMaterial color="#42D9F5" metalness={0.72} roughness={0.25} />
                </mesh>
              ) : (
                <mesh>
                  <boxGeometry args={[0.2, 0.045, 0.2]} />
                  <meshStandardMaterial color="#FFB547" metalness={0.5} roughness={0.38} />
                </mesh>
              )}
            </group>
          )}

          {/* 7. Propulsion Module (-Z Aft Deck) */}
          {thruster && (
            <group position={[0, 0, -(bz / 2 + 0.12)]}>
              {thruster.id === 'prop-cold-gas' ? (
                <group>
                  <mesh>
                    <sphereGeometry args={[0.11, 16, 16]} />
                    <meshStandardMaterial color="#8E9BAD" metalness={0.75} roughness={0.25} />
                  </mesh>
                  {[
                    [0.09, 0.09],
                    [-0.09, 0.09],
                    [0.09, -0.09],
                    [-0.09, -0.09],
                  ].map(([nx, ny], idx) => (
                    <mesh key={idx} position={[nx, ny, -0.09]} rotation={[Math.PI / 2, 0, 0]}>
                      <coneGeometry args={[0.032, 0.08, 12]} />
                      <meshStandardMaterial color="#DCE3ED" metalness={0.85} roughness={0.2} />
                    </mesh>
                  ))}
                </group>
              ) : thruster.id === 'prop-hall-xenon' ? (
                <group>
                  <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.16, 0.14, 0.16, 24]} />
                    <meshStandardMaterial color="#273549" metalness={0.85} roughness={0.22} />
                  </mesh>
                  <mesh position={[0, 0, -0.09]}>
                    <torusGeometry args={[0.11, 0.022, 12, 24]} />
                    <meshStandardMaterial
                      color="#42D9F5"
                      emissive="#42D9F5"
                      emissiveIntensity={0.85}
                    />
                  </mesh>
                </group>
              ) : (
                <group>
                  <mesh position={[0, 0, 0.04]}>
                    <sphereGeometry args={[0.14, 18, 18]} />
                    <meshStandardMaterial color="#B9C4D4" metalness={0.78} roughness={0.24} />
                  </mesh>
                  <mesh position={[0, 0, -0.1]} rotation={[Math.PI / 2, 0, 0]}>
                    <coneGeometry args={[0.12, 0.22, 20]} />
                    <meshStandardMaterial color="#8E9BAD" metalness={0.85} roughness={0.2} />
                  </mesh>
                </group>
              )}
            </group>
          )}

          {/* 8. Nadir Payload Deck (-Y): Synthetic Aperture Radar Planar Array */}
          {hasSar && (
            <mesh position={[0, -(by / 2 + 0.14), 0]}>
              <boxGeometry args={[1.62, 0.06, 0.42]} />
              <meshStandardMaterial
                color="#141E2E"
                emissive="#3978F6"
                emissiveIntensity={0.28}
                metalness={0.75}
                roughness={0.25}
              />
            </mesh>
          )}

          {/* Nadir Optical / Multispectral / Thermal IR Telescope Baffle */}
          {hasOptical && (
            <group position={[-0.22, -(by / 2 + 0.2), 0.2]}>
              <mesh rotation={[Math.PI, 0, 0]}>
                <cylinderGeometry args={[0.16, 0.13, 0.34, 24]} />
                <meshStandardMaterial color="#0D1422" metalness={0.82} roughness={0.22} />
              </mesh>
              <mesh position={[0, -0.175, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.13, 20]} />
                <meshStandardMaterial
                  color="#3978F6"
                  emissive="#42D9F5"
                  emissiveIntensity={0.35}
                  metalness={0.9}
                  roughness={0.1}
                />
              </mesh>
            </group>
          )}

          {/* Interferometric Altimeter / Neutron Spectrometer Boom */}
          {hasAltimeter && (
            <mesh position={[0.28, -(by / 2 + 0.22), -0.2]}>
              <boxGeometry args={[0.22, 0.3, 0.22]} />
              <meshStandardMaterial color="#38D996" metalness={0.65} roughness={0.3} />
            </mesh>
          )}
        </>
      )}
    </group>
  );
}

export interface SpacecraftSceneProps {
  bus: SpacecraftComponent;
  subsystems: SpacecraftComponent[];
  instruments: ScientificInstrument[];
  heightClass?: string;
  className?: string;
}

export function SpacecraftScene({
  bus,
  subsystems,
  instruments,
  heightClass = 'h-[420px]',
  className = '',
}: SpacecraftSceneProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [manualTrianaOverride, setManualTrianaOverride] = useState<boolean | null>(null);
  const [autoSpin, setAutoSpin] = useState(() => !prefersReducedMotion);
  const [trianaStatus, setTrianaStatus] = useState<'loading' | 'ready' | 'error'>('ready');

  const useTrianaMesh =
    manualTrianaOverride ?? bus.id === 'bus-medium-observatory';

  // Key ContactShadows on configuration signature so it bakes once per change (P1)
  const shadowKey = useMemo(
    () =>
      [
        bus.id,
        useTrianaMesh ? 'triana' : 'param',
        ...subsystems.map((s) => s.id),
        ...instruments.map((i) => i.id),
      ].join('|'),
    [bus.id, useTrianaMesh, subsystems, instruments]
  );

  return (
    <SceneCanvasGuard
      title="Spacecraft CAD Cleanroom Viewport"
      subtitle="3D CAD preview requires WebGL; all mass, power, and subsystem compatibility telemetry remains live in the engineering panels."
      heightClass={heightClass}
      className={className}
    >
      <div
        className={`relative w-full ${heightClass} overflow-hidden rounded-2xl border border-[#F1F5FA]/15 bg-[#080B12] ${className}`}
      >
        {/* Non-overlapping top flex HUD bar (R4) */}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-center justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-2">
            <span className="rounded-full border border-[#42D9F5]/35 bg-[#0D1422]/85 px-3 py-1 font-mono text-[11px] text-[#42D9F5] backdrop-blur-md">
              3D INTEGRATION BAY
            </span>
          </div>

          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAutoSpin((s) => !s)}
              className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${
                autoSpin
                  ? 'border-[#42D9F5]/60 bg-[#141E2E]/90 text-[#42D9F5]'
                  : 'border-[#F1F5FA]/15 bg-[#0D1422]/85 text-[#8E9BAD]'
              }`}
            >
              ROTATE: {autoSpin ? 'ON' : 'PAUSED'}
            </button>
            <button
              type="button"
              onClick={() => setManualTrianaOverride(!useTrianaMesh)}
              className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${
                useTrianaMesh
                  ? 'border-[#38D996]/60 bg-[#141E2E]/90 text-[#38D996]'
                  : 'border-[#F1F5FA]/15 bg-[#0D1422]/85 text-[#8E9BAD]'
              }`}
            >
              {useTrianaMesh ? 'MESH: TRIANA CAD' : 'MESH: PARAMETRIC S/C'}
            </button>
          </div>
        </div>

        {/* Rendered configuration / loading notice (R3, P2) */}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full border border-[#F1F5FA]/15 bg-[#0D1422]/85 px-3 py-1 font-mono text-[11px] text-[#8E9BAD] backdrop-blur-md">
            {useTrianaMesh
              ? trianaStatus === 'loading'
                ? 'Loading NASA Triana CAD...'
                : trianaStatus === 'error'
                  ? 'Triana CAD unavailable — switch to Parametric S/C'
                  : 'Reference Triana CAD · switch to Parametric for live subsystem view'
              : `Parametric CAD · ${subsystems.length}/6 subsystems + ${instruments.length} payload(s) active`}
          </span>
        </div>

        <Canvas
          dpr={prefersReducedMotion ? [1, 1] : [1, 1.75]}
          camera={{ position: [2.8, 1.75, 2.8], fov: 42 }}
        >
          <color attach="background" args={['#080B12']} />
          <ambientLight intensity={0.68} />
          <directionalLight position={[5, 6, 4]} intensity={1.85} color="#ffffff" />
          <directionalLight position={[-4, -2, -4]} intensity={0.55} color="#42D9F5" />
          <Stars
            radius={60}
            depth={30}
            count={prefersReducedMotion ? 400 : 1000}
            factor={2.2}
            saturation={0.1}
            fade
            speed={0}
          />

          <SpacecraftAssemblyModel
            bus={bus}
            subsystems={subsystems}
            instruments={instruments}
            useTrianaMesh={useTrianaMesh}
            autoSpin={autoSpin}
            onTrianaStatus={setTrianaStatus}
          />

          <ContactShadows
            key={shadowKey}
            frames={1}
            position={[0, -1.55, 0]}
            opacity={0.4}
            scale={7.5}
            blur={2.2}
            far={4.5}
          />
          <OrbitControls enablePan={false} minDistance={1.8} maxDistance={6.0} />
        </Canvas>
      </div>
    </SceneCanvasGuard>
  );
}

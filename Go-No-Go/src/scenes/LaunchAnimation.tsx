import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { SceneCanvasGuard } from './WebGLFallback';
import { usePrefersReducedMotion } from './webglUtils';

export type LaunchPhaseId =
  | 'PRELAUNCH_POLL'
  | 'LIFTOFF_MAXQ'
  | 'MECO_STAGE_SEP'
  | 'FAIRING_JETTISON'
  | 'SECO_DEPLOYMENT';

interface RocketAssemblyProps {
  phase: LaunchPhaseId;
  progress: number; // 0 to 1
  reducedMotion: boolean;
}

function RocketAssembly({ phase, progress, reducedMotion }: RocketAssemblyProps) {
  const rocketGroupRef = useRef<THREE.Group>(null);
  const liftoffPlumeRef = useRef<THREE.Mesh>(null);
  const vacuumPlumeRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (!reducedMotion) {
      const flicker = 0.85 + Math.sin(state.clock.elapsedTime * 35) * 0.16;
      if (liftoffPlumeRef.current) {
        liftoffPlumeRef.current.scale.set(1, flicker, 1);
      }
      if (vacuumPlumeRef.current) {
        vacuumPlumeRef.current.scale.set(1, flicker, 1);
      }
      if (rocketGroupRef.current && phase !== 'PRELAUNCH_POLL') {
        rocketGroupRef.current.rotation.y += delta * 0.35;
      }
    }
  });

  const stage1OffsetY =
    phase === 'MECO_STAGE_SEP' ||
    phase === 'FAIRING_JETTISON' ||
    phase === 'SECO_DEPLOYMENT'
      ? -1.45
      : 0;

  const fairingSpreadX =
    phase === 'FAIRING_JETTISON' ? 0.65 : phase === 'SECO_DEPLOYMENT' ? 2.5 : 0;

  const showFairing = phase !== 'SECO_DEPLOYMENT';
  const showSolarWings = phase === 'SECO_DEPLOYMENT';
  const engineActive = phase !== 'PRELAUNCH_POLL' && phase !== 'SECO_DEPLOYMENT';

  return (
    <group
      ref={rocketGroupRef}
      rotation={[
        0,
        0,
        phase === 'PRELAUNCH_POLL' ? 0 : Math.min(0.45, progress * 0.5),
      ]}
    >
      {/* First Stage Booster */}
      {phase !== 'SECO_DEPLOYMENT' && (
        <group position={[0, -0.85 + stage1OffsetY, 0]}>
          <mesh>
            <cylinderGeometry args={[0.28, 0.28, 1.5, 24]} />
            <meshStandardMaterial color="#DCE3ED" metalness={0.5} roughness={0.35} />
          </mesh>
          {/* Interstage band */}
          <mesh position={[0, 0.72, 0]}>
            <cylinderGeometry args={[0.285, 0.285, 0.18, 24]} />
            <meshStandardMaterial color="#0D1422" roughness={0.6} />
          </mesh>
          {/* First Stage Plume */}
          {phase === 'LIFTOFF_MAXQ' && (
            <mesh ref={liftoffPlumeRef} position={[0, -1.25, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.26, 1.1, 20]} />
              <meshBasicMaterial color="#FFB547" transparent opacity={0.88} />
            </mesh>
          )}
        </group>
      )}

      {/* Second Stage + Spacecraft Payload Adapter */}
      <group position={[0, 0.25, 0]}>
        <mesh>
          <cylinderGeometry args={[0.26, 0.27, 0.55, 24]} />
          <meshStandardMaterial color="#B9C4D4" metalness={0.6} roughness={0.3} />
        </mesh>

        {/* Second Stage Vacuum Engine Plume */}
        {engineActive && phase !== 'LIFTOFF_MAXQ' && (
          <mesh ref={vacuumPlumeRef} position={[0, -0.58, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.22, 0.75, 20]} />
            <meshBasicMaterial color="#42D9F5" transparent opacity={0.82} />
          </mesh>
        )}

        {/* Encapsulated Spacecraft Bus */}
        <group position={[0, 0.62, 0]}>
          <mesh>
            <boxGeometry args={[0.32, 0.42, 0.32]} />
            <meshStandardMaterial color="#C8922A" metalness={0.78} roughness={0.25} />
          </mesh>

          {/* Deployable Solar Wings at SECO */}
          {showSolarWings && (
            <>
              <mesh position={[0.65, 0, 0]}>
                <boxGeometry args={[0.9, 0.02, 0.28]} />
                <meshStandardMaterial
                  color="#141E2E"
                  emissive="#3978F6"
                  emissiveIntensity={0.25}
                />
              </mesh>
              <mesh position={[-0.65, 0, 0]}>
                <boxGeometry args={[0.9, 0.02, 0.28]} />
                <meshStandardMaterial
                  color="#141E2E"
                  emissive="#3978F6"
                  emissiveIntensity={0.25}
                />
              </mesh>
            </>
          )}
        </group>

        {/* Clamshell Payload Fairing Halves */}
        {showFairing && (
          <>
            <mesh position={[-fairingSpreadX, 0.72, 0]}>
              <cylinderGeometry
                args={[0.04, 0.29, 0.92, 16, 1, false, 0, Math.PI]}
              />
              <meshStandardMaterial
                color="#F1F5FA"
                metalness={0.4}
                roughness={0.4}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh position={[fairingSpreadX, 0.72, 0]}>
              <cylinderGeometry
                args={[0.04, 0.29, 0.92, 16, 1, false, Math.PI, Math.PI]}
              />
              <meshStandardMaterial
                color="#F1F5FA"
                metalness={0.4}
                roughness={0.4}
                side={THREE.DoubleSide}
              />
            </mesh>
          </>
        )}
      </group>
    </group>
  );
}

export interface LaunchAnimationProps {
  phase: LaunchPhaseId;
  progress: number;
  heightClass?: string;
  className?: string;
}

export function LaunchAnimation({
  phase,
  progress,
  heightClass = 'h-[420px]',
  className = '',
}: LaunchAnimationProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <SceneCanvasGuard
      title="Ascent & Orbital Injection Telemetry Cam"
      subtitle="3D rocket ascent viewport requires WebGL; flight ascent telemetry and stage separation timeline remain active."
      heightClass={heightClass}
      className={className}
    >
      <div
        className={`relative w-full ${heightClass} overflow-hidden rounded-2xl border border-[#F1F5FA]/15 bg-[#080B12] ${className}`}
      >
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2">
          <span className="rounded-full border border-[#42D9F5]/35 bg-[#0D1422]/85 px-3 py-1 font-mono text-[11px] text-[#42D9F5] backdrop-blur-md">
            ASCENT TELEMETRY CAM
          </span>
        </div>

        <Canvas
          dpr={prefersReducedMotion ? [1, 1] : [1, 1.75]}
          camera={{ position: [0, 0.4, 3.6], fov: 45 }}
        >
          <color attach="background" args={['#080B12']} />
          <ambientLight intensity={0.65} />
          <directionalLight position={[4, 6, 4]} intensity={1.85} color="#fff7ea" />
          <directionalLight position={[-3, -4, -2]} intensity={0.45} color="#42D9F5" />
          <Stars
            radius={80}
            depth={40}
            count={prefersReducedMotion ? 600 : 1600}
            factor={2.6}
            fade
          />

          <RocketAssembly
            phase={phase}
            progress={progress}
            reducedMotion={prefersReducedMotion}
          />

          <OrbitControls enablePan={false} minDistance={2.2} maxDistance={6.0} />
        </Canvas>
      </div>
    </SceneCanvasGuard>
  );
}

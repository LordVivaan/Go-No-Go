import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { SceneCanvasGuard } from './WebGLFallback';
import { usePrefersReducedMotion } from './webglUtils';

import { getLaunchAssemblyTargets, type LaunchPhaseId } from './launchAssembly';

export type { LaunchPhaseId };

interface RocketAssemblyProps {
  phase: LaunchPhaseId;
  progress: number; // 0 to 1
  reducedMotion: boolean;
}

function RocketAssembly({ phase, progress, reducedMotion }: RocketAssemblyProps) {
  const rocketGroupRef = useRef<THREE.Group>(null);
  const stage1GroupRef = useRef<THREE.Group>(null);
  const stage2GroupRef = useRef<THREE.Group>(null);
  const fairingPlusXRef = useRef<THREE.Mesh>(null);
  const fairingMinusXRef = useRef<THREE.Mesh>(null);
  const liftoffPlumeRef = useRef<THREE.Mesh>(null);
  const vacuumPlumeRef = useRef<THREE.Mesh>(null);

  const targets = getLaunchAssemblyTargets(phase);

  useFrame((state, delta) => {
    const damp = reducedMotion ? 1 : Math.min(1, delta * 4.5);

    if (stage1GroupRef.current) {
      stage1GroupRef.current.position.y = THREE.MathUtils.lerp(
        stage1GroupRef.current.position.y,
        targets.stage1OffsetY,
        damp
      );
    }

    if (stage2GroupRef.current) {
      stage2GroupRef.current.position.y = THREE.MathUtils.lerp(
        stage2GroupRef.current.position.y,
        targets.stage2OffsetY,
        damp
      );
    }

    if (fairingPlusXRef.current) {
      fairingPlusXRef.current.position.x = THREE.MathUtils.lerp(
        fairingPlusXRef.current.position.x,
        targets.fairingSpreadX,
        damp
      );
      fairingPlusXRef.current.position.y = THREE.MathUtils.lerp(
        fairingPlusXRef.current.position.y,
        1.01 + targets.fairingDropY,
        damp
      );
      fairingPlusXRef.current.rotation.z = THREE.MathUtils.lerp(
        fairingPlusXRef.current.rotation.z,
        -targets.fairingTiltRad,
        damp
      );
    }

    if (fairingMinusXRef.current) {
      fairingMinusXRef.current.position.x = THREE.MathUtils.lerp(
        fairingMinusXRef.current.position.x,
        -targets.fairingSpreadX,
        damp
      );
      fairingMinusXRef.current.position.y = THREE.MathUtils.lerp(
        fairingMinusXRef.current.position.y,
        1.01 + targets.fairingDropY,
        damp
      );
      fairingMinusXRef.current.rotation.z = THREE.MathUtils.lerp(
        fairingMinusXRef.current.rotation.z,
        targets.fairingTiltRad,
        damp
      );
    }

    if (!reducedMotion) {
      const flicker = 0.85 + Math.sin(state.clock.elapsedTime * 35) * 0.16;
      if (liftoffPlumeRef.current) {
        liftoffPlumeRef.current.scale.set(1, flicker, 1);
      }
      if (vacuumPlumeRef.current) {
        vacuumPlumeRef.current.scale.set(1, flicker, 1);
      }
      if (rocketGroupRef.current && phase !== 'PRELAUNCH_POLL') {
        rocketGroupRef.current.rotation.y += delta * 0.3;
      }
    }
  });

  return (
    <group
      ref={rocketGroupRef}
      position={[0, -0.25, 0]}
      rotation={[
        0,
        0,
        phase === 'PRELAUNCH_POLL' ? 0 : Math.min(0.42, progress * 0.45),
      ]}
    >
      {/* First Stage Booster (top mates flush at y = 0.0 with Second Stage bottom) */}
      {targets.showStage1 && (
        <group ref={stage1GroupRef} position={[0, targets.stage1OffsetY, 0]}>
          {/* Booster Core (-1.50 to 0.00) */}
          <mesh position={[0, -0.75, 0]}>
            <cylinderGeometry args={[0.28, 0.28, 1.5, 24]} />
            <meshStandardMaterial color="#DCE3ED" metalness={0.5} roughness={0.35} />
          </mesh>
          {/* Interstage Collar (-0.16 to 0.02) */}
          <mesh position={[0, -0.07, 0]}>
            <cylinderGeometry args={[0.282, 0.282, 0.18, 24]} />
            <meshStandardMaterial color="#0D1422" roughness={0.6} />
          </mesh>
          {/* Main Engine Bell (-1.66 to -1.50) */}
          <mesh position={[0, -1.58, 0]}>
            <cylinderGeometry args={[0.14, 0.22, 0.16, 20]} />
            <meshStandardMaterial color="#334155" metalness={0.75} roughness={0.35} />
          </mesh>
          {/* First Stage Plume */}
          {phase === 'LIFTOFF_MAXQ' && (
            <mesh ref={liftoffPlumeRef} position={[0, -2.18, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.25, 1.05, 20]} />
              <meshBasicMaterial color="#FFB547" transparent opacity={0.88} />
            </mesh>
          )}
        </group>
      )}

      {/* Second Stage + Vacuum Engine + Payload Adapter (0.00 to 0.72) */}
      <group ref={stage2GroupRef} position={[0, targets.stage2OffsetY, 0]}>
        {/* Second Stage Tank (0.00 to 0.55) */}
        <mesh position={[0, 0.275, 0]}>
          <cylinderGeometry args={[0.26, 0.275, 0.55, 24]} />
          <meshStandardMaterial color="#B9C4D4" metalness={0.6} roughness={0.3} />
        </mesh>

        {/* Payload Adapter Cone (0.55 to 0.72, seats spacecraft flush) */}
        <mesh position={[0, 0.635, 0]}>
          <cylinderGeometry args={[0.17, 0.25, 0.17, 24]} />
          <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.32} />
        </mesh>

        {/* Second Stage Vacuum Nozzle (-0.16 to 0.00) */}
        <mesh position={[0, -0.08, 0]}>
          <cylinderGeometry args={[0.1, 0.17, 0.16, 20]} />
          <meshStandardMaterial color="#334155" metalness={0.75} roughness={0.35} />
        </mesh>

        {/* Second Stage Vacuum Engine Plume */}
        {targets.engineActive && phase !== 'LIFTOFF_MAXQ' && (
          <mesh ref={vacuumPlumeRef} position={[0, -0.52, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.2, 0.72, 20]} />
            <meshBasicMaterial color="#42D9F5" transparent opacity={0.82} />
          </mesh>
        )}

        {/* Clamshell Payload Fairing Halves (+X half moves +X, -X half moves -X) */}
        {targets.showFairing && (
          <>
            <mesh
              ref={fairingPlusXRef}
              position={[targets.fairingSpreadX, 1.01 + targets.fairingDropY, 0]}
              rotation={[0, 0, -targets.fairingTiltRad]}
            >
              <cylinderGeometry
                args={[0.04, 0.285, 0.92, 16, 1, false, 0, Math.PI]}
              />
              <meshStandardMaterial
                color="#F1F5FA"
                metalness={0.4}
                roughness={0.4}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh
              ref={fairingMinusXRef}
              position={[-targets.fairingSpreadX, 1.01 + targets.fairingDropY, 0]}
              rotation={[0, 0, targets.fairingTiltRad]}
            >
              <cylinderGeometry
                args={[0.04, 0.285, 0.92, 16, 1, false, Math.PI, Math.PI]}
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

      {/* Spacecraft Bus seated flush at adapter top y = 0.72 (0.72 to 1.14) */}
      <group position={[0, 0.93, 0]}>
        <mesh>
          <boxGeometry args={[0.32, 0.42, 0.32]} />
          <meshStandardMaterial color="#C8922A" metalness={0.78} roughness={0.25} />
        </mesh>

        {/* Deployable Solar Wings connected flush to bus sides at ±0.16 */}
        {targets.showSolarWings && (
          <>
            <mesh position={[0.61, 0, 0]}>
              <boxGeometry args={[0.9, 0.02, 0.28]} />
              <meshStandardMaterial
                color="#141E2E"
                emissive="#3978F6"
                emissiveIntensity={0.25}
              />
            </mesh>
            <mesh position={[-0.61, 0, 0]}>
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
          camera={{ position: [0, 0.45, 3.9], fov: 45 }}
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

          <OrbitControls enablePan={false} minDistance={2.2} maxDistance={6.5} />
        </Canvas>
      </div>
    </SceneCanvasGuard>
  );
}

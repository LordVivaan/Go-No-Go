import { Line } from '@react-three/drei';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { DEG_TO_RAD } from '../engine/constants';
import { getBodyConstants, propagateKeplerianState } from '../engine/orbital';
import type { OrbitalParameters } from '../types/spacecraft';

interface OrbitPathProps {
  orbit: OrbitalParameters;
  periodSeconds: number;
  currentMetSeconds?: number;
  swathWidthKm?: number;
  showSwathCone?: boolean;
  subtle?: boolean;
}

export function OrbitPath({
  orbit,
  periodSeconds,
  currentMetSeconds = 0,
  swathWidthKm = 185,
  showSwathCone = true,
  subtle = false,
}: OrbitPathProps) {
  const { gmM3S2, radiusKm: bodyRadiusKm, j2, minSafeAltKm } = getBodyConstants(
    orbit.celestialBody
  );

  // Memoize the 128-segment orbital ring geometry on orbital elements + period only (P5),
  // avoiding 129 Keplerian evaluations on every simulation tick.
  const { baseOrbitPoints, raanDotRadS } = useMemo(() => {
    const segments = 128;
    const pts: [number, number, number][] = [];
    const safePeriod = Math.max(600, periodSeconds);

    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * safePeriod;
      const state = propagateKeplerianState(orbit, t);
      const [xKm, yKm, zKm] = state.positionEciKm;
      pts.push([
        xKm / bodyRadiusKm,
        zKm / bodyRadiusKm,
        -yKm / bodyRadiusKm,
      ]);
    }

    const safePerigeeAlt = Math.max(minSafeAltKm * 0.1, orbit.altitudePerigeeKm);
    const safeApogeeAlt = Math.max(safePerigeeAlt, orbit.altitudeApogeeKm);
    const rPerigeeKm = bodyRadiusKm + safePerigeeAlt;
    const rApogeeKm = bodyRadiusKm + safeApogeeAlt;
    const aKm = (rPerigeeKm + rApogeeKm) / 2;
    const e = Math.max(0, (rApogeeKm - rPerigeeKm) / (rApogeeKm + rPerigeeKm));
    const pKm = aKm * (1 - e * e);
    const aM = aKm * 1000;
    const meanMotionRadS = Math.sqrt(gmM3S2 / Math.pow(aM, 3));
    const iRad = orbit.inclinationDeg * DEG_TO_RAD;
    const raanRate =
      -1.5 * meanMotionRadS * j2 * Math.pow(bodyRadiusKm / pKm, 2) * Math.cos(iRad);

    return { baseOrbitPoints: pts, raanDotRadS: raanRate };
  }, [orbit, periodSeconds, bodyRadiusKm, gmM3S2, j2, minSafeAltKm]);

  // Propagate only the current spacecraft state per tick
  const spacecraftPosition = useMemo<[number, number, number]>(() => {
    const currentState = propagateKeplerianState(orbit, currentMetSeconds);
    const [cx, cy, cz] = currentState.positionEciKm;
    return [cx / bodyRadiusKm, cz / bodyRadiusKm, -cy / bodyRadiusKm];
  }, [orbit, currentMetSeconds, bodyRadiusKm]);

  // Apply secular J2 RAAN precession to the memoized ring around Three.js +Y (ECI +Z)
  const raanPrecessionRad = raanDotRadS * currentMetSeconds;

  const radialDist = Math.max(1e-6, Math.hypot(...spacecraftPosition));
  const altitudeUnits = Math.max(0.05, radialDist - 1.0);
  const swathRadiusUnits = Math.min(0.45, Math.max(0.03, (swathWidthKm / bodyRadiusKm) * 1.8));
  const swathMeshRef = useRef<THREE.Mesh>(null);

  useLayoutEffect(() => {
    if (swathMeshRef.current) {
      swathMeshRef.current.lookAt(0, 0, 0);
    }
  }, [spacecraftPosition]);

  return (
    <group>
      {/* Orbital Trajectory Ring (rotated smoothly by J2 nodal precession) */}
      <group rotation={[0, raanPrecessionRad, 0]}>
        <Line
          points={baseOrbitPoints}
          color="#42D9F5"
          lineWidth={subtle ? 1.4 : 2.1}
          transparent
          opacity={subtle ? 0.45 : 0.85}
        />
      </group>

      {/* Current Spacecraft Position Marker & Nadir Swath Footprint */}
      <group position={spacecraftPosition}>
        <mesh>
          <sphereGeometry args={[subtle ? 0.026 : 0.032, 16, 16]} />
          <meshBasicMaterial color="#38D996" />
        </mesh>
        <mesh>
          <ringGeometry args={[0.045, 0.062, 24]} />
          <meshBasicMaterial
            color="#42D9F5"
            side={2}
            transparent
            opacity={subtle ? 0.55 : 0.85}
          />
        </mesh>
      </group>

      {showSwathCone && (
        <Line
          points={[
            spacecraftPosition,
            [
              spacecraftPosition[0] / radialDist,
              spacecraftPosition[1] / radialDist,
              spacecraftPosition[2] / radialDist,
            ],
          ]}
          color="#38D996"
          lineWidth={1.5}
          dashed
          dashSize={0.04}
          gapSize={0.02}
          transparent
          opacity={0.75}
        />
      )}

      {/* Sub-satellite ground swath ring */}
      {showSwathCone && (
        <mesh
          ref={swathMeshRef}
          position={[
            (spacecraftPosition[0] / radialDist) * 1.004,
            (spacecraftPosition[1] / radialDist) * 1.004,
            (spacecraftPosition[2] / radialDist) * 1.004,
          ]}
        >
          <ringGeometry args={[swathRadiusUnits * 0.65, swathRadiusUnits, 32]} />
          <meshBasicMaterial
            color={altitudeUnits > 0.01 ? '#38D996' : '#42D9F5'}
            side={2}
            transparent
            opacity={0.65}
          />
        </mesh>
      )}
    </group>
  );
}

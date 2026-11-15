import type { OrbitalMechanicsResult } from '../types/engineering';
import type { OrbitalParameters } from '../types/spacecraft';
import {
  DEG_TO_RAD,
  EARTH_SIDEREAL_DAY_SEC,
  GM_ASTEROID_REF,
  GM_EARTH,
  GM_MARS,
  GM_MOON,
  J2_EARTH,
  OMEGA_EARTH_RAD_S,
  RAD_TO_DEG,
  R_ASTEROID_REF_KM,
  R_EARTH_EQ_KM,
  R_MARS_KM,
  R_MOON_KM,
  SECONDS_PER_DAY,
  SSO_NODAL_PRECESSION_DEG_PER_DAY,
} from './constants';

export function getBodyConstants(body: OrbitalParameters['celestialBody']) {
  switch (body) {
    case 'MOON':
      return { gmM3S2: GM_MOON, radiusKm: R_MOON_KM, j2: 0.0002027, minSafeAltKm: 15 };
    case 'MARS':
      return { gmM3S2: GM_MARS, radiusKm: R_MARS_KM, j2: 0.00196045, minSafeAltKm: 100 };
    case 'ASTEROID':
      return { gmM3S2: GM_ASTEROID_REF, radiusKm: R_ASTEROID_REF_KM, j2: 0.0, minSafeAltKm: 0.1 };
    default:
      return { gmM3S2: GM_EARTH, radiusKm: R_EARTH_EQ_KM, j2: J2_EARTH, minSafeAltKm: 120 };
  }
}

/**
 * Solves Kepler's Equation M = E - e * sin(E) for Eccentric Anomaly E (radians)
 * using safeguarded Newton-Raphson with bisection fallback for extreme eccentricities
 * up to e = 0.9999 to < 1e-11 rad tolerance.
 */
export function meanToEccentricAnomalyRad(eccentricity: number, meanAnomalyRad: number): number {
  const e = Math.max(0, Math.min(0.9999, eccentricity));
  const M = ((meanAnomalyRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (e === 0) return M;
  if (M === 0) return 0;

  let low = 0;
  let high = 2 * Math.PI;
  let E = e < 0.8 ? M : M < Math.PI ? Math.min(Math.PI, M + e) : Math.max(Math.PI, M - e);
  const tol = 1e-11;

  for (let iter = 0; iter < 60; iter++) {
    const f = E - e * Math.sin(E) - M;
    if (Math.abs(f) < tol) break;
    if (f < 0) {
      low = Math.max(low, E);
    } else {
      high = Math.min(high, E);
    }
    const fPrime = 1 - e * Math.cos(E);
    const candidate = fPrime > 1e-12 ? E - f / fPrime : (low + high) / 2;
    E = candidate > low && candidate < high ? candidate : (low + high) / 2;
  }
  return E;
}

/**
 * Converts Eccentric Anomaly E (rad) to True Anomaly nu (rad).
 */
export function eccentricToTrueAnomalyRad(eccentricity: number, eccentricAnomalyRad: number): number {
  const e = Math.max(0, Math.min(0.9999, eccentricity));
  const halfE = eccentricAnomalyRad / 2;
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(halfE), Math.sqrt(1 - e) * Math.cos(halfE));
  return ((nu % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

/**
 * Propagates a Keplerian orbit at elapsed time tSec (s) from epoch,
 * returning 3D ECI position (km), geodetic sub-satellite point (lat/lon/alt),
 * velocity (m/s), true anomaly (deg), and eclipse status.
 *
 * Limitations: Two-body Keplerian propagation + first-order secular J2 nodal precession only.
 * Atmospheric drag, solar radiation pressure (SRP), higher-order tesseral harmonics,
 * and third-body lunisolar perturbations are not modeled; not for flight-certified trajectory design.
 */
export function propagateKeplerianState(orbit: OrbitalParameters, elapsedSec: number) {
  const { gmM3S2, radiusKm, j2, minSafeAltKm } = getBodyConstants(orbit.celestialBody);
  const safePerigeeAlt = Math.max(minSafeAltKm * 0.1, orbit.altitudePerigeeKm);
  const safeApogeeAlt = Math.max(safePerigeeAlt, orbit.altitudeApogeeKm);
  const rPerigeeKm = radiusKm + safePerigeeAlt;
  const rApogeeKm = radiusKm + safeApogeeAlt;
  const aKm = (rPerigeeKm + rApogeeKm) / 2;
  const aM = aKm * 1000;
  const e = Math.max(0, (rApogeeKm - rPerigeeKm) / (rApogeeKm + rPerigeeKm));

  const meanMotionRadS = Math.sqrt(gmM3S2 / Math.pow(aM, 3));
  const m0Rad = orbit.meanAnomalyDeg * DEG_TO_RAD;
  const currentMRad = m0Rad + meanMotionRadS * elapsedSec;

  const E = meanToEccentricAnomalyRad(e, currentMRad);
  const nuRad = eccentricToTrueAnomalyRad(e, E);

  // Semi-latus rectum p = a * (1 - e^2)
  const pKm = aKm * (1 - e * e);
  const rKm = pKm / (1 + e * Math.cos(nuRad));
  const rM = rKm * 1000;

  // Vis-viva velocity v = sqrt(GM * (2/r - 1/a))
  const velocityMps = Math.sqrt(Math.max(0, gmM3S2 * (2 / rM - 1 / aM)));

  // Secular J2 nodal precession
  const iRad = orbit.inclinationDeg * DEG_TO_RAD;
  const raanDotRadS =
    -1.5 * meanMotionRadS * j2 * Math.pow(radiusKm / pKm, 2) * Math.cos(iRad);
  const raanRad = orbit.raanDeg * DEG_TO_RAD + raanDotRadS * elapsedSec;
  const argPRad = orbit.argPerigeeDeg * DEG_TO_RAD;
  const uRad = argPRad + nuRad; // Argument of latitude

  // ECI coordinates (km) where Z is North Pole, X-Y is Equatorial Plane
  const xEciKm = rKm * (Math.cos(raanRad) * Math.cos(uRad) - Math.sin(raanRad) * Math.sin(uRad) * Math.cos(iRad));
  const yEciKm = rKm * (Math.sin(raanRad) * Math.cos(uRad) + Math.cos(raanRad) * Math.sin(uRad) * Math.cos(iRad));
  const zEciKm = rKm * (Math.sin(uRad) * Math.sin(iRad));

  // Convert ECI to rotating body-fixed (ECEF for Earth) coordinates
  const bodyRotRate = orbit.celestialBody === 'EARTH' ? OMEGA_EARTH_RAD_S : 0;
  const gmstRad = bodyRotRate * elapsedSec;
  const xEcefKm = xEciKm * Math.cos(gmstRad) + yEciKm * Math.sin(gmstRad);
  const yEcefKm = -xEciKm * Math.sin(gmstRad) + yEciKm * Math.cos(gmstRad);
  const zEcefKm = zEciKm;

  const latitudeDeg = Math.asin(Math.max(-1, Math.min(1, zEcefKm / rKm))) * RAD_TO_DEG;
  const longitudeDeg = Math.atan2(yEcefKm, xEcefKm) * RAD_TO_DEG;
  const altitudeKm = rKm - radiusKm;

  // Cylindrical shadow check along anti-Sun direction (circular-equivalent approximation)
  const eclipseFraction = computeEclipseFraction(aKm, radiusKm, orbit.solarBetaAngleDeg);
  const orbitFraction = (((nuRad / (2 * Math.PI)) % 1) + 1) % 1;
  const halfEclipse = eclipseFraction / 2;
  const inEclipse = eclipseFraction > 0 && Math.abs(orbitFraction - 0.5) < halfEclipse;

  return {
    positionEciKm: [xEciKm, yEciKm, zEciKm] as [number, number, number],
    latitudeDeg: Number(latitudeDeg.toFixed(3)),
    longitudeDeg: Number(longitudeDeg.toFixed(3)),
    altitudeKm: Number(altitudeKm.toFixed(2)),
    velocityMps: Number(velocityMps.toFixed(2)),
    trueAnomalyDeg: Number((nuRad * RAD_TO_DEG).toFixed(2)),
    inEclipse,
  };
}

/**
 * Computes required retrograde Sun-Synchronous inclination (deg) from Earth altitude and eccentricity
 * using the J2 secular nodal precession condition (dOmega/dt = +0.9856 deg/day).
 */
export function computeSunSynchronousInclinationDeg(
  altitudeKm: number,
  eccentricity = 0
): number | null {
  if (altitudeKm <= 0) return null;
  const e = Math.max(0, Math.min(0.5, eccentricity));
  const aKm = R_EARTH_EQ_KM + altitudeKm;
  const aM = aKm * 1000;
  const pKm = aKm * (1 - e * e);
  const meanMotionRadS = Math.sqrt(GM_EARTH / Math.pow(aM, 3));
  const targetOmegaDotRadS = (SSO_NODAL_PRECESSION_DEG_PER_DAY * DEG_TO_RAD) / SECONDS_PER_DAY;
  const cosI = -targetOmegaDotRadS / (1.5 * meanMotionRadS * J2_EARTH * Math.pow(R_EARTH_EQ_KM / pKm, 2));
  if (cosI < -1 || cosI > 1) return null;
  return Number((Math.acos(cosI) * RAD_TO_DEG).toFixed(2));
}

/**
 * Cylindrical shadow eclipse fraction f_E in [0, 0.5]
 */
export function computeEclipseFraction(
  semiMajorAxisKm: number,
  bodyRadiusKm: number,
  solarBetaAngleDeg: number
): number {
  const ratio = Math.min(0.9999, bodyRadiusKm / Math.max(bodyRadiusKm + 0.1, semiMajorAxisKm));
  const betaCritRad = Math.asin(ratio);
  const betaRad = Math.abs(solarBetaAngleDeg) * DEG_TO_RAD;

  if (betaRad >= betaCritRad) {
    return 0.0; // Full-sun Dawn-Dusk orbit
  }
  const cosTerm = Math.sqrt(1 - ratio * ratio) / Math.cos(betaRad);
  const clamped = Math.max(-1, Math.min(1, cosTerm));
  return Math.acos(clamped) / Math.PI;
}

/**
 * Evaluates full Orbital Mechanics characteristics for the Orbit Planner and Engineering Engine.
 * Units: radius/SMA (km), velocity (m/s), period (s, min), nodal precession (deg/day).
 * Limitations: Two-body Keplerian + J2 secular precession; excludes drag, SRP, and third-body forces.
 */
export function evaluateOrbitalMechanics(
  orbit: OrbitalParameters,
  effectiveSwathWidthKm = 80
): OrbitalMechanicsResult {
  const { gmM3S2, radiusKm, j2, minSafeAltKm } = getBodyConstants(orbit.celestialBody);

  const reasons: string[] = [];
  if (orbit.altitudePerigeeKm < minSafeAltKm) {
    reasons.push(
      `Perigee altitude (${orbit.altitudePerigeeKm} km) is below minimum safe ${orbit.celestialBody} altitude (${minSafeAltKm} km).`
    );
  }
  if (orbit.altitudeApogeeKm < orbit.altitudePerigeeKm) {
    reasons.push(
      `Apogee altitude (${orbit.altitudeApogeeKm} km) cannot be less than perigee altitude (${orbit.altitudePerigeeKm} km).`
    );
  }
  if (orbit.inclinationDeg < 0 || orbit.inclinationDeg > 180) {
    reasons.push(`Inclination (${orbit.inclinationDeg}°) must lie within [0°, 180°].`);
  }

  const isValidOrbit = reasons.length === 0;
  const safePerigeeAlt = Math.max(minSafeAltKm * 0.1, orbit.altitudePerigeeKm);
  const safeApogeeAlt = Math.max(safePerigeeAlt, orbit.altitudeApogeeKm);

  const perigeeRadiusKm = radiusKm + safePerigeeAlt;
  const apogeeRadiusKm = radiusKm + safeApogeeAlt;
  const semiMajorAxisKm = (perigeeRadiusKm + apogeeRadiusKm) / 2;
  const eccentricity = (apogeeRadiusKm - perigeeRadiusKm) / (apogeeRadiusKm + perigeeRadiusKm);

  const aM = semiMajorAxisKm * 1000;
  const rpM = perigeeRadiusKm * 1000;
  const raM = apogeeRadiusKm * 1000;

  const velocityPerigeeMps = Math.sqrt(gmM3S2 * (2 / rpM - 1 / aM));
  const velocityApogeeMps = Math.sqrt(gmM3S2 * (2 / raM - 1 / aM));
  const meanVelocityMps = Math.sqrt(gmM3S2 / aM);

  const orbitalPeriodSec = 2 * Math.PI * Math.sqrt(Math.pow(aM, 3) / gmM3S2);
  const orbitalPeriodMin = orbitalPeriodSec / 60.0;
  const orbitsPerDay = SECONDS_PER_DAY / orbitalPeriodSec;

  const eclipseFraction = computeEclipseFraction(semiMajorAxisKm, radiusKm, orbit.solarBetaAngleDeg);
  const eclipseDurationSec = orbitalPeriodSec * eclipseFraction;
  const sunlightDurationSec = orbitalPeriodSec - eclipseDurationSec;

  // Secular J2 nodal regression rate (deg/day)
  const meanMotionRadS = (2 * Math.PI) / orbitalPeriodSec;
  const pKm = semiMajorAxisKm * (1 - eccentricity * eccentricity);
  const iRad = orbit.inclinationDeg * DEG_TO_RAD;
  const raanDotRadS = -1.5 * meanMotionRadS * j2 * Math.pow(radiusKm / pKm, 2) * Math.cos(iRad);
  const nodalPrecessionDegPerDay = raanDotRadS * RAD_TO_DEG * SECONDS_PER_DAY;

  const isSunSynchronous =
    isValidOrbit &&
    orbit.celestialBody === 'EARTH' &&
    Math.abs(nodalPrecessionDegPerDay - SSO_NODAL_PRECESSION_DEG_PER_DAY) <= 0.05;

  const isGeostationary =
    isValidOrbit &&
    orbit.celestialBody === 'EARTH' &&
    eccentricity < 0.01 &&
    Math.abs(orbit.inclinationDeg) <= 2.0 &&
    Math.abs(orbitalPeriodSec - EARTH_SIDEREAL_DAY_SEC) <= 120.0;

  // Approximate mid-latitude revisit interval (hours) accounting for ascending/descending nodes & off-nadir field-of-regard
  const equatorialTrackSpacingKm = (2 * Math.PI * radiusKm * Math.cos(24 * DEG_TO_RAD)) / orbitsPerDay;
  const effectiveSwath = Math.max(20, effectiveSwathWidthKm);
  const revisitHours = Math.max(
    1.5,
    Math.min(120, (equatorialTrackSpacingKm / (effectiveSwath * 2.2)) * 2.4)
  );

  return {
    semiMajorAxisKm: Number(semiMajorAxisKm.toFixed(2)),
    eccentricity: Number(eccentricity.toFixed(5)),
    perigeeRadiusKm: Number(perigeeRadiusKm.toFixed(2)),
    apogeeRadiusKm: Number(apogeeRadiusKm.toFixed(2)),
    velocityPerigeeMps: Number(velocityPerigeeMps.toFixed(1)),
    velocityApogeeMps: Number(velocityApogeeMps.toFixed(1)),
    meanVelocityMps: Number(meanVelocityMps.toFixed(1)),
    orbitalPeriodSec: Number(orbitalPeriodSec.toFixed(1)),
    orbitalPeriodMin: Number(orbitalPeriodMin.toFixed(2)),
    orbitsPerDay: Number(orbitsPerDay.toFixed(2)),
    eclipseFraction: Number(eclipseFraction.toFixed(4)),
    sunlightDurationSec: Number(sunlightDurationSec.toFixed(1)),
    eclipseDurationSec: Number(eclipseDurationSec.toFixed(1)),
    nodalPrecessionDegPerDay: Number(nodalPrecessionDegPerDay.toFixed(4)),
    isSunSynchronous,
    isGeostationary,
    isValidOrbit,
    orbitValidationMessage: reasons.length > 0 ? reasons.join(' ') : undefined,
    revisitHours: Number(revisitHours.toFixed(1)),
    traces: [
      {
        id: 'orbital-vis-viva',
        title: 'Vis-Viva Orbital Velocity & Keplerian Period',
        symbolicEquation: 'v = √[μ (2/r - 1/a)];   T = 2π √(a³ / μ)',
        classification: 'PHYSICAL_LAW',
        referenceStandard: 'NASA/TM-20210000030 & Bate, Mueller, White (Astrodynamics)',
        inputs: {
          mu: { value: gmM3S2, unit: 'm³ s⁻²', description: 'Standard gravitational parameter μ' },
          a: { value: Number(semiMajorAxisKm.toFixed(2)), unit: 'km', description: 'Semi-major axis' },
          e: { value: Number(eccentricity.toFixed(4)), unit: '-', description: 'Orbital eccentricity' },
        },
        output: {
          value: Number(meanVelocityMps.toFixed(1)),
          unit: 'm/s',
          formatted: `v = ${meanVelocityMps.toFixed(1)} m/s | T = ${orbitalPeriodMin.toFixed(1)} min`,
        },
        notes: 'Two-body Keplerian model; excludes atmospheric drag, SRP, and third-body perturbations (educational/conceptual only).',
      },
      {
        id: 'orbital-j2-sso',
        title: 'Secular J₂ Nodal Precession Rate',
        symbolicEquation: 'Ω̇_J2 = -(3/2) n J₂ (R_E / [a(1 - e²)])² cos(i)',
        classification: 'PHYSICAL_LAW',
        referenceStandard: 'EGM2008 / SMAD Ch. 9 Orbit Perturbations',
        inputs: {
          J2: { value: j2, unit: '-', description: 'Second zonal harmonic J₂' },
          inclination: { value: orbit.inclinationDeg, unit: 'deg', description: 'Orbital inclination i' },
          betaAngle: { value: orbit.solarBetaAngleDeg, unit: 'deg', description: 'Solar beta angle β' },
        },
        output: {
          value: Number(nodalPrecessionDegPerDay.toFixed(4)),
          unit: 'deg/day',
          formatted: `${nodalPrecessionDegPerDay.toFixed(3)}°/day (${isSunSynchronous ? 'Sun-Synchronous' : isGeostationary ? 'Geostationary' : 'Non-SSO'})`,
        },
        notes: 'Earth Sun-Synchronous condition requires Ω̇ ≈ +0.9856°/day (360° / 365.2422 days); GEO requires T ≈ 86,164 s, e ≈ 0, i ≈ 0°.',
      },
    ],
  };
}

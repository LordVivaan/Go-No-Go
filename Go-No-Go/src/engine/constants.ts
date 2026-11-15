/**
 * Verified Physical & Astrodynamic Constants in SI Units
 * Sources: IAU 2015 Resolution B3, WGS-84 / EGM2008, CODATA 2018, ISO 80000-3
 */

/** Earth standard gravitational parameter GM (m^3 s^-2) — WGS-84 */
export const GM_EARTH = 3.986004418e14;

/** Moon standard gravitational parameter GM (m^3 s^-2) — JPL DE440 */
export const GM_MOON = 4.9048695e12;

/** Mars standard gravitational parameter GM (m^3 s^-2) — JPL DE440 */
export const GM_MARS = 4.282837e13;

/** Illustrative NEA (Bennu-class ~500 m rubble-pile asteroid) GM (m^3 s^-2) — OSIRIS-REx reference */
export const GM_ASTEROID_REF = 4.892;

/** Earth equatorial radius R_E (m) — WGS-84 */
export const R_EARTH_EQ_M = 6378137.0;
export const R_EARTH_EQ_KM = 6378.137;

/** Moon mean radius (km) */
export const R_MOON_KM = 1737.4;

/** Mars equatorial radius (km) */
export const R_MARS_KM = 3396.2;

/** Illustrative NEA mean radius (km) */
export const R_ASTEROID_REF_KM = 0.245;

/** Earth second dynamic form factor J2 (dimensionless) — EGM2008 */
export const J2_EARTH = 1.08262668e-3;

/** Earth inertial rotation rate omega_E (rad s^-1) — WGS-84 */
export const OMEGA_EARTH_RAD_S = 7.2921150e-5;

/** Earth sidereal rotation period (s) = 2*pi / omega_E (~86,164.09 s = 23h 56m 4.09s) */
export const EARTH_SIDEREAL_DAY_SEC = (2 * Math.PI) / OMEGA_EARTH_RAD_S;

/** Required nodal precession rate for an Earth Sun-Synchronous Orbit (deg/day and rad/s) */
export const SSO_NODAL_PRECESSION_DEG_PER_DAY = 360.0 / 365.2421897; // +0.985647 deg/day
export const SSO_NODAL_PRECESSION_RAD_S = (SSO_NODAL_PRECESSION_DEG_PER_DAY * Math.PI) / (180.0 * 86400.0);

/** Astronomical Unit (m) — IAU 2012 Resolution B2 exact */
export const ASTRONOMICAL_UNIT_M = 149597870700.0;

/** Total Solar Irradiance at 1 AU G_0 (W m^-2) — IAU 2015 Resolution B3 */
export const SOLAR_CONSTANT_1AU_W_M2 = 1361.0;

/** Solar irradiance at Mars mean orbit 1.524 AU (W m^-2): 1361 / 1.524^2 */
export const SOLAR_CONSTANT_MARS_W_M2 = 586.0;

/** Mean Earth-to-target distances for deep-space link range estimation (km) */
export const EARTH_MOON_MEAN_DISTANCE_KM = 384400.0;
export const EARTH_MARS_MEAN_DISTANCE_KM = 225000000.0;
export const EARTH_NEA_REFERENCE_DISTANCE_KM = 15000000.0;

/** Stefan-Boltzmann constant sigma (W m^-2 K^-4) — CODATA 2018 */
export const STEFAN_BOLTZMANN = 5.670374419e-8;

/** Boltzmann constant k_B (J K^-1) and in dBW K^-1 Hz^-1 — CODATA 2018 */
export const BOLTZMANN_K = 1.380649e-23;
export const BOLTZMANN_DBW_PER_K_HZ = -228.599167;

/** Speed of light in vacuum c (m s^-1) — CODATA */
export const SPEED_OF_LIGHT_M_S = 299792458.0;

/** Standard sea-level gravitational acceleration g_0 (m s^-2) — ISO 80000-3 */
export const STANDARD_GRAVITY_M_S2 = 9.80665;

/** Exact SI temperature offset between Celsius and Kelvin (K) */
export const KELVIN_OFFSET = 273.15;

/** Exact SI energy conversion: 1 Wh = 3600 J */
export const JOULES_PER_WATT_HOUR = 3600.0;

/** Seconds per solar day */
export const SECONDS_PER_DAY = 86400.0;

/** Degrees to radians and radians to degrees conversion factors */
export const DEG_TO_RAD = Math.PI / 180.0;
export const RAD_TO_DEG = 180.0 / Math.PI;

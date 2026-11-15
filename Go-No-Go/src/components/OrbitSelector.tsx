import { Compass, Orbit } from 'lucide-react';
import { getShortOrbitName } from '../data/displayNames';
import { ORBIT_CATALOG } from '../data/orbits';
import { computeSunSynchronousInclinationDeg } from '../engine/orbital';
import type { OrbitalMechanicsResult } from '../types/engineering';
import type { OrbitalParameters } from '../types/spacecraft';

export interface OrbitSelectorProps {
  selectedOrbit: OrbitalParameters;
  orbitalResult: OrbitalMechanicsResult;
  onSelectOrbit: (orbitId: string) => void;
  onCustomChange: (
    perigeeKm: number | null,
    inclinationDeg: number | null,
    apogeeKm?: number | null
  ) => void;
}

export function OrbitSelector({
  selectedOrbit,
  orbitalResult,
  onSelectOrbit,
  onCustomChange,
}: OrbitSelectorProps) {
  return (
    <div className="space-y-4">
      {/* Preset Orbit Cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {ORBIT_CATALOG.map((orb) => {
          const active = orb.id === selectedOrbit.id;
          return (
            <button
              key={orb.id}
              type="button"
              onClick={() => onSelectOrbit(orb.id)}
              title={orb.name}
              className={`flex h-full min-w-0 flex-col justify-between rounded-2xl border p-4 text-left transition-colors ${
                active
                  ? 'border-2 border-[#42D9F5] bg-[#141E2E]/90'
                  : 'border-[#F1F5FA]/12 bg-[#0D1422]/75 hover:border-[#F1F5FA]/28'
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold text-[#42D9F5]">
                    {orb.regime} · {orb.celestialBody}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-[#38D996]">
                    {orb.altitudePerigeeKm} km · i={orb.inclinationDeg}°
                  </span>
                </div>
                <h4 className="mt-1 break-words font-display text-sm font-bold text-[#F1F5FA]">
                  {getShortOrbitName(orb)}
                </h4>
                <p className="mt-1 break-words text-xs leading-relaxed text-[#8E9BAD]">
                  {orb.description}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-[#F1F5FA]/10 pt-2.5 font-mono text-[11px] tabular-nums text-[#8E9BAD]">
                <span>Beta β={orb.solarBetaAngleDeg}°</span>
                <span>·</span>
                <span>Δv Req: {orb.requiredDeltaVReserveMps} m/s</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom Perigee, Apogee & Inclination Fine-Tuning Controls */}
      <div className="gng-glass-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1F5FA]/10 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Compass className="h-4 w-4 text-[#42D9F5]" />
            <h4 className="font-display text-sm font-bold text-[#F1F5FA]">
              Orbital Element Fine-Tuning (Vis-Viva & J₂)
            </h4>
            <span className="rounded-full border border-[#42D9F5]/30 bg-[#42D9F5]/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#42D9F5]">
              e = {orbitalResult.eccentricity.toFixed(4)} (
              {orbitalResult.eccentricity > 0.002 ? 'Elliptical' : 'Circular'})
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onCustomChange(
                  selectedOrbit.altitudePerigeeKm,
                  selectedOrbit.inclinationDeg,
                  selectedOrbit.altitudePerigeeKm
                )
              }
              className="rounded-full border border-[#F1F5FA]/20 bg-[#080B12]/75 px-3 py-1 font-mono text-[11px] text-[#F1F5FA] transition-colors hover:border-[#42D9F5]/50 hover:text-[#42D9F5]"
            >
              Match Perigee (Circular)
            </button>
            {selectedOrbit.celestialBody === 'EARTH' &&
              selectedOrbit.altitudePerigeeKm <= 5900 && (
                <button
                  type="button"
                  onClick={() => {
                    const ssoInc = computeSunSynchronousInclinationDeg(
                      (selectedOrbit.altitudePerigeeKm + selectedOrbit.altitudeApogeeKm) / 2
                    );
                    if (ssoInc !== null) {
                      onCustomChange(
                        selectedOrbit.altitudePerigeeKm,
                        ssoInc,
                        selectedOrbit.altitudeApogeeKm
                      );
                    }
                  }}
                  className="rounded-full border border-[#42D9F5]/50 bg-[#080B12]/75 px-3 py-1 font-mono text-[11px] font-semibold text-[#42D9F5] transition-colors hover:bg-[#42D9F5]/15"
                >
                  Solve J₂ SSO Inclination
                </button>
              )}
            <button
              type="button"
              onClick={() => onCustomChange(null, null, null)}
              className="rounded-full border border-[#F1F5FA]/15 bg-[#080B12]/75 px-3 py-1 font-mono text-[11px] text-[#8E9BAD] transition-colors hover:text-[#F1F5FA]"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Perigee Altitude */}
          <div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[#8E9BAD]">Perigee Altitude (hₚ)</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  aria-label="Perigee altitude input in kilometers"
                  min={250}
                  max={35786}
                  step={10}
                  value={selectedOrbit.altitudePerigeeKm}
                  onChange={(e) => {
                    const nextP = Math.max(250, Math.min(35786, Number(e.target.value) || 250));
                    onCustomChange(
                      nextP,
                      selectedOrbit.inclinationDeg,
                      Math.max(nextP, selectedOrbit.altitudeApogeeKm)
                    );
                  }}
                  className="w-20 rounded border border-white/15 bg-[#080B12] px-1.5 py-0.5 text-right font-mono text-xs font-bold tabular-nums text-[#42D9F5] outline-none focus:border-[#42D9F5]"
                />
                <span className="font-mono text-[11px] text-[#8E9BAD]">km</span>
              </div>
            </div>
            <input
              type="range"
              aria-label="Perigee orbital altitude in kilometers"
              min={250}
              max={selectedOrbit.altitudePerigeeKm > 2000 ? 35786 : 2000}
              step={10}
              value={Math.min(
                selectedOrbit.altitudePerigeeKm > 2000 ? 35786 : 2000,
                selectedOrbit.altitudePerigeeKm
              )}
              onChange={(e) => {
                const nextP = Number(e.target.value);
                onCustomChange(
                  nextP,
                  selectedOrbit.inclinationDeg,
                  Math.max(nextP, selectedOrbit.altitudeApogeeKm)
                );
              }}
              className="mt-2 w-full accent-[#42D9F5]"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-[#8E9BAD]">
              <span>250 km</span>
              <span>550 km</span>
              <span>{selectedOrbit.altitudePerigeeKm > 2000 ? '35,786 km' : '2,000 km'}</span>
            </div>
          </div>

          {/* Apogee Altitude */}
          <div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[#8E9BAD]">Apogee Altitude (hₐ)</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  aria-label="Apogee altitude input in kilometers"
                  min={selectedOrbit.altitudePerigeeKm}
                  max={36000}
                  step={10}
                  value={selectedOrbit.altitudeApogeeKm}
                  onChange={(e) => {
                    const nextA = Math.max(
                      selectedOrbit.altitudePerigeeKm,
                      Math.min(36000, Number(e.target.value) || selectedOrbit.altitudePerigeeKm)
                    );
                    onCustomChange(
                      selectedOrbit.altitudePerigeeKm,
                      selectedOrbit.inclinationDeg,
                      nextA
                    );
                  }}
                  className="w-20 rounded border border-white/15 bg-[#080B12] px-1.5 py-0.5 text-right font-mono text-xs font-bold tabular-nums text-[#38D996] outline-none focus:border-[#38D996]"
                />
                <span className="font-mono text-[11px] text-[#8E9BAD]">km</span>
              </div>
            </div>
            <input
              type="range"
              aria-label="Apogee orbital altitude in kilometers"
              min={selectedOrbit.altitudePerigeeKm}
              max={selectedOrbit.altitudeApogeeKm > 2000 ? 36000 : 2000}
              step={10}
              value={Math.min(
                selectedOrbit.altitudeApogeeKm > 2000 ? 36000 : 2000,
                Math.max(selectedOrbit.altitudePerigeeKm, selectedOrbit.altitudeApogeeKm)
              )}
              onChange={(e) =>
                onCustomChange(
                  selectedOrbit.altitudePerigeeKm,
                  selectedOrbit.inclinationDeg,
                  Number(e.target.value)
                )
              }
              className="mt-2 w-full accent-[#38D996]"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-[#8E9BAD]">
              <span>hₚ ({selectedOrbit.altitudePerigeeKm} km)</span>
              <span>{selectedOrbit.altitudeApogeeKm > 2000 ? '36,000 km' : '2,000 km'}</span>
            </div>
          </div>

          {/* Orbital Inclination */}
          <div>
            <div className="flex justify-between text-xs">
              <span className="text-[#8E9BAD]">Orbital Inclination (i)</span>
              <span className="font-mono font-bold tabular-nums text-[#42D9F5]">
                {selectedOrbit.inclinationDeg.toFixed(2)}°
              </span>
            </div>
            <input
              type="range"
              aria-label="Orbital inclination in degrees"
              min={0}
              max={105}
              step={0.1}
              value={selectedOrbit.inclinationDeg}
              onChange={(e) =>
                onCustomChange(
                  selectedOrbit.altitudePerigeeKm,
                  Number(e.target.value),
                  selectedOrbit.altitudeApogeeKm
                )
              }
              className="mt-2 w-full accent-[#42D9F5]"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-[#8E9BAD]">
              <span>0° (Eq)</span>
              <span>51.6° (ISS)</span>
              <span>97.6° (SSO)</span>
            </div>
          </div>
        </div>

        {/* Live Computed Astrodynamics Telemetry Strip */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="gng-glass-card p-3">
            <div className="flex items-center gap-1 text-[11px] text-[#8E9BAD]">
              <Orbit className="h-3.5 w-3.5 text-[#42D9F5]" /> Velocity
            </div>
            <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[#F1F5FA]">
              {orbitalResult.meanVelocityMps} m/s
            </div>
          </div>

          <div className="gng-glass-card p-3">
            <div className="text-[11px] text-[#8E9BAD]">Orbital Period</div>
            <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[#F1F5FA]">
              {orbitalResult.orbitalPeriodMin} min ({orbitalResult.orbitsPerDay}/d)
            </div>
          </div>

          <div className="gng-glass-card p-3">
            <div className="text-[11px] text-[#8E9BAD]">Eclipse Fraction</div>
            <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[#FFB547]">
              {(orbitalResult.eclipseFraction * 100).toFixed(1)}% (
              {Math.round(orbitalResult.eclipseDurationSec / 60)}m)
            </div>
          </div>

          <div className="gng-glass-card p-3">
            <div className="text-[11px] text-[#8E9BAD]">J₂ Nodal Precession</div>
            <div className="mt-1 font-mono text-sm font-bold tabular-nums text-[#38D996]">
              {orbitalResult.nodalPrecessionDegPerDay}°/d{' '}
              {orbitalResult.isSunSynchronous ? '(SSO)' : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

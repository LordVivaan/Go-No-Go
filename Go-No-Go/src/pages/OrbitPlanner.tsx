import { Link } from 'react-router';
import { ArrowRight, CheckCircle2, Compass, Rocket, XCircle } from 'lucide-react';
import { LAUNCH_VEHICLES } from '../data/launchVehicles';
import { getLaunchCapacityForRegimeKg } from '../engine/mass';
import { EarthScene } from '../scenes/EarthScene';
import { useMissionStore, useResolvedMission } from '../store/missionStore';
import { OrbitSelector } from '../components/OrbitSelector';
import { ResourcePanel } from '../components/ResourcePanel';

export function OrbitPlanner() {
  const launchVehicleId = useMissionStore((s) => s.launchVehicleId);
  const selectOrbit = useMissionStore((s) => s.selectOrbit);
  const setCustomOrbitParams = useMissionStore((s) => s.setCustomOrbitParams);
  const selectLaunchVehicle = useMissionStore((s) => s.selectLaunchVehicle);

  const { scenario, bus, orbit, instruments, engineering } = useResolvedMission();
  const maxSwathKm = instruments.reduce((m, i) => Math.max(m, i.swathWidthKm), 185);
  const busFormFactor = bus.compatibleFormFactors[0];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
      {/* Header */}
      <div className="gng-glass-panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-[#42D9F5]" aria-hidden="true" />
            <span className="font-mono-tech text-[11px] font-semibold uppercase tracking-widest text-[#42D9F5]">
              Astrodynamics & Launch Fairing — {scenario.code}
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold text-[#F1F5FA]">
            Select Target Orbit & Launch Vehicle
          </h1>
          <p className="text-xs text-[#8E9BAD]">
            Altitude, inclination, and launcher throw mass directly govern eclipse duration,
            ground-station passes/day, RF link margin, and Δv reserves.
          </p>
        </div>

        <Link
          to="/verification"
          className="flex items-center gap-2 rounded-full bg-[#42D9F5] px-5 py-2.5 text-xs font-bold text-[#080B12] transition hover:bg-[#42D9F5]/90"
        >
          VERIFY GO / NO-GO
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {/* Main Split: Orbit + Launcher Controls (Left) | 3D Globe + Budgets (Right) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-7">
          <div className="gng-glass-panel space-y-3 p-4">
            <h2 className="font-mono-tech text-xs font-semibold uppercase tracking-wider text-[#F1F5FA]">
              Orbital Regime & Custom Keplerian Tuning
            </h2>
            <OrbitSelector
              selectedOrbit={orbit}
              orbitalResult={engineering.orbital}
              onSelectOrbit={selectOrbit}
              onCustomChange={setCustomOrbitParams}
            />
          </div>

          <div className="gng-glass-panel space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-[#42D9F5]" aria-hidden="true" />
              <h2 className="font-mono-tech text-xs font-semibold uppercase tracking-wider text-[#F1F5FA]">
                Launch Vehicle Selection
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {LAUNCH_VEHICLES.map((lv) => {
                const selected = lv.id === launchVehicleId;
                const payloadCap = getLaunchCapacityForRegimeKg(lv, orbit.regime);
                const supportsFormFactor =
                  !busFormFactor || lv.supportedFormFactors.includes(busFormFactor);
                const overMass = engineering.mass.wetMassKg > payloadCap;
                const incompatible = !supportsFormFactor || overMass;

                return (
                  <button
                    key={lv.id}
                    type="button"
                    onClick={() => selectLaunchVehicle(lv.id)}
                    className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition-colors ${
                      selected
                        ? incompatible
                          ? 'border-2 border-[#FF5364] bg-[#261119]/90'
                          : 'border-2 border-[#42D9F5] bg-[#141E2E]/90'
                        : 'border-[#F1F5FA]/12 bg-[#0D1422]/75 hover:border-[#F1F5FA]/28'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono-tech text-[11px] uppercase tracking-wider text-[#8E9BAD]">
                            {lv.provider}
                          </span>
                          <h3 className="font-display text-sm font-bold text-[#F1F5FA]">
                            {lv.name}
                          </h3>
                        </div>
                        {selected ? (
                          incompatible ? (
                            <XCircle className="h-4 w-4 shrink-0 text-[#FF5364]" aria-hidden="true" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#38D996]" aria-hidden="true" />
                          )
                        ) : null}
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                            incompatible
                              ? 'border border-[#FF5364]/40 bg-[#FF5364]/15 text-[#FF5364]'
                              : 'border border-[#38D996]/40 bg-[#38D996]/15 text-[#38D996]'
                          }`}
                        >
                          {!supportsFormFactor
                            ? `INCOMPATIBLE (${busFormFactor} ADAPTER)`
                            : overMass
                              ? `OVER REGIME CAP (${engineering.mass.wetMassKg.toFixed(0)} > ${payloadCap} kg)`
                              : 'COMPATIBLE'}
                        </span>
                        <span className="font-mono text-[10px] text-[#8E9BAD]">
                          Adapters: {lv.supportedFormFactors.join(', ')}
                        </span>
                      </div>

                      <p className="mt-1.5 text-xs leading-snug text-[#8E9BAD]">
                        {lv.description}
                      </p>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#F1F5FA]/10 pt-2.5 font-mono-tech text-[11px] tabular-nums">
                      <span className={overMass ? 'text-[#FF5364]' : 'text-[#38D996]'}>
                        {orbit.regime} Cap: {payloadCap} kg
                      </span>
                      <span className="text-[#F1F5FA]">${lv.costMusd}M</span>
                      <span className="text-[#8E9BAD]">
                        Rel {(lv.reliability * 100).toFixed(1)}%
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-5">
          <EarthScene
            celestialBody={scenario.celestialBody}
            orbit={orbit}
            periodSeconds={engineering.orbital.orbitalPeriodSec}
            swathWidthKm={maxSwathKm}
            targetRegions={scenario.targetRegions}
            showGroundStations={true}
            showSwathCone={true}
            showMoonInBackground={scenario.celestialBody === 'EARTH'}
            heightClass="h-[360px]"
          />
          <ResourcePanel engineering={engineering} budgetCapMusd={scenario.budgetCapMusd} />
        </div>
      </div>
    </div>
  );
}

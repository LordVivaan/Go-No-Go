import { Link } from 'react-router';
import { ArrowLeft, ArrowRight, CheckCircle2, Compass, Rocket, XCircle } from 'lucide-react';
import { LAUNCH_VEHICLES } from '../data/launchVehicles';
import { getLaunchCapacityForRegimeKg } from '../engine/mass';
import { EarthScene } from '../scenes/EarthScene';
import { useMissionStore, useResolvedMission } from '../store/missionStore';
import { OrbitSelector } from '../components/OrbitSelector';
import { TechTerm } from '../components/TechTerm';

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
            Altitude, inclination (<TechTerm termKey="SSO" />), and launcher throw mass govern
            eclipse duration, ground-station passes/day, <TechTerm termKey="RF" /> link margin, and{' '}
            <TechTerm termKey="DELTA_V" /> reserves.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/subsystems"
            className="gng-glass-slice flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#F1F5FA] transition hover:border-[#42D9F5]/60 hover:text-[#42D9F5]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Subsystems
          </Link>
          <Link
            to="/operations-plan"
            className="flex items-center gap-2 rounded-md border border-cyan-300/60 bg-[#42D9F5] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#080B12] transition hover:bg-[#42D9F5]/90"
          >
            OPERATIONS PLAN
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* Central 3D Orbital Visualization + Compact Inline Metrics (No Sidebar) */}
      <div className="gng-glass-panel overflow-hidden p-3">
        <EarthScene
          celestialBody={orbit.celestialBody}
          orbit={orbit}
          periodSeconds={engineering.orbital.orbitalPeriodSec}
          swathWidthKm={maxSwathKm}
          targetRegions={
            orbit.celestialBody === scenario.celestialBody ? scenario.targetRegions : []
          }
          showGroundStations={orbit.celestialBody === 'EARTH'}
          showSwathCone={true}
          showMoonInBackground={orbit.celestialBody === 'EARTH'}
          heightClass="h-[320px]"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-2.5 font-mono-tech text-xs">
          <span>
            <span className="text-[#8E9BAD]">Wet Mass: </span>
            <span className="font-bold text-[#F1F5FA]">
              {engineering.mass.wetMassKg.toFixed(1)} / {engineering.mass.maxLaunchMassKg.toFixed(0)} kg
            </span>
          </span>
          <span>
            <span className="text-[#8E9BAD]">Eclipse: </span>
            <span className="font-bold text-cyan-300">
              {(engineering.orbital.eclipseFraction * 100).toFixed(1)}%
            </span>
          </span>
          <span>
            <span className="text-[#8E9BAD]">Revisit: </span>
            <span className="font-bold text-[#F1F5FA]">{engineering.orbital.revisitHours} hr</span>
          </span>
          <span>
            <span className="text-[#8E9BAD]">Delta-V Margin: </span>
            <span className="font-bold text-emerald-300">
              {engineering.propulsion.deltaVMarginPct.toFixed(1)}%
            </span>
          </span>
          <span>
            <span className="text-[#8E9BAD]">Cost: </span>
            <span className="font-bold text-[#F1F5FA]">
              ${engineering.budget.totalSpentMusd.toFixed(1)}M / ${scenario.budgetCapMusd.toFixed(1)}M
            </span>
          </span>
        </div>
      </div>

      {/* Full-Width Orbit + Launcher Controls (Sidebar-Free) */}
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-5">
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
                    data-selected={selected}
                    onClick={() => selectLaunchVehicle(lv.id)}
                    className={`gng-glass-option flex flex-col justify-between p-3.5 text-left ${
                      selected && incompatible
                        ? '!border-[#FF5364] !bg-[#261119]/85'
                        : ''
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
      </div>

      {/* Sequential Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <Link
          to="/subsystems"
          className="gng-glass-slice flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#F1F5FA] transition hover:border-[#42D9F5]/60 hover:text-[#42D9F5]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Previous: Subsystems
        </Link>
        <Link
          to="/operations-plan"
          className="flex items-center gap-2 rounded-md border border-cyan-300/60 bg-[#42D9F5] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#080B12] transition hover:bg-[#42D9F5]/90"
        >
          Continue to Operations Plan
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

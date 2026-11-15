import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Microscope, Sliders } from 'lucide-react';
import { useNavigate } from 'react-router';
import { SCIENTIFIC_INSTRUMENTS } from '../data/instruments';
import { useMissionStore, useResolvedMission } from '../store/missionStore';

export function PayloadSelection() {
  const navigate = useNavigate();
  const instrumentIds = useMissionStore((s) => s.instrumentIds);
  const instrumentDutyOverrides = useMissionStore((s) => s.instrumentDutyOverrides);
  const toggleInstrument = useMissionStore((s) => s.toggleInstrument);
  const setInstrumentDutyCycle = useMissionStore((s) => s.setInstrumentDutyCycle);

  const { scenario, bus, instruments, engineering } = useResolvedMission();
  const maxSlots = bus.payloadSlots ?? 3;
  const maxPayloadMassKg = bus.maxPayloadMassKg ?? 100;
  const totalPayloadMassKg = instruments.reduce((sum, i) => sum + i.massKg, 0);
  const massRatioPct = maxPayloadMassKg > 0 ? Math.round((totalPayloadMassKg / maxPayloadMassKg) * 100) : 0;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Stage Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="font-mono-tech text-[11px] uppercase tracking-widest text-cyan-300">
            Stage 02 · Payload Manifest &amp; Instrument Tuning
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-50">
            Select Scientific Payloads
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Choose one or more instruments for <span className="font-semibold text-slate-200">{scenario.title}</span> on{' '}
            <span className="font-semibold text-slate-200">{bus.name}</span>. Unconventional architectures remain selectable; engineering trade-offs are evaluated transparently.
          </p>
        </div>

        {/* Compact Top Metrics Bar (No Sidebar) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="gng-glass-slice px-3 py-1.5 font-mono-tech text-xs">
            <span className="text-slate-400">Slots: </span>
            <span className={instruments.length > maxSlots ? 'font-bold text-red-300' : 'font-bold text-cyan-300'}>
              {instruments.length} / {maxSlots}
            </span>
          </div>
          <div className="gng-glass-slice px-3 py-1.5 font-mono-tech text-xs">
            <span className="text-slate-400">Payload Mass: </span>
            <span className={totalPayloadMassKg > maxPayloadMassKg ? 'font-bold text-red-300' : 'font-bold text-emerald-300'}>
              {totalPayloadMassKg.toFixed(1)} / {maxPayloadMassKg.toFixed(1)} kg ({massRatioPct}%)
            </span>
          </div>
          <div className="gng-glass-slice px-3 py-1.5 font-mono-tech text-xs">
            <span className="text-slate-400">Daily Science: </span>
            <span className="font-bold text-slate-100">
              {engineering.commsData.dataGeneratedPerDayGb.toFixed(1)} GB/day
            </span>
          </div>
        </div>
      </div>

      {/* Warning banner if zero instruments or mass overrun */}
      {instruments.length === 0 && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
          Select at least one scientific instrument to proceed to mission certification.
        </div>
      )}
      {totalPayloadMassKg > maxPayloadMassKg && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
          Combined payload mass ({totalPayloadMassKg.toFixed(1)} kg) exceeds {bus.name} capacity ({maxPayloadMassKg.toFixed(1)} kg). Reduce payloads or return to Stage 01 to upgrade the bus.
        </div>
      )}

      {/* Full-Width Payload Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SCIENTIFIC_INSTRUMENTS.map((inst) => {
          const selected = instrumentIds.includes(inst.id);
          const effectiveDuty =
            instrumentDutyOverrides[inst.id] ?? Math.round(inst.defaultDutyCycle * 100);
          const slotBlocked = !selected && instruments.length >= maxSlots;
          const overMassIfAdded = !selected && totalPayloadMassKg + inst.massKg > maxPayloadMassKg;

          return (
            <div
              key={inst.id}
              data-selected={selected}
              className={`flex flex-col justify-between rounded-xl border p-4 transition ${
                selected
                  ? 'border-cyan-400/60 bg-cyan-950/25 shadow-[0_0_24px_rgba(34,211,238,0.08)]'
                  : 'border-white/10 bg-[#0d1322]/80 hover:border-white/20'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Microscope className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
                    <h2 className="text-sm font-bold text-slate-100">{inst.name}</h2>
                  </div>
                  <span className="shrink-0 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono-tech text-[10px] uppercase text-slate-300">
                    {inst.type}
                  </span>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-slate-400">{inst.description}</p>

                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-white/10 bg-black/25 p-2.5 font-mono-tech text-[11px] text-slate-300">
                  <span>Mass: {inst.massKg} kg</span>
                  <span>Op Pwr: {inst.powerOperatingW} W</span>
                  <span>Cost: ${inst.costMusd}M</span>
                  <span>Data: {inst.dataRateMbps} Mbps</span>
                  <span>GSD: {inst.resolutionM} m</span>
                  <span>Swath: {inst.swathWidthKm} km</span>
                  <span>TRL: {inst.trl}</span>
                  <span>Rel: {(inst.reliability3Yr * 100).toFixed(1)}%</span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5 font-mono-tech text-[10px]">
                  {inst.cloudPenetrating && (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">
                      All-Weather
                    </span>
                  )}
                  {inst.nightCapable && (
                    <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-indigo-300">
                      Night / PSR
                    </span>
                  )}
                  <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-slate-300">
                    {inst.provenance === 'VERIFIED' ? 'NASA Heritage' : 'Simulator Model'}
                  </span>
                </div>

                {selected && (
                  <div className="mt-3 rounded-lg border border-cyan-400/25 bg-black/30 p-2.5">
                    <div className="flex items-center justify-between font-mono-tech text-[11px]">
                      <span className="flex items-center gap-1 text-cyan-300">
                        <Sliders className="h-3 w-3" aria-hidden="true" /> Duty Cycle Override
                      </span>
                      <span className="font-bold text-slate-100">{effectiveDuty}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={5}
                      value={effectiveDuty}
                      aria-label={`${inst.name} duty cycle`}
                      onChange={(e) => setInstrumentDutyCycle(inst.id, Number(e.target.value))}
                      className="mt-1.5 w-full accent-cyan-400"
                    />
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                {overMassIfAdded && !slotBlocked ? (
                  <span className="font-mono-tech text-[10px] text-amber-300">
                    Exceeds bus payload cap
                  </span>
                ) : (
                  <span className="font-mono-tech text-[10px] text-slate-500">
                    Standby {inst.powerStandbyW} W · Duty {Math.round(inst.defaultDutyCycle * 100)}%
                  </span>
                )}
                <button
                  type="button"
                  disabled={slotBlocked}
                  onClick={() => toggleInstrument(inst.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                    selected
                      ? 'border border-emerald-400/50 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                      : slotBlocked
                        ? 'cursor-not-allowed border border-white/10 bg-white/5 text-slate-500'
                        : 'border border-cyan-400/40 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                  }`}
                >
                  {selected ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Selected
                    </>
                  ) : slotBlocked ? (
                    'Bus Slots Full'
                  ) : (
                    'Add Payload'
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sequential Navigation */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-200 transition hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Previous: Briefing &amp; Bus
        </button>
        <button
          type="button"
          onClick={() => navigate('/subsystems')}
          className="inline-flex items-center gap-2 rounded-md border border-cyan-300/60 bg-cyan-400 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 transition hover:bg-cyan-300"
        >
          Continue to Subsystems
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

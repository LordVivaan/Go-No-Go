import {
  BatteryCharging,
  Cpu,
  Flame,
  Layers,
  Radio,
  Satellite,
  Sun,
  Thermometer,
} from 'lucide-react';
import { TechTerm } from './TechTerm';
import { getShortComponentName } from '../data/displayNames';
import type { ComponentCategory, ScientificInstrument, SpacecraftComponent } from '../types/spacecraft';

export type ArchitectureTab = 'BUS' | 'INSTRUMENTS' | Exclude<ComponentCategory, 'BUS'>;

export interface PlanningSheetDiagramProps {
  bus: SpacecraftComponent;
  subsystems: SpacecraftComponent[];
  instruments: ScientificInstrument[];
  activeTab: ArchitectureTab;
  onSelectTab: (tab: ArchitectureTab) => void;
}

interface SheetSlot {
  tab: ArchitectureTab;
  title: string;
  techKey?: 'EPS' | 'RF' | 'DELTA_V' | 'TCS' | 'ADCS' | 'OBC';
  icon: typeof Layers;
  itemName: string;
  compatibilityNote: string;
  compatible: boolean;
}

/**
 * Aerospace Engineering Planning Sheet & Layered Subsystem Schematic.
 * Replaces the completed 3D spacecraft in Stage 2 so the user plans and
 * inspects conceptual subsystem interfaces before physical construction.
 */
export function PlanningSheetDiagram({
  bus,
  subsystems,
  instruments,
  activeTab,
  onSelectTab,
}: PlanningSheetDiagramProps) {
  const busFormFactor = bus.compatibleFormFactors[0] ?? 'SMALLSAT';
  const findSub = (cat: Exclude<ComponentCategory, 'BUS'>) =>
    subsystems.find((s) => s.category === cat);

  const solar = findSub('SOLAR_ARRAY');
  const battery = findSub('BATTERY');
  const antenna = findSub('ANTENNA');
  const propulsion = findSub('PROPULSION');
  const thermal = findSub('THERMAL');
  const avionics = findSub('AVIONICS');

  const isCompatibleWithBus = (comp?: SpacecraftComponent) =>
    comp ? comp.compatibleFormFactors.includes(busFormFactor) : true;

  const slots: SheetSlot[] = [
    {
      tab: 'SOLAR_ARRAY',
      title: 'Solar Power Array',
      techKey: 'EPS',
      icon: Sun,
      itemName: solar ? getShortComponentName(solar) : 'Unassigned',
      compatibilityNote: isCompatibleWithBus(solar)
        ? `Fits ${busFormFactor} interface`
        : `Requires ${solar?.compatibleFormFactors.join('/')}`,
      compatible: isCompatibleWithBus(solar),
    },
    {
      tab: 'BATTERY',
      title: 'Secondary Battery',
      techKey: 'EPS',
      icon: BatteryCharging,
      itemName: battery ? getShortComponentName(battery) : 'Unassigned',
      compatibilityNote: isCompatibleWithBus(battery)
        ? `Fits ${busFormFactor} interface`
        : `Requires ${battery?.compatibleFormFactors.join('/')}`,
      compatible: isCompatibleWithBus(battery),
    },
    {
      tab: 'ANTENNA',
      title: 'RF Communications',
      techKey: 'RF',
      icon: Radio,
      itemName: antenna ? getShortComponentName(antenna) : 'Unassigned',
      compatibilityNote: isCompatibleWithBus(antenna)
        ? `Fits ${busFormFactor} interface`
        : `Requires ${antenna?.compatibleFormFactors.join('/')}`,
      compatible: isCompatibleWithBus(antenna),
    },
    {
      tab: 'PROPULSION',
      title: 'Propulsion Module',
      techKey: 'DELTA_V',
      icon: Flame,
      itemName: propulsion ? getShortComponentName(propulsion) : 'Unassigned',
      compatibilityNote: isCompatibleWithBus(propulsion)
        ? `Fits ${busFormFactor} interface`
        : `Requires ${propulsion?.compatibleFormFactors.join('/')}`,
      compatible: isCompatibleWithBus(propulsion),
    },
    {
      tab: 'THERMAL',
      title: 'Thermal Control',
      techKey: 'TCS',
      icon: Thermometer,
      itemName: thermal ? getShortComponentName(thermal) : 'Unassigned',
      compatibilityNote: isCompatibleWithBus(thermal)
        ? `Fits ${busFormFactor} interface`
        : `Requires ${thermal?.compatibleFormFactors.join('/')}`,
      compatible: isCompatibleWithBus(thermal),
    },
    {
      tab: 'AVIONICS',
      title: 'Avionics & ADCS',
      techKey: 'ADCS',
      icon: Cpu,
      itemName: avionics ? getShortComponentName(avionics) : 'Unassigned',
      compatibilityNote: isCompatibleWithBus(avionics)
        ? `Fits ${busFormFactor} interface`
        : `Requires ${avionics?.compatibleFormFactors.join('/')}`,
      compatible: isCompatibleWithBus(avionics),
    },
  ];

  const payloadSlotsUsed = instruments.length;
  const payloadSlotsMax = bus.payloadSlots ?? 3;
  const payloadSlotsOk = payloadSlotsUsed > 0 && payloadSlotsUsed <= payloadSlotsMax;

  return (
    <section
      aria-label="Spacecraft Architecture Planning Sheet"
      data-testid="architecture-planning-sheet"
      className="gng-glass-panel bg-telemetry-grid flex flex-col gap-3.5 p-4"
    >
      {/* Blueprint Sheet Title Block */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <div>
          <div className="flex items-center gap-2 font-mono-tech text-[10px] font-semibold uppercase tracking-widest text-[#42D9F5]">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            Concept Design Sheet · Layered Subsystem Architecture
          </div>
          <h2 className="mt-0.5 font-display text-sm font-bold text-[#F1F5FA]">
            Conceptual Assembly &amp; Interface Plan
          </h2>
        </div>
        <span className="gng-glass-slice px-2 py-0.5 font-mono-tech text-[10px] text-slate-300">
          FORM FACTOR: {busFormFactor}
        </span>
      </div>

      {/* Central Bus Backbone Card */}
      <button
        type="button"
        onClick={() => onSelectTab('BUS')}
        data-selected={activeTab === 'BUS'}
        className="gng-glass-option flex items-center justify-between gap-3 p-3 text-left"
      >
        <div className="flex items-center gap-3">
          {/* Technical Bus Schematic SVG */}
          <svg
            viewBox="0 0 48 48"
            className="h-11 w-11 shrink-0 text-[#42D9F5]"
            aria-hidden="true"
          >
            <rect
              x="10"
              y="10"
              width="28"
              height="28"
              rx="2"
              fill="rgba(66,217,245,0.08)"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <line x1="10" y1="20" x2="38" y2="20" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
            <line x1="10" y1="28" x2="38" y2="28" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
            <circle cx="24" cy="24" r="3" fill="currentColor" />
            <path d="M4 24h6M38 24h6M24 4v6M24 38v6" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <div>
            <div className="font-mono-tech text-[10px] uppercase tracking-wider text-[#42D9F5]">
              Layer 01 · Primary Bus Structure
            </div>
            <div className="text-xs font-bold text-[#F1F5FA]">{bus.name}</div>
            <div className="mt-0.5 text-[11px] text-[#8E9BAD]">
              Payload Bays: {payloadSlotsUsed} / {payloadSlotsMax} occupied
            </div>
          </div>
        </div>
        <span className="font-mono-tech text-[10px] text-slate-400">EDIT BUS →</span>
      </button>

      {/* Layer 02: 6 Coupled Subsystem Interface Sheets */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {slots.map((slot) => {
          const Icon = slot.icon;
          const isSelected = activeTab === slot.tab;
          return (
            <div
              key={slot.tab}
              data-selected={isSelected}
              className="gng-glass-option flex flex-col justify-between gap-2 p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectTab(slot.tab)}
                  className="flex flex-1 items-start gap-2 text-left"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[#42D9F5]/25 bg-[#42D9F5]/10 text-[#42D9F5]">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-mono-tech text-[10px] uppercase tracking-wider text-slate-400">
                      {slot.title}
                    </div>
                    <div className="truncate text-xs font-semibold text-slate-100">
                      {slot.itemName}
                    </div>
                  </div>
                </button>
                {slot.techKey && <TechTerm termKey={slot.techKey} />}
              </div>

              <div className="flex items-center justify-between border-t border-white/10 pt-1.5 font-mono-tech text-[10px]">
                <span className={slot.compatible ? 'text-[#38D996]' : 'text-[#FFB547]'}>
                  {slot.compatibilityNote}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectTab(slot.tab)}
                  className="text-[#42D9F5] hover:underline"
                >
                  Configure
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Layer 03: Scientific Payloads Manifest */}
      <button
        type="button"
        onClick={() => onSelectTab('INSTRUMENTS')}
        data-selected={activeTab === 'INSTRUMENTS'}
        className="gng-glass-option flex flex-col gap-2 p-3 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Satellite className="h-4 w-4 text-[#38D996]" aria-hidden="true" />
            <span className="font-mono-tech text-[10px] font-semibold uppercase tracking-wider text-[#38D996]">
              Layer 03 · Scientific Payload Suite ({payloadSlotsUsed}/{payloadSlotsMax} Bays)
            </span>
          </div>
          <span
            className={`font-mono-tech text-[10px] ${
              payloadSlotsOk ? 'text-[#38D996]' : 'text-[#FFB547]'
            }`}
          >
            {payloadSlotsUsed === 0
              ? 'No payload selected'
              : payloadSlotsUsed > payloadSlotsMax
                ? 'Exceeds bus bays'
                : 'Mounted'}
          </span>
        </div>

        {instruments.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {instruments.map((inst) => (
              <span
                key={inst.id}
                className="gng-glass-slice px-2 py-0.5 font-mono-tech text-[10px] text-slate-200"
              >
                {inst.shortCode} · {inst.type}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">
            Select one or more scientific instruments to fulfill mission objectives.
          </p>
        )}
      </button>

      {/* Conceptual Integration Note */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-[11px] text-slate-400">
        <span>
          Full 3D spacecraft visualization activates at launch &amp; orbital operations.
        </span>
        <span className="flex items-center gap-1.5">
          <TechTerm termKey="OBC" label="OBC" />
          <TechTerm termKey="SSR" label="SSR" />
          <TechTerm termKey="TRL" label="TRL" />
        </span>
      </div>
    </section>
  );
}

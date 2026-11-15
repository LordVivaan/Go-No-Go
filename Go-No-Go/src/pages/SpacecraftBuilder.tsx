import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, Layers, Sparkles } from 'lucide-react';
import { SPACECRAFT_BUSES, SUBSYSTEM_COMPONENTS } from '../data/components';
import { SCIENTIFIC_INSTRUMENTS } from '../data/instruments';
import {
  MISSION_PRESETS,
  useMissionStore,
  useResolvedMission,
} from '../store/missionStore';
import { EquipmentCard, InstrumentCard } from '../components/EquipmentCard';
import { PlanningSheetDiagram, type ArchitectureTab } from '../components/PlanningSheetDiagram';
import { ResourcePanel } from '../components/ResourcePanel';
import { FormulaInspectorModal } from '../components/FormulaInspectorModal';

type BuilderTab = ArchitectureTab;

const BUILDER_TABS: Array<{ id: BuilderTab; label: string }> = [
  { id: 'BUS', label: 'Bus Frame' },
  { id: 'INSTRUMENTS', label: 'Payloads' },
  { id: 'SOLAR_ARRAY', label: 'Solar' },
  { id: 'BATTERY', label: 'Battery' },
  { id: 'ANTENNA', label: 'Comms RF' },
  { id: 'PROPULSION', label: 'Propulsion' },
  { id: 'AVIONICS', label: 'ADCS & Storage' },
  { id: 'THERMAL', label: 'Thermal' },
];

export function SpacecraftBuilder() {
  const configurationName = useMissionStore((s) => s.configurationName);
  const busId = useMissionStore((s) => s.busId);
  const subsystemIds = useMissionStore((s) => s.subsystemIds);
  const instrumentIds = useMissionStore((s) => s.instrumentIds);
  const setConfigurationName = useMissionStore((s) => s.setConfigurationName);
  const selectBus = useMissionStore((s) => s.selectBus);
  const selectSubsystem = useMissionStore((s) => s.selectSubsystem);
  const toggleInstrument = useMissionStore((s) => s.toggleInstrument);
  const applyPreset = useMissionStore((s) => s.applyPreset);

  const { scenario, bus, subsystems, instruments, engineering } = useResolvedMission();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('category');
  const validTabParam = BUILDER_TABS.find((t) => t.id === categoryParam)?.id;
  const [localTab, setLocalTab] = useState<BuilderTab>('BUS');
  const activeTab = validTabParam ?? localTab;
  const [inspectOpen, setInspectOpen] = useState(false);

  const handleSelectTab = (tabId: BuilderTab) => {
    setLocalTab(tabId);
    if (categoryParam) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('category');
      setSearchParams(nextParams, { replace: true });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
      {/* Header & Quick Presets Bar */}
      <div className="gng-glass-panel flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-[#42D9F5]" aria-hidden="true" />
              <span className="font-mono-tech text-[11px] font-semibold uppercase tracking-widest text-[#42D9F5]">
                Spacecraft Integration Bay — {scenario.code}
              </span>
            </div>
            <h1 className="font-display text-2xl font-bold text-[#F1F5FA]">
              Configure Bus, Payloads & Subsystems
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label htmlFor="config-name-input" className="sr-only">
              Configuration Name
            </label>
            <input
              id="config-name-input"
              type="text"
              value={configurationName}
              onChange={(e) => setConfigurationName(e.target.value)}
              placeholder="Flight configuration name"
              className="w-full rounded-md border border-[#F1F5FA]/15 bg-[#0B111E]/90 px-3 py-1.5 text-xs text-[#F1F5FA] placeholder-[#8E9BAD] focus:border-[#42D9F5] focus:outline-none sm:w-64"
            />
            <Link
              to="/"
              className="gng-glass-slice flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#F1F5FA] transition hover:border-[#42D9F5]/60 hover:text-[#42D9F5]"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Briefing
            </Link>
            <Link
              to="/orbit"
              className="flex items-center gap-2 rounded-md border border-cyan-300/60 bg-[#42D9F5] px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#080B12] transition hover:bg-[#42D9F5]/90"
            >
              ORBIT &amp; LAUNCH
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* One-Click Reference Architecture Presets */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[#F1F5FA]/10 pt-3">
          <span className="flex items-center gap-1.5 font-mono-tech text-[11px] uppercase tracking-wider text-[#8E9BAD]">
            <Sparkles className="h-3.5 w-3.5 text-[#42D9F5]" aria-hidden="true" />
            Quick Presets:
          </span>
          {MISSION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id)}
              className="gng-glass-slice px-2.5 py-1 text-[11px] font-medium text-[#F1F5FA]/90 transition hover:border-[#42D9F5]/55 hover:text-[#42D9F5]"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Integration Workspace */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: Subsystem Tabs + Equipment Grid */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          <div className="gng-glass-panel p-1.5">
            <div className="flex gap-1 overflow-x-auto pb-0.5">
              {BUILDER_TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    data-selected={active}
                    onClick={() => handleSelectTab(tab.id)}
                    className={`shrink-0 rounded px-3 py-1.5 font-mono-tech text-[11px] font-semibold transition ${
                      active
                        ? 'border border-[#42D9F5]/55 bg-[#42D9F5]/18 text-[#42D9F5]'
                        : 'border border-transparent text-[#8E9BAD] hover:bg-[#141E2E]/60 hover:text-[#F1F5FA]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {activeTab === 'BUS' &&
              SPACECRAFT_BUSES.map((b) => (
                <EquipmentCard
                  key={b.id}
                  component={b}
                  isSelected={busId === b.id}
                  onSelect={() => selectBus(b.id)}
                />
              ))}

            {activeTab === 'INSTRUMENTS' &&
              SCIENTIFIC_INSTRUMENTS.map((inst) => (
                <InstrumentCard
                  key={inst.id}
                  instrument={inst}
                  isSelected={instrumentIds.includes(inst.id)}
                  onToggle={() => toggleInstrument(inst.id)}
                />
              ))}

            {activeTab !== 'BUS' &&
              activeTab !== 'INSTRUMENTS' &&
              SUBSYSTEM_COMPONENTS.filter((c) => c.category === activeTab).map((comp) => (
                <EquipmentCard
                  key={comp.id}
                  component={comp}
                  isSelected={subsystemIds[activeTab] === comp.id}
                  onSelect={() => selectSubsystem(activeTab, comp.id)}
                />
              ))}
          </div>
        </div>

        {/* Right: Engineering Planning Sheet + Resource Budget */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <PlanningSheetDiagram
            bus={bus}
            subsystems={subsystems}
            instruments={instruments}
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
          />
          <ResourcePanel
            engineering={engineering}
            budgetCapMusd={scenario.budgetCapMusd}
            onOpenFormulaInspector={() => setInspectOpen(true)}
          />
        </div>
      </div>

      <FormulaInspectorModal
        isOpen={inspectOpen}
        onClose={() => setInspectOpen(false)}
        engineering={engineering}
      />
    </div>
  );
}

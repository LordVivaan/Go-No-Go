import { CheckCircle2, CloudRain, Moon, ShieldCheck } from 'lucide-react';
import type { ScientificInstrument, SpacecraftComponent } from '../types/spacecraft';

export interface ComponentCardProps {
  component: SpacecraftComponent;
  isSelected: boolean;
  onSelect: () => void;
}

export function EquipmentCard({
  component,
  isSelected,
  onSelect,
}: ComponentCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full flex-col justify-between rounded-2xl border p-4 text-left transition-colors ${
        isSelected
          ? 'border-2 border-[#42D9F5] bg-[#141E2E]/90'
          : 'border-[#F1F5FA]/12 bg-[#0D1422]/75 hover:border-[#F1F5FA]/28 hover:bg-[#141E2E]/75'
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="font-mono text-[11px] font-medium text-[#42D9F5]">
              {component.category} · {component.compatibleFormFactors.join('/')}
            </span>
            <h4 className="mt-0.5 font-display text-sm font-bold text-[#F1F5FA]">
              {component.name}
            </h4>
          </div>
          {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#38D996]" />}
        </div>

        <p className="mt-1.5 text-xs leading-relaxed text-[#8E9BAD]">
          {component.description}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#F1F5FA]/10 pt-2.5 font-mono text-[11px] tabular-nums">
        <span className="rounded-lg bg-[#080B12]/80 px-2 py-0.5 text-[#F1F5FA]">
          {component.massKg} kg
        </span>
        {component.powerOutputW ? (
          <span className="rounded-lg bg-[#38D996]/15 px-2 py-0.5 text-[#38D996]">
            +{component.powerOutputW} W BOL
          </span>
        ) : (
          <span className="rounded-lg bg-[#080B12]/80 px-2 py-0.5 text-[#8E9BAD]">
            -{component.powerDrawW} W
          </span>
        )}
        <span className="rounded-lg bg-[#080B12]/80 px-2 py-0.5 text-[#42D9F5]">
          ${component.costMusd}M
        </span>
        <span className="rounded-lg bg-[#080B12]/80 px-2 py-0.5 text-[#8E9BAD]">
          TRL {component.trl}
        </span>
        {component.isRedundant && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-[#3978F6]/20 px-2 py-0.5 text-[#42D9F5]">
            <ShieldCheck className="h-3 w-3" /> Redundant
          </span>
        )}
        <span
          title={component.sourceReference ?? 'Educational SmallSat/CubeSat catalog value'}
          className={`rounded-lg px-2 py-0.5 text-[11px] ${
            component.provenance === 'VERIFIED'
              ? 'bg-[#38D996]/15 text-[#38D996]'
              : 'bg-[#FFB547]/15 text-[#FFB547]'
          }`}
        >
          {component.provenance ?? 'ILLUSTRATIVE'}
        </span>
      </div>
    </button>
  );
}

export interface InstrumentCardProps {
  instrument: ScientificInstrument;
  isSelected: boolean;
  onToggle: () => void;
}

export function InstrumentCard({
  instrument,
  isSelected,
  onToggle,
}: InstrumentCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full flex-col justify-between rounded-2xl border p-4 text-left transition-colors ${
        isSelected
          ? 'border-2 border-[#38D996] bg-[#141E2E]/90'
          : 'border-[#F1F5FA]/12 bg-[#0D1422]/75 hover:border-[#F1F5FA]/28 hover:bg-[#141E2E]/75'
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-[#42D9F5]/35 bg-[#080B12]/80 px-2 py-0.5 font-mono text-[11px] font-bold text-[#42D9F5]">
                {instrument.shortCode} · {instrument.type}
              </span>
              <span className="font-mono text-[11px] text-[#8E9BAD]">
                Min Bus: {instrument.minFormFactor}
              </span>
            </div>
            <h4 className="mt-1.5 font-display text-sm font-bold text-[#F1F5FA]">
              {instrument.name}
            </h4>
          </div>
          {isSelected && <CheckCircle2 className="h-5 w-5 shrink-0 text-[#38D996]" />}
        </div>

        <p className="mt-1.5 text-xs leading-relaxed text-[#F1F5FA]/90">
          {instrument.description}
        </p>
        <p className="mt-1 text-xs text-[#FFB547]/90">
          Trade-off: {instrument.tradeOffNote}
        </p>
      </div>

      <div className="mt-3 space-y-2 border-t border-[#F1F5FA]/10 pt-2.5">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums">
          <span className="rounded-lg bg-[#080B12]/80 px-2 py-0.5 text-[#F1F5FA]">
            {instrument.massKg} kg
          </span>
          <span className="rounded-lg bg-[#080B12]/80 px-2 py-0.5 text-[#FFB547]">
            {instrument.powerOperatingW}W Peak / {instrument.powerStandbyW}W Stby
          </span>
          <span className="rounded-lg bg-[#080B12]/80 px-2 py-0.5 text-[#42D9F5]">
            {instrument.dataRateMbps} Mbps
          </span>
          <span className="rounded-lg bg-[#080B12]/80 px-2 py-0.5 text-[#38D996]">
            {instrument.resolutionM}m GSD · {instrument.swathWidthKm}km Swath
          </span>
          <span className="rounded-lg bg-[#080B12]/80 px-2 py-0.5 text-[#F1F5FA]">
            ${instrument.costMusd}M
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono ${
              instrument.cloudPenetrating
                ? 'bg-[#38D996]/15 text-[#38D996]'
                : 'bg-[#FF5364]/15 text-[#FF5364]'
            }`}
          >
            <CloudRain className="h-3 w-3" />
            {instrument.cloudPenetrating
              ? 'Penetrates Monsoon Clouds'
              : 'Blocked by Thick Clouds'}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono ${
              instrument.nightCapable
                ? 'bg-[#42D9F5]/15 text-[#42D9F5]'
                : 'bg-[#141E2E] text-[#8E9BAD]'
            }`}
          >
            <Moon className="h-3 w-3" />
            {instrument.nightCapable ? 'Day / Night' : 'Daylight Only'}
          </span>
          <span
            title={instrument.sourceReference ?? 'Educational sensor class parameters'}
            className={`rounded-lg px-2 py-0.5 font-mono text-[11px] ${
              instrument.provenance === 'VERIFIED'
                ? 'bg-[#38D996]/15 text-[#38D996]'
                : 'bg-[#FFB547]/15 text-[#FFB547]'
            }`}
          >
            {instrument.provenance ?? 'ILLUSTRATIVE'}
          </span>
        </div>
      </div>
    </button>
  );
}

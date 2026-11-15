import { CheckCircle2, CloudRain, ExternalLink, Moon, ShieldCheck } from 'lucide-react';
import { getComponentGuidance, getInstrumentGuidance } from '../data/componentGuidance';
import { getShortComponentName } from '../data/displayNames';
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
  const guidance = getComponentGuidance(component.category, component.id);
  const displayName = getShortComponentName(component);

  return (
    <article
      data-selected={isSelected}
      className="gng-glass-option flex w-full min-w-0 flex-col justify-between p-3.5 text-left"
    >
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="block break-words font-mono-tech text-[10px] font-semibold uppercase tracking-wider text-[#42D9F5]">
              {component.category.replace('_', ' ')} · Compatible: {component.compatibleFormFactors.join(', ')}
            </span>
            <h3
              title={component.name}
              className="mt-0.5 break-words font-display text-sm font-bold text-[#F1F5FA]"
            >
              {displayName}
            </h3>
            {displayName !== component.name && (
              <p className="mt-0.5 break-words text-[10px] text-slate-400">
                {component.name}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={isSelected}
            className={`shrink-0 rounded border px-2.5 py-1 font-mono-tech text-[10px] font-bold uppercase tracking-wider transition ${
              isSelected
                ? 'border-[#38D996]/60 bg-[#38D996]/15 text-[#38D996]'
                : 'border-white/15 bg-white/5 text-slate-300 hover:border-[#42D9F5]/50 hover:text-[#42D9F5]'
            }`}
          >
            {isSelected ? (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Selected
              </span>
            ) : (
              'Select'
            )}
          </button>
        </div>

        <p className="mt-1.5 text-xs font-medium text-[#F1F5FA]/90">
          {guidance.purpose}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[#8E9BAD]">
          {component.description}
        </p>

        <dl className="mt-2.5 space-y-1 border-t border-white/10 pt-2 text-[11px] leading-relaxed">
          <div>
            <dt className="inline font-semibold text-[#42D9F5]">What it does: </dt>
            <dd className="inline text-slate-300">{guidance.whatItDoes}</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-[#42D9F5]">Why it matters: </dt>
            <dd className="inline text-slate-300">{guidance.whyItMatters}</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-[#38D996]">Advantages: </dt>
            <dd className="inline text-slate-300">{guidance.advantages}</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-[#FFB547]">Limitations: </dt>
            <dd className="inline text-slate-300">{guidance.limitations}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 font-mono-tech text-[10px]">
        <div className="flex flex-wrap items-center gap-2">
          {component.isRedundant && (
            <span className="inline-flex items-center gap-1 text-[#42D9F5]">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Dual-Redundant
            </span>
          )}
          <span
            title={component.sourceReference ?? 'Educational SmallSat/CubeSat catalog value'}
            className={
              component.provenance === 'VERIFIED' ? 'text-[#38D996]' : 'text-[#FFB547]'
            }
          >
            {component.provenance ?? 'ILLUSTRATIVE'}
          </span>
        </div>

        <a
          href={guidance.nasaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[#42D9F5] underline-offset-2 hover:underline"
        >
          <span>{guidance.nasaLabel}</span>
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">(opens official NASA resource in a new tab)</span>
        </a>
      </div>
    </article>
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
  const guidance = getInstrumentGuidance(instrument.type);

  return (
    <article
      data-selected={isSelected}
      className="gng-glass-option flex w-full flex-col justify-between p-3.5 text-left"
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono-tech text-[10px] font-bold uppercase tracking-wider text-[#42D9F5]">
                {instrument.shortCode} · {instrument.type}
              </span>
              <span className="font-mono-tech text-[10px] text-[#8E9BAD]">
                Min Bus: {instrument.minFormFactor}
              </span>
            </div>
            <h3 className="mt-0.5 font-display text-sm font-bold text-[#F1F5FA]">
              {instrument.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={isSelected}
            className={`shrink-0 rounded border px-2.5 py-1 font-mono-tech text-[10px] font-bold uppercase tracking-wider transition ${
              isSelected
                ? 'border-[#38D996]/60 bg-[#38D996]/15 text-[#38D996]'
                : 'border-white/15 bg-white/5 text-slate-300 hover:border-[#42D9F5]/50 hover:text-[#42D9F5]'
            }`}
          >
            {isSelected ? (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Mounted
              </span>
            ) : (
              'Add Payload'
            )}
          </button>
        </div>

        <p className="mt-1.5 text-xs font-medium text-[#F1F5FA]/90">
          {guidance.purpose}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[#8E9BAD]">
          {instrument.description}
        </p>

        <dl className="mt-2.5 space-y-1 border-t border-white/10 pt-2 text-[11px] leading-relaxed">
          <div>
            <dt className="inline font-semibold text-[#42D9F5]">What it does: </dt>
            <dd className="inline text-slate-300">{guidance.whatItDoes}</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-[#42D9F5]">Why it matters: </dt>
            <dd className="inline text-slate-300">{guidance.whyItMatters}</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-[#38D996]">Advantages: </dt>
            <dd className="inline text-slate-300">{guidance.advantages}</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-[#FFB547]">Trade-off / Limitations: </dt>
            <dd className="inline text-slate-300">{instrument.tradeOffNote}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-[10px]">
        <div className="flex flex-wrap items-center gap-2 font-mono-tech">
          <span
            className={`inline-flex items-center gap-1 ${
              instrument.cloudPenetrating ? 'text-[#38D996]' : 'text-[#FF5364]'
            }`}
          >
            <CloudRain className="h-3 w-3" aria-hidden="true" />
            {instrument.cloudPenetrating ? 'All-Weather / Cloud-Penetrating' : 'Clear-Sky Only'}
          </span>
          <span
            className={`inline-flex items-center gap-1 ${
              instrument.nightCapable ? 'text-[#42D9F5]' : 'text-[#FFB547]'
            }`}
          >
            <Moon className="h-3 w-3" aria-hidden="true" />
            {instrument.nightCapable ? 'Day/Night' : 'Daylight Only'}
          </span>
        </div>

        <a
          href={guidance.nasaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono-tech text-[#42D9F5] underline-offset-2 hover:underline"
        >
          <span>{guidance.nasaLabel}</span>
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">(opens official NASA resource in a new tab)</span>
        </a>
      </div>
    </article>
  );
}

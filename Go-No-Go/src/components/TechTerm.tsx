import { ExternalLink, Info, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { TECH_GLOSSARY, type TechGlossaryKey } from '../data/techGlossary';

export interface TechTermProps {
  termKey: TechGlossaryKey;
  label?: string;
  contextNote?: string;
  className?: string;
}

/**
 * Accessible, educational technical abbreviation trigger with mouse, keyboard, and touch support.
 * Uses semantic <abbr>, native popover="hint" attributes where supported, and WCAG 1.4.13
 * dismissible/hoverable/persistent tooltip behavior.
 */
export function TechTerm({ termKey, label, contextNote, className = '' }: TechTermProps) {
  const entry = TECH_GLOSSARY[termKey];
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const tooltipId = useId();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  if (!entry) {
    return <span className={className}>{label ?? termKey}</span>;
  }

  const scheduleClose = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
    }, 160);
  };

  const cancelClose = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const displayCode = label ?? entry.code;

  return (
    <span
      ref={containerRef}
      className={`relative inline-flex items-center align-baseline ${className}`}
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={tooltipId}
        aria-label={`${displayCode}: ${entry.fullTerm}. Activate for engineering explanation.`}
        onClick={(e) => {
          e.stopPropagation();
          cancelClose();
          setOpen((prev) => !prev);
        }}
        onFocus={() => {
          cancelClose();
          setOpen(true);
        }}
        onBlur={(e) => {
          const nextFocused = e.relatedTarget as Node | null;
          if (!nextFocused || !containerRef.current?.contains(nextFocused)) {
            scheduleClose();
          }
        }}
        className="inline-flex items-center gap-1 rounded border border-[#42D9F5]/25 bg-[#42D9F5]/8 px-1.5 py-0.5 font-mono-tech text-[10px] font-semibold tracking-wider text-[#42D9F5] transition hover:border-[#42D9F5]/55 hover:bg-[#42D9F5]/15 focus-visible:outline-2 focus-visible:outline-[#42D9F5]"
      >
        <abbr title={entry.fullTerm} className="no-underline">
          {displayCode}
        </abbr>
        <Info className="h-2.5 w-2.5 opacity-75" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={tooltipId}
          role="tooltip"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onClick={(e) => e.stopPropagation()}
          className="gng-glass-panel absolute left-0 top-full z-50 mt-1.5 w-72 max-w-[88vw] border border-[#42D9F5]/35 bg-[#080E1A]/95 p-3 text-left shadow-2xl sm:w-80"
        >
          <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-1.5">
            <div>
              <div className="font-mono-tech text-[10px] font-bold uppercase tracking-widest text-[#42D9F5]">
                {entry.code}
              </div>
              <div className="text-xs font-semibold text-[#F1F5FA]">{entry.fullTerm}</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={`Close ${entry.code} explanation`}
              className="rounded p-0.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-300">
            <p>{entry.shortExplanation}</p>
            <p>
              <span className="font-semibold text-[#42D9F5]">Why it matters: </span>
              {contextNote ?? entry.whyItMatters}
            </p>
            <p>
              <span className="font-semibold text-[#FFB547]">If misconfigured: </span>
              {entry.consequenceIfWrong}
            </p>
          </div>

          {entry.nasaUrl && entry.nasaLabel && (
            <div className="mt-2 border-t border-white/10 pt-1.5">
              <a
                href={entry.nasaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#42D9F5] underline-offset-2 hover:underline"
              >
                <span>{entry.nasaLabel}</span>
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="sr-only">(opens official NASA resource in a new tab)</span>
              </a>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

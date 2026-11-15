import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import type { SimEvent } from '../types/simulation';

interface NotificationPanelProps {
  events: SimEvent[];
  maxItems?: number;
}

function formatMet(metSeconds: number): string {
  const hours = Math.floor(metSeconds / 3600);
  const mins = Math.floor((metSeconds % 3600) / 60);
  const secs = Math.floor(metSeconds % 60);
  return `T+${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function NotificationPanel({ events, maxItems = 25 }: NotificationPanelProps) {
  const visibleEvents = events.slice(0, maxItems);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="font-mono-tech text-[11px] font-semibold uppercase tracking-widest text-[#8E9BAD]">
          Mission Telemetry Event Log
        </span>
        <span className="font-mono-tech text-[11px] tabular-nums text-[#8E9BAD]">
          {events.length} Events
        </span>
      </div>

      <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
        {visibleEvents.length === 0 ? (
          <div className="gng-glass-card p-3 text-center text-xs text-[#8E9BAD]">
            Awaiting spacecraft telemetry packets...
          </div>
        ) : (
          visibleEvents.map((evt) => {
            const borderCls =
              evt.severity === 'CRITICAL'
                ? 'border-[#FF5364]/45 bg-[#FF5364]/10'
                : evt.severity === 'WARNING'
                  ? 'border-[#FFB547]/40 bg-[#FFB547]/10'
                  : 'border-[#F1F5FA]/10';

            const icon =
              evt.severity === 'CRITICAL' ? (
                <AlertOctagon className="h-4 w-4 shrink-0 text-[#FF5364]" aria-hidden="true" />
              ) : evt.severity === 'WARNING' ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-[#FFB547]" aria-hidden="true" />
              ) : (
                <Info className="h-4 w-4 shrink-0 text-[#42D9F5]" aria-hidden="true" />
              );

            return (
              <div
                key={evt.id}
                className={`gng-glass-card border p-2.5 text-xs ${borderCls}`}
              >
                <div className="flex items-start gap-2">
                  {icon}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-[#F1F5FA]">
                        {evt.title}
                      </span>
                      <span className="shrink-0 font-mono-tech text-[11px] tabular-nums text-[#8E9BAD]">
                        {formatMet(evt.metSeconds)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-[#8E9BAD]">
                      {evt.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

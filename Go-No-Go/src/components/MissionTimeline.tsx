import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { TelemetryPoint } from '../types/simulation';

interface MissionTimelineProps {
  history: TelemetryPoint[];
}

export function MissionTimeline({ history }: MissionTimelineProps) {
  const chartData = useMemo(() => {
    const stride = Math.max(1, Math.floor(history.length / 80));
    const sampled = history.filter((_, idx) => idx % stride === 0);
    return sampled.map((pt) => ({
      metHours: Number((pt.metSeconds / 3600).toFixed(2)),
      batterySocPct: Number(pt.batterySocPct.toFixed(1)),
      ssrBacklogGb: Number(pt.ssrBacklogGb.toFixed(2)),
      temperatureC: Number(pt.temperatureC.toFixed(1)),
      systemHealthPct: Number(pt.systemHealthPct.toFixed(1)),
    }));
  }, [history]);

  const latest = history[history.length - 1];

  return (
    <div className="gng-glass-card space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-mono-tech text-[11px] font-semibold uppercase tracking-widest text-[#8E9BAD]">
            Real-Time Telemetry Trends
          </h3>
          <p className="text-[11px] text-[#8E9BAD]">
            Battery SoC (%), Thermal (°C), and SSR Backlog (GB) over MET
          </p>
        </div>
        {latest && (
          <div className="flex flex-wrap items-center gap-3 font-mono-tech text-[11px] tabular-nums">
            <span className="text-[#38D996]">SoC {latest.batterySocPct.toFixed(1)}%</span>
            <span className="text-[#42D9F5]">SSR {latest.ssrBacklogGb.toFixed(1)} GB</span>
            <span className="text-[#FFB547]">Temp {latest.temperatureC.toFixed(1)} °C</span>
          </div>
        )}
      </div>

      <div className="h-48 w-full min-w-0">
        <ResponsiveContainer width="100%" height={192} minWidth={240}>
          <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="socGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38D996" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#38D996" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="ssrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#42D9F5" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#42D9F5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(142, 155, 173, 0.16)" />
            <XAxis
              dataKey="metHours"
              stroke="#8E9BAD"
              fontSize={11}
              tickFormatter={(v) => `${v}h`}
            />
            <YAxis stroke="#8E9BAD" fontSize={11} domain={[0, 100]} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0D1422',
                borderColor: 'rgba(241, 245, 250, 0.16)',
                borderRadius: '12px',
                fontSize: '11px',
                color: '#F1F5FA',
              }}
              labelFormatter={(l) => `MET ${l} hours`}
            />
            <Area
              type="monotone"
              dataKey="batterySocPct"
              name="Battery SoC (%)"
              stroke="#38D996"
              strokeWidth={2}
              fill="url(#socGrad)"
            />
            <Area
              type="monotone"
              dataKey="ssrBacklogGb"
              name="SSR Backlog (GB)"
              stroke="#42D9F5"
              strokeWidth={2}
              fill="url(#ssrGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="h-36 w-full min-w-0">
        <ResponsiveContainer width="100%" height={144} minWidth={240}>
          <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FFB547" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#FFB547" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(142, 155, 173, 0.16)" />
            <XAxis
              dataKey="metHours"
              stroke="#8E9BAD"
              fontSize={11}
              tickFormatter={(v) => `${v}h`}
            />
            <YAxis stroke="#8E9BAD" fontSize={11} domain={[-25, 65]} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0D1422',
                borderColor: 'rgba(241, 245, 250, 0.16)',
                borderRadius: '12px',
                fontSize: '11px',
                color: '#F1F5FA',
              }}
              labelFormatter={(l) => `MET ${l} hours`}
            />
            <Area
              type="monotone"
              dataKey="temperatureC"
              name="Spacecraft Temp (°C)"
              stroke="#FFB547"
              strokeWidth={2}
              fill="url(#tempGrad)"
            />
            <Area
              type="monotone"
              dataKey="systemHealthPct"
              name="Bus Health (%)"
              stroke="#3978F6"
              strokeWidth={1.5}
              fill="none"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

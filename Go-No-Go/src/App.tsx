import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { MissionBriefing } from './pages/MissionBriefing';

const SpacecraftBuilder = lazy(() =>
  import('./pages/SpacecraftBuilder').then((m) => ({ default: m.SpacecraftBuilder }))
);
const OrbitPlanner = lazy(() =>
  import('./pages/OrbitPlanner').then((m) => ({ default: m.OrbitPlanner }))
);
const EngineeringVerification = lazy(() =>
  import('./pages/EngineeringVerification').then((m) => ({ default: m.EngineeringVerification }))
);
const MissionSimulation = lazy(() =>
  import('./pages/MissionSimulation').then((m) => ({ default: m.MissionSimulation }))
);
const MissionReport = lazy(() =>
  import('./pages/MissionReport').then((m) => ({ default: m.MissionReport }))
);

function StageFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[50dvh] w-full items-center justify-center p-6 font-mono text-xs uppercase tracking-widest text-slate-400"
    >
      Loading mission console stage...
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Suspense fallback={<StageFallback />}>
          <Routes>
            <Route path="/" element={<MissionBriefing />} />
            <Route path="/briefing" element={<MissionBriefing />} />
            <Route path="/architecture" element={<SpacecraftBuilder />} />
            <Route path="/builder" element={<SpacecraftBuilder />} />
            <Route path="/orbit" element={<OrbitPlanner />} />
            <Route path="/verification" element={<EngineeringVerification />} />
            <Route path="/operations" element={<MissionSimulation />} />
            <Route path="/simulation" element={<MissionSimulation />} />
            <Route path="/debrief" element={<MissionReport />} />
            <Route path="/report" element={<MissionReport />} />
            <Route path="*" element={<MissionBriefing />} />
          </Routes>
        </Suspense>
      </AppShell>
    </BrowserRouter>
  );
}

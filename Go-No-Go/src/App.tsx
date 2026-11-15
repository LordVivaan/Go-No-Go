import { BrowserRouter, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { EngineeringVerification } from './pages/EngineeringVerification';
import { MissionBriefing } from './pages/MissionBriefing';
import { MissionReport } from './pages/MissionReport';
import { MissionSimulation } from './pages/MissionSimulation';
import { OrbitPlanner } from './pages/OrbitPlanner';
import { SpacecraftBuilder } from './pages/SpacecraftBuilder';

export function App() {
  return (
    <BrowserRouter>
      <AppShell>
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
      </AppShell>
    </BrowserRouter>
  );
}

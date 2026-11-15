import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/supabaseClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/supabaseClient')>();
  return {
    ...actual,
    isSupabaseConfigured: false,
    supabaseConfigReason: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.',
    supabaseClient: null,
  };
});

import { AppShell } from '../../src/components/AppShell';
import { Dashboard } from '../../src/components/Dashboard';
import { EquipmentCard } from '../../src/components/EquipmentCard';
import { LeaderboardPanel } from '../../src/components/LeaderboardPanel';
import { PlanningSheetDiagram } from '../../src/components/PlanningSheetDiagram';
import { TechTerm } from '../../src/components/TechTerm';
import { SPACECRAFT_BUSES } from '../../src/data/components';
import {
  getCompactConfigName,
  getShortComponentName,
  getShortOrbitName,
  getShortTargetRegionName,
} from '../../src/data/displayNames';
import { ORBIT_CATALOG } from '../../src/data/orbits';
import { getLaunchAssemblyTargets } from '../../src/scenes/launchAssembly';
import { getCelestialTextureConfig } from '../../src/scenes/textureManifest';
import { EngineeringVerification } from '../../src/pages/EngineeringVerification';
import { MissionBriefing } from '../../src/pages/MissionBriefing';
import { useSimulationStore } from '../../src/store/simulationStore';
import {
  getMissionConfigSignature,
  MISSION_PRESETS,
  resolveMissionEntities,
  useMissionStore,
} from '../../src/store/missionStore';

describe('React Component Tests — 6-Stage Shell, Advisory Decision, Planning Sheets & Leaderboard', () => {
  it('renders structured ValidationFindings with resource configuration links in Dashboard', () => {
    useMissionStore.getState().resetMissionForNewAttempt();
    useMissionStore.getState().applyPreset('preset-lunar-nominal-go');
    const { engineering } = resolveMissionEntities(useMissionStore.getState());

    render(
      <MemoryRouter>
        <Dashboard engineering={engineering} />
      </MemoryRouter>
    );

    expect(screen.getByText(/STRUCTURED ENGINEERING VALIDATION FINDINGS/i)).toBeTruthy();
    expect(screen.getAllByText(/Open .* Configuration/i).length).toBeGreaterThanOrEqual(8);
  });

  it('keeps GO/NO-GO launch authorization in user hands even when engineering recommends NO-GO', () => {
    // jsdom does not implement HTMLDialogElement.prototype.showModal natively
    HTMLDialogElement.prototype.showModal =
      HTMLDialogElement.prototype.showModal ??
      function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
    HTMLDialogElement.prototype.close =
      HTMLDialogElement.prototype.close ??
      function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      };

    const cubesat = MISSION_PRESETS.find((p) => p.id === 'preset-cubesat-nogo-demo')!;
    useMissionStore.getState().applyPreset(cubesat.id);

    const { rerender } = render(
      <MemoryRouter>
        <EngineeringVerification />
      </MemoryRouter>
    );

    // Engineering recommends NO-GO, but GO — Authorize Launch is still enabled for the Mission Director
    const authorizeBtn = screen.getByRole('button', { name: /GO — Authorize Launch/i });
    const holdBtn = screen.getByRole('button', { name: /NO-GO — Hold Launch/i });
    expect((authorizeBtn as HTMLButtonElement).disabled).toBe(false);
    expect((holdBtn as HTMLButtonElement).disabled).toBe(false);

    // Clicking GO when NO-GO is recommended opens the risk acknowledgement dialog
    fireEvent.click(authorizeBtn);
    expect(screen.getByText(/Acknowledge Critical Flight Risks Before Launch/i)).toBeTruthy();

    // Switching to GO preset updates engineering recommendation to GO
    act(() => {
      useMissionStore.getState().applyPreset('preset-lunar-nominal-go');
    });
    rerender(
      <MemoryRouter>
        <EngineeringVerification />
      </MemoryRouter>
    );
    expect(screen.getByText(/Engineering advises GO/i)).toBeTruthy();
  });

  it('renders strictly the 8 sequential mission stages in AppShell without legacy sidebars or extra pages', () => {
    useMissionStore.getState().applyPreset('preset-lunar-nominal-go');

    const { container } = render(
      <MemoryRouter initialEntries={['/subsystems']}>
        <AppShell>
          <div>Stage Content</div>
        </AppShell>
      </MemoryRouter>
    );

    expect(container.querySelector('aside')).toBeNull();
    const navLinks = container.querySelectorAll('nav a');
    expect(navLinks.length).toBe(8);
    expect(screen.getByText('Briefing & Bus')).toBeTruthy();
    expect(screen.getByText('Payloads')).toBeTruthy();
    expect(screen.getByText('Subsystems')).toBeTruthy();
    expect(screen.getByText('Orbit & Launch')).toBeTruthy();
    expect(screen.getByText('Ops Plan')).toBeTruthy();
    expect(screen.getByText('Verification')).toBeTruthy();
    expect(screen.getByText('Operations')).toBeTruthy();
    expect(screen.getByText('Debrief')).toBeTruthy();
    expect(screen.queryByText(/Saved/i)).toBeNull();
    expect(screen.queryByText(/Sandbox/i)).toBeNull();
    expect(screen.getByTestId('shell-gate-status').textContent).toBe('ENG: GO');
    expect(screen.getByText('Stage Content')).toBeTruthy();
  });

  it('renders PlanningSheetDiagram and educational EquipmentCard without numerical clutter', () => {
    useMissionStore.getState().applyPreset('preset-lunar-nominal-go');
    const resolved = resolveMissionEntities(useMissionStore.getState());
    const onSelectTab = vi.fn();

    render(
      <MemoryRouter>
        <PlanningSheetDiagram
          bus={resolved.bus}
          subsystems={resolved.subsystems}
          instruments={resolved.instruments}
          activeTab="BUS"
          onSelectTab={onSelectTab}
        />
        <EquipmentCard component={SPACECRAFT_BUSES[0]} isSelected={false} onSelect={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByTestId('architecture-planning-sheet')).toBeTruthy();
    expect(screen.getByText(/Conceptual Assembly & Interface Plan/i)).toBeTruthy();
    expect(screen.getByText(/What it does:/i)).toBeTruthy();
    expect(screen.getByText(/Why it matters:/i)).toBeTruthy();
    expect(screen.getByText(/NASA Spacecraft Subsystems/i)).toBeTruthy();
  });

  it('provides accessible interactive abbreviation explanations with NASA links via TechTerm', () => {
    render(<TechTerm termKey="EPS" />);
    const trigger = screen.getByRole('button', { name: /EPS: Electrical Power System/i });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toContain('Electrical Power System');
    expect(tooltip.textContent).toContain('Why it matters:');
    expect(tooltip.textContent).toContain('If misconfigured:');
    const link = screen.getByRole('link', { name: /NASA Spacecraft Subsystems/i });
    expect(link.getAttribute('href')).toBe(
      'https://www.nasa.gov/johnson/frontdoor/capabilities/spacecraft-subsystems/'
    );
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('renders International Leaderboard honestly in offline mode with config reason and no fake entries', async () => {
    useMissionStore.getState().applyPreset('preset-lunar-nominal-go');
    const state = useMissionStore.getState();
    const resolved = resolveMissionEntities(state);

    render(
      <MemoryRouter>
        <LeaderboardPanel
          report={resolved.scorePreview}
          engineering={resolved.engineering}
          scenario={resolved.scenario}
          instruments={resolved.instruments}
          difficulty={state.difficulty}
          configSignature={getMissionConfigSignature(state)}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText(/International Leaderboard Offline/i)).toBeTruthy();
    expect(screen.getByText(/VITE_SUPABASE_URL/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Global$/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Country \/ Region/i }));
    expect(screen.getByLabelText(/Filter country/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Season/i }));
    expect(screen.queryByLabelText(/Filter country/i)).toBeNull();
  });

  it('defaults MissionBriefing to Earth primary environment with Moon in background', () => {
    useMissionStore.getState().resetMissionForNewAttempt();

    render(
      <MemoryRouter>
        <MissionBriefing />
      </MemoryRouter>
    );

    const earthBtn = screen.getByRole('button', { name: /Earth View/i });
    const moonBtn = screen.getByRole('button', { name: /Target: MOON/i });
    expect(earthBtn.className).toContain('bg-cyan-400/20');
    expect(moonBtn.className).not.toContain('bg-cyan-400/20');
  });

  it('requires explicit risk acknowledgement for GO against NO-GO and transitions launch completion into simulation', () => {
    HTMLDialogElement.prototype.showModal =
      HTMLDialogElement.prototype.showModal ??
      function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
    HTMLDialogElement.prototype.close =
      HTMLDialogElement.prototype.close ??
      function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      };

    useMissionStore.getState().applyPreset('preset-cubesat-nogo-demo');
    useSimulationStore.getState().initializeSimulation(20261114, false);

    render(
      <MemoryRouter>
        <EngineeringVerification />
      </MemoryRouter>
    );

    // Engineering recommendation remains NO_GO while user has not authorized yet
    expect(useMissionStore.getState().userLaunchAuthorization).toBe('PENDING');
    fireEvent.click(screen.getByRole('button', { name: /GO — Authorize Launch/i }));
    expect(useMissionStore.getState().userLaunchAuthorization).toBe('PENDING');

    // Explicit risk acknowledgement authorizes GO and opens launch sequence
    fireEvent.click(screen.getByRole('button', { name: /Acknowledge Risks & Launch/i }));
    expect(useMissionStore.getState().userLaunchAuthorization).toBe('GO');
    expect(useMissionStore.getState().riskAcknowledged).toBe(true);
    expect(screen.getByTestId('launch-sequence-overlay')).toBeTruthy();

    // Completing launch sequence transitions into running orbital simulation
    fireEvent.click(screen.getByRole('button', { name: /Skip to Orbital Insertion/i }));
    expect(useSimulationStore.getState().isRunning).toBe(true);
  });

  it('maps celestial bodies to distinct textures without silent cross-body substitution', () => {
    const earth = getCelestialTextureConfig('EARTH');
    const moon = getCelestialTextureConfig('MOON');
    const mars = getCelestialTextureConfig('MARS');
    const asteroid = getCelestialTextureConfig('ASTEROID');

    expect(earth.textureUrl).toBe('/textures/EarthImage.jpg');
    expect(moon.textureUrl).toBe('/textures/Moon_Flat.jpg');
    expect(mars.textureUrl).toBeNull();
    expect(asteroid.textureUrl).toBeNull();
    expect(earth.textureUrl).not.toBe(moon.textureUrl);
  });

  it('provides consistent shortened display names while preserving underlying IDs and full names', () => {
    expect(getShortComponentName({ id: 'bus-espa-smallsat', name: 'full' })).toBe('ESPA SmallSat Bus');
    expect(getShortComponentName({ id: 'prop-hall-xenon', name: 'full' })).toBe('Xenon Hall Thruster');
    expect(getShortOrbitName(ORBIT_CATALOG.find((o) => o.id === 'orbit-geo-35786')!)).toBe('GEO');
    expect(getShortOrbitName(ORBIT_CATALOG.find((o) => o.id === 'orbit-lunar-polar-100')!)).toBe(
      '100 km Lunar Polar'
    );
    expect(getShortTargetRegionName({ id: 'crater-shackleton', name: 'Shackleton Crater Rim & Floor' })).toBe(
      'Shackleton Rim'
    );
    expect(getCompactConfigName('GNG-Baseline Spacecraft Config')).toBe('GNG Baseline');
  });

  it('keeps launch vehicle components assembled until their scheduled separation events', () => {
    const prelaunch = getLaunchAssemblyTargets('PRELAUNCH_POLL');
    const maxq = getLaunchAssemblyTargets('LIFTOFF_MAXQ');
    const meco = getLaunchAssemblyTargets('MECO_STAGE_SEP');
    const fairing = getLaunchAssemblyTargets('FAIRING_JETTISON');
    const seco = getLaunchAssemblyTargets('SECO_DEPLOYMENT');

    expect(prelaunch.stage1OffsetY).toBe(0);
    expect(prelaunch.fairingSpreadX).toBe(0);
    expect(maxq.stage1OffsetY).toBe(0);
    expect(maxq.fairingSpreadX).toBe(0);

    expect(meco.stage1OffsetY).toBeLessThan(0);
    expect(meco.fairingSpreadX).toBe(0);

    expect(fairing.fairingSpreadX).toBeGreaterThan(0);
    expect(seco.stage2OffsetY).toBeLessThan(0);
    expect(seco.showSolarWings).toBe(true);
  });
});

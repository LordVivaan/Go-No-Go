import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../../src/components/AppShell';
import { Dashboard } from '../../src/components/Dashboard';
import { LeaderboardPanel } from '../../src/components/LeaderboardPanel';
import { EngineeringVerification } from '../../src/pages/EngineeringVerification';
import {
  getMissionConfigSignature,
  MISSION_PRESETS,
  resolveMissionEntities,
  useMissionStore,
} from '../../src/store/missionStore';

describe('React Component Tests — 6-Stage Shell, Gate Lock & Leaderboard', () => {
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

  it('locks launch execution in EngineeringVerification when NO_GO and unlocks when GO', () => {
    const cubesat = MISSION_PRESETS.find((p) => p.id === 'preset-cubesat-nogo-demo')!;
    useMissionStore.getState().applyPreset(cubesat.id);

    const { rerender } = render(
      <MemoryRouter>
        <EngineeringVerification />
      </MemoryRouter>
    );

    const lockedBtn = screen.getByRole('button', { name: /LAUNCH LOCKED — NO-GO/i });
    expect((lockedBtn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /INITIATE LAUNCH SEQUENCE/i })).toBeNull();

    act(() => {
      useMissionStore.getState().applyPreset('preset-lunar-nominal-go');
    });
    rerender(
      <MemoryRouter>
        <EngineeringVerification />
      </MemoryRouter>
    );

    const launchBtn = screen.getByRole('button', { name: /INITIATE LAUNCH SEQUENCE/i });
    expect((launchBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders strictly the 6 gameplay stages in AppShell without legacy sidebars or extra pages', () => {
    useMissionStore.getState().applyPreset('preset-lunar-nominal-go');

    const { container } = render(
      <MemoryRouter initialEntries={['/architecture']}>
        <AppShell>
          <div>Stage Content</div>
        </AppShell>
      </MemoryRouter>
    );

    expect(container.querySelector('aside')).toBeNull();
    const navLinks = container.querySelectorAll('nav a');
    expect(navLinks.length).toBe(6);
    expect(screen.getByText('Briefing')).toBeTruthy();
    expect(screen.getByText('Architecture')).toBeTruthy();
    expect(screen.getByText('Orbit & Launch')).toBeTruthy();
    expect(screen.getByText('Verification')).toBeTruthy();
    expect(screen.getByText('Operations')).toBeTruthy();
    expect(screen.getByText('Debrief')).toBeTruthy();
    expect(screen.queryByText(/Saved/i)).toBeNull();
    expect(screen.queryByText(/Sandbox/i)).toBeNull();
    expect(screen.getByTestId('shell-gate-status').textContent).toBe('GO');
    expect(screen.getByText('Stage Content')).toBeTruthy();
  });

  it('renders International Leaderboard honestly in offline mode without fake entries', async () => {
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
    expect(screen.getByRole('button', { name: /^Global$/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Country \/ Region/i }));
    expect(screen.getByLabelText(/Filter country/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Season/i }));
    expect(screen.queryByLabelText(/Filter country/i)).toBeNull();
  });
});

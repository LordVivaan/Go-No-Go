import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  Calculator,
  PauseCircle,
  Rocket,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Dashboard } from '../components/Dashboard';
import { FormulaInspectorModal } from '../components/FormulaInspectorModal';
import { LaunchSequenceOverlay } from '../components/LaunchSequenceOverlay';
import { MissionAdvisorPanel } from '../components/MissionAdvisorPanel';
import { TechTerm } from '../components/TechTerm';
import { useMissionStore, useResolvedMission } from '../store/missionStore';
import { useSimulationStore } from '../store/simulationStore';

export function EngineeringVerification() {
  const navigate = useNavigate();
  const initializeSimulation = useSimulationStore((s) => s.initializeSimulation);
  const configurationName = useMissionStore((s) => s.configurationName);
  const userLaunchAuthorization = useMissionStore((s) => s.userLaunchAuthorization);
  const riskAcknowledged = useMissionStore((s) => s.riskAcknowledged);
  const authorizeLaunch = useMissionStore((s) => s.authorizeLaunch);
  const holdLaunch = useMissionStore((s) => s.holdLaunch);

  const { scenario, orbit, launchVehicle, engineering } = useResolvedMission();
  const [inspectOpen, setInspectOpen] = useState(false);
  const [launchSequenceOpen, setLaunchSequenceOpen] = useState(false);
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const riskDialogRef = useRef<HTMLDialogElement>(null);

  const recommendation = engineering.validation.overallStatus;
  const isNoGoRecommended = recommendation === 'NO_GO';
  const attentionFindings = engineering.validation.findings.filter(
    (f) => f.severity === 'FAIL' || f.severity === 'WARNING'
  );

  useEffect(() => {
    const dialog = riskDialogRef.current;
    if (!dialog) return;
    if (riskDialogOpen && !dialog.open) {
      dialog.showModal();
    } else if (!riskDialogOpen && dialog.open) {
      dialog.close();
    }
  }, [riskDialogOpen]);

  const startCinematicLaunch = (acknowledged: boolean) => {
    authorizeLaunch(acknowledged);
    setRiskDialogOpen(false);
    setLaunchSequenceOpen(true);
  };

  const handleAuthorizeLaunchClick = () => {
    if (isNoGoRecommended) {
      setRiskDialogOpen(true);
      return;
    }
    startCinematicLaunch(false);
  };

  const handleHoldLaunchClick = () => {
    holdLaunch();
    setLaunchSequenceOpen(false);
  };

  const handleInsertionComplete = useCallback(() => {
    setLaunchSequenceOpen(false);
    initializeSimulation(20261114, true);
    navigate('/operations');
  }, [initializeSimulation, navigate]);

  const handleLaunchAbort = useCallback(() => {
    holdLaunch();
    setLaunchSequenceOpen(false);
  }, [holdLaunch]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
      {/* Header & Advisory Status */}
      <div className="gng-glass-panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {isNoGoRecommended ? (
              <ShieldAlert className="h-4 w-4 text-[#FFB547]" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-[#38D996]" aria-hidden="true" />
            )}
            <span className="font-mono-tech text-[11px] font-semibold uppercase tracking-widest text-[#42D9F5]">
              Stage 04 · Engineering Verification &amp; Final Launch Decision — {scenario.code}
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold text-[#F1F5FA]">
            Engineering Advisory &amp; Launch Authorization
          </h1>
          <p className="text-xs text-[#8E9BAD]">
            Coupled SI physics evaluation across mass, power, <TechTerm termKey="RF" />,{' '}
            <TechTerm termKey="DELTA_V" />, <TechTerm termKey="TCS" />, and{' '}
            <TechTerm termKey="CML" /> readiness gates.{' '}
            <strong className="font-semibold text-slate-200">
              Engineering results are advisory — the final GO / NO-GO decision belongs to you.
            </strong>
          </p>
        </div>

        <button
          type="button"
          onClick={() => setInspectOpen(true)}
          className="gng-glass-slice flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#F1F5FA] transition hover:border-[#42D9F5]/60 hover:text-[#42D9F5]"
        >
          <Calculator className="h-3.5 w-3.5 text-[#42D9F5]" aria-hidden="true" />
          INSPECT SI EQUATIONS
        </button>
      </div>

      {/* Verification Dashboard (advisory findings & numerical margins) */}
      <Dashboard engineering={engineering} />

      {/* Deterministic Engineering Trade Advisor */}
      <MissionAdvisorPanel />

      {/* Final Launch Decision Panel (User GO / NO-GO Authorization) */}
      <section
        aria-label="Final Launch Authorization Decision"
        data-testid="final-launch-decision-panel"
        className="gng-glass-panel border border-cyan-400/25 p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-3.5">
          <div>
            <div className="font-mono-tech text-[11px] font-bold uppercase tracking-widest text-[#42D9F5]">
              Flight Director Final Decision Gate
            </div>
            <h2 className="mt-0.5 font-display text-lg font-bold text-[#F1F5FA]">
              Launch Authorization: GO / NO-GO
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono-tech text-[11px]">
            <span className="gng-glass-slice px-2.5 py-1 text-slate-300">
              Eng Recommendation:{' '}
              <strong
                className={
                  recommendation === 'GO'
                    ? 'text-[#38D996]'
                    : recommendation === 'CAUTION'
                      ? 'text-[#FFB547]'
                      : 'text-[#FF5364]'
                }
              >
                {recommendation === 'NO_GO' ? 'NO-GO' : recommendation}
              </strong>
            </span>
            <span className="gng-glass-slice px-2.5 py-1 text-slate-300">
              User Authorization:{' '}
              <strong
                className={
                  userLaunchAuthorization === 'GO'
                    ? 'text-[#38D996]'
                    : userLaunchAuthorization === 'NO_GO'
                      ? 'text-[#FFB547]'
                      : 'text-slate-400'
                }
              >
                {userLaunchAuthorization === 'NO_GO' ? 'NO-GO (HELD)' : userLaunchAuthorization}
              </strong>
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="space-y-2.5 lg:col-span-7">
            <div className="text-xs font-semibold text-slate-200">
              {isNoGoRecommended
                ? `Engineering advises NO-GO (${engineering.validation.noGoCount} critical issue${engineering.validation.noGoCount === 1 ? '' : 's'}, ${engineering.validation.cautionCount} warning${engineering.validation.cautionCount === 1 ? '' : 's'}).`
                : recommendation === 'CAUTION'
                  ? `Engineering advises CAUTION (${engineering.validation.cautionCount} warning${engineering.validation.cautionCount === 1 ? '' : 's'}). Margins are tight but launch is feasible.`
                  : 'Engineering advises GO. All coupled subsystem checks meet flight margins.'}
            </div>

            {attentionFindings.length > 0 && (
              <ul className="space-y-1.5 text-xs">
                {attentionFindings.slice(0, 4).map((finding) => (
                  <li
                    key={finding.id}
                    className="gng-glass-slice flex items-start gap-2 px-3 py-2"
                  >
                    <AlertTriangle
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                        finding.severity === 'FAIL' ? 'text-[#FF5364]' : 'text-[#FFB547]'
                      }`}
                      aria-hidden="true"
                    />
                    <div>
                      <span className="font-semibold text-slate-100">{finding.title}: </span>
                      <span className="text-slate-300">{finding.explanation}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-[11px] leading-relaxed text-[#8E9BAD]">
              {isNoGoRecommended
                ? 'Expected consequences of proceeding: launching with unresolved NO-GO findings exposes the spacecraft to severe orbital power brownouts, RF link dropouts, thermal violations, or mission loss during operations.'
                : 'Proceeding initiates the full-screen launch sequence and transitions directly into automatic orbital mission operations.'}
            </p>
          </div>

          <div className="flex flex-col justify-center gap-2.5 lg:col-span-5">
            <button
              type="button"
              onClick={handleAuthorizeLaunchClick}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-[#38D996]/60 bg-[#38D996] px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#060911] transition hover:bg-[#38D996]/90"
            >
              <Rocket className="h-4 w-4" aria-hidden="true" />
              GO — Authorize Launch
            </button>

            <button
              type="button"
              onClick={handleHoldLaunchClick}
              className="gng-glass-slice flex w-full items-center justify-center gap-2 border-[#FF5364]/45 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#FF5364] transition hover:bg-[#FF5364]/12"
            >
              <PauseCircle className="h-4 w-4" aria-hidden="true" />
              NO-GO — Hold Launch
            </button>

            {userLaunchAuthorization === 'NO_GO' && (
              <p className="text-center font-mono-tech text-[11px] text-amber-300">
                Launch held by Mission Director. Adjust Architecture or Orbit, or authorize GO when ready.
              </p>
            )}
          </div>
        </div>
      </section>

      <FormulaInspectorModal
        isOpen={inspectOpen}
        onClose={() => setInspectOpen(false)}
        engineering={engineering}
      />

      {/* Native <dialog> Risk Acknowledgement when overriding Engineering NO-GO */}
      <dialog
        ref={riskDialogRef}
        aria-labelledby="risk-ack-title"
        onClose={() => setRiskDialogOpen(false)}
        className="m-auto w-[min(94vw,34rem)] rounded-lg border border-[#FF5364]/45 bg-[#080E1A] p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-white/10 pb-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#FF5364]" aria-hidden="true" />
          <div>
            <div className="font-mono-tech text-[10px] font-bold uppercase tracking-widest text-[#FF5364]">
              Engineering Recommendation: NO-GO
            </div>
            <h2 id="risk-ack-title" className="text-base font-bold text-[#F1F5FA]">
              Acknowledge Critical Flight Risks Before Launch?
            </h2>
          </div>
        </div>

        <div className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
          <p>
            The engineering assessment identified{' '}
            <strong className="text-[#FF5364]">
              {engineering.validation.noGoCount} critical failure
              {engineering.validation.noGoCount === 1 ? '' : 's'}
            </strong>{' '}
            and{' '}
            <strong className="text-[#FFB547]">
              {engineering.validation.cautionCount} warning
              {engineering.validation.cautionCount === 1 ? '' : 's'}
            </strong>
            . Launching under these conditions will subject the spacecraft to those real physical
            constraints during orbital operations.
          </p>
          {attentionFindings.length > 0 && (
            <ul className="space-y-1 rounded border border-white/10 bg-black/35 p-2.5 text-[11px]">
              {attentionFindings.slice(0, 3).map((f) => (
                <li key={f.id} className="text-slate-200">
                  • <strong>{f.title}:</strong> {f.explanation}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => setRiskDialogOpen(false)}
            className="gng-glass-slice px-3.5 py-2 text-xs font-semibold text-slate-200 hover:text-white"
          >
            Cancel &amp; Review Design
          </button>
          <button
            type="button"
            onClick={() => startCinematicLaunch(true)}
            className="rounded-md border border-[#FF5364]/60 bg-[#FF5364] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#FF5364]/90"
          >
            Acknowledge Risks &amp; Launch
          </button>
        </div>
      </dialog>

      {/* Full-Screen Cinematic Launch Sequence */}
      {launchSequenceOpen && (
        <LaunchSequenceOverlay
          isOpen={launchSequenceOpen}
          scenario={scenario}
          configurationName={configurationName}
          launchVehicle={launchVehicle}
          orbit={orbit}
          engineeringRecommendation={recommendation}
          riskAcknowledged={riskAcknowledged}
          onAbort={handleLaunchAbort}
          onInsertionComplete={handleInsertionComplete}
        />
      )}
    </div>
  );
}

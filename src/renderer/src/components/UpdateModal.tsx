import { useEffect, useRef, useState } from 'react';
import type { UpdateState } from '../../../shared/ipc-channels';

interface Props {
  dirtyCount: number;
  saveAllDirty: () => Promise<boolean>;
}

type View =
  | { kind: 'hidden' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'confirm-save'; version: string }
  | { kind: 'saving' }
  | { kind: 'downloading'; percent: number }
  | { kind: 'installing' }
  | { kind: 'none'; currentVersion: string }
  | { kind: 'error'; message: string };

/**
 * Centered update modal. Single-consent UX: user clicks "Update now",
 * we optionally walk through save-or-discard for dirty tabs, then
 * download + auto-install + relaunch. No "Restart now" prompt — once the
 * user has consented, everything else is automatic until the app comes
 * back at the new version.
 */
export function UpdateModal({ dirtyCount, saveAllDirty }: Props): JSX.Element | null {
  const [view, setView] = useState<View>({ kind: 'hidden' });
  const dirtyAtConsent = useRef(0);

  useEffect(() => {
    const off = window.api.onUpdateState((s) => handleState(s));
    return off;

    function handleState(s: UpdateState): void {
      setView((prev) => {
        switch (s.kind) {
          case 'idle':
            return { kind: 'hidden' };
          case 'checking':
            return s.manual ? { kind: 'checking' } : prev;
          case 'available':
            return { kind: 'available', version: s.version };
          case 'downloading':
            return { kind: 'downloading', percent: s.percent };
          case 'ready':
            // Download finished. User has already consented (otherwise we
            // wouldn't have downloaded). Install immediately, regardless of
            // what view we were on. autoInstallOnAppQuit also handles this
            // if something goes wrong below.
            window.api.installUpdate();
            return { kind: 'installing' };
          case 'none':
            return { kind: 'none', currentVersion: s.currentVersion };
          case 'error':
            return { kind: 'error', message: s.message };
        }
      });
    }
  }, []);

  if (view.kind === 'hidden') return null;

  return (
    <div className="update-overlay" role="dialog" aria-modal="true" aria-labelledby="update-title">
      <div className="update-dialog" onClick={(e) => e.stopPropagation()}>
        {renderBody(view, dirtyCount, async () => {
          dirtyAtConsent.current = dirtyCount;
          if (view.kind !== 'available') return;
          if (dirtyCount > 0) {
            setView({ kind: 'confirm-save', version: view.version });
            return;
          }
          await window.api.downloadUpdate();
        }, async () => {
          // Save and continue
          if (view.kind !== 'confirm-save') return;
          setView({ kind: 'saving' });
          const ok = await saveAllDirty();
          if (!ok) {
            // User cancelled a save dialog; bring them back to confirm.
            setView({ kind: 'confirm-save', version: view.version });
            return;
          }
          await window.api.downloadUpdate();
        }, async () => {
          // Discard and continue
          if (view.kind !== 'confirm-save') return;
          await window.api.downloadUpdate();
        }, () => {
          // Later / Cancel / OK
          setView({ kind: 'hidden' });
        }, () => {
          // Retry (from error)
          window.api.checkForUpdates(true);
        })}
      </div>
    </div>
  );
}

function renderBody(
  view: View,
  dirtyCount: number,
  onConsent: () => Promise<void>,
  onSaveAndContinue: () => Promise<void>,
  onDiscardAndContinue: () => Promise<void>,
  onDismiss: () => void,
  onRetry: () => void,
): JSX.Element {
  switch (view.kind) {
    case 'checking':
      return (
        <>
          <h2 id="update-title" className="update-title">Checking for updates…</h2>
          <div className="update-spinner" aria-hidden="true" />
        </>
      );

    case 'available':
      return (
        <>
          <h2 id="update-title" className="update-title">Update available</h2>
          <p className="update-body">
            Hash Markup <strong>{view.version}</strong> is ready to install.
            The app will quit briefly and relaunch when the update completes.
          </p>
          <div className="update-actions">
            <button className="update-btn update-btn--primary" onClick={onConsent}>
              Update now
            </button>
            <button className="update-btn update-btn--ghost" onClick={onDismiss}>
              Later
            </button>
          </div>
        </>
      );

    case 'confirm-save':
      return (
        <>
          <h2 id="update-title" className="update-title">Unsaved changes</h2>
          <p className="update-body">
            You have <strong>{dirtyCount}</strong> unsaved {dirtyCount === 1 ? 'change' : 'changes'}.
            Save before restarting to install <strong>{view.version}</strong>?
          </p>
          <div className="update-actions update-actions--wrap">
            <button className="update-btn update-btn--primary" onClick={onSaveAndContinue}>
              Save and continue
            </button>
            <button className="update-btn update-btn--danger" onClick={onDiscardAndContinue}>
              Discard and continue
            </button>
            <button className="update-btn update-btn--ghost" onClick={onDismiss}>
              Cancel
            </button>
          </div>
        </>
      );

    case 'saving':
      return (
        <>
          <h2 id="update-title" className="update-title">Saving…</h2>
          <p className="update-body">If a save dialog appears, choose where to save the file.</p>
          <div className="update-spinner" aria-hidden="true" />
        </>
      );

    case 'downloading':
      return (
        <>
          <h2 id="update-title" className="update-title">Downloading update</h2>
          <p className="update-body">
            <strong>{Math.round(view.percent)}%</strong>
          </p>
          <div className="update-bar">
            <div className="update-bar__fill" style={{ width: `${view.percent}%` }} />
          </div>
          <p className="update-hint">The app will restart automatically when the download finishes.</p>
        </>
      );

    case 'installing':
      return (
        <>
          <h2 id="update-title" className="update-title">Installing…</h2>
          <p className="update-body">Hash Markup will restart in a moment.</p>
          <div className="update-spinner" aria-hidden="true" />
        </>
      );

    case 'none':
      return (
        <>
          <h2 id="update-title" className="update-title">You're up to date</h2>
          <p className="update-body">
            Hash Markup <strong>{view.currentVersion}</strong> is the latest release.
          </p>
          <div className="update-actions">
            <button className="update-btn update-btn--primary" onClick={onDismiss}>
              OK
            </button>
          </div>
        </>
      );

    case 'error':
      return (
        <>
          <h2 id="update-title" className="update-title">Update check failed</h2>
          <p className="update-body">{view.message}</p>
          <div className="update-actions">
            <button className="update-btn update-btn--primary" onClick={onRetry}>
              Retry
            </button>
            <button className="update-btn update-btn--ghost" onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        </>
      );

    default:
      return <></>;
  }
}

import { useEffect, useState } from 'react';
import type { UpdateState } from '../../../shared/ipc-channels';

const HIDE_KINDS = new Set(['idle']);

export function UpdateBanner(): JSX.Element | null {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const off = window.api.onUpdateState((s) => {
      if (cancelled) return;
      // A new state from main clears any prior dismissal so user sees it.
      setDismissed(false);
      setState(s);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  // Auto-hide "you're up to date" after 4s.
  useEffect(() => {
    if (state.kind !== 'none') return;
    const t = setTimeout(() => setDismissed(true), 4000);
    return () => clearTimeout(t);
  }, [state]);

  if (HIDE_KINDS.has(state.kind)) return null;
  if (dismissed) return null;
  if (state.kind === 'checking' && !state.manual) return null;

  return (
    <div className={`update-banner update-banner--${state.kind}`} role="status">
      <div className="update-banner__msg">{renderMessage(state)}</div>
      <div className="update-banner__actions">{renderActions(state, setDismissed)}</div>
    </div>
  );
}

function renderMessage(state: UpdateState): JSX.Element {
  switch (state.kind) {
    case 'checking':
      return <span>Checking for updates…</span>;
    case 'available':
      return (
        <span>
          Hash Markup <strong>{state.version}</strong> is available.
        </span>
      );
    case 'downloading':
      return (
        <span>
          Downloading <strong>{Math.round(state.percent)}%</strong>
          <span className="update-banner__bar">
            <span style={{ width: `${state.percent}%` }} />
          </span>
        </span>
      );
    case 'ready':
      return (
        <span>
          Hash Markup <strong>{state.version}</strong> is ready to install.
        </span>
      );
    case 'none':
      return <span>You're up to date.</span>;
    case 'error':
      return <span>Update check failed: {state.message}</span>;
    default:
      return <span></span>;
  }
}

function renderActions(
  state: UpdateState,
  setDismissed: (v: boolean) => void,
): JSX.Element {
  switch (state.kind) {
    case 'available':
      return (
        <>
          <button className="update-banner__btn" onClick={() => window.api.downloadUpdate()}>
            Update
          </button>
          <button
            className="update-banner__btn update-banner__btn--ghost"
            onClick={() => setDismissed(true)}
          >
            Later
          </button>
        </>
      );
    case 'ready':
      return (
        <>
          <button className="update-banner__btn" onClick={() => window.api.installUpdate()}>
            Restart now
          </button>
          <button
            className="update-banner__btn update-banner__btn--ghost"
            onClick={() => setDismissed(true)}
          >
            On next quit
          </button>
        </>
      );
    case 'error':
      return (
        <>
          <button
            className="update-banner__btn"
            onClick={() => window.api.checkForUpdates(true)}
          >
            Retry
          </button>
          <button
            className="update-banner__btn update-banner__btn--ghost"
            onClick={() => setDismissed(true)}
          >
            Dismiss
          </button>
        </>
      );
    case 'none':
      return (
        <button
          className="update-banner__btn update-banner__btn--ghost"
          onClick={() => setDismissed(true)}
        >
          OK
        </button>
      );
    case 'downloading':
    case 'checking':
    default:
      return <></>;
  }
}

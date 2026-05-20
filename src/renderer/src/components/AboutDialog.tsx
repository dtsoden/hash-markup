import { useEffect, useState } from 'react';
import iconUrl from '../assets/icon.png';
import type { AppVersionInfo } from '../../../shared/ipc-channels';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AboutDialog({ open, onClose }: Props): JSX.Element | null {
  const [info, setInfo] = useState<AppVersionInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    window.api.getAppVersion().then(setInfo);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="about-overlay" onClick={onClose} role="presentation">
      <div className="about-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="about-name">
        <img className="about-icon" src={iconUrl} alt="" width={96} height={96} />
        <h2 id="about-name" className="about-name">Hash Markup</h2>
        <p className="about-version">
          {info ? `${info.version} (build ${info.buildHash})` : ' '}
        </p>
        <p className="about-meta">By David Soden · MIT Licensed</p>
        {info && (
          <p className="about-electron">Electron {info.electronVersion}</p>
        )}
        <div className="about-actions">
          <button
            className="about-btn about-btn--primary"
            onClick={() => {
              window.api.checkForUpdates(true);
              onClose();
            }}
          >
            Check for Updates
          </button>
          <button className="about-btn about-btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

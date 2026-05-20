import { app, BrowserWindow } from 'electron';
import pkg from 'electron-updater';
import { IpcChannels, type UpdateState } from '../shared/ipc-channels';

const { autoUpdater } = pkg;

/**
 * Wraps electron-updater. Owns the update state machine, broadcasts
 * transitions to the renderer as `UpdateState` events.
 *
 * UX contract (per design spec):
 * - Silent on launch (10s after window-ready). Failures are swallowed.
 * - On manual check, "no update" surfaces a one-shot `{ kind: 'none' }` so
 *   the renderer can show a toast.
 * - Download is opt-in: we set autoDownload=false. The renderer must call
 *   downloadUpdate() in response to a user click.
 * - Install is opt-in: we set autoInstallOnAppQuit=true so dismissing the
 *   "Restart now" prompt still applies the update at next quit.
 */
export class UpdaterService {
  private state: UpdateState = { kind: 'idle' };
  private manualCheckInFlight = false;
  private wired = false;

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  init(): void {
    // Don't ever try to update an unpackaged dev build. electron-updater
    // throws confusingly if you do.
    if (!app.isPackaged) {
      console.log('[UpdaterService] skipping (app is not packaged)');
      return;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = console;

    this.wireEvents();
    this.wired = true;

    // Initial check 10s after init, fire-and-forget. Failures swallowed.
    setTimeout(() => {
      void this.checkForUpdates(false);
    }, 10_000);
  }

  async checkForUpdates(manual: boolean): Promise<void> {
    if (!this.wired) {
      // Dev mode or init was skipped. Surface a clear message on manual check.
      if (manual) {
        this.broadcast({
          kind: 'error',
          message: 'Updates are only available in packaged builds.',
        });
      }
      return;
    }
    this.manualCheckInFlight = manual;
    this.broadcast({ kind: 'checking', manual });
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (manual) {
        this.broadcast({ kind: 'error', message: msg });
      } else {
        console.warn('[UpdaterService] silent check failed:', msg);
        this.broadcast({ kind: 'idle' });
      }
    }
  }

  async downloadUpdate(): Promise<void> {
    if (!this.wired) return;
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.broadcast({ kind: 'error', message: msg });
    }
  }

  quitAndInstall(): void {
    if (!this.wired) return;
    autoUpdater.quitAndInstall();
  }

  private wireEvents(): void {
    autoUpdater.on('checking-for-update', () => {
      // State is set by checkForUpdates() above (we know `manual`).
    });

    autoUpdater.on('update-available', (info) => {
      this.broadcast({
        kind: 'available',
        version: info.version,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      if (this.manualCheckInFlight) {
        this.broadcast({ kind: 'none', currentVersion: info.version });
      } else {
        this.broadcast({ kind: 'idle' });
      }
      this.manualCheckInFlight = false;
    });

    autoUpdater.on('download-progress', (p) => {
      this.broadcast({
        kind: 'downloading',
        percent: p.percent,
        transferred: p.transferred,
        total: p.total,
        bytesPerSecond: p.bytesPerSecond,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.broadcast({ kind: 'ready', version: info.version });
    });

    autoUpdater.on('error', (err) => {
      // Don't spam errors for silent checks; just log.
      if (this.manualCheckInFlight) {
        this.broadcast({ kind: 'error', message: err.message });
      } else {
        console.warn('[UpdaterService] error:', err.message);
        this.broadcast({ kind: 'idle' });
      }
      this.manualCheckInFlight = false;
    });
  }

  private broadcast(state: UpdateState): void {
    this.state = state;
    const w = this.getWindow();
    if (w && !w.isDestroyed()) {
      w.webContents.send(IpcChannels.UpdateState, state);
    }
  }
}

# Auto-update + About dialog (v0.1.1)

**Status**: approved
**Target release**: v0.1.1
**Date**: 2026-05-19

## Goal

Hash Markup detects new GitHub releases from within the app, prompts the user, downloads on consent, installs, and relaunches. No redirect to the website or GitHub for normal updates. Add a Help > About dialog showing version and git short hash.

## Decisions (resolved during brainstorming)

| Decision | Choice |
| --- | --- |
| Check timing | On launch (10s delay) + manual via Help menu |
| Channels | Stable only (single channel; no pre-releases) |
| Mac strategy | Every Mac release notarized going forward; both platforms get auto-update from v0.1.1 |
| Version display | `0.1.1 (build abc1234)` (semver + git short hash) |

## Architecture

`electron-updater` (from the electron-builder family) with the GitHub provider. electron-updater reads `latest.yml` / `latest-mac.yml` from the most recent stable Release on `dtsoden/hash-markup` and compares against the running app's semver.

```
[main]                                  [renderer]
 UpdaterService ─── IPC update:state ──>  UpdateBanner
                                          AboutDialog
       │
       ▼
 electron-updater
       │
       ▼
 github.com/dtsoden/hash-markup
   latest.yml / latest-mac.yml
   *.zip (mac auto-update payload)
   *.exe (win installer + auto-update)
```

## Build artifact changes

`package.json` -> `build`:

```jsonc
"publish": [{ "provider": "github", "owner": "dtsoden", "repo": "hash-markup" }],
"mac": {
  "target": [
    { "target": "dmg", "arch": ["x64", "arm64"] },
    { "target": "zip", "arch": ["x64", "arm64"] }   // NEW: auto-update payload
  ],
  "notarize": true   // was false; required for Mac auto-update
}
```

Per-release artifacts:

| File | Purpose |
| --- | --- |
| `Hash-Markup-Setup-Windows.exe` | First-time install (Win), also serves as the update payload |
| `latest.yml` | electron-updater manifest (Win) |
| `Hash-Markup-mac-arm64.dmg` | First-time install (Mac arm64) |
| `Hash-Markup-mac-x64.dmg` | First-time install (Mac x64) |
| `Hash-Markup-mac-arm64.zip` | Auto-update payload (Mac arm64) |
| `Hash-Markup-mac-x64.zip` | Auto-update payload (Mac x64) |
| `latest-mac.yml` | electron-updater manifest (Mac) |

All seven must be uploaded to each GitHub Release. electron-builder generates them; the upload step is just `gh release upload`.

## Update UX flow

```
T+0s   App starts
T+10s  UpdaterService.checkForUpdates() (silent; failures swallowed)
       │
       ├─ no update          → nothing visible
       └─ update available
            │
            └─ IPC update:state -> UpdateBanner shows
               "Hash Markup 0.1.2 is available. [What's new] [Update] [Later]"
                │
                ├─ Later        → banner closes; reshown only on next launch
                ├─ What's new   → expands inline release notes (rendered from GitHub body)
                └─ Update
                   │
                   IPC update:download -> autoUpdater.downloadUpdate()
                   │
                   Banner becomes a progress bar with live %
                   │
                   Download complete
                   │
                   Banner: "Update ready. [Restart now] [On next quit]"
                   │
                   ├─ Restart now    → autoUpdater.quitAndInstall(); relaunch
                   └─ On next quit   → autoInstallOnAppQuit=true; applies on exit
```

Manual via **Help > Check for Updates**: same flow, but when no update is found it surfaces a small "You're up to date" toast (silent auto-check stays silent).

## About dialog

Help menu > **About Hash Markup** on both platforms. macOS retains the native Apple-menu About item via `app.setAboutPanelOptions`.

```
┌──────────────────────────────┐
│       [# icon, 96px]         │
│                              │
│        Hash Markup           │
│   0.1.1 (build abc1234)      │
│                              │
│       By David Soden         │
│        MIT Licensed          │
│                              │
│   [Check for Updates]        │
└──────────────────────────────┘
```

The build hash is the output of `git rev-parse --short HEAD` at build time, baked into the renderer via `electron-vite` `define` and into main via a generated `src/shared/build-info.ts`.

## File changes

### New

- `src/main/UpdaterService.ts` - wraps electron-updater, owns the state machine, broadcasts to renderer via IPC.
- `src/renderer/src/components/AboutDialog.tsx` - modal with version + build hash + Check-for-Updates button.
- `src/renderer/src/components/UpdateBanner.tsx` - top-of-window banner for available / downloading / ready / error states.
- `scripts/inject-build-hash.mjs` - prestep that writes `src/shared/build-info.ts` with the current git short hash. Runs at start of `npm run build`.

### Modified

- `package.json` - `electron-updater` dep, mac zip target, `notarize: true`, `publish` config, `prebuild` script that injects build hash.
- `src/main/MenuBuilder.ts` - Help submenu adds "About Hash Markup" + "Check for Updates".
- `src/main/index.ts` - instantiates UpdaterService after `whenReady`.
- `src/shared/ipc-channels.ts` - channels: `UpdateState`, `UpdateCheck`, `UpdateDownload`, `UpdateInstall`, `OpenAbout`.
- `src/preload/index.ts` - exposes `checkForUpdates`, `downloadUpdate`, `quitAndInstall`, `onUpdateState`, plus a `buildInfo` accessor.
- `src/renderer/src/App.tsx` - mounts UpdateBanner, opens AboutDialog on menu action.
- `BUILD-MAC.md` - notes that notarization is now mandatory; new zip artifacts and `latest-mac.yml` must be uploaded.
- `.gitignore` - ignore `src/shared/build-info.ts` (auto-generated).

## IPC contract

```typescript
// main -> renderer broadcast
type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available', version: string, releaseNotes?: string }
  | { kind: 'downloading', percent: number, transferred: number, total: number }
  | { kind: 'ready', version: string }
  | { kind: 'none' }   // explicit "up to date", only after manual check
  | { kind: 'error', message: string };

// renderer -> main invoke
checkForUpdates(manual: boolean): Promise<void>
downloadUpdate(): Promise<void>
quitAndInstall(): Promise<void>
```

## Error handling

| Failure | Auto-check | Manual check |
| --- | --- | --- |
| Network unreachable | Swallow, log | "Couldn't check for updates. Try again later." toast |
| GitHub rate limit | Swallow, log | Same toast |
| Manifest parse error | Swallow, log | Same toast |
| Download failure | Banner becomes error state with Retry | Same |
| Apply failure (e.g., Mac signature mismatch on update) | Error banner with fallback "Reinstall from hash-markup.davidsoden.com" | Same |

The "reinstall from website" fallback is the only place where an update flow points off-app, and only when the in-app apply step has actively failed.

## Testing

- **v0.1.1** is the seed release: ships the updater, but the v0.1.0 currently in the wild can't be auto-updated to v0.1.1 because it doesn't have the updater wired. Users on v0.1.0 download v0.1.1 manually.
- **v0.1.2** (OG fonts cross-platform work, next ticket) is the real test: anyone on v0.1.1 should be prompted to update.

Local dev testing: stub out the GitHub provider with a fake `latest.yml` served from a local server; verify each UpdateState transition renders the right UI.

## Out of scope (v0.1.1)

- Delta / incremental updates (full-package only).
- Multi-channel (alpha / beta / stable) - single stable channel.
- Background-while-working downloads - the banner stays visible during download by design.
- Non-GitHub provider support.
- Differential signing for Mac (we will full-sign every release).

## Risks

- **Mac notarization is now on the critical path.** If a release ships without notarization, the auto-update will fail to apply for Mac users (Gatekeeper rejects the staple). `BUILD-MAC.md` will be updated to make this explicit; the build flow already supports it via `APPLE_KEYCHAIN_PROFILE`.
- **First-ever notarization submission to Apple can take ~90 minutes.** Subsequent submissions are 1-5 minutes. Schedule v0.1.1 release time accordingly.
- **GitHub API rate limits** are 60 req/hr unauthenticated. For a single-machine check at launch this is fine. If auto-update grows to repeated polls it would matter; not now.

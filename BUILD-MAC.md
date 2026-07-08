# Mac build handoff

This file is the recipe for producing the macOS deliverables of Hash Markup. It is meant to be run from a Mac with the source checked out at the same commit as the Windows release.

The Windows side runs from a Windows machine and builds `Hash-Markup-Setup-Windows.exe` plus `latest.yml`. The Mac side runs from a Mac and builds:

- `Hash-Markup-mac-arm64.dmg` (Apple Silicon first-time install)
- `Hash-Markup-mac-x64.dmg` (Intel first-time install)
- `Hash-Markup-mac-arm64.zip` (Apple Silicon auto-update payload)
- `Hash-Markup-mac-x64.zip` (Intel auto-update payload)
- `latest-mac.yml` (electron-updater manifest; the in-app updater reads this from the GitHub release to detect new versions)

All five Mac files plus the Windows side's two ship as assets on the same GitHub Release tag.

## v0.1.1 changes the rules: notarization is now mandatory

Starting with v0.1.1, the app has an in-app auto-updater (`electron-updater`). For it to actually install an update on a user's machine, **every release must be Developer-ID-signed AND Apple-notarized**. A signed-but-not-notarized release will:

- Pass Gatekeeper on first install (right-click > Open still works once).
- **Fail silently** when the auto-updater tries to apply the next release on top of it, because macOS Gatekeeper rejects the staple verification at apply time.

`package.json` -> `build.mac.notarize` is `true`. The `scripts/notarize.cjs` `afterSign` hook is invoked automatically. Both rely on `APPLE_KEYCHAIN_PROFILE` being set in the environment. Don't ship a release without it.

---

## Prerequisites (one-time)

### 1. Apple Developer Program membership

You need an active **Apple Developer Program** membership ($99/yr) to obtain a Developer ID certificate. Sign up at https://developer.apple.com/programs/enroll.

### 2. Developer ID Application certificate (signing identity)

This certificate is what cryptographically proves the app came from you.

1. Open **Keychain Access** on the Mac (Spotlight: "Keychain Access").
2. Menu: **Keychain Access > Certificate Assistant > Request a Certificate From a Certificate Authority...**
   - User Email Address: your Apple Developer email
   - Common Name: any sane label (e.g. "David Soden Developer ID")
   - **Saved to disk**, leave "CA Email Address" blank
   - Save the resulting `.certSigningRequest` somewhere you can find
3. Go to https://developer.apple.com/account/resources/certificates/list and sign in.
4. Click the blue **+** button (top right).
5. Under the **Software** section, select **"Developer ID Application"**. Continue.
6. Upload the `.certSigningRequest` from step 2. Continue. Download the resulting `.cer` file.
7. Double-click the `.cer` to install it into Keychain. It now joins the private key from step 2 to form a complete signing identity.
8. Verify in Terminal: `security find-identity -v -p codesigning`
   You should see a line like: `1) ABCDEF1234... "Developer ID Application: David Soden (XXXXXXXXXX)"`. The 10-char string in parentheses is your **Team ID**.

### 3. Notarization credentials

Notarization is Apple's automated malware scan. Required for Gatekeeper to not warn users on first launch.

You need an **app-specific password** (NOT your regular Apple ID password):

1. Go to https://account.apple.com.
2. Sign in.
3. Sign-In and Security > **App-Specific Passwords**.
4. Click the **+** button. Name it `notarytool-hash-markup` or similar. Copy the resulting 16-char password (you only see it once).

### 4. Store credentials in Keychain (NOT in files)

This repo is public. The Apple ID password must NEVER hit disk or git. We store it in macOS Keychain instead, and the build pulls it at notarization time.

Run once, on the Mac:

```bash
xcrun notarytool store-credentials "hash-markup-notarytool" \
  --apple-id "your.apple.id@example.com" \
  --team-id "XXXXXXXXXX" \
  --password "abcd-efgh-ijkl-mnop"
```

This saves the three values under a Keychain profile called `hash-markup-notarytool`. Subsequent calls reference the profile, not the secret.

---

## Setup (every fresh clone)

```bash
git clone https://github.com/dtsoden/hash-markup.git
cd hash-markup
npm install
```

That's it. Nothing else needs installing on the Mac side.

---

## Build (every release)

The Windows side cuts the release tag and bumps `package.json` version first. Pull that commit on the Mac, then:

```bash
git pull origin main          # make sure you're on the release commit
npm install                   # in case dependencies changed
APPLE_KEYCHAIN_PROFILE=hash-markup-notarytool npm run package:mac
```

This produces (in `release/`):

```
Hash-Markup-mac-arm64.dmg          first-time install, Apple Silicon
Hash-Markup-mac-x64.dmg            first-time install, Intel
Hash-Markup-mac-arm64.zip          auto-update payload, Apple Silicon
Hash-Markup-mac-x64.zip            auto-update payload, Intel
latest-mac.yml                     electron-updater manifest
```

The two `.zip` files are NEW as of v0.1.1; they're how `electron-updater` applies updates on macOS (it can't update from a `.dmg`). `latest-mac.yml` is also new; it's the manifest the in-app updater fetches from the GitHub release to detect new versions, and lists SHA-512 hashes for both ZIPs.

(Plus some build-artifact subdirs you can ignore.)

### How notarization is wired

`package.json` -> `build.afterSign` points at `scripts/notarize.cjs`. After electron-builder signs each .app (once per arch), the hook runs `@electron/notarize` with the Keychain profile named in `APPLE_KEYCHAIN_PROFILE` and waits for Apple's notary service to:

1. Receive the zipped .app upload via `notarytool`.
2. Scan it (~1–5 minutes per arch; **first-ever submission on a fresh Apple Developer account can take ~90 min** — be patient, do not cancel).
3. Issue a ticket that the hook staples to the .app inside the DMG.

The `APPLE_KEYCHAIN_PROFILE` env var tells the hook which Keychain profile to use. That's why step 4 in Prerequisites is required.

As of v0.1.1, `build.mac.notarize` is `true`. The custom `afterSign` hook (`scripts/notarize.cjs`) does the notarytool submission using `APPLE_KEYCHAIN_PROFILE`. The hook supersedes electron-builder's built-in notarize path, which would otherwise look for `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` env vars (we don't use those because they put the password on disk/env; the Keychain profile keeps it in the OS keychain).

To intentionally skip notarization for **local testing only**, unset `APPLE_KEYCHAIN_PROFILE` before building. The hook logs `skipping notarization` and the DMG ships signed-only. **Never ship such a build publicly** in v0.1.1+: the in-app updater on users' machines will fail to apply the next update if a previous release wasn't notarized.

---

## Handoff back to the release

Once the two DMGs are built:

### Option A: drop them in the Windows machine's `release/` directory

If you have a shared drive or can copy them over, drop both `.dmg` files in `release/` on the Windows machine. The Windows-side release script will pick them up and attach them to the GitHub Release.

### Option B: attach to the release yourself

If you have `gh` CLI installed on the Mac:

```bash
gh auth login                 # if not already logged in as dtsoden
gh release upload v0.2.1 \
  release/Hash-Markup-mac-arm64.dmg \
  release/Hash-Markup-mac-x64.dmg \
  release/Hash-Markup-mac-arm64.zip \
  release/Hash-Markup-mac-x64.zip \
  release/latest-mac.yml \
  --clobber
```

All five files must be uploaded. Missing the ZIPs or the `latest-mac.yml` will silently break auto-update for Mac users on the previous version (they'll never see the new release because the manifest is missing).

(`--clobber` overwrites if you re-upload during testing.)

The release URL will be `https://github.com/dtsoden/hash-markup/releases/tag/v<version>`. After upload:

- Landing page download links at `hash-markup.davidsoden.com` start working for Mac users (they point at `releases/latest/download/Hash-Markup-mac-{arch}.dmg`).
- Existing installs of Hash Markup on Macs will discover the new version on their next launch via the in-app updater.

---

## Versioning

`package.json` `version` is the source of truth. The Windows release script bumps it (e.g., `0.1.0 -> 0.1.1`), commits, tags `v0.1.1`, and pushes. The Mac build must run against that exact commit so the produced DMGs report the correct version.

A typical sequence:

1. Windows side: bump version, commit, tag, push, build Windows EXE, attach **EXE + `latest.yml`** to release.
2. Mac side: `git pull`, build, attach **2 DMGs + 2 ZIPs + `latest-mac.yml`** to the same release tag (Option B above).
3. Landing page is redeployed by the Windows side as part of the release script. Once both halves' artifacts are attached, users on the site can download for any platform AND existing installs auto-update on next launch.

Both manifest files (`latest.yml` and `latest-mac.yml`) must be present on the release for auto-update to function. Missing either one breaks the corresponding platform's updater.

---

## Troubleshooting

**"errSecInternalComponent" or signing fails:**
Your Developer ID cert is missing, expired, or revoked. Re-check Keychain Access > My Certificates.

**"Notarization failed":**
Run `xcrun notarytool log <submission-id> --keychain-profile hash-markup-notarytool` to see Apple's specific complaint. Most often it's an entitlement mismatch or an unsigned native binary inside the .app.

**Auto-update silently fails on Mac for v0.1.1+ users:**
Either (a) the previously-installed release wasn't notarized so Gatekeeper rejects the staple at apply time, or (b) the new release's `latest-mac.yml` or `.zip` files weren't uploaded to the GitHub Release. Verify the Release page on GitHub has all five Mac assets and re-run `xcrun stapler validate "Hash Markup.app"` on the previously-installed version to confirm it has a valid staple.

**`electron-updater` reports `No published versions on GitHub`:**
The Release exists but the manifest file (`latest-mac.yml`) wasn't uploaded. Re-run `gh release upload` with `--clobber`.

**"You can't open the application" on a tester's machine:**
The build was signed but not notarized. Flip `build.mac.notarize` to `true` in `package.json` and rebuild.

**Apple Silicon Mac asks "App is from an unidentified developer":**
Notarization stapling failed or was skipped. Rebuild with `notarize: true` and verify the staple ran: `xcrun stapler validate "Hash Markup.app"`.

---

## What is intentionally NOT in this doc

- The Cloudflare Pages deploy (Windows-side only).
- The GitHub release creation (Windows-side only).
- Source code changes; this is build-only.

If a step here references a step not in this file, see the Windows side or ask in the GitHub Issues for the repo.

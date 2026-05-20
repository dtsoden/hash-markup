# Mac build handoff

This file is the recipe for producing the macOS DMGs (Intel + Apple Silicon) of Hash Markup. It is meant to be run from a Mac with the source checked out at the same commit as the Windows release.

The Windows side runs from a Windows machine and builds `Hash-Markup-Setup-Windows.exe`. The Mac side runs from a Mac and builds:

- `Hash-Markup-mac-arm64.dmg` (Apple Silicon)
- `Hash-Markup-mac-x64.dmg` (Intel)

Both sides ship as assets on the same GitHub Release tag.

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

This produces:

```
release/Hash-Markup-mac-arm64.dmg
release/Hash-Markup-mac-x64.dmg
```

(Plus some build-artifact subdirs you can ignore.)

### How notarization is wired

`package.json` -> `build.afterSign` points at `scripts/notarize.cjs`. After electron-builder signs each .app (once per arch), the hook runs `@electron/notarize` with the Keychain profile named in `APPLE_KEYCHAIN_PROFILE` and waits for Apple's notary service to:

1. Receive the zipped .app upload via `notarytool`.
2. Scan it (~1–5 minutes per arch; **first-ever submission on a fresh Apple Developer account can take ~90 min** — be patient, do not cancel).
3. Issue a ticket that the hook staples to the .app inside the DMG.

The `APPLE_KEYCHAIN_PROFILE` env var tells the hook which Keychain profile to use. That's why step 4 in Prerequisites is required.

`build.mac.notarize` is intentionally `false` — that disables electron-builder's built-in notarize path (which only honors `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` env vars and would force the password onto disk/env). The custom hook supersedes it.

To intentionally skip notarization for local testing, unset `APPLE_KEYCHAIN_PROFILE` before building — the hook logs `skipping notarization` and the DMG ships signed-only:
- Gatekeeper will refuse to open it on first launch on Mac.
- Users must right-click the app in `/Applications` and choose **Open** the first time.

---

## Handoff back to the release

Once the two DMGs are built:

### Option A: drop them in the Windows machine's `release/` directory

If you have a shared drive or can copy them over, drop both `.dmg` files in `release/` on the Windows machine. The Windows-side release script will pick them up and attach them to the GitHub Release.

### Option B: attach to the release yourself

If you have `gh` CLI installed on the Mac:

```bash
gh auth login                 # if not already logged in as dtsoden
gh release upload v0.1.0 \
  release/Hash-Markup-mac-arm64.dmg \
  release/Hash-Markup-mac-x64.dmg \
  --clobber
```

(`--clobber` overwrites if you re-upload during testing.)

The release URL will be `https://github.com/dtsoden/hash-markup/releases/tag/v0.1.0`. After upload, the landing page download links at `hash-markup.davidsoden.com` will start working for Mac users (they already point at `releases/latest/download/Hash-Markup-mac-{arch}.dmg`).

---

## Versioning

`package.json` `version` is the source of truth. The Windows release script bumps it (e.g., `0.1.0 -> 0.1.1`), commits, tags `v0.1.1`, and pushes. The Mac build must run against that exact commit so the produced DMGs report the correct version.

A typical sequence:

1. Windows side: bump version, commit, tag, push, build Windows EXE, attach to release.
2. Mac side: `git pull`, build, attach DMGs to the same release tag (Option B above).
3. Landing page is redeployed by the Windows side as part of the release script. Once both halves are attached, users on the site can download for any platform.

---

## Troubleshooting

**"errSecInternalComponent" or signing fails:**
Your Developer ID cert is missing, expired, or revoked. Re-check Keychain Access > My Certificates.

**"Notarization failed":**
Run `xcrun notarytool log <submission-id> --keychain-profile hash-markup-notarytool` to see Apple's specific complaint. Most often it's an entitlement mismatch or an unsigned native binary inside the .app.

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

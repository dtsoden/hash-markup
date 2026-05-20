# Hash Markup landing page (v0.1.0)

**Status**: approved
**Deploy target**: `hash-markup.davidsoden.com` (custom domain on Cloudflare Pages project `hash-markup`)
**Date**: 2026-05-19

## Goal

A single-page marketing site that converts visitors into app downloads (Mac DMG, Windows EXE) and shows current release version. Source link to GitHub is secondary; download buttons go directly to the latest release artifacts.

## Audience

Developers, technical writers, and anyone who maintains markdown documents. Keyboard-first users. Comfortable with the term "raw markdown."

## Architecture

- **Location**: `landing/` directory in `dtsoden/hash-markup` (same repo as the app, so version stays in lockstep).
- **Stack**: vanilla HTML + CSS + minimal JS. No framework, no bundler. Static-hosted.
- **Build script**: `landing/build.mjs` (Node) reads `version` from root `package.json`, performs string substitution on `landing/src/index.html`, copies CSS/JS/images, writes to `landing/dist/`.
- **Deploy**: `wrangler pages deploy landing/dist --project-name hash-markup --branch main` (interactive auth via `wrangler login`).
- **Release flow**: one orchestrator script `scripts/release.mjs` (built in a later step) bumps version, triggers Windows build, rebuilds landing, deploys landing, tags, creates GitHub Release.

## Stable artifact filenames

To make `releases/latest/download/<filename>` URLs work permanently, `electron-builder` artifactName is set so version is not in the filename:

| Platform | Filename |
| --- | --- |
| Mac arm64 (Apple Silicon) | `Hash-Markup-mac-arm64.dmg` |
| Mac x64 (Intel) | `Hash-Markup-mac-x64.dmg` |
| Windows x64 | `Hash-Markup-Setup-Windows.exe` |

The page still displays the actual version (top-right badge + footer), injected from `package.json` at build time.

## Page sections (top to bottom)

1. **Top bar (sticky)**: logo + product name + version badge (right) + "Source on GitHub" link.
2. **Hero**:
   - Headline: "Markdown that works the way you think."
   - Subhead: "WYSIWYG + raw markdown. Instant toggle. Built for keyboard people."
   - Primary CTA: OS-detected button. Mac users see "Download for Mac (Apple Silicon)"; Win users see "Download for Windows"; clicking goes straight to the artifact URL.
   - Secondary: "See all downloads" anchor-jumps to the download section.
3. **Hero screenshot**: large app screenshot in dark theme (WYSIWYG mode). Subtle Pexels desk/keyboard backdrop behind it.
4. **Features grid** (responsive 3-col / 1-col):
   - WYSIWYG + raw, instant toggle (Cmd/Ctrl + /)
   - Folder sidebar workspace
   - PDF export
   - Light / Dark / Auto theme
   - Zoom (Cmd/Ctrl + scroll)
   - Native menus + shortcuts
5. **Build-it-yourself / transparency section**: one short paragraph. MIT licensed, source on GitHub, link to README's "Build from source" section. Honest one-liner that early Windows builds are signed with a publisher cert (David Soden) but new certs have no SmartScreen reputation yet, so the first download may warn; click "More info > Run anyway."
6. **Download section** (anchor target `#download`): three explicit cards.
   - Mac (Apple Silicon) -> `Hash-Markup-mac-arm64.dmg`
   - Mac (Intel) -> `Hash-Markup-mac-x64.dmg`
   - Windows -> `Hash-Markup-Setup-Windows.exe`
   Each card shows the platform icon and a file-size approximation (hard-coded at first; later auto-filled by build script reading the latest GitHub Release).
7. **Footer**: copyright, MIT, version, "Source on GitHub", small Anthropic-free byline.

## Visual

- **Default mode**: dark. Background near-black (#0a0a0a or similar). Foreground near-white.
- **Light mode**: toggle in top-bar (optional in v1; may defer).
- **Accent color**: one. Picked after seeing the logo's colors. Likely a muted blue or purple (low saturation, dev-tool aesthetic).
- **Type**: Inter or system-ui for body; JetBrains Mono or system mono for the H1 and version badge. Monospace touches keep the dev-tool feel without going full retro.
- **Motion**: fade-in on scroll, one CSS rule. No carousel. No parallax. No third-party motion lib.

## Imagery

Sourced via the `pexels` skill:

- 1 hero backdrop (moody desk + keyboard, dark, low-contrast so it doesn't fight the screenshot)
- Optional 1-2 abstract textures for section dividers (kept sparse)

App screenshots (taken locally, not from Pexels):

- WYSIWYG mode, dark theme, sample document with headings/code/tables
- Markdown mode, dark theme, same document
- Sidebar + folder workspace, dark theme

## What is explicitly cut (YAGNI for v0.1.0)

- No carousel.
- No newsletter signup.
- No analytics / telemetry.
- No changelog page (link to GitHub Releases instead).
- No light-mode toggle in v1 unless time permits.
- No animations beyond a single fade-in.
- No "compare to X" tables.

## File layout (planned)

```
landing/
  src/
    index.html            (template with {{VERSION}} placeholder)
    styles.css
    script.js             (OS detection, fade-in observer)
    assets/
      logo.png            (copied/symlinked from root Logo.png)
      screenshot-wysiwyg-dark.png
      screenshot-markdown-dark.png
      hero-bg.jpg         (from Pexels)
  build.mjs               (Node script; reads package.json version, templates HTML, copies to dist)
  dist/                   (gitignored; what wrangler deploys)
  README.md               (how to build/deploy locally, deploy command, where assets come from)
wrangler.toml             (root; project-id, pages-build-output-dir = landing/dist)
```

## Build / deploy commands

- `npm run landing:build` -> runs `node landing/build.mjs`, outputs `landing/dist/`.
- `npm run landing:deploy` -> runs landing:build then `wrangler pages deploy landing/dist --project-name hash-markup`.
- `npm run landing:dev` -> serves `landing/dist/` via `npx serve` at localhost for sanity-check.

## Testing / verification

- Open `landing/dist/index.html` locally in browser after each build to eyeball.
- Verify version badge matches `package.json`.
- After wrangler deploy, hit `hash-markup.pages.dev` and verify:
  - Page loads with correct version.
  - Download links resolve (will 404 until v0.1.0 release exists; that's expected before release).
  - OS detection correctly highlights the right primary button on Mac/Windows.
- After v0.1.0 release is cut, confirm all 3 download links actually download the right file.

## Out of scope for this spec

- The `scripts/release.mjs` orchestrator (will get its own design when we cut the release).
- Mac DMG production (covered by `BUILD-MAC.md` handoff).
- Windows code signing wiring (separate work).

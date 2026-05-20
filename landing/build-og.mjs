// Generates landing/src/assets/og.png — the social-media share card.
// 1200x630, the size Twitter/Facebook/LinkedIn/Slack/iMessage all consume.
// Rendered from an inline SVG via @resvg/resvg-js so it rebuilds
// deterministically on every `npm run landing:build`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const ROOT = path.resolve(HERE, '..');

const VERSION = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
).version;

const W = 1200;
const H = 630;

// Brand palette mirrors landing/src/styles.css :root
const COLOR = {
  bgInner: '#1c1f33',
  bgOuter: '#0a0a14',
  panel: '#131318',
  panelElev: '#1c1c24',
  border: '#2a2a34',
  fg: '#ededf2',
  fgDim: '#a0a0aa',
  fgMute: '#6a6a74',
  accent: '#8b9eff',
  accentSoft: '#c8d2ff',
  red: '#ff5f57',
  yellow: '#febc2e',
  green: '#28c840',
  kw: '#c8a4ff',
  str: '#9ecbff',
};

// Font stacks: resvg-js resolves against system fonts.
// macOS has SF Mono + Helvetica Neue built in; this build runs from Mac.
const FONT_MONO = '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';
const FONT_SANS = '"Helvetica Neue", "SF Pro Display", Helvetica, Arial, sans-serif';

// Helper to keep the SVG legible
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function svg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <radialGradient id="bg" cx="32%" cy="40%" r="90%">
      <stop offset="0%" stop-color="${COLOR.bgInner}"/>
      <stop offset="100%" stop-color="${COLOR.bgOuter}"/>
    </radialGradient>
    <linearGradient id="hashGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${COLOR.accentSoft}"/>
      <stop offset="100%" stop-color="${COLOR.accent}"/>
    </linearGradient>
    <linearGradient id="headlineGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#d8dbf0"/>
    </linearGradient>
    <filter id="hashGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
      <feOffset dx="0" dy="2"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.5"/></feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="22"/>
      <feOffset dx="0" dy="14"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- Faint hash grid pattern for texture -->
  <g opacity="0.05" fill="${COLOR.accent}" font-family='${FONT_MONO}' font-size="22">
    <text x="60"   y="60" >#</text>
    <text x="60"   y="600">##</text>
    <text x="1120" y="60" >###</text>
    <text x="1140" y="600">#</text>
  </g>

  <!-- ============================ Brand lockup (top-left) ============================ -->
  <g transform="translate(56, 52)">
    <!-- Squircle mini-icon -->
    <rect x="0" y="0" width="60" height="60" rx="14" ry="14" fill="${COLOR.bgInner}" stroke="rgba(255,255,255,0.08)"/>
    <g transform="translate(6, 4) scale(0.05)" fill="url(#hashGrad)" filter="url(#hashGlow)">
      <path d="M 358 168 L 422 168 L 354 856 L 290 856 Z" />
      <path d="M 666 168 L 730 168 L 662 856 L 598 856 Z" />
      <rect x="160" y="372" width="704" height="76" rx="14" />
      <rect x="160" y="576" width="704" height="76" rx="14" />
    </g>
    <!-- Wordmark -->
    <text x="78" y="40" font-family='${FONT_MONO}' font-size="28" font-weight="600" fill="${COLOR.fg}">Hash Markup</text>
    <!-- Version pill -->
    <g transform="translate(280, 19)">
      <rect x="0" y="0" width="74" height="26" rx="13" fill="${COLOR.panel}" stroke="${COLOR.border}"/>
      <text x="37" y="18" font-family='${FONT_MONO}' font-size="14" fill="${COLOR.fgDim}" text-anchor="middle">v${esc(VERSION)}</text>
    </g>
  </g>

  <!-- ============================ Headline block (left) ============================ -->
  <g transform="translate(56, 200)">
    <text font-family='${FONT_MONO}' font-size="58" font-weight="700" fill="url(#headlineGrad)" letter-spacing="-1.2">
      <tspan x="0" y="0">Markdown that works</tspan>
      <tspan x="0" y="68">the way you think.</tspan>
    </text>

    <!-- Value prop (mono, accent) -->
    <text x="0" y="148" font-family='${FONT_MONO}' font-size="24" fill="${COLOR.accent}" font-weight="500">
      WYSIWYG  ↔  Raw.  Instant toggle.
    </text>

    <!-- Lede / audience (sans, dim) -->
    <text x="0" y="190" font-family='${FONT_SANS}' font-size="21" fill="${COLOR.fgDim}">
      For developers, writers, and the prompt-writing rest of us.
    </text>

    <!-- Pills row -->
    <g transform="translate(0, 230)" font-family='${FONT_MONO}' font-size="15" font-weight="500">
      <g>
        <rect x="0"   y="0" width="100" height="32" rx="16" fill="${COLOR.panel}" stroke="${COLOR.border}"/>
        <text x="50"  y="21" fill="${COLOR.fg}" text-anchor="middle">macOS</text>
      </g>
      <g transform="translate(112, 0)">
        <rect x="0"   y="0" width="100" height="32" rx="16" fill="${COLOR.panel}" stroke="${COLOR.border}"/>
        <text x="50"  y="21" fill="${COLOR.fg}" text-anchor="middle">Windows</text>
      </g>
      <g transform="translate(224, 0)">
        <rect x="0"   y="0" width="100" height="32" rx="16" fill="${COLOR.panel}" stroke="${COLOR.border}"/>
        <text x="50"  y="21" fill="${COLOR.fg}" text-anchor="middle">Free · MIT</text>
      </g>
    </g>
  </g>

  <!-- ============================ Editor mockup (right) ============================ -->
  <g transform="translate(720, 168)" filter="url(#cardShadow)">
    <!-- Card -->
    <rect x="0" y="0" width="424" height="354" rx="14" fill="${COLOR.panel}" stroke="${COLOR.border}"/>
    <!-- Titlebar -->
    <rect x="0" y="0" width="424" height="38" rx="14" fill="${COLOR.panelElev}"/>
    <!-- Square out the bottom corners of titlebar -->
    <rect x="0" y="22" width="424" height="16" fill="${COLOR.panelElev}"/>
    <line x1="0" y1="38" x2="424" y2="38" stroke="${COLOR.border}"/>
    <!-- Traffic lights -->
    <circle cx="20" cy="19" r="6" fill="${COLOR.red}"/>
    <circle cx="40" cy="19" r="6" fill="${COLOR.yellow}"/>
    <circle cx="60" cy="19" r="6" fill="${COLOR.green}"/>
    <text x="212" y="23" font-family='${FONT_MONO}' font-size="13" fill="${COLOR.fgMute}" text-anchor="middle">README.md</text>

    <!-- Editor body -->
    <g transform="translate(24, 64)" font-family='${FONT_MONO}' font-size="16">
      <text>
        <tspan x="0" y="0"><tspan fill="${COLOR.accent}">#</tspan> <tspan fill="${COLOR.fg}" font-weight="600">Hash Markup</tspan></tspan>
      </text>
      <text x="0" y="32" fill="${COLOR.fgDim}">Markdown that works the way you <tspan fill="${COLOR.fg}">think</tspan>.</text>

      <text x="0" y="76">
        <tspan fill="${COLOR.accent}">##</tspan> <tspan fill="${COLOR.fg}" font-weight="600">Why</tspan>
      </text>
      <text x="0" y="104" fill="${COLOR.fgDim}">- <tspan fill="${COLOR.accent}">[x]</tspan> WYSIWYG + raw</text>
      <text x="0" y="128" fill="${COLOR.fgDim}">- <tspan fill="${COLOR.accent}">[x]</tspan> Dark mode</text>
      <text x="0" y="152" fill="${COLOR.fgDim}">- <tspan fill="${COLOR.accent}">[x]</tspan> PDF export</text>
      <text x="0" y="176" fill="${COLOR.fgDim}">- <tspan fill="${COLOR.accent}">[ ]</tspan> Subscriptions</text>

      <text x="0" y="220"><tspan fill="${COLOR.accent}">\`\`\`</tspan>js</text>
      <text x="0" y="244">
        <tspan fill="${COLOR.kw}">const</tspan> <tspan fill="${COLOR.fg}">editor</tspan> = <tspan fill="${COLOR.kw}">new</tspan> <tspan fill="${COLOR.fg}">HashMarkup</tspan>();
      </text>
      <text x="0" y="268"><tspan fill="${COLOR.fg}">editor</tspan>.<tspan fill="${COLOR.accent}">open</tspan>(<tspan fill="${COLOR.str}">'prompt.md'</tspan>);</text>
      <text x="0" y="292"><tspan fill="${COLOR.accent}">\`\`\`</tspan></text>
    </g>
  </g>

  <!-- ============================ Footer strip ============================ -->
  <g transform="translate(56, 580)" font-family='${FONT_MONO}' font-size="18">
    <text fill="${COLOR.fgDim}">hash-markup.davidsoden.com</text>
    <text x="${W - 112}" y="0" fill="${COLOR.fgMute}" text-anchor="end">no subscriptions · no telemetry · open source</text>
  </g>
</svg>`;
}

function build() {
  const outDir = path.join(HERE, 'src', 'assets');
  const out = path.join(outDir, 'og.png');
  fs.mkdirSync(outDir, { recursive: true });

  const source = svg();
  const resvg = new Resvg(source, {
    fitTo: { mode: 'width', value: W },
    background: COLOR.bgOuter,
    font: { loadSystemFonts: true },
  });
  fs.writeFileSync(out, resvg.render().asPng());
  console.log(`OG image built (${W}x${H}) -> ${path.relative(ROOT, out)}`);
}

build();

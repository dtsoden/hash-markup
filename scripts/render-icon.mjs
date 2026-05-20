// Renders design/icon.svg into the PNG files the app + landing page consume.
// Run with: node scripts/render-icon.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const SVG_PATH = path.join(ROOT, 'design', 'icon.svg');

const svg = fs.readFileSync(SVG_PATH, 'utf8');

function render(targetSize) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: targetSize },
    background: 'transparent',
  });
  return resvg.render().asPng();
}

const targets = [
  // electron-builder picks this up and generates platform-specific formats
  { out: path.join(ROOT, 'build', 'icon.png'), size: 1024 },
  // landing page favicon + brand
  { out: path.join(ROOT, 'landing', 'src', 'assets', 'logo.png'), size: 512 },
  // root brand (used in README)
  { out: path.join(ROOT, 'Logo.png'), size: 512 },
];

for (const { out, size } of targets) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, render(size));
  console.log(`Wrote ${path.relative(ROOT, out)} at ${size}x${size}`);
}

// Also copy the SVG to the landing assets so it can be used directly in <img>
fs.copyFileSync(SVG_PATH, path.join(ROOT, 'landing', 'src', 'assets', 'logo.svg'));
console.log(`Copied design/icon.svg -> landing/src/assets/logo.svg`);

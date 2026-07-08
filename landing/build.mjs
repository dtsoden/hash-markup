// Build the landing page. Reads version from root package.json, substitutes
// {{VERSION}} placeholders into the HTML, copies all assets to dist/.
//
// The social-share OG image (src/assets/og.png + og.jpg) is a STATIC,
// committed asset — it is NOT regenerated here. It gets copied to dist/ like
// any other asset, so every build ships the exact same bytes (no per-release
// churn, no Mac/Windows drift). To deliberately refresh it after a visual
// change, run `npm run landing:og` and commit the result.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const ROOT = path.resolve(HERE, '..');

const SRC = path.join(HERE, 'src');
const DIST = path.join(HERE, 'dist');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;

function rmDist() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
}

function copyTree(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    const s = path.join(srcDir, name);
    const d = path.join(destDir, name);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) {
      copyTree(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function templateHtml() {
  const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  const out = html.replaceAll('{{VERSION}}', VERSION);
  fs.writeFileSync(path.join(DIST, 'index.html'), out);
}

function copyStatic() {
  fs.copyFileSync(path.join(SRC, 'styles.css'), path.join(DIST, 'styles.css'));
  fs.copyFileSync(path.join(SRC, 'script.js'), path.join(DIST, 'script.js'));
  copyTree(path.join(SRC, 'assets'), path.join(DIST, 'assets'));
}

rmDist();
templateHtml();
copyStatic();

console.log(`Landing page built for v${VERSION} -> ${DIST}`);

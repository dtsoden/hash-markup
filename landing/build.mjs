// Build the landing page. Reads version from root package.json, substitutes
// {{VERSION}} placeholders into the HTML, regenerates the social-share
// OG image, copies all assets to dist/.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

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

function buildOg() {
  execSync('node ' + path.join(HERE, 'build-og.mjs'), { stdio: 'inherit' });
}

rmDist();
buildOg();
templateHtml();
copyStatic();

console.log(`Landing page built for v${VERSION} -> ${DIST}`);

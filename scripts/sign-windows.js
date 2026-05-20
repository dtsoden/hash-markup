// electron-builder sign hook for Azure Trusted Signing.
// Auth flow: Azure.CodeSigning.Dlib uses Azure.Identity's DefaultAzureCredential,
// which picks up the active `az login` session. No secrets in this file or repo.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SIGNTOOL = path.join(
  ROOT,
  'tools',
  'nuget-cache',
  'Microsoft.Windows.SDK.BuildTools.10.0.28000.1839',
  'bin',
  '10.0.28000.0',
  'x64',
  'signtool.exe',
);
const DLIB = path.join(
  ROOT,
  'tools',
  'nuget-cache',
  'Microsoft.Trusted.Signing.Client.1.0.95',
  'bin',
  'x64',
  'Azure.CodeSigning.Dlib.dll',
);
const METADATA = path.join(ROOT, 'build', 'trusted-signing-metadata.json');

function assertExists(label, p) {
  if (!fs.existsSync(p)) {
    throw new Error(
      `[sign-windows] ${label} not found at ${p}. Run \`node scripts/setup-signing.mjs\` first.`,
    );
  }
}

exports.default = async function sign(configuration) {
  const file = configuration && configuration.path;
  if (!file) throw new Error('[sign-windows] No file path provided by electron-builder.');

  assertExists('signtool.exe', SIGNTOOL);
  assertExists('Azure.CodeSigning.Dlib.dll', DLIB);
  assertExists('trusted-signing-metadata.json', METADATA);

  const args = [
    'sign',
    '/v',
    '/debug',
    '/fd', 'SHA256',
    '/tr', 'http://timestamp.acs.microsoft.com',
    '/td', 'SHA256',
    '/dlib', DLIB,
    '/dmdf', METADATA,
    file,
  ];

  console.log(`[sign-windows] Signing ${path.basename(file)} via Azure Trusted Signing`);
  execSync(`"${SIGNTOOL}" ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`, {
    stdio: 'inherit',
  });
};

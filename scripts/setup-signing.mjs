// One-time setup for the Windows code-signing toolchain.
// Downloads nuget.exe and fetches the NuGet packages that provide:
//   - signtool.exe (Microsoft.Windows.SDK.BuildTools)
//   - Azure.CodeSigning.Dlib.dll (Microsoft.Trusted.Signing.Client)
// Everything lands in `tools/` which is gitignored.
//
// After running this, also run `az login` with an identity that has the
// `Trusted Signing Certificate Profile Signer` role on the cert profile.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import https from 'node:https';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const TOOLS = path.join(ROOT, 'tools');
const NUGET = path.join(TOOLS, 'nuget.exe');
const CACHE = path.join(TOOLS, 'nuget-cache');

const SDK_PKG = 'Microsoft.Windows.SDK.BuildTools';
const SDK_VER = '10.0.28000.1839';
const TS_PKG = 'Microsoft.Trusted.Signing.Client';
const TS_VER = '1.0.95';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
      out.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(TOOLS, { recursive: true });
  fs.mkdirSync(CACHE, { recursive: true });

  if (!fs.existsSync(NUGET)) {
    console.log('Downloading nuget.exe ...');
    await download('https://dist.nuget.org/win-x86-commandline/latest/nuget.exe', NUGET);
  } else {
    console.log('nuget.exe already present.');
  }

  const sourceListed = execSync(`"${NUGET}" sources`, { encoding: 'utf8' });
  if (!sourceListed.includes('nuget.org')) {
    console.log('Adding nuget.org as a source ...');
    execSync(`"${NUGET}" sources Add -Name nuget.org -Source https://api.nuget.org/v3/index.json`, {
      stdio: 'inherit',
    });
  }

  const installs = [
    { id: SDK_PKG, ver: SDK_VER },
    { id: TS_PKG, ver: TS_VER },
  ];
  for (const { id, ver } of installs) {
    const dir = path.join(CACHE, `${id}.${ver}`);
    if (fs.existsSync(dir)) {
      console.log(`${id} ${ver} already installed.`);
      continue;
    }
    console.log(`Installing ${id} ${ver} ...`);
    execSync(`"${NUGET}" install ${id} -Version ${ver} -OutputDirectory "${CACHE}"`, {
      stdio: 'inherit',
    });
  }

  console.log('\nSigning toolchain ready. Next steps:');
  console.log('  1) az login (with an identity that has Trusted Signing Certificate Profile Signer role)');
  console.log('  2) npm run package:win');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

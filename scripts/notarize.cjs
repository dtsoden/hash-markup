// electron-builder afterSign hook: notarize the signed .app using a Keychain
// profile (so the Apple ID + app-specific password live only in Keychain,
// not in env vars or files).
//
// Set APPLE_KEYCHAIN_PROFILE before invoking the build, e.g.:
//   APPLE_KEYCHAIN_PROFILE=hash-markup-notarytool npm run package:mac

const path = require('node:path');
const { notarize } = require('@electron/notarize');

module.exports = async function notarizing(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== 'darwin') return;

  const profile = process.env.APPLE_KEYCHAIN_PROFILE;
  if (!profile) {
    console.log('[notarize] APPLE_KEYCHAIN_PROFILE not set — skipping notarization');
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`[notarize] Submitting ${appPath} via keychain profile "${profile}"`);
  await notarize({
    tool: 'notarytool',
    appPath,
    keychainProfile: profile,
  });
  console.log(`[notarize] Stapled ticket to ${appPath}`);
};

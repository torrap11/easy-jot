'use strict';

/**
 * Strip extended attributes before codesign. Required when the project or output
 * lives under iCloud Drive — Finder/sync "detritus" breaks ad-hoc signing.
 */
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function electronAfterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const name = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${name}.app`);

  try {
    // Whole output dir: nested Helper *.app bundles must be clean before codesign
    execFileSync('xattr', ['-cr', context.appOutDir], { stdio: 'inherit' });
    console.log('[afterPack] xattr -cr', context.appOutDir);
    execFileSync('xattr', ['-cr', appPath], { stdio: 'inherit' });
    console.log('[afterPack] xattr -cr', appPath);
  } catch (err) {
    console.warn('[afterPack] xattr -cr failed:', err.message);
  }
};

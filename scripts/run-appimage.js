'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DIST_DIR, emptyDir, log, runCommand } = require('./common');

function findAppImage() {
  const entries = fs.existsSync(DIST_DIR)
    ? fs.readdirSync(DIST_DIR).filter((entry) => entry.endsWith('.AppImage')).sort()
    : [];

  if (entries.length === 0) {
    throw new Error(`No AppImage found in ${DIST_DIR}. Run \`npm run package\` first.`);
  }

  return path.join(DIST_DIR, entries[entries.length - 1]);
}

function main() {
  const appImagePath = findAppImage();
  const extractRoot = path.join(os.tmpdir(), 'rakuten-link-appimage-run');
  const squashfsRoot = path.join(extractRoot, 'squashfs-root');
  const appRunPath = path.join(squashfsRoot, 'AppRun');

  emptyDir(extractRoot);
  runCommand(appImagePath, ['--appimage-extract'], {
    cwd: extractRoot,
    env: {
      ...process.env,
      NO_CLEANUP: '1',
    },
    stdio: 'ignore',
  });

  if (!fs.existsSync(appRunPath)) {
    throw new Error(`AppRun not found after extraction: ${appRunPath}`);
  }

  const child = spawn(appRunPath, [], {
    stdio: 'inherit',
    cwd: squashfsRoot,
    env: {
      ...process.env,
      RAKUTENLINK_DISABLE_UPDATER: process.env.RAKUTENLINK_DISABLE_UPDATER || '1',
      RAKUTENLINK_ENABLE_BLUETOOTH: process.env.RAKUTENLINK_ENABLE_BLUETOOTH || '0',
      RAKUTENLINK_LINUX_SAFE_WINDOW_MODE: process.env.RAKUTENLINK_LINUX_SAFE_WINDOW_MODE || '1',
    },
  });

  log(`Launching extracted AppImage runtime from ${appRunPath}`);

  child.on('exit', (code) => {
    process.exit(code === null ? 1 : code);
  });
}

try {
  main();
} catch (error) {
  console.error(error.stack || error);
  process.exit(1);
}

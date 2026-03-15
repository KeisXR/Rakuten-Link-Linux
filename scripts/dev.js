'use strict';

const { spawn } = require('child_process');
const { APP_DIR, log } = require('./common');
const { prepareRuntime } = require('./prepare');

function main() {
  prepareRuntime();

  let electronBinary;

  try {
    electronBinary = require('electron');
  } catch (error) {
    console.error('Electron is not installed. Run `npm install` first.');
    throw error;
  }

  const child = spawn(electronBinary, ['--no-sandbox', '--disable-setuid-sandbox', APP_DIR], {
    stdio: 'inherit',
    env: {
      ...process.env,
      RAKUTENLINK_DISABLE_UPDATER: process.env.RAKUTENLINK_DISABLE_UPDATER || '1',
      RAKUTENLINK_ENABLE_BLUETOOTH: process.env.RAKUTENLINK_ENABLE_BLUETOOTH || '0',
      RAKUTENLINK_LINUX_SAFE_WINDOW_MODE: process.env.RAKUTENLINK_LINUX_SAFE_WINDOW_MODE || '1',
    },
  });

  log(`Launching ${APP_DIR}`);

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

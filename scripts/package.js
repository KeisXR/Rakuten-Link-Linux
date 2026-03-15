'use strict';

const builder = require('electron-builder');
const { log } = require('./common');
const { prepareRuntime } = require('./prepare');

async function main() {
  prepareRuntime();

  await builder.build({
    targets: builder.Platform.LINUX.createTarget('AppImage'),
    publish: 'never',
  });

  log('AppImage build completed');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});

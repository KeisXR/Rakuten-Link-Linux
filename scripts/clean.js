'use strict';

const fs = require('fs');
const path = require('path');
const { DIST_DIR, GENERATED_DIR, ROOT_DIR, log } = require('./common');

const extraTargets = [
  path.join(ROOT_DIR, 'dist'),
  path.join(ROOT_DIR, 'squashfs-root'),
];

for (const target of [GENERATED_DIR, DIST_DIR, ...extraTargets]) {
  fs.rmSync(target, { recursive: true, force: true });
  log(`Removed ${target}`);
}

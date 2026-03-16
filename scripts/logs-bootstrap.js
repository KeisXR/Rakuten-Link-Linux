'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const stateDir = path.join(os.homedir(), '.local', 'state', 'rakuten-link-linux');
const logPath = path.join(stateDir, 'bootstrap.log');

if (!fs.existsSync(logPath)) {
  console.error(`Bootstrap log not found: ${logPath}`);
  process.exit(1);
}

const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean);
const tailLines = lines.slice(-120);

for (const line of tailLines) {
  console.log(line);
}

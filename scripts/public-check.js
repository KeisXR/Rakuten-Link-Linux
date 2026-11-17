'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const { ROOT_DIR } = require('./common');

const forbiddenPrefixes = [
  '.generated/',
  'dist/',
  'release/',
  'squashfs-root/',
  'RakutenLink.dmg',
  'main.js',
  'electron-peer-connection.js',
  'call.popout.window.js',
  'chat.popout.window.js',
  'setupEvents.js',
  'utils.js',
  'preload.js',
  'preload-popout.js',
  'preload-call-popout.js',
  'incoming.call.notification/',
  'electron.menu.template.js',
];

const forbiddenPatterns = [
  /(^|\/)app\.asar$/,
  /\.AppImage$/,
  /\.dmg$/,
];

// Tracked files plus untracked files that are not gitignored, i.e. everything
// that is or could be committed. `git status` alone misses files that are
// already committed and unchanged.
function listGitVisiblePaths() {
  const result = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: ROOT_DIR,
      encoding: 'utf8',
    }
  );

  if (result.error && result.status === null) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || `git ls-files failed with exit code ${result.status}`);
  }

  return [...new Set(result.stdout.split('\0').filter(Boolean))];
}

function isForbidden(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  return (
    forbiddenPrefixes.some((prefix) => normalized === prefix || normalized.startsWith(prefix)) ||
    forbiddenPatterns.some((pattern) => pattern.test(normalized))
  );
}

const offenders = listGitVisiblePaths().filter(isForbidden);

if (offenders.length > 0) {
  console.error('Public repo check failed. These git-visible paths should not be published:');
  for (const offender of offenders) {
    console.error(`- ${offender}`);
  }
  process.exit(1);
}

console.log('Public repo check passed. Git-visible files contain only the wrapper project.');

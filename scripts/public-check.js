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
];

function listGitVisiblePaths() {
  const result = spawnSync(
    'git',
    ['status', '--short', '--untracked-files=all', '--ignored=no'],
    {
      cwd: ROOT_DIR,
      encoding: 'utf8',
    }
  );

  if (result.error && result.status === null) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || `git status failed with exit code ${result.status}`);
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(3));
}

function isForbidden(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  return forbiddenPrefixes.some((prefix) => normalized === prefix || normalized.startsWith(prefix));
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

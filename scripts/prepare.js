'use strict';

const { extractVendor } = require('./extract');
const { patchRuntime } = require('./patch');

function prepareRuntime() {
  const manifest = extractVendor();
  return patchRuntime(manifest);
}

module.exports = {
  prepareRuntime,
};

if (require.main === module) {
  try {
    prepareRuntime();
  } catch (error) {
    console.error(error.stack || error);
    process.exit(1);
  }
}

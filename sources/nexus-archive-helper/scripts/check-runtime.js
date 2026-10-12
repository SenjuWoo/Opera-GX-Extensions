const path = require('node:path');

(async () => {
  const { verifyRuntime } = await import('../../../tools/runtime-parity.mjs');
  const root = path.resolve(__dirname, '..');
  console.log(verifyRuntime(path.join(root, 'dist/extension'), path.resolve(root, '../../extensions/nexus-archive-helper')));
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

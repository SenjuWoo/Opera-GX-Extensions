const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..', '..');
const extensionRoot = path.join(repoRoot, 'extensions');
const toolsRoot = path.join(repoRoot, 'tools');

if (!fs.existsSync(extensionRoot) || !fs.existsSync(toolsRoot)) {
  console.error('This command is intended for sources/nexus-archive-helper inside the Opera-GX-Extensions repo.');
  console.error(`Expected: ${extensionRoot} and ${toolsRoot}`);
  process.exit(2);
}

const verify = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'verify'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
if (verify.error) throw verify.error;
if (verify.status !== 0) process.exit(verify.status || 1);

const target = path.join(extensionRoot, 'nexus-archive-helper');
(async () => {
  const { syncRuntime } = await import('../../../tools/runtime-parity.mjs');
  console.log(syncRuntime(path.join(root, 'dist', 'extension'), target));
  console.log(`Signing key expected by the root builder: ${path.join(toolsRoot, 'keys', 'nexus-archive-helper.pem')}`);
  console.log('Next: run the repository root Build.cmd');
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

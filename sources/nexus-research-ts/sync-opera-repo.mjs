import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { syncRuntime } from '../../tools/runtime-parity.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
for (const task of ['test', 'typecheck', 'build']) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', task], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(syncRuntime(path.join(root, 'dist'), path.resolve(root, '../../extensions/nexus-research')));

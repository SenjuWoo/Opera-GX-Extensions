import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncRuntime, verifyRuntime } from './runtime-parity.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gx-runtime-parity-'));
try {
  const built = path.join(root, 'dist');
  const extensions = path.join(root, 'extensions');
  const target = path.join(extensions, 'fixture');
  fs.mkdirSync(built, { recursive: true });
  fs.mkdirSync(target, { recursive: true });
  const manifest = JSON.stringify({ manifest_version: 3, version: '1.0.0', key: 'pinned-fixture' });
  for (const folder of [built, target]) {
    fs.writeFileSync(path.join(folder, 'manifest.json'), manifest);
    fs.writeFileSync(path.join(folder, 'background.js'), 'const version = 1;');
  }
  assert.match(verifyRuntime(built, target), /2 rebuilt files/);
  fs.writeFileSync(path.join(built, 'background.js'), 'const version = 1;\r\n');
  fs.writeFileSync(path.join(target, 'background.js'), 'const version = 1;\n');
  assert.match(verifyRuntime(built, target), /2 rebuilt files/);
  fs.writeFileSync(path.join(target, 'background.js'), 'const version = 0;');
  assert.throws(() => verifyRuntime(built, target), /different background.js/);
  fs.writeFileSync(path.join(target, 'obsolete.js'), 'stale compiled code');
  fs.writeFileSync(path.join(target, 'CHANGELOG.md'), 'Keep owner documentation.');
  assert.throws(() => verifyRuntime(built, target), /stale obsolete.js/);
  assert.match(syncRuntime(built, target, { allowedRoot: extensions }), /2 rebuilt files/);
  assert.equal(fs.existsSync(path.join(target, 'obsolete.js')), false);
  assert.equal(fs.readFileSync(path.join(target, 'CHANGELOG.md'), 'utf8'), 'Keep owner documentation.');
  fs.writeFileSync(path.join(built, 'manifest.json'), manifest.replace('pinned-fixture', 'different-fixture'));
  assert.throws(() => syncRuntime(built, target, { allowedRoot: extensions }), /Signing identity mismatch/);
  assert.equal(fs.readFileSync(path.join(target, 'manifest.json'), 'utf8'), manifest);
  assert.throws(() => syncRuntime(built, target, { allowedRoot: path.join(root, 'other') }), /outside the extension owner folder/);
  console.log('Runtime parity checks reject stale bundles and signing-key changes; sync preserves owner documentation.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

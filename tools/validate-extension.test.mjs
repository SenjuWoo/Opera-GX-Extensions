import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateExtension } from './validate-extension.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gx-payload-test-'));
try {
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Fixture', version: '1.0.0', action: { default_popup: 'popup.html' } }));
  fs.writeFileSync(path.join(root, 'popup.html'), '<script src="popup.js"></script>');
  assert.throws(() => validateExtension(root), /ENOENT/);
  fs.writeFileSync(path.join(root, 'popup.js'), '');
  assert.match(validateExtension(root), /Fixture 1.0.0/);
  fs.writeFileSync(path.join(root, 'secret.pem'), 'fixture');
  assert.throws(() => validateExtension(root), /private material/);
  fs.unlinkSync(path.join(root, 'secret.pem'));
  fs.writeFileSync(path.join(root, 'popup.html'), '<script src="../outside.js"></script>');
  assert.throws(() => validateExtension(root), /Invalid payload reference/);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
console.log('Payload validation passed: required assets, nested references, private material and path escapes.');

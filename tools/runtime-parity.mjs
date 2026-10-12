import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../extensions');
const developmentDirs = new Set(['tests', 'tools', 'node_modules', '_metadata', '.git']);
const isDocumentation = name => /\.md$/i.test(name) || /^(?:license|copying|notice)(?:\..*)?$/i.test(name);
const contentOf = file => /\.(?:js|mjs|cjs|json|html|css|txt|md|svg)$/i.test(file)
  ? fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n') : fs.readFileSync(file);
const equalContents = (left, right) => {
  const a = contentOf(left), b = contentOf(right);
  return typeof a === 'string' ? a === b : Buffer.isBuffer(b) && a.equals(b);
};

function filesIn(root, { target = false } = {}) {
  const files = new Map();
  function walk(folder, relative = '') {
    if (fs.lstatSync(folder).isSymbolicLink()) throw new Error(`Symlink in runtime tree: ${relative || folder}`);
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const rel = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlink in runtime tree: ${rel}`);
      if (entry.isDirectory()) {
        if (!target || !developmentDirs.has(entry.name)) walk(path.join(folder, entry.name), rel);
      } else if (entry.isFile()) {
        files.set(rel, path.join(folder, entry.name));
      }
    }
  }
  walk(root);
  return files;
}

function snapshot(builtDir, runtimeDir) {
  const built = filesIn(path.resolve(builtDir));
  const runtime = filesIn(path.resolve(runtimeDir), { target: true });
  if (!built.has('manifest.json')) throw new Error('Built runtime is missing manifest.json; build before checking or syncing.');
  return { built, runtime };
}

export function verifyRuntime(builtDir, runtimeDir) {
  const { built, runtime } = snapshot(builtDir, runtimeDir);
  const differences = [];
  for (const [relative, source] of built) {
    if (!runtime.has(relative)) differences.push(`missing ${relative}`);
    else if (!equalContents(source, runtime.get(relative))) differences.push(`different ${relative}`);
  }
  for (const relative of runtime.keys()) {
    if (!built.has(relative) && !isDocumentation(relative)) differences.push(`stale ${relative}`);
  }
  if (differences.length) throw new Error(`Shipped runtime differs from rebuilt source:\n${differences.join('\n')}\nRun npm run sync:opera in the source project, then commit the runtime changes.`);
  return `Runtime parity verified: ${built.size} rebuilt files match ${path.basename(runtimeDir)}.`;
}

export function syncRuntime(builtDir, runtimeDir, { allowedRoot = extensionsRoot } = {}) {
  const target = path.resolve(runtimeDir);
  const boundary = path.resolve(allowedRoot);
  if (!target.startsWith(boundary + path.sep)) throw new Error('Refusing to sync outside the extension owner folder.');
  if (fs.realpathSync(boundary) !== boundary) throw new Error('Refusing a symlinked extension owner folder.');
  const { built, runtime } = snapshot(builtDir, target);
  const existingManifest = runtime.get('manifest.json');
  const sourceManifest = JSON.parse(fs.readFileSync(built.get('manifest.json'), 'utf8'));
  if (existingManifest) {
    const existingKey = JSON.parse(fs.readFileSync(existingManifest, 'utf8')).key;
    if (existingKey && sourceManifest.key !== existingKey) throw new Error('Signing identity mismatch: existing runtime and source keys were preserved.');
  }
  for (const [relative, source] of built) {
    const destination = path.join(target, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  for (const [relative, file] of runtime) {
    if (!built.has(relative) && !isDocumentation(relative)) fs.unlinkSync(file);
  }
  return verifyRuntime(builtDir, target);
}

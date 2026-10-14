import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const listeners = {};
const timers = new Map();
const emitted = [];
let nextTimer = 0;
let observations = 0;
let disconnects = 0;
let scans = 0;
let observerCallback;
const context = vm.createContext({ URL, console,
  location: { href: 'https://media.test/page', protocol: 'https:' },
  document: { documentElement: {}, get images() { scans++; return [{ src: 'https://media.test/image.png', getAttribute: () => null }]; }, querySelectorAll: () => [] },
  performance: { getEntriesByType: () => [] },
  window: { addEventListener: (type, callback) => { listeners[type] = callback; } },
  chrome: {
    runtime: { sendMessage: async (message) => { emitted.push(message); }, onMessage: { addListener: (callback) => { listeners.runtime = callback; } } },
    storage: { local: { get: async () => ({ settings: { autoScan: false, captureNetwork: false } }) }, onChanged: { addListener: (callback) => { listeners.settings = callback; } } }
  },
  MutationObserver: class {
    constructor(callback) { observerCallback = callback; }
    observe() { observations++; }
    disconnect() { disconnects++; }
  },
  setTimeout: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
  clearTimeout: (id) => timers.delete(id)
});
vm.runInContext(fs.readFileSync(new URL('../src/page-scanner.js', import.meta.url), 'utf8'), context);
await Promise.resolve();
await Promise.resolve();
assert.equal(observations, 0, 'Saved auto-scan disable must prevent DOM observation');
assert.equal(timers.size, 0, 'Saved auto-scan disable must prevent startup scans');
assert.equal(vm.runInContext("inferKind('https://media.test/stream', 'audio/x-mpegurl')", context), 'hls');
assert.equal(vm.runInContext("inferKind('https://media.test/stream', 'video/iso.segment')", context), 'segment');

listeners.runtime({ type: 'SCAN_NOW' }, {}, () => {});
assert.equal(scans, 1, 'Manual scan remains available with automatic scanning disabled');
const beforeNetwork = emitted.length;
context.resource = { source: 'NEBULAGRAB_PAGE', type: 'RESOURCE', item: { url: 'https://media.test/network.mp4', kind: 'video' } };
listeners.message({ source: context.window, data: context.resource });
assert.equal(emitted.length, beforeNetwork, 'Disabled network capture must also suppress page-hook network detections');

listeners.settings({ settings: { newValue: { autoScan: true, captureNetwork: true } } }, 'local');
assert.equal(observations, 1, 'Enabling scanning observes the current page without a reload');
assert.equal(timers.size, 1);
listeners.settings({ settings: { newValue: { autoScan: false, captureNetwork: false } } }, 'local');
assert.equal(timers.size, 0, 'Disabling scanning cancels the pending startup scan');
assert(disconnects > 0, 'Disabling scanning releases the mutation observer');
observerCallback([{ addedNodes: [{}] }]);
assert.equal(timers.size, 0, 'An already delivered mutation must not rearm disabled scanning');
console.log('NebulaGrab scanner settings checks passed (saved disable, live toggles, manual scan, hook filtering, MIME precedence).');

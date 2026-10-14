'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor() {
    this.dataset = {};
    this.isConnected = true;
    this.tagName = 'DIV';
    this.classList = { remove() {} };
    this.style = { removeProperty() {}, setProperty() {} };
  }
  removeAttribute(name) {
    delete this.dataset[name.replace(/^data-/, '').replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())];
  }
  appendChild() {}
  remove() {}
}
const document = {
  documentElement: new Element(),
  readyState: 'loading',
  addEventListener() {},
  createElement() { return new Element(); }
};
const idleTasks = new Map();
let nextId = 1;
const timers = new Map();
const events = {};
let settings = { enabled: true };
const chrome = {
  runtime: { getManifest() { return { version: 'test' }; }, onMessage: { addListener() {} } },
  storage: {
    sync: { get(_keys, callback) { callback({ oledForgeSettings: settings }); } },
    local: { async get() { return {}; } },
    onChanged: { addListener() {} }
  }
};
const context = vm.createContext({
  chrome, document, Element, console,
  setTimeout(fn) { const id = nextId++; timers.set(id, fn); return id; },
  clearTimeout(id) { timers.delete(id); },
  OLEDColor: { clamp(value) { return value; } }, OLEDDetection: {}, location: { hostname: 'example.com' },
  addEventListener(name, fn) { events[name] = fn; },
  requestIdleCallback(fn) { const id = nextId++; idleTasks.set(id, fn); return id; },
  cancelIdleCallback(id) { idleTasks.delete(id); }
});
let source = fs.readFileSync(path.join(__dirname, '..', 'content', 'engine.js'), 'utf8');
source = source.replace(/\}\)\(\);\s*$/, 'globalThis.test = { state, enqueue, clearApplied, scheduleDrain, reloadAndApply, setupPanelGuard };})();');
vm.runInContext(source, context);

(async () => {
  await new Promise((resolve) => setImmediate(resolve));
  const { state, enqueue, clearApplied, scheduleDrain, reloadAndApply, setupPanelGuard } = context.test;
  const element = new Element();
  state.active = true;
  enqueue(element);
  scheduleDrain();
  assert.equal(idleTasks.size, 1, 'active work is scheduled');
  clearApplied();
  assert.equal(state.active, false, 'restoration stops the engine');
  assert.equal(idleTasks.size, 0, 'restoration cancels pending idle work');
  enqueue(element);
  assert.equal(state.queue.length, 1, 'cleared pending nodes are eligible for the next scan');

  state.active = true;
  settings = { enabled: false };
  await reloadAndApply();
  assert.equal(state.active, false, 'a global disable cannot leave scanning active');
  scheduleDrain();
  assert.equal(idleTasks.size, 0, 'disabled engine cannot schedule another scan');

  let restored = 0;
  const detached = new Element();
  detached.isConnected = false;
  detached.classList.remove = () => restored++;
  state.applied.add(detached);
  clearApplied();
  assert.equal(restored, 1, 'detached nodes are restored before possible reinsertion');

  state.active = true;
  state.settings.panelGuard = true;
  state.settings.idleDimMinutes = 1;
  setupPanelGuard();
  assert.equal(timers.size, 1, 'panel guard arms while enabled');
  clearApplied();
  events.pointermove();
  assert.equal(timers.size, 0, 'a disabled panel guard cannot rearm on pointer movement');
  assert.equal(document.documentElement.dataset.oledforgeIdle, undefined, 'pointer movement leaves restored page attributes alone');
  const reads = [];
  chrome.storage.sync.get = (_keys, callback) => reads.push(callback);
  const older = reloadAndApply();
  const newer = reloadAndApply();
  reads[1]({ oledForgeSettings: { enabled: false, strength: 45 } });
  await newer;
  reads[0]({ oledForgeSettings: { enabled: false, strength: 90 } });
  await older;
  assert.equal(state.settings.strength, 45, 'older settings reads cannot overwrite a newer user choice');
  console.log('OLED engine lifecycle tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });

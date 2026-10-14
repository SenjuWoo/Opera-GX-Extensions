'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let onMutations;
let observerOptions;
const timers = new Map();
let nextId = 1;
class Element {
  constructor() { this.tagName = 'DIV'; this.isConnected = true; this.attributes = {}; this.dataset = {};
    this.classList = { remove() {} }; this.style = { removeProperty() {} }; }
  getAttribute(name) { return this.attributes[name] || ''; }
}
const root = new Element();
root.tagName = 'HTML';
const document = { documentElement: root, body: root, readyState: 'loading', addEventListener() {},
  createTreeWalker() { return { nextNode() { return null; } }; } };
const context = vm.createContext({ document, Element, console, location: { hostname: 'fixture.test' },
  OLEDColor: {}, OLEDDetection: {}, NodeFilter: { SHOW_ELEMENT: 1, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
  addEventListener() {}, setTimeout(fn) { const id = nextId++; timers.set(id, fn); return id; },
  clearTimeout(id) { timers.delete(id); }, requestIdleCallback() { return nextId++; },
  chrome: { runtime: { onMessage: { addListener() {} } }, storage: {
    sync: { get(_keys, callback) { callback({}); } }, local: { async get() { return {}; } },
    onChanged: { addListener() {} } } },
  MutationObserver: class { constructor(callback) { onMutations = callback; } disconnect() {}
    observe(_target, options) { observerOptions = options; } } });
let source = fs.readFileSync(path.join(__dirname, '../content/engine.js'), 'utf8');
source = source.replace(/\}\)\(\);\s*$/, 'globalThis.test = { state, installObserver };})();');
vm.runInContext(source, context);
setImmediate(() => {
  const { state, installObserver } = context.test;
  state.active = true;
  installObserver();
  const failures = [];
  function check(name, run) { try { run(); console.log('PASS', name); } catch (error) { failures.push(`${name}: ${error.message}`); } }
  check('site attributes and text changes are observed', () => {
    assert.equal(observerOptions.attributes, true);
    assert.equal(observerOptions.characterData, true);
  });
  check('changing a site class queues the affected subtree', () => {
    const element = new Element(); element.attributes.class = 'new-theme';
    onMutations([{ type: 'attributes', target: element, attributeName: 'class', oldValue: 'old-theme' }]);
    assert.ok(state.queue.includes(element));
  });
  check('extension-owned attributes do not schedule recursive scans', () => {
    state.queue.length = 0; state.queued = new WeakSet();
    const element = new Element(); element.attributes.class = 'site oledforge-bg';
    onMutations([{ type: 'attributes', target: element, attributeName: 'class', oldValue: 'site' }]);
    element.attributes.style = 'color: red; --oledforge-bg: rgb(0, 0, 0);';
    onMutations([{ type: 'attributes', target: element, attributeName: 'style', oldValue: 'color: red;' }]);
    assert.equal(state.queue.length, 0);
  });
  check('root theme changes schedule reclassification', () => {
    root.attributes['data-theme'] = 'dark';
    onMutations([{ type: 'attributes', target: root, attributeName: 'data-theme', oldValue: 'light' }]);
    assert.ok(timers.size > 0);
  });
  check('removed nodes release overrides and retained references', () => {
    const removed = new Element(); removed.isConnected = false;
    state.applied.add(removed);
    onMutations([{ type: 'childList', target: root, addedNodes: [], removedNodes: [removed] }]);
    assert.equal(state.applied.has(removed), false);
  });
  check('removing a stylesheet reclassifies the theme', () => {
    timers.clear();
    const stylesheet = new Element(); stylesheet.tagName = 'STYLE'; stylesheet.isConnected = false;
    onMutations([{ type: 'childList', target: root, addedNodes: [], removedNodes: [stylesheet] }]);
    assert.ok(timers.size > 0);
  });
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
});

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class ShadowRoot {
  constructor(elements = []) { this.mode = 'open'; this.adoptedStyleSheets = []; this.elements = elements; }
  querySelectorAll() { return this.elements; }
}
ShadowRoot.prototype.adoptedStyleSheets = [];
class Document {}
Document.prototype.adoptedStyleSheets = [];
const inner = new ShadowRoot();
const outer = new ShadowRoot([{ shadowRoot: inner }]);
const observed = [];
const idleTasks = [];
const local = { nocturneGlobal: { enabled: true, deepShadowDom: true } };
let syncReads = 0;
let documentWalks = 0;
let deepMutation;
let mainStyle;
let htmlBackground = 'rgb(0, 0, 0)';
let bodyBackground = 'rgb(0, 0, 0)';
const document = {
  documentElement: {}, body: {},
  querySelectorAll() { documentWalks++; return [{ shadowRoot: outer }]; },
  getElementById() { return mainStyle?.isConnected ? mainStyle : null; },
  createElement() { return { setAttribute() {}, remove() { this.isConnected = false; } }; },
  head: { appendChild(node) { node.isConnected = true; mainStyle = node; } }
};
const chrome = {
  runtime: { getManifest() { return { version: 'test' }; }, onMessage: { addListener() {} } },
  storage: {
    local: { async get() { return local; } },
    sync: { async get() { syncReads++; return {}; } },
    onChanged: { addListener() {} }
  }
};
const context = vm.createContext({
  chrome, document, URL, console, Document, ShadowRoot, setTimeout, clearTimeout,
  location: { href: 'https://example.com/' },
  getComputedStyle(node) { return { backgroundColor: node === document.body ? bodyBackground : htmlBackground }; },
  matchMedia() { return { matches: false, addEventListener() {} }; },
  addEventListener() {}, window: { requestIdleCallback: true },
  requestIdleCallback(fn) { idleTasks.push(fn); },
  CSSStyleSheet: class { replaceSync(css) { this.css = css; } },
  MutationObserver: class { constructor(callback) { deepMutation = callback; } observe(root) { observed.push(root); } disconnect() {} }
});
const base = path.join(__dirname, '..');
vm.runInContext(fs.readFileSync(path.join(base, 'common.js'), 'utf8'), context);
let source = fs.readFileSync(path.join(base, 'content.js'), 'utf8');
source = source.replace(/\}\)\(\);\s*$/, 'globalThis.test = { refresh, stopDeepCoverage, getAmbientColor };})();');
vm.runInContext(source, context);

(async () => {
  await new Promise((resolve) => setImmediate(resolve));
  idleTasks.shift()();
  assert.equal(outer.adoptedStyleSheets.length, 1, 'outer shadow receives shared CSS');
  assert.equal(inner.adoptedStyleSheets.length, 1, 'nested shadow receives shared CSS');
  assert.ok(observed.includes(outer) && observed.includes(inner), 'new components inside shadow trees are observed');
  const sheet = inner.adoptedStyleSheets[0];
  context.test.stopDeepCoverage();
  assert.equal(outer.adoptedStyleSheets.length, 0, 'outer shadow is restored');
  assert.equal(inner.adoptedStyleSheets.length, 0, 'nested shadow is restored');
  assert.equal(sheet.css, '', 'detached hosts also lose active CSS');
  assert.equal(syncReads, 0, 'local appearance avoids redundant sync reads');

  await context.test.refresh();
  idleTasks.shift()();
  const documentWalksBefore = documentWalks;
  const newShadow = new ShadowRoot();
  const addedHost = { nodeType: 1, isConnected: true, shadowRoot: newShadow, querySelectorAll() { return []; } };
  deepMutation([{ addedNodes: [addedHost] }, { addedNodes: [addedHost] }]);
  assert.equal(idleTasks.length, 1, 'DOM bursts must share one idle task');
  idleTasks.shift()();
  assert.equal(documentWalks, documentWalksBefore, 'Adding one component must not walk the entire document again');
  assert.equal(newShadow.adoptedStyleSheets.length, 1, 'The added host itself must receive shadow styling');

  const removedShadow = new ShadowRoot();
  deepMutation([{ addedNodes: [{ nodeType: 1, isConnected: false, shadowRoot: removedShadow, querySelectorAll() { return []; } }] }]);
  idleTasks.shift()();
  assert.equal(removedShadow.adoptedStyleSheets.length, 0, 'Discard components removed before the idle scan');

  deepMutation([{ addedNodes: [addedHost] }]);
  const oldIdleTask = idleTasks.shift();
  context.test.stopDeepCoverage();
  await context.test.refresh();
  const newIdleTask = idleTasks.shift();
  oldIdleTask();
  newIdleTask();
  assert.equal(inner.adoptedStyleSheets.length, 1, 'A canceled idle batch must not consume the replacement enable scan');

  const pendingReads = [];
  context.Nocturne = { ...context.Nocturne, readState: () => new Promise((resolve) => pendingReads.push(resolve)) };
  const olderRefresh = context.test.refresh();
  const newerRefresh = context.test.refresh();
  pendingReads[1]({ global: { enabled: false }, rules: {} });
  await newerRefresh;
  assert.equal(mainStyle.isConnected, false);
  pendingReads[0]({ global: { enabled: true, deepShadowDom: true }, rules: {} });
  await olderRefresh;
  assert.equal(mainStyle.isConnected, false, 'An old settings read must not re-enable styling after a newer disable');

  htmlBackground = 'rgb(255, 255, 255)';
  bodyBackground = 'rgb(16, 18, 24)';
  assert.equal(context.test.getAmbientColor(), '#101218', 'Adaptive color follows the visible body before its root backdrop');
  bodyBackground = 'rgba(0, 0, 0, 0)';
  assert.equal(context.test.getAmbientColor(), '#ffffff', 'A transparent body uses its root backdrop');

  const css = context.Nocturne.buildScrollbarCss({ width: 8 });
  const nativeRule = css.split('@supports')[0];
  assert.match(nativeRule, /scrollbar-color: auto !important/);
  assert.match(nativeRule, /scrollbar-width: auto !important/);
  assert.match(css, /@supports not selector\(::-webkit-scrollbar\)/, 'standard properties only style browsers without detailed pseudo-elements');
  console.log('Nocturne regression tests: PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; });

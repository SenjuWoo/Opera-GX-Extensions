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
const document = {
  documentElement: {}, body: {},
  querySelectorAll() { return [{ shadowRoot: outer }]; },
  getElementById() { return null; },
  createElement() { return { setAttribute() {}, remove() { this.isConnected = false; } }; },
  head: { appendChild(node) { node.isConnected = true; } }
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
  getComputedStyle() { return { backgroundColor: 'rgb(0, 0, 0)' }; },
  matchMedia() { return { matches: false, addEventListener() {} }; },
  addEventListener() {}, window: { requestIdleCallback: true },
  requestIdleCallback(fn) { idleTasks.push(fn); },
  CSSStyleSheet: class { replaceSync(css) { this.css = css; } },
  MutationObserver: class { observe(root) { observed.push(root); } disconnect() {} }
});
const base = path.join(__dirname, '..');
vm.runInContext(fs.readFileSync(path.join(base, 'common.js'), 'utf8'), context);
let source = fs.readFileSync(path.join(base, 'content.js'), 'utf8');
source = source.replace(/\}\)\(\);\s*$/, 'globalThis.test = { refresh, stopDeepCoverage };})();');
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

  const css = context.Nocturne.buildScrollbarCss({ width: 8 });
  const nativeRule = css.split('@supports')[0];
  assert.match(nativeRule, /scrollbar-color: auto !important/);
  assert.match(nativeRule, /scrollbar-width: auto !important/);
  assert.match(css, /@supports not selector\(::-webkit-scrollbar\)/, 'standard properties only style browsers without detailed pseudo-elements');
  console.log('Nocturne regression tests: PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; });

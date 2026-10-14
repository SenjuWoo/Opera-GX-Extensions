'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');
const event = { addListener() {} };

test('master switch disables the network blocklist and preserves its independent setting', async () => {
  const calls = [];
  const chrome = {
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: { onInstalled: event, onStartup: event, onMessage: event },
    tabs: { onRemoved: event, onUpdated: event },
    contextMenus: { onClicked: event }, commands: { onCommand: event },
    declarativeNetRequest: {
      updateEnabledRulesets: async (value) => calls.push(JSON.parse(JSON.stringify(value))),
      updateDynamicRules: async () => {}
    }
  };
  const context = vm.createContext({ chrome, console, URL });
  vm.runInContext(read('background.js').replace(/ensureInstalled\(\)\.catch\(console\.error\);\s*$/, ''), context);
  await context.applyRulesets({ enabled: false, networkRules: true, allowlist: [] });
  await context.applyRulesets({ enabled: true, networkRules: true, allowlist: [] });
  await context.applyRulesets({ enabled: true, networkRules: false, allowlist: [] });
  assert.deepEqual(calls, [
    { disableRulesetIds: ['popup_networks'] },
    { enableRulesetIds: ['popup_networks'] },
    { disableRulesetIds: ['popup_networks'] }
  ]);
});

test('same-window targets pass through without consuming the next genuine popup', () => {
  const calls = [];
  const listeners = {};
  const nativeResult = {};
  const window = {
    open: (...args) => { calls.push(args); return nativeResult; },
    addEventListener: (type, callback) => { listeners[type] = callback; }
  };
  const document = { addEventListener() {}, dispatchEvent() {} };
  const context = vm.createContext({
    window, document, URL, location: { href: 'https://example.com/' },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  });
  vm.runInContext(read('policy.js'), context);
  vm.runInContext(read('hook.js'), context);
  for (const target of ['_self', '_parent', '_TOP']) {
    assert.equal(window.open('/next', target), nativeResult);
  }
  listeners.pointerdown({ isTrusted: true });
  assert.equal(window.open('https://example.com/download', '_blank'), nativeResult);
  assert.equal(window.open('https://ads.example.net/', '_blank').closed, true);
  assert.equal(calls.length, 4);
});

test('pointer and compatibility mouse events from one click share a popup quota', () => {
  const listeners = {};
  let opens = 0;
  const window = {
    open: () => { opens += 1; return {}; },
    addEventListener: (type, callback) => { listeners[type] = callback; }
  };
  const context = vm.createContext({
    window, document: { addEventListener() {}, dispatchEvent() {} }, URL,
    location: { href: 'https://example.com/' },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  });
  vm.runInContext(read('policy.js'), context);
  vm.runInContext(read('hook.js'), context);
  listeners.pointerdown({ isTrusted: true });
  window.open('/first', '_blank');
  listeners.mousedown?.({ isTrusted: true });
  assert.equal(window.open('/second', '_blank').closed, true);
  assert.equal(opens, 1);
});

test('concurrent settings patches preserve both choices and ordered network rules', async () => {
  let settings = { enabled: true, networkRules: true, allowlist: [] };
  const applied = [];
  const chrome = {
    storage: { local: {
      get: async () => ({ settings: { ...settings } }),
      set: async value => { settings = value.settings; }
    } },
    runtime: { onInstalled: event, onStartup: event, onMessage: event },
    tabs: { onRemoved: event, onUpdated: event },
    contextMenus: { onClicked: event }, commands: { onCommand: event },
    declarativeNetRequest: {
      updateEnabledRulesets: async value => applied.push(value),
      updateDynamicRules: async () => {}
    }
  };
  const context = vm.createContext({ chrome, console, URL });
  vm.runInContext(read('background.js').replace(/ensureInstalled\(\)\.catch\(console\.error\);\s*$/, ''), context);
  await Promise.all([
    context.setSettings({ enabled: false }),
    context.setSettings({ networkRules: false })
  ]);
  assert.equal(settings.enabled, false);
  assert.equal(settings.networkRules, false);
  assert.equal(applied.length, 2);
  assert.ok(applied.every(value => value.disableRulesetIds?.includes('popup_networks')));
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function backgroundHarness() {
  const event = { addListener() {} };
  const storage = { apiKey: 'test-key' };
  const requests = [];
  const accessLevels = [];
  let listener;
  const chrome = {
    runtime: {
      id: 'helper', getURL: (name) => `chrome-extension://helper/${name}`,
      onInstalled: event, onMessage: { addListener: (callback) => { listener = callback; } }
    },
    storage: { local: {
      setAccessLevel: async (value) => { accessLevels.push(value.accessLevel); },
      get: async () => storage,
      set: async (values) => Object.assign(storage, values)
    } },
    contextMenus: { onClicked: event },
    action: { setBadgeBackgroundColor: async () => {}, setBadgeText: async () => {} },
    tabs: { create: async () => {} }
  };
  const context = vm.createContext({
    chrome, URL, URLSearchParams, AbortSignal,
    console: { error() {}, debug() {} },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, headers: new Headers(), text: async () => '{"files":[]}' };
    }
  });
  context.importScripts = (...names) => {
    for (const name of names) vm.runInContext(read(`src/${name}`), context);
  };
  vm.runInContext(read('src/extension/background.js'), context);
  return {
    context, storage, requests, accessLevels,
    send: (message, sender) => new Promise((resolve) => listener(message, sender, resolve))
  };
}

test('page integration cannot read or replace API keys or invoke privileged operations', async () => {
  const harness = backgroundHarness();
  const sender = { id: 'helper', url: 'https://www.nexusmods.com/skyrim/mods/10', tab: { id: 1 } };
  for (const type of ['GET_KEY', 'SAVE_KEY', 'CLEAR_HISTORY', 'RESOLVE', 'DOWNLOAD']) {
    const result = await harness.send({ type, apiKey: 'replacement', reference: 'skyrim:10', fileId: 20 }, sender);
    assert.equal(result.ok, false, type);
  }
  assert.equal(harness.storage.apiKey, 'test-key');
  assert.equal(harness.requests.length, 0);
  assert.deepEqual(harness.accessLevels, ['TRUSTED_CONTEXTS']);
  const popup = { id: 'helper', url: 'chrome-extension://helper/popup.html?standalone=1', tab: { id: 2 } };
  assert.equal((await harness.send({ type: 'GET_KEY' }, popup)).apiKey, 'test-key');
  assert.equal((await harness.send({ type: 'GET_KEY' }, { ...popup, id: 'another-extension' })).ok, false);
  assert.equal((await harness.send(null, popup)).ok, false);
});

test('page scans are bound to the sender page and API keys cannot follow redirects', async () => {
  const harness = backgroundHarness();
  const sender = { id: 'helper', url: 'https://www.nexusmods.com/skyrim/mods/10', tab: { id: 1 } };
  const result = await harness.send({ type: 'SCAN_PAGE', reference: 'fallout4:999' }, sender);
  assert.equal(result.ok, true);
  assert.equal(harness.requests[0].url, 'https://api.nexusmods.com/v1/games/skyrim/mods/10/files.json');
  assert.equal(harness.requests[0].options.redirect, 'error');
  assert.ok(harness.requests[0].options.signal instanceof AbortSignal);
  await assert.rejects(() => harness.context.apiRequest('https://example.com/v1/files'), /official Nexus API/);
  await assert.rejects(() => harness.context.apiRequest('https://api.nexusmods.com/other'), /official Nexus API/);
  assert.equal(harness.requests.length, 1);
});

test('downloads retain the displayed result reference after editing the input', async () => {
  const source = read('src/extension/popup.js');
  const fn = source.slice(source.indexOf('async function doDownload('), source.indexOf('async function loadHistory('));
  let sent;
  const context = vm.createContext({
    currentReference: 'nxm://skyrim/mods/10/files/20?key=original&expires=1999999999',
    reference: { value: 'fallout4:999' },
    setStatus() {}, updateQuota() {}, openUrl: async () => {},
    send: async (message) => { sent = message; return { result: { mode: 'unavailable' } }; }
  });
  vm.runInContext(fn, context);
  await context.doDownload(20, false);
  assert.equal(sent.reference, context.currentReference);
  assert.equal(sent.fileId, 20);
});

test('userscript setup never puts the stored API key in page HTML', () => {
  const source = read('src/userscript/app.js');
  assert.doesNotMatch(source, /nah-key|keyInput/);
  assert.match(source, /window\.prompt\([^\n]+, ''\)/);
  assert.match(source, /GM_registerMenuCommand\('Set Nexus Archive Helper API key', configureApiKey\)/);
  assert.match(read('src/userscript/meta.txt'), /@sandbox\s+DOM/);
});

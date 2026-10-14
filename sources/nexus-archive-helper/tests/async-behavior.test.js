const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('a slow older popup lookup cannot replace a newer result or status', async () => {
  const source = read('src/extension/popup.js');
  const code = source.slice(source.indexOf('async function resolveReference('), source.indexOf('async function doDownload('));
  const pending = new Map();
  const rendered = [];
  const statuses = [];
  const context = vm.createContext({
    resolveRequestId: 0, reference: { value: '' },
    setStatus: (text) => statuses.push(text), updateQuota() {}, displayStatus: () => 'AVAILABLE',
    renderResult: (_result, reference) => rendered.push(reference),
    send: ({ reference }) => new Promise((resolve, reject) => pending.set(reference, { resolve, reject }))
  });
  vm.runInContext(code, context);
  const older = context.resolveReference('skyrim:10');
  const newer = context.resolveReference('skyrim:11');
  pending.get('skyrim:11').resolve({ result: { files: [], warnings: [] } });
  await newer;
  const newerStatus = statuses.at(-1);
  pending.get('skyrim:10').resolve({ result: { files: [{ fileId: 20 }], warnings: [] } });
  await older;
  assert.deepEqual(rendered, ['skyrim:11']);
  assert.equal(statuses.at(-1), newerStatus);
  const staleFailure = context.resolveReference('skyrim:12');
  const latest = context.resolveReference('skyrim:13');
  pending.get('skyrim:13').resolve({ result: { files: [], warnings: [] } });
  await latest;
  pending.get('skyrim:12').reject(new Error('older error'));
  await staleFailure;
  assert.doesNotMatch(statuses.at(-1), /older error/);
});

function userscriptApiHarness() {
  const source = read('src/userscript/app.js');
  const code = source.slice(source.indexOf('  function apiRequest('), source.indexOf('  const style'));
  let options;
  let timer;
  let aborted = false;
  let cleared = false;
  const context = vm.createContext({
    URL, API_KEY_NAME: 'key', GM_getValue: () => 'test-key',
    GM_xmlhttpRequest: (details) => { options = details; return { abort() { aborted = true; } }; },
    setTimeout: (callback) => { timer = callback; return 1; },
    clearTimeout: () => { cleared = true; }
  });
  vm.runInContext(code, context);
  return { context, options: () => options, timeout: () => timer?.(), aborted: () => aborted, cleared: () => cleared };
}

test('userscript API keys stay on the official origin and cannot follow redirects', async () => {
  const harness = userscriptApiHarness();
  const refused = harness.context.apiRequest('https://example.com/v1/files');
  harness.options()?.onload({ status: 200, responseText: '{}' });
  await assert.rejects(refused, /official Nexus API/);
  assert.equal(harness.options(), undefined);
  const request = harness.context.apiRequest('https://api.nexusmods.com/v1/users/validate.json');
  assert.equal(harness.options().redirect, 'error');
  harness.options().onload({ status: 200, responseText: '{"user_id":7}' });
  assert.equal((await request).user_id, 7);
  assert.equal(harness.cleared(), true);
});

test('userscript enforces a timeout even when its redirect policy selects fetch transport', async () => {
  const harness = userscriptApiHarness();
  const request = harness.context.apiRequest('https://api.nexusmods.com/v1/users/validate.json');
  harness.timeout();
  assert.equal(harness.aborted(), true);
  await assert.rejects(request, (error) => /timed out/i.test(error.data?.message));
});

test('userscript ignores stale lookup results after a newer request finishes', async () => {
  const source = read('src/userscript/app.js');
  const code = source.slice(source.indexOf('  let resolveRequestId'), source.lastIndexOf('})();'));
  const pending = new Map();
  const rendered = [];
  const statuses = [];
  let clicked;
  const context = vm.createContext({
    panel: { querySelector: () => ({ addEventListener: (_event, callback) => { clicked = callback; } }) },
    results: {}, refInput: { value: '10' }, apiRequest() {},
    C: { parseReference: (input) => ({ game: 'skyrim', modId: Number(input) }), errorMessage: (error) => error.message },
    R: { resolveFiles: (ref) => new Promise((resolve) => pending.set(ref.modId, resolve)) },
    setStatus: (status) => statuses.push(status), render: (_result, ref) => rendered.push(ref.modId)
  });
  vm.runInContext(code, context);
  const older = clicked();
  context.refInput.value = '11';
  const newer = clicked();
  pending.get(11)({ files: [], interesting: [] });
  await newer;
  const latestStatus = statuses.at(-1);
  pending.get(10)({ files: [{ fileId: 20 }], interesting: [] });
  await older;
  assert.deepEqual(rendered, [11]);
  assert.equal(statuses.at(-1), latestStatus);
});

test('userscript opens authorized downloads through the tab API after asynchronous authorization', async () => {
  const source = read('src/userscript/app.js');
  const code = source.slice(source.indexOf('  async function download('), source.indexOf('  function tagClass('));
  const opened = [];
  let authorize;
  const context = vm.createContext({
    setStatus() {}, apiRequest() {},
    R: { resolveDownload: () => new Promise((resolve) => { authorize = resolve; }) },
    window: { open() { throw new Error('Native popup after an async request can be blocked'); } },
    GM_openInTab: (url, options) => opened.push({ url, options })
  });
  vm.runInContext(code, context);
  const request = context.download({ game: 'skyrim', modId: 10 }, 20, false);
  assert.equal(opened.length, 0);
  authorize({ mode: 'direct', url: 'https://cdn.nexusmods.com/file.zip' });
  await request;
  assert.equal(opened[0].url, 'https://cdn.nexusmods.com/file.zip');
  assert.equal(opened[0].options.active, true);
  assert.match(read('src/userscript/meta.txt'), /@grant\s+GM_openInTab/);
});

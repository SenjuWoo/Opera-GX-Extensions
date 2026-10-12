import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const timers = new Map();
let timerId = 0;
let persisted;
let sessionGet = async () => ({});
let downloadCount = 0;
let fetchOptions;
const event = () => ({ addListener() {} });
const chrome = {
  runtime: { onInstalled: event(), onMessage: event(), getManifest: () => ({ version: '1.3.2' }) },
  contextMenus: { onClicked: event() },
  tabs: { onRemoved: event(), onUpdated: event(), sendMessage: async () => ({ started: false, error: 'blocked' }) },
  webRequest: { onBeforeRequest: event(), onBeforeSendHeaders: event(), onHeadersReceived: event(), onErrorOccurred: event() },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  downloads: { download: async () => ++downloadCount },
  storage: {
    onChanged: event(), local: { get: async () => ({}), set: async () => {} },
    session: { get: (...args) => sessionGet(...args), set: async (value) => { persisted = value; }, remove: async () => {} }
  }
};
const context = vm.createContext({ chrome, URL, console,
  setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
  clearTimeout: (id) => timers.delete(id),
  fetch: async (_url, options) => { fetchOptions = options; return { ok: true, json: async () => ({ ok: true }) }; }
});
vm.runInContext(fs.readFileSync(new URL('../src/background.js', import.meta.url), 'utf8'), context);
const run = (code) => vm.runInContext(code, context);

assert.equal(run("sanitizeSettings({helperUrl:'https://example.com', helperToken:'sample'}).helperUrl"), 'http://127.0.0.1:17891');
assert.equal(run("sanitizeSettings({helperUrl:'http://localhost:9000/path'}).helperUrl"), 'http://localhost:9000');
assert.equal(run("sanitizeSettings({helperUrl:'http://user:password@localhost:9000'}).helperUrl"), 'http://127.0.0.1:17891');
assert.equal(run("normalizeItem({url:'https://site.test/file.mp4', kind:{}}, 1, 0)"), null, 'Page-supplied invalid media kinds cannot break popup rendering');
assert.notEqual(run("stableUrlIdentity('https://site.test/download?id=1')"), run("stableUrlIdentity('https://site.test/download?id=2')"));
assert.equal(run("stableUrlIdentity('https://site.test/download?id=1&token=old&expires=1')"), run("stableUrlIdentity('https://site.test/download?id=1&token=new&expires=2')"));

let release;
let reads = 0;
sessionGet = () => { reads++; return new Promise((resolve) => { release = resolve; }); };
const first = run('hydrateTab(5)');
const second = run('hydrateTab(5)');
assert.equal(reads, 1, 'Concurrent hydration must share one storage read');
release({ tab_5: [] });
await first;
run("ingest(5, [{url:'https://site.test/movie.mp4', kind:'video'}])");
await second;
assert.equal(run('getItems(5).length'), 1, 'Concurrent hydration must not overwrite fresh media');

const stale = run('hydrateTab(6)');
run('clearTab(6)');
release({ tab_6: [{ id: 'old', kind: 'video' }] });
await stale;
assert.equal(run('tabStores.has(6)'), false, 'Clear invalidates an in-flight hydration');

sessionGet = async () => ({ tab_7: [{ id: 'saved', tabId: 7, kind: 'video', url: 'https://site.test/saved.mp4', filename: 'saved.mp4' }] });
await run("handleMessage({type:'DOWNLOAD_ITEM', tabId:7, id:'saved'}, {})");
assert.equal(downloadCount, 1, 'First download after suspension restores persisted items');

run("ingest(8, [{url:'https://site.test/seg-1.m4s', kind:'segment', requestHeaders:{Cookie:'sample', AUTHORIZATION:'sample', Range:'bytes=0-10'}}])");
for (const [id, callback] of [...timers]) { timers.delete(id); await callback(); }
const saved = persisted.tab_8[0].segmentUrls[0].headers;
assert.deepEqual(Object.keys(saved), ['Range'], 'Session persistence must omit captured credentials');
assert.equal(run("getStoredItems(8)[0].segmentUrls[0].headers.Cookie"), 'sample', 'Download credentials remain in memory');
await run("helperRequest('/health', {auth:false})");
assert.equal(fetchOptions.redirect, 'error', 'Pairing requests cannot follow redirects');
await assert.rejects(run("downloadItem({tabId:8, url:'blob:https://site.test/abc', kind:'blob'})"), /no longer owns/);

const emitted = [];
let readCount = 0;
let responseMime = 'text/plain';
const response = { url: 'https://site.test/playlist', status: 200,
  headers: { get: (name) => name === 'content-type' ? responseMime : null },
  clone: () => ({ body: { getReader: () => ({
    read: async () => ++readCount === 1 ? { value: new TextEncoder().encode('#EXTM3U\n'), done: false } : { done: true },
    cancel: () => new Promise(() => {})
  }) } })
};
const page = { fetch: async () => response, postMessage: (data) => emitted.push(data) };
const hookContext = vm.createContext({ window: page, location: { href: 'https://site.test/page' },
  URL: class extends URL {}, TextDecoder, Uint8Array,
  XMLHttpRequest: class { open() {} }, HTMLMediaElement: class {}, HTMLAudioElement: class {}
});
vm.runInContext(fs.readFileSync(new URL('../src/page-hook.js', import.meta.url), 'utf8'), hookContext);
await page.fetch('https://site.test/playlist');
for (let i = 0; i < 12; i++) await Promise.resolve();
assert(emitted.some((entry) => entry.item?.kind === 'hls'), 'Manifest detection must not wait for original streaming response completion');
responseMime = 'audio/x-mpegurl';
readCount = 0;
emitted.length = 0;
await page.fetch('https://site.test/playlist');
for (let i = 0; i < 12; i++) await Promise.resolve();
assert(emitted.some((entry) => entry.item?.kind === 'hls'), 'Audio-prefixed HLS MIME types still require manifest sniffing');
responseMime = 'video/mp4';
readCount = 0;
await page.fetch('https://site.test/movie.mp4');
for (let i = 0; i < 12; i++) await Promise.resolve();
assert.equal(readCount, 0, 'Ordinary binary video must not be cloned and read for manifest sniffing');
console.log('NebulaGrab regression checks passed (hydration, cache identity, credential handling, blob errors, streaming manifest sniff).');

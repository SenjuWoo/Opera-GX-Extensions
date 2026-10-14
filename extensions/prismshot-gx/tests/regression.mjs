import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const event = () => ({ addListener() {} });
let activeIds = [99];
let captures = 0;
let restored = 0;
let processedMetadata;
let frameDocumentId = 'original-document';
const chrome = {
  runtime: { onInstalled: event(), onMessage: event(), getManifest: () => ({ version: '1.0.2' }),
    sendMessage: async (message) => { processedMetadata = message.metadata; return { ok: true, width: 640, height: 360, format: 'png', objectUrl: 'blob:frame', clipboardOk: true }; } },
  contextMenus: { onClicked: event() }, commands: { onCommand: event() },
  tabs: { get: async () => ({ id: 5, active: true, windowId: 1, title: 'A/B', url: 'https://site.test' }),
    query: async () => [{ id: activeIds.shift() ?? 5 }], captureVisibleTab: async () => { captures++; return 'data:image/png;base64,AA'; } },
  downloads: { download: async () => 1 },
  webNavigation: { getFrame: async () => ({ documentId: frameDocumentId }) },
  storage: { sync: { get: async () => ({}) }, local: { get: async () => ({}), set: async () => {} } }
};
const context = vm.createContext({ chrome, URL, console, crypto: webcrypto, setTimeout, clearTimeout });
const run = (code) => vm.runInContext(code, context);
run(fs.readFileSync(new URL('../src/background.js', import.meta.url), 'utf8'));
assert.equal(run("sanitizeSegment('A/B\\\\C')"), 'A B C');
const filename = run("buildDownloadFilename({...DEFAULT_SETTINGS, filenameTemplate:'{title}'}, {title:'A/B', site:'site', capturedAt:'2026-10-12T12:00:00Z'}, {format:'png', width:640, height:360}, 0, 1)");
assert.equal(filename.split('/').length, 4, 'Page titles cannot add path components');
assert(filename.endsWith('/A B.png'));
assert.equal(run("chooseVideo([{frameId:0, videoId:'other', visible:true, readyState:4}], 0, 'removed')"), null, 'A removed selected video must not silently capture another video');
context.restore = () => { restored++; };
run(`discoverVideos = async () => ({videos:[{frameId:0, documentId:'original-document', videoId:'v', visible:true, readyState:4, currentTime:1, topRect:{left:0, top:0, width:640, height:360}}], topViewport:{width:640, height:360}});
broadcastToFrames = async () => {};
sendToFrame = async (_tab, _frame, message) => {
  if (message.type === 'PRISMSHOT_RESTORE_VISIBLE') restore();
  return {ok:true, restoreToken:'token', currentTime:42};
};
sleep = async () => {};
ensureOffscreenDocument = async () => {};
addHistory = async () => {};
`);
const capture = () => run("captureOne({tabId:5, settings:{...DEFAULT_SETTINGS, captureMode:'visible', showToasts:false}, destination:'download', burstIndex:0, burstTotal:1})");
await assert.rejects(capture(), /active tab changed before/);
assert.equal(captures, 0, 'Do not screenshot the wrong tab');
assert.equal(restored, 1, 'Always restore paused video and capture UI after failure');
activeIds = [5, 99];
await assert.rejects(capture(), /active tab changed during/);
assert.equal(processedMetadata, undefined, 'Discard a screenshot if active tab changes during capture');
activeIds = [5, 5];
await capture();
assert.equal(processedMetadata.currentTime, 42, 'Visible metadata uses the actual paused video time');

frameDocumentId = 'navigated-document';
processedMetadata = undefined;
activeIds = [5, 5];
await assert.rejects(capture(), /page changed during capture/);
assert.equal(processedMetadata, undefined, 'Same-tab navigation must discard a screenshot from the replacement document');

const previousCaptures = captures;
run(`sendToFrame = async (_tab, _frame, message) => {
  if (message.type === 'PRISMSHOT_PREPARE_VISIBLE') return {ok:false, error:'Selected video disappeared'};
  if (message.type === 'PRISMSHOT_RESTORE_VISIBLE') restore();
  return {ok:true};
};`);
await assert.rejects(capture(), /Selected video disappeared/);
assert.equal(captures, previousCaptures, 'Failed preparation must not screenshot a newly navigated page');

let cleared = false;
context.setTimeout = () => 123;
context.clearTimeout = (id) => { cleared = id === 123; };
assert.equal(await run("promiseWithTimeout(Promise.resolve('ready'), 1000, 'timeout')"), 'ready');
assert(cleared, 'Resolved frame messages must clear timeout timers');
console.log('PrismShot GX regression checks passed (filename safety, selected-video identity, preparation failure, tab switching/navigation, restore, timestamps, timeout cleanup).');

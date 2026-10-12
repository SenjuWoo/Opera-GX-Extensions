import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../src/panel.ts', import.meta.url), 'utf8')
  .replace(/^import .+;\r?\n/gm, '')
  .replace(/void initialize\(\)\.catch\([\s\S]*$/, '');
const code = transformSync(source, { loader: 'ts', target: 'es2022' }).code;

function harness() {
  const nodes = new Map();
  const context = vm.createContext({
    console, URL, AbortController, TextDecoder, structuredClone,
    crypto: { randomUUID },
    marked: { setOptions() {} },
    document: { getElementById: (id) => {
      if (!nodes.has(id)) nodes.set(id, { value: '', style: {}, classList: { toggle() {}, add() {} } });
      return nodes.get(id);
    } },
    chrome: {
      runtime: { getURL: (value) => `chrome-extension://nexus/${value}` },
      storage: { local: { set: async () => {} }, session: { get: async () => ({}) } }
    }
  });
  vm.runInContext(code, context);
  vm.runInContext("apiKey = 'test-key'; updateStreamingMessage = () => {};", context);
  return context;
}

test('request history includes previous turns and the current question exactly once', () => {
  const context = harness();
  const result = vm.runInContext(`
    messages = [
      { role: 'user', content: 'previous question' },
      { role: 'assistant', content: 'previous answer' },
      { role: 'user', content: 'current question' },
      { role: 'assistant', content: '' }
    ];
    buildRequestMessages('current question', '', null);
  `, context);
  assert.deepEqual(Array.from(result, (item) => item.role), ['system', 'user', 'assistant', 'user']);
  assert.equal(result.filter((item) => item.content.includes('current question')).length, 1);
  assert.equal(result[2].content, 'previous answer');
});

test('split CRLF, UTF-8, and a final unterminated SSE event are preserved', async () => {
  const context = harness();
  const events = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello 🌍' } }] })}\r\n\r\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: '!' } }], usage: { total_tokens: 7 } })}`
  ].join('');
  const bytes = new TextEncoder().encode(events);
  let index = 0;
  context.fetch = async () => ({ ok: true, body: { getReader: () => ({
    read: async () => index < bytes.length ? { done: false, value: bytes.slice(index, ++index) } : { done: true }
  }) } });
  vm.runInContext(`
    gatherBrowserContext = async () => ({ text: '', image: null, extractedTabs: 0 });
    activeController = new AbortController();
    assistant = { content: '' };
  `, context);
  await vm.runInContext("streamOpenRouter('question', assistant)", context);
  assert.equal(context.assistant.content, 'Hello 🌍!');
  assert.equal(context.assistant.usage.total_tokens, 7);
});

test('a preparing request prevents double submission and Stop prevents API spend', async () => {
  const context = harness();
  let finishExtraction;
  context.pendingExtraction = new Promise((resolve) => { finishExtraction = resolve; });
  let requests = 0;
  context.fetch = async () => { requests += 1; throw new Error('must not send'); };
  vm.runInContext(`
    gatherBrowserContext = () => pendingExtraction;
    renderConversation = () => {}; autoResizeComposer = () => {}; setRunning = () => {};
    saveCurrentSession = async () => {}; processPendingContext = async () => {};
    firstRun = runResearch('first'); secondRun = runResearch('second');
  `, context);
  await context.secondRun;
  assert.equal(vm.runInContext('messages.length', context), 2);
  vm.runInContext('stopResearch()', context);
  finishExtraction({ text: '', image: null, extractedTabs: 0 });
  await context.firstRun;
  assert.equal(requests, 0);
  assert.equal(vm.runInContext('activeController', context), null);
});

test('Opera fallback extracts its saved source tab and never screenshots the research tab', async () => {
  const context = harness();
  context.chrome.tabs = {
    query: async () => [{ id: 2, windowId: 1, url: 'chrome-extension://nexus/sidepanel.html' }],
    get: async (id) => ({ id, windowId: 1, url: 'https://example.com/article' }),
    captureVisibleTab: async () => { throw new Error('must not capture the extension'); }
  };
  context.chrome.storage.session.get = async () => ({ nexus_source_tab: 1 });
  assert.equal((await vm.runInContext('getContextTab()', context)).id, 1);
  assert.equal(await vm.runInContext('captureCurrentTab()', context), null);
  context.chrome.tabs.get = async () => { throw new Error('tab closed'); };
  assert.equal(await vm.runInContext('getContextTab()', context), undefined);
});

test('Opera toolbar fallback remembers the originating web tab without replacing it with its own tab', async () => {
  const event = { addListener() {} };
  const writes = [];
  const created = [];
  const context = vm.createContext({
    navigator: { userAgent: 'Mozilla/5.0 OPR/123.0' },
    chrome: {
      runtime: { getURL: (value) => `chrome-extension://nexus/${value}`, onInstalled: event, onStartup: event, onMessage: event },
      action: { onClicked: event }, contextMenus: { onClicked: event },
      storage: { session: { set: async (value) => writes.push(value) } },
      tabs: { query: async () => [], create: async (value) => created.push(value) }
    }
  });
  vm.runInContext(transformSync(readFileSync(new URL('../src/background.ts', import.meta.url), 'utf8'), { loader: 'ts' }).code, context);
  await context.openNexus({ id: 1, windowId: 1, url: 'https://example.com/article' });
  await context.openNexus({ id: 2, windowId: 1, url: 'chrome-extension://nexus/sidepanel.html' });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].nexus_source_tab, 1);
  assert.equal(created.length, 2);
});

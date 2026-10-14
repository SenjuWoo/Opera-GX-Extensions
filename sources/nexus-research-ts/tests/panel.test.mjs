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
    read: async () => index < bytes.length ? { done: false, value: bytes.slice(index, ++index) } : { done: true },
    cancel: async () => {}, releaseLock() {}
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

test('screenshots are discarded if the context tab changes before or during capture', async () => {
  const context = harness();
  let active = { id: 1, windowId: 1, url: 'https://example.com/article' };
  let captures = 0;
  context.chrome.tabs = {
    query: async () => [active],
    captureVisibleTab: async () => {
      captures += 1;
      active = { id: 2, windowId: 1, url: 'https://example.com/private' };
      return 'data:image/jpeg;base64,private';
    }
  };
  context.expected = { ...active };
  assert.equal(await vm.runInContext('captureCurrentTab(expected)', context), null);
  assert.equal(captures, 1);
  assert.equal(await vm.runInContext('captureCurrentTab(expected)', context), null);
  assert.equal(captures, 1);
});

test('partial failed and stopped responses visibly report that research was interrupted', async () => {
  for (const aborted of [false, true]) {
    const context = harness();
    context.failure = new Error(aborted ? 'stopped' : 'network disconnected');
    if (aborted) context.failure.name = 'AbortError';
    vm.runInContext(`
      renderConversation = () => {}; autoResizeComposer = () => {}; setRunning = () => {};
      saveCurrentSession = async () => {}; processPendingContext = async () => {}; toast = () => {};
      streamOpenRouter = async (_prompt, assistant) => { assistant.content = 'Partial answer'; throw failure; };
    `, context);
    await vm.runInContext("runResearch('question')", context);
    const text = vm.runInContext('messages[1].content', context);
    assert.match(text, /^Partial answer/);
    assert.match(text, aborted ? /stopped|incomplete/i : /failed|incomplete/i);
  }
});

test('page extraction stops visiting anchors once its unique-link budget is full', () => {
  const context = harness();
  let reads = 0;
  const anchors = Array.from({ length: 1000 }, (_, index) => ({
    innerText: `Link ${index}`,
    get href() { reads += 1; return `https://example.com/${index}`; }
  }));
  Object.assign(context.document, {
    title: 'Article', documentElement: { lang: 'en' },
    body: { cloneNode: () => ({ querySelectorAll: () => [], querySelector: () => null, innerText: 'Article text' }) },
    querySelector: () => null,
    querySelectorAll: (selector) => selector === 'a[href]' ? anchors : []
  });
  context.window = { getSelection: () => '' };
  context.navigator = { language: 'en' };
  context.location = { href: 'https://example.com/article' };
  const result = vm.runInContext('extractPageInTab(1000)', context);
  assert.equal(result.links.length, 180);
  assert.ok(reads <= 180, `Visited ${reads} links beyond the output budget`);
});

test('SSE DONE ends research and closes its reader without waiting for a server disconnect', async () => {
  const context = harness();
  let reads = 0;
  let cancelled = false;
  let released = false;
  context.fetch = async () => ({ ok: true, body: { getReader: () => ({
    read: async () => {
      if (reads++) throw new Error('Read after DONE');
      return { done: false, value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Answer"}}]}\n\ndata: [DONE]\n\n') };
    },
    cancel: async () => { cancelled = true; },
    releaseLock: () => { released = true; }
  }) } });
  vm.runInContext(`
    gatherBrowserContext = async () => ({ text: '', image: null, extractedTabs: 0 });
    activeController = new AbortController(); assistant = { content: '' };
  `, context);
  await vm.runInContext("streamOpenRouter('question', assistant)", context);
  assert.equal(context.assistant.content, 'Answer');
  assert.equal(cancelled, true);
  assert.equal(released, true);
});

test('an empty response is an explicit failure and closes its reader', async () => {
  const context = harness();
  let released = false;
  context.fetch = async () => ({ ok: true, body: { getReader: () => ({
    read: async () => ({ done: true }),
    cancel: async () => {}, releaseLock: () => { released = true; }
  }) } });
  vm.runInContext(`
    gatherBrowserContext = async () => ({ text: '', image: null, extractedTabs: 0 });
    activeController = new AbortController(); assistant = { content: '' };
  `, context);
  await assert.rejects(vm.runInContext("streamOpenRouter('question', assistant)", context), /no answer text/i);
  assert.equal(released, true);
});

test('Stop interrupts remaining selected-tab work after the current extraction returns', async () => {
  const context = harness();
  let extractions = 0;
  context.chrome.tabs = { query: async () => [
    { id: 1, url: 'https://example.com/one' },
    { id: 2, url: 'https://example.com/two' }
  ] };
  context.countExtraction = () => { extractions += 1; };
  vm.runInContext(`
    activeController = new AbortController(); includePage = true; selectedTabIds = new Set([2]);
    extractTab = async () => { countExtraction(); activeController.abort(); return null; };
  `, context);
  await assert.rejects(vm.runInContext('gatherBrowserContext()', context), { name: 'AbortError' });
  assert.equal(extractions, 1);
});

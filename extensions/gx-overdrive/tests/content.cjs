'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor() {
    this.dataset = {};
    this.isConnected = true;
    const classes = new Set();
    this.classList = {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); }
    };
  }
}
class Video extends Element {
  constructor() { super(); this.paused = false; this.muted = true; this.volume = 0; this.preload = 'auto'; }
  pause() { this.paused = true; }
  async play() { this.paused = false; }
}
const videos = [new Video()];
const idleTasks = [];
const intersections = [];
const mutationObservers = [];
const changes = [];
let turns = [];
const document = {
  documentElement: new Element(),
  querySelectorAll(selector) {
    if (selector.startsWith('video')) return videos;
    if (selector === 'turns') return turns;
    return [];
  }
};
const chrome = {
  runtime: { async sendMessage() { return { settings: { enabled: false } }; }, onMessage: { addListener() {} } },
  storage: { onChanged: { addListener(fn) { changes.push(fn); } } }
};
const context = vm.createContext({
  chrome, document, Element, HTMLElement: Element, HTMLVideoElement: Video,
  location: { hostname: 'example.com' }, setTimeout, console,
  window: { requestIdleCallback(fn) { idleTasks.push(fn); } },
  IntersectionObserver: class {
    constructor(fn) { this.callback = fn; intersections.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  },
  MutationObserver: class { constructor(fn) { mutationObservers.push(fn); } observe() {} }
});
let source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
source = source.replace(/\}\)\(\);\s*$/, 'globalThis.test = { state, optimizeVideos, optimizeChat, queueOptimize, applyRootClasses };})();');
vm.runInContext(source, context);

(async () => {
  await new Promise((resolve) => setImmediate(resolve));
  const { state, optimizeVideos, optimizeChat, applyRootClasses } = context.test;
  state.settings = { enabled: true, universalTurbo: true, pauseOffscreenMutedVideo: true };
  optimizeVideos(document);
  const observer = intersections[0];
  observer.callback([{ target: videos[0], isIntersecting: false }]);
  assert.equal(videos[0].paused, true, 'muted offscreen video pauses');
  state.settings.pauseOffscreenMutedVideo = false;
  optimizeVideos(document);
  assert.equal(observer.disconnected, true, 'setting off disconnects the observer');
  assert.equal(videos[0].paused, false, 'setting off restores extension-paused playback');
  observer.callback([{ target: videos[0], isIntersecting: false }]);
  assert.equal(videos[0].paused, false, 'a pending observer delivery cannot pause after disable');
  state.settings.aggressiveContainment = true;
  applyRootClasses();
  assert.equal(document.documentElement.classList.contains('gxo-aggressive-containment'), true);
  state.settings.universalTurbo = false;
  applyRootClasses();
  assert.equal(document.documentElement.classList.contains('gxo-aggressive-containment'), false, 'turning turbo off disables previously applied containment');

  mutationObservers[0]([
    { addedNodes: [new Element()], target: new Element() },
    { addedNodes: [new Element()], target: new Element() }
  ]);
  assert.equal(idleTasks.length, 1, 'a mutation burst queues one task');
  assert.equal(state.optimizationRoot, document, 'siblings in a mutation burst are all covered');

  let writes = 0;
  let text = '';
  const counter = { get textContent() { return text; }, set textContent(value) { text = value; writes++; } };
  turns = Array.from({ length: 5 }, () => new Element());
  state.chat.isChat = true;
  state.chat.profile = { turns: ['turns'], marker: '' };
  state.chat.toolbar = { isConnected: true, querySelector() { return counter; } };
  state.settings.chatOptimizer = true;
  state.settings.chatMaxVisibleTurns = 2;
  optimizeChat();
  optimizeChat();
  assert.equal(writes, 1, 'an unchanged toolbar label cannot feed the mutation observer forever');
  console.log('GX Overdrive content regressions: PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; });

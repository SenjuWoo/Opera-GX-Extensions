import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const styles = new Map();
const video = { muted: false, volume: 0.7, playbackRate: 1, isConnected: true };
let skipped = 0;
const button = {
  getBoundingClientRect: () => ({ width: 110, height: 35 }),
  click: () => { skipped += 1; }
};
const player = { classList: { contains: value => value === 'ad-showing' }, querySelector: () => video };
let changed;
let interval;
let observing = false;
const config = {
  adblock: { enabled: true, allowlist: [], youtube: { enabled: true, mode: 'adaptive', hidePromotions: false, autoFallback: false } }
};
const document = {
  getElementById: id => styles.get(id) || null,
  querySelector: selector => selector === '.html5-video-player' ? player : selector.startsWith('.ytp-ad-skip-button') ? button : null,
  querySelectorAll: () => [],
  createElement: () => ({ setAttribute() {}, style: {}, remove() { styles.delete(this.id); } }),
  documentElement: { appendChild: node => styles.set(node.id, node) },
  addEventListener() {}
};
const context = vm.createContext({
  document, location: { hostname: 'www.youtube.com' },
  HTMLElement: class { static [Symbol.hasInstance](value) { return value === button; } },
  HTMLVideoElement: class { static [Symbol.hasInstance](value) { return value === video; } },
  getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  chrome: {
    runtime: { sendMessage: async message => message.type === 'GET_STATE' ? { config } : { ok: true } },
    storage: { onChanged: { addListener: callback => { changed = callback; } } }
  },
  MutationObserver: class {
    observe() { observing = true; }
    disconnect() { observing = false; }
  },
  window: { addEventListener() {} },
  setTimeout, clearTimeout,
  setInterval: callback => { interval = callback; return 1; },
  clearInterval: () => { interval = null; }, console
});
vm.runInContext(fs.readFileSync(new URL('../content/youtube_adshield.js', import.meta.url), 'utf8'), context);
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(skipped, 1, 'ordinary-sized skip buttons are clicked');
assert.equal(video.muted, true, 'the current ad is muted');
assert.equal(styles.has('aegis-youtube-adshield-style'), false, 'hidePromotions=false does not install hiding CSS');
video.volume = 0.2;
video.playbackRate = 1.5;
changed({ config: { newValue: { adblock: { ...config.adblock, enabled: false } } } }, 'local');
assert.equal(video.muted, false, 'disabling restores the saved mute state');
assert.equal(video.volume, 0.2, 'volume changes that the helper never made are preserved');
assert.equal(video.playbackRate, 1.5, 'adaptive mode preserves user speed changes');
assert.equal(observing, false);
assert.equal(interval, null);
changed({ config: { newValue: { adblock: { ...config.adblock, youtube: { ...config.adblock.youtube, hidePromotions: true } } } } }, 'local');
assert.equal(observing, true);
assert.ok(styles.has('aegis-youtube-adshield-style'));
changed({ config: { newValue: { adblock: { ...config.adblock, allowlist: ['www.youtube.com'] } } } }, 'local');
assert.equal(video.muted, false, 'trust on the actual www hostname stops player changes');
assert.equal(observing, false);
assert.equal(styles.has('aegis-youtube-adshield-style'), false);
const aggressive = { adblock: { ...config.adblock, youtube: { ...config.adblock.youtube, mode: 'aggressive' } } };
changed({ config: { newValue: aggressive } }, 'local');
assert.equal(video.playbackRate, 16);
changed({ config: { newValue: { adblock: { ...aggressive.adblock, enabled: false } } } }, 'local');
assert.equal(video.playbackRate, 1.5, 'aggressive mode restores the speed it changed');
console.log('YouTube helper passed: normal skip buttons, option-controlled CSS, live disable/trust and video restoration.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../background/service_worker.js', import.meta.url), 'utf8').split('chrome.runtime.onInstalled')[0];
const local = {};
const rules = [];
let releaseFetch;
let signalFetchStarted;
const fetchStarted = new Promise(resolve => { signalFetchStarted = resolve; });
const response = new Promise(resolve => { releaseFetch = resolve; });
const context = vm.createContext({
  console, URL, structuredClone, AbortController, setTimeout, clearTimeout,
  fetch: () => { signalFetchStarted(); return response; },
  chrome: {
    storage: { local: {
      get: async keys => Object.fromEntries(keys.map(key => [key, structuredClone(local[key])])),
      set: async values => Object.assign(local, structuredClone(values)),
      remove: async key => { delete local[key]; }
    } },
    declarativeNetRequest: {
      getDynamicRules: async () => [],
      updateDynamicRules: async ({ addRules }) => { rules.splice(0, rules.length, ...addRules); }
    },
    tabs: { query: async () => [] }
  }
});
vm.runInContext(source, context);
const run = expression => vm.runInContext(expression, context);
local.config = structuredClone(run('structuredClone(DEFAULTS)'));
local.config.feeds.urlhaus = false;
local.config.adblock.enabled = false;
const updating = run('updateThreatFeeds("race-regression")');
await fetchStarted;
context.newConfig = structuredClone(await run('getConfig()'));
context.newConfig.enabled = false;
context.newConfig.allowlist = ['trusted.example'];
context.newConfig.feeds.hageziTif = false;
context.newConfig.stats.threatsStopped = 17;
await run('saveConfig(newConfig)');
releaseFetch({ ok: true, text: async () => '0.0.0.0 trusted.example\n0.0.0.0 unwanted.example' });
await updating;
assert.equal(local.config.enabled, false, 'a pending feed cannot re-enable protection');
assert.deepEqual(local.config.allowlist, ['trusted.example'], 'a pending feed cannot remove new trust');
assert.equal(local.config.feeds.hageziTif, false, 'latest selected feeds survive the update');
assert.equal(local.config.stats.threatsStopped, 17, 'latest counters survive the update');
assert.equal(rules.length, 0, 'disabled protection cannot receive stale blocking rules');
assert.equal(local.threatDomains.length, 0, 'disabled feeds are excluded from the compiled threat cache');
assert.equal(run('configCache.enabled'), false, 'cached configuration agrees with saved settings');
context.newConfig = structuredClone(run('structuredClone(DEFAULTS)'));
context.newConfig.feeds.urlhaus = false;
context.newConfig.adblock.enabled = false;
await run('saveConfig(newConfig)');
let installations = 0;
context.chrome.declarativeNetRequest.updateDynamicRules = async ({ addRules }) => {
  rules.splice(0, rules.length, ...addRules);
  if (++installations === 1) {
    context.newConfig = structuredClone(await run('getConfig()'));
    context.newConfig.enabled = false;
    context.newConfig.stats.threatsStopped = 22;
    await run('saveConfig(newConfig)');
  }
};
await run('updateThreatFeeds("install-race-regression")');
assert.equal(installations, 2, 'a save during rule installation recompiles the latest preferences');
assert.equal(local.config.enabled, false);
assert.equal(local.config.stats.threatsStopped, 22);
assert.equal(rules.length, 0, 'a late rule installation cannot override the new shield toggle');
console.log('Aegis feed race self-check passed: delayed fetch preserves newer trust, toggles, selected feeds and counters.');

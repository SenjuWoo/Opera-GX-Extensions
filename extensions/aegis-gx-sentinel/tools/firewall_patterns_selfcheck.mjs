import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../background/service_worker.js', import.meta.url), 'utf8').split('chrome.runtime.onInstalled')[0];
const rules = [];
let removedSince;
const context = vm.createContext({
  console, URL, structuredClone, setTimeout, clearTimeout,
  chrome: {
    contentSettings: { automaticDownloads: {
      clear: async () => { rules.length = 0; },
      set: async rule => { rules.push(rule); }
    } },
    browsingData: { remove: async ({ since }) => { removedSince = since; } },
    storage: { local: { set: async () => {} } }
  }
});
vm.runInContext(source, context);
const run = expression => vm.runInContext(expression, context);
const config = run('structuredClone(DEFAULTS)');
context.config = config;
config.allowlist = ['http://localhost:8000/', '*.example.com', '127.0.0.1', '[::1]', 'sillytavern'];
await run('applyPermissionFirewall(config)');
const patterns = rules.filter(rule => rule.setting === 'allow').map(rule => rule.primaryPattern);
assert.deepEqual(patterns, ['*://*.localhost/*', '*://*.example.com/*', '*://127.0.0.1/*', '*://[::1]/*', '*://*.sillytavern/*']);
assert.equal(rules[0].primaryPattern, '<all_urls>');
assert.equal(rules[0].setting, 'block');
for (const value of ['localhost', 'http://localhost:8000/', 'https://LOCALHOST:8443/path']) {
  context.value = value;
  assert.equal(run('normalizeTrustedHost(value)'), 'localhost');
}
for (const value of ['*', '*.com*', 'https://user:password@example.com/', 'javascript:alert(1)', 'a..example', 'http://bad host/']) {
  context.value = value;
  assert.equal(run('normalizeTrustedHost(value)'), '', value);
}
assert.equal(run('normalizeDomain("localhost")'), '', 'feed parser must still reject localhost');
assert.equal(run('isAllowlistedHost(config, "api.example.com")'), true);
assert.equal(run('isAllowlistedHost(config, "example.com.evil.test")'), false);
assert.equal(run('isAllowlistedHost(config, "localhost")'), true);
config.allowlist = [];
await run('applyPermissionFirewall(config)');
assert.equal(rules.length, 1, 'removing trust restores the global block');
config.enabled = false;
await run('applyPermissionFirewall(config)');
assert.equal(rules.length, 0, 'pausing protection releases permissions');
run('configCache = structuredClone(DEFAULTS)');
await run('panicWipe(0)');
assert.equal(removedSince, 0, 'All time must not become Last hour');
assert.equal(run('Object.getPrototypeOf(mergeDeep({}, JSON.parse(\'{"__proto__":{"polluted":true}}\'))).polluted'), undefined);
context.chrome.contentSettings.automaticDownloads.set = async () => { throw new Error('Permission rejected'); };
config.enabled = true;
await assert.rejects(run('applyPermissionFirewall(config)'), /Permission rejected/);
let listener;
context.chrome.runtime = {
  getURL: value => `chrome-extension://aegis/${value}`,
  onMessage: { addListener: callback => { listener = callback; } }
};
const fullSource = fs.readFileSync(new URL('../background/service_worker.js', import.meta.url), 'utf8');
vm.runInContext(fullSource.slice(fullSource.indexOf('chrome.runtime.onMessage.addListener')), context);
for (const type of ['UPDATE_CONFIG', 'TRUST_DOMAIN', 'SET_RELAY_CREDENTIAL', 'PANIC_WIPE', 'YOUTUBE_AD_HANDLED']) {
  const response = await new Promise(resolve => listener({ type }, { tab: { id: 7 }, url: 'https://untrusted.example/' }, resolve));
  assert.equal(response.ok, false, `${type} must reject website senders`);
}
console.log('Trusted-site firewall passed: HTTP/HTTPS, ports, localhost/IPs, trust removal, pause, failures and All time cleanup.');

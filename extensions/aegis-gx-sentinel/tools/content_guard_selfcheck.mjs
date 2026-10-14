import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class Element {
  constructor(tag, attrs = {}) {
    this.tagName = tag;
    this.attrs = { ...attrs };
    this.children = [];
    this.nodeType = 1;
    this.style = {};
    this.rel = attrs.rel || '';
    this.target = attrs.target || '';
  }
  get id() { return this.attrs.id; }
  set id(value) { this.attrs.id = value; }
  get isConnected() { return Boolean(this.parent); }
  get parentElement() { return this.parent; }
  matches(selector) {
    return selector.split(',').some(part => {
      const rule = part.trim();
      if (rule === 'a[ping]') return this.tagName === 'a' && this.hasAttribute('ping');
      if (rule === "a[target='_blank']") return this.tagName === 'a' && this.target === '_blank';
      if (rule === "input[type='password']") return this.tagName === 'input' && this.attrs.type === 'password';
      const rel = rule.match(/^link\[rel~='([^']+)'\]$/);
      return Boolean(rel) && this.tagName === 'link' && this.rel.split(/\s+/).includes(rel[1]);
    });
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
  setAttribute(name, value) { this.attrs[name] = value; }
  removeAttribute(name) { delete this.attrs[name]; }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = null;
  }
  contains(child) { return child === this || this.children.some(node => node.contains(child)); }
}

const html = new Element('html');
const body = html.appendChild(new Element('body'));
const document = {
  documentElement: html, body,
  querySelectorAll: selector => html.querySelectorAll(selector),
  querySelector: selector => html.querySelector(selector),
  getElementById: id => {
    const find = root => root.id === id ? root : root.children.map(find).find(Boolean);
    return find(html) || null;
  },
  createElement: tag => new Element(tag),
  addEventListener() {}
};
let changes;
const observers = [];
const config = {
  enabled: true, allowlist: [], privacy: { disablePageSpeculation: true },
  adblock: { enabled: true, cosmeticFiltering: true, sponsoredCleanup: true, antiAdblockCleanup: false, allowlist: [] }
};
const context = vm.createContext({
  document, HTMLElement: Element, Node: { ELEMENT_NODE: 1 },
  location: { hostname: 'example.com', protocol: 'http:' },
  chrome: {
    runtime: { sendMessage: async message => message.type === 'GET_STATE' ? { config } : { ok: true } },
    storage: { onChanged: { addListener: listener => { changes = listener; } } }
  },
  MutationObserver: class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() { this.active = true; this.observations = (this.observations || 0) + 1; }
    disconnect() { this.active = false; }
  },
  window: { addEventListener() {} }, setTimeout, clearTimeout, console
});
vm.runInContext(fs.readFileSync(new URL('../content/guard.js', import.meta.url), 'utf8'), context);
await new Promise(resolve => setTimeout(resolve, 0));
const observer = observers[0];
const insert = (...nodes) => {
  nodes.forEach(node => body.appendChild(node));
  observer.callback([{ addedNodes: nodes }]);
};

const anchor = new Element('a', { ping: 'https://tracker.example/', target: '_blank' });
insert(anchor);
assert.equal(anchor.hasAttribute('ping'), false, 'directly inserted links lose tracking pings');
assert.match(anchor.rel, /\bnoopener\b/, 'directly inserted links are protected');
const preconnect = new Element('link', { rel: 'preconnect' });
insert(preconnect);
assert.equal(preconnect.parent, null, 'directly inserted speculation links are removed');
insert(new Element('input', { type: 'password' }));
assert.ok(document.getElementById('aegis-http-warning'), 'direct password input triggers the HTTP warning');

assert.ok(document.getElementById('aegis-cosmetic-style').textContent.includes('.sponsored-container'));
changes({ config: { newValue: { ...config, adblock: { ...config.adblock, sponsoredCleanup: false } } } }, 'local');
assert.equal(document.getElementById('aegis-cosmetic-style').textContent.includes('.sponsored-container'), false, 'cosmetic options update on the open page');
changes({ config: { newValue: { ...config, allowlist: ['example.com'], adblock: { ...config.adblock, allowlist: ['example.com'] } } } }, 'local');
assert.equal(document.getElementById('aegis-http-warning'), null, 'trust removes the stale HTTP warning');
assert.equal(document.getElementById('aegis-cosmetic-style'), null, 'ad-only trust releases cosmetic filtering');
changes({ config: { newValue: { ...config, enabled: false, adblock: { ...config.adblock, enabled: false } } } }, 'local');
assert.equal(observer.active, false, 'disabling both engines stops observation');
changes({ config: { newValue: config } }, 'local');
assert.equal(observer.active, true, 're-enabling resumes the already loaded guard');
assert.ok(document.getElementById('aegis-cosmetic-style'));
const observations = observer.observations;
changes({ config: { newValue: { ...config, stats: { contentBlocked: 10 } } } }, 'local');
assert.equal(observer.observations, observations, 'unrelated counters do not trigger full rescans');
const detached = new Element('a', { ping: 'https://tracker.example/' });
observer.callback([{ addedNodes: [detached] }]);
assert.equal(detached.hasAttribute('ping'), true, 'detached roots do not waste processing');
console.log('Content guard passed: inserted roots, live settings, trust/style cleanup and observer lifecycle.');

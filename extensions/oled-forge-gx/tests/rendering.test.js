'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../lib/color.js');
const D = require('../lib/detection.js');

class Element {
  constructor(tag = 'DIV', source = {}, parent = null) {
    this.tagName = tag;
    this.parentElement = parent;
    this.isConnected = true;
    this.dataset = {};
    this.childNodes = [];
    this.textContent = '';
    this.source = { backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none',
      backgroundClip: 'border-box', webkitTextFillColor: 'rgb(30, 30, 30)', color: 'rgb(30, 30, 30)',
      maskImage: 'none', webkitMaskImage: 'none', display: 'block', visibility: 'visible', opacity: '1',
      fontSize: '16px', position: 'static', borderTopWidth: '0px', borderRightWidth: '0px',
      borderBottomWidth: '0px', borderLeftWidth: '0px', ...source };
    const classes = new Set();
    this.classList = { add: (...items) => items.forEach(item => classes.add(item)),
      remove: (...items) => items.forEach(item => classes.delete(item)), contains: item => classes.has(item) };
    const properties = new Map();
    this.style = { getPropertyValue: key => properties.get(key) || '',
      setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) };
  }
  hasAttribute(name) { return name === 'style'; }
  getAttribute() { return ''; }
  closest() { return null; }
  matches() { return false; }
  getBoundingClientRect() { return { width: 300, height: 30 }; }
}
const root = new Element('HTML', { backgroundColor: 'rgb(0, 0, 0)' });
const document = { documentElement: root, body: root, readyState: 'loading', addEventListener() {} };
function computed(element) {
  const style = { ...element.source };
  if (style.color === 'inherit') style.color = computed(element.parentElement).color;
  if (style.webkitTextFillColor === 'inherit') style.webkitTextFillColor = computed(element.parentElement).webkitTextFillColor;
  if (element.classList.contains('oledforge-bg')) style.backgroundColor = element.style.getPropertyValue('--oledforge-bg');
  if (element.classList.contains('oledforge-neutral-gradient')) style.backgroundImage = 'none';
  if (element.classList.contains('oledforge-fg')) style.color = element.style.getPropertyValue('--oledforge-fg');
  if (element.classList.contains('oledforge-fill')) style.webkitTextFillColor = style.color;
  if (element.classList.contains('oledforge-preserved-fill')) style.webkitTextFillColor = element.style.getPropertyValue('--oledforge-preserved-fill');
  return style;
}
const context = vm.createContext({ document, Element, console, OLEDColor: C, OLEDDetection: D,
  Node: { TEXT_NODE: 3 }, location: { hostname: 'fixture.test' }, innerWidth: 1000, innerHeight: 800,
  getComputedStyle: computed, addEventListener() {}, setTimeout() {}, clearTimeout() {},
  chrome: { runtime: { getManifest: () => ({ version: 'test' }), onMessage: { addListener() {} } },
    storage: { sync: { get(_keys, callback) { callback({}); } }, local: { async get() { return {}; } },
      onChanged: { addListener() {} } } } });
let source = fs.readFileSync(path.join(__dirname, '../content/engine.js'), 'utf8');
source = source.replace(/\}\)\(\);\s*$/, 'globalThis.test = { state, processElement, computedBackground };})();');
vm.runInContext(source, context);

setImmediate(() => {
  const { state, processElement, computedBackground } = context.test;
  state.pageKind = 'light';
  const failures = [];
  function check(name, run) {
    try { run(); console.log('PASS', name); }
    catch (error) { failures.push(`${name}: ${error.message}`); }
  }
  check('gradient text retains its glyph paint', () => {
    const text = new Element('DIV', { color: 'rgba(0, 0, 0, 0)', webkitTextFillColor: 'rgba(0, 0, 0, 0)',
      backgroundClip: 'text', backgroundImage: 'linear-gradient(rgb(220, 220, 220), rgb(250, 250, 250))' }, root);
    processElement(text);
    assert.equal(text.classList.contains('oledforge-neutral-gradient'), false);
    assert.equal(text.classList.contains('oledforge-bg'), false);
  });
  check('image backdrops preserve original foreground decisions', () => {
    const card = new Element('DIV', { backgroundColor: 'rgb(255, 255, 255)', backgroundImage: 'url("fixture.svg")' }, root);
    processElement(card);
    const text = new Element('P', {}, card);
    processElement(text);
    assert.equal(card.classList.contains('oledforge-bg'), false);
    assert.equal(text.classList.contains('oledforge-fg'), false);
    assert.equal(computedBackground(text), null);
  });
  check('explicit text fill participates in contrast correction', () => {
    const text = new Element('P', { color: 'rgb(250, 250, 250)', webkitTextFillColor: 'rgb(20, 20, 20)' }, root);
    processElement(text);
    assert.equal(text.classList.contains('oledforge-fg'), true);
    assert.equal(text.classList.contains('oledforge-fill'), true);
    assert.ok(C.contrastRatio(C.parseColor(text.style.getPropertyValue('--oledforge-fg')), C.parseColor('rgb(0, 0, 0)')) >= 6.99);
  });
  check('image boundary restores source text inherited from a converted parent', () => {
    const parent = new Element('P', {}, root);
    processElement(parent);
    assert.equal(parent.classList.contains('oledforge-fg'), true);
    const card = new Element('DIV', { backgroundImage: 'url("fixture.svg")', color: 'inherit', webkitTextFillColor: 'inherit' }, parent);
    processElement(card);
    assert.equal(computed(card).color, 'rgb(30, 30, 30)');
    assert.equal(computed(card).webkitTextFillColor, 'rgb(30, 30, 30)');
    assert.equal(parent.classList.contains('oledforge-fg'), true);
    const filled = new Element('DIV', { backgroundImage: 'url("fixture.svg")', color: 'inherit', webkitTextFillColor: 'rgb(10, 40, 80)' }, parent);
    processElement(filled);
    assert.equal(computed(filled).webkitTextFillColor, 'rgb(10, 40, 80)');
    processElement(card);
    assert.equal(computed(card).color, 'rgb(30, 30, 30)');
  });
  check('masked neutral icons remain visible on converted backgrounds', () => {
    const icon = new Element('SPAN', { backgroundColor: 'rgb(20, 20, 20)', maskImage: 'url("icon.svg")' }, root);
    icon.getBoundingClientRect = () => ({ width: 24, height: 24 });
    processElement(icon);
    assert.ok(C.contrastRatio(C.parseColor(computed(icon).backgroundColor), C.parseColor('rgb(0, 0, 0)')) >= 4.49);
  });
  check('reprocessing reads changed site styles rather than its own override', () => {
    const card = new Element('DIV', { backgroundColor: 'rgb(255, 255, 255)' }, root);
    processElement(card);
    const previous = card.style.getPropertyValue('--oledforge-bg');
    card.source.backgroundColor = 'rgb(180, 200, 220)';
    processElement(card);
    assert.notEqual(card.style.getPropertyValue('--oledforge-bg'), previous);
  });
  check('deep transparent wrappers retain the actual opaque backdrop', () => {
    let element = new Element('DIV', { backgroundColor: 'rgb(255, 255, 255)' }, root);
    for (let depth = 0; depth < 12; depth++) element = new Element('DIV', {}, element);
    assert.deepEqual({ ...computedBackground(element) }, { r: 255, g: 255, b: 255, a: 1 });
  });
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
});

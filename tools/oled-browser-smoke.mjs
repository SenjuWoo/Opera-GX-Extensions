// Render adversarial pages in an isolated Opera profile to catch real text-paint regressions.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opera = process.argv[2];
const extensions = path.resolve(process.argv[3] || path.join(repo, 'extensions'));
const screenshotPath = path.resolve(process.argv[4] || path.join(repo, '_archive/audit-2026-10-13/oled-readability.png'));
const pack = process.argv.includes('--pack');
assert.ok(opera && fs.statSync(opera).isFile(), 'Argument 1 must be an existing native Opera executable.');
const oled = path.join(extensions, 'oled-forge-gx');
const manifest = JSON.parse(fs.readFileSync(path.join(oled, 'manifest.json'), 'utf8'));
const id = [...createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest().subarray(0, 16)]
  .map(byte => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join('');
const dirs = pack ? fs.readdirSync(extensions).filter(name => fs.existsSync(path.join(extensions, name, 'manifest.json'))).map(name => path.join(extensions, name)) : [oled];
const profile = path.join(repo, '_archive/audit-2026-10-13/runtime', `oled-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
const child = spawn(opera, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, `--load-extension=${dirs.join(',')}`, `--disable-extensions-except=${dirs.join(',')}`], { windowsHide: true, stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sockets = [];
let server;
try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let count = 0; count < 100 && !fs.existsSync(portFile); count++) await pause(200);
  assert.ok(fs.existsSync(portFile), 'Opera did not expose its isolated debugging endpoint.');
  const base = `http://127.0.0.1:${fs.readFileSync(portFile, 'utf8').split('\n')[0]}`;
  async function connect(url) {
    const ws = new WebSocket(url);
    sockets.push(ws);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    let sequence = 0;
    const pending = new Map();
    ws.addEventListener('message', ({ data }) => {
      const reply = JSON.parse(String(data));
      const entry = pending.get(reply.id);
      if (!entry) return;
      pending.delete(reply.id);
      clearTimeout(entry.timer);
      if (reply.error) entry.reject(new Error(JSON.stringify(reply.error))); else entry.resolve(reply.result);
    });
    return (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(connection, expression) {
    const result = await connection('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function open(url) {
    const target = await (await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
    const connection = await connect(target.webSocketDebuggerUrl);
    await connection('Runtime.enable');
    for (let count = 0; count < 40; count++) {
      const loaded = await evaluate(connection, '({ready:document.readyState,url:location.href,runtimeId:globalThis.chrome?.runtime?.id})');
      if (loaded.ready === 'complete' && loaded.url === url && (!url.startsWith('chrome-extension:') || loaded.runtimeId === id)) return connection;
      await pause(100);
    }
    throw new Error(`Page did not finish loading: ${url}`);
  }
  console.log('Native browser:', (await (await fetch(`${base}/json/version`)).json()).Browser);
  let loadedWorker = false;
  for (let count = 0; count < 100; count++) {
    const targets = await (await fetch(`${base}/json/list`)).json();
    if (targets.some(target => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${id}/`))) { loadedWorker = true; break; }
    await pause(100);
  }
  assert.ok(loadedWorker, 'OLED extension service worker did not load.');
  const app = await open(`chrome-extension://${id}/${manifest.options_page || manifest.options_ui?.page || manifest.action.default_popup}`);
  await evaluate(app, 'chrome.storage.sync.set({oledForgeSettings:{enabled:false,convertLightPages:true,strength:88,pureBlack:true,targetContrast:7,performance:"balanced",preserveBrandColors:true,mediaMode:"untouched"}})');
  const fixture = fs.readFileSync(path.join(repo, 'extensions/oled-forge-gx/tests/fixtures/readability.html'));
  server = http.createServer((_request, response) => { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(fixture); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const fixtureUrl = `http://127.0.0.1:${server.address().port}/readability.html`;
  const page = await open(fixtureUrl);
  await page('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  const tabId = await evaluate(app, `chrome.tabs.query({url:${JSON.stringify(fixtureUrl)}}).then(tabs=>tabs[0]?.id)`);
  assert.ok(Number.isInteger(tabId), 'Fixture tab was not found through the extension API.');
  const status = () => evaluate(app, `chrome.tabs.sendMessage(${tabId},{type:"OLED_FORGE_STATUS"})`);
  async function waitStatus(predicate, label) {
    let last;
    for (let count = 0; count < 100; count++) {
      try { last = await status(); if (predicate(last)) return last; } catch { /* Content script is still starting. */ }
      await pause(100);
    }
    throw new Error(`${label}: ${JSON.stringify(last)}`);
  }
  const failures = [];
  function check(condition, message) { if (!condition) failures.push(message); }
  const inspect = () => evaluate(page, `(() => {
    const canvas=document.createElement('canvas'); canvas.width=canvas.height=1;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const rgba=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
    const data={};
    for(const id of ['oklch','oklch-text','lab','lab-text','p3','p3-text','gradient-text','filled-text','brand-link','masked-icon','photo','photo-caption','alpha-outer','alpha-inner','input','editable','theme-copy']){
      const element=document.getElementById(id),style=getComputedStyle(element);
      data[id]={bg:rgba(style.backgroundColor),fg:rgba(style.color),fill:rgba(style.webkitTextFillColor||style.color),image:style.backgroundImage,mask:style.maskImage,clip:style.backgroundClip,classes:element.className};
      if(id==='gradient-text'){
        data[id].parentBg=rgba(getComputedStyle(element.parentElement).backgroundColor);
        data[id].stops=(style.backgroundImage.match(/rgba?\\([^)]*\\)/g)||[]).map(rgba);
      }
    }
    const pseudo=getComputedStyle(document.getElementById('pseudo-icon'),'::before');
    data.pseudo={bg:rgba(pseudo.backgroundColor),mask:pseudo.maskImage};
    return data;
  })()`);
  const luminance = rgba => rgba.slice(0, 3).map(byte => byte / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
  function checkGradient(snapshot, label) {
    const gradient = snapshot['gradient-text'];
    check(gradient.image.startsWith('linear-gradient(') && gradient.fill[3] === 0 && gradient.clip === 'text', `${label} gradient-painted DIV text was erased or covered`);
    check(gradient.stops.length >= 2 && gradient.stops.every(stop => contrast(stop, gradient.parentBg) >= 4.5), `${label} neutral gradient stops lost readable contrast`);
  }
  async function screenshot(destination) { const shot = await page('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(destination, Buffer.from(shot.data, 'base64')); }
  await waitStatus(value => !value.active, 'OLED did not start disabled');
  await evaluate(page, 'document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');
  const before = await inspect();
  checkGradient(before, 'Original light-theme');
  await screenshot(screenshotPath.replace(/\.png$/i, '-before.png'));
  await evaluate(app, 'chrome.storage.sync.set({oledForgeSettings:{enabled:true,convertLightPages:true,strength:88,pureBlack:true,targetContrast:7,performance:"balanced",preserveBrandColors:true,mediaMode:"untouched"}})');
  await waitStatus(value => value.active && value.stats.queue === 0, 'OLED scan did not settle');
  await pause(300);
  const transformed = await inspect();
  await screenshot(screenshotPath);
  for (const id of ['oklch', 'lab', 'p3']) {
    check(luminance(transformed[id].bg) < .15, `${id} modern surface stayed bright`);
    check(contrast(transformed[`${id}-text`].fill, transformed[id].bg) >= 4.5, `${id} text lost readable contrast`);
  }
  checkGradient(transformed, 'Light-theme');
  check(luminance(transformed['filled-text'].fill) > .55, 'Explicit text-fill stayed dark on a converted surface');
  const linkFill = transformed['brand-link'].fill;
  check(linkFill[2] - linkFill[0] >= 20 && linkFill[2] - linkFill[1] >= 10, 'Correcting prose washed out the nested brand link');
  check(luminance(transformed['masked-icon'].bg) > .55 && transformed['masked-icon'].mask !== 'none', 'Masked icon lost its visible paint');
  check(luminance(transformed.pseudo.bg) > .55 && transformed.pseudo.mask !== 'none', 'Masked pseudo-icon lost its visible paint');
  check(transformed.photo.image === before.photo.image, 'Photo background was removed');
  check(JSON.stringify(transformed['photo-caption'].fill) === JSON.stringify(before['photo-caption'].fill), 'Text over the preserved light image was recolored');
  check(contrast(transformed.input.fill, transformed.input.bg) >= 4.5, 'Native input text lost readable contrast');
  check(JSON.stringify(transformed.editable.fill) === JSON.stringify(before.editable.fill) && JSON.stringify(transformed.editable.bg) === JSON.stringify(before.editable.bg), 'Contenteditable paint was changed');
  await pause(450);
  const settled = await status();
  await pause(450);
  const stable = await status();
  check(stable.stats.queue === 0 && stable.stats.scanned - settled.stats.scanned <= 8, 'OLED generated a mutation/rescan feedback loop while idle');
  await evaluate(page, 'document.documentElement.dataset.theme="dark"');
  try { await waitStatus(value => value.active && value.pageKind === 'dark' && value.stats.queue === 0, 'Dark theme was not detected'); } catch (error) { failures.push(error.message); }
  const dark = await inspect();
  checkGradient(dark, 'Dark-theme');
  await evaluate(page, 'document.documentElement.dataset.theme="light"');
  try { await waitStatus(value => value.active && value.pageKind === 'light' && value.stats.queue === 0, 'Light theme was not detected'); } catch (error) { failures.push(error.message); }
  // Removing a stylesheet can change the theme just as inserting one does.
  await evaluate(page, `(() => { const style=document.createElement('style'); style.id='temporary-dark-theme'; style.textContent=':root,body { background:#17171b; }'; document.head.appendChild(style); })()`);
  try { await waitStatus(value => value.active && value.pageKind === 'dark' && value.stats.queue === 0, 'Inserted stylesheet theme was not detected'); } catch (error) { failures.push(error.message); }
  await evaluate(page, 'document.getElementById("temporary-dark-theme").remove()');
  try { await waitStatus(value => value.active && value.pageKind === 'light' && value.stats.queue === 0, 'Removed stylesheet theme was not detected'); } catch (error) { failures.push(error.message); }
  await evaluate(page, `addEventListener('beforeprint',()=>{
    const fill=getComputedStyle(document.getElementById('filled-text'));
    const gradient=getComputedStyle(document.getElementById('gradient-text'));
    globalThis.__oledPrintSnapshot={active:document.documentElement.dataset.oledforgeActive,fill:fill.webkitTextFillColor,image:gradient.backgroundImage};
  });true`);
  await page('Page.printToPDF', { printBackground: false });
  const printed = await evaluate(page, 'globalThis.__oledPrintSnapshot');
  check(printed && printed.active !== 'true' && printed.fill === 'rgb(34, 34, 34)' && printed.image === before['gradient-text'].image, 'Printing retained OLED paint instead of original site styles');
  await waitStatus(value => value.active && value.stats.queue === 0, 'OLED did not reactivate after printing');
  await evaluate(app, 'chrome.storage.sync.set({oledForgeSettings:{enabled:false}})');
  await waitStatus(value => !value.active && value.stats.queue === 0, 'OLED did not disable');
  const restored = await inspect();
  for (const id of Object.keys(before)) {
    check(JSON.stringify({ ...restored[id], classes: undefined }) === JSON.stringify({ ...before[id], classes: undefined }), `${id} original paint was not restored after disable`);
    check(!String(restored[id].classes || '').includes('oledforge-'), `${id} retained OLED override classes after disable`);
  }
  const gradientContrast = Object.fromEntries(Object.entries({ before, light: transformed, dark }).map(([name, snapshot]) => [name,
    snapshot['gradient-text'].stops.map(stop => Number(contrast(stop, snapshot['gradient-text'].parentBg).toFixed(2)))
  ]));
  const imageCaptionFill = { before: before['photo-caption'].fill, transformed: transformed['photo-caption'].fill, restored: restored['photo-caption'].fill };
  console.log(JSON.stringify({ version: manifest.version, mode: pack ? 'pack' : 'oled-only', screenshot: screenshotPath, profile, gradientContrast, imageCaptionFill, failures }, null, 2));
  assert.deepEqual(failures, [], 'OLED native readability/lifecycle regressions failed.');
  console.log('PASS: modern colors, text paint, masks, image captions, controls, live themes, disable restoration and idle queue.');
} finally {
  for (const socket of sockets) socket.close();
  child.kill();
  if (server) {
    const closed = new Promise(resolve => server.close(resolve));
    server.closeAllConnections();
    await closed;
  }
}

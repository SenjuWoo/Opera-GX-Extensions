// ==UserScript==
// @name         Nexus Archive Helper
// @namespace    https://github.com/SenjuWoo/Opera-GX-Extensions
// @version      1.1.3
// @description  Find Nexus archived/old files by exact IDs and official API routes, then hand downloads back to Nexus.
// @author       SenjuWoo
// @match        https://www.nexusmods.com/*/mods/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @sandbox      DOM
// @connect      api.nexusmods.com
// @run-at       document-idle
// ==/UserScript==

(function (root) {
  'use strict';

  const API = 'https://api.nexusmods.com/v1';
  const CATEGORY_BY_ID = {
    1: 'MAIN',
    2: 'UPDATE',
    3: 'OPTIONAL',
    4: 'OLD_VERSION',
    5: 'MISCELLANEOUS',
    6: 'DELETED',
    7: 'ARCHIVED',
  };

  function positiveInt(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  function parseReference(input) {
    const raw = String(input || '').trim();
    if (!raw) throw new Error('Paste a Nexus mod URL, NXM URL, or game:modId[:fileId].');

    const short = raw.match(/^([a-z0-9_-]+):(\d+)(?::(\d+))?$/i);
    if (short) {
      return {
        game: short[1].toLowerCase(),
        modId: positiveInt(short[2]),
        fileId: positiveInt(short[3]),
        key: null,
        expires: null,
      };
    }

    const nxm = raw.match(/^nxm:\/\/([^/]+)\/mods\/(\d+)\/files\/(\d+)(?:\?(.*))?$/i);
    if (nxm) {
      const q = new URLSearchParams(nxm[4] || '');
      return {
        game: nxm[1].toLowerCase(),
        modId: positiveInt(nxm[2]),
        fileId: positiveInt(nxm[3]),
        key: q.get('key'),
        expires: q.get('expires'),
      };
    }

    let url;
    try {
      url = new URL(raw);
    } catch {
      throw new Error('Unrecognized reference. Use a Nexus URL, NXM URL, or game:modId[:fileId].');
    }

    if (!/(^|\.)nexusmods\.com$/i.test(url.hostname)) {
      throw new Error('That URL is not a nexusmods.com URL.');
    }

    const parts = url.pathname.split('/').filter(Boolean);
    const modsIndex = parts.findIndex((p) => p.toLowerCase() === 'mods');
    if (modsIndex < 1 || !parts[modsIndex + 1]) {
      throw new Error('Could not find a Nexus game domain and mod ID in that URL.');
    }

    const game = parts[modsIndex - 1].toLowerCase();
    const modId = positiveInt(parts[modsIndex + 1]);
    if (!modId) throw new Error('Invalid Nexus mod ID.');

    const fileId = positiveInt(url.searchParams.get('file_id'));
    return { game, modId, fileId, key: null, expires: null };
  }

  function baseFor(ref) {
    if (!ref || !ref.game || !positiveInt(ref.modId)) throw new Error('Invalid Nexus reference.');
    return `${API}/games/${encodeURIComponent(ref.game)}/mods/${positiveInt(ref.modId)}`;
  }

  function filesUrl(ref, category) {
    const base = `${baseFor(ref)}/files.json`;
    return category == null ? base : `${base}?category=${encodeURIComponent(category)}`;
  }

  function fileInfoUrl(ref, fileId) {
    const fid = positiveInt(fileId || ref.fileId);
    if (!fid) throw new Error('A file ID is required.');
    return `${baseFor(ref)}/files/${fid}.json`;
  }

  function downloadLinkUrl(ref, fileId) {
    const fid = positiveInt(fileId || ref.fileId);
    if (!fid) throw new Error('A file ID is required.');
    const url = new URL(`${baseFor(ref)}/files/${fid}/download_link.json`);
    if (fid === positiveInt(ref.fileId) && ref.key && ref.expires) {
      url.searchParams.set('key', ref.key);
      url.searchParams.set('expires', ref.expires);
    }
    return url.toString();
  }

  function websiteFileUrl(ref, fileId, useNxm) {
    const fid = positiveInt(fileId || ref.fileId);
    if (!fid) throw new Error('A file ID is required.');
    const url = new URL(`https://www.nexusmods.com/${encodeURIComponent(ref.game)}/mods/${positiveInt(ref.modId)}`);
    url.searchParams.set('tab', 'files');
    url.searchParams.set('file_id', String(fid));
    url.searchParams.set('nmm', useNxm ? '1' : '0');
    return url.toString();
  }

  function normalizeCategory(categoryName, categoryId) {
    const named = String(categoryName || '').trim().toUpperCase().replace(/\s+/g, '_');
    if (named) {
      if (named === 'OLD') return 'OLD_VERSION';
      if (named === 'REMOVED') return 'DELETED';
      return named;
    }
    return CATEGORY_BY_ID[Number(categoryId)] || 'UNKNOWN';
  }

  function normalizeFile(raw) {
    const r = raw || {};
    const fileId = positiveInt(r.file_id ?? r.fileId ?? r.id);
    const categoryId = Number(r.category_id ?? r.categoryId ?? 0) || null;
    const status = normalizeCategory(r.category_name ?? r.categoryName ?? r.category, categoryId);
    const uploadedTimestamp = Number(r.uploaded_timestamp ?? r.uploadedTimestamp ?? r.date ?? 0) || 0;
    return {
      fileId,
      name: String(r.name || r.file_name || r.fileName || (fileId ? `File ${fileId}` : 'Unknown file')),
      fileName: String(r.file_name ?? r.fileName ?? ''),
      version: String(r.version ?? r.mod_version ?? r.modVersion ?? ''),
      description: String(r.description ?? ''),
      categoryId,
      status,
      sizeKb: Number(r.size_kb ?? r.size ?? 0) || 0,
      uploadedTimestamp,
      raw: r,
    };
  }

  function richness(file) {
    return (file.name ? 2 : 0) + (file.fileName ? 3 : 0) + (file.version ? 1 : 0) +
      (file.description ? 1 : 0) + (file.categoryId ? 1 : 0) + (file.uploadedTimestamp ? 1 : 0);
  }

  function mergeFiles(...lists) {
    const map = new Map();
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const f = item && item.raw !== undefined ? item : normalizeFile(item);
        if (!f.fileId) continue;
        const prev = map.get(f.fileId);
        if (!prev) {
          map.set(f.fileId, f);
          continue;
        }
        const preferred = richness(f) >= richness(prev) ? f : prev;
        const other = preferred === f ? prev : f;
        map.set(f.fileId, {
          ...other,
          ...preferred,
          name: preferred.name || other.name,
          fileName: preferred.fileName || other.fileName,
          version: preferred.version || other.version,
          description: preferred.description || other.description,
          status: preferred.status !== 'UNKNOWN' ? preferred.status : other.status,
          categoryId: preferred.categoryId || other.categoryId,
          uploadedTimestamp: Math.max(preferred.uploadedTimestamp || 0, other.uploadedTimestamp || 0),
          raw: preferred.raw || other.raw,
        });
      }
    }
    return Array.from(map.values());
  }

  const STATUS_RANK = {
    ARCHIVED: 0,
    DELETED: 1,
    OLD_VERSION: 2,
    OPTIONAL: 3,
    UPDATE: 4,
    MAIN: 5,
    MISCELLANEOUS: 6,
    UNKNOWN: 7,
  };

  function sortInteresting(files) {
    return (files || []).slice().sort((a, b) => {
      const ra = STATUS_RANK[a.status] ?? 50;
      const rb = STATUS_RANK[b.status] ?? 50;
      if (ra !== rb) return ra - rb;
      return (b.uploadedTimestamp || 0) - (a.uploadedTimestamp || 0) || (b.fileId || 0) - (a.fileId || 0);
    });
  }

  function interestingOnly(files) {
    const wanted = new Set(['ARCHIVED', 'DELETED', 'OLD_VERSION']);
    return sortInteresting((files || []).filter((f) => wanted.has(f.status)));
  }

  function errorMessage(err) {
    const status = Number(err && err.status) || 0;
    const data = err && err.data;
    let message = '';
    if (typeof data === 'string') message = data.trim();
    else if (data && typeof data === 'object') message = String(data.message || data.error || data.detail || '').trim();
    if (!message && err && err.message) message = String(err.message).trim();
    if (!message) message = status ? `Nexus API request failed (HTTP ${status})` : 'Nexus API request failed.';
    if (status && !message.includes(`HTTP ${status}`)) message += ` (HTTP ${status})`;
    return message;
  }

  function formatSize(sizeKb) {
    const bytes = Math.max(0, Number(sizeKb) || 0) * 1024;
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
    return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
  }

  function displayStatus(file, warnings) {
    const status = String(file && file.status || file || 'UNKNOWN').toUpperCase();
    if (status === 'ARCHIVED' || status === 'DELETED' || status === 'OLD_VERSION') return status;
    if (['MAIN', 'UPDATE', 'OPTIONAL', 'MISCELLANEOUS'].includes(status)) return 'AVAILABLE';
    const warningText = (warnings || []).join(' ').toLowerCase();
    if (status === 'UNKNOWN' && /(mod not available|hidden|not found|unavailable)/.test(warningText)) return 'HIDDEN';
    return 'UNKNOWN';
  }

  function formatDate(timestamp) {
    const value = Number(timestamp) || 0;
    if (!value) return '';
    const d = new Date(value * 1000);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  function referenceLabel(ref) {
    if (!ref || !ref.game || !positiveInt(ref.modId)) return '';
    const base = `${String(ref.game).toLowerCase()}:${positiveInt(ref.modId)}`;
    const fid = positiveInt(ref.fileId);
    return fid ? `${base}:${fid}` : base;
  }

  function mergeHistory(entries, entry, limit) {
    const max = Math.max(1, Number(limit) || 12);
    const next = entry && entry.reference ? entry : null;
    const out = [];
    if (next) out.push(next);
    for (const item of Array.isArray(entries) ? entries : []) {
      if (!item || !item.reference) continue;
      if (next && item.reference === next.reference) continue;
      if (out.some((x) => x.reference === item.reference)) continue;
      out.push(item);
      if (out.length >= max) break;
    }
    return out.slice(0, max);
  }

  root.NexusArchiveCore = Object.freeze({
    API,
    CATEGORY_BY_ID,
    parseReference,
    filesUrl,
    fileInfoUrl,
    downloadLinkUrl,
    websiteFileUrl,
    normalizeCategory,
    normalizeFile,
    mergeFiles,
    sortInteresting,
    interestingOnly,
    errorMessage,
    formatSize,
    displayStatus,
    formatDate,
    referenceLabel,
    mergeHistory,
  });
})(globalThis);


(function (root) {
  'use strict';
  const C = root.NexusArchiveCore;
  if (!C) throw new Error('NexusArchiveCore must be loaded before NexusArchiveResolver.');

  function extractFiles(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.files)) return payload.files;
    return [];
  }

  async function safeRequest(request, url, label, warnings, state) {
    try {
      const value = await request(url);
      state.successes += 1;
      return value;
    } catch (err) {
      warnings.push(`${label}: ${C.errorMessage(err)}`);
      return null;
    }
  }

  async function resolveFiles(ref, request) {
    if (typeof request !== 'function') throw new Error('A request adapter is required.');
    const warnings = [];
    const lists = [];
    const state = { successes: 0 };

    if (ref.fileId) {
      const exactRaw = await safeRequest(request, C.fileInfoUrl(ref, ref.fileId), 'Exact file lookup', warnings, state);
      if (exactRaw) lists.push([exactRaw]);
    }

    const allRaw = await safeRequest(request, C.filesUrl(ref), 'File list', warnings, state);
    const allFiles = extractFiles(allRaw);
    if (allFiles.length) lists.push(allFiles);

    if (state.successes === 0 && warnings.length) {
      throw new Error(warnings.join(' · '));
    }

    const files = C.sortInteresting(C.mergeFiles(...lists));
    const exact = ref.fileId ? files.find((f) => f.fileId === ref.fileId) || null : null;
    return {
      ref,
      files,
      exact,
      interesting: C.interestingOnly(files),
      warnings: Array.from(new Set(warnings)),
    };
  }

  async function resolveDownload(ref, fileId, request) {
    const fid = Number(fileId || ref.fileId);
    if (!Number.isInteger(fid) || fid <= 0) throw new Error('A file ID is required for download.');
    const url = C.downloadLinkUrl(ref, fid);
    try {
      const payload = await request(url);
      const links = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.links) ? payload.links : []);
      const safeLinks = links.filter((link) => {
        try {
          const url = new URL(link?.URI || link?.uri || link?.url);
          return url.protocol === 'https:' && !url.username && !url.password;
        } catch { return false; }
      });
      const first = safeLinks[0];
      if (!first) {
        return {
          mode: 'unavailable',
          url: null,
          reason: 'Nexus returned no downloadable CDN link for this file.',
        };
      }
      return {
        mode: 'direct',
        url: first.URI || first.uri || first.url,
        name: first.name || first.short_name || 'Nexus CDN',
        links: safeLinks,
      };
    } catch (err) {
      const status = Number(err && err.status) || 0;
      const reason = C.errorMessage(err);
      if (status === 401 || status === 403) {
        return {
          mode: 'website',
          url: C.websiteFileUrl(ref, fid, false),
          nxmUrl: C.websiteFileUrl(ref, fid, true),
          reason,
        };
      }
      if (status === 404) {
        return {
          mode: 'unavailable',
          url: null,
          reason,
        };
      }
      return {
        mode: 'website',
        url: C.websiteFileUrl(ref, fid, false),
        nxmUrl: C.websiteFileUrl(ref, fid, true),
        reason,
      };
    }
  }

  async function validateUser(request) {
    const raw = await request('https://api.nexusmods.com/v1/users/validate.json');
    return {
      id: Number(raw.user_id ?? raw.userId ?? raw.id) || null,
      name: String(raw.name ?? raw.username ?? ''),
      premium: Boolean(raw.is_premium ?? raw.isPremium ?? raw.premium),
    };
  }

  root.NexusArchiveResolver = Object.freeze({
    extractFiles,
    resolveFiles,
    resolveDownload,
    validateUser,
  });
})(globalThis);


(function () {
  'use strict';
  const C = globalThis.NexusArchiveCore;
  const R = globalThis.NexusArchiveResolver;
  const API_KEY_NAME = 'nexusArchiveHelper.apiKey';

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function apiRequest(url) {
    const target = new URL(url);
    if (target.origin !== 'https://api.nexusmods.com' || !target.pathname.startsWith('/v1/') || target.username || target.password) {
      return Promise.reject(new Error('Refusing to send an API key outside the official Nexus API.'));
    }
    const apiKey = String(GM_getValue(API_KEY_NAME, '') || '').trim();
    if (!apiKey) return Promise.reject({ status: 0, data: { message: 'Add your Nexus Personal API key first.' } });
    return new Promise((resolve, reject) => {
      let request;
      const finish = (callback, value) => { clearTimeout(timer); callback(value); };
      // Tampermonkey redirect controls select fetch transport, where timeout is ignored.
      const timer = setTimeout(() => {
        finish(reject, { status: 0, data: { message: 'Nexus API request timed out.' } });
        request?.abort();
      }, 30000);
      try { request = GM_xmlhttpRequest({
        method: 'GET',
        url,
        redirect: 'error',
        headers: {
          apikey: apiKey,
          Accept: 'application/json',
          'Application-Name': 'Nexus Archive Helper Personal',
          'Application-Version': '1.1.3',
        },
        onload(response) {
          let data = null;
          try { data = response.responseText ? JSON.parse(response.responseText) : null; }
          catch { data = response.responseText || null; }
          if (response.status >= 200 && response.status < 300) finish(resolve, data);
          else finish(reject, { status: response.status, data, message: response.statusText });
        },
        onerror() { finish(reject, { status: 0, data: { message: 'Network error contacting Nexus API.' } }); },
        onabort() { finish(reject, { status: 0, data: { message: 'Nexus API request aborted.' } }); },
      }); } catch (error) { finish(reject, error); }
    });
  }

  const style = document.createElement('style');
  style.textContent = `
#nah-launch{position:fixed;right:18px;bottom:18px;z-index:2147483645;background:#d98f39;color:#111;border:0;border-radius:10px;padding:10px 14px;font:700 13px system-ui;box-shadow:0 8px 28px #0008;cursor:pointer}
#nah-panel{position:fixed;right:18px;bottom:64px;width:min(520px,calc(100vw - 36px));max-height:78vh;overflow:auto;z-index:2147483646;background:#17191d;color:#f5f5f5;border:1px solid #3a3e46;border-radius:14px;box-shadow:0 18px 60px #000c;font:13px/1.45 system-ui;padding:14px}
#nah-panel[hidden]{display:none} #nah-panel *{box-sizing:border-box} #nah-panel h2{font-size:17px;margin:0 0 10px} #nah-panel .nah-row{display:flex;gap:8px;margin:8px 0} #nah-panel input{width:100%;background:#0f1114;color:#fff;border:1px solid #444a55;border-radius:7px;padding:8px} #nah-panel button,#nah-panel a.nah-btn{border:1px solid #555d69;background:#272b31;color:#fff;border-radius:7px;padding:7px 9px;cursor:pointer;text-decoration:none;white-space:nowrap} #nah-panel button.primary{background:#d98f39;color:#111;border-color:#d98f39;font-weight:700} #nah-panel .muted{color:#aab0b8;font-size:12px} #nah-panel .status{padding:7px 9px;background:#101216;border-radius:7px;margin:8px 0;white-space:pre-wrap} #nah-panel .file{border:1px solid #333842;border-radius:9px;padding:9px;margin:8px 0;background:#111318} #nah-panel .tag{display:inline-block;font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;background:#733;color:#ffd8d8;margin-right:5px} #nah-panel .tag.old{background:#54451f;color:#ffe7a3} #nah-panel .tag.main{background:#253b54;color:#d8ebff} #nah-panel .file-title{font-weight:700} #nah-panel .file-meta{color:#aab0b8;font-size:11px;margin:3px 0 7px} #nah-panel .warning{color:#ffd18a;font-size:11px;margin:4px 0}`;
  document.documentElement.appendChild(style);

  const launch = document.createElement('button');
  launch.id = 'nah-launch';
  launch.textContent = '🗃 Archive Helper';
  document.body.appendChild(launch);

  const panel = document.createElement('section');
  panel.id = 'nah-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <h2>Nexus Archive Helper</h2>
    <div class="muted">Official Nexus API/archive resolver. API key stays in Tampermonkey storage.</div>
    <div class="nah-row"><button id="nah-save">Set API key + Test</button></div>
    <div class="muted"><a href="https://www.nexusmods.com/users/myaccount?tab=api%20access" target="_blank" rel="noreferrer" style="color:#e7a85d">Open Nexus API Access</a></div>
    <div class="nah-row"><input id="nah-ref" placeholder="Nexus URL, nxm:// URL, or game:modId:fileId"><button id="nah-find" class="primary">Find files</button></div>
    <div id="nah-status" class="status">Ready.</div>
    <div id="nah-results"></div>`;
  document.body.appendChild(panel);

  const refInput = panel.querySelector('#nah-ref');
  const status = panel.querySelector('#nah-status');
  const results = panel.querySelector('#nah-results');
  refInput.value = location.href;

  launch.addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) refInput.focus(); });

  function setStatus(text) { status.textContent = text; }

  async function configureApiKey() {
    const entered = window.prompt('Nexus Archive Helper: enter your Personal API key. Leave empty to clear it.', '');
    if (entered === null) return;
    const key = entered.trim();
    GM_setValue(API_KEY_NAME, key);
    if (!key) { setStatus('API key cleared.'); return; }
    setStatus('Testing API key…');
    try {
      const user = await R.validateUser(apiRequest);
      setStatus(`API key OK: ${user.name || `user ${user.id}`} • ${user.premium ? 'Premium' : 'Free account'}`);
    } catch (err) { setStatus(C.errorMessage(err)); }
  }
  panel.querySelector('#nah-save').addEventListener('click', (event) => {
    if (event.isTrusted) void configureApiKey();
  });
  GM_registerMenuCommand('Set Nexus Archive Helper API key', configureApiKey);

  async function download(ref, fileId, preferNxm) {
    setStatus(`Resolving download for file ${fileId}…`);
    const out = await R.resolveDownload(ref, fileId, apiRequest);
    if (out.mode === 'direct' && out.url) {
      setStatus(`Direct Nexus CDN link authorized${out.name ? ` (${out.name})` : ''}.`);
      GM_openInTab(out.url, { active: true, setParent: true });
    } else if (out.mode === 'website') {
      const url = preferNxm && out.nxmUrl ? out.nxmUrl : out.url;
      setStatus(`Nexus requires its normal user-bound download flow. Opening exact file page.\n${out.reason || ''}`);
      GM_openInTab(url, { active: true, setParent: true });
    } else {
      setStatus(`Nexus did not expose this file for download.\n${out.reason || ''}`);
    }
  }

  function tagClass(statusName) { return statusName === 'OLD_VERSION' ? 'old' : (['ARCHIVED','DELETED'].includes(statusName) ? '' : 'main'); }

  function render(result, ref) {
    const files = result.interesting.length ? result.interesting : result.files;
    const warningHtml = result.warnings.map(w => `<div class="warning">⚠ ${esc(w)}</div>`).join('');
    if (!files.length) {
      results.innerHTML = `${warningHtml}<div class="file">No files were returned for this reference.</div>`;
      return;
    }
    results.innerHTML = warningHtml + files.map((f) => `
      <div class="file">
        <div><span class="tag ${tagClass(f.status)}">${esc(f.status)}</span><span class="file-title">${esc(f.name)}</span></div>
        <div class="file-meta">File ID ${f.fileId}${f.version ? ` • v${esc(f.version)}` : ''}${f.fileName ? ` • ${esc(f.fileName)}` : ''}${f.sizeKb ? ` • ${esc(C.formatSize(f.sizeKb))}` : ''}</div>
        <div class="nah-row">
          <button data-act="download" data-id="${f.fileId}" class="primary">Download</button>
          <button data-act="vortex" data-id="${f.fileId}">Vortex/NXM</button>
          <button data-act="page" data-id="${f.fileId}">Exact Nexus page</button>
        </div>
      </div>`).join('');

    results.querySelectorAll('[data-act]').forEach((button) => button.addEventListener('click', async () => {
      const id = Number(button.dataset.id);
      const act = button.dataset.act;
      try {
        if (act === 'page') GM_openInTab(C.websiteFileUrl(ref, id, false), { active: true, setParent: true });
        else await download(ref, id, act === 'vortex');
      } catch (err) { setStatus(C.errorMessage(err)); }
    }));
  }

  let resolveRequestId = 0;
  panel.querySelector('#nah-find').addEventListener('click', async () => {
    const requestId = ++resolveRequestId;
    results.innerHTML = '';
    let ref;
    try { ref = C.parseReference(refInput.value); }
    catch (err) { setStatus(err.message); return; }
    setStatus(`Looking up ${ref.game} mod ${ref.modId}${ref.fileId ? `, file ${ref.fileId}` : ''}…`);
    try {
      const result = await R.resolveFiles(ref, apiRequest);
      if (requestId !== resolveRequestId) return;
      setStatus(`Found ${result.files.length} unique file record(s); ${result.interesting.length} archived/deleted/old.` + (result.exact ? ` Exact file ${result.exact.fileId} resolved.` : ''));
      render(result, ref);
    } catch (err) { if (requestId === resolveRequestId) setStatus(C.errorMessage(err)); }
  });
})();

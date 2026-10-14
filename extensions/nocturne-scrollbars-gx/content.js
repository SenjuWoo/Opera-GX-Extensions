(() => {
  'use strict';

  const STYLE_ID = 'nocturne-scrollbars-gx-style';
  const SHADOW_STYLE_ATTR = 'data-nocturne-shadow-style';
  const host = Nocturne.domainFromUrl(location.href);

  let refreshTimer = 0;
  let refreshGeneration = 0;
  let mainStyle = null;
  let deepObserver = null;
  let constructedSheet = null;
  let fallbackShadowStyles = new Set();
  let lastShadowCss = '';
  let deepEnabled = false;
  let deepScanQueued = false;
  let deepScanGeneration = 0;
  const pendingDeepRoots = new Set();
  let observedShadowRoots = new WeakSet();

  function getAmbientColor() {
    const candidates = [];
    if (document.body) {
      candidates.push(getComputedStyle(document.body).backgroundColor);
    }
    if (document.documentElement) {
      candidates.push(getComputedStyle(document.documentElement).backgroundColor);
    }

    for (const value of candidates) {
      if (!value || value === 'transparent' || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(value)) continue;
      return Nocturne.parseCssColor(value, '#ffffff');
    }
    return matchMedia('(prefers-color-scheme: dark)').matches ? '#111217' : '#ffffff';
  }

  function ensureMainStyle() {
    if (mainStyle?.isConnected) return mainStyle;
    mainStyle = document.getElementById(STYLE_ID) || document.createElement('style');
    mainStyle.id = STYLE_ID;
    mainStyle.setAttribute('data-nocturne', '1');
    const parent = document.head || document.documentElement;
    if (parent && !mainStyle.isConnected) parent.appendChild(mainStyle);
    return mainStyle;
  }

  function removeMainStyle() {
    document.getElementById(STYLE_ID)?.remove();
    mainStyle = null;
  }

  function supportsConstructedStylesheets() {
    return typeof CSSStyleSheet === 'function' &&
      typeof CSSStyleSheet.prototype.replaceSync === 'function' &&
      'adoptedStyleSheets' in Document.prototype &&
      typeof ShadowRoot !== 'undefined' &&
      'adoptedStyleSheets' in ShadowRoot.prototype;
  }

  function styleShadowRoot(root) {
    if (!root || root.mode !== 'open') return;
    try {
      if (deepObserver && !observedShadowRoots.has(root)) {
        deepObserver.observe(root, { childList: true, subtree: true });
        observedShadowRoots.add(root);
      }
      if (supportsConstructedStylesheets()) {
        if (!constructedSheet) {
          constructedSheet = new CSSStyleSheet();
          constructedSheet.replaceSync(lastShadowCss);
        }
        if (!root.adoptedStyleSheets.includes(constructedSheet)) {
          root.adoptedStyleSheets = [...root.adoptedStyleSheets, constructedSheet];
        }
      } else {
        let style = root.querySelector(`style[${SHADOW_STYLE_ATTR}]`);
        if (!style) {
          style = document.createElement('style');
          style.setAttribute(SHADOW_STYLE_ATTR, '1');
          root.appendChild(style);
        }
        if (style.textContent !== lastShadowCss) style.textContent = lastShadowCss;
        fallbackShadowStyles.add(style);
      }
    } catch {
      // Closed/protected roots are intentionally skipped.
    }
  }

  function inspectSubtree(root) {
    if (root.shadowRoot) {
      styleShadowRoot(root.shadowRoot);
      inspectSubtree(root.shadowRoot);
    }
    for (const element of root.querySelectorAll?.('*') || []) {
      if (element.shadowRoot) {
        styleShadowRoot(element.shadowRoot);
        inspectSubtree(element.shadowRoot);
      }
    }
  }

  // Scan added subtrees once per idle burst; the initial scan covers the document.
  function queueDeepScan(root = document) {
    if (!deepEnabled) return;
    if (root === document) pendingDeepRoots.clear();
    if (!pendingDeepRoots.has(document)) pendingDeepRoots.add(root);
    if (deepScanQueued) return;
    deepScanQueued = true;
    const generation = deepScanGeneration;
    const run = () => {
      if (generation !== deepScanGeneration) return;
      deepScanQueued = false;
      const roots = [...pendingDeepRoots];
      pendingDeepRoots.clear();
      if (deepEnabled) {
        for (const tree of roots) {
          if (tree === document || tree.isConnected !== false) inspectSubtree(tree);
        }
      }
    };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1200 });
    else setTimeout(run, 120);
  }

  function startDeepCoverage() {
    if (deepObserver) return;
    deepObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) queueDeepScan(node);
        }
      }
    });
    const root = document.documentElement || document;
    deepObserver.observe(root, { childList: true, subtree: true });
    queueDeepScan();
  }

  function stopDeepCoverage() {
    // Must clear the flag first: a scan already queued would otherwise run after
    // the user switched Nocturne off and re-attach styles to every shadow root.
    deepEnabled = false;
    deepScanGeneration++;
    deepScanQueued = false;
    pendingDeepRoots.clear();
    deepObserver?.disconnect();
    deepObserver = null;
    Nocturne.debug('deep shadow coverage stopped');
    observedShadowRoots = new WeakSet();
    if (constructedSheet) {
      // Empty the shared sheet too, so a temporarily detached component is restored.
      constructedSheet.replaceSync('');
      const removeFrom = (tree) => {
        for (const element of tree.querySelectorAll('*')) {
          const root = element.shadowRoot;
          if (!root) continue;
          try {
            root.adoptedStyleSheets = root.adoptedStyleSheets.filter((sheet) => sheet !== constructedSheet);
          } catch { /* ignored */ }
          removeFrom(root);
        }
      };
      removeFrom(document);
    }
    for (const style of fallbackShadowStyles) style.remove();
    fallbackShadowStyles = new Set();
    constructedSheet = null;
  }

  function updateShadowCoverage(settings, ambient) {
    deepEnabled = settings.enabled && settings.deepShadowDom;
    if (!deepEnabled) {
      stopDeepCoverage();
      return;
    }

    lastShadowCss = Nocturne.buildScrollbarCss(settings, ambient, { shadow: true });
    if (constructedSheet) {
      try { constructedSheet.replaceSync(lastShadowCss); } catch { /* ignored */ }
    }
    for (const style of fallbackShadowStyles) {
      if (style.isConnected) style.textContent = lastShadowCss;
      else fallbackShadowStyles.delete(style);
    }
    startDeepCoverage();
  }

  async function refresh() {
    const generation = ++refreshGeneration;
    if (!host) {
      removeMainStyle();
      stopDeepCoverage();
      return;
    }

    try {
      const { global, rules } = await Nocturne.readState();
      if (generation !== refreshGeneration) return;
      const { settings } = Nocturne.effectiveSettings(global, rules, host);
      if (!settings.enabled) {
        removeMainStyle();
        stopDeepCoverage();
        return;
      }

      const ambient = getAmbientColor();
      const style = ensureMainStyle();
      if (!style?.isConnected) {
        addEventListener('DOMContentLoaded', refresh, { once: true });
        return;
      }
      style.textContent = Nocturne.buildScrollbarCss(settings, ambient);
      updateShadowCoverage(settings, ambient);
      Nocturne.debug('scrollbars applied', { enabled: settings.enabled, deepShadowDom: deepEnabled });
    } catch (error) {
      console.warn('Nocturne could not apply settings:', error);
    }
  }

  function scheduleRefresh(delay = 20) {
    refreshGeneration++;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, delay);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[Nocturne.STORAGE_KEYS.GLOBAL] || changes[Nocturne.STORAGE_KEYS.RULES] || changes.debugLog) scheduleRefresh();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'NOCTURNE_REFRESH') {
      scheduleRefresh(0);
      sendResponse?.({ ok: true });
    } else if (message?.type === 'NOCTURNE_PING') {
      sendResponse?.({ ok: true, host });
    }
  });

  addEventListener('pageshow', () => scheduleRefresh(0));
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => scheduleRefresh(0));

  refresh();
  addEventListener('DOMContentLoaded', () => scheduleRefresh(0), { once: true });
})();

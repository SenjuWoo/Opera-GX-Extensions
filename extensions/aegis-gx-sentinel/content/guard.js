(() => {
  if (globalThis.__AEGIS_GX_GUARD__) return;
  globalThis.__AEGIS_GX_GUARD__ = true;

  let config = null;
  let configSignature = null;
  let blocked = 0;
  let reportTimer = null;
  const cosmeticSelectors = [
    "[id^='google_ads_']", "[id^='div-gpt-ad']", "[class*=' ad-slot']", ".ad-slot",
    ".adsbygoogle", "iframe[src*='doubleclick.net']", "iframe[src*='googlesyndication.com']",
    "[data-ad-client]", "[data-ad-slot]", "[aria-label='Advertisement']", "[aria-label='Ads']",
    "[data-ad-rendering-role]", "[data-google-query-id]"
  ];
  const sponsoredSelectors = [
    ".sponsored-container", ".promotedlink", "[data-testid='placementTracking']",
    "[data-testid*='sponsored']", "[class*='sponsored-post']",
    "[class*='promoted-content']", "[id*='sponsored-content']"
  ];
  const overlayWords = /(?:disable\s+your\s+adblock|turn\s+off\s+adblock|adblocker\s+detected|subscribe\s+to\s+continue)/i;

  function normalizedHost() {
    return location.hostname.toLowerCase();
  }

  function domainMatches(host, domain) {
    return host === domain || host.endsWith(`.${domain}`);
  }

  function adblockAllowedHere() {
    const host = normalizedHost();
    return (config?.adblock?.allowlist || []).some(domain => domainMatches(host, String(domain).toLowerCase()));
  }

  function youtubeControlledSeparately() {
    const host = normalizedHost();
    return domainMatches(host, "youtube.com") || domainMatches(host, "youtube-nocookie.com");
  }

  function adCosmeticsEnabled() {
    if (!config?.adblock?.enabled || !config.adblock.cosmeticFiltering || adblockAllowedHere()) return false;
    if (youtubeControlledSeparately()) {
      return Boolean(
        config.adblock.youtube?.enabled
        && config.adblock.youtube?.mode !== "network"
        && config.adblock.youtube?.hidePromotions
      );
    }
    return true;
  }

  function scheduleReport() {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(() => chrome.runtime.sendMessage({ type: "CONTENT_STATS", blocked }).catch(() => {}), 250);
  }

  function matchingElements(root, selector) {
    const elements = Array.from(root.querySelectorAll?.(selector) || []);
    if (root.matches?.(selector)) elements.unshift(root);
    return elements;
  }

  function protectLinks(root = document) {
    for (const anchor of matchingElements(root, "a[ping], a[target='_blank']")) {
      if (anchor.hasAttribute("ping")) anchor.removeAttribute("ping");
      if (anchor.target === "_blank") {
        const rel = new Set((anchor.rel || "").split(/\s+/).filter(Boolean));
        rel.add("noopener");
        rel.add("noreferrer");
        anchor.rel = Array.from(rel).join(" ");
      }
    }
  }


  function removePageSpeculation(root = document) {
    if (!config?.enabled || !config?.privacy?.disablePageSpeculation) return;
    const speculative = matchingElements(root, "link[rel~='dns-prefetch'], link[rel~='preconnect'], link[rel~='prefetch'], link[rel~='prerender']");
    for (const link of speculative) {
      link.remove();
      blocked += 1;
    }
    if (speculative.length) scheduleReport();
  }

  function injectCosmeticStyle() {
    let style = document.getElementById("aegis-cosmetic-style");
    if (!adCosmeticsEnabled()) {
      style?.remove();
      return;
    }
    const selectors = config.adblock.sponsoredCleanup ? [...cosmeticSelectors, ...sponsoredSelectors] : cosmeticSelectors;
    const css = `${selectors.join(",")} { display: none !important; visibility: hidden !important; }`;
    if (!style) {
      style = document.createElement("style");
      style.id = "aegis-cosmetic-style";
      style.textContent = css;
      (document.documentElement || document).appendChild(style);
    } else if (style.textContent !== css) style.textContent = css;
  }

  function removeAnnoyances(root = document) {
    if (!config?.adblock?.enabled || !config.adblock.antiAdblockCleanup || adblockAllowedHere()) return;
    const candidates = matchingElements(root, "dialog, [role='dialog'], [class*='modal'], [class*='overlay'], [id*='modal'], [id*='overlay']");
    for (const element of candidates) {
      if (!(element instanceof HTMLElement)) continue;
      const text = (element.innerText || "").slice(0, 1000);
      if (!overlayWords.test(text)) continue;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if ((style.position === "fixed" || style.position === "sticky") && rect.width > innerWidth * 0.45 && rect.height > innerHeight * 0.25) {
        element.remove();
        document.documentElement.style.overflow = "auto";
        document.body && (document.body.style.overflow = "auto");
        blocked += 1;
        scheduleReport();
      }
    }
  }

  function httpWarningsEnabled() {
    if (!config?.enabled || location.protocol === "https:") return false;
    const host = normalizedHost();
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost")) return false;
    return !(config.allowlist || []).some(d => domainMatches(host, String(d).toLowerCase()));
  }

  function inspectForms(root = document) {
    if (!httpWarningsEnabled()) return;
    const password = matchingElements(root, "input[type='password']")[0];
    if (!password || document.getElementById("aegis-http-warning")) return;
    const banner = document.createElement("div");
    banner.id = "aegis-http-warning";
    banner.setAttribute("role", "alert");
    banner.style.cssText = "position:fixed;inset:0 0 auto 0;z-index:2147483647;background:#7f1d1d;color:white;padding:12px 16px;font:600 14px system-ui;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.35)";
    banner.textContent = "Aegis GX: This page requests a password over an unencrypted HTTP connection. Do not enter credentials.";
    (document.documentElement || document).appendChild(banner);
  }

  function process(root = document) {
    if (config?.enabled) {
      protectLinks(root);
      removePageSpeculation(root);
      inspectForms(root);
    }
    if (config?.adblock?.enabled) {
      removeAnnoyances(root);
    }
  }

  const observer = new MutationObserver(records => {
    injectCosmeticStyle();
    const roots = new Set();
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && node.isConnected) roots.add(node);
      }
    }
    for (const root of roots) {
      let parent = root.parentElement;
      while (parent && !roots.has(parent)) parent = parent.parentElement;
      if (!parent) process(root);
    }
  });

  function applyConfig(next) {
    const signature = JSON.stringify([
      next?.enabled, next?.allowlist, next?.privacy?.disablePageSpeculation,
      next?.adblock?.enabled, next?.adblock?.cosmeticFiltering, next?.adblock?.allowlist,
      next?.adblock?.sponsoredCleanup, next?.adblock?.antiAdblockCleanup,
      next?.adblock?.youtube?.enabled, next?.adblock?.youtube?.mode, next?.adblock?.youtube?.hidePromotions
    ]);
    config = next;
    if (signature === configSignature) return;
    configSignature = signature;
    observer.disconnect();
    injectCosmeticStyle();
    if (!httpWarningsEnabled()) document.getElementById("aegis-http-warning")?.remove();
    if (!config?.enabled && !config?.adblock?.enabled) {
      clearTimeout(reportTimer);
      return;
    }
    process(document);
    observer.observe(document, { subtree: true, childList: true });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.config) applyConfig(changes.config.newValue);
  });
  chrome.runtime.sendMessage({ type: "GET_STATE" }).then(response => {
    if (!config) applyConfig(response?.config);
  }).catch(() => {});
  document.addEventListener("DOMContentLoaded", () => process(document), { once: true });
  window.addEventListener("aegis-popup-blocked", () => {
    if (!config?.enabled) return;
    blocked += 1;
    scheduleReport();
  });
})();

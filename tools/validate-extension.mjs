import fs from 'node:fs';
import path from 'node:path';

export function validateExtension(folder) {
  const root = path.resolve(folder);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.manifest_version !== 3 || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(manifest.version)) throw new Error('Invalid MV3 manifest/version');
  const checked = new Set();
  const iconFiles = icons => typeof icons === 'string' ? [icons] : Object.values(icons || {});
  function check(relative) {
    if (!relative || checked.has(relative)) return;
    checked.add(relative);
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(root + path.sep) || !fs.statSync(absolute).isFile()) throw new Error(`Invalid payload reference: ${relative}`);
    if (!fs.realpathSync(absolute).startsWith(fs.realpathSync(root) + path.sep)) throw new Error(`Payload reference escapes its folder: ${relative}`);
    if (relative.endsWith('.html')) {
      const html = fs.readFileSync(absolute, 'utf8');
      for (const [, ref] of html.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/gi)) {
        if (!/^(?:https?:|data:|#)/i.test(ref)) check(path.join(path.dirname(relative), ref.split(/[?#]/)[0]));
      }
    }
  }
  for (const ref of [manifest.background?.service_worker, manifest.action?.default_popup, manifest.options_page, manifest.options_ui?.page,
    ...iconFiles(manifest.icons), ...iconFiles(manifest.action?.default_icon),
    ...Object.values(manifest.chrome_url_overrides || {}), manifest.side_panel?.default_path,
    ...(manifest.content_scripts || []).flatMap(script => [...(script.js || []), ...(script.css || [])]),
    ...(manifest.declarative_net_request?.rule_resources || []).map(rule => rule.path),
    ...(manifest.web_accessible_resources || []).flatMap(group => group.resources || []).filter(ref => !ref.includes('*'))]) check(ref);
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || /^(?:node_modules|tests|tools|\.git)$/.test(entry.name) || /\.(?:pem|key|p12|pfx)$/i.test(entry.name)) throw new Error(`Development/private material in payload: ${entry.name}`);
      if (entry.isDirectory()) scan(path.join(dir, entry.name));
    }
  }
  scan(root);
  return `${manifest.name} ${manifest.version}: ${checked.size} payload references verified`;
}

if (process.argv[2]) console.log(validateExtension(process.argv[2]));

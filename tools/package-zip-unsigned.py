"""Package one extension's unpacked-install .zip without signing.

Mirrors the staging in tools/build.ps1 (copy, strip development items,
validate-extension.mjs, fixed 2000-01-01 timestamps) and writes forward-slash
entry names. The pinned manifest "key" is carried unchanged, so the extension ID
does not change. Use it when the private signing keys are unavailable; see
DECISIONS.md. Run it from a checkout made with core.autocrlf=false: the shipped
payloads use LF line endings.

    python -I tools/package-zip-unsigned.py <repo-root> <extension-folder> <out.zip>
    e.g. python -I tools/package-zip-unsigned.py . nexus-research Release/nexus-v1.0.4.zip
"""
import json
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

DEV_ITEMS = ['.git', '_metadata', 'tests', 'tools', 'node_modules', 'package.json', 'package-lock.json', 'QA_REPORT.md']
# Same stored DOS time as the existing release zips (build.ps1 sets 2000-01-01 UTC).
STAMP = (1999, 12, 31, 20, 0, 0)

repo, ext, out = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
src = repo / 'extensions' / ext
manifest = json.loads((src / 'manifest.json').read_text(encoding='utf-8'))
if not manifest.get('key'):
    sys.exit(f'No pinned identity in {ext}; refusing to build an unpinned package.')

with tempfile.TemporaryDirectory(prefix='gx-zip-') as tmp:
    stage = Path(tmp) / 'stage'
    shutil.copytree(src, stage)
    for item in DEV_ITEMS:
        p = stage / item
        if p.is_dir():
            shutil.rmtree(p)
        elif p.exists():
            p.unlink()
    subprocess.run(['node', str(repo / 'tools' / 'validate-extension.mjs'), str(stage)], check=True)
    files = sorted((p for p in stage.rglob('*') if p.is_file()),
                   key=lambda p: (len(p.relative_to(stage).parts) == 1, str(p.relative_to(stage)).lower()))
    staged = Path(tmp) / 'out.zip'
    with zipfile.ZipFile(staged, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in files:
            info = zipfile.ZipInfo(f.relative_to(stage).as_posix(), STAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, f.read_bytes())
    shutil.move(staged, out)
print(f"OK {ext} v{manifest['version']} -> {out}")

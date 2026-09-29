"""Package the reviewable source and production demo using only Python stdlib."""
from hashlib import sha256
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / '.delivery'
FILES = [
    '.gitattributes', '.gitignore', 'README.md', 'index.html', 'package.json',
    'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'vite.config.ts',
    'docs/MOBILE_DESIGN.md', 'docs/GITHUB_DELIVERY.md', 'docs/github-pages-workflow.yml',
    'docs/mobile-screenshots/updated-route.png',
    'docs/mobile-screenshots/updated-settings.png',
    'docs/mobile-screenshots/senior-390-ride.png',
]
DIRECTORIES = ['public', 'src', 'tests', 'scripts', 'design']
EXCLUDED_PARTS = {'__pycache__', '.DS_Store', 'Thumbs.db', 'vector-qa-ride.png'}


def package(name, files, base):
    files = sorted(files, key=lambda file: file.relative_to(base).as_posix())
    manifest = []
    with ZipFile(OUTPUT / name, 'w', compression=ZIP_DEFLATED) as archive:
        for file in files:
            relative = file.relative_to(base).as_posix()
            data = file.read_bytes()
            archive.writestr(relative, data)
            manifest.append({'path': relative, 'bytes': len(data), 'sha256': sha256(data).hexdigest()})
    return {'archive': name, 'files': manifest, 'bytes': sum(item['bytes'] for item in manifest)}


if not (ROOT / 'dist/index.html').is_file():
    raise SystemExit('Build the demo first: pnpm build')

OUTPUT.mkdir(exist_ok=True)
source = {ROOT / file for file in FILES}
for directory in DIRECTORIES:
    source.update(file for file in (ROOT / directory).rglob('*')
                  if file.is_file() and not EXCLUDED_PARTS.intersection(file.parts))
missing = [file.relative_to(ROOT).as_posix() for file in source if not file.is_file()]
if missing:
    raise SystemExit(f'Missing source files: {missing}')
demo = [file for file in (ROOT / 'dist').rglob('*') if file.is_file()]
manifest = {
    'source': package('baixi-yuji-source.zip', source, ROOT),
    'demo': package('baixi-yuji-demo.zip', demo, ROOT / 'dist'),
}
if (ROOT / 'design/manifest.json').is_file():
    design = [file for file in (ROOT / 'design').rglob('*')
              if file.is_file() and not EXCLUDED_PARTS.intersection(file.parts)]
    design.extend(file for file in (ROOT / 'public/fonts').iterdir() if file.is_file())
    design.append(ROOT / 'scripts/export-design.mjs')
    manifest['design'] = package('baixi-yuji-design.zip', design, ROOT)
(OUTPUT / 'delivery-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
for item in manifest.values():
    print(f"{item['archive']}: {len(item['files'])} files, {item['bytes']} uncompressed bytes")

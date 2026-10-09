"""Archive committed source and its locally verified static build for a versioned release."""
from hashlib import sha256
import json
from pathlib import Path
import subprocess
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
build_version = json.loads((root / 'dist/version.json').read_text(encoding='utf-8'))['version']
if build_version != version:
    raise SystemExit('Build version differs. Run pnpm build before packaging.')
if subprocess.check_output(['git', 'diff', 'HEAD', '--name-only'], cwd=root).strip():
    raise SystemExit('Commit the reviewed changes before packaging the source archive.')
output = root / '.delivery' / f'v{version}'
output.mkdir(parents=True, exist_ok=True)
source = output / f'xiangxu-v{version}-source.zip'
demo = output / f'xiangxu-v{version}-demo.zip'
subprocess.run(['git', 'archive', '--format=zip', f'--output={source}', 'HEAD'], cwd=root, check=True)
with ZipFile(demo, 'w', compression=ZIP_DEFLATED) as archive:
    for file in sorted((root / 'dist').rglob('*')):
        if file.is_file():
            archive.write(file, file.relative_to(root / 'dist').as_posix())
checksums = ''.join(f'{sha256(file.read_bytes()).hexdigest()}  {file.name}\n' for file in [source, demo])
(output / 'SHA256SUMS.txt').write_text(checksums, encoding='utf-8')
for file in [source, demo]:
    print(f'{file.name}: {file.stat().st_size} bytes')

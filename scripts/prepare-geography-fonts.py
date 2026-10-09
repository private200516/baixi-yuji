"""Build independent local subsets; preserve the previous release font files."""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
root = Path(__file__).resolve().parents[1]
text = ''.join(p.read_text(encoding='utf-8') for folder in ['src/geography', 'src/data'] for p in (root / folder).glob('*') if p.suffix in ['.tsx', '.ts', '.css'])
text += ''.join(chr(i) for i in range(32,127)) + '宁海慢行地图古村＋−↑小中大'
for source, target in [('NotoSansSC-VF.ttf','ninghai-sans.woff2'),('LXGWWenKai-Regular.ttf','ninghai-kai.woff2')]:
    font=TTFont(root/'references'/source)
    options=subset.Options(); options.flavor='woff2'; options.name_IDs=['*']; options.name_languages=['*']
    worker=subset.Subsetter(options=options); worker.populate(text=text); worker.subset(font)
    font.flavor='woff2'; font.save(root/'public/fonts'/target)
    print(target, (root/'public/fonts'/target).stat().st_size)

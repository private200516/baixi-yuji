"""Supply missing brand/map glyphs without replacing any original UI glyph."""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
text = '乡序' + ''.join((root / name).read_text(encoding='utf-8') for name in [
    'src/data/villages.ts', 'src/geography/GeographyMap.tsx',
    'src/geography/map-depth.ts', 'src/mobile/GeographicTownMap.tsx', 'src/mobile/TownScene.tsx',
])
rules = ['/* Same original typefaces. Supplement only brand/map glyphs absent from the original subsets. */']
for source, original, target, family, weight in [
    ('NotoSansSC-VF.ttf', 'baixi-sans.woff2', 'xiangxu-sans.woff2', 'Baixi Sans', '100 900'),
    ('LXGWWenKai-Regular.ttf', 'baixi-kai.woff2', 'xiangxu-kai.woff2', 'Baixi Kai', '400'),
]:
    font = TTFont(root / 'references' / source)
    covered = set(TTFont(root / 'public/fonts' / original).getBestCmap())
    missing = sorted(set(map(ord, text)) - covered)
    missing = [codepoint for codepoint in missing if codepoint in font.getBestCmap()]
    options = subset.Options()
    options.flavor = 'woff2'
    worker = subset.Subsetter(options=options)
    worker.populate(unicodes=missing)
    worker.subset(font)
    font.flavor = 'woff2'
    font.save(root / 'public/fonts' / target)
    ranges = ','.join(f'U+{codepoint:X}' for codepoint in missing)
    rules.append(f"@font-face{{font-family:'{family}';src:url('/fonts/{target}') format('woff2');font-weight:{weight};font-display:swap;unicode-range:{ranges}}}")
    print(target, len(missing), 'additional glyphs')
(root / 'src/mobile/brand-fonts.css').write_text('\n'.join(rules) + '\n', encoding='utf-8')

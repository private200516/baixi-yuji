"""Create local web-font subsets and a non-valid demonstration QR asset.

Run with fonttools, brotli and qrcode available (see docs/MOBILE_DESIGN.md).
The original font binaries remain in references; license texts ship in public/fonts.
"""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
import qrcode
import qrcode.image.svg

ROOT = Path(__file__).resolve().parents[1]
text = ''.join(p.read_text(encoding='utf-8') for p in (ROOT / 'src/mobile').glob('*.tsx'))
text += ''.join(chr(i) for i in range(32, 127)) + '白溪輿記白溪舆记山水之间自在出行把山水装进行程一方水土一程风景沿溪而行从容抵达，。·—→'
for source, target in [('NotoSansSC-VF.ttf', 'baixi-sans.woff2'), ('LXGWWenKai-Regular.ttf', 'baixi-kai.woff2')]:
    font = TTFont(ROOT / 'references' / source)
    options = subset.Options()
    options.flavor = 'woff2'
    options.name_IDs = ['*']
    options.name_legacy = True
    options.name_languages = ['*']
    worker = subset.Subsetter(options=options)
    worker.populate(text=text)
    worker.subset(font)
    font.flavor = 'woff2'
    font.save(ROOT / 'public/fonts' / target)
    print(target, (ROOT / 'public/fonts' / target).stat().st_size)

asset_dir = ROOT / 'public/art'
asset_dir.mkdir(exist_ok=True)
qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=6, border=2)
qr.add_data('BAIXI YUJI / UI DEMO ONLY / NOT A TRANSIT TICKET')
qr.make(fit=True)
qr.make_image(image_factory=qrcode.image.svg.SvgPathImage).save(asset_dir / 'demo-qr.svg')
svg = (asset_dir / 'demo-qr.svg').read_text()
svg = svg.replace('#000000', '#303735')
(asset_dir / 'demo-qr.svg').write_text(svg)
print('demo-qr.svg generated')

import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Reproducible, editable design handoff. The application remains the layout source.
const baseURL = (process.env.PREVIEW_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const output = path.resolve('design');
const width = 390, height = 844;
const definitions = [
  ...['ride', 'return', 'scan', 'route', 'ticket', 'town', 'help', 'delay'].map(screen => ({ id: `regular-${screen}`, screen, size: 'M', senior: false })),
  ...['ride', 'scan', 'return', 'help'].map(screen => ({ id: `senior-${screen}`, screen, size: 'L', senior: true })),
  { id: 'regular-settings', screen: 'ride', size: 'M', senior: false, sheet: 'settings' },
  { id: 'typography-small', screen: 'ride', size: 'S', senior: false },
  { id: 'typography-large', screen: 'ride', size: 'L', senior: false },
];
for (const directory of ['svg', 'previews']) await mkdir(path.join(output, directory), { recursive: true });
const fonts = [
  ['Baixi Sans', 'baixi-sans.woff2', '100 900'],
  ['Baixi Kai', 'baixi-kai.woff2', '400'],
];
const fontCSS = (await Promise.all(fonts.map(async ([family, filename, weight]) => `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${(await readFile(`public/fonts/${filename}`)).toString('base64')})}`))).join('\n');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const errors = [];
const artboards = [];
try {
  for (const definition of definitions) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'zh-CN', reducedMotion: 'reduce', deviceScaleFactor: 1 });
    await context.addInitScript(prefs => localStorage.setItem('baixi.mobile.v2', JSON.stringify(prefs)), { size: definition.size, regularSize: 'M', senior: definition.senior, favorite: false, savedReturn: null, quiet: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${definition.id}: ${error.message}`));
    await page.goto(`${baseURL}/#/${definition.screen}`);
    await page.evaluate(async () => {
      await Promise.all([document.fonts.load('400 16px "Baixi Sans"'), document.fonts.load('900 16px "Baixi Sans"'), document.fonts.load('400 16px "Baixi Kai"')]);
      await document.fonts.ready;
    });
    await page.locator(definition.senior ? '.senior-main' : '.groove-outline').waitFor();
    if (definition.sheet) await page.locator('.app-settings').click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // Capture the resting design, rather than a transient keyboard/programmatic focus ring.
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    const snapshot = await page.evaluate(async () => {
      const nodes = [], fragments = [], defs = [];
      let serial = 0;
      const number = value => Math.round(value * 1000) / 1000;
      const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
      const visibleColor = color => color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)' && !/^rgba\([^)]*, 0\)$/.test(color);
      const rect = value => ({ x: number(value.x), y: number(value.y), width: number(value.width), height: number(value.height) });
      const rectPath = (box, corners) => {
        const { x, y, width: w, height: h } = box;
        const [tl, tr, br, bl] = corners.map(value => Math.min(parseFloat(value) || 0, w / 2, h / 2));
        return `M${x + tl} ${y}H${x + w - tr}Q${x + w} ${y} ${x + w} ${y + tr}V${y + h - br}Q${x + w} ${y + h} ${x + w - br} ${y + h}H${x + bl}Q${x} ${y + h} ${x} ${y + h - bl}V${y + tl}Q${x} ${y} ${x + tl} ${y}Z`;
      };
      const corners = style => ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map(key => style[key]);
      function drawBox(box, style, name, opacity = 1) {
        const radii = corners(style);
        const fill = style.backgroundColor;
        const borders = ['Top', 'Right', 'Bottom', 'Left'].map(side => ({ width: parseFloat(style[`border${side}Width`]) || 0, color: style[`border${side}Color`], style: style[`border${side}Style`] }));
        if (!visibleColor(fill) && !borders.some(border => border.width > 0 && visibleColor(border.color))) return;
        const node = { id: `n${++serial}`, type: 'box', name, ...box, fill, radii: radii.map(value => parseFloat(value) || 0), borders, opacity };
        nodes.push(node);
        const d = rectPath(box, radii);
        if (visibleColor(fill)) fragments.push(`<path data-name="${escape(name)}" d="${d}" fill="${escape(fill)}"/>`);
        const same = borders.every(border => border.width === borders[0].width && border.color === borders[0].color);
        if (same && borders[0].width > 0) {
          const border = borders[0], inset = border.width / 2;
          const inside = { x: box.x + inset, y: box.y + inset, width: box.width - border.width, height: box.height - border.width };
          fragments.push(`<path d="${rectPath(inside, radii.map(value => Math.max(0, parseFloat(value) - inset)))}" fill="none" stroke="${escape(border.color)}" stroke-width="${border.width}"${border.style === 'dashed' ? ' stroke-dasharray="4 3"' : ''}/>`);
        } else {
          const b = box;
          const lines = [[b.x, b.y, b.x + b.width, b.y], [b.x + b.width, b.y, b.x + b.width, b.y + b.height], [b.x, b.y + b.height, b.x + b.width, b.y + b.height], [b.x, b.y, b.x, b.y + b.height]];
          borders.forEach((border, index) => { if (border.width && visibleColor(border.color)) fragments.push(`<path d="M${lines[index][0]} ${lines[index][1]}L${lines[index][2]} ${lines[index][3]}" stroke="${escape(border.color)}" stroke-width="${border.width}" fill="none"/>`); });
        }
      }
      function pseudo(element, which) {
        const style = getComputedStyle(element, which);
        if (style.display === 'none' || style.content === 'none' || style.content === 'normal' || Number(style.opacity) === 0) return;
        // Texture/filter pseudo-elements are intentionally omitted; explicit decorative shapes remain vectors.
        if (style.backgroundImage !== 'none' || style.position !== 'absolute') return;
        const parent = element.getBoundingClientRect();
        const resolve = (value, extent) => value.endsWith('%') ? parseFloat(value) / 100 * extent : parseFloat(value);
        const left = resolve(style.left, parent.width), right = resolve(style.right, parent.width), top = resolve(style.top, parent.height), bottom = resolve(style.bottom, parent.height);
        let w = resolve(style.width, parent.width), h = resolve(style.height, parent.height);
        if (!Number.isFinite(w)) w = parent.width - (left || 0) - (right || 0);
        if (!Number.isFinite(h)) h = parent.height - (top || 0) - (bottom || 0);
        let x = Number.isFinite(left) ? parent.x + left : Number.isFinite(right) ? parent.right - right - w : parent.x + (parent.width - w) / 2;
        let y = Number.isFinite(top) ? parent.y + top : Number.isFinite(bottom) ? parent.bottom - bottom - h : parent.y + (parent.height - h) / 2;
        if (style.transform !== 'none') { const matrix = new DOMMatrix(style.transform); x += matrix.e; y += matrix.f; }
        fragments.push(`<g opacity="${style.opacity}">`);
        drawBox({ x: number(x), y: number(y), width: number(w), height: number(h) }, style, `${element.className}${which}`, Number(style.opacity));
        fragments.push('</g>');
      }
      function textNode(node, inheritedOpacity) {
        if (!node.textContent.trim()) return;
        const element = node.parentElement, style = getComputedStyle(element);
        const range = document.createRange();
        range.selectNodeContents(node);
        const box = range.getBoundingClientRect();
        if (!box.width || !box.height) return;
        const fontSize = parseFloat(style.fontSize), lineHeight = parseFloat(style.lineHeight) || fontSize * 1.2;
        const canvas = document.createElement('canvas').getContext('2d');
        canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const metrics = canvas.measureText('国Ag');
        const ascent = metrics.fontBoundingBoxAscent || fontSize * .88;
        const segments = Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(node.textContent));
        const letters = segments.map(({ segment, index }) => {
          range.setStart(node, index); range.setEnd(node, index + segment.length);
          const r = range.getBoundingClientRect();
          return { text: segment, ...rect(r), baseline: number(r.y + ascent) };
        }).filter(letter => letter.width && letter.height);
        if (!letters.length) return;
        const text = letters.map(letter => letter.text).join('');
        const designNode = { id: `n${++serial}`, type: 'text', name: text.trim(), text, ...rect(box), fontFamily: style.fontFamily.includes('Baixi Kai') ? 'LXGW WenKai' : 'Noto Sans SC', cssFontFamily: style.fontFamily, fontSize, fontWeight: Number(style.fontWeight), lineHeight, letterSpacing: parseFloat(style.letterSpacing) || 0, fill: style.color, opacity: inheritedOpacity, writingMode: style.writingMode, letters };
        nodes.push(designNode);
        const attrs = `font-family="${escape(style.fontFamily)}" font-size="${fontSize}" font-weight="${style.fontWeight}" fill="${escape(style.color)}"`;
        if (style.writingMode.startsWith('vertical')) {
          fragments.push(`<text data-name="${escape(text)}" ${attrs} style="writing-mode:vertical-rl;text-orientation:mixed" x="${number(box.x + box.width / 2)}" y="${number(box.y)}" dominant-baseline="central" letter-spacing="${designNode.letterSpacing}">${escape(text)}</text>`);
        } else {
          const lines = [];
          for (const letter of letters) { let line = lines.at(-1); if (!line || Math.abs(line.y - letter.baseline) > .5) lines.push(line = { y: letter.baseline, letters: [] }); line.letters.push(letter); }
          fragments.push(`<text data-name="${escape(text)}" ${attrs}>${lines.map(line => `<tspan x="${line.letters.map(letter => letter.x).join(' ')}" y="${line.y}">${escape(line.letters.map(letter => letter.text).join(''))}</tspan>`).join('')}</text>`);
        }
      }
      const svgProperties = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'text-anchor', 'dominant-baseline', 'visibility', 'display', 'transform', 'transform-origin'];
      function inlineSVG(element) {
        const copy = element.cloneNode(true);
        const originals = [element, ...element.querySelectorAll('*')], clones = [copy, ...copy.querySelectorAll('*')];
        originals.forEach((original, index) => {
          const computed = getComputedStyle(original), clone = clones[index];
          clone.removeAttribute('class'); clone.removeAttribute('style');
          svgProperties.forEach(property => {
            let value = computed.getPropertyValue(property);
            if (property === 'transform' && value === 'none') { clone.removeAttribute('transform'); return; }
            if (property === 'font-family') value = value.replace(/Baixi Sans/g, 'Baixi Sans').replace(/Baixi Kai/g, 'Baixi Kai');
            if (value && value !== 'normal') clone.style.setProperty(property, value);
          });
          if (original.hasAttribute('transform')) clone.removeAttribute('transform');
          // Computed opacity belongs to outer grouping for the root SVG.
          if (index === 0) { clone.style.removeProperty('opacity'); clone.style.removeProperty('transform'); }
        });
        copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        return copy;
      }
      async function walk(element, inheritedOpacity = 1) {
        const style = getComputedStyle(element), bounds = element.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || !Number(style.opacity) || !bounds.width || !bounds.height || bounds.bottom < 0 || bounds.top > innerHeight || bounds.right < 0 || bounds.left > innerWidth) return;
        const box = rect(bounds), opacity = Number(style.opacity), effectiveOpacity = inheritedOpacity * opacity;
        const name = element.getAttribute('aria-label') || (typeof element.className === 'string' ? element.className : element.tagName.toLowerCase()) || element.tagName.toLowerCase();
        fragments.push(`<g data-name="${escape(name)}"${opacity !== 1 ? ` opacity="${opacity}"` : ''}>`);
        drawBox(box, style, name, effectiveOpacity);
        const clips = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX) && !['body', 'html'].includes(element.tagName.toLowerCase());
        if (clips) { const id = `clip${++serial}`; defs.push(`<clipPath id="${id}"><path d="${rectPath(box, corners(style))}"/></clipPath>`); fragments.push(`<g clip-path="url(#${id})">`); }
        pseudo(element, '::before');
        if (element instanceof SVGSVGElement) {
          const copy = inlineSVG(element);
          const paddingLeft = parseFloat(style.paddingLeft), paddingRight = parseFloat(style.paddingRight), paddingTop = parseFloat(style.paddingTop), paddingBottom = parseFloat(style.paddingBottom);
          const inner = { x: box.x + paddingLeft, y: box.y + paddingTop, width: box.width - paddingLeft - paddingRight, height: box.height - paddingTop - paddingBottom };
          copy.setAttribute('x', inner.x); copy.setAttribute('y', inner.y); copy.setAttribute('width', inner.width); copy.setAttribute('height', inner.height);
          copy.style.overflow = style.overflow;
          const svg = new XMLSerializer().serializeToString(copy);
          nodes.push({ id: `n${++serial}`, type: 'svg', name, ...inner, opacity: effectiveOpacity, svg });
          fragments.push(svg);
        } else if (element instanceof HTMLImageElement) {
          const source = await fetch(element.currentSrc).then(response => response.text());
          if (source.trim().startsWith('<svg') || source.includes('<svg')) {
            const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
            svg.setAttribute('x', box.x); svg.setAttribute('y', box.y); svg.setAttribute('width', box.width); svg.setAttribute('height', box.height);
            const data = new XMLSerializer().serializeToString(svg);
            nodes.push({ id: `n${++serial}`, type: 'svg', name: element.alt || 'vector image', ...box, opacity: effectiveOpacity, svg: data });
            fragments.push(data);
          }
        } else if (element instanceof HTMLInputElement && element.type === 'checkbox') {
          const fill = element.checked ? '#345c58' : '#f4f1e7';
          fragments.push(`<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="3" fill="${fill}" stroke="#345c58"/>`);
          if (element.checked) fragments.push(`<path d="M${box.x+4} ${box.y+box.height/2}l${box.width*.22} ${box.height*.22}l${box.width*.43} ${-box.height*.46}" fill="none" stroke="#f4f1e7" stroke-width="2.5"/>`);
        } else {
          const children = [...element.childNodes].filter(child => !(child instanceof HTMLDialogElement));
          const z = child => child instanceof Element ? parseInt(getComputedStyle(child).zIndex) || 0 : 0;
          children.sort((a, b) => z(a) - z(b));
          for (const child of children) {
            if (child.nodeType === Node.TEXT_NODE) textNode(child, effectiveOpacity);
            else if (child instanceof HTMLElement || child instanceof SVGSVGElement) await walk(child, effectiveOpacity);
          }
        }
        pseudo(element, '::after');
        if (clips) fragments.push('</g>');
        fragments.push('</g>');
      }
      await walk(document.querySelector('.phone'));
      const dialog = document.querySelector('dialog[open]');
      if (dialog) {
        const backdrop = getComputedStyle(dialog, '::backdrop');
        nodes.push({ id: `n${++serial}`, type: 'box', name: 'Dialog backdrop', x: 0, y: 0, width: innerWidth, height: innerHeight, fill: backdrop.backgroundColor, radii: [0,0,0,0], borders: [], opacity: 1 });
        fragments.push(`<rect width="${innerWidth}" height="${innerHeight}" fill="${backdrop.backgroundColor}"/>`);
        await walk(dialog);
      }
      return { width: innerWidth, height: innerHeight, background: '#f4f1e7', nodes, fragments: fragments.join('\n'), defs: defs.join('\n'), overflow: { documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight }, fontLoaded: document.fonts.check('16px "Baixi Sans"') && document.fonts.check('16px "Baixi Kai"') };
    });
    await page.screenshot({ path: path.join(output, 'previews', `${definition.id}.png`) });
    const title = `${definition.id} / 白溪舆记`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${title}</title><desc>Editable text and vector snapshot. Generated from the application at 390 × 844; use the React source for live behavior.</desc><defs><style><![CDATA[${fontCSS}]]></style>${snapshot.defs}</defs><rect width="${width}" height="${height}" fill="${snapshot.background}"/>${snapshot.fragments}</svg>`;
    await writeFile(path.join(output, 'svg', `${definition.id}.svg`), svg);
    const { fragments, defs, ...data } = snapshot;
    artboards.push({ ...definition, ...data, svgFile: `svg/${definition.id}.svg`, previewFile: `previews/${definition.id}.png` });
    console.log(`${definition.id}: ${snapshot.nodes.length} editable vector/text nodes`);
    await context.close();
  }
} finally { await browser.close(); }
const manifest = {
  schemaVersion: 1,
  title: '白溪舆记 / BAIXI YUJI',
  viewport: { width, height },
  fonts: [{ family: 'Noto Sans SC', source: '../public/fonts/baixi-sans.woff2', license: '../public/fonts/OFL-NotoSansSC.txt' }, { family: 'LXGW WenKai', source: '../public/fonts/baixi-kai.woff2', license: '../public/fonts/OFL-LXGWWenKai.txt' }],
  colors: { paper: '#f4f1e7', ink: '#303735', teal: '#507673', action: '#345c58', terracotta: '#a4714f' },
  notes: ['SVG exports preserve vector shapes and live text; they are not .fig files.', 'PNG previews are direct browser captures; SVGs are editable visual references and may differ in font rendering, CSS paint order, shadows, blur, texture, and pseudo-element details.', 'Snapshots are deterministic: reduced motion, no saved trip, standard direction, first station, 17:30 return, first landmark.', 'QR artwork is a non-functional demonstration code.'],
  artboards: artboards.map(({ nodes, ...artboard }) => ({ ...artboard, nodeCount: nodes.length, editableTextCount: nodes.filter(node => node.type === 'text').length })),
  errors,
};
await writeFile(path.join(output, 'snapshots.json'), JSON.stringify({ schemaVersion: 1, artboards }, null, 2));
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
if (errors.length) throw new Error(errors.join('\n'));
console.log(`Exported ${artboards.length} artboards into design/.`);

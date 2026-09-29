"""Build compact Figma Plugin API payloads from the browser design snapshots.

Requires fontTools and brotli. Original TTF files in references/ are preferred;
the published WOFF2 subsets in public/fonts/ are a complete fallback. This does
not contact Figma: a separate authorized caller runs the resulting JS payloads.
"""
from pathlib import Path
import argparse
import json
import re
import xml.etree.ElementTree as ET
from html import escape
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--variable-map', type=Path, help='Optional JSON mapping of color hex values to existing Figma variable IDs. Default: create/reuse local variables dynamically.')
parser.add_argument('--prefer-subsets', action='store_true', help='Use repository WOFF2 subsets even when original TTF files are present.')
args = parser.parse_args()
explicit_variable_map = json.loads(args.variable_map.read_text(encoding='utf-8')) if args.variable_map else None
if explicit_variable_map is not None and (not isinstance(explicit_variable_map, dict) or any(not re.fullmatch(r'#[0-9a-fA-F]{6}', key) or not isinstance(value, str) for key, value in explicit_variable_map.items())):
    raise ValueError('--variable-map must be a JSON object mapping #RRGGBB strings to variable ID strings')
OUTPUT = ROOT / '.delivery' / 'figma'
OUTPUT.mkdir(parents=True, exist_ok=True)
SNAPSHOTS = json.loads((ROOT / 'design' / 'snapshots.json').read_text(encoding='utf-8'))
def font_source(original, subset):
    full = ROOT / 'references' / original
    return full if full.exists() and not args.prefer_subsets else ROOT / 'public' / 'fonts' / subset
FONTS = {
    'Noto Sans SC': TTFont(font_source('NotoSansSC-VF.ttf', 'baixi-sans.woff2')),
    'LXGW WenKai': TTFont(font_source('LXGWWenKai-Regular.ttf', 'baixi-kai.woff2')),
}
STYLE_WEIGHTS = [(100, 'Thin'), (300, 'Light'), (350, 'DemiLight'), (400, 'Regular'), (500, 'Medium'), (700, 'Bold'), (900, 'Black')]
GLYPHSETS = {}
ET.register_namespace('', 'http://www.w3.org/2000/svg')
SVG = '{http://www.w3.org/2000/svg}'

def rounded(value):
    return round(float(value), 4)

def style_for(weight):
    return min(STYLE_WEIGHTS, key=lambda item: (abs(item[0] - weight), -item[0]))

def glyphset(family, weight=400):
    key = (family, weight)
    if key not in GLYPHSETS:
        font = FONTS[family]
        GLYPHSETS[key] = font.getGlyphSet(location={'wght': weight}) if 'fvar' in font else font.getGlyphSet()
    return GLYPHSETS[key]

def glyph_path(family, character, weight, transform):
    font = FONTS[family]
    name = font.getBestCmap().get(ord(character))
    if not name:
        if character.isspace():
            return ''
        raise ValueError(f'Missing original-font glyph: {family}: {character}')
    glyphs = glyphset(family, weight)
    pen = SVGPathPen(glyphs)
    glyphs[name].draw(TransformPen(pen, transform))
    return re.sub(r'-?\d+\.\d+', lambda match: f'{float(match.group()):.3f}'.rstrip('0').rstrip('.'), pen.getCommands())

def outline_node(node):
    family = node['fontFamily']
    font = FONTS[family]
    weight = node['fontWeight']
    scale = node['fontSize'] / font['head'].unitsPerEm
    paths = []
    for letter in node['letters']:
        # UI strings contain individual graphemes without combining marks.
        for character in letter['text']:
            if character.isspace():
                continue
            x, y = letter['x'] - node['x'], letter['y'] - node['y']
            if node['writingMode'].startswith('vertical'):
                if ord(character) > 255:
                    name = font.getBestCmap()[ord(character)]
                    advance = glyphset(family, weight)[name].width
                    glyf = font['glyf'][name]
                    vertical_origin = glyf.yMax + font['vmtx'][name][1]
                    transform = (scale, 0, 0, -scale, x + (letter['width'] - advance * scale) / 2, y + vertical_origin * scale)
                else:
                    ascent = letter['baseline'] - letter['y']
                    transform = (0, scale, scale, 0, x + letter['width'] - ascent, y)
            else:
                transform = (scale, 0, 0, -scale, x, letter['baseline'] - node['y'])
            d = glyph_path(family, character, weight, transform)
            if d:
                paths.append(f'<path data-character="{escape(character, quote=True)}" d="{d}"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{node["width"]}" height="{node["height"]}" viewBox="0 0 {node["width"]} {node["height"]}"><g fill="{node["fill"]}">{"".join(paths)}</g></svg>'

def css(style):
    return {pair.split(':', 1)[0].strip(): pair.split(':', 1)[1].strip() for pair in style.split(';') if ':' in pair}

def number(value, default=0):
    found = re.search(r'-?[\d.]+', str(value or ''))
    return float(found.group()) if found else default

def svg_outline_text(element, style):
    family = 'LXGW WenKai' if 'Kai' in style.get('font-family', '') else 'Noto Sans SC'
    text = ''.join(element.itertext())
    size = number(style.get('font-size'), 10)
    weight = number(style.get('font-weight'), 400)
    scale = size / FONTS[family]['head'].unitsPerEm
    glyphs = glyphset(family, weight)
    cmap = FONTS[family].getBestCmap()
    spacing = number(style.get('letter-spacing'))
    widths = [(glyphs[cmap[ord(character)]].width * scale if ord(character) in cmap else 0) + spacing for character in text]
    x, y = number(element.get('x')), number(element.get('y'))
    anchor = style.get('text-anchor', element.get('text-anchor', 'start'))
    if anchor == 'middle':
        x -= sum(widths) / 2
    elif anchor == 'end':
        x -= sum(widths)
    group = ET.Element(SVG + 'g')
    for key in ['fill', 'fill-opacity', 'opacity', 'transform']:
        if key in element.attrib:
            group.set(key, element.attrib[key])
    group.set('data-original-text', text)
    for character, advance in zip(text, widths):
        if not character.isspace():
            d = glyph_path(family, character, weight, (scale, 0, 0, -scale, x, y))
            if d:
                path = ET.SubElement(group, SVG + 'path')
                path.set('d', d)
        x += advance
    return group

def compact_svg(source):
    root = ET.fromstring(source)
    root.attrib.pop('x', None)
    root.attrib.pop('y', None)
    keep_styles = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'clip-rule']
    def visit(element):
        style = css(element.attrib.pop('style', ''))
        for attribute in ['class', 'aria-hidden', 'aria-label', 'focusable']:
            element.attrib.pop(attribute, None)
        for key in keep_styles:
            if key not in style:
                continue
            value = style[key]
            if key in ['stroke-width', 'stroke-dashoffset']:
                value = re.sub('px$', '', value)
            if key == 'stroke-dasharray' and value == 'none':
                element.attrib.pop(key, None)
            else:
                element.set(key, value)
        transform = style.get('transform', '')
        if transform and transform != 'none':
            # CSS matrices in the snapshots already include source SVG transforms.
            element.set('transform', transform.replace('px', ''))
        for child in list(element):
            child_style = css(child.get('style', ''))
            if child_style.get('display') == 'none' or child_style.get('visibility') == 'hidden':
                element.remove(child)
                continue
            visit(child)
        if element.tag == SVG + 'text':
            return svg_outline_text(element, style)
        return element
    def transform_tree(element):
        for index, child in enumerate(list(element)):
            original_style = css(child.get('style', ''))
            if child.tag == SVG + 'text':
                visit(child)
                replacement = svg_outline_text(child, original_style)
                element.remove(child)
                element.insert(index, replacement)
            else:
                transform_tree(child)
    # Outline text before removing computed font properties.
    transform_tree(root)
    visit(root)
    def prune(element, inherited):
        inherited = dict(inherited)
        for key in keep_styles:
            if key not in element.attrib:
                continue
            if element.attrib[key] == inherited.get(key):
                element.attrib.pop(key)
            else:
                inherited[key] = element.attrib[key]
        for child in element:
            prune(child, inherited)
    prune(root, {})
    return ET.tostring(root, encoding='unicode', short_empty_elements=True)

def native_lines(node):
    lines = []
    for letter in node['letters']:
        if not lines or abs(lines[-1]['baseline'] - letter['baseline']) > .5:
            lines.append({'baseline': letter['baseline'], 'x': letter['x'], 'y': letter['y'], 'height': letter['height'], 'width': 0, 'text': ''})
        line = lines[-1]
        line['text'] += letter['text']
        line['width'] = letter['x'] + letter['width'] - line['x']
    return [{key: rounded(value) if isinstance(value, (float, int)) else value for key, value in line.items()} for line in lines]

HELPER = r'''
function parseColor(value) {
  if (!value || value === 'none' || value === 'transparent') return null;
  if (value[0] === '#') { const hex=value.slice(1); const h=hex.length===3?hex.split('').map(c=>c+c).join(''):hex; return {r:parseInt(h.slice(0,2),16)/255,g:parseInt(h.slice(2,4),16)/255,b:parseInt(h.slice(4,6),16)/255,a:h.length===8?parseInt(h.slice(6,8),16)/255:1}; }
  const n=value.match(/[\d.]+/g)?.map(Number); return n?.length>=3?{r:n[0]/255,g:n[1]/255,b:n[2]/255,a:n.length>3?n[3]:1}:null;
}
const explicitSemanticIds=__VARIABLE_MAP__;
const semanticNames={'#f4f1e7':'Surface/Paper','#303735':'Text/Ink','#507673':'Brand/Teal','#345c58':'Action/Deep Teal','#a4714f':'Brand/Terracotta','#75796e':'Text/Muted','#985f3e':'Action/Senior Terracotta','#f1c98c':'Accent/Selected'};
const semanticCss={'#f4f1e7':'--paper','#303735':'--ink','#507673':'--teal','#345c58':'--teal-dark','#a4714f':'--clay','#75796e':'--muted','#985f3e':'--senior-clay','#f1c98c':'--selected-accent'};
const semanticVariables={};
const colorWarnings=[];
let colorsPrepared=false;
async function prepareSemanticVariables(){
  if(colorsPrepared)return;
  if(explicitSemanticIds){await Promise.all(Object.entries(explicitSemanticIds).map(async([hex,id])=>{const variable=await figma.variables.getVariableByIdAsync(id);if(!variable)throw new Error('Missing mapped color variable: '+id);semanticVariables[hex.toLowerCase()]=variable;}));colorsPrepared=true;return;}
  try{
    const collections=await figma.variables.getLocalVariableCollectionsAsync();
    const collection=collections.find(c=>c.name==='白溪舆记 / 本地设计颜色')||figma.variables.createVariableCollection('白溪舆记 / 本地设计颜色');
    const existing=await figma.variables.getLocalVariablesAsync('COLOR');
    for(const[hex,name]of Object.entries(semanticNames)){
      const rgb=parseColor(hex);const expected={r:rgb.r,g:rgb.g,b:rgb.b,a:1};
      let variable=existing.find(v=>{const value=v.valuesByMode[collection.defaultModeId];return v.variableCollectionId===collection.id&&v.resolvedType==='COLOR'&&v.name===name&&value&&typeof value==='object'&&'r'in value&&colorKey(value)===hex&&(!('a'in value)||value.a===1);});
      if(!variable){variable=figma.variables.createVariable(name,collection,'COLOR');variable.scopes=['ALL_FILLS','STROKE_COLOR'];variable.setVariableCodeSyntax('WEB','var('+semanticCss[hex]+')');variable.setValueForMode(collection.defaultModeId,expected);}
      semanticVariables[hex]=variable;
    }
  }catch(error){colorWarnings.push('部分颜色变量不可用，保留相同的固定色值：'+String(error));}
  colorsPrepared=true;
}
function colorKey(color){return '#'+[color.r,color.g,color.b].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');}
function bindPaint(solid){const variable=semanticVariables[colorKey(solid.color)];return variable?{...figma.variables.setBoundVariableForPaint(solid,'color',variable),opacity:solid.opacity??1}:solid;}
function paint(value) { const c=parseColor(value); return c&&c.a>0?[bindPaint({type:'SOLID',color:{r:c.r,g:c.g,b:c.b},opacity:c.a})]:[]; }
function bindImportedColors(root){const nodes=[root,...('findAll' in root?root.findAll(()=>true):[])];for(const node of nodes){for(const field of ['fills','strokes']){if(field in node&&Array.isArray(node[field]))node[field]=node[field].map(p=>p.type==='SOLID'?bindPaint(p):p);}}}
async function buildNative(board,parent) {
  await prepareSemanticVariables();
  const styles=[...new Set(board.nodes.filter(n=>n.type==='text').map(n=>n.fontStyle))];
  await Promise.all(styles.map(style=>figma.loadFontAsync({family:'Noto Sans SC',style})));
  let frame;
  if(board.existingFrameId){
    frame=await figma.getNodeByIdAsync(board.existingFrameId);
    if(!frame||frame.type!=='FRAME')throw new Error('Existing artboard frame not found: '+board.existingFrameId);
  }else{
    frame=figma.createFrame();frame.name=board.name;frame.resize(board.width,board.height);frame.fills=paint(board.background);frame.clipsContent=true;
    parent.appendChild(frame);frame.x=board.position?.x||0;frame.y=board.position?.y||0;
  }
  const previousNodeIds=new Set(frame.findAll(()=>true).map(node=>node.id));
  const created=[]; const failures=[]; const sourceMap=[]; const weightMapping=[];
  for (const item of board.nodes) {
    try {
      if(item.type==='text') {
        const holder=item.lines.length>1?figma.createFrame():null;
        const sourceNodeIds=[];
        if(holder){holder.name=item.name;holder.fills=[];holder.resize(Math.max(.01,item.width),Math.max(.01,item.height));holder.clipsContent=false;frame.appendChild(holder);holder.x=item.x;holder.y=item.y;sourceNodeIds.push(holder.id);}
        for(const line of item.lines){
          const text=figma.createText(); text.name=line.text.trim()||item.name;
          text.fontName={family:'Noto Sans SC',style:item.fontStyle}; text.fontSize=item.fontSize; text.lineHeight={unit:'PIXELS',value:item.lineHeight}; text.letterSpacing={unit:'PIXELS',value:item.letterSpacing}; text.characters=line.text; text.fills=paint(item.fill); text.opacity=item.opacity; text.textAutoResize='WIDTH_AND_HEIGHT';
          const y=line.y+(line.height-item.lineHeight)/2;
          (holder||frame).appendChild(text);text.x=line.x-(holder?item.x:0);text.y=y-(holder?item.y:0);created.push({sourceId:item.id,nodeId:text.id,type:'TEXT'});sourceNodeIds.push(text.id);
        }
        sourceMap.push({sourceId:item.id,nodeIds:sourceNodeIds,type:'text',text:item.sourceText});weightMapping.push({sourceId:item.id,nodeIds:sourceNodeIds,family:'Noto Sans SC',sourceWeight:item.fontWeight,figmaStyle:item.fontStyle});
        continue;
      }
      let node;
      if(item.type==='svg'){
        node=figma.createNodeFromSvg(item.svg);node.name=item.name;node.resize(Math.max(.01,item.width),Math.max(.01,item.height));bindImportedColors(node);
      } else if(item.type==='box'){
        node=figma.createRectangle();node.name=item.name;node.resize(Math.max(.01,item.width),Math.max(.01,item.height));node.fills=paint(item.fill);
        const radii=(item.radii||[0,0,0,0]).map(r=>Math.max(0,Math.min(r,item.width/2,item.height/2)));[node.topLeftRadius,node.topRightRadius,node.bottomRightRadius,node.bottomLeftRadius]=radii;
        const b=item.borders||[];const visible=b.find(border=>border.width>0&&paint(border.color).length);
        if(visible){node.strokes=paint(visible.color);node.strokeAlign='INSIDE';node.strokeWeight=visible.width;[node.strokeTopWeight,node.strokeRightWeight,node.strokeBottomWeight,node.strokeLeftWeight]=b.map(border=>border.width);if(visible.style==='dashed')node.dashPattern=[4,3];}else node.strokes=[];
      } else continue;
      frame.appendChild(node);node.x=item.x;node.y=item.y;node.opacity=item.opacity??1;created.push({sourceId:item.id,nodeId:node.id,type:node.type});sourceMap.push({sourceId:item.id,nodeIds:[node.id,...('findAll' in node?node.findAll(()=>true).map(n=>n.id):[])],type:item.type,text:item.sourceText||null,fontFamily:item.fontFamily||null});
    }catch(error){failures.push({sourceId:item.id,name:item.name,message:String(error)});}
  }
  const descendants=frame.findAll(()=>true).map(node=>node.id);
  const allNodeIds=[frame.id,...descendants];
  const createdNodeIds=[...(board.existingFrameId?[]:[frame.id]),...descendants.filter(id=>!previousNodeIds.has(id))];
  return {artboardId:board.id,nodeId:frame.id,createdNodeIds,allNodeIds,created,sourceMap,weightMapping,failures,fontNotes:'Main copy is native Noto Sans SC, mapped to nearest available static weight. Exact LXGW WenKai wordmarks and vertical labels are editable source-font vector outlines.'};
}
'''.strip().replace('__VARIABLE_MAP__', json.dumps(explicit_variable_map, ensure_ascii=False, separators=(',', ':')))

PAGE_NAMES = {'ride': '找站候车', 'return': '安心返程', 'scan': '扫码乘车', 'route': '线路详情', 'ticket': '电子车票', 'town': '古镇导览', 'help': '帮助中心', 'delay': '出行提醒'}
boards = []
for index, original in enumerate(SNAPSHOTS['artboards']):
    board = {key: original[key] for key in ['id', 'screen', 'size', 'senior', 'width', 'height', 'background']}
    board['name'] = ('老年人模式 / ' if original['senior'] else '') + PAGE_NAMES[original['screen']]
    if original['id'] == 'regular-settings':
        board['name'] = '设置 / 字号与老年人模式'
    elif original['id'].startswith('typography-'):
        board['name'] = '字号对比 / ' + ('小' if original['size'] == 'S' else '大')
    board['position'] = {'x': (index % 5) * 450, 'y': (index // 5) * 930}
    board['nodes'] = []
    for source in original['nodes']:
        item = dict(source)
        if source['type'] == 'text':
            item['sourceText'] = source['text']
            if source['fontFamily'] == 'LXGW WenKai' or source['writingMode'].startswith('vertical'):
                item['type'] = 'svg'
                item['svg'] = outline_node(source)
                item['name'] = source['name'] + ' / 原字体矢量'
            else:
                item['fontStyleWeight'], item['fontStyle'] = style_for(source['fontWeight'])
                item['lines'] = native_lines(source)
            for key in ['letters', 'text', 'cssFontFamily', 'writingMode']:
                item.pop(key, None)
        elif source['type'] == 'svg':
            item['svg'] = compact_svg(source['svg'])
        board['nodes'].append(item)
    boards.append(board)
    call = f'\nconst board={json.dumps(board,ensure_ascii=False,separators=(",",":"))};\nreturn await buildNative(board,figma.currentPage);\n'
    (OUTPUT / f'{board["id"]}.js').write_text(HELPER + call, encoding='utf-8')
(OUTPUT / 'helper.js').write_text(HELPER, encoding='utf-8')
(OUTPUT / 'boards.json').write_text(json.dumps(boards, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
chunked_boards = []
def json_chars(value):
    return len(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-16-le')) // 2
for board in boards:
    metadata = {key: value for key, value in board.items() if key != 'nodes'}
    chunks = []
    pending = []
    def chunk_payload(nodes):
        # Reserve space for a later real Figma ID in continuation calls.
        return {**metadata, 'existingFrameId': '0000000000:0000000000', 'nodes': nodes}
    for node in board['nodes']:
        if json_chars(chunk_payload([node])) > 35000:
            raise ValueError(f'Single node exceeds chunk budget: {board["id"]}/{node["id"]}')
        if pending and json_chars(chunk_payload([*pending, node])) > 35000:
            chunks.append({'index': len(chunks), 'nodeCount': len(pending), 'jsonChars': json_chars(chunk_payload(pending)), 'nodes': pending})
            pending = []
        pending.append(node)
    if pending:
        chunks.append({'index': len(chunks), 'nodeCount': len(pending), 'jsonChars': json_chars(chunk_payload(pending)), 'nodes': pending})
    chunked_boards.append({**metadata, 'chunks': chunks})
(OUTPUT / 'chunks.json').write_text(json.dumps(chunked_boards, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
manifest = {'artboards': [{'id': board['id'], 'payload': board['id']+'.js', 'bytes': (OUTPUT / (board['id']+'.js')).stat().st_size, 'nativeTextCount': sum(len(n['lines']) for n in board['nodes'] if n['type']=='text'), 'vectorCount': sum(n['type']=='svg' for n in board['nodes'])} for board in boards], 'chunksFile': 'chunks.json', 'helperFile': 'helper.js', 'chunkCount': sum(len(b['chunks']) for b in chunked_boards), 'maxChunkJsonChars': 35000, 'fontWeightMapping': STYLE_WEIGHTS, 'notes': ['Main copy is native text. Exact WenKai and vertical labels are original-font editable vector paths.', 'Inside source SVGs, labels are original-font outlines to prevent SVG importer font substitution.', 'For use_figma code limits, combine helper.js with one chunks.json node batch; full per-board scripts are reference payloads and can exceed the tool limit.', 'Pass board.existingFrameId after the first chunk. The helper appends in original order without repositioning, resizing or reparenting the existing frame.', 'The helper returns createdNodeIds for the current chunk, allNodeIds for the entire frame, and sourceMap/weightMapping for this chunk.', 'Known semantic colors bind to the supplied Figma variable IDs, including imported SVG fills and strokes. Unknown derived paints remain raw for later audit.', 'Rectangles and text preserve source coordinates; root may group or componentize regions afterward.']}
(OUTPUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'artboards':len(boards),'totalBytes':sum(p.stat().st_size for p in OUTPUT.glob('*.js')),'payloads':manifest['artboards']}, ensure_ascii=False, indent=2))

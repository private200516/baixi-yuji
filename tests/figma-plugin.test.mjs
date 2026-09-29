import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const code = await readFile(new URL('../design/figma-plugin/code.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../design/figma-plugin/manifest.json', import.meta.url), 'utf8'));

// A bounded structural model of the standard Plugin API. It deliberately has no
// MCP helpers. This exercises import orchestration and preservation guarantees;
// it cannot validate Figma's renderer, font metrics or actual desktop behavior.
function model({ fonts = true, failSvgAt = 0 } = {}) {
  let serial = 0, svgCalls = 0;
  const registry = new Map(), protectedIds = new Set(), closeMessages = [], collections = [], variables = [], loadedFonts = new Set();
  const create = (type, parent) => {
    const node = { id: `test:${++serial}`, type, name: type, children: [], fills: [], strokes: [], x: 0, y: 0, width: 100, height: 100, opacity: 1,
      resize(width, height) { this.width = width; this.height = height; },
      resizeWithoutConstraints(width, height) { this.resize(width, height); },
      appendChild(child) { this.insertChild(this.children.length, child); },
      insertChild(index, child) { if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child); this.children.splice(index, 0, child); child.parent = this; },
      findAll(predicate) { return this.children.flatMap(child => [...(predicate(child) ? [child] : []), ...child.findAll(predicate)]); },
      remove() { assert.ok(!protectedIds.has(this.id), `Pre-existing node removed: ${this.id}`); if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); this.removed = true; },
      clone() { const copy = create(this.type); for (const [key, value] of Object.entries(this)) if (typeof value !== 'function' && !['id', 'children', 'parent', 'removed'].includes(key)) copy[key] = JSON.parse(JSON.stringify(value)); for (const child of this.children) copy.appendChild(child.clone()); if (this.parent) this.parent.appendChild(copy); return copy; },
      createInstance() { assert.equal(this.type, 'COMPONENT'); const instance = this.clone(); instance.type = 'INSTANCE'; instance.mainComponent = this; return instance; },
    };
    registry.set(node.id, node);
    if (parent) parent.appendChild(node);
    return node;
  };
  const page = create('PAGE');
  const sentinel = create('FRAME', page);
  sentinel.name = 'Existing user design'; sentinel.x = 72; sentinel.y = 108; sentinel.width = 320; sentinel.height = 480;
  protectedIds.add(sentinel.id);
  const figma = {
    currentPage: page, viewport: { scrollAndZoomIntoView() {} },
    async listAvailableFontsAsync() { return fonts ? ['Regular', 'Medium', 'Bold', 'Black', 'Light', 'DemiLight', 'Thin'].map(style => ({ fontName: { family: 'Noto Sans SC', style } })) : []; },
    async loadFontAsync(font) { assert.equal(font.family, 'Noto Sans SC'); loadedFonts.add(font.style); },
    async getNodeByIdAsync(id) { return registry.get(id) || null; },
    createFrame: () => create('FRAME', page), createSection: () => create('SECTION', page), createRectangle: () => create('RECTANGLE', page), createComponent: () => create('COMPONENT', page),
    createText: () => { assert.ok(loadedFonts.size, 'Text created before fonts loaded'); return create('TEXT', page); },
    createNodeFromSvg(svg) { svgCalls++; if (svgCalls === failSvgAt) throw new Error('Injected SVG import failure'); assert.match(svg, /<svg\b/); const frame = create('FRAME', page); create('VECTOR', frame); return frame; },
    combineAsVariants(components, parent) { assert.ok(components.every(item => item.type === 'COMPONENT')); assert.equal(new Set(components.map(item => item.name)).size, components.length, 'Duplicate component variant names'); const set = create('COMPONENT_SET', parent); for (const item of components) set.appendChild(item); return set; },
    notify() {}, closePlugin(message) { closeMessages.push(message); },
    variables: {
      async getLocalVariableCollectionsAsync() { return collections; }, async getLocalVariablesAsync() { return variables; },
      async getVariableByIdAsync(id) { return variables.find(variable => variable.id === id) || null; },
      createVariableCollection(name) { const collection = { id: `collection:${collections.length}`, name, defaultModeId: 'mode:default' }; collections.push(collection); return collection; },
      createVariable(name, collection, resolvedType) { assert.equal(typeof collection, 'object', 'Use the dynamic-page collection overload'); const variable = { id: `variable:${variables.length}`, name, resolvedType, variableCollectionId: collection.id, valuesByMode: {}, setValueForMode(mode, value) { this.valuesByMode[mode] = value; }, setVariableCodeSyntax(platform, syntax) { assert.equal(platform, 'WEB'); this.codeSyntax = syntax; } }; variables.push(variable); return variable; },
      // Exercise the observed risk: an API can reset opacity while binding a color.
      setBoundVariableForPaint(paint, field, variable) { assert.equal(field, 'color'); return { ...paint, opacity: 1, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: variable.id } } }; },
    },
  };
  const sentinelState = () => JSON.stringify({ name: sentinel.name, x: sentinel.x, y: sentinel.y, width: sentinel.width, height: sentinel.height, parent: sentinel.parent?.id, removed: sentinel.removed || false });
  const execute = async () => await vm.runInNewContext(code, { figma, console: { log() {}, error() {} }, Date, Set, Map, Promise }, { timeout: 30000 });
  return { figma, execute, registry, page, sentinel, sentinelState, protectedIds, collections, variables, closeMessages };
}

test('manifest is an offline desktop Design plugin using the standard API', () => {
  assert.deepEqual(manifest.editorType, ['figma']);
  assert.equal(manifest.documentAccess, 'dynamic-page');
  assert.deepEqual(manifest.networkAccess.allowedDomains, ['none']);
  assert.ok(!/figma\.(?:createAutoLayout|query|set)\s*\(|setPluginData\s*\(|fetch\s*\(|https?:\/\//.test(code.replaceAll('http://www.w3.org/2000/svg', '')), 'Runtime has no unsupported MCP methods, private storage, or external network URLs');
  new vm.Script(code);
});

test('complete import builds 15 artboards, 22 variants and 38 instances; preserves existing work and alpha', async () => {
  const state = model();
  const before = state.sentinelState();
  const report = await state.execute();
  assert.equal(report.boardCount, 15);
  assert.equal(report.sectionIds.length, 3);
  assert.equal(report.componentSetIds.length, 5);
  assert.equal(report.componentIds.length, 22);
  assert.equal(report.instanceIds.length, 38);
  assert.equal(report.failures.length, 0);
  assert.equal(report.warnings.length, 0);
  assert.equal(state.sentinelState(), before);
  assert.equal(state.variables.length, 8);
  assert.ok(state.variables.every(variable => JSON.stringify(variable.scopes) === JSON.stringify(['ALL_FILLS', 'STROKE_COLOR']) && variable.codeSyntax.startsWith('var(--')));
  assert.ok([...state.registry.values()].some(node => node.strokes?.some(paint => Math.abs(paint.opacity - .14) < .0001)), 'A 14% alpha divider stays translucent after color binding');
  assert.ok(report.boardIds.every(id => { const frame = state.registry.get(id); return frame.width === 390 && frame.height === 844; }));
  assert.ok(report.createdNodeIds.every(id => !state.registry.get(id).removed), 'Report only includes surviving created nodes');
  const previousSections = report.sectionIds.map(id => state.registry.get(id));
  const priorPositions = previousSections.map(node => [node.id, node.x, node.y]);
  for (const node of state.page.findAll(() => true)) state.protectedIds.add(node.id);
  const second = await state.execute();
  assert.equal(second.boardCount, 15);
  assert.equal(second.componentIds.length, 22);
  assert.ok(second.sectionIds.every(id => !report.sectionIds.includes(id)));
  assert.equal(state.variables.length, 8, 'Matching color variables are reused');
  assert.deepEqual(previousSections.map(node => [node.id, node.x, node.y]), priorPositions);
  assert.equal(state.sentinelState(), before);
});

test('missing fonts stops before any canvas node or color variable changes', async () => {
  const state = model({ fonts: false });
  const ids = [...state.registry.keys()];
  const before = state.sentinelState();
  const report = await state.execute();
  assert.equal(report.failed, true);
  assert.match(report.error, /Noto Sans SC/);
  assert.deepEqual([...state.registry.keys()], ids);
  assert.equal(state.variables.length, 0);
  assert.equal(state.collections.length, 0);
  assert.equal(state.sentinelState(), before);
});

test('an SVG API failure is reported and pre-existing content is retained', async () => {
  const state = model({ failSvgAt: 1 });
  const before = state.sentinelState();
  const report = await state.execute();
  assert.equal(report.boardCount, 15);
  assert.equal(report.failures.length, 1);
  assert.match(report.failures[0].message, /Injected SVG import failure/);
  assert.equal(state.sentinelState(), before);
  assert.ok(report.warnings.length > 0);
});

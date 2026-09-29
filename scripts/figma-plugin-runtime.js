/* Runtime appended to the generated design data and standard Plugin API helper. */
function weightOfStyle(style) {
  const value = style.replace(/[\s_-]/g, '').toLowerCase();
  const weights = { thin: 100, extralight: 200, ultralight: 200, light: 300, demilight: 350, regular: 400, normal: 400, medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900 };
  return weights[value] || Number(value.match(/[1-9]00/)?.[0]) || 400;
}

async function prepareFonts(boards) {
  const available = (await figma.listAvailableFontsAsync()).map(font => font.fontName).filter(font => font.family === 'Noto Sans SC' && !/italic/i.test(font.style));
  if (!available.length) throw new Error('未找到 Noto Sans SC 字体。请安装该字体、重启 Figma 桌面客户端，再运行插件。本次没有修改画布。');
  const choose = weight => [...available].sort((a, b) => Math.abs(weightOfStyle(a.style) - weight) - Math.abs(weightOfStyle(b.style) - weight) || weightOfStyle(b.style) - weightOfStyle(a.style))[0];
  const requested = new Map();
  for (const board of boards) for (const node of board.nodes) if (node.type === 'text') { node.fontStyle = choose(node.fontWeight).style; requested.set(node.fontStyle, { family: 'Noto Sans SC', style: node.fontStyle }); }
  for (const weight of [400, 700, 900]) requested.set(choose(weight).style, choose(weight));
  await Promise.all([...requested.values()].map(font => figma.loadFontAsync(font)));
  return choose;
}

function regionFor(boardId, selector, index = 0) {
  const region = REGIONS.find(board => board.id === boardId)?.regions.find(item => item.selector === selector && item.index === index);
  if (!region) throw new Error(`缺少组件区域：${boardId} ${selector} ${index}`);
  return region;
}

function selectedNodes(frame, result, region, excludedSourceIds = []) {
  const sourceIds = new Set(region.sourceIds.filter(id => !excludedSourceIds.includes(id)));
  const nodeIds = new Set(result.sourceMap.filter(source => sourceIds.has(source.sourceId)).flatMap(source => source.nodeIds));
  return frame.children.filter(node => nodeIds.has(node.id));
}

function wrapLabel(text, parent) {
  const x = text.x, y = text.y;
  const wrapper = figma.createFrame();
  wrapper.name = `文字 / ${text.characters}`;
  wrapper.fills = [];
  wrapper.clipsContent = false;
  wrapper.layoutMode = 'HORIZONTAL';
  wrapper.primaryAxisSizingMode = 'AUTO';
  wrapper.counterAxisSizingMode = 'AUTO';
  wrapper.paddingTop = wrapper.paddingRight = wrapper.paddingBottom = wrapper.paddingLeft = 0;
  wrapper.itemSpacing = 0;
  const index = parent.children.indexOf(text);
  parent.insertChild(index, wrapper);
  wrapper.appendChild(text);
  wrapper.x = x;
  wrapper.y = y;
  return wrapper;
}

function makeComponent(frame, result, region, name, excludedSourceIds) {
  const nodes = selectedNodes(frame, result, region, excludedSourceIds);
  if (!nodes.length) throw new Error(`组件区域没有来源节点：${name}`);
  const component = figma.createComponent();
  component.name = name;
  component.fills = [];
  component.clipsContent = false;
  component.resize(region.width, region.height);
  for (const source of nodes) {
    const clone = source.clone();
    component.appendChild(clone);
    clone.x = source.x - region.x;
    clone.y = source.y - region.y;
    if (clone.type === 'TEXT') wrapLabel(clone, component);
  }
  return component;
}

function replaceWithInstance(frame, result, region, component, excludedSourceIds, report) {
  const nodes = selectedNodes(frame, result, region, excludedSourceIds);
  if (!nodes.length) throw new Error(`实例替换未找到原始区域：${component.name}`);
  const index = Math.min(...nodes.map(node => frame.children.indexOf(node)));
  const instance = component.createInstance();
  instance.name = component.parent?.type === 'COMPONENT_SET' ? component.parent.name : component.name;
  frame.insertChild(index, instance);
  instance.x = region.x;
  instance.y = region.y;
  // Sources belong exclusively to frames created by this run. No pre-existing user node is removed.
  for (const node of nodes) { report.removedGeneratedNodeIds.push(node.id, ...('findAll' in node ? node.findAll(() => true).map(child => child.id) : [])); node.remove(); }
  report.instanceIds.push(instance.id);
  return instance;
}

async function buildLibrary(ledger, library, report, heading) {
  const byId = new Map(ledger.map(result => [result.artboardId, result]));
  const frames = new Map();
  for (const result of ledger) frames.set(result.artboardId, await figma.getNodeByIdAsync(result.nodeId));
  let rowY = 85;
  function componentSet(title, specs, columns, cellWidth, cellHeight) {
    heading(library, title, 40, rowY, 24, 700);
    rowY += 45;
    const components = specs.map(spec => {
      const region = regionFor(spec.board, spec.selector, spec.index || 0);
      const excluded = spec.selector === '.groove-nav' ? regionFor(spec.board, '.size-controls').sourceIds : [];
      const component = makeComponent(frames.get(spec.board), byId.get(spec.board), region, spec.variant, excluded);
      return { ...spec, component, region, excluded };
    });
    const set = figma.combineAsVariants(components.map(item => item.component), library);
    set.name = title;
    set.fills = paint('#f4f1e7');
    set.strokes = paint('#c5cdbf');
    set.strokeWeight = 1;
    set.cornerRadius = 18;
    for (const [index, item] of components.entries()) { item.component.x = 20 + (index % columns) * cellWidth; item.component.y = 20 + Math.floor(index / columns) * cellHeight; }
    const height = 40 + Math.ceil(components.length / columns) * cellHeight;
    set.resizeWithoutConstraints(40 + Math.min(columns, components.length) * cellWidth, height);
    set.x = 40;
    set.y = rowY;
    rowY += height + 55;
    report.componentSetIds.push(set.id);
    report.componentIds.push(...components.map(item => item.component.id));
    return components;
  }
  const navBoards = ['ride', 'return', 'scan', 'town', 'help'];
  const navLabels = ['候车', '返程', '乘车码', '古镇', '帮助'];
  const nav = componentSet('导航 / 凹槽跟随', navBoards.map((screen, index) => ({ board: `regular-${screen}`, selector: '.groove-nav', variant: `Active=${navLabels[index]}` })), 5, 100, 645);
  const sizes = componentSet('文字大小 / 全局选择', [{ board: 'typography-small', variant: 'Size=小' }, { board: 'regular-ride', variant: 'Size=中' }, { board: 'typography-large', variant: 'Size=大' }].map(item => ({ ...item, selector: '.size-controls' })), 3, 165, 60);
  const normal = ledger.filter(result => /^regular-/.test(result.artboardId) && result.artboardId !== 'regular-settings');
  const actions = componentSet('主要操作 / 圆角按钮', normal.map(result => ({ board: result.artboardId, selector: '.notch-action button', variant: `Action=${regionFor(result.artboardId, '.notch-action button').name}` })), 4, 265, 78);
  const returns = componentSet('陶赭卡片 / 返程与古镇', [{ board: 'regular-ride', selector: '.terracotta', variant: 'Content=返程安排' }, { board: 'regular-return', selector: '.terracotta', variant: 'Content=古镇漫游' }], 2, 285, 155);
  const senior = componentSet('老年人模式 / 大按钮', [0, 1, 2, 3].map(index => ({ board: 'senior-ride', selector: '.senior-tasks button', index, variant: `Task=${regionFor('senior-ride', '.senior-tasks button', index).name}` })), 4, 195, 115);

  for (const result of normal) {
    const id = result.artboardId, frame = frames.get(id);
    const active = id === 'regular-route' || id === 'regular-delay' ? 'ride' : id === 'regular-ticket' ? 'scan' : id.slice(8);
    const navItem = nav[navBoards.indexOf(active)];
    replaceWithInstance(frame, result, regionFor(id, '.groove-nav'), navItem.component, regionFor(id, '.size-controls').sourceIds, report);
    replaceWithInstance(frame, result, regionFor(id, '.size-controls'), sizes[1].component, [], report);
    replaceWithInstance(frame, result, regionFor(id, '.notch-action button'), actions.find(item => item.board === id).component, [], report);
    replaceWithInstance(frame, result, regionFor(id, '.terracotta'), returns[id === 'regular-return' ? 1 : 0].component, [], report);
  }
  for (const index of [0, 2]) { const item = sizes[index], result = byId.get(item.board); replaceWithInstance(frames.get(item.board), result, item.region, item.component, [], report); }
  for (const item of senior) replaceWithInstance(frames.get('senior-ride'), byId.get('senior-ride'), item.region, item.component, [], report);
  library.resizeWithoutConstraints(1240, rowY + 40);
}

function createImportSection(name, x, y, width, height) {
  const section = figma.createSection();
  section.name = name;
  section.resizeWithoutConstraints(width, height);
  section.x = x;
  section.y = y;
  section.fills = paint('#eae7dd');
  return section;
}

async function runImport() {
  const report = { boardCount: 0, sectionIds: [], boardIds: [], componentSetIds: [], componentIds: [], instanceIds: [], removedGeneratedNodeIds: [], warnings: [], failures: [] };
  // Font checks happen before creating any nodes or variables.
  const chooseFont = await prepareFonts(BOARDS);
  await prepareSemanticVariables();
  function heading(parent, characters, x, y, size = 22, weight = 400, maxWidth) {
    const text = figma.createText();
    text.fontName = chooseFont(weight);
    text.fontSize = size;
    text.lineHeight = { unit: 'PERCENT', value: 155 };
    text.characters = characters;
    text.fills = paint('#303735');
    text.textAutoResize = maxWidth ? 'HEIGHT' : 'WIDTH_AND_HEIGHT';
    if (maxWidth) text.resize(maxWidth, text.height);
    parent.appendChild(text);
    text.x = x;
    text.y = y;
    return text;
  }
  const originalChildren = [...figma.currentPage.children];
  const startX = Math.max(0, ...originalChildren.map(node => node.x + node.width)) + (originalChildren.length ? 180 : 0);
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const screens = createImportSection(`完整导入 · 15 个画面 · ${stamp}`, startX, 0, 2310, 2950);
  const library = createImportSection(`完整导入 · 组件库 · ${stamp}`, startX + 2460, 0, 1240, 2050);
  const foundations = createImportSection(`完整导入 · 设计基础与说明 · ${stamp}`, startX, 3110, 2310, 720);
  report.sectionIds.push(screens.id, library.id, foundations.id);
  heading(screens, '白溪舆记 / 完整界面', 40, 22, 30, 900);
  heading(library, '可复用组件 / 文字容器采用自动布局', 40, 22, 25, 700);
  const ledger = [];
  for (const [index, board] of BOARDS.entries()) {
    figma.notify(`正在导入白溪舆记：${index + 1} / ${BOARDS.length}`, { timeout: 1000 });
    const result = await buildNative({ ...board, position: { x: 40 + (index % 5) * 450, y: 115 + Math.floor(index / 5) * 930 } }, screens);
    ledger.push(result);
    report.boardIds.push(result.nodeId);
    report.boardCount++;
    report.failures.push(...result.failures.map(failure => ({ artboard: board.id, ...failure })));
    heading(screens, board.name, 40 + (index % 5) * 450, 80 + Math.floor(index / 5) * 930, 16, 500);
  }
  if (report.failures.length) report.warnings.push('部分基础图层未能创建；请查看控制台报告。已导入内容保留，组件化继续处理可用区域。');
  try { await buildLibrary(ledger, library, report, heading); }
  catch (error) { report.warnings.push('组件化未全部完成，原画板仍保留：' + String(error)); }

  heading(foundations, '颜色 / 字体 / 编辑说明', 40, 25, 28, 900);
  const palette = Object.entries(semanticNames);
  for (const [index, [hex, name]] of palette.entries()) {
    const x = 40 + (index % 4) * 285, y = 100 + Math.floor(index / 4) * 150;
    const swatch = figma.createRectangle();
    swatch.resize(250, 72);
    swatch.cornerRadius = 16;
    swatch.fills = paint(hex);
    foundations.appendChild(swatch);
    swatch.x = x;
    swatch.y = y;
    heading(foundations, `${name}\n${hex.toUpperCase()}`, x, y + 80, 13, 400);
  }
  heading(foundations, 'Noto Sans SC / 原生可编辑文字', 1240, 100, 26, 700);
  heading(foundations, '下一站，慢一点也很好。\n小 / 中 / 大统一缩放；老年人模式独立简化布局。', 1240, 157, 22, 400, 940);
  heading(foundations, '霞鹜文楷字标保留原字体矢量轮廓。\n曲面与导航保持自由矢量布局；组件文字使用自动布局。\n主画板尺寸 390 × 844，浏览器截图在 design/previews。\n这是可编辑设计源；连续动效和真实交互请使用网页 Demo。', 1240, 290, 18, 400, 940);
  heading(foundations, '本次新建 3 个分区，未删除运行前已有的画布内容。\n再次运行会创建新分区，不覆盖上一次导入。\n本插件经过静态与模拟结构检查；此版本尚未在已登录的 Figma 桌面客户端实机运行。', 40, 455, 19, 400, 2100);
  report.warnings.push(...colorWarnings);
  if (report.warnings.length) heading(foundations, '导入提示：' + report.warnings.join('\n'), 40, 600, 15, 400, 2180);
  report.createdNodeIds = report.sectionIds.flatMap(id => { const section = [screens, library, foundations].find(node => node.id === id); return [id, ...section.findAll(() => true).map(node => node.id)]; });
  report.fontStyles = [...new Set(BOARDS.flatMap(board => board.nodes.filter(node => node.type === 'text').map(node => node.fontStyle)))];
  figma.currentPage.selection = [screens];
  figma.viewport.scrollAndZoomIntoView([screens]);
  return report;
}

runImport().then(report => {
  console.log('白溪舆记导入报告', report);
  figma.closePlugin(`已导入 ${report.boardCount} 个画面、${report.componentIds.length} 个组件。${report.warnings.length || report.failures.length ? '有提示，请查看设计基础分区和控制台。' : ''}`);
  return report;
}).catch(error => {
  console.error('白溪舆记导入未完成', error);
  figma.closePlugin(`导入未完成：${error.message || error}。已有内容未删除。`);
  return { failed: true, error: String(error) };
});

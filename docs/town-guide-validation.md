# 古镇地图增量交付与验收

日期：2026-10-19。基线：`main` / `0a9af202f5f0dd1c4e56b797c9ab0639b7ccf8d4` / v2.2.2，与本次任务书快照一致。按本次任务书，本轮仅作本地增量，未提交、推送、发版、部署或清理历史文件；`package.json` 仍为 2.2.2，线上 Demo 不包含本轮改动。

## 实现结果

首次进入古镇且没有恢复中的任务时，展示独立规划环线。顶部原导览卡兼作“查看完整环线”入口；底部原村落卡内增加环线说明和景点清单。环线、当前研究区间和景点使用独立资料层，保持平面地图、主题色、字体、NH 标识、主题巴士、右侧五项凹槽导航及既有业务页。

环游顺序为 **清潭→龙宫→箬岙→梅枝田→许家山→清潭**。比较 24 种完整有向环游顺序后，使用连续道路样本生成约 **143.9 公里**的闭合几何，末段独立计算。额外重复道路占 7.81%，参考点附近存在折返；它是规划研究，不是已运营公交或大客车通行承诺。没有估算时刻、票价、公交 ETA 或上下客点。完整来源、节点与方向复核见 [闭合报告](travel-loop-closure.md)。

选村后显示该村具备坐标的景点资料点，一次点击即在原 `SheetPanel` 打开简介。清单与地图共用资料源；位置未核验的记录仍能阅读。简介支持可选本地中文朗读、明确关闭、Escape、键盘焦点循环和手机式返回；没有自动声音或云端导览。关闭和跨页面返回保留地图视角。浏览景点不修改已保存研究计划。

密集景点与小屏密集村落按屏幕触控区域聚合，代表位置仍是组内一个真实点，不挪动坐标。390×844 普通字号可见五个独立编号；320×568 大字号聚合为两组入口，触控区不重叠，点开可读完整顺序。原触发点因选村而隐藏时，关闭后的焦点回到可见的“查看完整环线”。

## 数据覆盖与未完成项

| 古村 | 有来源的简介 | 可落图资料点 | 位置待核验 |
| --- | ---: | ---: | ---: |
| 清潭 | 2 | 1 | 1 |
| 龙宫 | 2 | 1 | 1 |
| 许家山 | 2 | 0 | 2 |
| 梅枝田 | 3 | 1 | 2 |
| 箬岙 | 3 | 0 | 3 |
| 合计 | 12 | 3 | 9 |

**没有完成“每村均有可定位景点”和“一个古村多个真实景点同屏”的资料验收。** 许家山、箬岙的简介已可浏览，但缺乏可唯一对应对象的独立位置依据；不能用村落中心、近邻同名点或无地理注册的规划图补坐标。本轮没有为凑数量造点。三处公开资料点也不是已测量入口；水库仅使用来源中的水域包围盒中心，不提供步行导航。

全部照片为空并隐藏图片区；开放状态、票价与到访安排均未承诺。清单是首批代表点，不是完整景点名录。政府公示、地方报道、固定版本坐标来源与 OSM 原始证据、日期、哈希和未纳入候选见 [景点覆盖与来源](village-poi-coverage.md)。

## 执行验证

| 检查 | 结果 | 范围与证据 |
| --- | --- | --- |
| `pnpm typecheck` | PASS | TypeScript 检查；构建也再次执行 `tsc --noEmit` |
| `pnpm test` | 53/53 PASS | 原业务、道路源边、闭合防伪、目录核验、相机与碰撞、异常导出 |
| `pnpm build` | PASS | 生产构建完成；保留 MapLibre 既有大包体积提示 |
| `pnpm test:town-guide` | 16 场景 PASS，0 未捕获 JS 错误 | 全线→选村→简介→关闭、字号、键盘、Back/Forward、资料失败、计划不变、原页面视觉回归；修复后定向重测结果按场景合并 |
| `node tests/map-overlays-browser.mjs` | 5/5 PASS | 隔离地图的分层、聚合、相机恢复、村落聚合及 JS 检查；合成 POI 只验证技术行为 |
| `pnpm test:town-guide-production` | 6/6 PASS | 真实构建挂载 `/baixi-yuji/`：启动、环线 JSON、点选、Back/相机、字号、字体与资源；JS/console/HTTP/request 错误均为 0 |
| `git diff --check` | PASS | 无空白错误；没有暂存或提交 |
| iOS / Android / 微信实机 | NOT_RUN | 使用本机 Microsoft Edge / Chromium 手机视口仿真，不冒称实机验收 |
| 单村多个真实 POI 同屏 | 未满足资料前提 | 当前每村最多一条已核对坐标，没有用测试点代替真实截图 |

[浏览器逐项报告及真实截图](town-guide-validation/README.md) · [场景结果](town-guide-validation/results.json) · [生产子路径结果](town-guide-validation/production-results.json)

七个非地图页面（候车、返程、乘车码、线路、车票、帮助、异常提示）与冻结的 v2.2.2 构建比较，原布局、颜色、字体、圆角和五项导航一致。测试使用独立浏览器配置，没有清空用户现有本地偏好或保存计划。

## 实际运行截图

- [全环线总览，390 普通字号](town-guide-validation/390-overview.png)
- [清潭真实资料点：当前一个可落图点](town-guide-validation/390-village-pois.png)
- [景点一击简介](town-guide-validation/390-poi-introduction.png)
- [关闭后恢复地图](town-guide-validation/390-after-close.png)
- [320 大字号聚合总览](town-guide-validation/320-large-overview.png)
- [320 大字号简介](town-guide-validation/320-large-intro.png)

以上均为实际应用运行截图。聚合的合成测试、缺图、无 WebGL 与不完整环线故障注入图在浏览器报告中单独标注。

## 增量文件

- `src/mobile/TownScene.tsx`、`TownGuide.tsx`、`town-guide.css`：视角记忆、全线入口、清单及简介、返回状态和局部小屏适配。
- `src/mobile/SheetPanel.tsx`、`localSpeech.ts`、`TransitApp.tsx`：复用弹层，新增可选焦点与关闭后卸载；提取原本地朗读选择逻辑，旧页面行为不变。
- `src/geography/GeographyMap.tsx`、`map-depth.ts`、`map-depth.css`、`map-overlays.ts`：独立图层、方向、标记、触控聚合和相机恢复。
- `src/geography/travelLoop.ts`、`loadTravelLoop.ts`、`public/geography/travel-loop.json`、`scripts/prepare-travel-loop.mjs`：真实道路环线与加载校验，不完整导出只显示已证实的路段。
- `src/geography/poiCatalog.ts`、`data/geography/poi-evidence/`：五村资料与原始证据；与 Village、BoardingPoint、Service、行程存储独立。
- `tests/*travel-loop*`、`tests/poi-catalog.test.ts`、`tests/map-overlays*`、`tests/map-loop-harness.html`、`tests/town-guide-*`：数据、交互和生产子路径验证。
- `README.md`、`package.json` 和上述验收文档：记录本地未发布状态及复现命令，无新增依赖。

## 本地查看

运行 `pnpm dev` 后打开 `http://127.0.0.1:5173/#/town`。每次完整打开仍保留现有宁海公交启动动画。点击标题卡可回全线，底部“景点清单”可浏览全部已核验简介；许家山与箬岙目前应通过清单查看。

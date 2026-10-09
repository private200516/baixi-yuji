# 乡序 · 第二轮本地验收

日期：2026-10-09。执行 WORKFLOW.md 的道路研究与浅浮雕阶段，并按用户要求把真实地图融入原手机界面。用户最新明确将品牌改为“乡序”；这一要求覆盖工作流旧版本的暂名限制。

## 本轮结果

- 入口为 `src/geography/MobileApp.tsx`。保留暖米白、灰青、陶赭、文楷标题、圆角曲面和右侧连续凹槽导航；没有底部导航。
- 390 × 844 标准字号主画面完整显示。320/360 窄屏、大字、老年模式使用右侧展开导航，长内容自然纵向滚动。
- 平面/立体直接在手机首页切换；全县/区间/村内、全屏、复位均使用相同真实地理数据。紧凑小地图降低相机缩放、动态留白，县界与五处地理圆点不再被裁切。
- 选村、村落详情、起终点、去返程道路、区间地图和本机计划已连通。返程独立计算；直接进入返程地址和浏览器历史也保持返程方向。
- 老年模式采用文字选村；选择的古村直接设为目的地，提供村落说明，下一步只需选择出发位置。无复杂地图操作，关闭非必要移动过渡。
- 小/中/大覆盖界面文字和地图版权；字体子集包含“乡序”和新增文案。生产 CSS 与 preload 使用同一字体地址，避免重复下载。

## 已执行检查

| 检查 | 结果 | 证据与范围 |
| --- | --- | --- |
| `pnpm typecheck` | PASS | TypeScript 无错误；构建亦包含此步骤 |
| `pnpm test` | 19/19 PASS | 含5项保留模块回归，以及地理来源、原始顶点、建筑与道路方向/限制/距离检查 |
| `pnpm test:round2` | 20项全量检查 PASS | 操作链、布局、异常与无未捕获错误；随后6项受影响布局检查定向复验 PASS |
| `pnpm test:map-depth` | 6/6 PASS | 五项隔离组件检查及真实390首页/全屏范围适配；见 `map-depth-browser-results.json` |
| `pnpm build` | PASS，有体积提示 | Vite 生产包可生成，地图懒加载块超过500 kB，未隐藏该提示 |
| `pnpm test:round2-production` | PASS | 打包后的乡序标题、字体、地图Worker、立体与选村至区间链路；无404、外部请求或未捕获异常 |
| `git diff --check` | PASS | 无空白错误；Windows行尾提示不影响结果 |

完整应用浏览器检查见 [`round2-browser-results.json`](round2-browser-results.json)，最终受影响布局复验见 [`round2-browser-partial-results.json`](round2-browser-partial-results.json)，使用本机 Edge 的无头浏览器与指定手机视口。生产记录见 [`round2-production-results.json`](round2-production-results.json)。

人工检查曾发现200%文字虽不使整页横向溢出，却会把品牌挤成逐字排列、裁切地图控件。现已将大字页头、标题、视角、地图范围与全屏操作按行重排，复位按钮随文字扩宽，地图说明依版权实际高度保持10px间距。最终断言同时检查控件边界与文字裁切，不只检查页面scrollWidth。标准390页面实测文档高844px、行程卡底部797.89px，主要选村按钮高56px。

检查覆盖：390首屏、320/360/768/1440重排、字号与200%文字重排、右侧固定导航槽位与同步凹槽、键盘关闭和焦点返回、独立去返程、保存恢复、老年操作链、地图尺度与全屏、同区域平面/立体、偏好迁移、15秒请求超时、HTTP失败、无可用路线、WebGL与存储不可用。

## 实际截图

以下为完整应用实际运行截图：

- [390手机首页](round2-screenshots/390-home.png)
- [同一村落平面](round2-screenshots/390-village-flat.png) / [同一村落立体](round2-screenshots/390-village-relief.png)
- [返程研究计划](round2-screenshots/journey-return-plan.png)
- [大字](round2-screenshots/390-large.png) / [老年模式](round2-screenshots/390-senior.png)
- [320窄屏](round2-screenshots/320.png) / [1440桌面](round2-screenshots/1440.png)
- [生产包运行](round2-screenshots/production-390.png)

`map-depth-screenshots/*harness.png` 是地图组件隔离截图，不冒充完整 APP。`geography-screenshots`、`mobile-screenshots` 和本轮 first-probe 保留阶段记录，不代表最新界面。

## 数据与性能界限

本轮沿用五个有来源的村落代表点、3,774条主要道路、1,352条水系及真实县界；补取36条道路生成20个有序点对的研究几何。每个道路点对都独立求解，路网覆盖不足可能导致显著绕行；全部行程耗时未知，不提供公交预计到站。

局部查询仅取得1个建筑轮廓、79条道路/步道和9条水道。建筑统一6米为示意高度；没有DEM，其余村落缺少建筑样本，不代表当地无建筑。未随机填房、造山或移动村点。来源、时间、许可、查询与哈希见 `data-sources.md`、`route-proposal.md`、`map-depth-data.md`。

生产构建：主JS约217.30 kB（gzip 70.73 kB），地图懒加载JS约1,057.10 kB（gzip 289.79 kB），本地Worker约508.31 kB；公开地理样本合计约3.52 MB未压缩。地图未使用远程瓦片或运行时Overpass。构建可用不等于低端手机性能已经达标。

以下为 NOT_RUN / 尚未具备：真实Android/iOS设备、Safari与读屏器、原生APP安装包、低端手机帧率/内存/弱网指标、实地公交通行和上下客核验、完整村落建筑与可靠DEM。200%检查通过放大文字变量验证重排，不代替各系统原生缩放与辅助技术验收。项目没有配置lint命令，不记为通过。

## 预览与阶段边界

开发预览：http://127.0.0.1:5173/#/ride 。生产预览：http://127.0.0.1:4173/#/ride 。源码、本地样本和截图已保存；本轮未提交、推送、部署或修改线上Figma。

按工作流第二轮停止点提供手机/桌面与平面/立体对照，等待视觉确认。这里完成的是本轮本地研究原型，不代表正式公交服务上线或全项目完成。

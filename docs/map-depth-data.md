# 第二轮地图：真实局部样本与轻立体表现

核对日期：2026-10-09。地图继续使用 MapLibre GL JS 6.13.0，没有新增渲染引擎、第三方瓦片、登录、密钥、定位或遥测。

## 已取得的局部数据

对既有五处聚落代表点各 1,000 米范围进行了一次有限、只读的 Overpass 请求。端点为 `https://overpass-api.de/api/interpreter`。查询获取 `building`、`highway` 与 `waterway` 的 OSM way 几何，未下载标准地图瓦片。

原始数据、查询和精确取得时间见 `data/geography/raw/village-detail.overpass.json`、`.ql`、`.source.json`。原始经纬度是 WGS 84；GeoJSON 按 `[longitude, latitude]` 保存，没有坐标偏移或投影值冒充经纬度。每个输出要素保留 OSM ID 与来源链接；完整校验见 `data/geography/village-detail-report.json`。

| 样本内容 | 数量 | 展示方式 |
| --- | ---: | --- |
| 闭合建筑轮廓 | 1 | 仅村落级缩放 zoom ≥ 14；平面足迹或低矮挤出 |
| 局部道路与步道 | 79 | 支路 zoom ≥ 12；步道 zoom ≥ 14、虚线，与机动车路有别 |
| 局部水系 | 9 | zoom ≥ 13 逐步显示 |

另外合入路线研究取得的 `access-roads.geojson`，按 OSM ID 去重。这部分来源、道路限制与独立去返程计算见 `docs/route-proposal.md`，不将其当作实测公交通行结论。

建筑仅有 [OSM way 930603871](https://www.openstreetmap.org/way/930603871)，在许家山代表点附近。龙宫、清潭、梅枝田、箬岙的本次查询没有返回建筑轮廓；这意味着**样本缺失**，不意味着村里没有建筑。范围为查询半径，不是正式村界，唯一轮廓亦不等于整个许家山聚落。

该轮廓没有 `height` 标签，展示高度统一设为 **6 米示意**，并写入 `heightSource=illustrative-uniform-6m`；地图保持“建筑高度为示意”提示。未根据图片随机补房屋，也不把此轮廓称为测绘建筑或传统建筑。

数据许可：[Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/)；地图持续显示 [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)。原始来源许可与 SHA-256 随文件保存。浏览器运行时只请求本地样本，不再请求 Overpass 或地图瓦片。

## 交互与表现

- 县域：真实县界、主要道路、水系、五处候选古村；不显示县域级巨大建筑体块。
- 当前区间：仅显示父层传入的道路研究几何和道路参考点。没有几何不补直线，不将参考点冒充上车点。
- 村落局部：切至所选聚落；有建筑轮廓时将实际轮廓与村点一起纳入视野，无建筑时显示已有道路与水系。
- 平面／轻立体使用相同数据。切换只改变 0°／42° 俯仰角，保持地图中心和缩放；复位恢复北向及当前范围。
- 尚未取得 DEM，地面始终为平面。这里的“轻立体”是视角和建筑挤出，不是真实起伏地形或实测三维重建。
- 所有镜头过渡由用户操作触发，持续 220—380 毫秒；减弱动效时持续时间为 0。没有巡游、循环呼吸或自动旋转。
- 村名采用朝向屏幕的 HTML 按钮，碰撞时隐藏局部标签但不移动地理点；完整村名与选择功能仍由外部文字列表提供。选择不抢焦点。
- 渲染失败时保留外部村落信息，并提供重新载入平面地图；局部数据失败时只保留基础地图、明确提示缺失，不生成替代地理数据。

## 再生成

在工程根目录运行 `node scripts/prepare-village-detail.mjs` 可从已保存原始数据再生样本；脚本不联网。必要时显式运行 `./scripts/fetch-village-detail.ps1` 重新进行同范围只读查询，默认端点可通过 `-Endpoint` 配置。不要将查询扩大成公共瓦片批量抓取。

技术依据：[MapLibre 官方建筑挤出示例](https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/)、[Overpass QL 官方项目文档](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)。未引入其示例中的第三方底图。

## 本轮数据限制

仍缺少完整村落建筑覆盖、可靠建筑高度、DEM，以及经过运营方核验的上下客位置和公交通行条件。当前结果仅是本地研究原型。公开发布需另行审核数据来源、许可与地图发布要求；本轮未部署。

## 地图组件验证记录

`node --experimental-strip-types --test tests/map-depth.test.ts`：3 项 PASS，检查原始轮廓逐点一致、缺失高度披露、原始与产物哈希、局部缩放门槛和无外部瓦片/DEM。

`node tests/map-depth-browser.mjs`：6 项检查，覆盖同中心/缩放的平面与轻立体切换、局部建筑及无建筑状态、道路参考点与减弱动效、局部数据失败、WebGL 丢失后仍可选村，以及实际 390px 手机应用的紧凑／全屏范围适配。最新逐项结果见 `docs/map-depth-browser-results.json`。`pnpm typecheck`：PASS。

浏览器验证包含真实 `GeographyMap` 组件隔离页及完整手机应用，结果在 `docs/map-depth-browser-results.json`。`docs/map-depth-screenshots/*-harness.png` 是隔离组件截图；`mobile-compact-county.png`、`mobile-fullscreen-county.png` 和 `mobile-fullscreen-village.png` 来自实际手机应用。完整手机与桌面交互另由应用验收记录覆盖。

390px 普通版的紧凑地图约 238×219 CSS px。相机最低缩放放宽至 5，根据真实标题和版权高度计算留白，使全县范围和五处真实圆点全部位于可见区域，不移动坐标。紧凑县域图例与卡外图例重复，故只隐藏内部副本，版权保留。容器实际尺寸变化（包括进出全屏）时无动画恢复当前范围；单独平面／轻立体切换仍保持中心和缩放。

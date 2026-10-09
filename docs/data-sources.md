# 乡序 · 地理与内容来源登记

更新：2026-10-09。产品品牌按用户最新指令为“乡序”，服务范围仍为宁海古村旅游专线；品牌变化不改变任何源数据实体、坐标或许可。第一轮来源保留，第二轮新增记录如下。

## 第一轮地理基线 · 2026-10-08

数据提供者为 [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)，许可 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。下载接口为公开 [Overpass API](https://overpass-api.de/api/interpreter)，无密钥、账号或付费。只执行县域有界查询，未批量抓取地图瓦片。

| 图层 | 原对象 / 查询范围 | 下载核验日期 | 处理后数量 | 原始坐标 / 处理 |
|---|---|---|---:|---|
| 县界 | relation 3199272，宁海县 | 2026-10-08 | 1 MultiPolygon，1 外环，无内环 | WGS84，经度在前；只拼接同端点 |
| 村落 | area 3603199272 中 place/name 对象 | 2026-10-08 | 651 原对象；5 个合格村落节点用于展示 | WGS84 原值，未转换 GCJ02 |
| 主要道路 | motorway/trunk/primary/secondary/tertiary | 2026-10-08 | 3774 LineString | 原 way 全部顶点，不简化/移位 |
| 水系 | river/stream/canal + natural=water | 2026-10-08 | 1352 way 特征 | 闭合 water way 为面；其他为线，未组装10个relation |

边界范围为 [121.1583471, 29.0932992, 121.8169183, 29.5246868]。坐标传入 MapLibre 后由渲染器投影为二维平面，并未改动源数据。

原数据、精确检索时刻、OSM 数据时刻、查询、接口 URL 和 SHA256 在 `data/geography/raw/*.source.json`；原查询在 `*.overpass.ql`。本地导出和哈希在 `public/geography/manifest.json`，拼接报告在 `data/geography/extraction-report.json`。道路失败请求在 `roads.last-failure.json`，成功样本单独登记，不能把失败记录当作缺失数据。

运行中仅请求同站点的地图清单、基础/局部 GeoJSON、路线研究 JSON、字体和地图 Worker。每次打开使用固定本地样本，不自动查询 Overpass、商业地理编码或外部路由服务；更新来源需要显式操作。归属标注位于地图底部，包括失败状态。地图不证明行政边界的法律效力、道路完整性、实时交通或公交可达性。

## 第二轮有界补充 · 2026-10-09

两次新增查询均向上述 Overpass API 发起显式只读请求，没有登录、私人密钥、收费、公共瓦片抓取或后台更新。实际UTC检索时间、OSM数据时间、完整query、数据SHA-256与用途存于各自 `*.source.json`，不能把下载日期当成所有地物的实测更新时间。沿用OSM的WGS84原始经纬度及ODbL许可。

| 用途 | 有界范围 | 已取得内容 | 原始资料与派生产物 |
| --- | --- | --- | --- |
| 道路连通研究 | 县域主要道路；龙宫代表点3 km、其余四村各1 km内机动车道路和连接路；所选道路的restriction与障碍/访问节点 | 3,810条way，较第一轮增加36条；3个障碍节点；返回0条restriction关系 | `raw/route-access.overpass.json/.ql`、`raw/route-access.source.json`；`public/geography/route-research.json`、`access-roads.geojson` |
| 村落局部表现 | 五处村落资料代表点各1 km内的building/highway/waterway方式对象 | 1个建筑轮廓、79条道路、9条水道 | `raw/village-detail.overpass.json/.ql`、`raw/village-detail.source.json`；`public/geography/detail-manifest.json`、`buildings.geojson`、`detail-roads.geojson`、`detail-water.geojson` |

表中 `raw/` 均位于 `data/geography/`。道路与局部查询可能覆盖相同way，处理时按对象ID识别；这些数量不是把两批样本相加后的独立地物总数。查询圆仅定义数据检索范围，不是官方村界；为保持真实几何和连接关系，保留完整way，其顶点可延伸出查询圆。

### 道路研究数据

图结构只连接同一个OSM node ID，保留原始相邻顶点、方向和完整边证据；不凭线段相交、坐标接近或村名连接道路。根据普通车辆适用的访问层级和oneway构建有向边。未知/条件通行、变向单行保守排除；存在无法完整解释的restriction关系时排除参与道路，而非忽略规则。障碍和坐标冲突节点不作为贯通点。**这不是完整的商用驾车路由器**，未映射的限制仍未知。

每个方向单独计算，20个有序点对均得到连续样本道路；所有 `estimatedDurationSeconds` 为 null。道路长度是原始相邻顶点的球面长度累加，未通过平均速度生成时间。14个弱连通分量和部分较大绕行说明样本仍不完整。去返程不等长不是已核实的实际旅行结论，普通道路结果更不能证明大客车通行。

古村与道路参考点分别存储，参考点不是正式BoardingPoint。500米只用作研究搜索展示限值；距离近仍未核验停车、过街、村内连接与上下客侧，不提供村点至参考点的假直线。正式Service为空。完整说明和每边验证见 [路线提案](route-proposal.md) 及 `data/geography/reports/route-research.json`。

标签语义参考：[oneway](https://wiki.openstreetmap.org/wiki/Key:oneway)、[access](https://wiki.openstreetmap.org/wiki/Key:access)、[restriction](https://wiki.openstreetmap.org/wiki/Relation:restriction)，2026-10-09查阅。它们说明数据含义，不证明本地路网无遗漏。

### 建筑、局部道路与浮雕限制

建筑样本仅许家山代表点附近1个闭合OSM轮廓；其他四村本批查询未取得建筑轮廓。缺失不意味着当地没有房屋。现有轮廓没有可用的实测高度，因此采用**统一6米示意高度**，界面和数据均标注高度为示意，未推断或随机生成额外房屋。

79条局部道路保留步行/非机动车与普通道路的分类区别，不能把步行巷道自动作为公交路线。9条水道只用于地图表现，没有推演未取得的水面或水文流量。校验、原始顶点保留说明和导出哈希位于 `data/geography/village-detail-report.json`。

当前未取得DEM。平面/立体切换是在同一真实平面数据上改变视角并呈现少量建筑拉伸，不是地形起伏、完整街区沙盘或实测三维重建。县域不放大建筑模型，村落局部只在有数据时显示细节。

### 处理与第三方边界

`pnpm data:routes` 与 `pnpm data:detail` 仅离线处理保存的原始样本；普通启动和构建不会调用上述网络端点。来源更新必须显式执行记录中的有界查询，不能将此机制描述为实时自动更新。

本机字号、视图偏好和计划保存在浏览器本地存储；没有账户或云同步。应用未加入设备定位、埋点、遥测、远程日志、自动上传或真实公交位置。若以后公开地图或接入服务，仍需单独复核数据许可、署名、服务条款及运营/发布要求；本地样本不自动等于公众出行导航服务。

## 古村官方内容

1. [政府托管《历史文化名村/传统村落保护规划的编制与实施》](https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web3506/site/attach/0/51271e0d908c4dc2acc2a7f6479693a5.pdf)：实际下载75页 PDF，渲染查看第15页（印刷页14）名录。行7许家山、8龙宫、13清潭、28力洋、66西岙、67梅枝田。内容发布时间无法从文件确认，存为 null；不能据上传/抓取时间声称最新行政归属。
2. [浙江省纪委监委《清气长存 走进千年古村清潭》](https://www.zjsjw.gov.cn/zhuantizhuanlan/qinglianwenhua/qingfengzhilv/202302/t20230217_8648066_ext.html)：完整正文已读取，页面署期2023-03-13、宁海县纪委监委供稿；确认深甽镇、历史文化名村与2013年传统村落资格。URL 内的20230217不是页面署期。
3. [宁海县人民政府《箬岙村历史文化名村保护规划（2023—2035年）》简本](https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web3575/site/attach/0/550ebc7cf2c7407d973729780d1fb30c.pdf)：实际下载读取，封面2025年7月，第2页确认2023-12-05第七批浙江省历史文化名村、一市镇、箬岙村。

以上 PDF 本地研究副本与渲染图位于忽略上传的 `data/research/`，其 SHA256 登记在 `data/geography/research-checksums.json`。应用只存简短事实、说明与原文链接，不将政府 PDF、照片或地图图面作为可再分发素材；正式对外发布前仍应复核内容和许可。

网页检索摘要仅作为线索，不作为落点证据。深甽规划 PDF 与县博物馆网页本轮抓取失败，未以其搜索摘要补齐行政数据。所有村落的当前行政合并关系仍为 unknown；展示对象是有保护依据的历史聚落，不把这个状态隐藏。

## 技术与字体

- [MapLibre GL JS 官方文档](https://maplibre.org/maplibre-gl-js/docs/)：引擎采用 BSD-3-Clause；引擎本身不提供地图数据。Vite 使用显式本地模块 Worker URL，避免预打包改变相对地址。
- [RFC 7946](https://datatracker.ietf.org/doc/html/rfc7946)：GeoJSON 经纬顺序与 WGS84 约定。
- Noto Sans SC / LXGW WenKai 使用原已取得的完整字体生成独立 WOFF2 子集；许可文件保留于 `public/fonts/OFL-*.txt`。普通运行不需原 TTF。
- 第二轮取得上述1个真实建筑轮廓，仍无DEM或实测高程/高度；没有GCJ02转换、商业地理编码、设备位置采集、外部路由服务或正式运营接入。
- 当前验证成绩与实际截图见 [第二轮验收记录](round2-validation.md)。数据登记只证明取得了这些样本，不代表全部界面、性能或现场可达性检查已经通过。

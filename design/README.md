# 白溪舆记 · 可编辑设计交付

此目录保存从运行中的应用生成的 **15 个 390 × 844 画板**。主界面保持一屏显示，常规模式保留右侧凹槽导航，老年人模式使用独立的大按钮任务布局。

## 文件内容

| 文件 | 用途 |
| --- | --- |
| `svg/*.svg` | 可编辑的文字、曲面、图标、地图及二维码矢量图；每份内嵌所需字体 |
| `previews/*.png` | 对应页面的浏览器原始截图，作为视觉核对依据 |
| `snapshots.json` | 文字、颜色、字号、字重、坐标、圆角、边框、透明度与矢量路径数据 |
| `manifest.json` | 画板目录、设计颜色、字体与许可证引用、生成检查结果 |

SVG 是设计交付格式，**不是 Figma 的 `.fig` 原生文件**。导入工具对 SVG 文字的处理不同，可能将文字转为轮廓；需要原生文字图层时，可使用 `snapshots.json` 的 `text` 节点重建。JSON 中所有位置均使用画板左上角为原点的 CSS 像素坐标；`letters` 保留逐字的实际位置，便于精确重建换行和字距。

## 画板目录

| 模式 | 文件名 | 页面 |
| --- | --- | --- |
| 常规 | `regular-ride` | 找站候车 |
| 常规 | `regular-return` | 安心返程 |
| 常规 | `regular-scan` | 扫码乘车 |
| 常规 | `regular-route` | 线路详情 |
| 常规 | `regular-ticket` | 电子车票 |
| 常规 | `regular-town` | 古镇导览 |
| 常规 | `regular-help` | 帮助中心 |
| 常规 | `regular-delay` | 出行提醒 |
| 老年人 | `senior-ride` | 安心乘车 |
| 老年人 | `senior-scan` | 乘车码 |
| 老年人 | `senior-return` | 安排返程 |
| 老年人 | `senior-help` | 找人帮忙 |
| 设置 | `regular-settings` | 字号、老年人模式与减少动效 |
| 字号 | `typography-small` | 小字候车页 |
| 字号 | `typography-large` | 大字候车页 |

## 字体与颜色

界面使用 **Noto Sans SC**（思源黑体）及 **LXGW WenKai**（霞鹜文楷）。应用中分别使用 `Baixi Sans` 和 `Baixi Kai` 字体别名；`public/fonts` 包含字体子集与 SIL Open Font License。SVG 已内嵌子集字体，可离线查看。需要在 Figma 中修改为新文案时，请安装对应完整字体，以获得完整中文字符覆盖。

| 色彩用途 | 色值 |
| --- | --- |
| 米白背景 | `#F4F1E7` |
| 深墨文字 | `#303735` |
| 青绿主色 | `#507673` |
| 深青操作色 | `#345C58` |
| 陶赭色 | `#A4714F` |

## 再次生成

先在仓库根目录启动 `pnpm dev`，再在另一个终端运行：

```sh
node scripts/export-design.mjs
```

首次使用 Playwright 时，可运行 `pnpm exec playwright install chromium`。已有 Chrome 的环境也可设置 `PLAYWRIGHT_CHANNEL=chrome`；预览服务使用其他端口时，设置 `PREVIEW_URL`。所有导出都使用固定数据、关闭动效、无收藏及无已存返程，确保结果可复现。

## 交付范围

SVG 保留可编辑文字和矢量元素，并非整页截图。CSS 纹理、阴影、背景模糊、部分伪元素和浏览器绘制细节可能有差异；PNG 是当前应用实际外观的核对基准。画板展示静态状态，导航曲面过渡、字体切换、老年人模式切换等交互请在在线 Demo 或 React 源代码中体验。二维码是无效演示码，不能乘车、核验或付款。

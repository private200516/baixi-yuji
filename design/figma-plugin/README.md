# 白溪舆记 · 完整设计导入插件

这是 **Figma 桌面客户端的本地开发插件，不是 `.fig` 文件**。它把随包的界面数据创建为 Figma 原生文字、矢量、组件和实例，不把整页截图当作设计源。插件文件已包含全部数据，运行时不请求网络，也不需要启动网页项目。

## 导入方法

1. 解压交付包，保持本目录的 `manifest.json` 与 `code.js` 在一起。
2. 使用 **Figma 桌面客户端**，打开有编辑权限的 Figma Design 文件。
3. 菜单选择 **Plugins → Development → Import plugin from manifest…**，选中本目录的 `manifest.json`。
4. 从 **Plugins → Development → 白溪舆记 · 完整设计导入** 运行，等待完成提示。

插件在当前页面新建三个独立分区：**15 个完整画面、组件库、设计基础与说明**。它不新建页面，适合页面数量受限的文件；再次运行会在旁边新建一组分区，不覆盖已有设计。成功后，画布会定位到完整界面分区。

如果 Figma 提示 manifest 的 `id` 无效，可在 **Plugins → Development → New plugin…** 创建一个本地插件，将 Figma 生成的 `id` 复制到本目录的 manifest，再重新导入。本目录的标识仅用于本地开发，不代表已经发布到 Figma Community。[Figma 官方开发插件指南](https://help.figma.com/hc/en-us/articles/360042786733-Create-a-plugin-for-development)

## 导入内容

- 8 个常规页面：候车、返程、乘车码、线路、电子车票、古镇、帮助、异常状态。
- 4 个老年人模式页面：候车、乘车码、返程、求助。
- 设置页，以及小字、大字候车页对比。
- 22 个基础组件：5 个导航选中态、3 个字号状态、8 个主要操作按钮、2 个陶赭色卡片、4 个老年人大按钮；适用画面中的区域替换为实例。
- 8 个设计颜色变量、字体与编辑说明。变量功能不可用时，保留同色的固定填色，并在导入提示中说明。

文字容器采用自动布局，凹槽、圆形底座、曲面和图标保留原始矢量定位。Figma 设计展示静态状态，连续凹槽动效、实时字号适配等交互请在网页 Demo 中体验。

## 字体

正文使用 **Noto Sans SC** 原生文字，并根据当前 Figma 可用字重选择最接近的样式。若字体不可用，插件会在修改画布前停止，提示先安装字体；可从 [Google Fonts 的 Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC) 获取。

**LXGW WenKai / 霞鹜文楷**的字标及竖排文字已用项目原字体生成矢量轮廓，可编辑路径，不会替换成其他字体。此类路径不再是能直接键入的文字。主字号与原网页的可变字重可能存在细微差异。

字体子集及许可证位于仓库 `public/fonts/`：`baixi-sans.woff2`、`baixi-kai.woff2`、`OFL-NotoSansSC.txt`、`OFL-LXGWWenKai.txt`。这些 WOFF2 用于网页与生成器；Figma 字体安装应使用字体发行方提供的桌面字体。

## 验证范围与限制

交付前检查了 JavaScript 语法、标准 Figma API 类型，以及模拟环境中的完整导入结构、分区与组件数量、缺失字体时不改动画布、再次运行不覆盖已有内容、颜色变量透明度保留。**尚未在已登录的 Figma 桌面客户端中实际运行本插件**，不能把这些检查视为实机验证。

`design/previews/` 中的 PNG 是网页实际截图，可用于核对版式；SVG 是可编辑交换文件。Figma 字体度量、矢量导入、纹理与阴影可能与浏览器略有差异。若导入出现提示，插件保留已经生成的部分，具体原因会显示在控制台；不会删除运行前已有的设计。

需要 `.fig` 时，在成功导入后通过 Figma 文件菜单 **File → Save local copy…** 保存。该本地文件必须由 Figma 导出，本插件本身不生成 `.fig` 二进制文件。

## 重新构建插件（开发者）

已交付的 `code.js` 可以直接导入，不需要执行以下命令。以下命令需要完整源码仓库或源码 ZIP，在仓库根目录运行；设计 ZIP 中的插件成品可直接使用。先准备 Python 的 `fonttools`、`brotli`，并运行：

```sh
python scripts/build-figma-payload.py
node scripts/build-figma-plugin.mjs
```

生成器优先使用本地 `references/` 中的完整 TTF；没有原件时，自动使用仓库 `public/fonts/` 的 WOFF2 子集。可用 `--prefer-subsets` 验证这条路径。默认动态创建/复用当前文件的颜色变量，**不依赖其他 Figma 文件的变量 ID**；如单独使用远程分块脚本，可传 `--variable-map path/to/colors.json` 指定色值到变量 ID 的映射。可移植插件打包必须使用默认动态变量模式。

重新采集页面和组件区域时，先运行网页预览，再依次运行 `node scripts/export-design.mjs` 和 `node scripts/collect-design-regions.mjs`，之后执行上面的构建命令。区域数据保存在可发布的 `design/component-regions.json`；该目录中的成品插件已经内嵌全部 15 个页面，不受生成器中间文件位置影响。

实现采用标准 [Figma Plugin API](https://developers.figma.com/docs/plugins/api/figma/) 和 [manifest 声明](https://developers.figma.com/docs/plugins/manifest/)，没有使用 MCP 专有方法或插件私有数据存储。

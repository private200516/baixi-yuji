# 手机启动修复验证 · 2.2.2

验证日期：2026-10-18（UTC+9）。本轮修复手机网络较慢或浏览器拒绝自动播放时，启动动画提前结束的问题。启动页标题改为“宁海公交”，应用名称仍为“乡序”，其余页面的布局与业务流程不变。

在 2.2.1 的本地生产快照中，将视频首个响应延迟 3.5 秒后，原先 2.6 秒的无进度阈值先触发 `media-timeout`；视频尚未开始，启动层已经准备退出。另将播放速度设为 0.4 倍，视频持续推进时仍被旧的总时限截断，停止于约 3.383 秒，未收到 `ended`。这两项复现使用桌面 Edge 和测试拦截请求，不是用户手机上的直接录屏。原始现象与处理结果见[精简诊断证据](mobile-startup-v2.2.2/diagnostic-evidence.json)。

现在使用 `nh-launch-mobile.mp4`，将 MP4 的 `moov` 元数据前置，未重新编码。原文件保持不变，媒体数据及全部 97 帧编码样本逐字节一致；分辨率仍为 960×960、24 fps、时长 4.041667 秒、无音轨。移动版 SHA-256 为 `3bca973bbba5787f01fd1c8b891dbd338c006fae7788399be62a4e606f518f90`。加载时显示 NH 海报，并在设置视频源之前明确启用 `autoplay`、`muted/defaultMuted`、`playsinline` 和 `webkit-playsinline`。

首帧等待时限为 10 秒，播放后连续无进度时限为 5 秒，视频阶段的可见时间总预算为 20 秒。隐藏页面时暂停视频，隐藏时长不计入预算；恢复后继续播放。自动播放被拒绝、媒体报错或达到时限时，播放 4.042 秒 NH 原生矢量动画，再用 640 毫秒过渡进入应用。回退动画也只累计可见时间。系统减少动态效果、应用减少动态效果和老年模式保留完整启动内容，仅简化末尾过渡。

每次完整打开、刷新或新标签页都会播放，内部页面切换不重播。没有跳过按钮，Escape 不会提前结束。启动期间下层页面保持 `inert`，完成后解除并恢复焦点；`#/town` 等深链仍进入原目标页。

| 验证范围 | 结果 | 关键证据 |
| --- | --- | --- |
| 核心启动浏览器检查 | 17/17 通过 | 真实 `ended=4.041667s`，渐变中间帧、焦点、刷新、深链、异常恢复；320 大字、390、1440 无溢出 |
| 手机仿真专项 | 10/10 通过 | iPhone 13 / Pixel 7 仿真：3.5 秒慢首包和约 10.1 秒连续慢播放均自然结束 |
| 拒播与停滞 | 通过 | Promise 拒绝、同步抛错、媒体错误；NH 回退约 4.05–4.08 秒，有连续中间帧；停滞约 5.13 秒触发 |
| 后台与恢复 | 通过 | 模拟隐藏 10.5 秒未消耗首帧预算；回退动画暂停后续播；隐藏期间晚到事件不会重复补偿时间 |
| 总预算 | 通过 | 持续虚假进度、无 `ended` 时，最终约 24.832 秒放行（含回退与过渡） |
| JavaScript 错误 | 0 | 两套浏览器检查均无未捕获错误 |
| 单元测试 | 35/35 通过 | 主任务执行 `pnpm test` |
| 构建 | 通过 | 主任务执行 `pnpm build` |
| 正式构建 / 项目子路径 | 通过 | 8 个页面、视频自然结束与刷新重播、地图 5 个点位、字体、完整路线选择—返程—保存—刷新恢复；无 JS / HTTP 错误 |

[核心检查证据](mobile-startup-v2.2.2/startup-results.json)与[手机仿真证据](mobile-startup-v2.2.2/mobile-startup-results.json)保留每项执行时间及 `lastRun`。核心总预算首次测得 28.316 秒，超过测试的 28 秒上限；在最终冻结代码上单项复验为 24.832 秒，未放宽断言。无法仅凭该次数据确认首次延迟原因。报告合并了全量检查和后续定向复验，不表示所有项目在同一次运行中重新执行。

本轮浏览器引擎为 Microsoft Edge / Chromium。iPhone 和 Pixel 描述符只模拟视口、触控及浏览器参数，**不是实机测试，也不是 Safari/WebKit 测试**。后台用测试专用 `document.hidden`、`visibilityState` 与 `visibilitychange` 模拟，未模拟手机操作系统挂起、后台计时器节流或低电量模式。仍需在真实 iPhone Safari 与 Android 浏览器上确认冷启动、后台恢复和弱网体验。

实现参考了 WebKit 对静音、无音轨视频及行内播放的说明，以及 Chrome 对静音自动播放与 `play()` 拒绝处理的说明；这些策略文档不等同于实机通过证明。[WebKit 视频策略](https://webkit.org/blog/6784/new-video-policies-for-ios/) · [Chrome 自动播放策略](https://developer.chrome.com/blog/autoplay/)

保留三张本轮真实测试截图：[延迟加载海报](mobile-startup-v2.2.2/delayed-poster.png)、[NH 回退动画中间帧](mobile-startup-v2.2.2/fallback-animation.png)、[自然播放后首页](mobile-startup-v2.2.2/revealed-home.png)。

[生产构建检查证据](mobile-startup-v2.2.2/production-results.json)来自本地正式构建的独立 HTTP 子路径服务。线上部署在发布后另行验证，不将本地结果表述为远端通过。

[2.2.2 发布页](https://github.com/private200516/baixi-yuji/releases/tag/v2.2.2) · [在线体验](https://private200516.github.io/baixi-yuji/#/ride)

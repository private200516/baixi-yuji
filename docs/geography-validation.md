# 第一轮验证记录

日期：2026-10-08。本地开发预览 http://127.0.0.1:5173/#/ride，构建预览 http://127.0.0.1:4173/#/ride；Windows，Edge headless / Playwright 1.63.0。两种预览均运行浏览器检查。截图是浏览器实际运行截图，不是设计渲染图。

| 检查 | 结果 | 证据/界限 |
|---|---|---|
| TypeScript | PASS | `pnpm typecheck` |
| 单元测试 | PASS | `pnpm test`，9项；包含旧独立数据回归、3项真实地理测试与本轮颜色对比度检查 |
| 构建 | PASS | `pnpm build`；地图引擎延迟加载，地图库chunk仍有大小警告，未隐瞒 |
| 浏览器 | PASS | `pnpm test:geography`，详细项见 geography-browser-results.json |
| 320/360/390/768/1440宽度 | PASS | 无横向溢出；地图标签不遮挡圆点、其他标签或控件；390标准与大字均有截图 |
| 200%文字 / 大字 | PASS | 320宽下不横向溢出，资料可纵向阅读；并非强行一屏 |
| 右侧凹槽 | PASS | 切换后边缘改变、图标槽位不动；窄屏从右侧展开菜单 |
| 操作一致性 | PASS | 地图、列表、摘要同步，连续选择最后一项生效 |
| 老年人模式 | PASS | 大字、无地图手势、直接选村；重新载入保留设置 |
| 键盘 | PASS | 抽屉键盘陷阱、Escape退出与按钮焦点恢复 |
| 异常状态 | PASS | HTTP503、无效GeoJSON、WebGL不可用、存储禁用均有明确降级 |
| 网络 | PASS | 正常运行只访问同源资源，无瓦片/定位/个人数据请求 |
| 数据 | PASS | 5点位于真实县界；road/water导出逐顶点与原数据一致 |
| 地理精度 | 限定 | 点位为OSM名称代表点，未实测，不代表公交站 |
| lint | NOT_RUN | 原工程无lint配置；没有虚构执行 |
| 真手机GPU、触摸、读屏器 | NOT_RUN | 需实机核对；桌面Edge测试不等于实机认证 |
| 原阶段 mobile-* 浏览器套件 | NOT_RUN | 面向保留的旧演示页面，不适用于本轮新默认入口 |
| 浅浮雕、DEM、建筑与路线方案 | NOT_RUN | 工作流第二轮，待用户确认 |

图源版权与核验材料见 data-sources.md。县界、道路、水系显示为样本；water relation未组装、道路分级未完整覆盖，不能声称完整地理数据库。

实际截图：`geography-screenshots/phone-standard.png`、`320.png`、`360.png`、`768.png`、`1440.png`、`390-large.png`、`phone-large.png`、`text-200.png`、`senior.png`、`map-fallback.png`。早期 geography-initial/390/1440 为临时检查图，非最终交付截图。

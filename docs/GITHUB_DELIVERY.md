# 源码与 DEMO 交付

源码包括 React / TypeScript 界面、CSS 动效、SVG 图形、已生成的本地网页字体及字体许可、锁定依赖、浏览器检查和可选 GitHub Pages 工作流模板。原始参考图片、重复导出、43 MB 原始 TTF、开发任务文本、本机缓存和凭据不进入仓库；本地文件保留。

## 构建与发布

1. 使用 Node.js 24、pnpm 11.25.0，执行 `pnpm install --frozen-lockfile`。
2. 执行 `pnpm test` 和 `pnpm build`。`dist/` 是独立静态 DEMO。
3. 源码提交到 `main` 分支，`dist/` 内全部文件提交到独立 `gh-pages` 分支的根目录。
4. GitHub 仓库 Settings → Pages 选择 Deploy from a branch、`gh-pages`、`/(root)`。

在线地址：[白溪舆记 DEMO](https://private200516.github.io/baixi-yuji/#/ride)。源码更新与 DEMO 更新分别提交；当前不宣称推送源码会自动更新演示站点。

现有凭据没有 `workflow` 权限，因此交付通过分支发布，不阻塞上线。`docs/github-pages-workflow.yml` 保留为可选自动化模板；有相应权限后，将它移到 `.github/workflows/pages.yml`，并把 Pages 来源改为 GitHub Actions 即可启用。模板使用锁文件和项目指定 pnpm 版本，只有部署步骤请求 Pages 与 OIDC 权限。

`vite.config.ts` 采用相对路径 `./`，应用使用 `#/ride` 等 hash 路由，字体、二维码和资源可从 GitHub Pages 项目子路径读取。不要双击 `dist/index.html` 通过 `file://` 打开；使用 `pnpm preview` 或任意静态 HTTP 服务器。

## 离线交付包

构建成功后运行 `python scripts/package-delivery.py`。脚本只复制明确列出的源码、文档和截图，生成：

- `.delivery/baixi-yuji-source.zip`：可重新安装、构建的源代码包。
- `.delivery/baixi-yuji-demo.zip`：`dist/` 内全部静态产物。
- `.delivery/baixi-yuji-design.zip`：15 个画板的 PNG、可编辑 SVG、结构化布局数据、字体与许可，以及复现导出的脚本。
- `.delivery/delivery-manifest.json`：每份交付文件的相对路径、大小与 SHA-256，便于审计和核对。

打包脚本不会删除或修改原始参考文件。`.delivery/` 不进入 Git，避免重复提交 ZIP；ZIP 作为 [v0.1.0 Release](https://github.com/private200516/baixi-yuji/releases/tag/v0.1.0) 附件交付。源代码 ZIP 同时包含设计目录。SVG、JSON 和 PNG 不冒充 Figma 原生 `.fig` 文件；当前原生 Figma 文件待选择目标团队后创建，设计资料的可编辑范围见 `design/README.md`。

## 项目边界

在线 DEMO 与本地版本功能一致。公交信息、路线和二维码为演示；语音依赖设备本地中文语音；偏好设置保存在浏览器本地。没有生产公交接口、支付、真实客服或票据核验，也没有通过真机或完整 WCAG 认证。

发布配置参考：[Vite 静态部署](https://vite.dev/guide/static-deploy.html)、[pnpm 持续集成](https://pnpm.io/continuous-integration)。

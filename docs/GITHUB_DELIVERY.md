# 乡序 2.0 · GitHub交付

源码位于 `main` 分支，静态Demo位于 `gh-pages` 分支，通过GitHub Pages的分支模式发布。当前版本标签为 `v2.0.1`，旧版 `v2.0.0` 与 `v0.1.0` 保留。

- [在线Demo](https://private200516.github.io/baixi-yuji/#/ride)
- [古镇地图](https://private200516.github.io/baixi-yuji/#/town)
- [2.0.1 Release](https://github.com/private200516/baixi-yuji/releases/tag/v2.0.1)
- [更新说明](releases/v2.0.1.md)

## 源码与构建

源码包含当前React/TypeScript界面、真实地图样本与来源记录、字体子集与OFL许可、动效、适老模式、依赖锁文件和验证脚本。原始任务书、政府资料本地副本、用户参考截图、原始TTF、开发缓存及凭据不进入发布包。

使用Node.js 24和pnpm 11.25.0：

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

运行开发服务器后可执行 `pnpm test:ui-motion`，生产子路径检查为 `node tests/ui-motion-production.mjs`。当前浏览器检查默认使用已安装的Edge，可用 `PLAYWRIGHT_CHANNEL` 指定浏览器通道。

`dist/`是完整静态Demo，采用hash路由与相对资源路径。通过HTTP服务器或 `pnpm preview` 访问，不直接双击HTML。`version.json`标明当前发布版本。

## 版本包

提交审阅后的源码并完成构建后，执行 `python scripts/package-release.py`，生成：

- `.delivery/v2.0.1/xiangxu-v2.0.1-source.zip`：精确归档当前Git提交。
- `.delivery/v2.0.1/xiangxu-v2.0.1-demo.zip`：构建产物。
- `.delivery/v2.0.1/SHA256SUMS.txt`：两个包的校验值。

交付包作为Release附件上传，不重复提交ZIP到源码仓库。发布源码不会自动更新Demo；需要单独将验证过的构建产物提交至 `gh-pages` 根目录，保留 `.nojekyll`，并等待Pages部署完成。

## 设计资料与边界

`design/`及 `scripts/package-delivery.py` 属于旧版设计交付。本次2.0没有同步更新Figma或导出新的 `.fig` 文件，不把旧设计资料标为2.0源稿。

地图使用已登记的OpenStreetMap样本并保留ODbL署名，原始样本保留下载字节以核对SHA-256。村落代表点并非正式车站；公交班次、车票和二维码仍是设计演示。没有接入实时公交、定位、支付或票据核验。

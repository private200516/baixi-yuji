# 乡序 · 仅优化原地图区域

日期：2026-10-09。用户最新明确要求：不要改变原先UI逻辑，只优化原地图，其他部分不动。本记录及当前README优先于此前第二轮整体重排方案；`src/geography/MobileApp.tsx`保留历史源码，但不再作为入口。

## 范围

入口恢复为`src/mobile/TransitApp.tsx`。保留原八个页面、右侧五项凹槽导航、候车方向、附近站点搜索、收藏、返程卡、扫码/车票、帮助、异常状态、字号、独立老年模式与本地偏好。候车页`RouteRiver`仍是线路示意加进入线路详情的按钮，不嵌套交互地图。

仅古镇页原`TownMap`矩形及其关联简介换为真实村落地图。点位选择仍更新原位置的介绍，原“查看公交线路”按钮仍回到线路详情。地图内部提供全县/村内、平面/立体与文字选村；没有增加页级导航、行程安排流程或全屏页面。

已经确认的“乡序”改名保留，包含页面、票面、服务弹层、朗读前缀和老年首页。补充字体使用同一Noto Sans SC与LXGW WenKai源文件，仅给旧子集缺少的122个品牌/地图字符增加Unicode范围字体；原有字形不替换。

## 改动核对

- 原四份手机CSS与`FontSizeControl.tsx`相对Git基线没有修改。
- `SeniorExperience.tsx`仅品牌文字变化。
- `TransitApp.tsx`除改名外，只调整地图导入、地图选点状态和`town`分支。
- 地图自有CSS限定`.legacy-town-map`，不引入`geography.css`或`mobile-product.css`。
- 共用真实地理组件及其数据未被改造为原演示公交站点。

## 验证

- `pnpm typecheck`：PASS。
- `pnpm test`：19项PASS，包含原业务数据模块与地理数据检查。
- `pnpm test:map-only`：12项PASS；最后对样式隔离断言作定向复验，合并报告明确记录。覆盖原流程、五槽导航、老年四任务、字体偏好、地图选点、加载地图前后样式与390/320布局。见`map-only-results.json`。
- `pnpm build`：PASS；地图懒加载JS约1.06 MB，构建保留超过500 kB的体积提示。
- `PLAYWRIGHT_CHANNEL=msedge node tests/map-only-production.mjs`：PASS。项目子路径下原8页、乡序标题、字体、地图Worker/数据与选村联动正常；无资源错误或未捕获异常。见`map-only-production-results.json`。
- 地图专项在390/320的中/大字号检查区域边界、5个真实点、失败时文字选择与系统减弱动效，均通过。

实际截图在`map-only-screenshots/`。地图专项截图为`map-depth-screenshots/legacy-*`，旧阶段的`round2-*`与`mobile-screenshots`保留作历史记录，不覆盖。

## 数据和未做事项

县界、道路、水系与五个村落代表点使用已登记的本地WGS84样本。仅1个已取得建筑轮廓，6米为示意高度，无DEM；没有虚构建筑或真实公交运营接入。原公交页面仍明确标注概念演示。

没有提交、推送、部署、修改线上Figma。没有增加原生安装包或宣称通过真实手机/Safari/读屏器认证。当前预览：http://127.0.0.1:5173/#/ride ；地图：http://127.0.0.1:5173/#/town 。

# 小游戏开发工作区

统一入口为 `index.html`，首页菜单由 `configs/game-manifest.json` 驱动（卡片的 `group` 字段决定出现在哪个分区）。
当前共 28 个可运行游戏：20 个 P2，8 个 P1。

## 本地运行

不要直接双击 `index.html` 用 `file:///` 打开。

项目使用 ES Module，文件协议下浏览器会拦截模块脚本。

请在 VS Code 里运行任务 `启动本地小游戏服务器`，然后访问：

- `http://localhost:8123/`

## 检查与测试

游戏本身无需构建；Node.js 22+ 只用于开发检查：

```bash
npm install
npm run lint   # ESLint
npm test       # node:test，覆盖共享模块、配置完整性和示例游戏逻辑
npm run check  # 以上两项，CI 在每次 push / PR 时执行
```

## 离线与安装

站点是一个 PWA：`manifest.webmanifest` + 根目录 `sw.js`（网络优先，失败时读缓存）。
首页在首次访问时缓存；其余游戏联网玩过一次后即可离线打开，未缓存的游戏离线时会显示提示页。

## 当前游戏列表

低龄陪玩：

1. 小车拍一拍（P1）- `src/car/index.html`
2. 动物叫叫乐（P1）- `src/animal/index.html`
3. 气球点点乐（P1）- `src/balloon/index.html`
4. 颜色点点看（P1）- `src/colortap/index.html`
5. 形状拍拍乐（P1）- `src/shape/index.html`
6. 数字点点乐（P1）- `src/numbertap/index.html`

启蒙益智：

7. 字母拼读启蒙（P2）- `src/spell/index.html`
8. 颜色形状分类（P2）- `src/sort/index.html`
9. 翻牌配对（P2）- `src/memory/index.html`
10. 泡泡连线救援（P2）- `src/bubble/index.html`
11. 涂鸦互动动画（P2）- `src/doodle/index.html`
12. 动物合唱团（P2）- `src/choir/index.html`
13. 星空观测员（P2）- `src/star/index.html`
14. 水果计数乐（P1）- `src/fruitcount/index.html`

生活探索：

15. 小小厨师配餐（P2）- `src/chef/index.html`
16. 小小邮差送信（P2）- `src/postman/index.html`
17. 果园分拣员（P2）- `src/fruit/index.html`
18. 小小宠物诊所（P2）- `src/pet/index.html`
19. 迷你农场小镇（P2）- `src/farm/index.html`
20. 海底清洁队（P2）- `src/ocean/index.html`
21. 森林巡护员（P2）- `src/forest/index.html`
22. 超市购物（P1）- `src/market/index.html`

反应闯关：

23. 算术闯关（P2）- `src/math/index.html`
24. 迷宫解谜（P2）- `src/maze/index.html`
25. 节奏点点乐（P2）- `src/rhythm/index.html`
26. 亲子跑酷（P2）- `src/runner/index.html`
27. 打地鼠升级版（P2）- `src/whac/index.html`
28. 灯塔守护者（P2）- `src/lighthouse/index.html`

## 关键目录

- `index.html`：统一入口首页
- `src/home/main.js`：首页渲染与全局设置同步
- `src/home/styles.css`：首页样式
- `src/shared/`：跨游戏共享模块，新游戏请直接复用：
  - `audio` 音效、`speech` 语音播报、`tap` 触屏/键盘点按
  - `settings` 全局设置与护眼模式、`storage` 安全读写 localStorage
  - `random` 种子随机数（每日挑战）、`timers` 页面隐藏时自动暂停的游戏计时器
  - `config` 关卡配置加载与加载失败提示、`dom` 跳过无变化的重绘（`setHtml`）
  - `findGame` 低龄“找一找”游戏引擎（车/动物/颜色/气球/形状/数字 6 个游戏只剩配置）
  - `pwa` Service Worker 注册
- `src/<game>/`：各游戏独立页面与逻辑
- `tests/`：`node:test` 测试
- `configs/levels/`：关卡与模板配置
- `configs/game-manifest.json`：首页卡片配置
- `docs/game-designs/`：设计文档
- `docs/implementation/`：开发记录与阶段说明

## 实现文档索引

0. `docs/implementation/GAMEPLAY-FIRST-UI-GUIDELINE.md`
1. `docs/implementation/01-whac-a-mole-dev-plan.md`
2. `docs/implementation/02-memory-match-dev-plan.md`
3. `docs/implementation/03-runner-dev-plan.md`
4. `docs/implementation/04-color-shape-sort-dev-plan.md`
5. `docs/implementation/05-rhythm-tap-dev-plan.md`
6. `docs/implementation/06-mini-farm-town-dev-plan.md`
7. `docs/implementation/07-literacy-spell-dev-plan.md`
8. `docs/implementation/08-math-adventure-dev-plan.md`
9. `docs/implementation/09-maze-puzzle-dev-plan.md`
10. `docs/implementation/10-doodle-animation-dev-plan.md`
11. `docs/implementation/11-bubble-link-rescue-dev-plan.md`
12. `docs/implementation/12-chef-plating-dev-plan.md`
13. `docs/implementation/13-animal-choir-dev-plan.md`
14. `docs/implementation/14-lighthouse-keeper-dev-plan.md`
15. `docs/implementation/15-postman-delivery-dev-plan.md`
16. `docs/implementation/16-fruit-sorter-dev-plan.md`
17. `docs/implementation/17-ocean-cleanup-dev-plan.md`
18. `docs/implementation/18-pet-clinic-dev-plan.md`
19. `docs/implementation/19-forest-ranger-dev-plan.md`
20. `docs/implementation/20-star-observer-dev-plan.md`

## 交互规范

1. 所有核心操作优先支持触屏点按，不依赖 hover。
2. 移动端与桌面端采用一致的按钮反馈。
3. 新增功能默认先验收触屏，再验收桌面。

## 下一步建议

1. 为各游戏统一补一轮 P3 优先级排序与排期。
2. 增加跨游戏统一成就体系（徽章/贴纸）。
3. 评估本地榜到云端榜迁移方案。

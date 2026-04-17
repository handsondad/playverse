# 小游戏开发工作区

统一入口为 `index.html`，首页菜单由 `configs/game-manifest.json` 驱动。
当前共 25 个可运行游戏：20 个 P2，5 个低龄陪玩 P1。

## 本地运行

不要直接双击 `index.html` 用 `file:///` 打开。

项目使用 ES Module，文件协议下浏览器会拦截模块脚本。

请在 VS Code 里运行任务 `启动本地小游戏服务器`，然后访问：

- `http://localhost:8123/`

## 当前游戏列表

1. 小车拍一拍（P1）- `src/car/index.html`（低龄陪玩 + 大卡片车辆）
2. 动物叫叫乐（P1）- `src/animal/index.html`（低龄陪玩 + 认动物）
3. 颜色点点看（P1）- `src/colortap/index.html`（低龄陪玩 + 认颜色）
4. 气球点点乐（P1）- `src/balloon/index.html`（低龄陪玩 + 认颜色气球）
5. 形状拍拍乐（P1）- `src/shape/index.html`（低龄陪玩 + 认形状）
6. 算术闯关（P2）- `src/math/index.html`
7. 迷宫解谜（P2）- `src/maze/index.html`
8. 涂鸦互动动画（P2）- `src/doodle/index.html`
9. 字母拼读启蒙（P2）- `src/spell/index.html`
10. 迷你农场小镇（P2）- `src/farm/index.html`
11. 节奏点点乐（P2）- `src/rhythm/index.html`
12. 亲子跑酷（P2）- `src/runner/index.html`
13. 颜色形状分类（P2）- `src/sort/index.html`
14. 翻牌配对（P2）- `src/memory/index.html`
15. 打地鼠升级版（P2）- `src/whac/index.html`
16. 泡泡连线救援（P2）- `src/bubble/index.html`
17. 小小厨师配餐（P2）- `src/chef/index.html`（主题菜单 + 拖拽摆盘）
18. 动物合唱团（P2）- `src/choir/index.html`（主题音色 + 模仿轨迹 + 完美奖励）
19. 灯塔守护者（P2）- `src/lighthouse/index.html`（天气事件 + 干扰船挑战）
20. 小小邮差送信（P2）- `src/postman/index.html`（特殊信件 + 每日路线）
21. 果园分拣员（P2）- `src/fruit/index.html`（特殊水果 + 主题果园）
22. 海底清洁队（P2）- `src/ocean/index.html`（特殊漂浮物 + 主题海域）
23. 小小宠物诊所（P2）- `src/pet/index.html`（特殊病例 + 主题诊所）
24. 森林巡护员（P2）- `src/forest/index.html`（特殊线索 + 主题林区）
25. 星空观测员（P2）- `src/star/index.html`（特殊天象 + 主题星域）

## 关键目录

- `index.html`：统一入口首页
- `src/home/main.js`：首页渲染与全局设置同步
- `src/home/styles.css`：首页样式
- `src/<game>/`：各游戏独立页面与逻辑
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

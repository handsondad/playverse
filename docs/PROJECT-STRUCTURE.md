# 项目结构说明

## 一、入口与站点文件

- `index.html`：统一入口首页（分区由 `data-group` 对应 manifest 的 `group`）
- `manifest.webmanifest` / `sw.js` / `icons/`：PWA 安装与离线缓存
- `configs/game-manifest.json`：首页卡片数据源（含 `group`、`theme`、`stage` 等）

## 二、源码目录

```text
src/
  home/
    main.js                 # 按 group 渲染菜单；加载失败时提示刷新
    styles.css
  shared/                   # 跨游戏复用，新游戏优先用这里的模块
    base.css                # 所有页面先于自身 styles.css 引入：box-sizing、触屏优化、按钮字体继承、键盘焦点环
    audio.js                # Web Audio 音效
    settings.js             # 全局/本地设置合并（护眼、语音、播报粒度）
    settingsButtons.js      # 语音/播报/护眼三个按钮：文案、切换、保存、跨标签页同步
    restReminder.js         # 连续游玩休息提醒（#restReminder 面板，各游戏共用计时）
    speech.js               # 语音播报预设与连续拼读播报（speak.sequence）
    tap.js                  # 触屏/键盘点按去重
    storage.js              # 安全读写 localStorage；readNumbers 读统计，readUnlocks 读难度解锁
    random.js               # 种子随机；hashText 选每日挑战（不能换成 hashSeed）
    timers.js               # 页面隐藏时暂停的 setInterval
    config.js               # 关卡 JSON 加载与失败遮罩
    dom.js                  # setHtml：相同 markup 跳过重绘；setText：播报区域文字不变时不重写；
                            #   syncKeyed/setClass/setStyle：每帧渲染按 id 复用节点（跑酷、节奏）
    findGame.js             # 低龄「找一找」通用引擎
    queueGame.js            # 「队列分拣」通用引擎 + 页面装配
    pwa.js                  # Service Worker 注册
  <game>/
    index.html
    main.js                 # 页面装配（UI、设置、事件）
    styles.css
    *Game.js                # 核心逻辑（已合并的游戏没有这个文件）
    rules.js                # 队列分拣类游戏的规则配置
```

当前约 28 个游戏目录。两类游戏已合并为共享引擎，`main.js` 只传配置：

- 低龄陪玩（`car` / `animal` / `colortap` / `balloon` / `shape` / `numbertap`）用 `mountFindGame`。
- 队列分拣（`fruit` / `ocean` / `pet` / `forest` / `star` / `postman`）用 `mountQueueGame(rules, ui)`：`rules.js` 放计分、特殊物品、天气和事件文案，`main.js` 放 DOM id、配色、提示文案和音效。`lighthouse` 玩法不同，未合并。

## 三、配置与测试

```text
configs/
  game-manifest.json
  levels/                   # 各游戏关卡 JSON（无内置 fallback）
tests/
  shared.test.js            # 随机数、设置与设置按钮、存储记录、语音序列、点按代理、定时器、FindGame、dom 工具
  configs.test.js           # manifest 与分区链接链、loadGameConfig 键完整、无障碍与共享模块规范守护
  queue-game.test.js        # 队列分拣引擎：种子可复现 + 计分规则
```

开发检查：`npm run lint` / `npm test` / `npm run check`（Node 22+）。

页面冒烟：`npm run smoke` 用无头 Chrome/Edge 打开首页和全部游戏页，出现未捕获异常、`console.error`、资源 404 或配置错误遮罩即失败；游戏页还会切换一次语音按钮并点「开始」。找不到浏览器时用 `CHROME_PATH` 指定。全程约 1.5 分钟。

## 四、文档与脚本

```text
docs/
  game-designs/             # 设计文档
  implementation/           # 开发计划与 UI 指南
  PROJECT-STRUCTURE.md
scripts/
  serve.ps1                 # 本地静态服务（禁止路径穿越；支持 .webmanifest）
  smoke.mjs                 # 页面冒烟测试（npm run smoke），无额外依赖
.github/workflows/static.yml
  # PR/push：lint + test + smoke；main：打包 _site（仅站点文件）部署 Pages
```

## 五、新增游戏约定

1. 在 `src/<game>/` 建 `index.html`、`main.js`、`styles.css`，以及可选的 `*Game.js`；`index.html` 里先引入 `../shared/base.css` 再引入 `./styles.css`。焦点环颜色可用 `--focus-ring` 覆盖，不要写 `outline: none`。
2. 需要关卡时在 `configs/levels/` 增加 JSON，用 `loadGameConfig` 加载；失败时用 `showConfigError`，不要再塞内置 fallback。
3. 在 `configs/game-manifest.json` 增加卡片，填好 `group`（`toddler` / `cognition` / `life` / `action`）和 `theme`。
4. 复用 `src/shared/`：设置、语音、点按、存储、随机数、计时器；低龄「找卡片」类可直接用 `mountFindGame`，「队列分拣」类可直接用 `mountQueueGame`。设置按钮用 `mountSettingsButtons`，游戏自己的时长提示等放进 `onChange`；统计/最高分用 `readNumbers(key, 默认值)`。
5. 需要计时循环时用 `setGameInterval`，需要频繁重绘按钮区时用 `setHtml`。
6. 反馈文字放在一个 `role="status"` 元素里并用 `setText` 写入；统计面板（时间、分数等每秒变化的区域）不要加 `aria-live`。

## 六、首页维护约定

1. 卡片信息只维护在 `configs/game-manifest.json`，不要写死进 `index.html`。
2. `group` 必须与首页 `data-group` 一致；分区顺序以 manifest 中卡片顺序为准。
3. 每次功能迭代后更新卡片上的 `updated` 与阶段标签（P1/P2/P3）。

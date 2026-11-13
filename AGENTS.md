# AGENTS.md

给 AI 助手和开发者的项目规范。Playverse 是一组儿童网页小游戏，37 个游戏共用同一套页面骨架、视觉风格和技术底座。改任何东西之前先读这份文件：**新代码要和已有游戏长得一样、用起来一样、写法也一样**。

本文件与其他文档冲突时，以本文件为准（例如 `docs/game-designs/00-README.md` 里的 Phaser、`src/core/` 等是早期设想，没有采用）。目录地图见 `docs/PROJECT-STRUCTURE.md`，布局走查清单见 `docs/implementation/GAMEPLAY-FIRST-UI-GUIDELINE.md`。

## 1. 技术底线

- 纯静态站：原生 HTML + CSS + ES Module，**没有构建步骤、没有运行时依赖**。不要引入框架、打包器、TypeScript、CSS 预处理器或 CDN 脚本。
- `package.json` 里的依赖只用于 lint 和测试（Node 22+），不会进入网站。
- 必须通过 HTTP 访问（`file://` 下模块脚本会被拦截）。本地启动服务：运行 VS Code 任务「启动本地小游戏服务器」或执行 `powershell -ExecutionPolicy Bypass -File scripts/serve.ps1`，浏览器访问 `http://localhost:8123/`。
- 部署：push 到 `main` 后 GitHub Actions 依次跑 lint、单元测试、页面冒烟测试，全部通过才发布到 GitHub Pages。只发布 `index.html`、`manifest.webmanifest`、`sw.js`、`icons/`、`src/`、`configs/`。
- PWA：`sw.js` 网络优先、失败读缓存，玩过的页面自动可离线，**不需要维护文件清单**。只有首页外壳在 `SHELL` 里预缓存。

## 2. 每个游戏的组成

```text
src/<game>/index.html     页面骨架（见第 3 节）
src/<game>/styles.css     本游戏样式（在 shared/base.css 之后引入）
src/<game>/main.js        页面装配：取 DOM、绑事件、渲染
src/<game>/<name>Game.js  可选，纯游戏逻辑：不碰 DOM，通过回调把状态交给 main.js
configs/levels/*.json     关卡、主题、题库等内容数据
```

- 游戏规则和界面分开：逻辑类可以在 node 测试里直接 new 出来跑。
- 内容（关卡、题目、主题、文案池）放 JSON，用 `loadGameConfig(url, 必需键)` 加载；失败时 `showConfigError`，**不要在 JS 里塞内置 fallback 数据**。
- 两类游戏已经合并为共享引擎，同类新游戏直接用，不要另写一套：
  - 低龄「找一找」：`mountFindGame`（`src/shared/findGame.js`），游戏目录里只放配置。
  - 「队列分拣」：`mountQueueGame(rules, ui)`（`src/shared/queueGame.js`），规则放 `rules.js`，`main.js` 只放 DOM id、配色、文案、音效。

## 3. 页面骨架

所有页面都是 `lang="zh-CN"`，`<head>` 固定写法：先 `../shared/base.css` 再 `./styles.css`，图标、`manifest`、`theme-color="#66a2df"`、`../../src/shared/pwa.js`。标题格式为「游戏名 - 儿童小游戏」，低龄 P1 游戏用「游戏名 - 亲子小游戏」。

### 标准游戏页（启蒙益智 / 生活探索 / 反应闯关）

```text
main.<game>-shell
  header.hero              h1 游戏名；#guideText（role="status"）一句话玩法/当前引导；
                           .hero-links：「返回首页 | 同分区下一个游戏」
  section.play-stage       桌面左右两栏，移动端单列、顺序不变
    section.selector-panel 先选什么：.level-buttons / .theme-buttons（大按钮组，选中态明显）
                           <strong class="action-title">开始操作</strong>
                           .selector-actions：#startBtn #retryBtn #dailyBtn
                           #selectorHint 选择提示
    section.game-panel     .stats 实时状态（紧贴游戏区）→ 主画面 → 道具/操作按钮
  section.support-strip    #voiceBtn #narrationBtn #parentModeBtn，以及数据统计等辅助信息
  section.result[hidden]   结算：#resultTitle #resultText
```

### 低龄陪玩页

```text
main.toddler-shell
  header.hero              h1；一句话玩法；.hero-note「点错也没关系」类安抚语；.hero-links
  section.play-stage
    section.prompt-card    「找这个」+ #targetBadge + #guideText + 换一个/重新来
    section.board-panel    #celebration 庆祝 → .stats → #board 大卡片 → #feedback
  section.support-strip    #statsToggleBtn「家长查看」（统计默认收起）、#voiceBtn、#parentModeBtn
```

### 布局原则

1. 第一眼看到怎么玩，不是设置和统计。主路径最短：选难度/主题 → 点开始 → 立即进入游戏。
2. 「选择项」和「开始操作」必须一眼可分：单独标题、独立卡片背景、不同底色，至少满足两条。
3. 开始按钮是页面最醒目的按钮，但不能压过主玩法区。
4. 设置、统计、排行榜放在底部 `support-strip`，视觉上弱化。
5. 选择项用按钮组，不用下拉框。

## 4. 视觉风格

- 字体：`font-family: "Microsoft YaHei", "PingFang SC", sans-serif;`；`button { font: inherit; }` 与 `html, body { touch-action: manipulation; }` 已由 `base.css` 统一提供。
- 每个游戏在 `:root` 定义自己的色板变量（`--bg`、`--panel`、`--text`、`--brand`、`--brand2`、`--shadow` 等），颜色只从变量取。整体是明亮、柔和的浅色系；背景用浅色线性渐变叠两三个半透明 `radial-gradient` 光斑。
- 面板：`rgba(255, 255, 255, 0.9)` 半透明白底、圆角 `24px`、柔和投影 `0 10px 20px var(--shadow)`、2px 浅色描边。
- 按钮：圆角 `16–18px`，粗体，底部实体投影（如 `0 6px 0 rgba(..., 0.18)`），按下时下沉并有即时高亮；过渡 `0.18s ease`。
- 触屏优先：可点区域高度不低于 `48px`（常用 `52–54px`），`html, body` 设 `touch-action: manipulation`；功能不能依赖 hover。
- 响应式：主容器 `width: min(1080px, 100%)`；常用断点 `920px` / `760px` / `560px`，窄屏改单列但顺序不变。
- 图标、角色、道具都用 emoji，不引入图片素材（`icons/` 只放 PWA 图标）。
- 键盘焦点环由 `base.css` 统一提供；**不要写 `outline: none`**，需要换颜色就覆盖 `--focus-ring`。
- 动画要轻：庆祝、弹跳点到为止，不闪烁、不大面积抖动。

## 5. 文案与儿童友好

- 全部简体中文，短句、口语、鼓励式：「点错也没关系」「再试一次」，不用「失败」「错误」之类责备词。
- 一句话说清下一步做什么；动态引导写进 `#guideText`，不在游戏区额外弹窗打断。
- 每个页面底部都有三项设置，全站共享（在一个游戏里改，其他游戏跟着变）：
  - 语音引导：开 / 关；
  - 播报模式：关键 / 详细（低龄页没有这一项）；
  - 护眼模式：标准 / 柔和 / 安静。柔和模式语速放慢、音量降低；安静模式关音效，只播报带 `force` 的必要提示。
- 有长时间连续游玩可能的游戏，接入休息提醒（页面放 `#restReminder` 面板，用 `mountRestReminder`）。
- 进度只存在本机浏览器，不做账号、不上传数据、不接广告和第三方统计。

## 6. 必须复用的共享模块（`src/shared/`）

| 需求 | 用这个 | 不要 |
| --- | --- | --- |
| 按钮点按 | `bindSoftTap` / `createSoftTap({ flashMs })`、列表用 `bindDelegatedTap` | 只绑 `pointerup`（键盘用不了）或同时绑 click 导致触发两次 |
| 三个设置按钮 | `mountSettingsButtons({ storageKey, settings, bindTap, onChange, announce })` | 每个游戏自己写切换逻辑 |
| 读写设置 | `loadSettings` / `saveSettings` | 直接读 `localStorage` |
| 语音 | `createSpeaker(settings, SPEECH_PRESETS.xxx)`，多段连续拼读用 `speak.sequence(...)` | 直接 `new SpeechSynthesisUtterance`（有测试拦截） |
| 音效 | `createGameAudio({ getCareMode })` | 自建 AudioContext（有测试拦截） |
| 存储 | `readJson` / `writeJson` / `readNumber` / `readNumbers(key, 默认值)` / `readUnlocks` | 在别处碰 `localStorage`（有测试拦截） |
| 计时循环 | `setGameInterval`（页面隐藏时自动暂停） | 裸 `setInterval`（有测试拦截） |
| 每帧/频繁渲染 | `setHtml`、`setText`、`syncKeyed` / `setClass` / `setStyle` | 每帧整块重写 `innerHTML` |
| 关卡数据 | `loadGameConfig` + `showConfigError` | 内置 fallback |
| 每日挑战 | 种子形如 `${todayString()}|关卡|主题|游戏`，选关用 `hashText`，随机用 `createSeededRandom` | 改动哈希算法或种子格式（会改掉所有人的今日挑战，测试已固定输出值） |

## 7. 无障碍约定

- 反馈文字放进一个 `role="status"` 元素，用 `setText` 写入（文字相同不重写，避免读屏重复播报）。
- 每秒变化的统计面板（时间、分数等）**不要**加 `aria-live`。
- 只有图标的按钮要有文字或 `aria-label`；游戏区容器给 `aria-label`。

## 8. 存储兼容

- 键名格式 `<游戏>-settings`、`<游戏>-stats`、`<游戏>-progress`、`<游戏>-best-score` 等；全局设置 `kids-global-settings`，休息计时 `kids-playtime-tracker`。
- **不要重命名已有的键，也不要改已有字段的含义**，否则孩子的进度会丢。新增字段在读取时给默认值。

## 9. 新增一个游戏

1. 按第 2、3 节建 `src/<game>/`；能套用 `mountFindGame` / `mountQueueGame` 的直接套用。
2. 内容放 `configs/levels/<game>.levels.json`。
3. 在 `configs/game-manifest.json` 加卡片：`id`、`title`、`description`（一句话玩法）、`icon`（emoji）、`href`、`stage`（P1/P2/P3）、`updated`、`group`（`toddler` / `cognition` / `life` / `action`）、`theme`。首页卡片只从这里读，不要写进 `index.html`。
4. 把新游戏接进同分区的「下一个游戏」链接链（按 `game-manifest.json` 同组顺序闭环，测试会自动校验）。
5. 在 `README.md` 对应分区补上新游戏名字（`README.md` 只写面向家长与玩家的项目介绍，不写本地运行、目录结构或开发说明）。
6. 走一遍 `GAMEPLAY-FIRST-UI-GUIDELINE.md` 的检查清单，并在手机宽度下用触屏方式试玩。

## 10. 提交前检查

```bash
npm run check   # ESLint + node:test（共享模块、配置完整性、引擎规则）
npm run smoke   # 无头 Chrome/Edge 打开全部页面，报错、404、配置遮罩都会失败
```

- 改了逻辑就补或改 `tests/` 里的测试；改了页面至少跑一次 `npm run smoke`。
- 重构要证明行为没变：和改动前的版本对比实际页面输出，而不是只看代码。
- 提交说明用中文，带类型前缀：`feat:` `fix:` `refactor:` `perf:` `style:` `a11y:` `test:` `chore:` `docs:`。
- 用户能看到的变化更新 `README.md`；目录或共享模块变化更新 `docs/PROJECT-STRUCTURE.md`；规范变化更新本文件。
- 换行符由 git 自动转换（`core.autocrlf`），编辑时保持文件原有换行。

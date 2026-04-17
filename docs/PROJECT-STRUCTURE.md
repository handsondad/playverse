# 项目结构说明

## 一、入口与页面

- `index.html`：统一入口首页（菜单导航）
- `src/memory/index.html`：翻牌配对页面
- `src/whac/index.html`：打地鼠升级版页面
- `configs/game-manifest.json`：首页菜单数据源

## 二、源码目录

```text
src/
  home/
    styles.css              # 首页样式
    main.js                 # 首页菜单渲染（读取 manifest）
  memory/
    index.html              # 翻牌配对入口页
    main.js                 # 翻牌配对页面装配
    styles.css              # 翻牌配对样式
    memoryGame.js           # 翻牌配对核心逻辑
  whac/
    index.html              # 打地鼠入口页
    main.js                 # 打地鼠页面装配
    styles.css              # 打地鼠样式
    whacGame.js             # 打地鼠核心逻辑
```

## 三、配置目录

```text
configs/
  levels/
    memory-match.levels.json
    whac-a-mole.levels.json
```

## 四、文档目录

```text
docs/
  game-designs/             # 每个游戏的设计文档
  implementation/           # 各游戏开发执行计划
  PROJECT-STRUCTURE.md      # 当前结构说明（本文件）
```

## 五、新增游戏约定

1. 新增一个独立页面：`<game-name>.html`
2. 新增页面逻辑和样式：`src/<game-name>/`
3. 新增核心逻辑：`src/<game>/<game>Game.js`
4. 新增配置：`configs/levels/<game>.levels.json`
5. 在 `index.html` 菜单新增入口卡片

## 六、首页维护约定

1. 每个游戏卡片包含开发阶段标签（如 P1/P2/P3）。
2. 每次功能迭代后同步更新卡片上的更新时间。
3. 首页底部保留“最后更新”说明，便于快速确认版本状态。
4. 首页卡片信息统一在 `configs/game-manifest.json` 维护，不直接写死在 `index.html`。

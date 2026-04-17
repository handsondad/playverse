# 儿童小游戏设计文档总览

本目录包含 20 个可独立开发的小游戏设计文档，目标是支持逐个实现、快速上线、持续迭代。

## 使用方式

1. 当前工作区 20 个项目均已落地到可运行版本，可优先复用已验证的页面骨架与配置结构。
2. 每个项目按文档中的里程碑继续推进：P2 打磨 -> P3 内容扩展。
3. 完成一个项目后，将通用模块持续沉淀复用（音效系统、关卡配置、存档系统）。

## 项目列表

1. `01-whac-a-mole-plus.md` - 打地鼠升级版（P2）
2. `02-memory-match.md` - 翻牌配对（P2）
3. `03-endless-runner.md` - 横版跑酷收集（P2）
4. `04-color-shape-sort.md` - 颜色/形状分类（P2）
5. `05-rhythm-tap.md` - 音乐节奏点击（P2）
6. `06-mini-farm-town.md` - 迷你农场/小镇（P2）
7. `07-literacy-spell.md` - 字母/拼音启蒙（P2）
8. `08-math-adventure.md` - 算术闯关（P2）
9. `09-maze-puzzle.md` - 迷宫解谜（P2）
10. `10-doodle-animation.md` - 涂鸦互动动画（P2）
11. `11-bubble-link-rescue.md` - 泡泡连线救援（P2）
12. `12-little-chef-plating.md` - 小小厨师配餐（P2）
13. `13-animal-choir.md` - 动物合唱团（P2）
14. `14-lighthouse-keeper.md` - 灯塔守护者（P2）
15. `15-postman-delivery.md` - 小小邮差送信（P2）
16. `16-fruit-sorter.md` - 果园分拣员（P2）
17. `17-ocean-cleanup.md` - 海底清洁队（P2）
18. `18-pet-clinic.md` - 小小宠物诊所（P2）
19. `19-forest-ranger.md` - 森林巡护员（P2）
20. `20-star-observer.md` - 星空观测员（P2）

当前已落地：`01-20` 全部项目均已接入工作区并可运行；其中 `11-20` 已补齐特殊机制、主题包或天气系统等增强内容。

## 统一技术建议

- 平台：Web（移动端优先，兼容桌面）。
- 引擎建议：原生 Canvas 或 Phaser。
- 数据驱动：关卡、奖励、难度、主题全部配置化。
- 存档：本地存储（后续可接云端）。

## 统一目录建议

```text
src/
  core/          # 通用逻辑（计时、状态机、配置加载、存档）
  games/         # 每个游戏独立子目录
  assets/        # 图片、音效、字体
  ui/            # 通用 UI 组件
configs/
  levels/        # 关卡配置
  themes/        # 主题配置
docs/game-designs/
```

## 建议开发顺序

1. 02 翻牌配对
2. 01 打地鼠升级版
3. 04 颜色/形状分类
4. 03 横版跑酷
5. 08 算术闯关
6. 09 迷宫解谜
7. 07 字母/拼音启蒙
8. 05 节奏点击
9. 10 涂鸦互动动画
10. 06 迷你农场/小镇

# 小游戏合集 · 全新重制版

> 10 个用纯原生 HTML / CSS / JavaScript（Canvas 2D）从零重制的网页小游戏，零依赖、可离线、同时支持键盘与手机触屏。

## 在线试玩

打开 GitHub Pages 地址即可游玩（无需安装任何东西）：

**https://skymoon173.github.io/mini-game-collection/**

## 游戏列表

| # | 游戏 | 类型 | 说明 |
|---|------|------|------|
| 1 | [霓虹躲避](games/dodge-blocks/index.html) | 动作生存 | 闪避四面涌来的方块，拾取短暂无敌，难度随时间飙升 |
| 2 | [星际射击](games/sky-shooter/index.html) | 飞行射击 | 三种敌机、双发与护盾道具、连击倍率 |
| 3 | [火柴人烈焰跑酷](games/stickman-runner/index.html) | 跑酷动作 | 二段跳 / 滑铲、火焰拖尾、昼夜循环 |
| 4 | [霓虹贪吃蛇](games/snake/index.html) | 经典街机 | 发光渐变蛇身、限时金色食物、粒子特效 |
| 5 | [立体贪吃蛇](games/iso-snake/index.html) | 立体益智 | 等距投影 3D 悬浮棋盘，Q/E 旋转视角 |
| 6 | [合成数字 2048](games/merge-2048/index.html) | 数字益智 | 平滑动画、撤销 5 步、触屏滑动 |
| 7 | [合成猫咪](games/merge-cats/index.html) | 合成休闲 | 十级猫咪图鉴，从奶猫合成到猫王 |
| 8 | [霓虹数独](games/sudoku/index.html) | 逻辑推理 | 三档难度、唯一解、笔记 / 提示 / 计时 |
| 9 | [星空农场](games/farm-tycoon/index.html) | 经营养成 | 种植买卖、天气行情、随机事件、扩建升级 |
| 10 | [星空塔罗](games/tarot/index.html) | 占卜休闲 | 22 张大阿卡纳 SVG 手绘牌面、三牌牌阵 |

## 本地运行

无需构建、无需 npm：

1. 直接双击根目录 `index.html`，或
2. 用任意静态服务器打开（推荐，部分浏览器 API 更稳定）：

```bash
python -m http.server 8000
# 浏览器访问 http://localhost:8000
```

每个游戏都位于 `games/<游戏名>/` 下，由 `index.html`、`style.css`、`game.js` 三个文件组成，可独立运行。

## 目录结构

```
.
├── index.html            # 游戏门户（游戏列表入口）
├── portal.css / portal.js
├── games/                # 全新重制的 10 个网页游戏
│   ├── dodge-blocks/
│   ├── sky-shooter/
│   ├── stickman-runner/
│   ├── snake/
│   ├── iso-snake/
│   ├── merge-2048/
│   ├── merge-cats/
│   ├── sudoku/
│   ├── farm-tycoon/
│   └── tarot/
├── 小游戏*/               # 历年原始版本（Python / 早期网页版），作为存档保留
└── LICENSE               # MIT 许可证
```

## 技术说明

- 纯 Vanilla JS（ES6+），每个游戏 IIFE 隔离作用域，`requestAnimationFrame` + delta time
- 所有美术均为 Canvas 2D / SVG / CSS 程序化绘制，**无任何外部图片、字体、CDN 或第三方库**
- 最高分与存档使用 `localStorage`
- 统一深色霓虹视觉风格，桌面键盘 + 移动端触屏双适配

存档目录 `小游戏*/` 中保留了 2024 年起用 Python（pygame / tkinter）编写的原始版本，以及少量早期网页版，仅供怀旧与对比参考。其中 `小游戏59-自动作曲` 内捆绑的 Recorder.js（MIT）与 opus-recorder（MIT，Opus 编解码为 BSD）保留其各自许可证，详见 [LICENSE](LICENSE) 末尾的第三方声明。

## 许可证

[MIT License](LICENSE) © 2026 Joney Lee (skymoon173)

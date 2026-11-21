---
name: guiji-cutting-video
description: 用本地 3D 渲染制作物体逐档切成碎块的竖屏解压视频，包含刀数、碎块计数和同步刀声。用于生成「切 10 刀 vs 切 100 刀」「把物体切成小方块」这类 ASMR 视频或更换物体重做同类视频。
---

# 逐档切割解压视频

用户给物体、切刀档位和片长时按其设定做。只给物体时，先用 10、50、100 刀三档，每档给足时间看清换向。每轮从完整物体开始，先竖切，再横切，最后沿与第一轮竖切垂直的方向下刀。前两轮切开后维持物体外形，最后一个方向每切一刀，从靠近镜头的一侧掉下一排块，并露出竖直切面。最后留约 0.7 秒看结果。

## 配置与导出

本地需要 Node.js、FFmpeg 和 Chrome 或 Edge。首次运行时在 Windows 安装固定版本依赖：

    $renderDeps = Join-Path $env:LOCALAPPDATA 'guiji-cutting-renderer'
    npm.cmd install --prefix $renderDeps --no-audit --no-fund --ignore-scripts --save-exact three@0.187.0 playwright-core@1.65.1

已有依赖直接渲染。浏览器装在其他目录时，将 GUIJI_CHROMIUM 指向浏览器可执行文件。GUIJI_CUTTING_DEPS 可指定依赖目录。

在作品的素材目录写一份 JSON，例如：

    {
      "object": "kiwi",
      "cuts": [10, 50, 100],
      "seconds": [5.6, 6.4, 7.6],
      "width": 720,
      "fps": 30,
      "seed": 1511
    }

- 现有预设为 kiwi（猕猴桃）、dragonfruit（火龙果）和 soap（肥皂）。用户换成这三个以外的物体时，先在 scripts/scene.mjs 添加对应外形、外皮和切面。label 可改画面名称，长度最多 26 个字符。
- cuts 支持 1 到 6 档递增整数，每档 1 到 1000 刀。seconds 可省略，或给每档 2 到 24 秒。width 可选 360、540、720、1080，按 9:16 导出。fps 可选 24、30、60。
- 脚本用同一时间轴驱动画面、计数和合成刀声。刀数在三个方向间尽量平均分配，10 刀对应 4 刀竖切、3 刀横切、3 刀再次竖切。方块数按三个方向的刀距形成的网格计算，水果以中心落在果体内的格子计数。高刀数时画面用较疏的代表网格。低于 3 刀无法从三个方向切割，方块数保持为零。刀声过密时保留部分切点。

从 Skill 目录运行：

    node scripts/render.mjs "<配置.json>" "<成片.mp4>"

先看单帧可用：

    node scripts/render.mjs "<配置.json>" "<预览.jpg>" --still=2.75

预览三个刀向，确认前两段方块数为零，最后一个刀向才出现碎块并露出竖直切面。再查最后一档是否到指定刀数、物体是否在每轮正确重置，以及计数器和刀有没有被挡。用 FFprobe 确认输出包含视频和音轨。交付 MP4 和可复用的配置。

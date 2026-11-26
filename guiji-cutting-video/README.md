# 切割解压视频 Skill

用本地 3D 渲染制作竖屏 ASMR 切割视频。每一档从完整物体开始，先竖切，再横切，最后换方向竖切成块。刀数、碎块计数和刀声随画面同步。

## 演示

[![猕猴桃从 10 刀到 100 刀的演示预览](demo.gif)](demo.mp4)

[查看完整演示 MP4](demo.mp4) · 19.6 秒，720 × 1280，有声。样片依次演示 10、50、100 刀。

## 用法

### 发布控制面板

双击 `open-panel.cmd`，或运行 `npm.cmd run panel` 后访问 **http://127.0.0.1:4318**。面板提供自动发布开关、每天 1–24 次的时间设置、时区、全部 100 种顺序循环 / 所选物品循环 / 随机策略，以及物品搜索、视频参数、文案、账号登录验证、立即备片、任务预览和取消。

首次使用面板默认关闭自动发布。先设置并保存计划，再在“引擎与账号连接”中打开 Edge 登录并验证账号，最后打开自动发布开关。面板服务必须保持运行；浏览器页面可以关闭。不要同时运行独立发布 worker 或 Windows 发布定时任务。完整说明见 [自动发布文档](AUTOPUBLISH.md)。

让 Codex 读取 [SKILL.md](SKILL.md)，告诉它物体、切刀档位和每档时长。例如「用这个 Skill 做一个猕猴桃切 10、50、100 刀的竖屏视频」。

支持 **100 种物品预设**（含原有 3 种），覆盖水果、瓜菜、奶酪、甜点、面包蛋糕和日用品。完整名称、ID、形状和使用说明见 [物品清单](OBJECTS.md)，每种都有 [配置示例](examples/objects)。品种及口味变体分别计数；使用椭圆体、圆角方块和圆柱的简化模型，果核、孔洞和夹层等通过切面纹理呈现，不模拟流心或柔体物理。模型与音效在本地生成，块数来自三轴网格估算，高刀数时画面会降低碎块渲染密度。

```powershell
node scripts/objects.mjs
node scripts/render.mjs examples/objects/watermelon.json output/watermelon.mp4
```

开发检查：`npm test`；`npm run verify:catalog` 对全部物品实际渲染三个刀向和 10、50、100 刀重置，另检查 1、2、3、1000 刀边界。预览和报告写到 `output/catalog-verification`。生成或更新清单与示例：`npm run catalog:write`。

## Instagram 自动发布程序

支持自动生成视频、可配置每日发布时间、SQLite 排期，以及浏览器 GUI 或官方 API 发布 Reels。默认浏览器模式固定使用 Microsoft Edge，无需 API token。首次在 `publisher.json` 填写 `browser.expectedUsername`，双击 `login-instagram.cmd` 手动登录，再双击 `start-publisher.cmd` 启动排期发布。账号未准备好时也可试运行。快速开始：

```powershell
node scripts/publish.mjs init
node scripts/publish.mjs doctor
node scripts/publish.mjs plan
node scripts/publish.mjs prepare
node scripts/publish.mjs status
```

账号接入、正式运行与 Windows 定时任务见 [自动发布说明](AUTOPUBLISH.md)。默认只试运行，显式 `run --live` 才会发布。

### 命令行

Windows 需要 Node.js、FFmpeg 和 Chrome 或 Edge。首次安装渲染依赖：

```powershell
$renderDeps = Join-Path $env:LOCALAPPDATA 'guiji-cutting-renderer'
npm.cmd install --prefix $renderDeps --no-audit --no-fund --ignore-scripts --save-exact three@0.187.0 playwright-core@1.65.1
```

在仓库根目录用样片配置重新生成视频：

```powershell
node scripts/render.mjs kiwi.json kiwi.mp4
```

可调整的设置见 [Skill 文档](SKILL.md)。


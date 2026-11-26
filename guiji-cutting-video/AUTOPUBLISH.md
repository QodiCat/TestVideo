# 自动生成、排期与 Instagram 发布

## 复用日常 Edge：新版浏览器的正确入口

默认个人资料请在当前 Edge 地址栏打开 `edge://inspect/#remote-debugging`，勾选 **Allow remote debugging for this browser instance**（允许对此浏览器实例进行远程调试）。新版 Edge 对默认个人资料不再支持仅加 `--remote-debugging-port=9222` 的方式；参数出现在进程中，也不代表会监听 9222。

先关闭面板自动发布并重启面板服务。在“视频参数与发布账号”选择“连接已有 Edge”，本机连接地址填写 **`auto`**，保存设置，再点击“连接已有 Edge”及“验证当前账号”。如果 Edge 出现连接授权提示，由用户确认。核对账号成功后再开启自动发布。

`auto` 仅从当前 Windows 用户的 `%LOCALAPPDATA%/Microsoft/Edge/User Data/DevToolsActivePort` 读取启用后的调试端口，端口可能不是 9222；随后核验实际端口服务属于 Edge。程序不复制个人资料或 Cookie，不会主动开启调试权限，断开连接后保留窗口和标签页。使用完毕可以取消 Edge 中的调试许可。

也兼容手动填写 `http://127.0.0.1:9222` 等本机地址，但必须确认该端口实际开启。旧配置默认仍是项目专用 Edge，与“连接已有 Edge”是两种模式。

参考：[微软文档：通过 edge://inspect 启用默认浏览器调试](https://learn.microsoft.com/en-us/microsoft-edge/web-ai/devtools-mcp-server#option-b-use-edgeinspect-to-enable-remote-debugging)。

## 浏览器 GUI 发布（默认，无需 token）

**直接自动发布一条 ready 视频（不等待人工检查、Enter 或排期时间）：**

```powershell
node scripts/publish.mjs browser-publish 任务ID
```

该命令会使用 Edge 上传视频、自动裁剪并填写文案、直接点击“分享”，收到成功提示后记录为 published 并退出。它只处理指定任务，已经成功的任务再次执行会跳过，不会重复分享。`browser-preview` 仍用于主动预览，按设计不会点击分享。首次登录仍使用 `browser-login`；已有登录会话则直接发布。单条命令独立于排期队列的暂停状态，但遇到本次实际错误仍会保存截图和错误步骤。

浏览器模式固定使用 Microsoft Edge，通过 Instagram 网页上传本地 MP4、填写文案并分享。使用独立的 Edge 配置目录 `data/instagram-edge` 保存登录状态，不读取日常浏览器的会话。该目录包含敏感登录数据，不要上传或分享。程序自动查找 Edge；自定义安装位置可在 `.env` 设置 `GUIJI_EDGE` 为 `msedge.exe` 的绝对路径，发布时不会回退到 Chrome。原 `data/instagram-browser` 登录数据保留，切换 Edge 后需重新运行 `browser-login` 登录一次。

1. 在 `publisher.json` 设置 `"publishMode": "browser"`，并配置：

   ```json
   "browser": {
     "expectedUsername": "你的Instagram用户名",
     "uploadTimeoutSeconds": 300
   }
   ```

2. 双击 `login-instagram.cmd`，在打开的浏览器中登录并手动处理验证，然后回到终端按 Enter。程序会到账号编辑页核对用户名，成功后关闭浏览器并保存会话。登录目录被程序使用时不要再启动第二个实例。
3. 双击 `start-publisher.cmd`，程序按 `schedule` 自动生成视频，到点通过网页分享。当前示例每天北京时间 20:00。电脑须开机联网并保持 Windows 登录。Ctrl+C 停止；正在分享的操作会先完成。不要同时运行 Windows 定时任务和此入口。
4. 双击 `publisher-status.cmd` 查看状态。截图位于 `data/screenshots/`，排期记录位于 `data/publisher.sqlite`。

也可以在项目目录使用命令行：

```powershell
node scripts/publish.mjs doctor
node scripts/publish.mjs browser-login
node scripts/publish.mjs plan
node scripts/publish.mjs prepare
node scripts/publish.mjs status
# 用上一步的 ready 任务 ID 替换，走到分享前检查文案，不点击分享
node scripts/publish.mjs browser-preview 任务ID
node scripts/publish.mjs run --live
```

已有 MP4 也可以加入队列，无需重新生成。时间必须带时区、处于未来，且不与已有排期重叠：

```powershell
node scripts/publish.mjs enqueue "C:\videos\video.mp4" --at "2026-11-22T20:15:00+08:00" --caption "切割解压 #asmr"
```

视频需为 9:16 竖屏、H.264 + AAC 且至少 3 秒；加入队列后不要移动或修改文件。自动生成的排期仍会补齐；如只想发已有文件，应先核对并取消不需要的生成任务。

网页中英文均有内置定位；Instagram 改版可能需要调整 `scripts/browser-publisher.mjs`。此版本仅支持普通视频分享并保留主页分享（`shareToFeed: true`），不自动配置封面、音乐、AI 标签或高级设置；`isAiGenerated: true` 或 `shareToFeed: false` 的任务会停止等待人工处理。

登录失效、验证弹窗、账号核对失败或页面操作失败会暂停整个发布队列（`data/browser-paused.json`），记录截图，任务标为 `needs_review`。**在点击分享之前先保存检查点**；若点击后超时或进程退出，任务为 `gui_uncertain` / `gui_publishing`，程序不会自动重发。先在 Instagram 核对，再记录结果：

```powershell
# 已经发出：只补记本地状态，不再发布
node scripts/publish.mjs resolve 任务ID --published
# 放弃此任务：即使未发出也不重发；需要重排时另选时间
node scripts/publish.mjs resolve 任务ID --skip
# 处理完待核对任务后重新登录，验证账号并解除暂停
node scripts/publish.mjs browser-login
```

如果任务明确是在点击分享之前的准备阶段失败（例如卡在 Create → Post 菜单），修复页面定位后可以安全恢复原任务：先 Ctrl+C 停止运行中的发布程序，再执行 `node scripts/publish.mjs retry 任务ID`，随后运行 `browser-login` 核对账号解除暂停，重新启动发布。`retry` 只恢复 `ready`，不会立即分享；已经点击分享或开始 API 上传的任务不允许重试。仍按原排期和迟发宽限期处理，超过宽限期需另选时间排期。

错误记录包含 `errorStage`（account / create / post-menu / upload / editor / caption / share-ready / share / confirmation），用于定位卡住的页面步骤，不保存上游原始错误中的会话 URL。

`run` 不加 `--live` 仍只生成视频，不打开发布页面。`doctor --live` 在浏览器模式下只核对登录账号，不分享。Windows 定时安装脚本沿用同一配置，首次登录并验证后才使用 `-EnablePublishing`。浏览器应保持可见，不使用隐藏窗口或绕过登录验证的手段。

测试包含真实 Edge 的本地模拟页面流程：上传、两次下一步、填写文案、预览不分享、成功提示，以及分享结果不明确时停止。测试拦截所有网络请求，不连接 Instagram。实际 Instagram 登录和首次真实发布仍需使用自己的账号验证。

这是本地 Node.js 程序，复用 `scripts/render.mjs` 生成竖屏 MP4。SQLite 保存任务、参数、文案、容器 ID、发布状态；重启后继续。无需 OpenAI API 或额外付费服务。账号尚未接入时可完整运行生成和排期流程。

## 先试运行

需要 Node.js 24+、FFmpeg、FFprobe、Chrome/Edge，以及原技能中的 three / playwright-core 依赖。当前工作区的 `../.render-deps` 会自动识别，其他机器按 README 安装依赖。

在本项目目录运行：

```powershell
node scripts/publish.mjs init
node scripts/publish.mjs doctor
node scripts/publish.mjs plan
node scripts/publish.mjs status
node scripts/publish.mjs prepare
```

`prepare` 只生成提前备片窗口内的视频，不连接 Instagram。输出在 `output/<任务ID>.mp4`，对应配置在同目录的 JSON。`run --once` 同样默认试运行；必须显式加 `--live` 才会发布。

## 配置发布时间和内容

编辑 `publisher.json`：

```json
"schedule": {
  "times": ["12:00", "20:00"],
  "utcOffset": "+08:00",
  "daysAhead": 7,
  "renderAheadHours": 24,
  "lateGraceMinutes": 360,
  "pollSeconds": 60
}
```

北京时间用 `+08:00`。这是固定 UTC 偏移，不会自动切换夏令时。每天可配置多个时间点，运行期间自动补充未来 7 天排期。轮询间隔默认 60 秒；上传与 Meta 转码需要额外时间，因此发布时间可能略晚于设定时间。电脑离线超过宽限期的旧任务会跳过，避免恢复后集中补发。

`video.objects` 支持 [物品清单](OBJECTS.md) 中的全部 100 个 ID，按任务 seed 确定性选择，并用不同 seed 渲染。`examples/all-objects.json` 提供完整 ID 数组，可复制到 `video.objects`；此文件是物品数组片段，不是完整发布配置。已有配置和已排期任务不会因新增物品而自动变更。可修改刀数、每档秒数、分辨率和 fps；不同 seed 不保证画面有显著变化。`caption` 支持 `{object}` 和 `{cuts}`。`isAiGenerated` 默认 false，因为当前视频由程序化 3D 渲染生成；若更换为需标注的 AI 素材，可设为 true。

已排期任务保存配置快照，改配置只影响新任务。要替换已有排期，先停止 worker，使用 `cancel <任务ID>` 取消旧任务，调整发布时间再重新 `plan`；已取消的同一时间点不会再次入队，防止重复发布。连续运行的进程在启动时读取配置，改配置后需重启；Windows 每分钟运行模式下会在下次启动时读取。

## 准备 Instagram 账号后接入

官方接口要求 Business 或 Creator 专业账号。这里默认选用 **Facebook Login**，可直接上传本地 MP4，无需购买公网视频存储：

1. 创建 Instagram 专业账号，关联你管理的 Facebook Page。
2. 在 Meta for Developers 创建应用并配置 Instagram 的 Facebook Login 接入。自用开发测试账号应具有对应应用/资产角色；服务其他用户时按 Meta 控制台要求申请审核及访问级别。
3. 授权 `instagram_basic`、`instagram_content_publish`、`pages_read_engagement`，获取对应 Instagram 专业账号 ID 和有权限的 Page access token。资产角色不同可能需要额外权限，按 Meta 控制台提示处理。
4. 将 ID 和 token 填进本机 `.env` 的 `INSTAGRAM_USER_ID`、`INSTAGRAM_ACCESS_TOKEN`。不要发到聊天里或提交到 Git。程序不需要 Instagram 密码。
5. 执行 `node scripts/publish.mjs doctor --live`，只读取账号和额度，确认目标账号正确。该检查不等于完整发布权限测试。
6. 查看 `status` 和生成的 MP4，确认后运行：

```powershell
node scripts/publish.mjs run --live
```

该命令持续运行，到点创建 REELS 容器、上传本地 MP4、检查转码状态并发布。`Ctrl+C` 停止；为保证状态记录，正在处理的单个操作会先完成。只执行一轮检查用 `run --live --once`；转码未完成时需再次执行或交给定时任务。

`api.version` 默认为官方文档当前示例的 `v27.0`，可随应用版本配置调整。token 有有效期，过期或撤销后需在 Meta 更新授权并替换 `.env`；此版本不包含 OAuth 授权网页和 token 自动续期。

也支持 `api.login = "instagram"`，对应权限为 `instagram_business_basic`、`instagram_business_content_publish`。这种模式须配置 `api.publicVideoBaseUrl`，并通过你自己的存储同步流程把 `output/<任务ID>.mp4` 上传到该公网 HTTPS 目录；**本程序不提供云存储同步**。Meta 需要能直接获取文件，不能是登录页面。没有存储时使用默认 Facebook Login 方式。

## Windows 自动运行

先试运行验证，再安装任务（程序不会自行安装）：

```powershell
# 每分钟检查并生成，只试运行
powershell -NoProfile -File scripts/install-schedule.ps1
# 账号授权并确认排期后，切换为正式发布
powershell -NoProfile -File scripts/install-schedule.ps1 -EnablePublishing
# 移除任务
powershell -NoProfile -File scripts/install-schedule.ps1 -Remove
```

任务以当前 Windows 用户运行，无需保存 Windows 密码；电脑须开机、可访问 Meta，且用户保持登录。不要同时运行长期 worker 和 Windows 定时任务；运行锁会阻止重叠进程。需要全天运行时可部署到常开 Windows 机器；其他系统需要自行配置 Chromium 路径及进程管理。

## 记录和故障处理

- `data/publisher.sqlite`：持久化任务，`status` 可查看。`data/events.jsonl`：事件日志。不记录 token 或上游可能含敏感信息的原始错误。
- `queued → ready → uploading → processing → publishing → published`：正常流程。上传和转码从计划发布时间开始。
- 发布前的临时失败按 1、2、4、8…分钟退避，最多累计 5 次后进入 `needs_review`。额度受限也会退避。渲染失败不会发布损坏文件。
- `uncertain` / `publishing`：发布请求已发出，但结果尚未可靠落盘。下次只查询容器；确认 `PUBLISHED` 后记为成功，否则进入 `needs_review`，不自动重发。若发布成功响应丢失，可能没有媒体 ID，但仍可确认容器已发布。
- `needs_review`：先去 Instagram 核对结果，处理账号、token 或文件问题后，再安排**新的时间点**；此版本不提供自动重置按钮，以免误发重复内容。
- `skipped`：超过迟发宽限期。`cancelled`：用户主动取消。两种状态都不会补发。
- 首次正式发布必须用真实账号验证；当前未提供账号，自动化测试仅使用模拟 Meta 响应，不能代替线上验证。

不要删除数据库后重跑旧排期；数据库是去重和发布恢复依据。备份时先停止 worker，再复制整个 `data` 目录。

## 验证

```powershell
npm.cmd test
```

测试覆盖时区/跨年排期、持久化去重、配置快照、进程锁、官方上传请求、敏感信息隐藏，以及发布响应丢失时的防重发行为。

参考：[Meta Content Publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing)、[Meta Instagram Login](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login)。

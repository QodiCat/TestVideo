import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, copyFileSync, renameSync, unlinkSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadEnv, validateConfig, Store, acquireLock, Instagram, publishReady, reconcile } from './publisher-core.mjs';
import { BrowserInstagram, browserRuntime, submitBrowserJob, retryBrowserJob, publishBrowserNow } from './browser-publisher.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(join(root, '.env'));
if (!process.env.GUIJI_CUTTING_DEPS && existsSync(join(root, '..', '.render-deps', 'node_modules'))) {
  process.env.GUIJI_CUTTING_DEPS = join(root, '..', '.render-deps');
}
const [command = 'help', ...args] = process.argv.slice(2);
const live = args.includes('--live');
const log = (event, details = {}) => {
  const entry = { at: new Date().toISOString(), event, ...details };
  mkdirSync(join(root, 'data'), { recursive: true });
  appendFileSync(join(root, 'data', 'events.jsonl'), JSON.stringify(entry) + '\n');
  console.log(JSON.stringify(entry));
};
function child(exe, args, capture = false) {
  return new Promise((res, rej) => {
    const p = spawn(exe, args, { cwd: root, windowsHide: true, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let output = '';
    if (capture) p.stdout.on('data', data => { output += data; });
    p.on('error', rej);
    p.on('exit', code => code === 0 ? res(output) : rej(new Error(exe + ' 退出码 ' + code)));
  });
}
async function probe(file) {
  const data = JSON.parse(await child('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], true));
  const video = data.streams.find(s => s.codec_type === 'video');
  const audio = data.streams.find(s => s.codec_type === 'audio');
  if (!video || !audio || video.codec_name !== 'h264' || audio.codec_name !== 'aac' || Math.abs(video.width / video.height - 9 / 16) > 0.001 || Number(data.format.duration) < 3) {
    throw new Error('视频检查失败：需要竖屏 9:16、H.264、AAC，且至少 3 秒');
  }
}
async function render(job, store) {
  const file = join(root, 'output', job.id + '.mp4');
  mkdirSync(dirname(file), { recursive: true });
  if (!existsSync(file)) {
    const spec = join(root, 'output', job.id + '.json');
    // Job configuration is immutable once queued; output is renamed only after verification.
    const { writeFileSync } = await import('node:fs');
    writeFileSync(spec, JSON.stringify(job.video, null, 2));
    const temporary = join(root, 'output', job.id + '.rendering.mp4');
    if (existsSync(temporary)) unlinkSync(temporary);
    await child(process.execPath, [join(root, 'scripts', 'render.mjs'), spec, temporary]);
    await probe(temporary);
    renameSync(temporary, file);
  } else await probe(file);
  job.status = 'ready'; job.file = file; store.save(job);
  log('video_ready', { id: job.id, file });
}

async function tick(config, store, api, prepareOnly = false) {
  const added = store.plan(config);
  if (added) log('planned', { added });
  for (const job of store.all()) {
    if (['published', 'needs_review', 'skipped', 'cancelled'].includes(job.status)) continue;
    if (api instanceof BrowserInstagram) {
      if (api.paused) { console.log('浏览器发布已暂停，请检查 data/browser-paused.json 并运行 browser-login。'); break; }
      if (['gui_publishing', 'gui_uncertain'].includes(job.status)) {
        await submitBrowserJob(job, store, api); break;
      }
    } else if (['gui_publishing', 'gui_uncertain'].includes(job.status)) {
      // Transport changes must not turn an uncertain GUI share into an API publish.
      job.status = 'needs_review'; job.error = '浏览器分享结果未确认，请先在 Instagram 核对'; store.save(job); continue;
    }
    if (job.retryAt && Date.parse(job.retryAt) > Date.now()) continue;
    try {
      if (job.containerId && api && (job.targetUserId !== api.userId || job.apiBase !== api.base)) {
        job.status = 'needs_review'; job.error = '账号或 API 配置已变更，请核对原任务'; store.save(job); continue;
      }
      if (['publishing', 'uncertain'].includes(job.status)) {
        if (api) { await reconcile(job, store, api); log(job.status, { id: job.id }); }
        continue;
      }
      const due = Date.parse(job.scheduled);
      if (Date.now() - due > config.schedule.lateGraceMinutes * 60000) {
        job.status = 'skipped'; job.error = '超出迟发宽限期'; store.save(job); log('skipped', { id: job.id }); continue;
      }
      if (job.status === 'queued' && due - Date.now() <= config.schedule.renderAheadHours * 3600000) await render(job, store);
      if (prepareOnly || !api || Date.now() < due || job.status === 'queued') continue;
      if (api instanceof BrowserInstagram) {
        await submitBrowserJob(job, store, api);
        log(job.status, { id: job.id, stage: job.errorStage, screenshot: job.errorScreenshot ?? job.previewScreenshot });
        continue;
      }
      if (!job.containerId) {
        // Confirm quota before starting another upload.
        const limit = await api.request(api.userId + '/content_publishing_limit?fields=config,quota_usage');
        const quota = limit.data?.[0];
        if (quota?.config?.quota_total && quota.quota_usage >= quota.config.quota_total) throw new Error('Instagram 发布额度暂时已用完');
        job.containerId = await api.create(job); job.targetUserId = api.userId; job.apiBase = api.base;
        job.status = config.api.login === 'facebook' ? 'uploading' : 'processing';
        store.save(job); log('container_created', { id: job.id, containerId: job.containerId });
      }
      if (job.status === 'uploading') {
        await api.upload(job.containerId, job.file);
        job.status = 'processing'; store.save(job);
      }
      if (job.status === 'processing') {
        const result = await api.status(job.containerId);
        if (result.status_code === 'FINISHED') {
          await publishReady(job, store, api); log(job.status, { id: job.id, mediaId: job.mediaId });
        } else if (result.status_code === 'PUBLISHED') {
          job.status = 'published'; job.publishedAt = new Date().toISOString(); store.save(job);
        } else if (['ERROR', 'EXPIRED'].includes(result.status_code)) {
          job.status = 'needs_review'; job.error = 'Meta 容器状态 ' + result.status_code; store.save(job); log('needs_review', { id: job.id, error: job.error });
        }
      }
    } catch (error) {
      job.attempts++;
      job.error = error.message;
      job.retryAt = new Date(Date.now() + Math.min(3600, 60 * 2 ** (job.attempts - 1)) * 1000).toISOString();
      if (job.attempts >= 5) job.status = 'needs_review';
      store.save(job); log('job_error', { id: job.id, status: job.status, error: job.error, retryAt: job.retryAt });
    }
  }
}

async function main() {
  if (command === 'help') {
    console.log(`guiji 自动生成和 Instagram Reels 排期程序（Node 24+）
  init                  创建本地配置和 .env 空模板
  plan                  按配置生成未来任务，不渲染、不发布
  status                查看排期及状态
  prepare               生成提前备片范围内的视频，不连接 Instagram
  run --once            生成排期和视频，执行一次，不发布
  run --live [--once]   到点按配置通过浏览器或 API 发布；不加 --once 则持续运行
  doctor [--live]       检查本地依赖；--live 额外核对登录账号
  browser-login         打开独立浏览器，手动登录并保存会话
  browser-preview <ID>   走到分享前并截图，不点击分享；需要 ready 任务
  browser-publish <ID>   立即自动发布这一条视频，自动点击分享，不等待人工检查
  enqueue <MP4> --at <带时区的ISO时间> --caption <文案>
                        将已有竖屏视频加入排期
  resolve <ID> --published | --skip
                        人工核对 Instagram 后记录结果，不会重新发布
  retry <ID>            重试明确发生在点击分享之前的浏览器准备失败任务
  cancel <任务ID>       取消未开始上传的任务
详细说明：AUTOPUBLISH.md`);
    return;
  }
  if (command === 'init') {
    for (const [source, target] of [['publisher.example.json', 'publisher.json'], ['.env.example', '.env']]) {
      if (!existsSync(join(root, target))) copyFileSync(join(root, source), join(root, target));
    }
    console.log('已创建 publisher.json 和 .env；编辑配置后执行 plan。'); return;
  }
  if (!['plan', 'status', 'prepare', 'run', 'doctor', 'cancel', 'browser-login', 'browser-preview', 'browser-publish', 'enqueue', 'resolve', 'retry'].includes(command)) throw new Error('未知命令；使用 help 查看帮助');
  if (!existsSync(join(root, 'publisher.json'))) throw new Error('请先执行 node scripts/publish.mjs init');
  const config = validateConfig(JSON.parse(readFileSync(join(root, 'publisher.json'), 'utf8').replace(/^\uFEFF/, '')));
  if (command === 'doctor') {
    await child('ffmpeg', ['-version'], true); await child('ffprobe', ['-version'], true);
    const { createRequire } = await import('node:module');
    const { homedir } = await import('node:os');
    const deps = process.env.GUIJI_CUTTING_DEPS ?? join(process.env.LOCALAPPDATA ?? homedir(), 'guiji-cutting-renderer');
    const require = createRequire(join(resolve(deps), 'package.json'));
    require.resolve('three'); require.resolve('playwright-core');
    const browsers = [process.env.GUIJI_CHROMIUM, ...[process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean).flatMap(p => [join(p, 'Google/Chrome/Application/chrome.exe'), join(p, 'Microsoft/Edge/Application/msedge.exe')])];
    if (!browsers.some(p => p && existsSync(p))) throw new Error('未找到 Chrome/Edge，请配置 GUIJI_CHROMIUM');
    console.log('本地配置、Node、FFmpeg、FFprobe、渲染依赖、浏览器检查通过');
    if (config.publishMode === 'browser') console.log('发布浏览器固定为 Microsoft Edge：' + browserRuntime(root).executablePath);
    if (live) {
      if (config.publishMode === 'browser') {
        const release = acquireLock(root);
        const browser = new BrowserInstagram(config, root);
        try { console.log('浏览器登录账号：' + await browser.verifyAccount()); }
        finally { await browser.close(); release(); }
        return;
      }
      const api = new Instagram(config);
      const account = await api.request(api.userId + '?fields=id,username');
      const quota = await api.request(api.userId + '/content_publishing_limit?fields=config,quota_usage');
      console.log(JSON.stringify({ account, quota }));
    }
    return;
  }
  const release = command === 'status' ? () => {} : acquireLock(root);
  const store = new Store(root);
  try {
    if (command === 'browser-publish') {
      if (config.publishMode !== 'browser') throw new Error('请将 publishMode 设为 browser');
      const browser = new BrowserInstagram(config, root);
      try {
        console.log('自动发布任务 ' + args[0] + '：上传、填写文案后直接点击分享，无需按 Enter。');
        const job = await publishBrowserNow(args[0], store, browser);
        log(job.status, { id: job.id, stage: job.errorStage, screenshot: job.errorScreenshot ?? job.previewScreenshot });
        if (job.status !== 'published') throw new Error(job.error + '；截图：' + (job.errorScreenshot ?? '未保存'));
        console.log('发布成功：' + job.id);
      } finally { await browser.close(); }
    } else if (['browser-login', 'browser-preview'].includes(command)) {
      if (config.publishMode !== 'browser') throw new Error('请先将 publishMode 设为 browser 并配置 browser.expectedUsername');
      if (!process.stdin.isTTY) throw new Error('请在交互式终端运行此命令，以便手动登录或确认预览');
      const browser = new BrowserInstagram(config, root);
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        await browser.open();
        if (command === 'browser-login') {
          await browser.page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
          await rl.question(`请在浏览器登录 @${config.browser.expectedUsername}，处理所有验证后回终端按 Enter：`);
          console.log('已验证并保存登录账号：' + await browser.verifyAccount());
          browser.resume();
        } else {
          const job = store.get(args[0]);
          if (!job || job.status !== 'ready' || job.containerId) throw new Error('预览需要没有上传过的 ready 任务，请先 prepare 或 enqueue');
          console.log('预览截图：' + await browser.prepare(job));
          await rl.question('已填写文案，未点击分享。检查后按 Enter 关闭预览：');
        }
      } finally { rl.close(); await browser.close(); }
    } else if (command === 'status') {
      console.table(store.all().map(j => ({ id: j.id, scheduledUTC: j.scheduled, status: j.status, object: j.video?.object ?? 'local-file', mediaId: j.mediaId ?? '', error: j.error ?? '' })));
      if (existsSync(join(root, 'data', 'browser-paused.json'))) console.log('浏览器已暂停：请处理验证/核对发布结果后运行 browser-login。');
    } else if (command === 'enqueue') {
      const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
      const at = option('--at'); const caption = option('--caption') ?? '';
      if (!at || !/(Z|[+-]\d{2}:\d{2})$/.test(at) || !Number.isFinite(Date.parse(at)) || Date.parse(at) <= Date.now()) throw new Error('--at 需要未来的 ISO 时间且带时区，例如 2026-11-22T20:00:00+08:00');
      if (caption.length > 2200) throw new Error('文案不能超过 2200 字符');
      const file = resolve(args[0] ?? ''); await probe(file);
      const scheduled = new Date(at).toISOString();
      if (store.all().some(j => j.scheduled === scheduled)) throw new Error('该时间已有任务，请更换时间');
      const id = createHash('sha256').update(scheduled).digest('hex').slice(0, 16);
      store.save({ id, scheduled, status: 'ready', file, caption, shareToFeed: config.shareToFeed, isAiGenerated: config.isAiGenerated, attempts: 0 });
      console.log('已加入排期：' + id);
    } else if (command === 'retry') {
      if (config.publishMode !== 'browser') throw new Error('retry 命令仅支持浏览器模式');
      retryBrowserJob(store.get(args[0]), store);
      log('retry_ready', { id: args[0] });
      console.log('已恢复为 ready。运行 browser-login 核对账号并解除暂停，再启动发布；尚未点击分享。');
    } else if (command === 'resolve') {
      const job = store.get(args[0]);
      if (!job || !['needs_review', 'gui_uncertain', 'gui_publishing'].includes(job.status)) throw new Error('只能处理待核对的任务');
      if (args.includes('--published') === args.includes('--skip')) throw new Error('请选择 --published 或 --skip；先在 Instagram 核对结果');
      job.status = args.includes('--published') ? 'published' : 'cancelled';
      if (job.status === 'published') job.publishedAt ??= new Date().toISOString();
      job.resolvedAt = new Date().toISOString(); delete job.error; store.save(job);
      console.log('已记录人工核对结果：' + job.status);
    } else if (command === 'cancel') {
      const job = store.get(args[0]);
      if (!job || !['queued', 'ready'].includes(job.status) || job.containerId) throw new Error('只能取消尚未上传的 queued/ready 任务；请先停止 worker');
      job.status = 'cancelled'; store.save(job); log('cancelled', { id: job.id });
    } else if (command === 'plan') {
      log('planned', { added: store.plan(config) });
    } else {
      const api = live && command === 'run' ? (config.publishMode === 'browser' ? new BrowserInstagram(config, root) : new Instagram(config)) : null;
      if (!api) console.log('试运行：只生成排期和视频，不调用发布接口。');
      let stop = false;
      const stopHandler = () => { stop = true; };
      process.on('SIGINT', stopHandler); process.on('SIGTERM', stopHandler);
      try {
        if (api instanceof BrowserInstagram) {
          if (api.paused) throw new Error('浏览器发布已暂停；先处理待核对任务，再运行 browser-login。');
          try { console.log('发布账号已核对：@' + await api.verifyAccount()); }
          catch {
            await api.screenshot('startup', 'error');
            api.pause('启动时无法验证登录账号，请运行 browser-login');
            throw new Error('无法验证浏览器登录账号，请双击 login-instagram.cmd 完成登录。');
          }
        }
        do {
          await tick(config, store, api, command === 'prepare');
          if (command !== 'run' || args.includes('--once') || stop) break;
          // Short sleeps let Ctrl+C finish promptly without interrupting an active checkpoint.
          for (let i = 0; i < config.schedule.pollSeconds && !stop; i++) await sleep(1000);
        } while (!stop);
      } finally { process.off('SIGINT', stopHandler); process.off('SIGTERM', stopHandler); await api?.close?.(); }
    }
  } finally { store.close(); release(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

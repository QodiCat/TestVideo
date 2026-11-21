import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export function browserRuntime(root) {
  const deps = process.env.GUIJI_CUTTING_DEPS ??
    (existsSync(join(root, '..', '.render-deps', 'node_modules')) ? join(root, '..', '.render-deps') :
      join(process.env.LOCALAPPDATA ?? homedir(), 'guiji-cutting-renderer'));
  const require = createRequire(join(resolve(deps), 'package.json'));
  const { chromium } = require('playwright-core');
  const candidates = [process.env.GUIJI_EDGE,
    ...[process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean)
      .map(p => join(p, 'Microsoft/Edge/Application/msedge.exe'))];
  if (process.env.GUIJI_EDGE && (!existsSync(process.env.GUIJI_EDGE) || basename(process.env.GUIJI_EDGE).toLowerCase() !== 'msedge.exe')) {
    throw new Error('GUIJI_EDGE 必须指向已安装的 Microsoft Edge msedge.exe');
  }
  const executablePath = candidates.find(p => p && existsSync(p));
  if (!executablePath) throw new Error('未找到 Microsoft Edge，请安装 Edge 或配置 GUIJI_EDGE');
  return { chromium, executablePath };
}

const nextName = /^(Next|下一步)$/i;
const shareName = /^(Share|分享|发布)$/i;
const successText = /^(Your (?:reel|post|video) has been shared\.?|(?:你的|您)(?:的)?(?:Reel|reel|帖子|视频|短视频|短片).*(?:已分享|已发布|分享成功)|(?:Reel|reel|帖子|视频|短视频|短片)已(?:分享|发布))[^\n]*$/i;
const captionSelector = '[contenteditable="true"][role="textbox"], textarea[aria-label*="caption" i], [contenteditable="true"][aria-label*="caption" i], [contenteditable="true"][aria-label*="说明"], [contenteditable="true"][aria-label*="文案"]';

function visibleAction(scope, name) {
  // Instagram uses div/span click handlers in several stages of the composer.
  return scope.getByRole('button', { name }).or(scope.getByRole('link', { name }))
    .or(scope.getByRole('menuitem', { name })).or(scope.getByText(name, { exact: true }))
    .or(scope.getByLabel(name, { exact: true })).filter({ visible: true }).first();
}

// No private Instagram endpoints, cookies in logs, or verification bypasses.
export class BrowserInstagram {
  constructor(config, root) {
    this.config = config; this.root = root;
    this.pausePath = join(root, 'data', 'browser-paused.json');
  }
  get paused() { return existsSync(this.pausePath); }
  pause(reason) {
    mkdirSync(join(this.root, 'data'), { recursive: true });
    writeFileSync(this.pausePath, JSON.stringify({ at: new Date().toISOString(), reason }, null, 2));
  }
  resume() { if (this.paused) unlinkSync(this.pausePath); }
  async open() {
    if (this.context && this.page && !this.page.isClosed()) return;
    if (this.context) await this.close();
    const { chromium, executablePath } = browserRuntime(this.root);
    // Dedicated profile: never attach to or copy a user's normal browser profile.
    this.context = await chromium.launchPersistentContext(join(this.root, 'data', 'instagram-edge'), {
      executablePath, headless: false, viewport: { width: 1440, height: 1000 },
      locale: 'en-US', acceptDownloads: false,
    });
    this.page = this.context.pages()[0] ?? await this.context.newPage();
    this.page.setDefaultTimeout(15000);
  }
  async close() { await this.context?.close(); this.context = null; }
  async guard() {
    const page = this.page;
    if (/\/(?:accounts\/login|challenge|checkpoint|two_factor|accounts\/suspended)/i.test(page.url()) ||
        await page.locator('input[name="username"], input[name="password"], input[name="verificationCode"]').first().isVisible() ||
        await page.getByText(/^(Confirm it.?s you|Help us confirm you own this account|确认是你本人|帮助我们确认此账户属于你|Try again later|请稍后再试)$/i).first().isVisible()) {
      throw new Error('Instagram 需要登录、验证或暂时限制操作；请运行 browser-login 手动处理');
    }
  }
  async verifyAccount() {
    await this.open();
    await this.page.goto('https://www.instagram.com/accounts/edit/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.guard();
    // The username must appear on the authenticated account's EDIT page, not on a public profile.
    await this.page.getByText(this.config.browser.expectedUsername, { exact: true }).first().waitFor({ timeout: 20000 });
    await this.guard();
    if (!new URL(this.page.url()).pathname.startsWith('/accounts/edit')) throw new Error('无法核对当前登录账号');
    return this.config.browser.expectedUsername;
  }
  async screenshot(id, stage) {
    const path = join(this.root, 'data', 'screenshots', `${id}-${stage}-${Date.now()}.png`);
    mkdirSync(join(this.root, 'data', 'screenshots'), { recursive: true });
    try { await this.page?.screenshot({ path }); return path; } catch { return undefined; }
  }
  async scope() {
    const dialog = this.page.getByRole('dialog').filter({ has: this.page.locator('input[type="file"], ' + captionSelector) });
    if (await dialog.count() === 1) return dialog;
    const dialogs = this.page.getByRole('dialog');
    return await dialogs.count() === 1 ? dialogs : this.page;
  }
  async action(name, scope = this.page) {
    await visibleAction(scope, name).click();
  }
  async prepare(job) {
    this.stage = 'account';
    if (!job.shareToFeed || job.isAiGenerated) throw new Error('浏览器模式暂不支持关闭主页分享或设置 AI 标签，请手动发布此任务');
    if (!existsSync(job.file)) throw new Error('待发布 MP4 不存在');
    await this.verifyAccount();
    const page = this.page;
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.guard();
    const notNow = page.getByRole('button', { name: /^(Not now|以后再说|暂不)$/i });
    if (await notNow.first().isVisible()) await notNow.first().click();
    this.stage = 'create';
    const create = page.getByRole('link', { name: /^(Create|New post|创建|新帖子)$/i })
      .or(page.getByRole('button', { name: /^(Create|New post|创建|新帖子)$/i }))
      .or(page.locator('a').filter({ has: page.locator('svg[aria-label="New post"], svg[aria-label="新帖子"], svg[aria-label="创建"]') })).first();
    await create.click();
    this.stage = 'post-menu';
    // Instagram's Create popup can use plain divs rather than buttons/links.
    const postName = /^(Post|帖子)$/i;
    const post = visibleAction(page, postName);
    // Some versions show a Create menu before the file selection dialog.
    await Promise.race([
      page.locator('input[type="file"]').first().waitFor({ state: 'attached' }),
      post.waitFor({ state: 'visible' }),
    ]);
    if (await post.isVisible()) await post.click();
    this.stage = 'upload';
    await page.locator('input[type="file"]').first().setInputFiles(job.file);
    this.stage = 'editor';
    const timeout = this.config.browser.uploadTimeoutSeconds * 1000;
    const deadline = Date.now() + timeout;
    let caption;
    while (Date.now() < deadline) {
      await this.guard();
      const scope = await this.scope();
      caption = scope.locator(captionSelector).first();
      if (await caption.isVisible()) break;
      const crop = visibleAction(scope, /^(Select crop|选择裁剪|选择裁剪比例)$/i);
      if (await crop.isVisible()) {
        this.stage = 'crop';
        await crop.click();
        await this.action(/^(Original|原始|原始比例)$/i);
      }
      const next = visibleAction(scope, nextName);
      if (await next.isVisible() && await next.isEnabled()) { this.stage = 'next'; await next.click(); }
      await sleep(700);
    }
    if (!caption || !await caption.isVisible()) throw new Error('未找到文案输入框；上传超时或 Instagram 页面已变化');
    this.stage = 'caption';
    await caption.fill(job.caption);
    const written = await caption.getAttribute('contenteditable') === 'true' ? await caption.innerText() : await caption.inputValue();
    if (written !== job.caption) throw new Error('文案填写校验失败');
    await this.guard();
    this.stage = 'share-ready';
    const scope = await this.scope();
    this.shareButton = visibleAction(scope, shareName);
    await this.shareButton.waitFor({ state: 'visible' });
    if (!await this.shareButton.isEnabled()) throw new Error('分享按钮尚不可用');
    return this.screenshot(job.id, 'preview');
  }
  async share() {
    await this.guard();
    this.stage = 'share';
    await this.shareButton.click();
    this.stage = 'confirmation';
    await this.page.getByText(successText).first().waitFor({ timeout: this.config.browser.uploadTimeoutSeconds * 1000 });
    // A feed link is not proof of which post was published; only the success dialog is proof.
    return { confirmed: true };
  }
}

// Persist BEFORE clicking Share. A crash/timeout after this point is never replayed.
export async function submitBrowserJob(job, store, browser) {
  if (['gui_publishing', 'gui_uncertain'].includes(job.status)) {
    job.status = 'needs_review'; job.error = '上次浏览器分享结果不明确，请在 Instagram 核对，禁止自动重发';
    store.save(job); browser.pause(job.error); return;
  }
  if (job.containerId || ['uploading', 'processing', 'publishing', 'uncertain'].includes(job.status)) {
    job.status = 'needs_review'; job.error = '此任务已通过 API 开始上传，请核对后再切换发布方式';
    store.save(job); return;
  }
  try {
    job.previewScreenshot = await browser.prepare(job);
    job.browserShareStartedAt = new Date().toISOString();
    job.status = 'gui_publishing'; store.save(job);
    const result = await browser.share();
    if (result?.confirmed !== true) throw new Error('未收到网页分享成功提示');
    job.status = 'published'; job.publishedAt = new Date().toISOString(); job.transport = 'browser';
    delete job.error; store.save(job);
  } catch (error) {
    // Do not persist raw Playwright errors: they can include page content and session URLs.
    const uncertain = job.status === 'gui_publishing';
    job.errorStage = browser.stage ?? (uncertain ? 'share' : 'prepare');
    job.errorType = error?.name === 'TimeoutError' ? 'timeout' : 'operation_failed';
    job.error = uncertain ? '分享结果未确认，请在 Instagram 核对，程序不会自动重发' :
      '浏览器发布准备失败，请检查登录、验证弹窗、账号和页面布局；运行 browser-login 后继续';
    job.error += '；步骤=' + job.errorStage;
    job.status = uncertain ? 'gui_uncertain' : 'needs_review';
    job.errorScreenshot = await browser.screenshot(job.id, 'error');
    store.save(job); browser.pause(job.error);
  }
}

export function retryBrowserJob(job, store) {
  // Compatibility with the previous version's explicit pre-share failure message.
  if (!job || job.status !== 'needs_review' || job.containerId || job.browserShareStartedAt ||
      !job.error?.startsWith('浏览器发布准备失败，')) {
    throw new Error('只允许重试明确发生在点击分享之前的浏览器准备失败任务；其他任务需先到 Instagram 核对');
  }
  job.status = 'ready'; job.attempts = 0;
  for (const key of ['error', 'errorStage', 'errorType', 'retryAt', 'errorScreenshot']) delete job[key];
  store.save(job);
}

// Explicit single-post action: publish this ready video now, regardless of its scheduled time.
// No readline prompts or manual approval screen. Other queued jobs are left alone.
export async function publishBrowserNow(id, store, browser) {
  const job = store.get(id);
  if (!job) throw new Error('没有找到任务：' + id);
  if (job.status === 'published') return job;
  if (job.status !== 'ready' || job.containerId || job.browserShareStartedAt) {
    throw new Error('立即发布需要尚未分享的 ready 任务；准备阶段失败可先运行 retry');
  }
  await submitBrowserJob(job, store, browser);
  return job;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, validateConfig } from '../scripts/publisher-core.mjs';
import { BrowserInstagram, browserRuntime, submitBrowserJob, retryBrowserJob, publishBrowserNow } from '../scripts/browser-publisher.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const config = () => JSON.parse(readFileSync(join(root, 'publisher.example.json'), 'utf8'));
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'guiji-browser-test-'));
  const store = new Store(dir);
  store.plan(config(), new Date('2026-11-20T01:00:00Z'));
  const job = store.all()[0]; job.status = 'ready'; job.file = join(dir, 'video.mp4');
  writeFileSync(job.file, Buffer.from([1, 2, 3])); store.save(job);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, store, job };
}
test('浏览器模式拒绝缺失账号和过短超时，兼容旧 API 配置', () => {
  const c = config(); c.browser.expectedUsername = ''; assert.throws(() => validateConfig(c));
  c.browser.expectedUsername = 'qodicat'; c.browser.uploadTimeoutSeconds = 1; assert.throws(() => validateConfig(c));
  delete c.publishMode; assert.equal(validateConfig(c).publishMode, 'api');
});
test('点击分享前落盘，成功后标记 published', async t => {
  const { store, job } = fixture(t);
  await submitBrowserJob(job, store, {
    prepare: async () => 'preview.png', share: async () => {
      assert.equal(store.get(job.id).status, 'gui_publishing'); return { confirmed: true };
    }, pause: () => assert.fail('成功不应暂停'),
  });
  assert.equal(store.get(job.id).status, 'published');
});
test('点击后断网进入不确定状态，重启不再次点击分享', async t => {
  const { store, job } = fixture(t); let clicks = 0; let paused = 0;
  const browser = { prepare: async () => {}, share: async () => { clicks++; throw new Error('private-session-url'); }, screenshot: async () => 'error.png', pause: () => { paused++; } };
  await submitBrowserJob(job, store, browser);
  assert.equal(store.get(job.id).status, 'gui_uncertain');
  assert.ok(!store.get(job.id).error.includes('private-session-url'));
  await submitBrowserJob(job, store, browser);
  assert.equal(store.get(job.id).status, 'needs_review'); assert.equal(clicks, 1); assert.equal(paused, 2);
});
test('登录/准备失败暂停队列，不点击分享', async t => {
  const { store, job } = fixture(t); let paused = false;
  await submitBrowserJob(job, store, {
    prepare: async () => { throw new Error('challenge'); }, share: () => assert.fail('禁止分享'),
    screenshot: async () => 'error.png', pause: () => { paused = true; },
  });
  assert.equal(store.get(job.id).status, 'needs_review'); assert.ok(paused);
});
test('已经开始 API 上传的任务不能通过网页再发一次', async t => {
  const { store, job } = fixture(t); job.containerId = '123';
  await submitBrowserJob(job, store, { prepare: () => assert.fail('禁止重复准备') });
  assert.equal(store.get(job.id).status, 'needs_review');
});
test('仅准备阶段失败可以重试；点击分享后不确定的任务禁止重置', async t => {
  const { store, job } = fixture(t);
  job.status = 'needs_review'; job.error = '浏览器发布准备失败，请检查登录、验证弹窗、账号和页面布局；运行 browser-login 后继续';
  retryBrowserJob(job, store); assert.equal(store.get(job.id).status, 'ready');
  job.status = 'needs_review'; job.error = '浏览器发布准备失败，测试'; job.browserShareStartedAt = new Date().toISOString();
  assert.throws(() => retryBrowserJob(job, store));
  delete job.browserShareStartedAt; job.error = '上次浏览器分享结果不明确，请在 Instagram 核对';
  assert.throws(() => retryBrowserJob(job, store));
  job.error = '浏览器发布准备失败，测试'; job.containerId = '123';
  assert.throws(() => retryBrowserJob(job, store));
});
test('单条立即发布不等排期、不需交互；成功任务再次执行不会重复分享', async t => {
  const { store, job } = fixture(t); let shares = 0;
  job.scheduled = '2099-01-01T00:00:00.000Z'; store.save(job);
  const browser = { prepare: async () => {}, share: async () => { shares++; return { confirmed: true }; } };
  const result = await publishBrowserNow(job.id, store, browser);
  assert.equal(result.status, 'published'); assert.equal(shares, 1);
  await publishBrowserNow(job.id, store, browser); assert.equal(shares, 1);
  await assert.rejects(() => publishBrowserNow('missing', store, browser));
});

// Real Chromium DOM test. Every request is fulfilled locally; no Instagram traffic or posts.
const fixtureHTML = `<!doctype html><html><body>
<b>your_username</b><button onclick="document.querySelector('#create-menu').hidden=false">Create</button>
<div id="create-menu" hidden><div onclick="this.parentElement.hidden=true;document.querySelector('[role=dialog]').hidden=false">Post</div><div>Live video</div><div>Ad</div></div>
<div role="dialog" hidden><input type="file" onchange="document.querySelector('#next').hidden=false">
<div id="crop" aria-label="Select crop" hidden onclick="document.querySelector('#original').hidden=false">Crop icon</div>
<div id="original" hidden onclick="window.original=true;this.hidden=true">Original</div>
<div id="next" hidden onclick="document.querySelector('#crop').hidden=true;if(++window.steps===2){this.hidden=true;document.querySelector('#editor').hidden=false}">Next</div>
<div id="editor" hidden><div contenteditable="true" role="textbox"></div>
<span onclick="window.shares++;if(!window.failShare){document.querySelector('[role=dialog]').innerHTML='<h2>Your reel has been shared.</h2>'}">Share</span></div></div>
<script>window.steps=0;window.shares=0;window.failShare=false;window.original=false;
document.querySelector('input[type=file]').addEventListener('change',()=>document.querySelector('#crop').hidden=false);</script></body></html>`;
test('真实 Edge DOM：Post、裁剪、Next 和 Share 都无按钮角色时完成预览及分享', async t => {
  const { dir, store, job } = fixture(t); const c = config();
  const { chromium, executablePath } = browserRuntime(root);
  assert.match(executablePath, /[\\/]Microsoft[\\/]Edge[\\/]Application[\\/]msedge\.exe$/i);
  const testBrowser = await chromium.launch({ executablePath, headless: true });
  const context = await testBrowser.newContext();
  t.after(async () => { await testBrowser.close(); });
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: fixtureHTML }));
  const browser = new BrowserInstagram(c, dir); browser.context = context; browser.page = await context.newPage();
  job.caption = '测试自动发布 🔪\n#asmr';
  const screenshot = await browser.prepare(job);
  assert.ok(screenshot.endsWith('.png'));
  assert.equal(await browser.page.evaluate(() => window.shares), 0);
  assert.equal(await browser.page.evaluate(() => window.original), true);
  assert.equal(await browser.page.getByRole('textbox').innerText(), job.caption);
  assert.equal(await browser.page.locator('input[type=file]').evaluate(e => e.files[0].name), 'video.mp4');
  // Immediate publishing drives the same full UI without stdin/Enter or scheduling waits.
  store.save(job);
  await publishBrowserNow(job.id, store, browser);
  assert.equal(await browser.page.evaluate(() => window.shares), 1);
  assert.equal(store.get(job.id).status, 'published');
  // A click without success UI must never be treated as success.
  await browser.prepare(job); await browser.page.evaluate(() => { window.failShare = true; });
  c.browser.uploadTimeoutSeconds = 0.1;
  await assert.rejects(() => browser.share());
});

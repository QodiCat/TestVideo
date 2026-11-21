import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, slots, validateConfig, Instagram, publishReady, reconcile, acquireLock } from '../scripts/publisher-core.mjs';

const config = () => JSON.parse(readFileSync(new URL('../publisher.example.json', import.meta.url), 'utf8'));
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'guiji-test-'));
  const store = new Store(root);
  t.after(() => { store.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, store };
}
test('北京时间排期转换 UTC，保留未来时间且按顺序排列', () => {
  const c = config(); c.schedule.times = ['20:00', '08:00']; c.schedule.daysAhead = 2;
  assert.deepEqual(slots(c, new Date('2026-11-20T01:00:00Z')), ['2026-11-20T12:00:00.000Z', '2026-11-21T00:00:00.000Z', '2026-11-21T12:00:00.000Z']);
});
test('负时区跨年转换', () => {
  const c = config(); c.schedule.times = ['23:00']; c.schedule.utcOffset = '-05:00'; c.schedule.daysAhead = 1;
  assert.deepEqual(slots(c, new Date('2026-12-31T12:00:00Z')), ['2027-01-01T04:00:00.000Z']);
});
test('拒绝危险和无效配置', () => {
  for (const mutate of [c => c.schedule.times = ['25:00'], c => c.schedule.times = ['20:00', '20:00'], c => c.schedule.utcOffset = '+14:30', c => c.video.cuts = [50, 10], c => c.video.seconds = [0], c => c.api.login = 'other']) {
    const c = config(); mutate(c); assert.throws(() => validateConfig(c));
  }
  assert.equal(validateConfig(config()).api.login, 'facebook');
});
test('排期持久化且幂等；配置修改不改写已排期视频和文案', t => {
  const { store } = fixture(t); const c = config(); const now = new Date('2026-11-20T01:00:00Z');
  assert.equal(store.plan(c, now), 7);
  const original = store.all();
  c.caption = 'changed'; c.video.cuts = [3];
  assert.equal(store.plan(c, now), 0);
  assert.deepEqual(store.all(), original);
});
test('运行锁阻止同时执行；正常结束后可再次取得', t => {
  const { root } = fixture(t); const release = acquireLock(root);
  assert.throws(() => acquireLock(root), /已有程序运行/);
  release(); acquireLock(root)();
});
test('本地 MP4 上传使用官方端点与二进制，授权不进入 URL', async t => {
  const { root } = fixture(t); const file = join(root, 'video.mp4'); writeFileSync(file, Buffer.from([1, 2, 3]));
  const calls = [];
  const api = new Instagram(config(), { token: 'secret-token', userId: '123', fetchImpl: async (url, options) => {
    calls.push({ url, options }); return Response.json(url.includes('rupload') ? { success: true } : { id: '456' });
  } });
  const id = await api.create({ caption: 'test', shareToFeed: true, isAiGenerated: false });
  await api.upload(id, file);
  assert.equal(calls[0].options.body.get('upload_type'), 'resumable');
  assert.equal(calls[1].url, 'https://rupload.facebook.com/ig-api-upload/v27.0/456');
  assert.deepEqual(calls[1].options.body, Buffer.from([1, 2, 3]));
  assert.equal(calls[1].options.headers.file_size, '3');
  assert.ok(calls.every(c => !c.url.includes('secret-token')));
});
test('Instagram Login 使用公网 URL，不误用本地上传', async () => {
  const c = config(); c.api.login = 'instagram'; c.api.publicVideoBaseUrl = 'https://cdn.example.com/video/';
  let captured;
  const api = new Instagram(c, { token: 'secret', userId: '123', fetchImpl: async (url, options) => { captured = { url, options }; return Response.json({ id: '456' }); } });
  await api.create({ id: 'abc', caption: 'hello', shareToFeed: false, isAiGenerated: false });
  assert.equal(captured.options.body.get('video_url'), 'https://cdn.example.com/video/abc.mp4');
  assert.equal(captured.options.body.has('upload_type'), false);
  assert.match(captured.url, /graph.instagram.com/);
});
test('失败响应不泄露上游返回的授权信息', async () => {
  const api = new Instagram(config(), { token: 'secret', userId: '123', fetchImpl: async () => Response.json({ error: { message: 'secret', code: 190 } }, { status: 400 }) });
  await assert.rejects(() => api.status('456'), e => !e.message.includes('secret') && e.message.includes('190'));
});
test('发布前先保存检查点，成功后记录媒体 ID', async t => {
  const { store } = fixture(t); store.plan(config(), new Date('2026-11-20T01:00:00Z'));
  const job = store.all()[0]; job.containerId = '456';
  await publishReady(job, store, { publish: async () => {
    assert.equal(store.get(job.id).status, 'publishing'); return { id: '789' };
  } });
  assert.equal(store.get(job.id).status, 'published'); assert.equal(store.get(job.id).mediaId, '789');
});
test('发布响应丢失后只核对状态，确认已发布时不重发', async t => {
  const { store } = fixture(t); store.plan(config(), new Date('2026-11-20T01:00:00Z'));
  const job = store.all()[0]; job.containerId = '456'; let publishes = 0;
  const api = { publish: async () => { publishes++; throw new Error('timeout'); }, status: async () => ({ status_code: 'PUBLISHED' }) };
  await publishReady(job, store, api); assert.equal(store.get(job.id).status, 'uncertain');
  await reconcile(job, store, api);
  assert.equal(store.get(job.id).status, 'published'); assert.equal(publishes, 1);
});
test('发布结果无法确认时等待人工核对，不能自动重发', async t => {
  const { store } = fixture(t); store.plan(config(), new Date('2026-11-20T01:00:00Z'));
  const job = store.all()[0]; job.containerId = '456'; job.status = 'publishing'; store.save(job);
  await reconcile(job, store, { status: async () => ({ status_code: 'FINISHED' }), publish: () => assert.fail('必须禁止自动重发') });
  assert.equal(store.get(job.id).status, 'needs_review');
});

import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { hasObject } from './catalog.mjs';

export function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

export function validateConfig(c) {
  const fail = message => { throw new Error('配置错误：' + message); };
  c.publishMode ??= 'api';
  if (!['api', 'browser'].includes(c.publishMode)) fail('publishMode 应为 api 或 browser');
  if (c.publishMode === 'browser') {
    if (!/^[A-Za-z0-9._]{1,30}$/.test(c.browser?.expectedUsername ?? '')) fail('browser.expectedUsername 需要填写目标 Instagram 用户名');
    if (!Number.isInteger(c.browser.uploadTimeoutSeconds) || c.browser.uploadTimeoutSeconds < 30 || c.browser.uploadTimeoutSeconds > 900) fail('browser.uploadTimeoutSeconds 应为 30–900');
  }
  if (!['facebook', 'instagram'].includes(c.api?.login)) fail('api.login 应为 facebook 或 instagram');
  if (!/^v\d+\.0$/.test(c.api.version)) fail('api.version 应形如 v27.0');
  if (c.api.publicVideoBaseUrl && !/^https:\/\//.test(c.api.publicVideoBaseUrl)) fail('视频地址必须为 HTTPS');
  const s = c.schedule;
  if (!s || !Array.isArray(s.times) || !s.times.length || s.times.some(t => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || new Set(s.times).size !== s.times.length) fail('times 需要不重复的 HH:mm 时间');
  if (!/^[+-](0\d|1[0-4]):[0-5]\d$/.test(s.utcOffset) || (s.utcOffset.slice(1, 3) === '14' && s.utcOffset.slice(4) !== '00')) fail('utcOffset 无效');
  for (const [key, min, max] of [['daysAhead', 1, 30], ['renderAheadHours', 1, 720], ['lateGraceMinutes', 1, 1440], ['pollSeconds', 10, 3600]]) {
    if (!Number.isInteger(s[key]) || s[key] < min || s[key] > max) fail('schedule.' + key + ' 超出范围');
  }
  const v = c.video;
  if (!v || !Array.isArray(v.objects) || !v.objects.length || v.objects.some(o => !hasObject(o))) fail('objects 含有不支持的物品，请查阅 OBJECTS.md');
  if (!Array.isArray(v.cuts) || !v.cuts.length || v.cuts.length > 6 || v.cuts.some((n, i) => !Number.isInteger(n) || n < 1 || n > 1000 || (i > 0 && n <= v.cuts[i - 1]))) fail('cuts 应为递增整数，范围 1–1000');
  if (!Array.isArray(v.seconds) || v.seconds.length !== v.cuts.length || v.seconds.some(n => !Number.isFinite(n) || n < 2 || n > 24) || v.seconds.reduce((a, b) => a + b, 0) < 3) fail('seconds 无效，视频总时长至少 3 秒');
  if (![360, 540, 720, 1080].includes(v.width) || ![24, 30, 60].includes(v.fps)) fail('width 或 fps 无效');
  if (typeof c.caption !== 'string' || c.caption.length > 2000) fail('caption 最多 2000 字符（为替换字段保留空间）');
  if (typeof c.shareToFeed !== 'boolean' || typeof c.isAiGenerated !== 'boolean') fail('shareToFeed / isAiGenerated 应为布尔值');
  return c;
}

export function slots(c, now = new Date()) {
  const s = c.schedule;
  const offset = (s.utcOffset[0] === '-' ? -1 : 1) * (Number(s.utcOffset.slice(1, 3)) * 60 + Number(s.utcOffset.slice(4)));
  const local = new Date(now.getTime() + offset * 60000);
  const base = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const result = [];
  for (let day = 0; day < s.daysAhead; day++) {
    for (const time of [...s.times].sort()) {
      const [h, m] = time.split(':').map(Number);
      const date = new Date(base + day * 86400000 + (h * 60 + m - offset) * 60000);
      if (date >= now) result.push(date.toISOString());
    }
  }
  return result;
}

export class Store {
  constructor(root) {
    mkdirSync(join(root, 'data'), { recursive: true });
    this.db = new DatabaseSync(join(root, 'data', 'publisher.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, scheduled TEXT UNIQUE NOT NULL, body TEXT NOT NULL);`);
  }
  all() { return this.db.prepare('SELECT body FROM jobs ORDER BY scheduled').all().map(r => JSON.parse(r.body)); }
  get(id) { const r = this.db.prepare('SELECT body FROM jobs WHERE id=?').get(id); return r && JSON.parse(r.body); }
  save(j) { this.db.prepare('INSERT INTO jobs VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(j.id, j.scheduled, JSON.stringify(j)); }
  plan(c, now = new Date()) {
    let count = 0;
    for (const scheduled of slots(c, now)) {
      const id = createHash('sha256').update(scheduled).digest('hex').slice(0, 16);
      if (this.get(id)) continue;
      const seed = parseInt(id.slice(0, 8), 16);
      const object = c.video.objects[seed % c.video.objects.length];
      const { objects, ...video } = c.video;
      const caption = c.caption.replaceAll('{object}', object).replaceAll('{cuts}', video.cuts.join(' / '));
      if (caption.length > 2200) throw new Error('替换字段后的 caption 超过 2200 字符');
      this.save({ id, scheduled, status: 'queued', video: { ...video, object, seed }, caption,
        shareToFeed: c.shareToFeed, isAiGenerated: c.isAiGenerated, attempts: 0 });
      count++;
    }
    return count;
  }
  close() { this.db.close(); }
}

export function acquireLock(root) {
  const path = join(root, 'data', 'worker.lock');
  mkdirSync(join(root, 'data'), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(path, String(process.pid), { flag: 'wx' });
      return () => { try { unlinkSync(path); } catch {} };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const pid = Number(readFileSync(path, 'utf8'));
      if (!Number.isInteger(pid) || pid < 1) throw new Error('worker.lock 损坏，请确认没有运行中的进程后手动删除');
      try { process.kill(pid, 0); }
      catch (error) { if (error.code === 'ESRCH') { try { unlinkSync(path); } catch {} continue; } }
      throw new Error('已有程序运行，PID ' + pid);
    }
  }
  throw new Error('无法取得运行锁');
}

export class Instagram {
  constructor(c, { token = process.env.INSTAGRAM_ACCESS_TOKEN, userId = process.env.INSTAGRAM_USER_ID, fetchImpl = fetch } = {}) {
    if (!token || !/^\d+$/.test(userId ?? '')) throw new Error('请在 .env 设置 INSTAGRAM_USER_ID 和 INSTAGRAM_ACCESS_TOKEN');
    this.token = token; this.userId = userId; this.fetch = fetchImpl; this.config = c;
    this.base = `https://graph.${c.api.login === 'facebook' ? 'facebook' : 'instagram'}.com/${c.api.version}`;
  }
  async request(path, body) {
    let response;
    try {
      response = await this.fetch(this.base + '/' + path, {
        method: body ? 'POST' : 'GET', redirect: 'error',
        headers: { Authorization: 'Bearer ' + this.token, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        body: body ? new URLSearchParams(body) : undefined,
        signal: AbortSignal.timeout(60000),
      });
    } catch { throw new Error('Meta 请求失败或超时'); }
    let data;
    try { data = await response.json(); } catch { throw new Error('Meta 返回非 JSON 响应，HTTP ' + response.status); }
    if (!response.ok || data.error) {
      // Do not log upstream messages: they may contain tokens or signed URLs.
      throw new Error(`Meta HTTP ${response.status} code=${data.error?.code ?? '?'} subcode=${data.error?.error_subcode ?? '?'}`);
    }
    return data;
  }
  async create(job) {
    const body = { media_type: 'REELS', caption: job.caption, share_to_feed: String(job.shareToFeed), is_ai_generated: String(job.isAiGenerated) };
    if (this.config.api.login === 'facebook') body.upload_type = 'resumable';
    else {
      if (!this.config.api.publicVideoBaseUrl) throw new Error('Instagram Login 需要配置 publicVideoBaseUrl 并将 MP4 同步到该公网目录；或改用 Facebook Login 本地上传');
      body.video_url = this.config.api.publicVideoBaseUrl.replace(/\/$/, '') + '/' + job.id + '.mp4';
    }
    const data = await this.request(this.userId + '/media', body);
    if (!/^\d+$/.test(data.id ?? '')) throw new Error('Meta 未返回有效容器 ID');
    return data.id;
  }
  async upload(containerId, file) {
    const bytes = readFileSync(file);
    let response;
    try {
      response = await this.fetch(`https://rupload.facebook.com/ig-api-upload/${this.config.api.version}/${containerId}`, {
        method: 'POST', redirect: 'error', headers: { Authorization: 'OAuth ' + this.token, offset: '0', file_size: String(bytes.length), 'Content-Type': 'application/octet-stream' },
        body: bytes, signal: AbortSignal.timeout(300000),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error();
    } catch { throw new Error('视频上传失败，请检查网络、授权及文件规格'); }
  }
  status(id) { return this.request(id + '?fields=status_code'); }
  publish(id) { return this.request(this.userId + '/media_publish', { creation_id: id }); }
}

// Persist before and after the irreversible request. Never automatically replay an uncertain publish.
export async function publishReady(job, store, api) {
  job.status = 'publishing'; store.save(job);
  try {
    const result = await api.publish(job.containerId);
    if (!/^\d+$/.test(result.id ?? '')) throw new Error('Meta 未返回有效媒体 ID');
    job.mediaId = result.id; job.status = 'published'; job.publishedAt = new Date().toISOString();
    delete job.error; store.save(job);
  } catch (e) {
    job.status = 'uncertain'; job.error = e.message; store.save(job);
  }
}

export async function reconcile(job, store, api) {
  const result = await api.status(job.containerId);
  if (result.status_code === 'PUBLISHED') {
    job.status = 'published'; job.publishedAt ??= new Date().toISOString(); delete job.error;
  } else {
    job.status = 'needs_review'; job.error = '发布结果未确认，容器状态 ' + result.status_code + '；请先在 Instagram 核对，程序不会自动重发';
  }
  store.save(job);
}

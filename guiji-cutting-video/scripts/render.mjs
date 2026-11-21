import { spawnSync } from 'node:child_process';
import { constants, existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { homedir, tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { impactTime, makeTimeline, randomFromSeed } from './timeline.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cache = process.env.GUIJI_CUTTING_DEPS
  ?? join(process.env.LOCALAPPDATA ?? homedir(), 'guiji-cutting-renderer');

function loadDependencies() {
  const require = createRequire(join(resolve(cache), 'package.json'));
  try {
    const { chromium } = require('playwright-core');
    const three = join(dirname(require.resolve('three')), 'three.module.js');
    return { chromium, three };
  } catch {
    throw new Error('Missing renderer dependencies at ' + cache + '. See SKILL.md for installation.');
  }
}

function findBrowser() {
  const candidates = [
    process.env.GUIJI_CHROMIUM,
    ...[process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]
      .filter(Boolean).flatMap(root => [
        join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ]),
  ];
  const browser = candidates.find(path => path && existsSync(path));
  if (!browser) throw new Error('Set GUIJI_CHROMIUM to a Chromium, Chrome, or Edge executable.');
  return browser;
}

function configuration(input) {
  const { object, cuts, label, seed = 1511, width = 720, fps = 30 } = input;
  const seconds = input.seconds ?? cuts?.map((_, i) => 4.5 + i * 1.5);
  if (!['kiwi', 'dragonfruit', 'soap'].includes(object)) throw new Error('Unknown object preset.');
  if (!Array.isArray(cuts) || cuts.length < 1 || cuts.length > 6 ||
      cuts.some((n, i) => !Number.isInteger(n) || n < 1 || n > 1000 || (i && n <= cuts[i - 1]))) {
    throw new Error('cuts must contain 1–6 strictly increasing integer values from 1 to 1000.');
  }
  if (!Array.isArray(seconds) || seconds.length !== cuts.length ||
      seconds.some(n => !Number.isFinite(n) || n < 2 || n > 24)) {
    throw new Error('seconds must have one duration from 2 to 24 for each stage.');
  }
  if (![360, 540, 720, 1080].includes(width) || ![24, 30, 60].includes(fps) ||
      !Number.isSafeInteger(seed) || (label !== undefined && (typeof label !== 'string' || label.length > 26))) {
    throw new Error('Invalid width, fps, seed, or label. See SKILL.md.');
  }
  return { object, cuts, seconds, label, seed, width, height: width * 16 / 9, fps };
}

async function startServer(three) {
  const files = {
    '/scene.mjs': join(scriptDir, 'scene.mjs'),
    '/timeline.mjs': join(scriptDir, 'timeline.mjs'),
    '/three.module.js': three,
    '/three.core.js': join(dirname(three), 'three.core.js'),
  };
  const assets = new Map(await Promise.all(Object.entries(files)
    .map(async ([url, path]) => [url, await readFile(path)])));
  const server = createServer((request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><meta charset="utf-8"><script type="module" src="/scene.mjs"></script>');
    } else if (assets.has(request.url)) {
      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      response.end(assets.get(request.url));
    } else {
      response.writeHead(404).end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

function makeAudio(timeline, duration, seed) {
  const rate = 44100;
  const rand = randomFromSeed(seed + 19);
  const signal = new Float32Array(Math.ceil(duration * rate));
  for (const stage of timeline) {
    let previous = -1;
    for (let cut = 0; cut < stage.count; cut++) {
      const hit = impactTime(stage, cut);
      if (hit - previous < 0.039) continue;
      previous = hit;
      const first = Math.round((stage.start + hit) * rate);
      const strength = (0.55 + rand() * 0.31) * (stage.count < 35 ? 1 : 0.74);
      const tone = 125 + rand() * 80;
      let filtered = 0;
      for (let i = 0; i < 0.105 * rate && first + i < signal.length; i++) {
        const t = i / rate;
        const noise = rand() * 2 - 1;
        filtered += (noise - filtered) * 0.16;
        const crack = (noise - filtered) * Math.exp(-t * 185) * 0.64;
        const grain = filtered * Math.exp(-t * 52) * 1.25;
        const thump = Math.sin(2 * Math.PI * tone * t) * Math.exp(-t * 64) * 0.31;
        signal[first + i] += strength * Math.min(1, t * 1830) * (crack + grain + thump);
      }
    }
  }
  const wav = Buffer.alloc(44 + signal.length * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(signal.length * 2, 40);
  for (let i = 0; i < signal.length; i++) {
    wav.writeInt16LE(Math.round(Math.tanh(signal[i] * 1.58) * 32767), 44 + i * 2);
  }
  return wav;
}

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('FFmpeg did not finish encoding, exit ' + result.status);
}

async function main() {
  const [spec, target, stillOption] = process.argv.slice(2);
  if (!spec || !target || (stillOption !== undefined && !stillOption.startsWith('--still='))) {
    throw new Error('Usage: node render.mjs <config.json> <out.mp4> [--still=SECONDS with out.jpg]');
  }
  const config = configuration(JSON.parse((await readFile(spec, 'utf8')).replace(/^\uFEFF/, '')));
  const timeline = makeTimeline(config.cuts, config.seconds);
  const duration = config.seconds.reduce((a, b) => a + b, 0);
  const still = stillOption === undefined ? null : Number(stillOption.slice(8));
  if (still !== null && (!Number.isFinite(still) || still < 0 || still >= duration)) {
    throw new Error('Still time must fall within the video.');
  }
  const output = resolve(target);
  if ((still === null && extname(output).toLowerCase() !== '.mp4') ||
      (still !== null && !['.jpg', '.jpeg'].includes(extname(output).toLowerCase()))) {
    throw new Error('Output must be .mp4, or .jpg when using --still.');
  }
  if (existsSync(output)) throw new Error('Output already exists: ' + output);
  const { chromium, three } = loadDependencies();
  const executablePath = findBrowser();
  await mkdir(dirname(output), { recursive: true });
  const folder = await mkdtemp(join(tmpdir(), 'guiji-cutting-'));
  let server;
  let browser;
  try {
    server = await startServer(three);
    browser = await chromium.launch({
      executablePath, headless: true, args: ['--enable-unsafe-swiftshader', '--disable-background-timer-throttling'],
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    try {
      await page.waitForFunction(() => typeof window.configureVideo === 'function', undefined, { timeout: 8000 });
      await page.evaluate(config => window.configureVideo(config), config);
    } catch (error) {
      throw new Error('Could not start 3D scene. ' + [...errors, error.message].join(' '));
    }
    const frames = Math.ceil(duration * config.fps);
    if (still !== null) {
      const [frame] = await page.evaluate(times => window.renderBatch(times), [still]);
      await writeFile(output, Buffer.from(frame, 'base64'), { flag: 'wx' });
      console.log(output);
      return;
    }
    for (let start = 0; start < frames; start += 12) {
      const times = Array.from({ length: Math.min(12, frames - start) }, (_, i) => (start + i) / config.fps);
      const images = await page.evaluate(times => window.renderBatch(times), times);
      await Promise.all(images.map((img, i) => writeFile(
        join(folder, 'frame-' + String(start + i).padStart(6, '0') + '.jpg'), Buffer.from(img, 'base64'))));
      if (start % 120 === 0) console.log('Rendered ' + Math.min(start + 12, frames) + ' / ' + frames + ' frames');
    }
    await browser.close();
    browser = null;
    const audio = join(folder, 'effects.wav');
    const encoded = join(folder, 'encoded.mp4');
    await writeFile(audio, makeAudio(timeline, frames / config.fps, config.seed));
    ffmpeg(['-framerate', String(config.fps), '-i', join(folder, 'frame-%06d.jpg'), '-i', audio,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', encoded]);
    await copyFile(encoded, output, constants.COPYFILE_EXCL);
    console.log(output);
  } finally {
    if (browser) await browser.close();
    if (server) server.close();
    for (const file of await readdir(folder)) await unlink(join(folder, file));
    await rmdir(folder);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

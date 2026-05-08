import { access, stat, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getCaptionPath, loadConfig } from './config-utils.js';

const execFileAsync = promisify(execFile);
const baseRequiredFiles = [
  'edit.config.json',
  'captions/sample.srt',
  'captions/parsed-captions.json',
  'captions/edit-plan.json',
  'compositions/current.html',
  'compositions/version-001.html'
];
const requiredDirs = ['assets/raw', 'assets/audio', 'assets/images', 'captions', 'prompts', 'compositions', 'scripts', 'edit-notes', 'changelog', 'output'];

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

async function commandVersion(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 8000 });
    return { ok: true, output: `${stdout}${stderr}`.trim().split('\n').slice(0, 2).join(' ') };
  } catch (error) {
    return { ok: false, output: error.message };
  }
}

function validateTimedElements(html) {
  const warnings = [];
  const tagPattern = /<([a-z0-9-]+)\b([^>]*)>/gi;
  for (const match of html.matchAll(tagPattern)) {
    const [, tagName, attrs] = match;
    const timed = /\bdata-start=/.test(attrs) || /\bdata-duration=/.test(attrs);
    if (!timed) continue;
    const isVideoOrAudio = ['video', 'audio'].includes(tagName.toLowerCase());
    if (!isVideoOrAudio && !/\bclass=["'][^"']*\bclip\b/.test(attrs)) {
      warnings.push(`timed element <${tagName}> 缺少 class="clip"：${match[0].slice(0, 120)}...`);
    }
  }
  return warnings;
}

async function main() {
  let errors = 0;
  let warnings = 0;
  const config = await loadConfig();

  for (const dir of requiredDirs) {
    if (await exists(dir) && (await stat(dir)).isDirectory()) console.log(`✓ 目录存在：${dir}`);
    else { console.error(`✗ 缺少目录：${dir}`); errors += 1; }
  }

  const requiredFiles = [...baseRequiredFiles, getCaptionPath(config)];
  if (config.mode === 'real') requiredFiles.push(config.rawVideoPath, config.videoMetadataPath);

  for (const file of [...new Set(requiredFiles)]) {
    if (await exists(file) && (await stat(file)).isFile()) console.log(`✓ 文件存在：${file}`);
    else if (config.mode === 'demo' && file === config.rawVideoPath) { console.warn(`⚠ demo 模式未找到真实视频素材：${file}（不影响 demo）`); warnings += 1; }
    else { console.error(`✗ 缺少文件：${file}`); errors += 1; }
  }

  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor >= 22) console.log(`✓ Node.js ${process.version}，满足 >= 22`);
  else { console.error(`✗ Node.js ${process.version}，需要 >= 22`); errors += 1; }

  const ffmpeg = await commandVersion('ffmpeg', ['-version']);
  if (ffmpeg.ok) console.log(`✓ FFmpeg 可用：${ffmpeg.output}`);
  else { console.warn(`⚠ FFmpeg 不可用：${ffmpeg.output}`); warnings += 1; }

  const ffprobe = await commandVersion('ffprobe', ['-version']);
  if (ffprobe.ok) console.log(`✓ FFprobe 可用：${ffprobe.output}`);
  else if (config.mode === 'real') { console.error(`✗ real 模式需要 FFprobe：${ffprobe.output}`); errors += 1; }
  else { console.warn(`⚠ FFprobe 不可用：${ffprobe.output}`); warnings += 1; }

  if (config.mode === 'demo') {
    if (await exists(config.rawVideoPath)) console.log(`✓ 已找到真实视频素材：${config.rawVideoPath}`);
    else { console.warn(`⚠ 未找到 ${config.rawVideoPath}，demo 将使用 composition 内置占位画面。`); warnings += 1; }
  }

  const compositionHtml = await readFile('compositions/current.html', 'utf8');
  const timedWarnings = validateTimedElements(compositionHtml);
  if (timedWarnings.length === 0) console.log('✓ timed elements 均符合 class="clip" 规范（video/audio 由 HyperFrames 管理）。');
  else {
    for (const warning of timedWarnings) console.warn(`⚠ ${warning}`);
    warnings += timedWarnings.length;
  }
  if (compositionHtml.includes('window.__timelines') && compositionHtml.includes('zz-auto-edit-version-001')) console.log('✓ composition 已注册 window.__timelines。');
  else { console.error('✗ composition 缺少 window.__timelines 注册。'); errors += 1; }

  if (errors > 0) {
    console.error(`✗ 项目校验失败：${errors} 个错误，${warnings} 个警告。`);
    process.exitCode = 1;
  } else {
    console.log(`✓ 项目校验通过：0 个错误，${warnings} 个警告。`);
  }
}

main().catch((error) => {
  console.error(`✗ 项目校验异常：${error.message}`);
  process.exitCode = 1;
});

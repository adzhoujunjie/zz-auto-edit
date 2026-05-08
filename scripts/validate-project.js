import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const requiredFiles = [
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

async function main() {
  let errors = 0;
  let warnings = 0;
  const config = JSON.parse(await (await import('node:fs/promises')).readFile('edit.config.json', 'utf8'));

  for (const dir of requiredDirs) {
    if (await exists(dir) && (await stat(dir)).isDirectory()) console.log(`✓ 目录存在：${dir}`);
    else { console.error(`✗ 缺少目录：${dir}`); errors += 1; }
  }

  for (const file of requiredFiles) {
    if (await exists(file) && (await stat(file)).isFile()) console.log(`✓ 文件存在：${file}`);
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
  else { console.warn(`⚠ FFprobe 不可用：${ffprobe.output}`); warnings += 1; }

  if (await exists(config.rawVideoPath)) console.log(`✓ 已找到真实视频素材：${config.rawVideoPath}`);
  else { console.warn(`⚠ 未找到 ${config.rawVideoPath}，demo 将使用 composition 内置占位画面。`); warnings += 1; }

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

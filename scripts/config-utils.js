import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

export const CONFIG_PATH = 'edit.config.json';
export const METADATA_PATH = 'metadata/video-metadata.json';

export async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function loadConfig() {
  const config = await readJson(CONFIG_PATH);
  const mode = process.env.EDIT_MODE || config.mode || 'demo';
  if (!['demo', 'real'].includes(mode)) throw new Error('edit.config.json 的 mode 必须是 "demo" 或 "real"。');
  return { ...config, mode };
}

export function getCaptionPath(config) {
  return config.mode === 'demo' ? config.demoCaptionPath : config.captionPath;
}

export function getDuration(config, metadata = null, captions = []) {
  if (config.mode === 'real' && config.autoDetectDuration && metadata?.duration) return Number(metadata.duration);
  const captionEnd = captions.length ? Math.max(...captions.map((caption) => Number(caption.end) || 0)) : 0;
  return Number(config.duration || config.fallbackDuration || captionEnd || 15);
}

export async function assertRealInputs(config) {
  const missing = [];
  if (!(await exists(config.rawVideoPath))) missing.push(`真实视频不存在：${config.rawVideoPath}`);
  if (!(await exists(config.captionPath))) missing.push(`真实字幕不存在：${config.captionPath}`);
  if (missing.length) {
    throw new Error(`${missing.join('；')}。请把 main.mp4 放到 assets/raw/main.mp4，并把 main.srt 放到 captions/main.srt，或修改 edit.config.json。`);
  }
}

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const CONFIG_PATH = 'edit.config.json';

function parseTimestamp(value) {
  const match = value.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) throw new Error(`时间戳格式无效："${value}"，应为 00:00:00,000`);
  const [, hh, mm, ss, ms] = match;
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000;
}

function parseSrt(input) {
  const normalized = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) throw new Error('SRT 文件为空，请检查 captionPath 指向的字幕文件。');

  const blocks = normalized.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return blocks.map((block, blockIndex) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length < 3) throw new Error(`第 ${blockIndex + 1} 个字幕块不完整，需要序号、时间轴和正文。`);

    const index = Number.parseInt(lines[0], 10);
    if (!Number.isInteger(index) || index <= 0) throw new Error(`第 ${blockIndex + 1} 个字幕块序号无效：${lines[0]}`);

    const timeMatch = lines[1].match(/^(.+?)\s*-->\s*(.+?)$/);
    if (!timeMatch) throw new Error(`第 ${index} 条字幕缺少合法时间轴：${lines[1]}`);

    const start = parseTimestamp(timeMatch[1]);
    const end = parseTimestamp(timeMatch[2]);
    if (end <= start) throw new Error(`第 ${index} 条字幕结束时间必须晚于开始时间。`);

    return { index, start, end, text: lines.slice(2).join(' ') };
  });
}

async function main() {
  try {
    const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
    if (!config.captionPath || !config.parsedCaptionPath) {
      throw new Error('edit.config.json 必须包含 captionPath 和 parsedCaptionPath。');
    }
    const srt = await readFile(config.captionPath, 'utf8');
    const captions = parseSrt(srt);
    await mkdir(path.dirname(config.parsedCaptionPath), { recursive: true });
    await writeFile(config.parsedCaptionPath, `${JSON.stringify(captions, null, 2)}\n`, 'utf8');
    console.log(`✓ 已解析 ${captions.length} 条字幕 → ${config.parsedCaptionPath}`);
  } catch (error) {
    console.error(`✗ 字幕解析失败：${error.message}`);
    process.exitCode = 1;
  }
}

main();

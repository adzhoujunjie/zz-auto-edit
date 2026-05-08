import { readFile } from 'node:fs/promises';
import { assertRealInputs, getCaptionPath, loadConfig, writeJson } from './config-utils.js';

function parseTimestamp(value, lineNumber) {
  const match = value.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) throw new Error(`第 ${lineNumber} 行时间戳格式无效："${value}"，应为 00:00:00,000`);
  const [, hh, mm, ss, ms] = match;
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000;
}

function parseSrt(input, filePath) {
  const normalized = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized.trim()) throw new Error(`SRT 文件为空：${filePath}`);

  const lines = normalized.split('\n');
  const captions = [];
  let cursor = 0;

  while (cursor < lines.length) {
    while (cursor < lines.length && !lines[cursor].trim()) cursor += 1;
    if (cursor >= lines.length) break;

    const indexLineNumber = cursor + 1;
    const indexText = lines[cursor].trim();
    const index = Number.parseInt(indexText, 10);
    if (!Number.isInteger(index) || index <= 0 || String(index) !== indexText) {
      throw new Error(`第 ${indexLineNumber} 行字幕序号无效：${indexText}`);
    }
    cursor += 1;

    const timelineLineNumber = cursor + 1;
    const timeline = lines[cursor]?.trim();
    if (!timeline) throw new Error(`第 ${timelineLineNumber} 行缺少字幕时间轴。`);
    const timeMatch = timeline.match(/^(.+?)\s*-->\s*(.+?)$/);
    if (!timeMatch) throw new Error(`第 ${timelineLineNumber} 行时间轴无效：${timeline}`);
    const start = parseTimestamp(timeMatch[1], timelineLineNumber);
    const end = parseTimestamp(timeMatch[2], timelineLineNumber);
    if (end <= start) throw new Error(`第 ${timelineLineNumber} 行结束时间必须晚于开始时间。`);
    cursor += 1;

    const textLines = [];
    const firstTextLine = cursor + 1;
    while (cursor < lines.length && lines[cursor].trim()) {
      textLines.push(lines[cursor].trim());
      cursor += 1;
    }
    if (textLines.length === 0) throw new Error(`第 ${firstTextLine} 行缺少字幕正文。`);
    captions.push({ index, start, end, text: textLines.join(' ') });
  }

  return captions;
}

async function main() {
  try {
    const config = await loadConfig();
    if (config.mode === 'real') await assertRealInputs(config);
    const captionPath = getCaptionPath(config);
    if (!captionPath || !config.parsedCaptionPath) throw new Error('edit.config.json 必须包含 captionPath/demoCaptionPath 和 parsedCaptionPath。');
    const srt = await readFile(captionPath, 'utf8');
    const captions = parseSrt(srt, captionPath);
    await writeJson(config.parsedCaptionPath, captions);
    console.log(`✓ 已解析 ${captions.length} 条字幕（${config.mode} 模式：${captionPath}）→ ${config.parsedCaptionPath}`);
  } catch (error) {
    console.error(`✗ 字幕解析失败：${error.message}`);
    process.exitCode = 1;
  }
}

main();

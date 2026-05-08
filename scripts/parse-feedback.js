import { readFile } from 'node:fs/promises';
import { writeJson } from './config-utils.js';

const FEEDBACK_PATH = 'prompts/feedback.md';
const OUTPUT_PATH = 'prompts/feedback-plan.json';
const TARGET_VERSION = 'version-002';

function parseClock(value) {
  const parts = String(value).split(':').map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function parseTimeRange(rawText) {
  const clockRange = rawText.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*[-—–至到]\s*(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (clockRange) {
    const start = parseClock(clockRange[1]);
    const end = parseClock(clockRange[2]);
    if (start !== null && end !== null && end > start) return { start, end };
  }

  const secondRange = rawText.match(/(\d+(?:\.\d+)?)\s*秒?\s*[-—–至到]\s*(\d+(?:\.\d+)?)\s*秒/);
  if (secondRange) {
    const start = Number(secondRange[1]);
    const end = Number(secondRange[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) return { start, end };
  }

  if (/全片|整体/.test(rawText)) return null;
  return undefined;
}

function detectTarget(rawText) {
  if (/全片|整体/.test(rawText)) return 'global';
  if (/大字|屏幕大字|标题/.test(rawText)) return 'callout';
  if (/字幕|底部字幕/.test(rawText)) return 'subtitle';
  if (/装饰|元素|贴图/.test(rawText)) return 'overlay';
  if (/镜头|画面|人物太满|人物不要太满/.test(rawText)) return 'camera';
  return null;
}

function detectAction(rawText, target) {
  if (/往左上|左上移动/.test(rawText)) return 'move_top_left';
  if (/往右上|右上移动/.test(rawText)) return 'move_top_right';
  if (/上移|往上/.test(rawText)) return 'move_up';
  if (/下移|往下/.test(rawText)) return 'move_down';
  if (/删除|去掉|减少/.test(rawText)) return 'reduce_or_remove';
  if (/降低亮度|暗一点/.test(rawText)) return 'decrease_brightness';
  if (/提亮|亮一点/.test(rawText)) return 'increase_brightness';
  if (/加大|变大|字号大一点/.test(rawText)) return 'increase_size';
  if (/拉远|人物不要太满/.test(rawText)) return 'zoom_out';
  if (/缩小/.test(rawText) && target === 'camera') return 'zoom_out';
  if (/推近/.test(rawText)) return 'zoom_in';
  if (/放大/.test(rawText) && target === 'camera') return 'zoom_in';
  if (/放大/.test(rawText) && ['callout', 'subtitle'].includes(target)) return 'increase_size';
  if (/变小|缩小/.test(rawText)) return 'decrease_size';
  return null;
}

function detectIntensity(rawText) {
  if (/一点|稍微|轻微/.test(rawText)) return 'low';
  if (/明显|大幅|很多/.test(rawText)) return 'high';
  return 'medium';
}

function extractFeedbackLines(markdown) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+[.)、]\s*/, '').trim())
    .filter((line) => line && !line.startsWith('#') && !/^请基于/.test(line));
}

function parseLine(rawText, index) {
  const timeRange = parseTimeRange(rawText);
  const target = detectTarget(rawText);
  const action = detectAction(rawText, target);
  const errors = [];

  if (timeRange === undefined) errors.push('无法识别时间范围');
  if (!target) errors.push('无法识别目标元素');
  if (!action) errors.push('无法识别动作');

  if (errors.length) {
    return {
      unresolved: true,
      id: `unresolved-${String(index + 1).padStart(3, '0')}`,
      rawText,
      reason: errors.join('；')
    };
  }

  return {
    id: `feedback-${String(index + 1).padStart(3, '0')}`,
    timeRange,
    target,
    action,
    intensity: detectIntensity(rawText),
    rawText
  };
}

async function main() {
  try {
    const markdown = await readFile(FEEDBACK_PATH, 'utf8');
    const parsed = extractFeedbackLines(markdown).map(parseLine);
    const items = parsed.filter((item) => !item.unresolved);
    const unresolvedItems = parsed.filter((item) => item.unresolved);
    const feedbackPlan = {
      source: FEEDBACK_PATH,
      targetVersion: TARGET_VERSION,
      items,
      unresolvedItems
    };

    await writeJson(OUTPUT_PATH, feedbackPlan);
    console.log(`✓ 已解析反馈：${items.length} 条可应用，${unresolvedItems.length} 条未识别 → ${OUTPUT_PATH}`);
    for (const item of unresolvedItems) console.warn(`⚠ 未识别反馈：${item.rawText}（${item.reason}）`);
  } catch (error) {
    console.error(`✗ 反馈解析失败：${error.message}`);
    process.exitCode = 1;
  }
}

main();

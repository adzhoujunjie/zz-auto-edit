import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { getDuration, loadConfig, readJson, writeJson, exists } from './config-utils.js';
import { writeCompositionFiles } from './generate-composition.js';

const SOURCE_VERSION = 'version-001';
const TARGET_VERSION = 'version-002';
const FEEDBACK_PLAN_PATH = 'prompts/feedback-plan.json';
const EDIT_PLAN_PATH = 'captions/edit-plan.json';
const VERSIONED_PLAN_PATH = `captions/edit-plan.${TARGET_VERSION}.json`;
const NOTES_PATH = `edit-notes/${TARGET_VERSION}.md`;
const CHANGELOG_PATH = `changelog/${TARGET_VERSION}.md`;

function rangesOverlap(element, timeRange) {
  if (!timeRange) return true;
  return Number(element.start) < Number(timeRange.end) && Number(element.end) > Number(timeRange.start);
}

function fmtRange(timeRange) {
  if (!timeRange) return '全片';
  return `${timeRange.start}s-${timeRange.end}s`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function regionToPixels(region, config) {
  if (!region) return null;
  return {
    x: Math.round(region.x * config.width),
    y: Math.round(region.y * config.height),
    width: Math.round(region.width * config.width),
    height: Math.round(region.height * config.height)
  };
}

function defaultCalloutPosition(callout, config) {
  const region = callout.position || callout.region || regionToPixels(config.safeArea.titleRegion, config) || { x: 154, y: 86, width: 960, height: 160 };
  return { ...region, width: Math.min(region.width || 960, 960), height: region.height || 160 };
}

function moveCalloutTopLeft(callout, config) {
  const before = callout.position || callout.region || null;
  const person = regionToPixels(config.safeArea.personRegion, config);
  const pos = defaultCalloutPosition(callout, config);
  const safeMargin = 48;
  const maxWidthBeforePerson = person ? Math.max(420, person.x - safeMargin - 96) : 760;
  callout.position = {
    x: 96,
    y: 72,
    width: Math.min(pos.width || 860, maxWidthBeforePerson),
    height: pos.height || 160
  };
  callout.avoidCoveringPerson = true;
  return { before, after: callout.position };
}

function adjustFontSize(element, direction, fallback, min, max) {
  const before = Number(element.fontSize || fallback);
  const multiplier = direction === 'increase' ? 1.12 : 0.9;
  element.fontSize = Math.round(clamp(before * multiplier, min, max));
  return { before, after: element.fontSize };
}

function adjustSubtitlePosition(subtitle, action, config) {
  const region = { ...(subtitle.position || subtitle.region || regionToPixels(config.safeArea.subtitleRegion, config)) };
  const before = { ...region };
  const delta = action === 'move_up' ? -44 : 44;
  region.y = Math.round(clamp(Number(region.y || 842) + delta, 560, config.height - Number(region.height || 170) - 42));
  subtitle.position = region;
  return { before, after: region };
}

function affectedIds(collection, item) {
  return collection.filter((element) => rangesOverlap(element, item.timeRange));
}

function applyCamera(plan, item, config, changes) {
  const maxScale = Number(config.rules.maxScale || 1.08);
  const moves = affectedIds(plan.cameraMoves || [], item);
  for (const move of moves) {
    const before = { fromScale: move.fromScale, toScale: move.toScale };
    if (item.action === 'zoom_out') {
      move.fromScale = clamp(Math.min(Number(move.fromScale || 1), 1.03), 1, maxScale);
      move.toScale = clamp(Math.min(Number(move.toScale || 1), 1.035), 1, maxScale);
      move.note = `${move.note || ''} 根据反馈拉远，避免人物太满。`.trim();
    } else if (item.action === 'zoom_in') {
      move.fromScale = clamp(Number(move.fromScale || 1) + 0.015, 1, maxScale);
      move.toScale = clamp(Number(move.toScale || 1) + 0.02, 1, maxScale);
      move.note = `${move.note || ''} 根据反馈轻微推近。`.trim();
    }
    changes.push({ item, element: move.id, before, after: { fromScale: move.fromScale, toScale: move.toScale }, impact: '仅影响重叠时间段内的 cameraMoves。' });
  }
  if (!moves.length) changes.push({ item, element: 'cameraMoves', before: '未找到重叠镜头', after: '未修改', impact: '无其他片段影响' });
}

function applyCallout(plan, item, config, changes) {
  const callouts = affectedIds(plan.callouts || [], item);
  for (const callout of callouts) {
    if (item.action === 'move_top_left') {
      const { before, after } = moveCalloutTopLeft(callout, config);
      changes.push({ item, element: callout.id, before, after, impact: '仅移动重叠时间段的大字，尽量避开人物安全区。' });
    } else if (item.action === 'increase_size' || item.action === 'decrease_size') {
      const result = adjustFontSize(callout, item.action === 'increase_size' ? 'increase' : 'decrease', 68, 42, 82);
      changes.push({ item, element: callout.id, before: `fontSize=${result.before}`, after: `fontSize=${result.after}`, impact: '仅调整重叠时间段大字大小。' });
    }
  }
  if (!callouts.length) changes.push({ item, element: 'callouts', before: '未找到重叠大字', after: '未修改', impact: '无其他片段影响' });
}

function applySubtitle(plan, item, config, changes) {
  const subtitles = affectedIds(plan.subtitles || [], item);
  for (const subtitle of subtitles) {
    subtitle.maxLines = Math.min(Number(subtitle.maxLines || config.rules.subtitleMaxLines || 2), 2);
    if (item.action === 'increase_size' || item.action === 'decrease_size') {
      const result = adjustFontSize(subtitle, item.action === 'increase_size' ? 'increase' : 'decrease', 48, 34, 58);
      changes.push({ item, element: subtitle.id, before: `fontSize=${result.before}`, after: `fontSize=${result.after}`, impact: '仅调整重叠时间段字幕字号，保留最多两行。' });
    } else if (item.action === 'move_up' || item.action === 'move_down') {
      const result = adjustSubtitlePosition(subtitle, item.action, config);
      changes.push({ item, element: subtitle.id, before: result.before, after: result.after, impact: '仅调整重叠时间段字幕区域。' });
    }
  }
  if (!subtitles.length) changes.push({ item, element: 'subtitles', before: '未找到重叠字幕', after: '未修改', impact: '无其他片段影响' });
}

function applyOverlay(plan, item, changes) {
  const overlays = affectedIds(plan.overlays || [], item);
  for (const overlay of overlays) {
    const before = { opacity: overlay.opacity ?? 1, hidden: Boolean(overlay.hidden) };
    if (overlay.type === 'small-dot') overlay.hidden = true;
    else overlay.opacity = Math.min(Number(overlay.opacity ?? 1), 0.35);
    changes.push({ item, element: overlay.id, before, after: { opacity: overlay.opacity ?? 1, hidden: Boolean(overlay.hidden) }, impact: '仅降低或隐藏重叠时间段内装饰，不删除必要字幕/大字信息。' });
  }
  if (!overlays.length) changes.push({ item, element: 'overlays', before: '未找到重叠装饰', after: '未修改', impact: '无其他片段影响' });
}

function applyGlobal(plan, item, changes) {
  const before = { ...(plan.visualAdjustments || {}) };
  plan.visualAdjustments = { ...(plan.visualAdjustments || {}) };
  if (item.action === 'increase_brightness') {
    plan.visualAdjustments.brightness = Math.min(Number(plan.visualAdjustments.brightness || 1) + 0.06, 1.12);
    plan.visualAdjustments.contrast = Math.min(Number(plan.visualAdjustments.contrast || 1) + 0.03, 1.08);
  } else if (item.action === 'decrease_brightness') {
    plan.visualAdjustments.brightness = Math.max(Number(plan.visualAdjustments.brightness || 1) - 0.06, 0.9);
    plan.visualAdjustments.contrast = Number(plan.visualAdjustments.contrast || 1);
  }
  changes.push({ item, element: 'visualAdjustments', before, after: plan.visualAdjustments, impact: '全片轻微视觉调整，会影响所有片段。' });
}

function applyFeedbackItem(plan, item, config, changes) {
  if (item.target === 'camera') applyCamera(plan, item, config, changes);
  else if (item.target === 'callout') applyCallout(plan, item, config, changes);
  else if (item.target === 'subtitle') applySubtitle(plan, item, config, changes);
  else if (item.target === 'overlay') applyOverlay(plan, item, changes);
  else if (item.target === 'global') applyGlobal(plan, item, changes);
}

function mdValue(value) {
  if (value === null || value === undefined) return '无';
  if (typeof value === 'string') return value;
  return `\`${JSON.stringify(value)}\``;
}

function buildNotes(feedbackMarkdown, feedbackPlan, changes) {
  const applied = changes.map((change) => `- ${fmtRange(change.item.timeRange)}｜${change.item.target}/${change.item.action}｜${change.element}：${mdValue(change.before)} → ${mdValue(change.after)}`).join('\n') || '- 无';
  const unresolved = (feedbackPlan.unresolvedItems || []).map((item) => `- ${item.rawText}（${item.reason}）`).join('\n') || '- 无';
  return `# ${TARGET_VERSION} 编辑说明\n\n## 基础版本\n\n基于 ${SOURCE_VERSION} 的真实视频剪辑计划做局部微调，没有推翻整条视频。\n\n## 用户反馈原文\n\n${feedbackMarkdown.trim()}\n\n## 实际应用的修改\n\n${applied}\n\n## 未识别反馈\n\n${unresolved}\n\n## 如何预览和导出\n\n- 预览：\`npm run preview\`\n- 构建反馈版：\`npm run build:feedback\`\n- 导出：\`npm run render:feedback\`\n- 输出：\`output/${TARGET_VERSION}.mp4\`\n`;
}

function buildChangelog(changes) {
  const lines = changes.map((change) => `- 时间段：${fmtRange(change.item.timeRange)}\n  - 元素：${change.element}（${change.item.target}/${change.item.action}）\n  - 修改前：${mdValue(change.before)}\n  - 修改后：${mdValue(change.after)}\n  - 是否影响其他片段：${change.impact}`).join('\n');
  return `# ${TARGET_VERSION} Changelog\n\n${lines || '- 无可应用修改。'}\n`;
}

async function assertFile(filePath) {
  if (!(await exists(filePath))) throw new Error(`${filePath} 不存在。`);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) throw new Error(`${filePath} 不是文件。`);
}

async function postCheck(feedbackPlan) {
  const required = [
    FEEDBACK_PLAN_PATH,
    `compositions/${TARGET_VERSION}.html`,
    'compositions/current.html',
    NOTES_PATH,
    CHANGELOG_PATH
  ];
  for (const filePath of required) await assertFile(filePath);
  const html = await readFile('compositions/current.html', 'utf8');
  if (html.includes('主视频占位区域')) throw new Error('current.html 仍包含 demo placeholder，请确认 build:feedback 先成功执行了 build:real。');
  if (!html.includes('<video id="main-video"')) throw new Error('current.html 缺少真实视频 <video id="main-video">。');
  if ((feedbackPlan.unresolvedItems || []).length) {
    console.warn(`⚠ feedback-plan.json 中有 ${feedbackPlan.unresolvedItems.length} 条未识别反馈，已写入 notes，不阻断构建。`);
  }
  console.log('✓ feedback post-check completed');
}

async function main() {
  try {
    const config = await loadConfig();
    const plan = await readJson(EDIT_PLAN_PATH);
    const feedbackPlan = await readJson(FEEDBACK_PLAN_PATH);
    const feedbackMarkdown = await readFile(feedbackPlan.source || 'prompts/feedback.md', 'utf8');
    const metadata = await readJson(config.videoMetadataPath);
    const changes = [];

    plan.meta = {
      ...(plan.meta || {}),
      version: TARGET_VERSION,
      basedOnVersion: SOURCE_VERSION,
      mode: 'real',
      videoMetadata: metadata,
      duration: getDuration({ ...config, mode: 'real' }, metadata, plan.subtitles || []),
      generatedFrom: [...new Set([...(plan.meta?.generatedFrom || []), FEEDBACK_PLAN_PATH])]
    };

    for (const item of feedbackPlan.items || []) applyFeedbackItem(plan, item, config, changes);

    await writeJson(VERSIONED_PLAN_PATH, plan);
    await writeJson(EDIT_PLAN_PATH, plan);
    await writeCompositionFiles({
      config: { ...config, mode: 'real' },
      plan,
      version: TARGET_VERSION,
      files: [
        { file: `compositions/${TARGET_VERSION}.html`, basePrefix: '../' },
        { file: 'compositions/current.html', basePrefix: '../' },
        { file: 'index.html', basePrefix: '' }
      ]
    });
    await Promise.all([
      mkdir('edit-notes', { recursive: true }).then(() => writeFile(NOTES_PATH, buildNotes(feedbackMarkdown, feedbackPlan, changes), 'utf8')),
      mkdir('changelog', { recursive: true }).then(() => writeFile(CHANGELOG_PATH, buildChangelog(changes), 'utf8'))
    ]);

    await postCheck(feedbackPlan);
    console.log(`✓ 已应用反馈并生成 ${TARGET_VERSION}`);
  } catch (error) {
    console.error(`✗ 应用反馈失败：${error.message}`);
    process.exitCode = 1;
  }
}

main();

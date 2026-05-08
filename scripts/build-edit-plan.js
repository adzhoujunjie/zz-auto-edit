import { loadConfig, readJson, exists, getDuration } from './config-utils.js';
import { writeFile } from 'node:fs/promises';

const PLAN_PATH_FALLBACK = 'captions/edit-plan.json';
const KEYWORDS = ['AI', '自动剪辑', '字幕', '素材', '效果', '流程', '关键'];

function regionToPixels(region, config) {
  return {
    x: Math.round(region.x * config.width),
    y: Math.round(region.y * config.height),
    width: Math.round(region.width * config.width),
    height: Math.round(region.height * config.height)
  };
}

function compactText(text, maxLength = 14) {
  const clean = text.replace(/[，。！？、,.!?\s]/g, ' ').trim().replace(/\s+/g, ' ');
  if (clean.length <= maxLength) return clean;
  const keyword = KEYWORDS.find((item) => clean.includes(item));
  if (keyword) {
    const start = Math.max(0, clean.indexOf(keyword) - 4);
    return clean.slice(start, start + maxLength).trim();
  }
  return clean.slice(0, maxLength).trim();
}

function selectCallouts(captions, titleBox, config) {
  const scored = captions.map((caption, index) => {
    const text = caption.text;
    const keywordScore = KEYWORDS.reduce((sum, keyword) => sum + (text.includes(keyword) ? 3 : 0), 0);
    const lengthScore = text.length <= 24 ? 4 : text.length <= 36 ? 2 : 0;
    const punctuationScore = /[！？!？]/.test(text) ? 1 : 0;
    return { caption, index, score: keywordScore + lengthScore + punctuationScore };
  }).filter((item) => item.score > 0);

  const selected = [];
  for (const item of scored.sort((a, b) => b.score - a.score || a.caption.start - b.caption.start)) {
    if (selected.length >= 6) break;
    if (selected.some((chosen) => Math.abs(chosen.index - item.index) <= 1 || Math.abs(chosen.caption.start - item.caption.start) < 3)) continue;
    selected.push(item);
  }

  if (selected.length < 3) {
    for (const item of captions.map((caption, index) => ({ caption, index }))) {
      if (selected.length >= Math.min(3, captions.length)) break;
      if (selected.some((chosen) => chosen.index === item.index || Math.abs(chosen.index - item.index) <= 1)) continue;
      selected.push(item);
    }
  }

  const maxCallouts = config.mode === 'demo' ? Math.min(selected.length, 3) : selected.length;
  return selected
    .sort((a, b) => a.caption.start - b.caption.start)
    .slice(0, maxCallouts)
    .map(({ caption }, i) => ({
      id: `callout-${String(i + 1).padStart(2, '0')}`,
      start: Math.max(0, caption.start + 0.12),
      end: Math.min(caption.end, caption.start + 2.6),
      text: compactText(caption.text),
      subtext: i === 0 ? '自动提取重点' : '',
      region: titleBox,
      align: 'left',
      avoidCoveringPerson: true
    }))
    .filter((callout) => callout.end - callout.start >= 0.8);
}

async function main() {
  try {
    const config = await loadConfig();
    const captions = await readJson(config.parsedCaptionPath);
    if (!Array.isArray(captions) || captions.length === 0) throw new Error('parsed-captions.json 没有可用字幕，请先运行 npm run parse。');

    const metadata = config.mode === 'real' && config.autoDetectDuration && await exists(config.videoMetadataPath)
      ? await readJson(config.videoMetadataPath)
      : null;
    const duration = getDuration(config, metadata, captions);
    const subtitleBox = regionToPixels(config.safeArea.subtitleRegion, config);
    const titleBox = regionToPixels(config.safeArea.titleRegion, config);
    const maxScale = Number(config.rules.maxScale || 1.08);

    const subtitles = captions.map((caption) => ({
      id: `subtitle-${String(caption.index).padStart(2, '0')}`,
      start: caption.start,
      end: Math.min(caption.end, duration),
      text: caption.text,
      position: subtitleBox,
      fontSize: caption.text.length > 28 ? 44 : 48,
      maxLines: config.rules.subtitleMaxLines,
      language: config.rules.subtitleLanguage
    })).filter((caption) => caption.end > caption.start);

    const callouts = selectCallouts(subtitles, titleBox, config);
    const cameraMoves = subtitles.map((caption, i) => ({
      id: `camera-${String(i + 1).padStart(2, '0')}`,
      start: caption.start,
      end: caption.end,
      fromScale: i % 2 === 0 ? 1 : Math.min(maxScale, 1.035),
      toScale: i % 2 === 0 ? Math.min(maxScale, 1.05) : 1.01,
      easing: 'easeInOut',
      note: '轻微推拉，避免高频晃动和过度放大。'
    }));

    const overlays = [
      { id: 'left-rule', type: 'accent-line', start: 0, end: duration, zIndex: 2, position: { x: 112, y: 160, width: 8, height: 180 }, avoidRegion: 'personRegion' },
      { id: 'plan-chip', type: 'rounded-label', start: Math.min(3.1, duration * 0.25), end: Math.min(5.8, duration * 0.45), zIndex: 3, text: config.mode === 'real' ? '真实素材 + 字幕' : '素材 + 需求 + 字幕', position: { x: 118, y: 742, width: 420, height: 74 }, avoidRegion: 'personRegion' },
      { id: 'clean-dot', type: 'small-dot', start: Math.max(0, duration - 2.8), end: duration - 0.4, zIndex: 2, position: { x: 1660, y: 170, width: 22, height: 22 }, avoidRegion: 'personRegion' }
    ].filter((overlay) => overlay.end > overlay.start);

    const plan = {
      meta: {
        videoTitle: config.videoTitle,
        mode: config.mode,
        duration,
        fps: config.fps,
        resolution: { width: config.width, height: config.height },
        rawVideoPath: config.mode === 'real' ? config.rawVideoPath : null,
        captionPath: config.mode === 'real' ? config.captionPath : config.demoCaptionPath,
        videoMetadata: metadata,
        stylePreset: config.stylePreset,
        generatedFrom: [config.parsedCaptionPath, 'prompts/edit-request.md']
      },
      safety: { safeArea: config.safeArea, rules: config.rules },
      subtitles,
      callouts,
      cameraMoves,
      overlays
    };

    const planPath = config.editPlanPath || PLAN_PATH_FALLBACK;
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
    console.log(`✓ 已生成剪辑计划（${config.mode} 模式，duration=${duration}s，callouts=${callouts.length}）→ ${planPath}`);
  } catch (error) {
    console.error(`✗ 剪辑计划生成失败：${error.message}`);
    process.exitCode = 1;
  }
}

main();

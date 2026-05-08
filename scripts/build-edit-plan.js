import { readFile, writeFile } from 'node:fs/promises';

const CONFIG_PATH = 'edit.config.json';
const PLAN_PATH = 'captions/edit-plan.json';

function regionToPixels(region, config) {
  return {
    x: Math.round(region.x * config.width),
    y: Math.round(region.y * config.height),
    width: Math.round(region.width * config.width),
    height: Math.round(region.height * config.height)
  };
}

async function main() {
  try {
    const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
    const captions = JSON.parse(await readFile(config.parsedCaptionPath, 'utf8'));
    if (!Array.isArray(captions) || captions.length === 0) throw new Error('parsed-captions.json 没有可用字幕，请先运行 npm run parse。');

    const subtitleBox = regionToPixels(config.safeArea.subtitleRegion, config);
    const titleBox = regionToPixels(config.safeArea.titleRegion, config);
    const maxScale = Number(config.rules.maxScale || 1.08);

    const subtitles = captions.map((caption, i) => ({
      id: `subtitle-${String(caption.index).padStart(2, '0')}`,
      start: caption.start,
      end: caption.end,
      text: caption.text,
      position: subtitleBox,
      fontSize: i === 3 ? 54 : 48,
      maxLines: config.rules.subtitleMaxLines,
      language: config.rules.subtitleLanguage
    }));

    const callouts = [
      { id: 'hook-ai-edit', start: 0.25, end: 2.75, text: 'AI 自动完成剪辑', region: titleBox, align: 'left', avoidCoveringPerson: true },
      { id: 'need-timestamps', start: 9.15, end: 11.6, text: '关键：时间戳字幕', region: titleBox, align: 'left', avoidCoveringPerson: true }
    ];

    const cameraMoves = captions.map((caption, i) => ({
      id: `camera-${String(i + 1).padStart(2, '0')}`,
      start: caption.start,
      end: caption.end,
      fromScale: i % 2 === 0 ? 1 : Math.min(maxScale, 1.04),
      toScale: i % 2 === 0 ? Math.min(maxScale, 1.055) : 1.015,
      easing: 'easeInOut',
      note: '轻微推拉，避免高频晃动和过度放大。'
    }));

    const overlays = [
      { id: 'left-rule', type: 'accent-line', start: 0, end: 15, zIndex: 2, position: { x: 112, y: 160, width: 8, height: 180 }, avoidRegion: 'personRegion' },
      { id: 'plan-chip', type: 'rounded-label', start: 3.1, end: 5.8, zIndex: 3, text: '素材 + 需求 + 字幕', position: { x: 118, y: 742, width: 420, height: 74 }, avoidRegion: 'personRegion' },
      { id: 'clean-dot', type: 'small-dot', start: 12.2, end: 14.6, zIndex: 2, position: { x: 1660, y: 170, width: 22, height: 22 }, avoidRegion: 'personRegion' }
    ];

    const plan = {
      meta: {
        videoTitle: config.videoTitle,
        duration: config.duration,
        fps: config.fps,
        resolution: { width: config.width, height: config.height },
        stylePreset: config.stylePreset,
        generatedFrom: [config.parsedCaptionPath, 'prompts/edit-request.md']
      },
      safety: { safeArea: config.safeArea, rules: config.rules },
      subtitles,
      callouts,
      cameraMoves,
      overlays
    };

    await writeFile(PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
    console.log(`✓ 已生成剪辑计划 → ${PLAN_PATH}`);
  } catch (error) {
    console.error(`✗ 剪辑计划生成失败：${error.message}`);
    process.exitCode = 1;
  }
}

main();

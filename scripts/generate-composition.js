import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDuration, loadConfig, readJson } from './config-utils.js';

function attr(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function text(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function duration(start, end) {
  return Math.max(0.05, Number(end) - Number(start));
}

function assetPath(basePrefix, filePath) {
  return `${basePrefix}${filePath}`.replaceAll('\\', '/');
}

function px(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function regionStyle(region, fallback = {}) {
  if (!region) return '';
  const left = px(region.x, fallback.x);
  const top = px(region.y, fallback.y);
  const width = px(region.width, fallback.width);
  const height = px(region.height, fallback.height);
  const declarations = [];
  if (Number.isFinite(left)) declarations.push(`left:${left}px`);
  if (Number.isFinite(top)) declarations.push(`top:${top}px`);
  if (Number.isFinite(width)) declarations.push(`width:${width}px`);
  if (Number.isFinite(height)) declarations.push(`min-height:${height}px`);
  return declarations.length ? `${declarations.join(';')};` : '';
}

function subtitleHtml(plan) {
  return (plan.subtitles || []).map((subtitle, index) => {
    const track = 20 + (index % 4);
    const seconds = duration(subtitle.start, subtitle.end);
    const customRegion = subtitle.position || subtitle.region;
    const style = [
      `--clip-duration:${seconds}s`,
      `--clip-delay:${subtitle.start}s`,
      `font-size:${px(subtitle.fontSize, 48)}px`,
      regionStyle(customRegion)
    ].filter(Boolean).join(';');
    return `<p id="${attr(subtitle.id)}" class="clip subtitle" data-start="${subtitle.start}" data-duration="${seconds}" data-track-index="${track}" style="${style}">${text(subtitle.text)}</p>`;
  }).join('\n      ');
}

function calloutHtml(plan) {
  return (plan.callouts || []).map((callout, index) => {
    const seconds = duration(callout.start, callout.end);
    const subtext = callout.subtext ? `<small>${text(callout.subtext)}</small>` : '';
    const position = callout.position || callout.region;
    const scale = px(callout.scale, 1);
    const style = [
      `--clip-duration:${seconds}s`,
      `--clip-delay:${callout.start}s`,
      regionStyle(position),
      callout.fontSize ? `font-size:${px(callout.fontSize, 68)}px` : '',
      scale !== 1 ? `--callout-scale:${scale}` : ''
    ].filter(Boolean).join(';');
    return `<h2 id="${attr(callout.id)}" class="clip callout callout-${(index % 2) + 1}" data-start="${callout.start}" data-duration="${seconds}" data-track-index="${6 + (index % 3)}" style="${style}">${text(callout.text)}${subtext}</h2>`;
  }).join('\n      ');
}

function overlaysHtml(plan) {
  return (plan.overlays || []).filter((overlay) => !overlay.hidden).map((overlay) => {
    const seconds = duration(overlay.start, overlay.end);
    const opacity = Number.isFinite(Number(overlay.opacity)) ? Number(overlay.opacity) : null;
    const style = `left:${overlay.position.x}px;top:${overlay.position.y}px;width:${overlay.position.width}px;height:${overlay.position.height}px;--clip-duration:${seconds}s;--clip-delay:${overlay.start}s;${opacity === null ? '' : `--overlay-opacity:${opacity};`}`;
    if (overlay.type === 'accent-line') return `<div id="${attr(overlay.id)}" class="clip accent-line" data-start="${overlay.start}" data-duration="${seconds}" data-track-index="3" style="${style}"></div>`;
    if (overlay.type === 'small-dot') return `<div id="${attr(overlay.id)}" class="clip dot" data-start="${overlay.start}" data-duration="${seconds}" data-track-index="4" style="${style}"></div>`;
    return `<div id="${attr(overlay.id)}" class="clip chip" data-start="${overlay.start}" data-duration="${seconds}" data-track-index="5" style="${style}">${text(overlay.text || '')}</div>`;
  }).join('\n      ');
}

function cameraKeyframes(plan, durationSeconds, maxScale) {
  const moves = (plan.cameraMoves || [])
    .filter((move) => Number.isFinite(Number(move.start)) && Number.isFinite(Number(move.end)) && Number(move.end) > Number(move.start))
    .sort((a, b) => Number(a.start) - Number(b.start));

  if (!moves.length || !durationSeconds) {
    return `0%{transform:scale(1)} 50%{transform:scale(min(var(--max-scale),1.04))} 100%{transform:scale(1.02)}`;
  }

  const points = [{ time: 0, scale: 1 }];
  for (const move of moves) {
    points.push({ time: Number(move.start), scale: Number(move.fromScale ?? move.scale ?? 1) });
    points.push({ time: Number(move.end), scale: Number(move.toScale ?? move.scale ?? 1) });
  }
  points.push({ time: durationSeconds, scale: points.at(-1)?.scale || 1 });

  return points
    .map((point) => {
      const percent = Math.max(0, Math.min(100, (point.time / durationSeconds) * 100)).toFixed(2).replace(/\.00$/, '');
      const scale = Math.min(maxScale, Math.max(1, Number(point.scale) || 1)).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
      return `${percent}%{transform:scale(${scale})}`;
    })
    .join(' ');
}

function visualFilter(plan) {
  const adjustments = plan.visualAdjustments || plan.globalVisualAdjustments || {};
  const brightness = Number(adjustments.brightness || 1);
  const contrast = Number(adjustments.contrast || 1);
  return `brightness(${Number.isFinite(brightness) ? brightness : 1}) contrast(${Number.isFinite(contrast) ? contrast : 1})`;
}

export function buildHtml({ config, plan, basePrefix, version = 'version-001' }) {
  const compositionId = `zz-auto-edit-${version}`;
  const durationSeconds = getDuration(config, plan.meta?.videoMetadata, plan.subtitles || []);
  const maxScale = Number(config.rules.maxScale || 1.08);
  const title = `${config.videoTitle} - ${version}`;
  const videoSource = assetPath(basePrefix, config.rawVideoPath);
  const realVideo = config.mode === 'real' || plan.meta?.mode === 'real';
  const media = realVideo
    ? `<video id="main-video" data-start="0" data-duration="${durationSeconds}" data-track-index="1" data-media-start="0" data-volume="1" src="${attr(videoSource)}" preload="auto" playsinline></video>`
    : `<div class="grid"></div><div class="person-safe"></div><div class="avatar"></div><div class="placeholder-label">主视频占位区域 / assets/raw/main.mp4</div>`;
  const mediaLabel = realVideo ? '真实主视频' : '主视频占位区域';
  const filter = visualFilter(plan);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${config.width}, height=${config.height}, initial-scale=1" />
  <title>${text(title)}</title>
  <style>
    :root { color-scheme: dark; --accent: #42f5b6; --gold: #ffd166; --ink: #0b1020; --max-scale: ${maxScale}; }
    * { box-sizing: border-box; }
    html, body { width: ${config.width}px; height: ${config.height}px; margin: 0; overflow: hidden; background: #0c1020; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Noto Sans SC", Arial, sans-serif; }
    #stage { position: relative; width: ${config.width}px; height: ${config.height}px; background: radial-gradient(circle at 26% 18%, rgba(66,245,182,.25), transparent 26%), linear-gradient(135deg, #111936 0%, #080b16 60%, #15192b 100%); color: #fff; isolation: isolate; filter: ${filter}; }
    .clip { will-change: opacity, transform; }
    .video-plate { position: absolute; inset: 64px 110px 118px 110px; border-radius: 36px; overflow: hidden; background: linear-gradient(145deg, rgba(255,255,255,.07), rgba(255,255,255,.02)); border: 1px solid rgba(255,255,255,.16); box-shadow: 0 28px 90px rgba(0,0,0,.42); transform-origin: 50% 48%; animation: camera ${durationSeconds}s ease-in-out both; }
    #main-video { width: 100%; height: 100%; display: block; object-fit: ${config.rules.videoFit || 'contain'}; background: #05070f; }
    .grid { position: absolute; inset: 0; opacity: .22; background-image: linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px); background-size: 80px 80px; }
    .person-safe { position: absolute; left: 614px; top: 86px; width: 691px; height: 786px; border-radius: 999px 999px 120px 120px; background: linear-gradient(180deg, rgba(255,255,255,.20), rgba(255,255,255,.06)); box-shadow: inset 0 0 0 2px rgba(255,255,255,.18); }
    .avatar { position: absolute; left: 784px; top: 196px; width: 352px; height: 520px; border-radius: 180px 180px 74px 74px; background: linear-gradient(180deg, #d8e4ff, #7183ad 55%, #2c375f); box-shadow: 0 30px 70px rgba(0,0,0,.32); }
    .avatar::before { content: ""; position: absolute; left: 96px; top: -82px; width: 160px; height: 160px; border-radius: 50%; background: linear-gradient(180deg, #f7d7bd, #b47a5a); }
    .placeholder-label { position: absolute; left: 48px; bottom: 42px; color: rgba(255,255,255,.72); font-size: 28px; letter-spacing: .05em; }
    .brand { position: absolute; right: 112px; top: 48px; font-size: 22px; font-weight: 800; letter-spacing: .22em; color: rgba(255,255,255,.56); z-index: 8; }
    .accent-line { position: absolute; border-radius: 999px; background: linear-gradient(180deg, var(--accent), transparent); opacity: 0; animation: fadeWindow var(--clip-duration) var(--clip-delay) both; z-index: 2; }
    .callout { --callout-scale: 1; position: absolute; left: 154px; top: 86px; max-width: 960px; min-height: 120px; margin: 0; padding: 24px 34px; border-radius: 28px; background: linear-gradient(135deg, var(--accent), #b8ffdf); color: var(--ink); font-size: 68px; line-height: 1.04; font-weight: 950; letter-spacing: -.04em; box-shadow: 0 24px 70px rgba(66,245,182,.22); opacity: 0; transform: translateY(36px) scale(.96); z-index: 5; animation: calloutIn var(--clip-duration) var(--clip-delay) cubic-bezier(.2,.9,.2,1) both; }
    .callout small { display: block; margin-top: 10px; font-size: 28px; letter-spacing: .06em; color: rgba(8,17,31,.62); }
    .callout-2 { top: 122px; background: linear-gradient(135deg, #fff9e8, #ffd166); }
    .chip { position: absolute; display: grid; place-items: center; border-radius: 99px; background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.20); backdrop-filter: blur(18px); color: rgba(255,255,255,.92); font-size: 30px; font-weight: 700; opacity: 0; animation: fadeWindow var(--clip-duration) var(--clip-delay) both; z-index: 3; }
    .dot { position: absolute; border-radius: 50%; background: var(--gold); opacity: 0; animation: fadeWindow var(--clip-duration) var(--clip-delay) both; }
    .subtitle { position: absolute; left: 230px; bottom: auto; top: 842px; width: 1460px; min-height: 112px; display: grid; place-items: center; padding: 22px 46px; border-radius: 30px; background: rgba(0,0,0,.58); border: 1px solid rgba(255,255,255,.16); box-shadow: 0 18px 54px rgba(0,0,0,.34); font-weight: 800; line-height: 1.28; text-align: center; text-wrap: balance; opacity: 0; transform: translateY(18px); z-index: 6; animation: subtitleIn var(--clip-duration) var(--clip-delay) both; overflow: hidden; }
    .timebar { position: absolute; left: 110px; right: 110px; bottom: 48px; height: 6px; border-radius: 99px; background: rgba(255,255,255,.14); overflow: hidden; }
    .timebar::after { content: ""; display: block; width: 100%; height: 100%; background: linear-gradient(90deg, var(--accent), var(--gold)); transform-origin: left; animation: progress ${durationSeconds}s linear both; }
    @keyframes camera { ${cameraKeyframes(plan, durationSeconds, maxScale)} }
    @keyframes calloutIn { 0%{opacity:0;transform:translateY(36px) scale(calc(.96 * var(--callout-scale)))} 16%,82%{opacity:1;transform:translateY(0) scale(var(--callout-scale))} 100%{opacity:0;transform:translateY(-18px) scale(calc(.99 * var(--callout-scale)))} }
    @keyframes subtitleIn { 0%,100%{opacity:0;transform:translateY(18px)} 10%,88%{opacity:1;transform:translateY(0)} }
    @keyframes fadeWindow { 0%,100%{opacity:0;transform:translateY(14px)} 12%,84%{opacity:var(--overlay-opacity, 1);transform:translateY(0)} }
    @keyframes progress { from{transform:scaleX(0)} to{transform:scaleX(1)} }
  </style>
</head>
<body>
  <main id="stage" class="composition-root clip" data-composition-id="${compositionId}" data-start="0" data-width="${config.width}" data-height="${config.height}">
    <section id="media-layer" class="clip video-plate" data-start="0" data-duration="${durationSeconds}" data-track-index="0" aria-label="${mediaLabel}">
      ${media}
    </section>
    <div id="brand" class="clip brand" data-start="0" data-duration="${durationSeconds}" data-track-index="2">ZZ AUTO EDIT</div>
    <section id="decor-layer" data-timeline-role="decorations" aria-label="装饰元素">
      ${overlaysHtml(plan)}
    </section>
    <section id="callout-layer" data-timeline-role="callouts" aria-label="重点大字">
      ${calloutHtml(plan)}
    </section>
    <section id="caption-layer" data-timeline-role="captions" data-caption-root="true" aria-label="中文字幕">
      ${subtitleHtml(plan)}
    </section>
    <div id="timebar" class="clip timebar" data-start="0" data-duration="${durationSeconds}" data-track-index="30"></div>
  </main>
  <script>
    window.__timelines = window.__timelines || {};
    const durationSeconds = ${JSON.stringify(durationSeconds)};
    const timelineKey = ${JSON.stringify(compositionId)};
    if (window.gsap) {
      const tl = window.gsap.timeline({ paused: true });
      tl.to({}, { duration: durationSeconds });
      window.__timelines[timelineKey] = tl;
    } else {
      window.__timelines[timelineKey] = {
        duration: () => durationSeconds,
        pause: () => window.__timelines[timelineKey],
        paused: () => true,
        seek: () => window.__timelines[timelineKey],
        time: () => window.__timelines[timelineKey],
        progress: () => window.__timelines[timelineKey]
      };
    }
  </script>
</body>
</html>
`;
}

export async function writeCompositionFiles({ config, plan, version = 'version-001', files }) {
  for (const target of files) {
    await mkdir(path.dirname(target.file) === '.' ? '.' : path.dirname(target.file), { recursive: true });
    await writeFile(target.file, buildHtml({ config, plan, basePrefix: target.basePrefix, version }), 'utf8');
    console.log(`✓ 已生成 composition：${target.file}`);
  }
}

async function main() {
  try {
    const config = await loadConfig();
    const plan = await readJson(config.editPlanPath || 'captions/edit-plan.json');
    await writeCompositionFiles({
      config,
      plan,
      version: 'version-001',
      files: [
        { file: 'compositions/version-001.html', basePrefix: '../' },
        { file: 'compositions/current.html', basePrefix: '../' },
        { file: 'index.html', basePrefix: '' }
      ]
    });
  } catch (error) {
    console.error(`✗ composition 生成失败：${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

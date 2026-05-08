import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertRealInputs, loadConfig, writeJson } from './config-utils.js';

const execFileAsync = promisify(execFile);

function parseFps(value) {
  if (!value || value === '0/0') return null;
  const [num, den] = value.split('/').map(Number);
  if (!num || !den) return Number(value) || null;
  return Math.round((num / den) * 1000) / 1000;
}

async function main() {
  try {
    const config = await loadConfig();
    if (config.mode !== 'real') {
      console.log('✓ demo 模式无需探测真实视频，跳过 ffprobe。');
      return;
    }
    await assertRealInputs(config);

    let stdout;
    try {
      ({ stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        config.rawVideoPath
      ], { timeout: 20000, maxBuffer: 10 * 1024 * 1024 }));
    } catch (error) {
      throw new Error(`ffprobe 执行失败：${error.message}。请安装 FFmpeg/ffprobe，并确认命令行可执行 ffprobe -version。`);
    }

    const probed = JSON.parse(stdout);
    const videoStream = probed.streams?.find((stream) => stream.codec_type === 'video');
    if (!videoStream) throw new Error(`ffprobe 没有在 ${config.rawVideoPath} 中找到视频流。`);
    const audioStream = probed.streams?.some((stream) => stream.codec_type === 'audio') || false;
    const duration = Number(videoStream.duration || probed.format?.duration || 0);
    if (!duration) throw new Error(`ffprobe 没有读到有效 duration：${config.rawVideoPath}`);

    const metadata = {
      source: config.rawVideoPath,
      duration: Math.round(duration * 1000) / 1000,
      width: Number(videoStream.width),
      height: Number(videoStream.height),
      fps: parseFps(videoStream.avg_frame_rate || videoStream.r_frame_rate),
      hasAudio: audioStream
    };

    await writeJson(config.videoMetadataPath, metadata);
    console.log(`✓ 已探测真实视频 → ${config.videoMetadataPath}`);
    console.log(`  duration=${metadata.duration}s, size=${metadata.width}x${metadata.height}, fps=${metadata.fps ?? 'unknown'}, hasAudio=${metadata.hasAudio}`);
  } catch (error) {
    console.error(`✗ 视频探测失败：${error.message}`);
    process.exitCode = 1;
  }
}

main();

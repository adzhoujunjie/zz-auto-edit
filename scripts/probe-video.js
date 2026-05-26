import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { assertRealInputs, loadConfig, writeJson } from './config-utils.js';

const execFileAsync = promisify(execFile);

function parseFps(value) {
  if (!value || value === '0/0') return null;
  const [num, den] = value.split('/').map(Number);
  if (!num || !den) return Number(value) || null;
  return Math.round((num / den) * 1000) / 1000;
}

function readUInt64(buffer, offset) {
  const high = buffer.readUInt32BE(offset);
  const low = buffer.readUInt32BE(offset + 4);
  return high * 2 ** 32 + low;
}

function readFixed16(buffer, offset) {
  return buffer.readUInt32BE(offset) / 65536;
}

function walkBoxes(buffer, start, end, visitor) {
  let offset = start;
  while (offset + 8 <= end) {
    const size32 = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    let headerSize = 8;
    let size = size32;

    if (size32 === 1 && offset + 16 <= end) {
      size = readUInt64(buffer, offset + 8);
      headerSize = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }

    if (size < headerSize || offset + size > end) break;
    visitor({ type, start: offset + headerSize, end: offset + size });
    offset += size;
  }
}

function findBox(buffer, start, end, targetType) {
  let found = null;
  walkBoxes(buffer, start, end, (box) => {
    if (!found && box.type === targetType) found = box;
  });
  return found;
}

function readMvhdDuration(buffer, box) {
  const version = buffer.readUInt8(box.start);
  const timescaleOffset = version === 1 ? box.start + 20 : box.start + 12;
  const durationOffset = version === 1 ? box.start + 24 : box.start + 16;
  const timescale = buffer.readUInt32BE(timescaleOffset);
  const duration = version === 1 ? readUInt64(buffer, durationOffset) : buffer.readUInt32BE(durationOffset);
  return timescale ? duration / timescale : 0;
}

function readTkhdSize(buffer, box) {
  const version = buffer.readUInt8(box.start);
  const sizeOffset = version === 1 ? box.start + 88 : box.start + 76;
  if (sizeOffset + 8 > box.end) return null;
  const width = Math.round(readFixed16(buffer, sizeOffset));
  const height = Math.round(readFixed16(buffer, sizeOffset + 4));
  return width && height ? { width, height } : null;
}

function readTrackHandler(buffer, trakBox) {
  const mdia = findBox(buffer, trakBox.start, trakBox.end, 'mdia');
  if (!mdia) return null;
  const hdlr = findBox(buffer, mdia.start, mdia.end, 'hdlr');
  if (!hdlr || hdlr.start + 12 > hdlr.end) return null;
  return buffer.toString('ascii', hdlr.start + 8, hdlr.start + 12);
}

async function probeMp4Boxes(filePath) {
  const buffer = await readFile(filePath);
  const moov = findBox(buffer, 0, buffer.length, 'moov');
  if (!moov) throw new Error('MP4 moov box not found');

  const mvhd = findBox(buffer, moov.start, moov.end, 'mvhd');
  const duration = mvhd ? readMvhdDuration(buffer, mvhd) : 0;
  let videoSize = null;
  let hasAudio = false;

  walkBoxes(buffer, moov.start, moov.end, (box) => {
    if (box.type !== 'trak') return;
    const handler = readTrackHandler(buffer, box);
    const tkhd = findBox(buffer, box.start, box.end, 'tkhd');
    const size = tkhd ? readTkhdSize(buffer, tkhd) : null;
    if (handler === 'vide' && size) videoSize = size;
    if (handler === 'soun') hasAudio = true;
  });

  if (!duration || !videoSize) {
    throw new Error('MP4 metadata is incomplete');
  }

  return {
    duration: Math.round(duration * 1000) / 1000,
    width: videoSize.width,
    height: videoSize.height,
    fps: null,
    hasAudio
  };
}

async function probeWithFfprobe(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath
  ], { timeout: 20000, maxBuffer: 10 * 1024 * 1024 });

  const probed = JSON.parse(stdout);
  const videoStream = probed.streams?.find((stream) => stream.codec_type === 'video');
  if (!videoStream) throw new Error(`ffprobe did not find a video stream in ${filePath}.`);
  const audioStream = probed.streams?.some((stream) => stream.codec_type === 'audio') || false;
  const duration = Number(videoStream.duration || probed.format?.duration || 0);
  if (!duration) throw new Error(`ffprobe did not return a valid duration for ${filePath}.`);

  return {
    duration: Math.round(duration * 1000) / 1000,
    width: Number(videoStream.width),
    height: Number(videoStream.height),
    fps: parseFps(videoStream.avg_frame_rate || videoStream.r_frame_rate),
    hasAudio: audioStream
  };
}

async function main() {
  try {
    const config = await loadConfig();
    if (config.mode !== 'real') {
      console.log('✓ demo 模式无需探测真实视频，跳过 ffprobe。');
      return;
    }
    await assertRealInputs(config);

    let metadata;
    let probeSource = 'ffprobe';
    try {
      metadata = await probeWithFfprobe(config.rawVideoPath);
    } catch (error) {
      console.warn(`⚠ ffprobe unavailable, using built-in MP4 metadata probe: ${error.message}`);
      metadata = await probeMp4Boxes(config.rawVideoPath);
      probeSource = 'mp4-box-parser';
    }

    await writeJson(config.videoMetadataPath, { source: config.rawVideoPath, probeSource, ...metadata });
    console.log(`✓ 已探测真实视频 → ${config.videoMetadataPath}`);
    console.log(`  duration=${metadata.duration}s, size=${metadata.width}x${metadata.height}, fps=${metadata.fps ?? 'unknown'}, hasAudio=${metadata.hasAudio}`);
  } catch (error) {
    console.error(`✗ 视频探测失败：${error.message}`);
    process.exitCode = 1;
  }
}

main();

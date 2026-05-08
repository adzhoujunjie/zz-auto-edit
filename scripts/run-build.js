import { readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, readJson } from './config-utils.js';

const STEP_SCRIPTS = {
  probe: 'scripts/probe-video.js',
  parse: 'scripts/parse-srt.js',
  plan: 'scripts/build-edit-plan.js',
  compose: 'scripts/generate-composition.js',
  validate: 'scripts/validate-project.js'
};

function stepsForMode(mode) {
  return mode === 'real'
    ? ['probe', 'parse', 'plan', 'compose', 'validate']
    : ['parse', 'plan', 'compose', 'validate'];
}

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function createStepError(step, message, status = 1) {
  const error = new Error(message);
  error.step = step;
  error.status = status || 1;
  return error;
}

function runNodeStep(mode, step, index, total) {
  const scriptPath = STEP_SCRIPTS[step];
  const buildName = `build:${mode}`;
  console.log(`\n[${buildName}] ${index + 1}/${total} ${step}`);

  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: 'inherit',
    env: { ...process.env, EDIT_MODE: mode },
    shell: false
  });

  if (result.error) {
    console.error(`✗ ${step} failed: ${result.error.message}`);
    throw createStepError(step, result.error.message, result.status ?? 1);
  }

  if (result.status !== 0) {
    console.error(`✗ ${step} failed`);
    throw createStepError(step, `${step} failed`, result.status ?? 1);
  }

  console.log(`✓ ${step} completed`);
}

function extractDurations(html) {
  return [...html.matchAll(/data-duration=["']([^"']+)["']/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
}

function nearlyEqual(a, b, tolerance = 0.05) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

async function assertFile(filePath, message) {
  if (!(await exists(filePath))) throw new Error(message);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) throw new Error(`${message}（当前路径不是文件）`);
}

export async function assertBuildOutput(mode) {
  const config = await loadConfig();
  const currentPath = 'compositions/current.html';
  await assertFile(currentPath, `${currentPath} 不存在，请检查 compose 步骤。`);
  const html = await readFile(currentPath, 'utf8');

  if (mode === 'demo') {
    if (!html.includes('zz-auto-edit-version-001')) throw new Error('demo build failed: current.html 缺少 composition id。');
    console.log('✓ post-build check completed (demo mode)');
    return;
  }

  const requiredJsonFiles = [
    config.videoMetadataPath,
    config.parsedCaptionPath,
    config.editPlanPath || 'captions/edit-plan.json'
  ];

  for (const filePath of requiredJsonFiles) {
    await assertFile(filePath, `real build failed: 缺少 ${filePath}。`);
  }

  if (!html.includes('<video') && !html.includes('id="main-video"')) {
    throw new Error('real build failed: current.html does not contain <video id="main-video">. Please check EDIT_MODE propagation.');
  }

  if (html.includes('主视频占位区域')) {
    throw new Error('real build failed: current.html still contains demo placeholder. Please check EDIT_MODE propagation.');
  }

  const metadata = await readJson(config.videoMetadataPath);
  const plan = await readJson(config.editPlanPath || 'captions/edit-plan.json');
  const durations = extractDurations(html);
  const expectedDuration = Number(metadata.duration || plan.meta?.duration || 0);

  if (!expectedDuration) {
    throw new Error('real build failed: metadata/edit plan 没有可用 duration。');
  }

  if (!nearlyEqual(expectedDuration, 15) && !durations.some((value) => nearlyEqual(value, expectedDuration))) {
    throw new Error(`real build failed: current.html duration 未使用真实视频时长 ${expectedDuration}s，可能仍是 demo 的 15s。`);
  }

  if (plan.meta?.mode !== 'real') {
    throw new Error('real build failed: captions/edit-plan.json 的 meta.mode 不是 real。');
  }

  console.log('✓ post-build check completed (real mode)');
  console.log('✓ current.html contains <video id="main-video"> and no demo placeholder');
}

export async function runBuild(mode = 'demo') {
  if (!['demo', 'real'].includes(mode)) {
    throw createStepError('mode', '构建模式必须是 demo 或 real。', 1);
  }

  const buildName = `build:${mode}`;
  const steps = stepsForMode(mode);
  console.log(`[${buildName}] starting with EDIT_MODE=${mode}`);

  for (const [index, step] of steps.entries()) runNodeStep(mode, step, index, steps.length);

  console.log(`\n[${buildName}] post-build check`);
  await assertBuildOutput(mode);
  console.log(`[${buildName}] completed successfully`);
}

async function main() {
  const mode = process.argv[2] || 'demo';
  try {
    await runBuild(mode);
  } catch (error) {
    if (error.step === 'mode') console.error(`✗ ${error.message}`);
    else console.error(`✗ ${mode} build failed: ${error.message}`);
    process.exit(error.status || 1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

import { stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadConfig } from './config-utils.js';
import { runBuild } from './run-build.js';

function renderCommand() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

async function assertRenderedFile(outputPath) {
  let outputStat;
  try {
    outputStat = await stat(outputPath);
  } catch {
    throw new Error(`${outputPath} was not created`);
  }

  if (!outputStat.isFile() || outputStat.size <= 0) {
    throw new Error(`${outputPath} was not created`);
  }
}

async function main() {
  const config = await loadConfig();
  const outputPath = path.posix.join('output', config.outputName || 'version-001.mp4');

  await runBuild('real');

  const command = renderCommand();
  const args = [
    'hyperframes',
    'render',
    '-c', 'compositions/current.html',
    '-o', outputPath,
    '--fps', String(config.fps || 30),
    '--quality', 'standard'
  ];

  console.log('\n[render:real] HyperFrames render');
  console.log(`[render:real] ${command} ${args.join(' ')}`);

  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, EDIT_MODE: 'real' },
    shell: false
  });

  if (result.error) {
    throw new Error(`HyperFrames render failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`HyperFrames render failed with exit code ${result.status ?? 1}`);
  }

  await assertRenderedFile(outputPath);
  console.log('✓ render:real completed');
  console.log(`✓ output written to ${outputPath}`);
}

main().catch((error) => {
  console.error(`✗ render:real failed: ${error.message}`);
  process.exit(1);
});

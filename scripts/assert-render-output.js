import { stat } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config-utils.js';

async function assertRenderOutput() {
  const config = await loadConfig();
  const outputName = config.outputName || 'version-001.mp4';
  const displayPath = path.posix.join('output', outputName);
  const outputPath = path.join('output', outputName);

  let outputStat;
  try {
    outputStat = await stat(outputPath);
  } catch {
    throw new Error(`${displayPath} was not created`);
  }

  if (!outputStat.isFile()) {
    throw new Error(`${displayPath} was not created`);
  }

  if (outputStat.size <= 0) {
    throw new Error(`${displayPath} is empty`);
  }

  console.log(`✓ render output exists: ${displayPath}`);
  console.log('✓ render:real completed');
}

assertRenderOutput().catch((error) => {
  console.error(`✗ render:real failed: ${error.message}`);
  process.exit(1);
});

import { stat } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config-utils.js';

function normalizeDisplayPath(outputPath) {
  return outputPath.replaceAll(path.sep, '/');
}

async function assertRenderOutput() {
  const config = await loadConfig();
  const requestedPath = process.argv[2];
  const outputPath = requestedPath || path.join('output', config.outputName || 'version-001.mp4');
  const displayPath = normalizeDisplayPath(outputPath);

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
  console.log(`✓ render assertion completed for ${displayPath}`);
}

assertRenderOutput().catch((error) => {
  console.error(`✗ render assertion failed: ${error.message}`);
  process.exit(1);
});

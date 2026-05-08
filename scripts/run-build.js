import { spawnSync } from 'node:child_process';

const mode = process.argv[2] || 'demo';
if (!['demo', 'real'].includes(mode)) {
  console.error('✗ 构建模式必须是 demo 或 real。');
  process.exit(1);
}

const steps = mode === 'real'
  ? ['probe', 'parse', 'plan', 'compose', 'validate']
  : ['parse', 'plan', 'compose', 'validate'];
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

for (const step of steps) {
  const result = spawnSync(npmCommand, ['run', step], {
    stdio: 'inherit',
    env: { ...process.env, EDIT_MODE: mode }
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

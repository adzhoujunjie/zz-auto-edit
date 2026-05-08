import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';

function nextVersion(files) {
  const numbers = files
    .map((file) => file.match(/^version-(\d{3})\.html$/)?.[1])
    .filter(Boolean)
    .map(Number);
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `version-${String(next).padStart(3, '0')}`;
}

async function main() {
  const files = await readdir('compositions');
  const version = nextVersion(files);
  await copyFile('compositions/current.html', `compositions/${version}.html`);
  await mkdir('edit-notes', { recursive: true });
  await mkdir('changelog', { recursive: true });
  await writeFile(`edit-notes/${version}.md`, `# ${version} 剪辑说明\n\n基于上一版 current.html 创建。请在这里记录本轮局部微调目标、时间段修改和验收结果。\n`, { flag: 'wx' });
  await writeFile(`changelog/${version}.md`, `# ${version} Changelog\n\n- 从 compositions/current.html 复制生成 ${version}.html。\n- 待补充：本轮具体修改点、验证命令和已知限制。\n`, { flag: 'wx' });
  console.log(`✓ 已创建 ${version}：compositions/${version}.html、edit-notes/${version}.md、changelog/${version}.md`);
}

main().catch((error) => {
  console.error(`✗ 创建版本失败：${error.message}`);
  process.exitCode = 1;
});

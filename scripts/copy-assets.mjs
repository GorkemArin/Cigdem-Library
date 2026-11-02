import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

const targets = [
  { source: path.join(root, 'views'), target: path.join(root, 'dist', 'views') },
  { source: path.join(root, 'public'), target: path.join(root, 'dist', 'public') },
];

for (const { source, target } of targets) {
  if (!fs.existsSync(source)) {
    console.warn(`Atlandı (kaynak yok): ${source}`);
    continue;
  }
  copyDirectory(source, target);
  console.log(`Kopyalandı: ${path.relative(root, source)} -> ${path.relative(root, target)}`);
}

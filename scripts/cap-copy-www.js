const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const targets = [
  path.join(root, 'www'),
  path.join(root, 'android/app/src/main/assets/public'),
];

for (const dest of targets) {
  fs.mkdirSync(dest, { recursive: true });
  for (const file of ['index.html', 'manifest.json']) {
    if (fs.existsSync(path.join(root, file))) {
      fs.copyFileSync(path.join(root, file), path.join(dest, file));
    }
  }
  for (const dir of ['css', 'js']) {
    if (fs.existsSync(path.join(root, dir))) {
      fs.cpSync(path.join(root, dir), path.join(dest, dir), { recursive: true });
    }
  }
}

// Checks a built app (dist/linux-unpacked/resources by default) has every file the hub needs at
// runtime (electron-builder's file filters could leave one out). Run after `npm run dist:linux`.
import path from 'node:path';
import fs from 'node:fs';
import asarPkg from '@electron/asar'; // read the archive directly (spawning npx fails on Windows)

const resources = path.resolve(process.argv[2] || 'dist/linux-unpacked/resources');
const asar = path.join(resources, 'app.asar');
if (!fs.existsSync(asar)) {
  console.error(`No built app at ${asar}: run npm run dist:linux first.`);
  process.exit(2);
}
const list = new Set(asarPkg.listPackage(asar, { isPack: false }).map((l) => l.trim().replace(/\\/g, '/')));
const needed = [
  '/desktop/main.js',
  '/desktop/preload.cjs',
  '/desktop/updates.js',
  '/desktop/applog.js',
  '/desktop/steam.js',
  '/desktop/icons/icon.png',
  '/node_modules/electron-updater/package.json',
  '/server/app.js',
  '/public/host/index.html',
  '/node_modules/word-list/package.json',
  '/node_modules/qrcode/package.json',
  '/node_modules/socket.io/package.json',
];
// Beside the app (where self-update looks for releases), not in it.
const beside = ['app-update.yml'];
const missing = needed.filter((f) => !list.has(f)).concat(beside.filter((f) => !fs.existsSync(path.join(resources, f))));
// Linux: the launcher that keeps Steam's overlay library out (desktop/after-pack.cjs), in front of the binary.
const appDir = path.dirname(resources);
const launcher = fs.readdirSync(appDir).find((f) => fs.existsSync(path.join(appDir, f + '.bin')));
if (fs.existsSync(path.join(appDir, 'chrome-sandbox')) && !(launcher && fs.readFileSync(path.join(appDir, launcher), 'utf8').includes('gameoverlayrenderer'))) {
  missing.push('the Linux launcher (desktop/after-pack.cjs) in front of the app binary');
}
if (missing.length) {
  console.error('Missing from the app:\n  ' + missing.join('\n  '));
  process.exit(1);
}
console.log(`App package OK (${needed.length + beside.length} key files present).`);

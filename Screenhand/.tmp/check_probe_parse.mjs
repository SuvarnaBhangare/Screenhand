import fs from 'node:fs';
const src = fs.readFileSync('/Users/khushi/Documents/Automator/Screenhand/.tmp/instagram_explore_features.mjs', 'utf8');
const marker = 'const pageProbeCode = `';
const start = src.indexOf(marker);
if (start < 0) {
  console.log('NO_MARKER');
  process.exit(1);
}
const from = start + marker.length;
const end = src.indexOf('`;', from);
if (end < 0) {
  console.log('NO_END');
  process.exit(1);
}
const code = src.slice(from, end);
try {
  // Parse-only check
  // eslint-disable-next-line no-new-func
  new Function(`return ${code}`);
  console.log('PARSE_OK');
} catch (e) {
  console.log('PARSE_ERR', e.message);
}

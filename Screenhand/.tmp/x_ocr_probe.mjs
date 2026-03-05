import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', '/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts']
});
const client = new Client({ name: 'x-ocr-probe', version: '1.0.0' }, { capabilities: {} });

const t = (res) => res?.content?.find?.((c) => c.type === 'text')?.text || JSON.stringify(res);

async function call(name, arguments_ = {}) {
  const res = await client.callTool({ name, arguments: arguments_ });
  return t(res);
}

function parseWindows(text) {
  return (text || '').split('\n').map((line) => {
    const m = line.match(/^\[(\d+)\]\s+(.*?)\s+"(.*)"\s+\(([-\d.]+),([-\d.]+)\)\s+(\d+)x(\d+)$/);
    if (!m) return null;
    return {
      windowId: Number(m[1]),
      appName: m[2],
      title: m[3],
      x: Number(m[4]),
      y: Number(m[5]),
      width: Number(m[6]),
      height: Number(m[7]),
      raw: line
    };
  }).filter(Boolean);
}

try {
  await client.connect(transport);
  await call('launch', { bundleId: 'com.google.Chrome' });
  await call('focus', { bundleId: 'com.google.Chrome' });
  await new Promise((r) => setTimeout(r, 1000));
  const winsText = await call('windows', {});
  const wins = parseWindows(winsText);
  const chromeWins = wins.filter((w) => /Google Chrome/i.test(w.appName));
  const chromeWin = chromeWins.find((w) => w.width > 600 && w.height > 400) || chromeWins[0] || null;

  const shot = chromeWin
    ? await call('screenshot', { windowId: chromeWin.windowId })
    : await call('screenshot', {});

  const snippet = (shot || '').slice(0, 4000);
  const lower = (shot || '').toLowerCase();

  console.log(JSON.stringify({
    windows: wins,
    chromeWindow: chromeWin || null,
    hasEditProfile: /edit\s+profile/i.test(shot || ''),
    hasProfile: /\bprofile\b/i.test(shot || ''),
    hasSignIn: /sign\s*in|log\s*in|create\s*account/i.test(shot || ''),
    hasKeyboardHint: lower.includes('view keyboard shortcuts'),
    ocrSnippet: snippet
  }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch {}
}

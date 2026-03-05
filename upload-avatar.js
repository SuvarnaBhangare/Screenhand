const CDP = require("/Users/khushi/Documents/Automator/mvp/node_modules/chrome-remote-interface");
const { execSync } = require("child_process");

const BRIDGE = "/Users/khushi/Documents/Automator/mvp/native/macos-bridge/.build/release/macos-bridge";
const AVATAR = "/Users/khushi/Documents/Automator/screenhand-avatar.png";

function bridge(method, params) {
  const cmd = JSON.stringify({ id: 1, method, params });
  const out = execSync(`echo '${cmd}' | ${BRIDGE}`, { timeout: 5000 });
  return JSON.parse(out.toString());
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  // 1. Connect to X tab
  const targets = await CDP.List({ port: 9222 });
  const page = targets.find(t => t.type === "page" && t.url.includes("x.com"));
  const target = page || targets.find(t => t.type === "page");
  const client = await CDP({ port: 9222, target: target.id });
  await client.Runtime.enable();
  await client.Page.enable();

  // 2. Navigate to profile settings
  await client.Page.navigate({ url: "https://x.com/settings/profile" });
  await sleep(4000);
  console.log("Navigated to profile settings");

  // 3. Find avatar button
  const r = await client.Runtime.evaluate({
    expression: `(() => {
      const btn = document.querySelector('[aria-label="Add avatar photo"]');
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      return JSON.stringify({x: rect.x + rect.width/2, y: rect.y + rect.height/2});
    })()`
  });

  let val = r.result.value;
  for (let i = 0; i < 10 && !val; i++) {
    console.log("Avatar button not found, waiting...", i);
    await sleep(2000);
    const r2 = await client.Runtime.evaluate({
      expression: `(() => {
        const btn = document.querySelector('[aria-label="Add avatar photo"]');
        if (!btn) return null;
        const rect = btn.getBoundingClientRect();
        return JSON.stringify({x: rect.x + rect.width/2, y: rect.y + rect.height/2});
      })()`
    });
    val = r2.result.value;
  }
  if (!val) { console.error("Avatar button never appeared"); process.exit(1); }

  const pos = JSON.parse(val);
  console.log("Avatar button at:", pos);

  // 4. CDP click to open native file dialog
  await client.Input.dispatchMouseEvent({ type: "mousePressed", x: pos.x, y: pos.y, button: "left", clickCount: 1 });
  await client.Input.dispatchMouseEvent({ type: "mouseReleased", x: pos.x, y: pos.y, button: "left", clickCount: 1 });
  console.log("Clicked avatar button - file dialog opening...");
  await sleep(2000);

  // 5. OS-level: Cmd+Shift+G for Go to Folder
  bridge("cg.keyCombo", { keys: ["cmd", "shift", "g"] });
  console.log("Sent Cmd+Shift+G");
  await sleep(1000);

  // 6. Navigate to directory first
  bridge("cg.keyCombo", { keys: ["cmd", "a"] });
  await sleep(200);
  bridge("cg.typeText", { text: "/Users/khushi/Documents/Automator" });
  console.log("Typed directory path");
  await sleep(500);

  // 7. Press Enter to go to directory
  bridge("cg.keyCombo", { keys: ["return"] });
  console.log("Navigated to directory");
  await sleep(2000);

  // 8. Now type the filename to select it
  bridge("cg.typeText", { text: "screenhand-avatar.png" });
  console.log("Typed filename");
  await sleep(500);

  // 9. Press Enter to open the file
  bridge("cg.keyCombo", { keys: ["return"] });
  console.log("Pressed Enter to open file");
  await sleep(2000);

  // 8. Screenshot to see result
  const shot = bridge("cg.captureScreen", {});
  console.log("Screenshot:", shot.result.path);

  await client.close();
  process.exit(0);
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });

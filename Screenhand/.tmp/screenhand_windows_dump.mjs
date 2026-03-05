import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: "npx", args: ["tsx", "/Users/khushi/Documents/Automator/Screenhand/mcp-desktop.ts"] });
const client = new Client({ name: "screenhand-windows-dump", version: "1.0.0" }, { capabilities: {} });
const t = (r) => r?.content?.find?.(c => c.type === "text")?.text || JSON.stringify(r);

try {
  await client.connect(transport);
  const r = await client.callTool({ name: "windows", arguments: {} });
  console.log(t(r));
} finally {
  try { await client.close(); } catch {}
}

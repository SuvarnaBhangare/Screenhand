#!/bin/bash
set -e

# ScreenHand Claude Code Plugin Installer
# Copies plugin to ~/.claude/plugins/ and configures the MCP server path automatically.

SCREENHAND_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_SRC="$SCREENHAND_DIR/.claude/plugins/screenhand"
PLUGIN_DEST="$HOME/.claude/plugins/screenhand"
MCP_ENTRY="$SCREENHAND_DIR/mcp-desktop.ts"

echo "ScreenHand Plugin Installer"
echo "==========================="
echo ""

# Verify we're in the right directory
if [ ! -f "$MCP_ENTRY" ]; then
  echo "Error: mcp-desktop.ts not found at $SCREENHAND_DIR"
  echo "Run this script from the screenhand repo root."
  exit 1
fi

if [ ! -d "$PLUGIN_SRC" ]; then
  echo "Error: Plugin source not found at $PLUGIN_SRC"
  exit 1
fi

# Check if native bridge is built
if [ "$(uname)" = "Darwin" ] && [ ! -f "$SCREENHAND_DIR/native/macos-bridge/.build/release/macos-bridge" ]; then
  echo "Warning: Native bridge not built. Run 'npm run build:native' first."
  echo ""
fi

# Create plugin directory
mkdir -p "$(dirname "$PLUGIN_DEST")"

# Copy plugin files
if [ -d "$PLUGIN_DEST" ]; then
  echo "Updating existing plugin at $PLUGIN_DEST"
  rm -rf "$PLUGIN_DEST"
else
  echo "Installing plugin to $PLUGIN_DEST"
fi
cp -r "$PLUGIN_SRC" "$PLUGIN_DEST"

# Patch .mcp.json with the real absolute path
cat > "$PLUGIN_DEST/.mcp.json" << EOF
{
  "mcpServers": {
    "screenhand": {
      "command": "npx",
      "args": ["tsx", "$MCP_ENTRY"],
      "env": {
        "ANTHROPIC_API_KEY": "\${ANTHROPIC_API_KEY}"
      }
    }
  }
}
EOF

echo "  MCP server path: $MCP_ENTRY"

# Create ~/.screenhand/ for logs and state
mkdir -p "$HOME/.screenhand"
echo "  State directory: ~/.screenhand/"

echo ""
echo "Done! Restart Claude Code to load the plugin."
echo ""
echo "Try: /screenhand:automate-app"
echo "     /screenhand:post-social"
echo "     /screenhand:scrape-web"

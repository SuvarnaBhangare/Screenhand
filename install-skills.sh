#!/bin/bash
# Install desktop-automation skills globally for Claude Code
# Usage: ./install-skills.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="$HOME/.claude/commands"

mkdir -p "$TARGET"

cp "$SCRIPT_DIR/.claude/commands/screenshot.md" "$TARGET/desktop-screenshot.md"
cp "$SCRIPT_DIR/.claude/commands/debug-ui.md" "$TARGET/desktop-debug-ui.md"
cp "$SCRIPT_DIR/.claude/commands/automate.md" "$TARGET/desktop-automate.md"

echo "Installed skills to $TARGET:"
echo "  /desktop-screenshot  — capture and describe your screen"
echo "  /desktop-debug-ui    — inspect any app's UI tree"
echo "  /desktop-automate    — automate a multi-step workflow"
echo ""
echo "These are now available globally in any Claude Code session."

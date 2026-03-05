Automate a desktop workflow described by the user.

The user will describe what they want done: $ARGUMENTS

Plan and execute the workflow step by step using the desktop automation MCP tools:

## Planning
1. Break the task into discrete steps
2. Identify which apps are involved (`apps`, `windows`)
3. For each step, decide the best approach:
   - **Native app control**: `ui_tree` → `ui_find` → `ui_press` / `ui_set_value` (preferred — fast and reliable)
   - **Visual fallback**: `screenshot` → `click_text` (when Accessibility doesn't expose the element)
   - **Chrome**: `browser_navigate` → `browser_dom` → `browser_click` / `browser_type` (for web pages)
   - **AppleScript**: `applescript` (for scriptable apps like Finder, Mail, Notes)
   - **Keyboard**: `key` for shortcuts, `type_text` for typing

## Execution
- Execute each step, verifying success before moving to the next
- After key actions, use `screenshot` or `ui_tree` to confirm the expected state
- If a step fails, try an alternative approach before giving up
- Report progress as you go

## Completion
- Summarize what was done
- Note any steps that required fallbacks
- Flag anything that didn't work as expected

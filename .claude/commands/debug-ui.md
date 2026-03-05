Inspect and debug the UI structure of an app.

1. Use `apps` to list running applications
2. If the user specified an app name ($ARGUMENTS), find its PID. Otherwise use the frontmost app.
3. Use `focus` to bring the app to the front
4. Use `ui_tree` with the app's PID to get the full Accessibility tree
5. Use `windows` to get the window bounds

Then analyze and report:
- App name and bundle ID
- Window hierarchy and layout
- Interactive elements (buttons, text fields, menus) with their states (enabled/disabled, value)
- Navigation structure
- Any elements that look broken or inaccessible
- Suggested selectors for automating key actions (titles to use with `ui_press`, `ui_find`)

Format as a structured report with sections.

$ARGUMENTS

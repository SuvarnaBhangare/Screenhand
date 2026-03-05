using System.Windows.Automation;
using System.Runtime.InteropServices;

namespace WindowsBridge;

/// <summary>
/// UI Automation wrapper — equivalent to macOS AccessibilityBridge.swift.
/// Uses the Windows UI Automation framework to inspect and interact with UI elements.
/// </summary>
class UIAutomationBridge
{
    /// <summary>
    /// Get the full UI element tree for a process.
    /// </summary>
    public Dictionary<string, object?> GetElementTree(int pid, int maxDepth)
    {
        var rootElement = GetRootElementForProcess(pid);
        return BuildTree(rootElement, 0, maxDepth, new List<int>());
    }

    /// <summary>
    /// Find an element by role, title, value, or identifier.
    /// </summary>
    public Dictionary<string, object?> FindElement(int pid, string? role, string? title,
        string? value, string? identifier, bool exact)
    {
        var rootElement = GetRootElementForProcess(pid);

        // Build conditions
        var conditions = new List<Condition>();

        if (!string.IsNullOrEmpty(role))
        {
            var controlType = MapRoleToControlType(role!);
            if (controlType != null)
                conditions.Add(new PropertyCondition(AutomationElement.ControlTypeProperty, controlType));
        }

        if (!string.IsNullOrEmpty(title))
        {
            if (exact)
                conditions.Add(new PropertyCondition(AutomationElement.NameProperty, title));
            // For non-exact, we'll filter after search
        }

        if (!string.IsNullOrEmpty(identifier))
        {
            conditions.Add(new PropertyCondition(AutomationElement.AutomationIdProperty, identifier));
        }

        Condition searchCondition;
        if (conditions.Count == 0)
            searchCondition = Condition.TrueCondition;
        else if (conditions.Count == 1)
            searchCondition = conditions[0];
        else
            searchCondition = new AndCondition(conditions.ToArray());

        AutomationElement? found;

        if (!string.IsNullOrEmpty(title) && !exact)
        {
            // For partial match, walk the tree manually
            found = FindElementByPartialName(rootElement, title!, role, 10);
        }
        else
        {
            found = rootElement.FindFirst(TreeScope.Descendants, searchCondition);
        }

        if (found == null)
            throw new BridgeException($"Element not found: role={role}, title={title}, value={value}");

        // Build element path for later reference
        var elementPath = GetElementPath(rootElement, found);

        var result = new Dictionary<string, object?>
        {
            ["role"] = MapControlTypeToRole(found.Current.ControlType),
            ["title"] = found.Current.Name,
            ["elementPath"] = elementPath,
        };

        try
        {
            var bounds = found.Current.BoundingRectangle;
            if (!bounds.IsEmpty)
            {
                result["bounds"] = new Dictionary<string, object>
                {
                    ["x"] = bounds.X,
                    ["y"] = bounds.Y,
                    ["width"] = bounds.Width,
                    ["height"] = bounds.Height,
                };
            }
        }
        catch { }

        // Try to get value
        try
        {
            if (found.TryGetCurrentPattern(ValuePattern.Pattern, out object? pattern))
            {
                result["value"] = ((ValuePattern)pattern).Current.Value;
            }
        }
        catch { }

        return result;
    }

    /// <summary>
    /// Perform an action on an element at the given path.
    /// Maps macOS AX actions to Windows UIA patterns.
    /// </summary>
    public Dictionary<string, object> PerformAction(int pid, int[] elementPath, string action)
    {
        var rootElement = GetRootElementForProcess(pid);
        var element = NavigateToElement(rootElement, elementPath);

        switch (action)
        {
            case "AXPress":
            case "press":
            case "click":
                if (element.TryGetCurrentPattern(InvokePattern.Pattern, out object? invokePattern))
                {
                    ((InvokePattern)invokePattern).Invoke();
                }
                else if (element.TryGetCurrentPattern(TogglePattern.Pattern, out object? togglePattern))
                {
                    ((TogglePattern)togglePattern).Toggle();
                }
                else if (element.TryGetCurrentPattern(SelectionItemPattern.Pattern, out object? selPattern))
                {
                    ((SelectionItemPattern)selPattern).Select();
                }
                else if (element.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out object? ecPattern))
                {
                    var p = (ExpandCollapsePattern)ecPattern;
                    if (p.Current.ExpandCollapseState == ExpandCollapseState.Collapsed)
                        p.Expand();
                    else
                        p.Collapse();
                }
                else
                {
                    // Fallback: click at element center
                    var bounds = element.Current.BoundingRectangle;
                    if (!bounds.IsEmpty)
                    {
                        var x = bounds.X + bounds.Width / 2;
                        var y = bounds.Y + bounds.Height / 2;
                        new InputBridge().MouseClick(x, y, "left", 1);
                    }
                    else
                    {
                        throw new BridgeException($"Element does not support any click pattern and has no bounds");
                    }
                }
                break;

            case "AXShowMenu":
            case "showMenu":
                if (element.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out object? expandPattern))
                {
                    ((ExpandCollapsePattern)expandPattern).Expand();
                }
                break;

            case "AXScrollToVisible":
            case "scrollToVisible":
                if (element.TryGetCurrentPattern(ScrollItemPattern.Pattern, out object? scrollPattern))
                {
                    ((ScrollItemPattern)scrollPattern).ScrollIntoView();
                }
                break;

            default:
                throw new BridgeException($"Unsupported action: {action}");
        }

        return new Dictionary<string, object> { ["ok"] = true };
    }

    /// <summary>
    /// Set value of a text field or similar element.
    /// </summary>
    public Dictionary<string, object> SetElementValue(int pid, int[] elementPath, string value)
    {
        var rootElement = GetRootElementForProcess(pid);
        var element = NavigateToElement(rootElement, elementPath);

        if (element.TryGetCurrentPattern(ValuePattern.Pattern, out object? pattern))
        {
            ((ValuePattern)pattern).SetValue(value);
        }
        else
        {
            // Fallback: focus and type
            try { element.SetFocus(); } catch { }
            System.Threading.Thread.Sleep(50);
            // Select all and type
            new InputBridge().KeyCombo(new[] { "ctrl", "a" });
            System.Threading.Thread.Sleep(50);
            new InputBridge().TypeText(value);
        }

        return new Dictionary<string, object> { ["ok"] = true };
    }

    /// <summary>
    /// Get value of an element.
    /// </summary>
    public Dictionary<string, object?> GetElementValue(int pid, int[] elementPath)
    {
        var rootElement = GetRootElementForProcess(pid);
        var element = NavigateToElement(rootElement, elementPath);

        string? val = null;
        if (element.TryGetCurrentPattern(ValuePattern.Pattern, out object? pattern))
        {
            val = ((ValuePattern)pattern).Current.Value;
        }
        else
        {
            val = element.Current.Name;
        }

        return new Dictionary<string, object?> { ["value"] = val };
    }

    /// <summary>
    /// Click a menu item by path (e.g., ["File", "New"]).
    /// </summary>
    public Dictionary<string, object> MenuClick(int pid, string[] menuPath)
    {
        var rootElement = GetRootElementForProcess(pid);

        // Find the menu bar
        var menuBar = rootElement.FindFirst(TreeScope.Children,
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.MenuBar));

        if (menuBar == null)
        {
            // Try looking in the window's children
            var window = rootElement.FindFirst(TreeScope.Children,
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Window));
            if (window != null)
            {
                menuBar = window.FindFirst(TreeScope.Children,
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.MenuBar));
            }
        }

        if (menuBar == null)
            throw new BridgeException("Menu bar not found");

        AutomationElement current = menuBar;

        for (int i = 0; i < menuPath.Length; i++)
        {
            var menuName = menuPath[i];

            // Find the menu item by name
            var menuItem = current.FindFirst(TreeScope.Children,
                new PropertyCondition(AutomationElement.NameProperty, menuName));

            if (menuItem == null)
            {
                // Try partial match
                var children = current.FindAll(TreeScope.Children, Condition.TrueCondition);
                foreach (AutomationElement child in children)
                {
                    if (child.Current.Name.Contains(menuName, StringComparison.OrdinalIgnoreCase))
                    {
                        menuItem = child;
                        break;
                    }
                }
            }

            if (menuItem == null)
                throw new BridgeException($"Menu item not found: {menuName}");

            if (i < menuPath.Length - 1)
            {
                // Expand submenu
                if (menuItem.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out object? ecPattern))
                {
                    ((ExpandCollapsePattern)ecPattern).Expand();
                    System.Threading.Thread.Sleep(100);
                }
                else if (menuItem.TryGetCurrentPattern(InvokePattern.Pattern, out object? invPattern))
                {
                    ((InvokePattern)invPattern).Invoke();
                    System.Threading.Thread.Sleep(100);
                }

                // After expanding, the submenu items should be children or in a popup
                current = menuItem;
            }
            else
            {
                // Click the final menu item
                if (menuItem.TryGetCurrentPattern(InvokePattern.Pattern, out object? invPattern))
                {
                    ((InvokePattern)invPattern).Invoke();
                }
                else if (menuItem.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out object? ecPattern))
                {
                    ((ExpandCollapsePattern)ecPattern).Expand();
                }
            }
        }

        return new Dictionary<string, object> { ["ok"] = true };
    }

    // ── Helpers ──

    private AutomationElement GetRootElementForProcess(int pid)
    {
        var root = AutomationElement.RootElement;
        var condition = new PropertyCondition(AutomationElement.ProcessIdProperty, pid);
        var element = root.FindFirst(TreeScope.Children, condition);

        if (element == null)
        {
            // Try finding any window with this PID
            var allWindows = root.FindAll(TreeScope.Children, Condition.TrueCondition);
            foreach (AutomationElement win in allWindows)
            {
                try
                {
                    if (win.Current.ProcessId == pid)
                    {
                        element = win;
                        break;
                    }
                }
                catch { }
            }
        }

        if (element == null)
            throw new BridgeException($"No window found for PID {pid}");

        return element;
    }

    private Dictionary<string, object?> BuildTree(AutomationElement element, int depth, int maxDepth, List<int> path)
    {
        var node = new Dictionary<string, object?>
        {
            ["role"] = MapControlTypeToRole(element.Current.ControlType),
        };

        var name = element.Current.Name;
        if (!string.IsNullOrEmpty(name))
            node["title"] = name;

        // Get value if available
        try
        {
            if (element.TryGetCurrentPattern(ValuePattern.Pattern, out object? pattern))
            {
                var val = ((ValuePattern)pattern).Current.Value;
                if (!string.IsNullOrEmpty(val))
                    node["value"] = val;
            }
        }
        catch { }

        // Get bounds
        try
        {
            var bounds = element.Current.BoundingRectangle;
            if (!bounds.IsEmpty)
            {
                node["bounds"] = new Dictionary<string, object>
                {
                    ["x"] = bounds.X,
                    ["y"] = bounds.Y,
                    ["width"] = bounds.Width,
                    ["height"] = bounds.Height,
                };
            }
        }
        catch { }

        node["path"] = path.ToArray();

        // Recurse into children
        if (depth < maxDepth)
        {
            try
            {
                var children = element.FindAll(TreeScope.Children, Condition.TrueCondition);
                if (children.Count > 0)
                {
                    var childNodes = new List<Dictionary<string, object?>>();
                    for (int i = 0; i < children.Count && i < 100; i++) // Cap at 100 children
                    {
                        var childPath = new List<int>(path) { i };
                        try
                        {
                            childNodes.Add(BuildTree(children[i], depth + 1, maxDepth, childPath));
                        }
                        catch
                        {
                            // Skip inaccessible children
                        }
                    }
                    if (childNodes.Count > 0)
                        node["children"] = childNodes;
                }
            }
            catch { }
        }

        return node;
    }

    private AutomationElement NavigateToElement(AutomationElement root, int[] path)
    {
        var current = root;
        foreach (var index in path)
        {
            var children = current.FindAll(TreeScope.Children, Condition.TrueCondition);
            if (index >= children.Count)
                throw new BridgeException($"Element path index {index} out of range (count={children.Count})");
            current = children[index];
        }
        return current;
    }

    private int[] GetElementPath(AutomationElement root, AutomationElement target)
    {
        // BFS to find the path from root to target
        var queue = new Queue<(AutomationElement element, List<int> path)>();
        queue.Enqueue((root, new List<int>()));

        while (queue.Count > 0)
        {
            var (current, path) = queue.Dequeue();

            if (Automation.Compare(current, target))
                return path.ToArray();

            try
            {
                var children = current.FindAll(TreeScope.Children, Condition.TrueCondition);
                for (int i = 0; i < children.Count && i < 100; i++)
                {
                    var childPath = new List<int>(path) { i };
                    queue.Enqueue((children[i], childPath));
                }
            }
            catch { }
        }

        // Fallback: return empty path
        return Array.Empty<int>();
    }

    private AutomationElement? FindElementByPartialName(AutomationElement root, string partialName,
        string? role, int maxDepth)
    {
        if (maxDepth <= 0) return null;

        try
        {
            var name = root.Current.Name;
            if (!string.IsNullOrEmpty(name) &&
                name.Contains(partialName, StringComparison.OrdinalIgnoreCase))
            {
                if (role == null || MapControlTypeToRole(root.Current.ControlType)
                    .Equals(role, StringComparison.OrdinalIgnoreCase))
                {
                    return root;
                }
            }
        }
        catch { }

        try
        {
            var children = root.FindAll(TreeScope.Children, Condition.TrueCondition);
            foreach (AutomationElement child in children)
            {
                var found = FindElementByPartialName(child, partialName, role, maxDepth - 1);
                if (found != null) return found;
            }
        }
        catch { }

        return null;
    }

    // Map macOS AX roles to Windows UIA ControlTypes
    private static ControlType? MapRoleToControlType(string role)
    {
        return role.ToLowerInvariant() switch
        {
            "button" or "axbutton" => ControlType.Button,
            "checkbox" or "axcheckbox" => ControlType.CheckBox,
            "combobox" or "axcombobox" => ControlType.ComboBox,
            "textfield" or "axtextfield" or "textarea" or "axtextarea" => ControlType.Edit,
            "group" or "axgroup" => ControlType.Group,
            "image" or "aximage" => ControlType.Image,
            "link" or "axlink" => ControlType.Hyperlink,
            "list" or "axlist" => ControlType.List,
            "menu" or "axmenu" => ControlType.Menu,
            "menuitem" or "axmenuitem" => ControlType.MenuItem,
            "menubar" or "axmenubar" => ControlType.MenuBar,
            "radiobutton" or "axradiobutton" => ControlType.RadioButton,
            "scrollbar" or "axscrollbar" => ControlType.ScrollBar,
            "slider" or "axslider" => ControlType.Slider,
            "statictext" or "axstatictext" => ControlType.Text,
            "tab" or "axtab" or "tabgroup" or "axtabgroup" => ControlType.Tab,
            "table" or "axtable" => ControlType.Table,
            "toolbar" or "axtoolbar" => ControlType.ToolBar,
            "tree" or "axtree" or "outline" or "axoutline" => ControlType.Tree,
            "window" or "axwindow" => ControlType.Window,
            _ => null,
        };
    }

    // Map Windows UIA ControlTypes to macOS-style role strings
    private static string MapControlTypeToRole(ControlType ct)
    {
        if (ct == ControlType.Button) return "AXButton";
        if (ct == ControlType.CheckBox) return "AXCheckBox";
        if (ct == ControlType.ComboBox) return "AXComboBox";
        if (ct == ControlType.Edit) return "AXTextField";
        if (ct == ControlType.Group) return "AXGroup";
        if (ct == ControlType.Image) return "AXImage";
        if (ct == ControlType.Hyperlink) return "AXLink";
        if (ct == ControlType.List) return "AXList";
        if (ct == ControlType.ListItem) return "AXCell";
        if (ct == ControlType.Menu) return "AXMenu";
        if (ct == ControlType.MenuItem) return "AXMenuItem";
        if (ct == ControlType.MenuBar) return "AXMenuBar";
        if (ct == ControlType.Pane) return "AXGroup";
        if (ct == ControlType.RadioButton) return "AXRadioButton";
        if (ct == ControlType.ScrollBar) return "AXScrollBar";
        if (ct == ControlType.Slider) return "AXSlider";
        if (ct == ControlType.StatusBar) return "AXStaticText";
        if (ct == ControlType.Tab) return "AXTabGroup";
        if (ct == ControlType.TabItem) return "AXTab";
        if (ct == ControlType.Table) return "AXTable";
        if (ct == ControlType.Text) return "AXStaticText";
        if (ct == ControlType.ToolBar) return "AXToolbar";
        if (ct == ControlType.ToolTip) return "AXStaticText";
        if (ct == ControlType.Tree) return "AXOutline";
        if (ct == ControlType.TreeItem) return "AXRow";
        if (ct == ControlType.Window) return "AXWindow";
        if (ct == ControlType.Document) return "AXWebArea";
        if (ct == ControlType.Header) return "AXGroup";
        if (ct == ControlType.DataGrid) return "AXTable";
        if (ct == ControlType.DataItem) return "AXCell";
        if (ct == ControlType.SplitButton) return "AXButton";
        if (ct == ControlType.Spinner) return "AXIncrementor";
        if (ct == ControlType.Thumb) return "AXHandle";
        if (ct == ControlType.TitleBar) return "AXStaticText";
        if (ct == ControlType.Custom) return "AXGroup";
        return "AXGroup"; // Default fallback
    }
}

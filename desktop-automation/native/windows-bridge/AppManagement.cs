using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace WindowsBridge;

/// <summary>
/// Process and window management using Windows APIs.
/// Equivalent to macOS AppManagement.swift.
/// </summary>
class AppManagement
{
    // P/Invoke declarations
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool AllowSetForegroundWindow(int dwProcessId);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left, Top, Right, Bottom;
    }

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    private const int SW_RESTORE = 9;
    private const int SW_SHOW = 5;

    /// <summary>
    /// List all running GUI applications.
    /// On Windows, "bundleId" is mapped to the process name (e.g., "chrome", "notepad").
    /// </summary>
    public List<Dictionary<string, object>> ListRunningApps()
    {
        var apps = new List<Dictionary<string, object>>();
        var seen = new HashSet<int>();
        var foregroundHwnd = GetForegroundWindow();
        GetWindowThreadProcessId(foregroundHwnd, out uint foregroundPid);

        var processes = Process.GetProcesses()
            .Where(p => !string.IsNullOrEmpty(p.MainWindowTitle) && p.MainWindowHandle != IntPtr.Zero)
            .OrderBy(p => p.ProcessName);

        foreach (var proc in processes)
        {
            try
            {
                if (seen.Contains(proc.Id)) continue;
                seen.Add(proc.Id);

                apps.Add(new Dictionary<string, object>
                {
                    ["name"] = proc.ProcessName,
                    ["bundleId"] = proc.ProcessName.ToLowerInvariant(), // Windows equivalent
                    ["pid"] = proc.Id,
                    ["isActive"] = proc.Id == (int)foregroundPid,
                });
            }
            catch
            {
                // Process may have exited
            }
        }

        return apps;
    }

    /// <summary>
    /// Launch an application by process name or path.
    /// </summary>
    public Dictionary<string, object> LaunchApp(string bundleId)
    {
        Process process;
        try
        {
            // Try launching as a process name first (e.g., "notepad", "calc")
            process = Process.Start(new ProcessStartInfo
            {
                FileName = bundleId,
                UseShellExecute = true,
            }) ?? throw new BridgeException($"Failed to launch: {bundleId}");
        }
        catch
        {
            throw new BridgeException($"Could not launch application: {bundleId}");
        }

        // Wait briefly for the process to initialize
        try { process.WaitForInputIdle(3000); } catch { }

        return new Dictionary<string, object>
        {
            ["appName"] = process.ProcessName,
            ["bundleId"] = process.ProcessName.ToLowerInvariant(),
            ["pid"] = process.Id,
        };
    }

    /// <summary>
    /// Focus/activate a window by process name.
    /// </summary>
    public Dictionary<string, object> FocusApp(string bundleId)
    {
        var name = bundleId.ToLowerInvariant().Replace(".exe", "");
        var processes = Process.GetProcessesByName(name);

        if (processes.Length == 0)
        {
            // Try exact match with original casing
            processes = Process.GetProcesses()
                .Where(p => p.ProcessName.Equals(bundleId, StringComparison.OrdinalIgnoreCase) ||
                            p.ProcessName.Equals(name, StringComparison.OrdinalIgnoreCase))
                .ToArray();
        }

        if (processes.Length == 0)
            throw new BridgeException($"No running process found: {bundleId}");

        var proc = processes.First(p => p.MainWindowHandle != IntPtr.Zero);
        var hwnd = proc.MainWindowHandle;

        if (hwnd == IntPtr.Zero)
            throw new BridgeException($"Process {bundleId} has no visible window");

        ShowWindow(hwnd, SW_RESTORE);
        AllowSetForegroundWindow(proc.Id);
        SetForegroundWindow(hwnd);

        return new Dictionary<string, object> { ["ok"] = true };
    }

    /// <summary>
    /// List all visible windows with their bounds.
    /// </summary>
    public List<Dictionary<string, object>> ListWindows()
    {
        var windows = new List<Dictionary<string, object>>();

        EnumWindows((hWnd, _) =>
        {
            if (!IsWindowVisible(hWnd)) return true;

            var titleLength = GetWindowTextLength(hWnd);
            if (titleLength == 0) return true;

            var titleBuilder = new StringBuilder(titleLength + 1);
            GetWindowText(hWnd, titleBuilder, titleBuilder.Capacity);
            var title = titleBuilder.ToString();

            GetWindowThreadProcessId(hWnd, out uint pid);
            GetWindowRect(hWnd, out RECT rect);

            string appName;
            try
            {
                appName = Process.GetProcessById((int)pid).ProcessName;
            }
            catch
            {
                appName = "unknown";
            }

            windows.Add(new Dictionary<string, object>
            {
                ["windowId"] = hWnd.ToInt64(),
                ["appName"] = appName,
                ["title"] = title,
                ["pid"] = (int)pid,
                ["bounds"] = new Dictionary<string, object>
                {
                    ["x"] = rect.Left,
                    ["y"] = rect.Top,
                    ["width"] = rect.Right - rect.Left,
                    ["height"] = rect.Bottom - rect.Top,
                },
            });

            return true;
        }, IntPtr.Zero);

        return windows;
    }

    /// <summary>
    /// Get the frontmost (foreground) application.
    /// </summary>
    public Dictionary<string, object> FrontmostApp()
    {
        var hwnd = GetForegroundWindow();
        GetWindowThreadProcessId(hwnd, out uint pid);

        try
        {
            var proc = Process.GetProcessById((int)pid);
            return new Dictionary<string, object>
            {
                ["name"] = proc.ProcessName,
                ["bundleId"] = proc.ProcessName.ToLowerInvariant(),
                ["pid"] = proc.Id,
                ["isActive"] = true,
            };
        }
        catch
        {
            throw new BridgeException("Could not determine frontmost application");
        }
    }
}

using System.Runtime.InteropServices;

namespace WindowsBridge;

/// <summary>
/// Mouse and keyboard input injection using SendInput().
/// Equivalent to macOS CoreGraphicsBridge.swift.
/// </summary>
class InputBridge
{
    // SendInput structures and constants
    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X, Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public uint Type;
        public INPUTUNION U;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct INPUTUNION
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT
    {
        public int dx, dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    // Input type constants
    private const uint INPUT_MOUSE = 0;
    private const uint INPUT_KEYBOARD = 1;

    // Mouse event flags
    private const uint MOUSEEVENTF_MOVE = 0x0001;
    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;
    private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    private const uint MOUSEEVENTF_WHEEL = 0x0800;
    private const uint MOUSEEVENTF_HWHEEL = 0x1000;
    private const uint MOUSEEVENTF_ABSOLUTE = 0x8000;

    // Keyboard event flags
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint KEYEVENTF_UNICODE = 0x0004;

    // System metrics
    private const int SM_CXSCREEN = 0;
    private const int SM_CYSCREEN = 1;

    // Virtual key codes
    private const ushort VK_SHIFT = 0x10;
    private const ushort VK_CONTROL = 0x11;
    private const ushort VK_MENU = 0x12; // Alt
    private const ushort VK_LWIN = 0x5B;
    private const ushort VK_RETURN = 0x0D;
    private const ushort VK_TAB = 0x09;
    private const ushort VK_ESCAPE = 0x1B;
    private const ushort VK_SPACE = 0x20;
    private const ushort VK_BACK = 0x08;
    private const ushort VK_DELETE = 0x2E;
    private const ushort VK_UP = 0x26;
    private const ushort VK_DOWN = 0x28;
    private const ushort VK_LEFT = 0x25;
    private const ushort VK_RIGHT = 0x27;
    private const ushort VK_HOME = 0x24;
    private const ushort VK_END = 0x23;
    private const ushort VK_PRIOR = 0x21; // Page Up
    private const ushort VK_NEXT = 0x22;  // Page Down
    private const ushort VK_F1 = 0x70;

    /// <summary>
    /// Click at screen coordinates.
    /// </summary>
    public Dictionary<string, object> MouseClick(double x, double y, string button, int clickCount)
    {
        SetCursorPos((int)x, (int)y);
        System.Threading.Thread.Sleep(10);

        uint downFlag, upFlag;
        switch (button.ToLowerInvariant())
        {
            case "right":
                downFlag = MOUSEEVENTF_RIGHTDOWN;
                upFlag = MOUSEEVENTF_RIGHTUP;
                break;
            case "middle":
                downFlag = MOUSEEVENTF_MIDDLEDOWN;
                upFlag = MOUSEEVENTF_MIDDLEUP;
                break;
            default: // left
                downFlag = MOUSEEVENTF_LEFTDOWN;
                upFlag = MOUSEEVENTF_LEFTUP;
                break;
        }

        for (int i = 0; i < clickCount; i++)
        {
            var inputs = new INPUT[]
            {
                new() { Type = INPUT_MOUSE, U = new INPUTUNION { mi = new MOUSEINPUT { dwFlags = downFlag } } },
                new() { Type = INPUT_MOUSE, U = new INPUTUNION { mi = new MOUSEINPUT { dwFlags = upFlag } } },
            };
            SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<INPUT>());

            if (i < clickCount - 1)
                System.Threading.Thread.Sleep(30);
        }

        return new Dictionary<string, object> { ["ok"] = true };
    }

    /// <summary>
    /// Move mouse to screen coordinates.
    /// </summary>
    public Dictionary<string, object> MouseMove(double x, double y)
    {
        SetCursorPos((int)x, (int)y);
        return new Dictionary<string, object> { ["ok"] = true };
    }

    /// <summary>
    /// Drag from one point to another with interpolation.
    /// </summary>
    public Dictionary<string, object> MouseDrag(double fromX, double fromY, double toX, double toY)
    {
        SetCursorPos((int)fromX, (int)fromY);
        System.Threading.Thread.Sleep(50);

        // Mouse down
        var downInput = new INPUT[]
        {
            new() { Type = INPUT_MOUSE, U = new INPUTUNION { mi = new MOUSEINPUT { dwFlags = MOUSEEVENTF_LEFTDOWN } } },
        };
        SendInput(1, downInput, Marshal.SizeOf<INPUT>());
        System.Threading.Thread.Sleep(50);

        // Interpolate movement
        int steps = 20;
        for (int i = 1; i <= steps; i++)
        {
            double t = (double)i / steps;
            int cx = (int)(fromX + (toX - fromX) * t);
            int cy = (int)(fromY + (toY - fromY) * t);
            SetCursorPos(cx, cy);
            System.Threading.Thread.Sleep(10);
        }

        // Mouse up
        var upInput = new INPUT[]
        {
            new() { Type = INPUT_MOUSE, U = new INPUTUNION { mi = new MOUSEINPUT { dwFlags = MOUSEEVENTF_LEFTUP } } },
        };
        SendInput(1, upInput, Marshal.SizeOf<INPUT>());

        return new Dictionary<string, object> { ["ok"] = true };
    }

    /// <summary>
    /// Press a key combination (e.g., ["ctrl", "c"], ["alt", "f4"]).
    /// Maps macOS modifier names to Windows equivalents.
    /// </summary>
    public Dictionary<string, object> KeyCombo(string[] keys)
    {
        var modifiers = new List<ushort>();
        var regularKeys = new List<ushort>();

        foreach (var key in keys)
        {
            var vk = MapKeyToVK(key.Trim().ToLowerInvariant());
            if (IsModifier(vk))
                modifiers.Add(vk);
            else
                regularKeys.Add(vk);
        }

        var inputs = new List<INPUT>();

        // Press modifiers down
        foreach (var mod in modifiers)
        {
            inputs.Add(new INPUT
            {
                Type = INPUT_KEYBOARD,
                U = new INPUTUNION { ki = new KEYBDINPUT { wVk = mod } }
            });
        }

        // Press regular keys
        foreach (var key in regularKeys)
        {
            inputs.Add(new INPUT
            {
                Type = INPUT_KEYBOARD,
                U = new INPUTUNION { ki = new KEYBDINPUT { wVk = key } }
            });
        }

        // Release regular keys
        foreach (var key in regularKeys)
        {
            inputs.Add(new INPUT
            {
                Type = INPUT_KEYBOARD,
                U = new INPUTUNION { ki = new KEYBDINPUT { wVk = key, dwFlags = KEYEVENTF_KEYUP } }
            });
        }

        // Release modifiers (reverse order)
        for (int i = modifiers.Count - 1; i >= 0; i--)
        {
            inputs.Add(new INPUT
            {
                Type = INPUT_KEYBOARD,
                U = new INPUTUNION { ki = new KEYBDINPUT { wVk = modifiers[i], dwFlags = KEYEVENTF_KEYUP } }
            });
        }

        SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf<INPUT>());

        return new Dictionary<string, object> { ["ok"] = true };
    }

    /// <summary>
    /// Type text character by character using Unicode input.
    /// </summary>
    public Dictionary<string, object> TypeText(string text)
    {
        var inputs = new List<INPUT>();

        foreach (var ch in text)
        {
            // Key down
            inputs.Add(new INPUT
            {
                Type = INPUT_KEYBOARD,
                U = new INPUTUNION
                {
                    ki = new KEYBDINPUT
                    {
                        wVk = 0,
                        wScan = (ushort)ch,
                        dwFlags = KEYEVENTF_UNICODE,
                    }
                }
            });
            // Key up
            inputs.Add(new INPUT
            {
                Type = INPUT_KEYBOARD,
                U = new INPUTUNION
                {
                    ki = new KEYBDINPUT
                    {
                        wVk = 0,
                        wScan = (ushort)ch,
                        dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                    }
                }
            });
        }

        // Send in batches to avoid overflow
        const int batchSize = 50;
        for (int i = 0; i < inputs.Count; i += batchSize)
        {
            var batch = inputs.Skip(i).Take(batchSize).ToArray();
            SendInput((uint)batch.Length, batch, Marshal.SizeOf<INPUT>());
            if (i + batchSize < inputs.Count)
                System.Threading.Thread.Sleep(10);
        }

        return new Dictionary<string, object> { ["ok"] = true };
    }

    /// <summary>
    /// Scroll at a position.
    /// </summary>
    public Dictionary<string, object> Scroll(double x, double y, int deltaX, int deltaY)
    {
        SetCursorPos((int)x, (int)y);
        System.Threading.Thread.Sleep(10);

        var inputs = new List<INPUT>();

        // Vertical scroll
        if (deltaY != 0)
        {
            inputs.Add(new INPUT
            {
                Type = INPUT_MOUSE,
                U = new INPUTUNION
                {
                    mi = new MOUSEINPUT
                    {
                        dwFlags = MOUSEEVENTF_WHEEL,
                        mouseData = (uint)(deltaY * 120), // 120 = WHEEL_DELTA
                    }
                }
            });
        }

        // Horizontal scroll
        if (deltaX != 0)
        {
            inputs.Add(new INPUT
            {
                Type = INPUT_MOUSE,
                U = new INPUTUNION
                {
                    mi = new MOUSEINPUT
                    {
                        dwFlags = MOUSEEVENTF_HWHEEL,
                        mouseData = (uint)(deltaX * 120),
                    }
                }
            });
        }

        if (inputs.Count > 0)
            SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf<INPUT>());

        return new Dictionary<string, object> { ["ok"] = true };
    }

    // ── Key mapping ──

    private ushort MapKeyToVK(string key)
    {
        return key switch
        {
            // Modifiers — map macOS names to Windows
            "cmd" or "command" or "win" or "super" => VK_LWIN,
            "ctrl" or "control" => VK_CONTROL,
            "alt" or "option" or "opt" => VK_MENU,
            "shift" => VK_SHIFT,

            // Special keys
            "enter" or "return" => VK_RETURN,
            "tab" => VK_TAB,
            "escape" or "esc" => VK_ESCAPE,
            "space" => VK_SPACE,
            "backspace" or "delete" => VK_BACK,
            "forwarddelete" or "del" => VK_DELETE,
            "up" or "uparrow" => VK_UP,
            "down" or "downarrow" => VK_DOWN,
            "left" or "leftarrow" => VK_LEFT,
            "right" or "rightarrow" => VK_RIGHT,
            "home" => VK_HOME,
            "end" => VK_END,
            "pageup" => VK_PRIOR,
            "pagedown" => VK_NEXT,

            // Function keys
            "f1" => VK_F1,
            "f2" => (ushort)(VK_F1 + 1),
            "f3" => (ushort)(VK_F1 + 2),
            "f4" => (ushort)(VK_F1 + 3),
            "f5" => (ushort)(VK_F1 + 4),
            "f6" => (ushort)(VK_F1 + 5),
            "f7" => (ushort)(VK_F1 + 6),
            "f8" => (ushort)(VK_F1 + 7),
            "f9" => (ushort)(VK_F1 + 8),
            "f10" => (ushort)(VK_F1 + 9),
            "f11" => (ushort)(VK_F1 + 10),
            "f12" => (ushort)(VK_F1 + 11),

            // Single character — use virtual key code for A-Z, 0-9
            _ when key.Length == 1 => CharToVK(key[0]),

            _ => throw new BridgeException($"Unknown key: {key}"),
        };
    }

    private static ushort CharToVK(char c)
    {
        c = char.ToUpperInvariant(c);
        if (c >= 'A' && c <= 'Z') return (ushort)c; // VK_A..VK_Z = 0x41..0x5A = 'A'..'Z'
        if (c >= '0' && c <= '9') return (ushort)c; // VK_0..VK_9 = 0x30..0x39 = '0'..'9'
        return c switch
        {
            '-' => 0xBD, // VK_OEM_MINUS
            '=' => 0xBB, // VK_OEM_PLUS
            '[' => 0xDB, // VK_OEM_4
            ']' => 0xDD, // VK_OEM_6
            '\\' => 0xDC, // VK_OEM_5
            ';' => 0xBA, // VK_OEM_1
            '\'' => 0xDE, // VK_OEM_7
            ',' => 0xBC, // VK_OEM_COMMA
            '.' => 0xBE, // VK_OEM_PERIOD
            '/' => 0xBF, // VK_OEM_2
            '`' => 0xC0, // VK_OEM_3
            _ => 0,
        };
    }

    private static bool IsModifier(ushort vk) =>
        vk == VK_SHIFT || vk == VK_CONTROL || vk == VK_MENU || vk == VK_LWIN;
}

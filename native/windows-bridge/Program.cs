using System.Text.Json;
using System.Text.Json.Nodes;

namespace WindowsBridge;

/// <summary>
/// JSON-RPC over stdio bridge for Windows native APIs.
/// Reads JSON requests from stdin (one per line), dispatches to the appropriate bridge,
/// and writes JSON responses to stdout (one per line).
/// Mirrors the protocol of the macOS Swift bridge exactly.
/// </summary>
class Program
{
    private static readonly AppManagement _appManagement = new();
    private static readonly UIAutomationBridge _uiAutomation = new();
    private static readonly InputBridge _input = new();
    private static readonly ScreenCapture _screenCapture = new();

    private static readonly object _outputLock = new();
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
    };

    static void Main(string[] args)
    {
        Console.InputEncoding = System.Text.Encoding.UTF8;
        Console.OutputEncoding = System.Text.Encoding.UTF8;

        string? line;
        while ((line = Console.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;

            try
            {
                var request = JsonSerializer.Deserialize<JsonRpcRequest>(line, _jsonOptions);
                if (request == null)
                {
                    WriteError(0, -32700, "Parse error: null request");
                    continue;
                }

                try
                {
                    var result = Dispatch(request.Method, request.Params);
                    WriteResult(request.Id, result);
                }
                catch (BridgeException ex)
                {
                    WriteError(request.Id, -1, ex.Message);
                }
                catch (Exception ex)
                {
                    WriteError(request.Id, -1, ex.Message);
                }
            }
            catch (Exception ex)
            {
                WriteError(0, -32700, $"Parse error: {ex.Message}");
            }
        }
    }

    private static object Dispatch(string method, JsonObject? p)
    {
        return method switch
        {
            // Lifecycle
            "ping" => new Dictionary<string, object>
            {
                ["pong"] = true,
                ["pid"] = Environment.ProcessId,
                ["accessible"] = true, // UI Automation doesn't need special permissions on Windows
            },
            "check_permissions" => new Dictionary<string, object>
            {
                ["trusted"] = true, // No special permissions needed on Windows for UIA
            },

            // App Management
            "app.launch" => _appManagement.LaunchApp(RequiredParam<string>(p, "bundleId")),
            "app.focus" => _appManagement.FocusApp(RequiredParam<string>(p, "bundleId")),
            "app.list" => _appManagement.ListRunningApps(),
            "app.windows" => _appManagement.ListWindows(),
            "app.frontmost" => _appManagement.FrontmostApp(),

            // UI Automation (Accessibility equivalent)
            "ax.findElement" => _uiAutomation.FindElement(
                RequiredParam<int>(p, "pid"),
                Param<string>(p, "role"),
                Param<string>(p, "title"),
                Param<string>(p, "value"),
                Param<string>(p, "identifier"),
                Param<bool>(p, "exact") ?? true),
            "ax.getElementTree" => _uiAutomation.GetElementTree(
                RequiredParam<int>(p, "pid"),
                Param<int>(p, "maxDepth") ?? 5),
            "ax.performAction" => _uiAutomation.PerformAction(
                RequiredParam<int>(p, "pid"),
                RequiredParam<int[]>(p, "elementPath"),
                Param<string>(p, "action") ?? "AXPress"),
            "ax.setElementValue" => _uiAutomation.SetElementValue(
                RequiredParam<int>(p, "pid"),
                RequiredParam<int[]>(p, "elementPath"),
                RequiredParam<string>(p, "value")),
            "ax.getElementValue" => _uiAutomation.GetElementValue(
                RequiredParam<int>(p, "pid"),
                RequiredParam<int[]>(p, "elementPath")),
            "ax.menuClick" => _uiAutomation.MenuClick(
                RequiredParam<int>(p, "pid"),
                RequiredParam<string[]>(p, "menuPath")),

            // Observer (stub — Windows UIA events could be added later)
            "observer.start" => new Dictionary<string, object>
            {
                ["ok"] = true,
                ["stub"] = true,
                ["message"] = "UI Automation event observation not yet implemented on Windows",
            },
            "observer.stop" => new Dictionary<string, object>
            {
                ["ok"] = true,
                ["stub"] = true,
                ["message"] = "UI Automation event observation not yet implemented on Windows",
            },

            // Input (CoreGraphics equivalent)
            "cg.mouseClick" => _input.MouseClick(
                RequiredParam<double>(p, "x"),
                RequiredParam<double>(p, "y"),
                Param<string>(p, "button") ?? "left",
                Param<int>(p, "clickCount") ?? 1),
            "cg.mouseMove" => _input.MouseMove(
                RequiredParam<double>(p, "x"),
                RequiredParam<double>(p, "y")),
            "cg.mouseDrag" => _input.MouseDrag(
                RequiredParam<double>(p, "fromX"),
                RequiredParam<double>(p, "fromY"),
                RequiredParam<double>(p, "toX"),
                RequiredParam<double>(p, "toY")),
            "cg.mouseFlick" => _input.MouseDrag( // Map flick to fast drag on Windows
                RequiredParam<double>(p, "fromX"),
                RequiredParam<double>(p, "fromY"),
                RequiredParam<double>(p, "toX"),
                RequiredParam<double>(p, "toY")),
            "cg.keyCombo" => _input.KeyCombo(RequiredParam<string[]>(p, "keys")),
            "cg.typeText" => _input.TypeText(RequiredParam<string>(p, "text")),
            "cg.scroll" => _input.Scroll(
                RequiredParam<double>(p, "x"),
                RequiredParam<double>(p, "y"),
                Param<int>(p, "deltaX") ?? 0,
                Param<int>(p, "deltaY") ?? 0),
            "cg.captureScreen" => _screenCapture.CaptureScreen(
                Param<Dictionary<string, double>>(p, "region")),
            "cg.captureWindow" => _screenCapture.CaptureWindow(
                RequiredParam<int>(p, "windowId")),
            "cg.captureWindowBuffer" => _screenCapture.CaptureWindowBuffer(
                RequiredParam<int>(p, "windowId")),

            // Vision (OCR)
            "vision.findText" => _screenCapture.FindText(
                RequiredParam<string>(p, "imagePath"),
                Param<string>(p, "searchText")),
            "vision.ocr" => _screenCapture.Ocr(
                RequiredParam<string>(p, "imagePath")),
            "vision.ocrRegion" => _screenCapture.OcrRegion(
                RequiredParam<int>(p, "windowId"),
                RequiredParam<Dictionary<string, double>>(p, "region")),

            _ => throw new BridgeException($"Unknown method: {method}"),
        };
    }

    // Parameter helpers (mirror Swift's param/requiredParam)
    private static T? Param<T>(JsonObject? p, string key)
    {
        if (p == null || !p.ContainsKey(key) || p[key] == null) return default;

        var node = p[key]!;

        // Handle numeric coercion
        if (typeof(T) == typeof(double) && node is JsonValue jv)
        {
            if (jv.TryGetValue<double>(out var d)) return (T)(object)d;
            if (jv.TryGetValue<int>(out var i)) return (T)(object)(double)i;
            if (jv.TryGetValue<long>(out var l)) return (T)(object)(double)l;
        }
        if (typeof(T) == typeof(int) && node is JsonValue jv2)
        {
            if (jv2.TryGetValue<int>(out var i)) return (T)(object)i;
            if (jv2.TryGetValue<double>(out var d)) return (T)(object)(int)d;
            if (jv2.TryGetValue<long>(out var l)) return (T)(object)(int)l;
        }

        try
        {
            return node.Deserialize<T>(_jsonOptions);
        }
        catch
        {
            return default;
        }
    }

    private static T RequiredParam<T>(JsonObject? p, string key)
    {
        var value = Param<T>(p, key);
        if (value == null)
            throw new BridgeException($"Missing required parameter: {key}");
        return value;
    }

    // Output helpers
    private static void WriteResult(int id, object result)
    {
        var response = new Dictionary<string, object?>
        {
            ["id"] = id,
            ["result"] = result,
            ["error"] = null,
        };
        WriteLine(response);
    }

    private static void WriteError(int id, int code, string message)
    {
        var response = new Dictionary<string, object?>
        {
            ["id"] = id,
            ["result"] = null,
            ["error"] = new Dictionary<string, object> { ["code"] = code, ["message"] = message },
        };
        WriteLine(response);
    }

    public static void WriteEvent(Dictionary<string, object> eventData)
    {
        var wrapped = new Dictionary<string, object>
        {
            ["id"] = 0,
            ["event"] = eventData,
        };
        WriteLine(wrapped);
    }

    private static void WriteLine(object obj)
    {
        var json = JsonSerializer.Serialize(obj, _jsonOptions);
        lock (_outputLock)
        {
            Console.WriteLine(json);
            Console.Out.Flush();
        }
    }
}

// JSON-RPC types
class JsonRpcRequest
{
    public int Id { get; set; }
    public string Method { get; set; } = "";
    public JsonObject? Params { get; set; }
}

class BridgeException : Exception
{
    public BridgeException(string message) : base(message) { }
}

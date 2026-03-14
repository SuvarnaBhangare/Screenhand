using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace WindowsBridge;

/// <summary>
/// Screenshot capture and OCR.
/// Equivalent to macOS CoreGraphicsBridge (capture) + VisionBridge (OCR).
/// Uses GDI+ for screenshots and Windows.Media.Ocr for text recognition.
/// </summary>
class ScreenCapture
{
    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    private static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);

    [DllImport("user32.dll")]
    private static extern IntPtr GetDesktopWindow();

    [DllImport("user32.dll")]
    private static extern IntPtr GetWindowDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateCompatibleDC(IntPtr hdc);

    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int nWidth, int nHeight);

    [DllImport("gdi32.dll")]
    private static extern IntPtr SelectObject(IntPtr hdc, IntPtr hgdiobj);

    [DllImport("gdi32.dll")]
    private static extern bool BitBlt(IntPtr hdcDest, int xDest, int yDest, int wDest, int hDest,
        IntPtr hdcSrc, int xSrc, int ySrc, uint rop);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteDC(IntPtr hdc);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr hObject);

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left, Top, Right, Bottom;
    }

    private const int SM_CXSCREEN = 0;
    private const int SM_CYSCREEN = 1;
    private const int SM_XVIRTUALSCREEN = 76;
    private const int SM_YVIRTUALSCREEN = 77;
    private const int SM_CXVIRTUALSCREEN = 78;
    private const int SM_CYVIRTUALSCREEN = 79;
    private const uint SRCCOPY = 0x00CC0020;
    private const uint PW_RENDERFULLCONTENT = 0x00000002;

    private static readonly string _tempDir = Path.Combine(Path.GetTempPath(), "screenhand");

    static ScreenCapture()
    {
        Directory.CreateDirectory(_tempDir);
    }

    /// <summary>
    /// Capture the full screen or a region.
    /// </summary>
    public Dictionary<string, object> CaptureScreen(Dictionary<string, double>? region)
    {
        int x, y, width, height;

        if (region != null)
        {
            x = (int)region.GetValueOrDefault("x", 0);
            y = (int)region.GetValueOrDefault("y", 0);
            width = (int)region.GetValueOrDefault("width", GetSystemMetrics(SM_CXSCREEN));
            height = (int)region.GetValueOrDefault("height", GetSystemMetrics(SM_CYSCREEN));
        }
        else
        {
            // Capture virtual screen (all monitors)
            x = GetSystemMetrics(SM_XVIRTUALSCREEN);
            y = GetSystemMetrics(SM_YVIRTUALSCREEN);
            width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
            height = GetSystemMetrics(SM_CYVIRTUALSCREEN);

            // Fallback to primary monitor
            if (width == 0 || height == 0)
            {
                x = 0;
                y = 0;
                width = GetSystemMetrics(SM_CXSCREEN);
                height = GetSystemMetrics(SM_CYSCREEN);
            }
        }

        using var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.CopyFromScreen(x, y, 0, 0, new Size(width, height), CopyPixelOperation.SourceCopy);

        var filePath = Path.Combine(_tempDir, $"screen_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.png");
        bitmap.Save(filePath, ImageFormat.Png);

        return new Dictionary<string, object>
        {
            ["path"] = filePath,
            ["width"] = width,
            ["height"] = height,
        };
    }

    /// <summary>
    /// Capture a specific window by its window handle (passed as windowId).
    /// </summary>
    public Dictionary<string, object> CaptureWindow(int windowId)
    {
        var hWnd = new IntPtr(windowId);
        GetWindowRect(hWnd, out RECT rect);

        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;

        if (width <= 0 || height <= 0)
            throw new BridgeException($"Window {windowId} has invalid dimensions");

        using var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        using var graphics = Graphics.FromImage(bitmap);

        // Try PrintWindow first (works for off-screen windows)
        var hdc = graphics.GetHdc();
        bool success = PrintWindow(hWnd, hdc, PW_RENDERFULLCONTENT);
        graphics.ReleaseHdc(hdc);

        if (!success)
        {
            // Fallback to screen capture of the window area
            graphics.CopyFromScreen(rect.Left, rect.Top, 0, 0,
                new Size(width, height), CopyPixelOperation.SourceCopy);
        }

        var filePath = Path.Combine(_tempDir, $"window_{windowId}_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.png");
        bitmap.Save(filePath, ImageFormat.Png);

        return new Dictionary<string, object>
        {
            ["path"] = filePath,
            ["width"] = width,
            ["height"] = height,
        };
    }

    /// <summary>
    /// Capture a specific window in-memory, return base64 PNG (no disk I/O).
    /// Equivalent to macOS captureWindowBuffer.
    /// </summary>
    public Dictionary<string, object> CaptureWindowBuffer(int windowId)
    {
        var hWnd = new IntPtr(windowId);
        GetWindowRect(hWnd, out RECT rect);

        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;

        if (width <= 0 || height <= 0)
            throw new BridgeException($"Window {windowId} has invalid dimensions");

        using var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        using var graphics = Graphics.FromImage(bitmap);

        var hdc = graphics.GetHdc();
        bool success = PrintWindow(hWnd, hdc, PW_RENDERFULLCONTENT);
        graphics.ReleaseHdc(hdc);

        if (!success)
        {
            graphics.CopyFromScreen(rect.Left, rect.Top, 0, 0,
                new Size(width, height), CopyPixelOperation.SourceCopy);
        }

        using var ms = new MemoryStream();
        bitmap.Save(ms, ImageFormat.Png);
        var base64 = Convert.ToBase64String(ms.ToArray());

        return new Dictionary<string, object>
        {
            ["base64"] = base64,
            ["width"] = width,
            ["height"] = height,
        };
    }

    /// <summary>
    /// OCR a specific region of a window. Captures window, crops to ROI, runs OCR,
    /// then translates bounds back to window coordinates.
    /// Equivalent to macOS vision.ocrRegion.
    /// </summary>
    public Dictionary<string, object> OcrRegion(int windowId, Dictionary<string, double> region)
    {
        var hWnd = new IntPtr(windowId);
        GetWindowRect(hWnd, out RECT rect);

        int winWidth = rect.Right - rect.Left;
        int winHeight = rect.Bottom - rect.Top;

        if (winWidth <= 0 || winHeight <= 0)
            throw new BridgeException($"Window {windowId} has invalid dimensions");

        int roiX = (int)region.GetValueOrDefault("x", 0);
        int roiY = (int)region.GetValueOrDefault("y", 0);
        int roiW = (int)region.GetValueOrDefault("width", winWidth);
        int roiH = (int)region.GetValueOrDefault("height", winHeight);

        // Clamp ROI to window bounds
        roiX = Math.Max(0, Math.Min(roiX, winWidth));
        roiY = Math.Max(0, Math.Min(roiY, winHeight));
        roiW = Math.Min(roiW, winWidth - roiX);
        roiH = Math.Min(roiH, winHeight - roiY);

        if (roiW <= 0 || roiH <= 0)
            throw new BridgeException("ROI has zero or negative area after clamping");

        // Capture full window
        using var fullBitmap = new Bitmap(winWidth, winHeight, PixelFormat.Format32bppArgb);
        using (var graphics = Graphics.FromImage(fullBitmap))
        {
            var hdc = graphics.GetHdc();
            bool success = PrintWindow(hWnd, hdc, PW_RENDERFULLCONTENT);
            graphics.ReleaseHdc(hdc);

            if (!success)
            {
                graphics.CopyFromScreen(rect.Left, rect.Top, 0, 0,
                    new Size(winWidth, winHeight), CopyPixelOperation.SourceCopy);
            }
        }

        // Crop to ROI
        using var cropped = fullBitmap.Clone(
            new Rectangle(roiX, roiY, roiW, roiH), fullBitmap.PixelFormat);

        // Save cropped to temp file for OCR
        var tempPath = Path.Combine(_tempDir, $"ocr_region_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.png");
        cropped.Save(tempPath, ImageFormat.Png);

        try
        {
            var ocrResult = Ocr(tempPath);

            // Translate bounds back to window coordinates
            if (ocrResult["regions"] is List<object> regions)
            {
                foreach (var regionObj in regions)
                {
                    if (regionObj is Dictionary<string, object> entry &&
                        entry["bounds"] is Dictionary<string, object> bounds)
                    {
                        bounds["x"] = (double)bounds["x"] + roiX;
                        bounds["y"] = (double)bounds["y"] + roiY;
                    }
                }
            }

            ocrResult["roiX"] = roiX;
            ocrResult["roiY"] = roiY;
            ocrResult["roiWidth"] = roiW;
            ocrResult["roiHeight"] = roiH;

            return ocrResult;
        }
        finally
        {
            try { File.Delete(tempPath); } catch { /* best-effort cleanup */ }
        }
    }

    /// <summary>
    /// OCR an image file. Uses Windows.Media.Ocr when available, falls back to basic implementation.
    /// </summary>
    public Dictionary<string, object> Ocr(string imagePath)
    {
        if (!File.Exists(imagePath))
            throw new BridgeException($"Image file not found: {imagePath}");

        try
        {
            return OcrWithWindowsMediaOcr(imagePath);
        }
        catch
        {
            // Fallback: return empty result with a message
            return new Dictionary<string, object>
            {
                ["text"] = "",
                ["regions"] = new List<object>(),
                ["error"] = "Windows.Media.Ocr not available. Install Windows 10 1809+ for built-in OCR.",
            };
        }
    }

    /// <summary>
    /// Find text in an image using OCR.
    /// </summary>
    public Dictionary<string, object> FindText(string imagePath, string? searchText)
    {
        var ocrResult = Ocr(imagePath);

        if (string.IsNullOrEmpty(searchText))
            return ocrResult;

        var regions = ocrResult["regions"] as List<object> ?? new List<object>();
        var matches = regions
            .Cast<Dictionary<string, object>>()
            .Where(r => r.ContainsKey("text") &&
                       r["text"].ToString()!.Contains(searchText, StringComparison.OrdinalIgnoreCase))
            .ToList();

        return new Dictionary<string, object>
        {
            ["text"] = ocrResult["text"],
            ["matches"] = matches,
            ["matchCount"] = matches.Count,
        };
    }

    /// <summary>
    /// OCR using Windows.Media.Ocr (available on Windows 10 1809+).
    /// Uses dynamic loading to avoid compile-time dependency on WinRT.
    /// </summary>
    private Dictionary<string, object> OcrWithWindowsMediaOcr(string imagePath)
    {
        // Use PowerShell to invoke Windows.Media.Ocr
        // This avoids WinRT interop complexity while still using the built-in OCR engine
        var script = $@"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Foundation.UniversalApiContract, ContentType = WindowsRuntime]

function Await($WinRtTask, $ResultType) {{
    $asTask = $WinRtTask.GetType().GetMethod('AsTask', [Type[]]@())
    if ($asTask -eq $null) {{
        $asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {{ $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod }} | Select-Object -First 1
        $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
        $task = $asTask.Invoke($null, @($WinRtTask))
    }} else {{
        $task = $asTask.Invoke($WinRtTask, @())
    }}
    $task.Wait()
    return $task.Result
}}

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync('{imagePath.Replace("'", "''")}')) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

$output = @{{
    text = $result.Text
    regions = @()
}}

foreach ($line in $result.Lines) {{
    foreach ($word in $line.Words) {{
        $output.regions += @{{
            text = $word.Text
            bounds = @{{
                x = $word.BoundingRect.X
                y = $word.BoundingRect.Y
                width = $word.BoundingRect.Width
                height = $word.BoundingRect.Height
            }}
        }}
    }}
}}

$output | ConvertTo-Json -Depth 5
";

        try
        {
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -NonInteractive -Command -",
                UseShellExecute = false,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };

            using var process = System.Diagnostics.Process.Start(psi)!;
            process.StandardInput.Write(script);
            process.StandardInput.Close();

            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit(15000);

            if (process.ExitCode != 0)
            {
                var stderr = process.StandardError.ReadToEnd();
                throw new Exception($"PowerShell OCR failed: {stderr}");
            }

            // Parse the JSON output
            var jsonDoc = System.Text.Json.JsonDocument.Parse(output);
            var root = jsonDoc.RootElement;

            var text = root.GetProperty("text").GetString() ?? "";
            var regions = new List<object>();

            if (root.TryGetProperty("regions", out var regionsElement))
            {
                foreach (var region in regionsElement.EnumerateArray())
                {
                    var bounds = region.GetProperty("bounds");
                    regions.Add(new Dictionary<string, object>
                    {
                        ["text"] = region.GetProperty("text").GetString() ?? "",
                        ["bounds"] = new Dictionary<string, object>
                        {
                            ["x"] = bounds.GetProperty("x").GetDouble(),
                            ["y"] = bounds.GetProperty("y").GetDouble(),
                            ["width"] = bounds.GetProperty("width").GetDouble(),
                            ["height"] = bounds.GetProperty("height").GetDouble(),
                        },
                    });
                }
            }

            return new Dictionary<string, object>
            {
                ["text"] = text,
                ["regions"] = regions,
            };
        }
        catch (Exception ex)
        {
            throw new BridgeException($"OCR failed: {ex.Message}");
        }
    }
}

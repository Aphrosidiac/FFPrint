# Real OS left-click on an element of the installed FF Print window (by CSS selector), then reads
# back app state over MCP. Catches clicks swallowed by the window's drag region, which synthetic
# (Playwright) clicks never hit.
param([string]$Selector = '.top .tb[title="Workspace"]', [string]$Before = "app.page='filaments'", [string]$Read = 'app.page')
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class M2 {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  public struct POINT { public int X, Y; }
}
"@
$cfg = Get-Content "$env:APPDATA\FF Print\automation.json" -Raw | ConvertFrom-Json
function Call($name, $argsObj) {
  $body = @{ jsonrpc = '2.0'; id = 1; method = 'tools/call'; params = @{ name = $name; arguments = $argsObj } } | ConvertTo-Json -Depth 6 -Compress
  $r = Invoke-RestMethod -Uri "http://127.0.0.1:$($cfg.port)/mcp" -Method Post -Body $body -ContentType 'application/json' -Headers @{ Authorization = "Bearer $($cfg.token)"; Accept = 'application/json, text/event-stream' }
  return $r.result.content[0].text
}
$proc = Get-Process FFPrint | Where-Object MainWindowTitle | Select-Object -First 1
[M2]::ShowWindow($proc.MainWindowHandle, 3) | Out-Null
[M2]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 300
Call 'ui_eval' @{ code = "with (ff) { $Before }; return true" } | Out-Null
Start-Sleep -Milliseconds 300
$rect = Call 'ui_eval' @{ code = "const r = document.querySelector('$Selector').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), dpr: window.devicePixelRatio }" } | ConvertFrom-Json
$pt = New-Object M2+POINT; $pt.X = [int]($rect.x * $rect.dpr); $pt.Y = [int]($rect.y * $rect.dpr)
[M2]::ClientToScreen($proc.MainWindowHandle, [ref]$pt) | Out-Null
[M2]::SetCursorPos($pt.X, $pt.Y); Start-Sleep -Milliseconds 150
[M2]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 60
[M2]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 400
$after = Call 'ui_eval' @{ code = "with (ff) { return $Read }" }
"clicked $Selector at screen $($pt.X),$($pt.Y) -> $Read = $after"

# Real OS mouse input on the installed FF Print window: a right-drag and a left-drag over the plate,
# reading the camera through the app's automation server before and after each.
param([string]$Button = 'right')
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class M {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$cfg = Get-Content "$env:APPDATA\FF Print\automation.json" -Raw | ConvertFrom-Json
function Call($name, $argsObj) {
  $body = @{ jsonrpc = '2.0'; id = 1; method = 'tools/call'; params = @{ name = $name; arguments = $argsObj } } | ConvertTo-Json -Depth 6 -Compress
  $r = Invoke-RestMethod -Uri "http://127.0.0.1:$($cfg.port)/mcp" -Method Post -Body $body -ContentType 'application/json' -Headers @{ Authorization = "Bearer $($cfg.token)"; Accept = 'application/json, text/event-stream' }
  return $r.result.content[0].text
}
$cam = { Call 'ui_eval' @{ code = 'const c = window.__ffPrepare.camera(); return { p: c.position.map(Math.round), t: c.target.map(Math.round) }' } }
$proc = Get-Process FFPrint | Where-Object MainWindowTitle | Select-Object -First 1
[M]::ShowWindow($proc.MainWindowHandle, 3) | Out-Null  # SW_MAXIMIZE: keep his window maximized
[M]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 400
$r = New-Object M+RECT; [M]::GetWindowRect($proc.MainWindowHandle, [ref]$r) | Out-Null
# a point over the plate: middle of the window, a bit low
$x = [int](($r.Left + $r.Right) / 2 - 120); $y = [int]($r.Top + ($r.Bottom - $r.Top) * 0.62)
$flags = @{ right = @(0x0008, 0x0010); left = @(0x0002, 0x0004); middle = @(0x0020, 0x0040) }[$Button]
Call 'ui_eval' @{ code = 'window.__evlog = []; const c = document.querySelector(".vp-canvas"); for (const t of ["pointerdown","pointerup","contextmenu"]) c.addEventListener(t, (e) => window.__evlog.push(t + ":" + e.button + "/" + e.buttons), true); let n = 0; c.addEventListener("pointermove", (e) => { if (e.buttons && n++ < 2) window.__evlog.push("move:" + e.button + "/" + e.buttons) }, true); return true' } | Out-Null
$before = & $cam
[M]::SetCursorPos($x, $y); Start-Sleep -Milliseconds 120
[M]::mouse_event($flags[0], 0, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 60
for ($i = 1; $i -le 20; $i++) { [M]::SetCursorPos($x + $i * 8, $y + $i * 3); Start-Sleep -Milliseconds 15 }
[M]::mouse_event($flags[1], 0, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 300
$after = & $cam
Start-Sleep -Milliseconds 700
$later = & $cam
$log = Call 'ui_eval' @{ code = 'return window.__evlog' }
$menu = Call 'ui_eval' @{ code = 'return document.querySelectorAll(".ctx").length' }
"$Button-drag  before: $before"
"$Button-drag  after:  $after"
"$Button-drag  0.7s later: $later"
"events: $log"
"context menu open after drag: $menu"

# Real clicks on the preview legend in the INSTALLED app: open it from the dot strip, fold it from
# the header. Slices a test cube first and removes it from the Past models list afterwards.
$cfg = Get-Content "$env:APPDATA\FF Print\automation.json" -Raw | ConvertFrom-Json
function Call($name, $argsObj) {
  $body = @{ jsonrpc = '2.0'; id = 1; method = 'tools/call'; params = @{ name = $name; arguments = $argsObj } } | ConvertTo-Json -Depth 6 -Compress
  $r = Invoke-RestMethod -Uri "http://127.0.0.1:$($cfg.port)/mcp" -Method Post -Body $body -ContentType 'application/json' -Headers @{ Authorization = "Bearer $($cfg.token)"; Accept = 'application/json, text/event-stream' } -TimeoutSec 300
  return $r.result.content[0].text
}
$cube = (Resolve-Path "$PSScriptRoot\..\tests\fixtures\cube20.stl").Path
Call 'clear_bed' @{} | Out-Null
Call 'open_models' @{ paths = @($cube) } | Out-Null
Call 'slice' @{} | Out-Null
Call 'get_preview_info' @{} | Out-Null
Start-Sleep -Milliseconds 500
# make sure we start folded
Call 'ui_eval' @{ code = "document.querySelector('.legend .head')?.click(); return true" } | Out-Null
Start-Sleep -Milliseconds 300
$state = "({ list: !!document.querySelector('.legend .head'), chip: !!document.querySelector('.chip') })"
& "$PSScriptRoot\real-click-check.ps1" -Selector '.chip' -Before "0" -Read $state | Select-String -NotMatch '^True$'
& "$PSScriptRoot\real-click-check.ps1" -Selector '.legend .head .section-title' -Before "0" -Read $state | Select-String -NotMatch '^True$'
Call 'clear_bed' @{} | Out-Null
Call 'ui_eval' @{ code = "await window.ffprint.invoke('hidePastModel', [{ kind: 'file', path: $(ConvertTo-Json $cube) }]); return true" } | Out-Null
"cleaned up"

try {
  $lines = Get-Content 'E:\ClaudeWorking\Calendar Site\.env'
  $url = ($lines | Where-Object { $_ -match '^HA_URL=' }) -replace '^HA_URL=',''
  $tok = ($lines | Where-Object { $_ -match '^HA_TOKEN=' }) -replace '^HA_TOKEN=',''
  $h = @{Authorization="Bearer $tok"; 'Content-Type'='application/json'}
  $b = '{"entity_id":"todo.home","item":"Do 2025 Taxes"}'
  $r = Invoke-RestMethod -Uri "$url/api/services/todo/add_item" -Method Post -Headers $h -Body $b
  "SUCCESS: $r" | Out-File 'E:\ClaudeWorking\Calendar Site\ha_result.txt'
} catch {
  "ERROR: $_" | Out-File 'E:\ClaudeWorking\Calendar Site\ha_result.txt'
}
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $root 'server'
$logDir = Join-Path $root 'logs'
$logFile = Join-Path $logDir 'oct-helper.log'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Log {
  param([string]$Message)
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -LiteralPath $logFile -Value "[$stamp] $Message"
}

try {
  $listener = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    Write-Log 'OCT helper skipped: port 3001 is already listening.'
    exit 0
  }

  $npm = Get-Command npm.cmd -ErrorAction Stop
  Write-Log "Starting OCT helper from $serverDir."
  Start-Process `
    -FilePath $npm.Source `
    -ArgumentList @('run', 'dev', '--workspace=server') `
    -WorkingDirectory $root `
    -WindowStyle Hidden | Out-Null

  Write-Log 'OCT helper launched.'
}
catch {
  Write-Log "OCT helper failed: $($_.Exception.Message)"
  throw
}

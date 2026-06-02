$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$hostName = if ($env:HOST) { $env:HOST } else { "127.0.0.1" }
$port = if ($env:PORT) { $env:PORT } else { "5173" }
$url = "http://${hostName}:${port}/"

$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$nodePath = if (Test-Path $bundledNode) {
  $bundledNode
} else {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) { $node.Source } else { $null }
}

if (-not $nodePath) {
  Write-Error "No se encontro Node.js en el PATH. Instala Node.js o ejecuta server.js con un runtime de Node disponible."
  exit 1
}

try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
  if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
    Write-Host "La web ya esta activa en $url"
    Start-Process $url
    exit 0
  }
} catch {
  # Si no hay respuesta, arrancamos el servidor abajo.
}

Write-Host "Arrancando servidor Node.js en $url"
Start-Process $url
Write-Host "Servidor activo. Pulsa Ctrl+C para detenerlo."
& $nodePath (Join-Path $PSScriptRoot "server.js")

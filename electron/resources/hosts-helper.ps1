param(
  [Parameter(Mandatory = $true)]
  [string]$RequestBase64
)

$ErrorActionPreference = 'Stop'

function Get-FileSha256 {
  param([Parameter(Mandatory = $true)][string]$LiteralPath)

  return (Get-FileHash -LiteralPath $LiteralPath -Algorithm SHA256).Hash.ToUpperInvariant()
}

try {
  $requestJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($RequestBase64))
  $request = $requestJson | ConvertFrom-Json

  if ($request.operation -eq 'flush-dns') {
    $ipconfigPath = Join-Path $env:SystemRoot 'System32\ipconfig.exe'
    & $ipconfigPath /flushdns | Out-Null
    if ($LASTEXITCODE -ne 0) {
      exit 20
    }
    exit 0
  }

  if ($request.operation -ne 'write-hosts') {
    exit 10
  }

  $expectedHostsPath = [IO.Path]::GetFullPath((Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'))
  $requestedHostsPath = [IO.Path]::GetFullPath([string]$request.hostsPath)
  if (-not [String]::Equals($expectedHostsPath, $requestedHostsPath, [StringComparison]::OrdinalIgnoreCase)) {
    exit 10
  }

  $payloadPath = [IO.Path]::GetFullPath([string]$request.payloadPath)
  if (-not (Test-Path -LiteralPath $payloadPath -PathType Leaf)) {
    exit 10
  }

  if ((Get-FileSha256 -LiteralPath $expectedHostsPath) -ne [string]$request.expectedSourceHash) {
    exit 11
  }
  if ((Get-FileSha256 -LiteralPath $payloadPath) -ne [string]$request.expectedPayloadHash) {
    exit 12
  }

  [IO.File]::Copy($payloadPath, $expectedHostsPath, $true)
  if ((Get-FileSha256 -LiteralPath $expectedHostsPath) -ne [string]$request.expectedPayloadHash) {
    exit 12
  }

  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 20
}

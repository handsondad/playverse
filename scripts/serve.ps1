param(
  [int]$Port = 8123,
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$listener = [System.Net.HttpListener]::new()
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Error "无法启动本地服务器：$($_.Exception.Message)"
  exit 1
}

Write-Host "Static server running at $prefix"
Write-Host "Serving root: $Root"

$contentTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".gif" = "image/gif"
  ".webp" = "image/webp"
  ".svg" = "image/svg+xml"
  ".ico" = "image/x-icon"
  ".webmanifest" = "application/manifest+json; charset=utf-8"
}
$rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar

function Get-ContentType([string]$path) {
  $extension = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
  if ($contentTypes.ContainsKey($extension)) {
    return $contentTypes[$extension]
  }
  return "application/octet-stream"
}

function Resolve-RequestPath([string]$rawUrl) {
  $relative = [System.Uri]::UnescapeDataString(($rawUrl -split '\?')[0]).TrimStart('/')
  if ([string]::IsNullOrWhiteSpace($relative)) {
    $relative = "index.html"
  }
  $candidate = [System.IO.Path]::GetFullPath((Join-Path $Root $relative))
  # Reject "..", encoded or not, that would escape the project folder.
  if (-not $candidate.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $null
  }
  if ((Test-Path -LiteralPath $candidate) -and (Get-Item -LiteralPath $candidate).PSIsContainer) {
    $candidate = Join-Path $candidate "index.html"
  }
  return $candidate
}

while ($listener.IsListening) {
  try {
    $context = $listener.GetContext()
    $requestPath = Resolve-RequestPath $context.Request.RawUrl
    $response = $context.Response

    if (-not $requestPath -or -not (Test-Path -LiteralPath $requestPath) -or (Get-Item -LiteralPath $requestPath).PSIsContainer) {
      $response.StatusCode = 404
      $buffer = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
      $response.ContentType = "text/plain; charset=utf-8"
      $response.OutputStream.Write($buffer, 0, $buffer.Length)
      $response.Close()
      continue
    }

    $bytes = [System.IO.File]::ReadAllBytes($requestPath)
    $response.StatusCode = 200
    $response.ContentType = Get-ContentType $requestPath
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.Close()
  } catch {
    Write-Warning $_.Exception.Message
  }
}
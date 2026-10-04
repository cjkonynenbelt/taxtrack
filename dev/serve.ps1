# Tiny local static server for previewing the app (not needed on GitHub Pages).
param([int]$Port = 8097)
$root = Split-Path -Parent $PSScriptRoot
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='text/javascript; charset=utf-8';
  '.json'='application/json'; '.webmanifest'='application/manifest+json'; '.png'='image/png'; '.svg'='image/svg+xml'; '.md'='text/plain; charset=utf-8' }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '' -or $rel.EndsWith('/')) { $rel += 'index.html' }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if ($path.StartsWith($root) -and (Test-Path $path -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($path)
      $ext = [IO.Path]::GetExtension($path).ToLower()
      if ($types.ContainsKey($ext)) { $ctx.Response.ContentType = $types[$ext] }
      $ctx.Response.Headers.Add('Cache-Control', 'no-cache')
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
  } catch { Write-Host $_ } finally { $ctx.Response.Close() }
}

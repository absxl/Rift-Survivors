# Rebuild the square, transparent derivatives used by the crest component.
# Source crests stay in public/regions; output keeps their filenames under
# public/regions/normalized so regionCrest() can resolve them uniformly.
param(
  [string]$RegionDirectory = (Join-Path $PSScriptRoot "..\public\regions")
)

Add-Type -AssemblyName System.Drawing
$normalized = Join-Path $RegionDirectory "normalized"
New-Item -ItemType Directory -Force -Path $normalized | Out-Null

Get-ChildItem $RegionDirectory -Filter *.png | ForEach-Object {
  $image = [System.Drawing.Image]::FromFile($_.FullName)
  try {
    $canvas = [System.Drawing.Bitmap]::new(256, 256)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($canvas)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $scale = [Math]::Min(220 / $image.Width, 220 / $image.Height)
        $width = [int]($image.Width * $scale)
        $height = [int]($image.Height * $scale)
        $x = [int]((256 - $width) / 2)
        $y = [int]((256 - $height) / 2)
        $graphics.DrawImage($image, $x, $y, $width, $height)
        $canvas.Save((Join-Path $normalized $_.Name), [System.Drawing.Imaging.ImageFormat]::Png)
      } finally {
        $graphics.Dispose()
      }
    } finally {
      $canvas.Dispose()
    }
  } finally {
    $image.Dispose()
  }
}

Write-Output "Normalized crests written to $normalized"

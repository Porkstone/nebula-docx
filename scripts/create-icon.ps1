$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$null = New-Item -ItemType Directory -Force -Path (Join-Path $root 'build')
$bitmap = New-Object System.Drawing.Bitmap 256,256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = 'AntiAlias'
$graphics.Clear([System.Drawing.Color]::FromArgb(37,79,59))
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(224,238,200)),12
$pen.LineJoin = 'Round'
foreach ($points in @(@(58,94,128,54,198,94,128,134),@(58,128,128,168,198,128),@(58,163,128,203,198,163))) {
  $array = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
  for ($i = 0; $i -lt $points.Length; $i += 2) { $array.Add([System.Drawing.PointF]::new($points[$i],$points[$i+1])) }
  $graphics.DrawLines($pen, $array.ToArray())
}
$graphics.DrawLine($pen,58,94,128,134)
$png = Join-Path $root 'build/icon.png'
$bitmap.Save($png,[System.Drawing.Imaging.ImageFormat]::Png)
$data = [System.IO.File]::ReadAllBytes($png)
$stream = [System.IO.File]::Create((Join-Path $root 'build/icon.ico'))
$writer = New-Object System.IO.BinaryWriter $stream
$writer.Write([byte[]]@(0,0,1,0,1,0,0,0,0,0,1,0,32,0))
$writer.Write([uint32]$data.Length)
$writer.Write([uint32]22)
$writer.Write($data)
$writer.Dispose()
$pen.Dispose(); $graphics.Dispose(); $bitmap.Dispose()

param(
  [string]$ResRoot = "flutter_app\android\app\src\main\res"
)

Add-Type -AssemblyName System.Drawing

$sizes = @{
  "mipmap-mdpi" = 48
  "mipmap-hdpi" = 72
  "mipmap-xhdpi" = 96
  "mipmap-xxhdpi" = 144
  "mipmap-xxxhdpi" = 192
}

function New-Brush($hex) {
  return [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($hex))
}

function New-Pen($hex, $width) {
  $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($hex), $width)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  return $pen
}

function Add-RoundedRect($path, $rect, $radius) {
  $diameter = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
}

foreach ($entry in $sizes.GetEnumerator()) {
  $folder = Join-Path $ResRoot $entry.Key
  $size = [int]$entry.Value
  $scale = $size / 192.0
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $bgPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
  Add-RoundedRect $bgPath ([System.Drawing.RectangleF]::new(8 * $scale, 8 * $scale, 176 * $scale, 176 * $scale)) (38 * $scale)
  $graphics.FillPath((New-Brush "#f8fafc"), $bgPath)
  $graphics.DrawPath((New-Pen "#d7dee8" (3 * $scale)), $bgPath)

  $panel = [System.Drawing.Drawing2D.GraphicsPath]::new()
  Add-RoundedRect $panel ([System.Drawing.RectangleF]::new(34 * $scale, 42 * $scale, 124 * $scale, 82 * $scale)) (18 * $scale)
  $graphics.FillPath((New-Brush "#ffffff"), $panel)
  $graphics.DrawPath((New-Pen "#e2e8f0" (2 * $scale)), $panel)

  $linePen = New-Pen "#18212f" (5 * $scale)
  $points = @(
    [System.Drawing.PointF]::new(48 * $scale, 101 * $scale),
    [System.Drawing.PointF]::new(72 * $scale, 82 * $scale),
    [System.Drawing.PointF]::new(96 * $scale, 91 * $scale),
    [System.Drawing.PointF]::new(123 * $scale, 64 * $scale),
    [System.Drawing.PointF]::new(146 * $scale, 73 * $scale)
  )
  $graphics.DrawLines($linePen, $points)

  $redBrush = New-Brush "#dc2626"
  $blueBrush = New-Brush "#2563eb"
  $whiteBrush = New-Brush "#ffffff"
  $darkBrush = New-Brush "#18212f"
  $fontBall = [System.Drawing.Font]::new("Arial", 18 * $scale, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fontBrand = [System.Drawing.Font]::new("Arial", 28 * $scale, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $center = [System.Drawing.StringFormat]::new()
  $center.Alignment = [System.Drawing.StringAlignment]::Center
  $center.LineAlignment = [System.Drawing.StringAlignment]::Center

  $balls = @(
    @{ X = 42; Y = 126; C = $redBrush; T = "6" },
    @{ X = 74; Y = 126; C = $redBrush; T = "8" },
    @{ X = 106; Y = 126; C = $redBrush; T = "9" },
    @{ X = 136; Y = 126; C = $blueBrush; T = "B" }
  )
  foreach ($ball in $balls) {
    $rect = [System.Drawing.RectangleF]::new($ball.X * $scale, $ball.Y * $scale, 28 * $scale, 28 * $scale)
    $graphics.FillEllipse($ball.C, $rect)
    $graphics.DrawString($ball.T, $fontBall, $whiteBrush, $rect, $center)
  }

  $brandRect = [System.Drawing.RectangleF]::new(0, 18 * $scale, $size, 28 * $scale)
  $graphics.DrawString("SSQ", $fontBrand, $darkBrush, $brandRect, $center)

  New-Item -ItemType Directory -Force -Path $folder | Out-Null
  $out = Join-Path $folder "ic_launcher.png"
  $bitmap.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

  $fontBall.Dispose()
  $fontBrand.Dispose()
  $center.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

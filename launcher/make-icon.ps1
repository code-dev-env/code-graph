# Generates launcher\icon.ico and launcher\favicon.b64 (a node-graph icon) using System.Drawing
Add-Type -AssemblyName System.Drawing
$dir = $PSScriptRoot

function New-IconBitmap([int]$s) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'; $g.Clear([System.Drawing.Color]::Transparent)
    $r = [int]($s * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc(0, 0, $d, $d, 180, 90); $path.AddArc($s - $d - 1, 0, $d, $d, 270, 90)
    $path.AddArc($s - $d - 1, $s - $d - 1, $d, $d, 0, 90); $path.AddArc(0, $s - $d - 1, $d, $d, 90, 90); $path.CloseFigure()
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(0, 0)), ([System.Drawing.Point]::new($s, $s)), ([System.Drawing.Color]::FromArgb(255, 24, 32, 52)), ([System.Drawing.Color]::FromArgb(255, 10, 14, 24))
    $g.FillPath($bg, $path)
    # nodes: x, y (0..1), radius factor, colour
    $nodes = @(
        @(0.50, 0.50, 0.125, '#6ea8ff'),
        @(0.24, 0.27, 0.075, '#22d3ee'),
        @(0.77, 0.25, 0.085, '#f97316'),
        @(0.78, 0.74, 0.075, '#22c55e'),
        @(0.25, 0.76, 0.085, '#ec4899'),
        @(0.50, 0.14, 0.05,  '#eab308')
    )
    $edges = @(@(0, 1), @(0, 2), @(0, 3), @(0, 4), @(1, 5), @(5, 2), @(4, 1))
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(170, 150, 170, 205)), ([single][Math]::Max(1, $s * 0.025))
    foreach ($e in $edges) {
        $a = $nodes[$e[0]]; $b = $nodes[$e[1]]
        $g.DrawLine($pen, [single]($a[0] * $s), [single]($a[1] * $s), [single]($b[0] * $s), [single]($b[1] * $s))
    }
    foreach ($n in $nodes) {
        $c = [System.Drawing.ColorTranslator]::FromHtml($n[3]); $rad = $n[2] * $s
        $x = $n[0] * $s - $rad; $y = $n[1] * $s - $rad
        $g.FillEllipse((New-Object System.Drawing.SolidBrush $c), [single]$x, [single]$y, [single]($rad * 2), [single]($rad * 2))
        if ($s -ge 32) {
            $ring = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(200, 255, 255, 255), [single][Math]::Max(1, $s * 0.012))
            $g.DrawEllipse($ring, [single]$x, [single]$y, [single]($rad * 2), [single]($rad * 2))
        }
    }
    $g.Dispose(); return $bmp
}

$sizes = 16, 32, 48, 64, 128, 256
$pngs = @{}
foreach ($s in $sizes) {
    $bmp = New-IconBitmap $s; $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $pngs[$s] = $ms.ToArray(); $bmp.Dispose()
}
# ICO container with PNG-compressed images
$out = New-Object System.IO.MemoryStream; $w = New-Object System.IO.BinaryWriter $out
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
foreach ($s in $sizes) {
    $b = if ($s -ge 256) { 0 } else { $s }
    $w.Write([byte]$b); $w.Write([byte]$b); $w.Write([byte]0); $w.Write([byte]0); $w.Write([uint16]1); $w.Write([uint16]32)
    $w.Write([uint32]$pngs[$s].Length); $w.Write([uint32]$offset); $offset += $pngs[$s].Length
}
foreach ($s in $sizes) { $w.Write($pngs[$s]) }
[System.IO.File]::WriteAllBytes((Join-Path $dir 'icon.ico'), $out.ToArray())
[System.IO.File]::WriteAllText((Join-Path $dir 'favicon.b64'), [Convert]::ToBase64String($pngs[64]))
[System.IO.File]::WriteAllBytes((Join-Path $dir 'icon-preview.png'), $pngs[256])
"icon.ico " + (Get-Item (Join-Path $dir 'icon.ico')).Length + " bytes"

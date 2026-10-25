param(
    [string]$Source = "promo-assets/google-play/app-icon-512.png"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$sourcePath = (Resolve-Path $Source).Path
$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
try {
    if ($sourceImage.Width -ne 512 -or $sourceImage.Height -ne 512) {
        throw "Expected a 512 x 512 app icon at $sourcePath"
    }

    function Save-IconPng([string]$Path, [int]$Size) {
        $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
                $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $graphics.DrawImage($sourceImage, 0, 0, $Size, $Size)
            } finally { $graphics.Dispose() }
            $parent = Split-Path -Parent $Path
            if ($parent -and !(Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
            $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $bitmap.Dispose() }
    }

    Save-IconPng 'public/icon.png' 512
    Save-IconPng 'public/icon-512.png' 512
    Save-IconPng 'public/icon-192.png' 192
    Save-IconPng 'public/apple-touch-icon.png' 180

    # Update every Android splash variant. Qualified drawable-port/land assets
    # take precedence over drawable/splash.png on real devices.
    $splashTargets = @('android/app/src/main/res/drawable/splash.png') + @(
        Get-ChildItem 'android/app/src/main/res' -Directory -Filter 'drawable-*' |
            ForEach-Object { Join-Path $_.FullName 'splash.png' } |
            Where-Object { Test-Path $_ }
    )
    foreach ($splashPath in $splashTargets) {
        $previous = [System.Drawing.Image]::FromFile((Resolve-Path $splashPath).Path)
        try { $width = $previous.Width; $height = $previous.Height }
        finally { $previous.Dispose() }
        $splash = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($splash)
            try {
                $graphics.Clear([System.Drawing.Color]::White)
                $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $iconSize = [Math]::Floor([Math]::Min($width, $height) / 3)
                $graphics.DrawImage($sourceImage, [int](($width - $iconSize) / 2), [int](($height - $iconSize) / 2), $iconSize, $iconSize)
            } finally { $graphics.Dispose() }
            $splash.Save($splashPath, [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $splash.Dispose() }
    }

    $densities = @(
        @{ Name = 'mdpi'; Size = 48 },
        @{ Name = 'hdpi'; Size = 72 },
        @{ Name = 'xhdpi'; Size = 96 },
        @{ Name = 'xxhdpi'; Size = 144 },
        @{ Name = 'xxxhdpi'; Size = 192 }
    )
    foreach ($density in $densities) {
        foreach ($kind in @('ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground')) {
            Save-IconPng "android/app/src/main/res/mipmap-$($density.Name)/$kind.png" $density.Size
        }
    }

    function Get-PngBytes([int]$Size) {
        $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $stream = New-Object System.IO.MemoryStream
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
                $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $graphics.DrawImage($sourceImage, 0, 0, $Size, $Size)
            } finally { $graphics.Dispose() }
            $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
            return ,$stream.ToArray()
        } finally { $stream.Dispose(); $bitmap.Dispose() }
    }

    $sizes = @(256, 128, 64, 48, 32, 16)
    $pngs = @($sizes | ForEach-Object { Get-PngBytes $_ })
    $iconStream = New-Object System.IO.MemoryStream
    $writer = New-Object System.IO.BinaryWriter($iconStream)
    try {
        $writer.Write([UInt16]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]$sizes.Count)
        $offset = 6 + 16 * $sizes.Count
        for ($i = 0; $i -lt $sizes.Count; $i++) {
            $size = $sizes[$i]
            $png = $pngs[$i]
            $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
            $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([UInt16]1)
            $writer.Write([UInt16]32)
            $writer.Write([UInt32]$png.Length)
            $writer.Write([UInt32]$offset)
            $offset += $png.Length
        }
        foreach ($png in $pngs) { $writer.Write([byte[]]$png) }
        [System.IO.File]::WriteAllBytes('build/icon.ico', $iconStream.ToArray())
    } finally { $writer.Dispose(); $iconStream.Dispose() }
} finally { $sourceImage.Dispose() }

Write-Output 'Updated web, Android, and Windows icon rasters from the approved S monogram.'

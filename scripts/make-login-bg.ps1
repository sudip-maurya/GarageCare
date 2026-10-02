Add-Type -AssemblyName System.Drawing

$srcPath = 'D:\55851707-d459-455a-a7ea-1d62a11e5ff4.png'
$outPath = 'E:\1Projects\GarageCare\client\public\images\garage-bike.jpg'

$src = [System.Drawing.Image]::FromFile($srcPath)
$W = 1920; $H = 1080
$canvas = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

# background base: dark navy fill
$g.Clear([System.Drawing.Color]::FromArgb(255, 13, 27, 42))

# scale photo to full height
$sw = [int]($src.Width * $H / $src.Height)   # ~810
$photoX = $W - $sw                            # right-aligned

# --- LEFT FILL: blurred extension of the photo's left edge strip ---
$stripW = 60
$strip = New-Object System.Drawing.Bitmap($stripW, $src.Height)
$gs = [System.Drawing.Graphics]::FromImage($strip)
$gs.DrawImage($src, (New-Object System.Drawing.Rectangle(0,0,$stripW,$src.Height)), (New-Object System.Drawing.Rectangle(0,0,$stripW,$src.Height)), [System.Drawing.GraphicsUnit]::Pixel)
$gs.Dispose()
# tiny then back up = cheap soft blur
$tiny = New-Object System.Drawing.Bitmap(8, 12)
$gt = [System.Drawing.Graphics]::FromImage($tiny)
$gt.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gt.DrawImage($strip, 0, 0, 8, 12)
$gt.Dispose()
$strip.Dispose()
`$bigW = `$photoX + 40; `$big = New-Object System.Drawing.Bitmap(`$bigW, `$H)
$gb = [System.Drawing.Graphics]::FromImage($big)
$gb.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
`$gb.DrawImage(`$tiny, 0, 0, `$bigW, `$H)
$gb.Dispose()
`$g.DrawImage(`$big, 0, 0, `$bigW, `$H)
$big.Dispose(); $tiny.Dispose()

# --- draw the actual photo on the right ---
$dstRect = New-Object System.Drawing.Rectangle($photoX, 0, $sw, $H)
$g.DrawImage($src, $dstRect)

# --- cool cinematic tone: dark-blue color overlay across whole image ---
$cool = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point($W, $H)),
    [System.Drawing.Color]::FromArgb(90, 10, 30, 60),
    [System.Drawing.Color]::FromArgb(70, 5, 15, 35))
$g.FillRectangle($cool, 0, 0, $W, $H)
$cool.Dispose()

# --- readability gradient: very dark on left, light on right ---
$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point($W, 0)),
    [System.Drawing.Color]::FromArgb(225, 6, 14, 28),
    [System.Drawing.Color]::FromArgb(15, 6, 14, 28))
$g.FillRectangle($grad, 0, 0, $W, $H)
$grad.Dispose()

# --- extra darkening band over the far-left third ---
$grad2 = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point([int]($W*0.55), 0)),
    [System.Drawing.Color]::FromArgb(110, 4, 10, 22),
    [System.Drawing.Color]::FromArgb(0, 4, 10, 22))
$g.FillRectangle($grad2, 0, 0, [int]($W*0.55), $H)
$grad2.Dispose()

# --- subtle vignette top/bottom ---
$vig = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point(0, $H)),
    [System.Drawing.Color]::FromArgb(70, 2, 8, 18),
    [System.Drawing.Color]::FromArgb(0, 2, 8, 18))
$g.FillRectangle($vig, 0, 0, $W, [int]($H*0.3))
$vig.Dispose()
$vig2 = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, [int]($H*0.7))),
    (New-Object System.Drawing.Point(0, $H)),
    [System.Drawing.Color]::FromArgb(0, 2, 8, 18),
    [System.Drawing.Color]::FromArgb(80, 2, 8, 18))
$g.FillRectangle($vig2, 0, [int]($H*0.7), $W, [int]($H*0.3))
$vig2.Dispose()

$g.Dispose()
$src.Dispose()

# save as true JPEG
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$eps = New-Object System.Drawing.Imaging.EncoderParameters(1)
$eps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]88)
$canvas.Save($outPath, $codec, $eps)
$canvas.Dispose()
Write-Host "Saved $outPath"


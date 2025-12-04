$content = Get-Content "d:\creatosaurus-intership\scarpping\jiomart-scrapper\index.js" -Raw

# Configuration optimizations
$content = $content -replace 'maxRequestRetries = 3', 'maxRequestRetries = 2'
$content = $content -replace 'navigationTimeout = 90000', 'navigationTimeout = 30000'
$content = $content -replace 'scrollCount = 5', 'scrollCount = 3'

# Delay optimizations - be very specific with patterns
$content = $content -replace 'await delay\(2000\);', 'await delay(500);'
$content = $content -replace 'await delay\(1500\);', 'await delay(400);'
$content = $content -replace 'await delay\(1000\);', 'await delay(300);'
$content = $content -replace 'await delay\(3000\);', 'await delay(800);'
$content = $content -replace 'await delay\(800\);', 'await delay(300);'

# Timeout optimizations
$content = $content -replace 'timeout: 10000', 'timeout: 5000'

# Scrolling optimization - reduce delay in scroll loop
$content = $content -replace 'for \(let i = 0; i < iterations; i\+\+\) \{\s+await page\.evaluate\(\(\) => window\.scrollBy\(0, window\.innerHeight\)\);\s+await delay\(400\);', 'for (let i = 0; i < iterations; i++) {`r`n            await page.evaluate(() => window.scrollBy(0, window.innerHeight));`r`n            await delay(500);'

$content | Set-Content "d:\creatosaurus-intership\scarpping\jiomart-scrapper\index.js" -NoNewline
Write-Host "Optimizations applied successfully!"

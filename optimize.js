const fs = require('fs');

let content = fs.readFileSync('d:\\\\creatosaurus-intership\\\\scarpping\\\\jiomart-scrapper\\\\index.js', 'utf8');

// Configuration optimizations
content = content.replace('maxRequestRetries = 3', 'maxRequestRetries = 2');
content = content.replace('navigationTimeout = 90000', 'navigationTimeout = 30000');
content = content.replace('scrollCount = 5', 'scrollCount = 3');

// Delay optimizations - be very specific
content = content.replace(/await delay\(2000\);/g, 'await delay(500);');
content = content.replace(/await delay\(1500\);/g, 'await delay(400);');
content = content.replace(/await delay\(1000\);/g, 'await delay(300);');
content = content.replace(/await delay\(3000\);/g, 'await delay(800);');
content = content.replace(/await delay\(800\);/g, 'await delay(300);');

// Timeout optimizations
content = content.replace(/timeout: 10000/g, 'timeout: 5000');

fs.writeFileSync('d:\\\\creatosaurus-intership\\\\scarpping\\\\jiomart-scrapper\\\\index.js', content);
console.log('Optimizations applied successfully!');

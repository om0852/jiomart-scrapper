import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset } from 'crawlee';

// Initialize Actor
await Actor.init();

// ==================== INPUT CONFIGURATION ====================
const input = await Actor.getInput() ?? {};

const {
    pincode = '411001',
    searchUrls = [],
    searchQueries = [],
    maxProductsPerSearch = 100,
    proxyConfiguration = { useApifyProxy: false },
    maxRequestRetries = 3,
    navigationTimeout = 90000,
    headless = false,
    screenshotOnError = true,
    debugMode = false,
    scrollCount = 5
} = input;

// ==================== CONSTANTS ====================
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
];

// Global flag to track if location has been set
let locationSetGlobally = false;

// ==================== HELPER FUNCTIONS ====================

/**
 * Pick a random item from an array
 */
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Parse proxy URL into Playwright's proxy object
 */
function parseProxyUrl(proxyUrl) {
    try {
        const url = new URL(proxyUrl);
        const proxy = {
            server: `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`
        };
        if (url.username) proxy.username = decodeURIComponent(url.username);
        if (url.password) proxy.password = decodeURIComponent(url.password);
        return proxy;
    } catch (error) {
        console.error('Invalid proxy URL:', error.message);
        return null;
    }
}

/**
 * Delay execution
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==================== POPUP CLOSING FUNCTION ====================

/**
 * Close the location services popup that appears on JioMart
 */
async function closeLocationPopup(page, log) {
    try {
        log.info('🔔 Attempting to close location services popup...');
        
        // Check if popup exists
        const popup = page.locator('div.alcohol-popup').first();
        const popupCount = await popup.count();
        
        if (popupCount === 0) {
            log.info('ℹ️ No location popup detected');
            return true;
        }
        
        log.info('📋 Found location services popup - closing...');
        
        // Try clicking close button first
        const closeButtonSelectors = [
            'button#btn_location_close_icon',
            'button.close-privacy',
            'button.close-icon'
        ];
        
        for (const selector of closeButtonSelectors) {
            try {
                const closeBtn = page.locator(selector).first();
                if (await closeBtn.count() > 0) {
                    await closeBtn.click({ timeout: 3000 });
                    log.info(`✓ Clicked close button using: ${selector}`);
                    await delay(800);
                    
                    // Verify popup is closed
                    const stillVisible = await popup.count();
                    if (stillVisible === 0) {
                        log.info('✅ Location popup closed successfully');
                        return true;
                    }
                }
            } catch (error) {
                continue;
            }
        }
        
        // Fallback: click "Select Location Manually" button
        try {
            const selectLocBtn = page.locator('button#select_location_popup').first();
            if (await selectLocBtn.count() > 0) {
                await selectLocBtn.click({ timeout: 3000 });
                log.info('✓ Clicked "Select Location Manually" button');
                await delay(1000);
                log.info('✅ Location popup closed via manual selection');
                return true;
            }
        } catch (error) {
            log.warning(`Failed to click Select Location button: ${error.message}`);
        }
        
        log.warning('⚠️ Could not close location popup, but continuing...');
        return false;
        
    } catch (error) {
        log.error(`❌ Error closing popup: ${error.message}`);
        return false;
    }
}

// ==================== LOCATION SETTING FUNCTION ====================

/**
 * Set pincode location for JioMart
 */
/**
 * Set pincode location for JioMart - FIXED VERSION
 */
async function setPincodeLocation(page, log, targetPincode) {
    try {
        log.info(`🎯 Setting location to pincode: ${targetPincode}`);
        
        // Wait for page to be fully loaded
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await delay(2000);
        
        // === STEP 1: Click on location/pincode button in header ===
        const locationSelectors = [
            'button#btn_pin_code_delivery',
            'button.header-main-pincode-address',
            'span#delivery_city_pincode'
        ];
        
        let locationButtonClicked = false;
        for (const selector of locationSelectors) {
            try {
                const button = page.locator(selector).first();
                if (await button.isVisible({ timeout: 3000 })) {
                    await button.click({ timeout: 5000 });
                    log.info(`✓ Clicked location button using: ${selector}`);
                    locationButtonClicked = true;
                    break;
                }
            } catch (error) {
                continue;
            }
        }
        
        if (!locationButtonClicked) {
            log.warning('⚠️ Could not find location button');
            return false;
        }
        
        await delay(2000);
        
        // === STEP 2: Wait for delivery popup to appear ===
        try {
            await page.waitForSelector('div#delivery_popup', { timeout: 5000, state: 'visible' });
            log.info('✓ Delivery popup opened');
        } catch (error) {
            log.warning('⚠️ Delivery popup did not appear');
            return false;
        }
        
        await delay(1500);
        
        // === STEP 3: Wait for initial content and click "Enter a pincode" ===
        // The initial content div needs to be displayed first
        try {
            // Sometimes the div is hidden by default, try to show it
            await page.evaluate(() => {
                const deliveryContent = document.querySelector('#delivery-content');
                if (deliveryContent && deliveryContent.style.display === 'none') {
                    deliveryContent.style.display = 'block';
                }
            });
        } catch (e) {
            // Ignore if script fails
        }
        
        await delay(1000);
        
        // Now click the "Enter a pincode" button
        try {
            const enterPincodeBtn = page.locator('button#btn_enter_pincode').first();
            await enterPincodeBtn.waitFor({ state: 'visible', timeout: 5000 });
            await enterPincodeBtn.click({ timeout: 5000 });
            log.info('✓ Clicked "Enter a pincode" button');
        } catch (error) {
            log.error(`❌ Could not click "Enter a pincode" button: ${error.message}`);
            return false;
        }
        
        await delay(2000);
        
        // === STEP 4: Wait for pincode entry form to appear ===
        try {
            await page.waitForSelector('div#delivery_enter_pincode', { timeout: 5000, state: 'visible' });
            log.info('✓ Pincode entry form appeared');
        } catch (error) {
            log.error('❌ Pincode entry form did not appear');
            return false;
        }
        
        await delay(1000);
        
        // === STEP 5: Find and interact with pincode input ===
        const inputField = page.locator('input#rel_pincode').first();
        
        try {
            await inputField.waitFor({ state: 'visible', timeout: 5000 });
            log.info('✓ Found pincode input field');
        } catch (error) {
            log.error('❌ Could not find pincode input field');
            return false;
        }
        
        // === STEP 6: Clear and enter pincode ===
        try {
            // Focus on input
            await inputField.click();
            await delay(500);
            
            // Clear any existing value
            await inputField.fill('');
            await delay(300);
            
            // Triple-click to select all (if any text remains)
            await inputField.click({ clickCount: 3 });
            await delay(200);
            
            // Type the pincode
            await inputField.fill(targetPincode);
            await delay(500);
            
            // Verify the value was set
            const inputValue = await inputField.inputValue();
            log.info(`✓ Entered pincode: ${inputValue}`);
            
            if (inputValue !== targetPincode) {
                log.error(`❌ Pincode mismatch! Expected: ${targetPincode}, Got: ${inputValue}`);
                return false;
            }
            
            // Trigger events to ensure validation
            await page.evaluate((pincode) => {
                const input = document.querySelector('input#rel_pincode');
                if (input) {
                    input.value = pincode;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new Event('blur', { bubbles: true }));
                }
            }, targetPincode);
            
            log.info('✓ Triggered validation events');
            await delay(2000);
            
        } catch (error) {
            log.error(`❌ Failed to enter pincode: ${error.message}`);
            return false;
        }
        
        // === STEP 7: Wait for location to be detected ===
        try {
            // Wait for success message to appear
            await page.waitForSelector('div#delivery_pin_msg.field-success', { 
                timeout: 5000, 
                state: 'visible' 
            });
            
            const locationMessage = await page.locator('div#delivery_pin_msg').textContent();
            log.info(`✓ Location detected: ${locationMessage.trim()}`);
        } catch (error) {
            log.warning('⚠️ Location message not detected, checking if button is enabled...');
        }
        
        await delay(1000);
        
        // === STEP 8: Click Apply button ===
        try {
            const applyButton = page.locator('button#btn_pincode_submit').first();
            
            // Wait for button to be visible and enabled
            await applyButton.waitFor({ state: 'visible', timeout: 5000 });
            
            // Check if button is disabled
            const isDisabled = await applyButton.isDisabled();
            if (isDisabled) {
                log.warning('⚠️ Apply button is disabled, attempting to enable it...');
                
                // Force enable the button
                await page.evaluate(() => {
                    const btn = document.querySelector('button#btn_pincode_submit');
                    if (btn) {
                        btn.disabled = false;
                        btn.removeAttribute('disabled');
                        btn.classList.remove('disabled');
                    }
                });
                
                await delay(500);
            }
            
            // Click the button
            await applyButton.click({ force: true, timeout: 5000 });
            log.info('✓ Clicked Apply button');
            
        } catch (error) {
            log.error(`❌ Could not click Apply button: ${error.message}`);
            return false;
        }
        
        // === STEP 9: Wait for modal to close ===
        try {
            // Wait for the popup to disappear
            await page.waitForSelector('div#delivery_popup', { 
                state: 'hidden', 
                timeout: 10000 
            });
            log.info('✅ Location modal closed successfully');
        } catch (error) {
            // Check if modal is still visible
            const isStillVisible = await page.locator('div#delivery_popup').isVisible().catch(() => false);
            
            if (isStillVisible) {
                log.warning('⚠️ Modal still visible, trying to close manually...');
                
                // Try clicking the close button
                try {
                    await page.locator('button#close_delivery_popup').click({ timeout: 2000 });
                    await delay(1000);
                } catch (e) {
                    // Try clicking backdrop
                    try {
                        await page.locator('div.backdrop').click({ timeout: 2000 });
                        await delay(1000);
                    } catch (e2) {
                        log.error('❌ Could not close modal');
                        return false;
                    }
                }
            } else {
                log.info('✅ Modal closed (not visible)');
            }
        }
        
        // Wait for page to update with new location
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        await delay(2000);
        
        // === STEP 10: Verify location is set ===
        try {
            const headerPincode = await page.locator('button#btn_pin_code_delivery, span#delivery_city_pincode')
                .first()
                .textContent()
                .catch(() => '');
            
            if (headerPincode.includes(targetPincode)) {
                log.info(`✅ Location verified in header: ${headerPincode}`);
            } else {
                log.info(`ℹ️ Location set, header shows: ${headerPincode}`);
            }
        } catch (e) {
            // Verification failed but location might still be set
            log.info('ℹ️ Could not verify location in header, but proceeding...');
        }
        
        log.info('✅ Pincode location set successfully');
        return true;
        
    } catch (error) {
        log.error(`❌ Error in setPincodeLocation: ${error.message}`);
        
        // Take screenshot on error for debugging
        try {
            const screenshot = await page.screenshot({ fullPage: true });
            await Actor.setValue(`pincode-error-${Date.now()}.png`, screenshot, { 
                contentType: 'image/png' 
            });
            log.info('📸 Error screenshot saved');
        } catch (e) {
            // Ignore screenshot errors
        }
        
        return false;
    }
}

// ==================== SCROLLING FUNCTION ====================

/**
 * Auto-scroll to load lazy-loaded content
 */
async function autoScroll(page, log, iterations = 5) {
    try {
        log.info(`🔄 Starting auto-scroll (${iterations} iterations)...`);
        
        for (let i = 0; i < iterations; i++) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            await delay(1500);
        }
        
        // Scroll back to top
        await page.evaluate(() => window.scrollTo(0, 0));
        await delay(500);
        
        log.info('✓ Auto-scroll completed');
        return true;
    } catch (error) {
        log.warning(`⚠️ Auto-scroll failed: ${error.message}`);
        return false;
    }
}

// ==================== DEBUG FUNCTION ====================

/**
 * Debug page state with screenshots and HTML
 */
async function debugPageState(page, log, label = 'debug') {
    if (!debugMode) return;
    
    try {
        const timestamp = Date.now();
        
        // Take screenshot
        const screenshot = await page.screenshot({ fullPage: true });
        await Actor.setValue(`${label}-${timestamp}.png`, screenshot, { contentType: 'image/png' });
        
        // Save HTML
        const html = await page.content();
        await Actor.setValue(`${label}-${timestamp}.html`, html, { contentType: 'text/html' });
        
        // Get page info
        const pageInfo = await page.evaluate(() => ({
            url: window.location.href,
            title: document.title,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            elementCounts: {
                productCards: document.querySelectorAll('li.ais-InfiniteHits-item').length,
                productLinks: document.querySelectorAll('a.plp-card-wrapper').length,
                images: document.querySelectorAll('img').length,
                prices: document.querySelectorAll('span.jm-heading-xxs').length
            }
        }));
        
        log.info(`📊 Page state: ${JSON.stringify(pageInfo, null, 2)}`);
    } catch (error) {
        log.error(`Debug failed: ${error.message}`);
    }
}

// ==================== WAIT FOR RESULTS ====================

/**
 * Wait for search results to appear
 */
async function waitForSearchResults(page, log) {
    const selectors = [
        'li.ais-InfiniteHits-item',
        'a.plp-card-wrapper',
        'div.plp-card-container',
        'div.plp-card-image'
    ];

    for (const selector of selectors) {
        try {
            await page.waitForSelector(selector, { timeout: 10000, state: 'visible' });
            const count = await page.locator(selector).count();
            if (count > 0) {
                log.info(`✓ Found ${count} product elements using: ${selector}`);
                await delay(1000);
                return true;
            }
        } catch (error) {
            continue;
        }
    }

    // Fallback: check page content
    try {
        const bodyText = await page.textContent('body');
        if (bodyText?.includes('₹') || /\bAdd\b/i.test(bodyText)) {
            log.info('✓ Found product indicators in page content');
            return true;
        }
    } catch (error) {
        // Ignore
    }

    log.warning('⚠️ No search results detected');
    return false;
}

// ==================== PRODUCT EXTRACTION ====================

/**
 * Extract products from JioMart search results
 */
async function extractJioMartProducts(page, log) {
    try {
        log.info('🔍 Extracting products...');
        
        const products = await page.evaluate(() => {
            const extractedProducts = [];
            const productItems = document.querySelectorAll('li.ais-InfiniteHits-item');
            
            productItems.forEach((item, index) => {
                try {
                    // Get product link and data
                    const productLink = item.querySelector('a.plp-card-wrapper');
                    if (!productLink) return;
                    
                    const productUrl = productLink.href;
                    const productId = productLink.getAttribute('data-objid');
                    
                    // Get GTM data attributes for accurate info
                    const gtmData = item.querySelector('.gtmEvents');
                    
                    // Extract product name
                    const nameEl = item.querySelector('div.plp-card-details-name');
                    const productName = nameEl?.textContent?.trim() || 
                                       gtmData?.getAttribute('data-name') || 
                                       productLink.getAttribute('title');
                    
                    // Extract image
                    const imgEl = item.querySelector('img.lazyloaded, img.lazyautosizes');
                    let productImage = imgEl?.src || imgEl?.getAttribute('data-src');
                    if (productImage && !productImage.startsWith('http')) {
                        productImage = `https://www.jiomart.com${productImage}`;
                    }
                    
                    // Extract current price
                    const priceEl = item.querySelector('span.jm-heading-xxs');
                    let currentPrice = null;
                    if (priceEl) {
                        const priceText = priceEl.textContent.trim();
                        const match = priceText.match(/₹\s*(\d+(?:,\d+)*(?:\.\d+)?)/);
                        currentPrice = match ? parseFloat(match[1].replace(/,/g, '')) : null;
                    }
                    
                    // Fallback to GTM data
                    if (!currentPrice && gtmData) {
                        const gtmPrice = gtmData.getAttribute('data-price');
                        currentPrice = gtmPrice ? parseFloat(gtmPrice) : null;
                    }
                    
                    // Extract original price (strikethrough price)
                    const originalPriceEl = item.querySelector('span.line-through');
                    let originalPrice = null;
                    if (originalPriceEl) {
                        const priceText = originalPriceEl.textContent.trim();
                        const match = priceText.match(/₹\s*(\d+(?:,\d+)*(?:\.\d+)?)/);
                        originalPrice = match ? parseFloat(match[1].replace(/,/g, '')) : null;
                    }
                    
                    // Extract discount percentage
                    const discountEl = item.querySelector('span.jm-badge');
                    let discountPercentage = null;
                    if (discountEl) {
                        const discountText = discountEl.textContent.trim();
                        const match = discountText.match(/(\d+)%/);
                        discountPercentage = match ? parseInt(match[1]) : null;
                    }
                    
                    // Calculate discount if not available
                    if (!discountPercentage && currentPrice && originalPrice && originalPrice > currentPrice) {
                        discountPercentage = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
                    }
                    
                    // Extract weight/size from product name or separate field
                    let productWeight = null;
                    const weightMatch = productName?.match(/(\d+\s*(?:g|kg|ml|l|gm|pack|pcs|piece))/i);
                    if (weightMatch) {
                        productWeight = weightMatch[1];
                    }
                    
                    // Extract brand
                    const brand = gtmData?.getAttribute('data-manu') || null;
                    
                    // Check if vegetarian
                    const vegIcon = item.querySelector('img[src*="icon-veg"]');
                    const isVegetarian = vegIcon !== null;
                    
                    // Check stock status
                    const addButton = item.querySelector('button.addtocartbtn');
                    const isOutOfStock = addButton?.hasAttribute('disabled') || false;
                    
                    if (productName && currentPrice) {
                        extractedProducts.push({
                            productId: productId || `jiomart-${index}`,
                            productName,
                            productImage,
                            currentPrice,
                            originalPrice: originalPrice || currentPrice,
                            discountPercentage: discountPercentage || 0,
                            productWeight,
                            brand,
                            isVegetarian,
                            isOutOfStock,
                            productUrl,
                            scrapedAt: new Date().toISOString()
                        });
                    }
                } catch (error) {
                    console.error(`Error extracting product ${index}:`, error);
                }
            });
            
            return extractedProducts;
        });
        
        log.info(`✅ Extracted ${products.length} products`);
        
        if (debugMode && products.length > 0) {
            log.info(`Sample product: ${JSON.stringify(products[0], null, 2)}`);
        }
        
        return products;
    } catch (error) {
        log.error(`❌ Error extracting products: ${error.message}`);
        return [];
    }
}

// ==================== PROXY CONFIGURATION ====================

const proxyConfig = proxyConfiguration?.useApifyProxy 
    ? await Actor.createProxyConfiguration(proxyConfiguration)
    : undefined;

const customProxyUrl = proxyConfiguration?.customProxyUrl || 
                       proxyConfiguration?.proxyUrl || 
                       proxyConfiguration?.proxy;
const launchProxy = customProxyUrl ? parseProxyUrl(customProxyUrl) : null;

// ==================== GENERATE SEARCH URLS ====================

const allSearchUrls = [
    ...searchUrls,
    ...searchQueries.map(query => 
        `https://www.jiomart.com/search?q=${encodeURIComponent(query)}`
    )
];

// ==================== CRAWLER INITIALIZATION ====================

const crawler = new PlaywrightCrawler({
    proxyConfiguration: proxyConfig,
    maxRequestRetries,
    navigationTimeoutSecs: navigationTimeout / 1000,
    headless:false,
    
    launchContext: {
        launchOptions: {
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ],
            ...((!proxyConfig && launchProxy) ? { proxy: launchProxy } : {})
        }
    },

    preNavigationHooks: [
        async ({ page, log }) => {
            try {
                const userAgent = pickRandom(USER_AGENTS);

                await page.setExtraHTTPHeaders({
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'User-Agent': userAgent,
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                });

                await page.setViewportSize({ width: 1920, height: 1080 });

                // Mask automation
                await page.addInitScript((ua) => {
                    Object.defineProperty(navigator, 'webdriver', { get: () => false });
                    Object.defineProperty(navigator, 'userAgent', { get: () => ua });
                    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
                    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
                    
                    // Override Chrome detection
                    window.chrome = { runtime: {} };
                }, userAgent).catch(() => {});
                
            } catch (error) {
                log.error(`preNavigationHook error: ${error.message}`);
            }
        }
    ],

    async requestHandler({ page, request, log }) {
        const { url } = request;
        const isFirstRequest = request.userData?.isFirst || false;

        log.info(`🔍 Processing: ${url}`);

        try {
            // === STEP 0: Close location services popup ===
            if (isFirstRequest) {
                await closeLocationPopup(page, log);
                await delay(1000);
            }
            
            // === STEP 1: Set location on first request ===
            if (isFirstRequest && !locationSetGlobally) {
                log.info('🎯 First request - setting pincode location');
                
                const locationSet = await setPincodeLocation(page, log, pincode);
                
                if (locationSet) {
                    locationSetGlobally = true;
                    log.info('✅ Location set successfully');
                    
                    // Reload page to apply location
                    await page.reload({ waitUntil: 'networkidle' });
                    await delay(3000);
                } else {
                    log.warning('⚠️ Failed to set location, continuing anyway');
                }
            }
            
            // === STEP 2: Wait for page load ===
            await page.waitForLoadState('domcontentloaded');
            await delay(3000);
            
            if (isFirstRequest) {
                await debugPageState(page, log, 'initial');
            }
            
            // === STEP 3: Close any popups/modals ===
            try {
                // Close any remaining delivery popup
                const closeBtn = page.locator('button#close_delivery_popup').first();
                if (await closeBtn.count() > 0 && await closeBtn.isVisible({ timeout: 2000 })) {
                    await closeBtn.click();
                    await delay(500);
                }
            } catch (error) {
                // No popup
            }
            
            // Close any other modals
            try {
                const backdrop = page.locator('div.backdrop').first();
                if (await backdrop.isVisible({ timeout: 2000 })) {
                    await backdrop.click();
                    await delay(500);
                }
            } catch (error) {
                // No backdrop
            }
            
            // === STEP 4: Wait for results ===
            const resultsFound = await waitForSearchResults(page, log);
            if (!resultsFound) {
                await debugPageState(page, log, 'no-results');
                log.warning('⚠️ No search results detected');
            }
            
            // === STEP 5: Scroll to load products ===
            await autoScroll(page, log, scrollCount);
            
            if (isFirstRequest) {
                await debugPageState(page, log, 'after-scroll');
            }
            
            // === STEP 6: Extract products ===
            const products = await extractJioMartProducts(page, log);
            
            if (products.length === 0) {
                log.error('❌ No products extracted');
                await debugPageState(page, log, 'no-products');
                return;
            }
            
            // === STEP 7: Save products ===
            const urlParams = new URL(url).searchParams;
            const searchQuery = urlParams.get('q') || urlParams.get('query') || 'direct_url';
            
            const productsToSave = products.slice(0, maxProductsPerSearch).map(product => ({
                ...product,
                searchQuery,
                searchUrl: url,
                platform: 'JioMart',
                pincode
            }));
            
            await Dataset.pushData(productsToSave);
            
            log.info(`✅ Saved ${productsToSave.length} products for "${searchQuery}" (Pincode: ${pincode})`);

        } catch (error) {
            log.error(`❌ Error processing ${url}: ${error.message}`);
            
            if (screenshotOnError) {
                try {
                    const screenshot = await page.screenshot({ fullPage: true });
                    const timestamp = Date.now();
                    await Actor.setValue(`error-${timestamp}.png`, screenshot, { contentType: 'image/png' });
                } catch (e) {
                    log.error(`Screenshot failed: ${e.message}`);
                }
            }
            
            throw error;
        }
    },

    failedRequestHandler: async ({ request, log }) => {
        log.error(`❌ Request failed: ${request.url}`);
        
        const failedUrls = await Actor.getValue('FAILED_URLS') || [];
        failedUrls.push({
            url: request.url,
            timestamp: new Date().toISOString(),
            error: request.errorMessages?.join(', ')
        });
        await Actor.setValue('FAILED_URLS', failedUrls);
    }
});

// ==================== START CRAWLER ====================

if (allSearchUrls.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 JIOMART SCRAPER STARTED');
    console.log('='.repeat(60));
    console.log(`📍 Pincode: ${pincode}`);
    console.log(`🔍 Search URLs: ${allSearchUrls.length}`);
    console.log(`📊 Max products per search: ${maxProductsPerSearch}`);
    console.log(`📜 Scroll iterations: ${scrollCount}`);
    console.log(`🐛 Debug mode: ${debugMode}`);
    console.log(`👁️  Headless: ${headless}`);
    console.log('='.repeat(60) + '\n');
    
    const searchRequests = allSearchUrls.map((url, index) => ({ 
        url, 
        userData: { isFirst: index === 0 } 
    }));
    
    console.log('🔍 URLs to process:\n');
    searchRequests.forEach((req, idx) => {
        console.log(`  ${idx + 1}. ${req.url}${idx === 0 ? ' 📍 (will set location)' : ''}`);
    });
    console.log('');
    
    await crawler.run(searchRequests);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ SCRAPING COMPLETED');
    console.log('='.repeat(60));
    console.log('📁 Results: storage/datasets/default/');
    console.log('📸 Debug files: storage/key_value_stores/default/');
    console.log('='.repeat(60) + '\n');
} else {
    console.log('\n' + '='.repeat(60));
    console.log('❌ NO SEARCH URLS PROVIDED');
    console.log('='.repeat(60));
    console.log('Please provide either "searchUrls" or "searchQueries" in input.json');
    console.log('='.repeat(60) + '\n');
}

await Actor.exit();
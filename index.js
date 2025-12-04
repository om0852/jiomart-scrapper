import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset, log } from 'crawlee';

// Initialize Actor
await Actor.init();

// ==================== INPUT CONFIGURATION ====================
const input = await Actor.getInput() ?? {};
const {
    pincode = '120001', // Default to Mumbai
    searchQueries = ['kurkure'],
    searchUrls = [],
    maxProductsPerSearch = 100,
    maxRequestRetries = 3,
    navigationTimeout = 60000,
    headless = false,
    proxyConfiguration = { useApifyProxy: false },
} = input;

// ==================== CONSTANTS & SELECTORS ====================
const SELECTORS = {
    // Location / Pincode
    locationPopup: 'div.alcohol-popup',
    locationCloseBtn: ['button#btn_location_close_icon', 'button.close-privacy', 'button.close-icon'],
    locationManualBtn: 'button#select_location_popup',
    
    headerPincodeBtn: ['button#btn_pin_code_delivery', 'button.header-main-pincode-address', 'span#delivery_city_pincode'],
    deliveryPopup: 'div#delivery_popup',
    enterPincodeBtn: 'button#btn_enter_pincode',
    pincodeInputWrapper: 'div#delivery_enter_pincode',
    pincodeInput: 'input#rel_pincode',
    applyPincodeBtn: 'button#btn_pincode_submit',
    locationSuccessMsg: 'div#delivery_pin_msg.field-success',
    closeDeliveryPopup: 'button#close_delivery_popup',
    
    // Products
    productItem: 'li.ais-InfiniteHits-item',
    productLink: 'a.plp-card-wrapper',
    productName: 'div.plp-card-details-name',
    productImage: 'img.lazyloaded, img.lazyautosizes',
    currentPrice: 'span.jm-heading-xxs',
    originalPrice: 'span.line-through',
    discountBadge: 'span.jm-badge',
    addToCartBtn: 'button.addtocartbtn',
    vegIcon: 'img[src*="icon-veg"]',
    
    // Search / Listing
    searchResultsContainer: 'ul.ais-InfiniteHits-list',
    noResults: 'div.no-results', // Hypothetical selector, adjust if known
};

// ==================== HELPER FUNCTIONS ====================

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Close the initial location popup if it appears.
 */
async function closeLocationPopup(page, log) {
    try {
        const popup = page.locator(SELECTORS.locationPopup).first();
        if (await popup.count() === 0) return;

        log.info('🔔 Location popup detected. Attempting to close...');

        // Try close buttons
        for (const selector of SELECTORS.locationCloseBtn) {
            const btn = page.locator(selector).first();
            if (await btn.isVisible()) {
                await btn.click();
                log.info(`✓ Closed popup using ${selector}`);
                return;
            }
        }

        // Try manual select button as fallback
        const manualBtn = page.locator(SELECTORS.locationManualBtn).first();
        if (await manualBtn.isVisible()) {
            await manualBtn.click();
            log.info('✓ Closed popup using "Select Location Manually"');
        }
    } catch (error) {
        log.warning(`⚠️ Failed to close location popup: ${error.message}`);
    }
}

/**
 * Set the pincode to ensure correct pricing and availability.
 */
async function setPincode(page, log, targetPincode) {
    log.info(`📍 Setting pincode to: ${targetPincode}`);

    try {
        // 1. Open Delivery Popup
        let opened = false;
        for (const selector of SELECTORS.headerPincodeBtn) {
            const btn = page.locator(selector).first();
            if (await btn.isVisible()) {
                await btn.click();
                opened = true;
                break;
            }
        }
        if (!opened) throw new Error('Could not find header location button');

        await page.waitForSelector(SELECTORS.deliveryPopup, { timeout: 5000 });

        // 2. Click "Enter Pincode" if needed (sometimes it shows saved addresses)
        const enterBtn = page.locator(SELECTORS.enterPincodeBtn).first();
        if (await enterBtn.isVisible()) {
            await enterBtn.click();
        }

        // 3. Enter Pincode
        await page.waitForSelector(SELECTORS.pincodeInput, { timeout: 5000 });
        const input = page.locator(SELECTORS.pincodeInput).first();
        await input.fill(targetPincode);
        
        // Trigger events to ensure validation logic runs
        await input.evaluate(e => {
            e.dispatchEvent(new Event('input', { bubbles: true }));
            e.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // 4. Apply
        const applyBtn = page.locator(SELECTORS.applyPincodeBtn).first();
        await applyBtn.waitFor({ state: 'visible' });
        
        // Check if disabled, sometimes needs a moment
        if (await applyBtn.isDisabled()) {
            await delay(1000);
        }
        await applyBtn.click();

        // 5. Verify Success
        try {
            await page.waitForSelector(SELECTORS.locationSuccessMsg, { timeout: 5000 });
            log.info('✅ Pincode applied successfully.');
        } catch (e) {
            log.warning('⚠️ Success message not seen, but continuing...');
        }

        // 6. Close Popup (if it doesn't auto-close)
        if (await page.locator(SELECTORS.deliveryPopup).isVisible()) {
            const closeBtn = page.locator(SELECTORS.closeDeliveryPopup).first();
            if (await closeBtn.isVisible()) await closeBtn.click();
            else await page.keyboard.press('Escape');
        }
        
        // Wait for reload or update
        await delay(2000);

    } catch (error) {
        log.error(`❌ Failed to set pincode: ${error.message}`);
        // We continue even if this fails, as we might still get some data
    }
}

/**
 * Scroll a fixed number of times to load products.
 */
async function autoScroll(page, log, iterations = 10) {
    log.info(`🔄 Auto-scrolling ${iterations} times...`);
    
    await page.evaluate(async (iterations) => {
        const distance = 500;
        const delay = 1000; // Wait 1s between scrolls to let items load
        
        for (let i = 0; i < iterations; i++) {
            window.scrollBy(0, distance);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Also scroll to bottom occasionally to trigger bottom listeners
            if (i % 3 === 0) {
                window.scrollTo(0, document.body.scrollHeight);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        // Scroll back to top
        window.scrollTo(0, 0);
        await new Promise(resolve => setTimeout(resolve, 500));
    }, iterations);
    
    log.info('✓ Auto-scroll finished');
}

// ==================== CRAWLER SETUP ====================

const proxyConfig = proxyConfiguration?.useApifyProxy 
    ? await Actor.createProxyConfiguration(proxyConfiguration)
    : undefined;

const crawler = new PlaywrightCrawler({
    proxyConfiguration: proxyConfig,
    maxRequestRetries,
    navigationTimeoutSecs: navigationTimeout / 1000,
    headless,
    
    // Browser launch options
    launchContext: {
        launchOptions: {
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
            ],
        }
    },

    async requestHandler({ page, request, log }) {
        log.info(`Processing ${request.url}`);

        // Handle Location (only on first request or if needed)
        // For simplicity in this logic, we attempt it on every page load if it looks like the default location.
        // But to be efficient, we can rely on session persistence if cookies are shared (PlaywrightCrawler does this by default per session).
        
        // We'll do a quick check:
        await closeLocationPopup(page, log);
        
        // If this is a search page, we want to ensure we are at the right location
        // Note: Setting location triggers a reload, so we should be careful not to loop.
        // For now, we assume the initial session setup (if we were doing a login) or just set it once.
        // Since we don't have a dedicated "setup" phase in this simple script, we'll try to set it if we detect we are not in the right place, 
        // OR just set it on the first request of the crawler if we could control that.
        // A simple approach:
        if (request.userData.isFirst) {
            await setPincode(page, log, pincode);
            // Reload to ensure products reflect the pincode
            await page.reload();
        }

        // Wait for results
        try {
            await page.waitForSelector(SELECTORS.productItem, { timeout: 15000 });
        } catch (e) {
            log.warning('⚠️ No products found or timeout waiting for selector.');
            // Check for "No results" message
            const content = await page.content();
            if (content.includes('No results found')) {
                log.info('No results found for this query.');
                return;
            }
        }

        await autoScroll(page, log, 10);

        // Extract Data
        const products = await page.$$eval(SELECTORS.productItem, (items, { selectors, requestData }) => {
            return items.map(item => {
                try {
                    const linkEl = item.querySelector(selectors.productLink);
                    const nameEl = item.querySelector(selectors.productName);
                    const imgEl = item.querySelector(selectors.productImage);
                    const priceEl = item.querySelector(selectors.currentPrice);
                    const origPriceEl = item.querySelector(selectors.originalPrice);
                    const discountEl = item.querySelector(selectors.discountBadge);
                    const addBtn = item.querySelector(selectors.addToCartBtn);
                    const vegIcon = item.querySelector(selectors.vegIcon);
                    
                    // Helper to clean price
                    const parsePrice = (txt) => {
                        if (!txt) return null;
                        const match = txt.match(/[\d,.]+/);
                        return match ? parseFloat(match[0].replace(/,/g, '')) : null;
                    };

                    const rawPrice = priceEl?.textContent?.trim();
                    const rawOrigPrice = origPriceEl?.textContent?.trim();
                    const currentPrice = parsePrice(rawPrice);
                    const originalPrice = parsePrice(rawOrigPrice) || currentPrice;
                    
                    // Calculate discount
                    let discountPercentage = 0;
                    if (discountEl) {
                        const match = discountEl.textContent.trim().match(/(\d+)%/);
                        discountPercentage = match ? parseInt(match[1]) : 0;
                    } else if (originalPrice && currentPrice && originalPrice > currentPrice) {
                        discountPercentage = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
                    }

                    const productName = nameEl?.textContent?.trim() || linkEl?.getAttribute('title') || '';
                    
                    // Extract weight from name
                    let productWeight = null;
                    const weightMatch = productName.match(/(\d+\s*(?:g|kg|ml|l|gm|pack|pcs|piece))/i);
                    if (weightMatch) {
                        productWeight = weightMatch[1];
                    }

                    // Try to get brand from GTM data if available
                    const gtmData = item.querySelector('.gtmEvents');
                    const brand = gtmData?.getAttribute('data-manu') || 'JioMart'; // Default or extract

                    return {
                        productId: linkEl?.getAttribute('data-objid') || '',
                        productName,
                        productImage: imgEl?.src || imgEl?.getAttribute('data-src') || '',
                        currentPrice,
                        originalPrice,
                        discountPercentage,
                        productWeight,
                        brand,
                        isVegetarian: !!vegIcon,
                        isOutOfStock: addBtn ? addBtn.hasAttribute('disabled') : false,
                        productUrl: linkEl ? linkEl.href : '',
                        scrapedAt: new Date().toISOString(),
                        searchQuery: requestData.query,
                        searchUrl: window.location.href,
                        platform: "JioMart",
                        pincode: requestData.pincode
                    };
                } catch (e) {
                    return null;
                }
            }).filter(p => p && p.productName && p.currentPrice); // Filter invalid items
        }, { selectors: SELECTORS, requestData: request.userData });

        log.info(`Found ${products.length} products.`);

        // Push to dataset
        await Dataset.pushData(products);
    },

    failedRequestHandler({ request, log }) {
        log.error(`Request ${request.url} failed too many times.`);
    },
});

// ==================== EXECUTION ====================

const startUrls = [
    ...searchQueries.map(query => ({
        url: `https://www.jiomart.com/search?q=${encodeURIComponent(query)}`,
        userData: { 
            query,
            pincode,
            isFirst: true // Mark as first to trigger location set
        }
    })),
    ...searchUrls.map(url => ({
        url,
        userData: {
            query: 'direct_url',
            pincode,
            isFirst: true
        }
    }))
];

log.info(`Starting crawler for ${startUrls.length} queries...`);
await crawler.run(startUrls);
log.info('Crawler finished.');

// Exit Actor
await Actor.exit();

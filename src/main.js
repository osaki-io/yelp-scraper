// Yelp Business Scraper Actor
// Production-quality scraper using Playwright for browser-based scraping

import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset } from 'crawlee';

// User agent rotation for anti-scraping
const USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

// Get random user agent
const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// Initialize the Actor
await Actor.init();

// Get input
const input = await Actor.getInput() || {};
const {
    searchQuery,
    location,
    maxResults = 50,
    includeReviews = true,
    maxReviewsPerBusiness = 5,
    delayBetweenRequests = 2000,
    maxRetries = 3
} = input;

// Validation
if (!searchQuery || !location) {
    throw new Error('❌ Both searchQuery and location are required!');
}

console.log('🚀 Starting Yelp Business Scraper');
console.log(`   Search: "${searchQuery}" in "${location}"`);
console.log(`   Max Results: ${maxResults}`);
console.log(`   Include Reviews: ${includeReviews ? 'Yes' : 'No'}`);

// Track scraped businesses for deduplication
const scrapedBusinesses = new Set();
let businessCount = 0;

// Configure proxy (residential for anti-scraping)
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL']
});
console.log('🔒 Residential proxies enabled');

console.log('🌐 Using Playwright with real browser for anti-bot bypass');

// Build Yelp search URL
const buildSearchUrl = (query, loc, offset = 0) => {
    const params = new URLSearchParams({
        find_desc: query,
        find_loc: loc,
        start: offset.toString()
    });
    return `https://www.yelp.com/search?${params.toString()}`;
};

// Extract business data from search result cards (new Yelp layout)
const extractBusinessFromSearchCard = ($, element) => {
    const $card = $(element);

    // Business link (relative to yelp.com)
    const businessLink = $card.find('a[href*="/biz/"]').filter((_, el) => {
        const href = $(el).attr('href') || '';
        return href.includes('/biz/');
    }).first().attr('href');

    if (!businessLink) return null;

    const businessUrl = businessLink.startsWith('http')
        ? businessLink.split('?')[0]
        : `https://www.yelp.com${businessLink.split('?')[0]}`;

    // Business name can live in multiple elements (ALT tag or anchor text)
    const nameFromImg = $card.find('img[alt]').first().attr('alt');
    const nameFromAnchor = $card.find('a[href*="/biz/"]').first().text();
    const nameFromHeading = $card.find('h3, h4').first().text();

    const businessName = [nameFromImg, nameFromAnchor, nameFromHeading]
        .map(value => (value || '').trim())
        .find(value => value.length > 0) || null;

    // Ratings are exposed via aria-label or bold span values
    const ratingLabel = $card.find('[aria-label*="star rating"]').first().attr('aria-label') || '';
    const ratingValueText = $card.find('span[data-font-weight="semibold"]').first().text().trim();
    const ratingMatch = (ratingLabel || ratingValueText).match(/(\d+\.?\d*)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

    // Review count text typically sits near the rating
    let reviewCount = null;
    const reviewCandidate = $card.find('span, p').filter((_, el) => {
        const text = $(el).text().toLowerCase();
        return text.includes('review');
    }).first().text();

    const reviewMatch = reviewCandidate.match(/(\d+[,.]?\d*)\s*review/i);
    if (reviewMatch) {
        reviewCount = parseInt(reviewMatch[1].replace(/[,\.]/g, ''), 10);
    }

    return {
        businessName,
        rating,
        reviewCount,
        businessUrl
    };
};

// Extract detailed data from business page
const extractBusinessDetails = ($, url) => {
    const businessName = $('h1').first().text().trim();

    // Rating and review count
    const ratingText = $('[role="img"]').attr('aria-label') || '';
    const ratingMatch = ratingText.match(/(\d+\.?\d*)\s*star/i);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

    const reviewCountText = $('body').text();
    const reviewMatch = reviewCountText.match(/(\d+)\s*review/i);
    const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : 0;

    // Categories
    const categories = [];
    $('a[href*="cflt="]').each((i, el) => {
        const cat = $(el).text().trim();
        if (cat && !categories.includes(cat)) {
            categories.push(cat);
        }
    });

    // Price range
    let priceRange = null;
    const priceElements = $('span').filter((i, el) => {
        const text = $(el).text().trim();
        return /^\$+$/.test(text);
    });
    if (priceElements.length > 0) {
        priceRange = priceElements.first().text().trim();
    }

    // Address
    let address = null;
    $('p, div, span').each((i, el) => {
        const text = $(el).text().trim();
        if (text.includes(',') && /\d/.test(text) && text.length < 200 && text.split(',').length >= 2) {
            if (!address || text.length < address.length) {
                address = text;
            }
        }
    });

    // Phone
    let phone = null;
    $('p, div, span, a').each((i, el) => {
        const text = $(el).text().trim();
        const phoneMatch = text.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
        if (phoneMatch && !phone) {
            phone = phoneMatch[0];
        }
    });

    // Hours
    const hours = [];
    $('tbody tr, div[class*="hours"] p, div[class*="businessHours"] p').each((i, el) => {
        const text = $(el).text().trim();
        if (text && (text.match(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/i))) {
            hours.push(text);
        }
    });

    // Photo URLs
    const photos = [];
    $('img[src*="bphoto"]').each((i, el) => {
        const src = $(el).attr('src');
        if (src && !photos.includes(src)) {
            photos.push(src);
        }
    });

    return {
        businessName,
        rating,
        reviewCount,
        categories: categories.length > 0 ? categories : null,
        priceRange,
        address,
        phone,
        hours: hours.length > 0 ? hours : null,
        photos: photos.slice(0, 10), // Limit to 10 photos
        url
    };
};

// Extract reviews from business page
const extractReviews = ($, maxReviews) => {
    const reviews = [];

    $('div[class*="review"], li[class*="review"]').slice(0, maxReviews).each((i, el) => {
        const $review = $(el);

        const author = $review.find('a[href*="/user_details"]').first().text().trim();

        const ratingText = $review.find('[role="img"]').attr('aria-label') || '';
        const ratingMatch = ratingText.match(/(\d+\.?\d*)\s*star/i);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        const text = $review.find('p[class*="comment"], span[class*="comment"]').first().text().trim() ||
                    $review.find('p').first().text().trim();

        let date = null;
        $review.find('span').each((j, span) => {
            const spanText = $(span).text().trim();
            if (spanText.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
                date = spanText;
            }
        });

        if (text && text.length > 20) {
            reviews.push({
                author: author || 'Anonymous',
                rating,
                text: text.length > 500 ? text.substring(0, 500) + '...' : text,
                date
            });
        }
    });

    return reviews;
};

// Configure the crawler with Playwright for browser-based scraping
const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    useSessionPool: true,
    sessionPoolOptions: {
        maxPoolSize: 10,
        sessionOptions: {
            maxUsageCount: 30,
            maxErrorScore: 3
        }
    },
    maxRequestsPerCrawl: maxResults + 50,
    maxConcurrency: 2, // Playwright uses more resources, limit concurrency
    maxRequestRetries: maxRetries,
    requestHandlerTimeoutSecs: 120,
    navigationTimeoutSecs: 60,
    
    // Playwright-specific browser options
    launchContext: {
        launchOptions: {
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-web-security',
                '--no-sandbox'
            ]
        }
    },

    async requestHandler({ request, page, log, parseWithCheerio }) {
        const url = request.url;
        
        // Wait for page to load and handle anti-bot challenges
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {
            log.warning('Network idle timeout - continuing anyway');
        });
        
        // Small random delay to appear more human-like
        await page.waitForTimeout(1000 + Math.random() * 2000);
        
        // Parse with Cheerio for familiar API
        const $ = await parseWithCheerio();

        // Handle search results page
        if (url.includes('/search?')) {
            log.info(`🔍 Processing search page: ${url}`);

            // DEBUG: Save HTML of first search page for inspection
            if (!request.userData.debugLogged) {
                const html = await page.content();
                await Actor.setValue('DEBUG_SEARCH_HTML', html, { contentType: 'text/html' });
                log.info('🐛 DEBUG: Saved search page HTML to Key-Value Store as "DEBUG_SEARCH_HTML"');
                
                // Log what selectors we're finding
                const cardCount = $('div[data-testid="serp-ia-card"]').length;
                const altCardCount = $('div[data-testid="searchResultBusiness"]').length;
                const allDivsWithData = $('div[data-testid]').length;
                
                log.info(`🐛 DEBUG: Found ${cardCount} serp-ia-card elements`);
                log.info(`🐛 DEBUG: Found ${altCardCount} searchResultBusiness elements`);
                log.info(`🐛 DEBUG: Found ${allDivsWithData} total divs with data-testid`);
                
                // Sample a few data-testid values to see what's available
                const testIds = new Set();
                $('div[data-testid]').slice(0, 20).each((i, el) => {
                    testIds.add($(el).attr('data-testid'));
                });
                log.info(`🐛 DEBUG: Sample data-testid values: ${Array.from(testIds).join(', ')}`);
                
                request.userData.debugLogged = true;
            }

            // Find business cards on the current SERP
            const businesses = [];
            $('div[data-testid="serp-ia-card"], div[data-testid="searchResultBusiness"]').each((i, element) => {
                const business = extractBusinessFromSearchCard($, element);
                if (business && business.businessUrl) {
                    const key = business.businessUrl;
                    if (!scrapedBusinesses.has(key) && businessCount < maxResults) {
                        businesses.push(business);
                        scrapedBusinesses.add(key);
                    }
                }
            });

            log.info(`   Found ${businesses.length} unique businesses on this page`);

            // Enqueue business detail pages
            for (const business of businesses) {
                if (businessCount >= maxResults) break;

                await crawler.addRequests([{
                    url: business.businessUrl,
                    userData: { business, type: 'detail' }
                }]);

                businessCount++;
            }

            // Check if we need more results
            if (businessCount < maxResults) {
                // Look for next page
                const nextButton = $('a[aria-label*="Next"]').attr('href');
                if (nextButton) {
                    const nextUrl = nextButton.startsWith('http')
                        ? nextButton
                        : `https://www.yelp.com${nextButton}`;

                    log.info(`   Navigating to next page...`);
                    await crawler.addRequests([{
                        url: nextUrl,
                        userData: { type: 'search' }
                    }]);
                } else {
                    log.info(`   No more search pages found`);
                }
            }
        }
        // Handle business detail page
        else if (url.includes('/biz/')) {
            log.info(`📄 Processing business: ${url}`);

            const businessData = extractBusinessDetails($, url);

            // Extract reviews if enabled
            let reviews = [];
            if (includeReviews) {
                reviews = extractReviews($, maxReviewsPerBusiness);
            }

            // Prepare final result
            const result = {
                businessName: businessData.businessName,
                rating: businessData.rating,
                reviewCount: businessData.reviewCount,
                categories: businessData.categories,
                priceRange: businessData.priceRange,
                address: businessData.address,
                phone: businessData.phone,
                hours: businessData.hours,
                photos: businessData.photos,
                reviews: reviews.length > 0 ? reviews : null,
                url: businessData.url,
                scrapedAt: new Date().toISOString()
            };

            // Save to dataset
            await Actor.pushData(result);

            log.info(`   ✅ Saved: ${businessData.businessName}`);
            log.info(`   Rating: ${businessData.rating}⭐ | Reviews: ${businessData.reviewCount}`);

            // Progress update
            const progress = Math.round((businessCount / maxResults) * 100);
            log.info(`📊 Progress: ${businessCount}/${maxResults} (${progress}%)`);
        }
    },

    async failedRequestHandler({ request, log }) {
        log.error(`❌ Request failed after ${maxRetries} retries: ${request.url}`);
        log.error(`   Error: ${request.errorMessages?.join(', ')}`);
    },

    // Pre-navigation hook for browser stealth
    preNavigationHooks: [
        async ({ page, request }, gotoOptions) => {
            // Set extra headers
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Referer': 'https://www.yelp.com/',
                'sec-ch-ua': '"Chromium";v="120", "Not_A Brand";v="99"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"'
            });

            // Override navigator.webdriver
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                });
            });

            // Add delay between requests
            if (delayBetweenRequests > 0) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
            }
        }
    ]
});

// Start crawling
try {
    const startUrl = buildSearchUrl(searchQuery, location, 0);
    console.log(`🔗 Starting URL: ${startUrl}`);

    await crawler.run([{
        url: startUrl,
        userData: { type: 'search' }
    }]);

    console.log('\n🎉 Scraping completed!');
    console.log(`   Total businesses scraped: ${businessCount}`);
    console.log(`   Unique businesses: ${scrapedBusinesses.size}`);

    // Get dataset info
    const dataset = await Actor.openDataset();
    const info = await dataset.getInfo();
    console.log(`   Dataset items: ${info.itemCount}`);

} catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    await Actor.fail(error.message);
}

// Exit the Actor
await Actor.exit();

# Yelp Business Scraper

Production-quality Yelp scraper built with Cheerio for optimal performance and cost efficiency.

## Features

- **Fast & Cost-Effective**: Cheerio-based scraping targeting <0.017 CU per 1K results
- **Comprehensive Data**: Extracts business name, rating, reviews, address, phone, hours, categories, price range, photos
- **Anti-Scraping Protection**: User-agent rotation, configurable delays, retry logic
- **Smart Deduplication**: Prevents duplicate businesses by name + address
- **Progress Tracking**: Real-time logging and progress updates
- **Flexible Input**: Search by query + location with configurable limits

## Extracted Data

Each business result contains:
- `businessName`: Name of the business
- `rating`: Star rating (1-5)
- `reviewCount`: Total number of reviews
- `categories`: Array of business categories
- `priceRange`: Price indicator ($, $$, $$$, $$$$)
- `address`: Full street address
- `phone`: Contact phone number
- `hours`: Business hours (array)
- `photos`: URLs to business photos (up to 10)
- `reviews`: Top reviews with author, rating, text, date
- `url`: Yelp business page URL
- `scrapedAt`: ISO timestamp

## Input Parameters

- **searchQuery** (required): What to search for (e.g., "pizza", "dentists")
- **location** (required): Where to search (e.g., "San Francisco, CA", "10001")
- **maxResults** (optional): Max businesses to scrape (1-500, default: 50)
- **includeReviews** (optional): Extract reviews (default: true)
- **maxReviewsPerBusiness** (optional): Reviews per business (1-20, default: 5)
- **delayBetweenRequests** (optional): Delay in ms (500-10000, default: 2000)
- **maxRetries** (optional): Retry attempts (0-5, default: 3)

## Usage

### Via Apify Console
1. Navigate to actor in Apify Console
2. Fill in searchQuery and location
3. Configure optional parameters
4. Click "Start"

### Via API
```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_TOKEN' });

const run = await client.actor('YOUR_USERNAME/yelp-scraper').call({
    searchQuery: 'coffee shops',
    location: 'Seattle, WA',
    maxResults: 100,
    includeReviews: true
});

const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items);
```

### Local Testing
```bash
cd /Users/ikaris/Desktop/apify-project/actors/yelp-scraper
npm install
npm start
```

## Performance

- Target: <0.017 CU per 1K results (Cheerio performance)
- Typical runtime: 1-3 minutes for 50 businesses
- Rate limiting: Configurable delays prevent blocking

## Error Handling

- Automatic retries on failed requests (configurable)
- Graceful degradation for missing data fields
- Progress logging for monitoring
- Clear error messages in logs

## Best Practices

1. Start with small maxResults (10-20) to test
2. Use delays of 2000-3000ms for reliable scraping
3. Monitor logs for rate limiting warnings
4. Respect Yelp's Terms of Service
5. Use for research/analysis purposes only

## Notes

- Yelp's HTML structure may change; actor may need updates
- Large scrapes (>200 results) may take longer
- Some businesses may have incomplete data
- Reviews are limited to what's visible on first page load

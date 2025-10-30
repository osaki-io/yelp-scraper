# Actor.log Error Fix Guide

## RESOLVED

**Status**: Fix confirmed working (build 22s → run 14s, exit 0)

The Actor.log issue has been successfully resolved. One-liner fix applied:
```bash
sed -i '' 's/Actor\.log\.info(/console.log(/g' src/main.js
sed -i '' 's/Actor\.log\.error(/console.error(/g' src/main.js
```

**Important**: Yelp returns HTTP 403 (anti-scraping protection) is a separate issue, not a code error. Exit code 0 indicates graceful error handling.

---

## Original Error Analysis

## Current Error

```
TypeError: Cannot read properties of undefined (reading 'info')
    at file:///usr/src/app/src/main.js:39:11
```

## Root Cause

`Actor.log` is used BEFORE crawler initialization or OUTSIDE crawler handlers. In Apify SDK v3, `Actor.log` only exists inside crawler request handlers.

## All Locations with Actor.log (src/main.js)

### Top-level (BEFORE crawler) - Lines 39-42
```javascript
// ❌ WRONG - Actor.log doesn't exist here yet
Actor.log.info('🚀 Starting Yelp Business Scraper');
Actor.log.info(`   Search: "${searchQuery}" in "${location}"`);
Actor.log.info(`   Max Results: ${maxResults}`);
Actor.log.info(`   Include Reviews: ${includeReviews ? 'Yes' : 'No'}`);

// ✅ CORRECT - Use console.log
console.log('🚀 Starting Yelp Business Scraper');
console.log(`   Search: "${searchQuery}" in "${location}"`);
console.log(`   Max Results: ${maxResults}`);
console.log(`   Include Reviews: ${includeReviews ? 'Yes' : 'No'}`);
```

### Inside crawler handlers - Lines 256, 276, 299, 305, 311, 340-345
```javascript
// ✅ CORRECT - Use 'log' parameter from requestHandler
async requestHandler({ request, $, log }) {
    log.info(`🔍 Processing search page: ${url}`);
    log.info(`   Found ${businesses.length} unique businesses on this page`);
    log.info(`   Navigating to next page...`);
    log.info(`   No more search pages found`);
    log.info(`📄 Processing business: ${url}`);
    log.info(`   ✅ Saved: ${businessData.businessName}`);
    log.info(`   Rating: ${businessData.rating}⭐ | Reviews: ${businessData.reviewCount}`);
    log.info(`📊 Progress: ${businessCount}/${maxResults} (${progress}%)`);
}
```

### After crawler (OUTSIDE handlers) - Lines 376, 383-385, 390, 393
```javascript
// ❌ WRONG - Actor.log doesn't exist outside handlers
Actor.log.info(`🔗 Starting URL: ${startUrl}`);
Actor.log.info('\\n🎉 Scraping completed!');
Actor.log.info(`   Total businesses scraped: ${businessCount}`);
Actor.log.info(`   Dataset items: ${info.itemCount}`);
Actor.log.error(`\\n❌ Fatal error: ${error.message}`);

// ✅ CORRECT - Use console.log
console.log(`🔗 Starting URL: ${startUrl}`);
console.log('\\n🎉 Scraping completed!');
console.log(`   Total businesses scraped: ${businessCount}`);
console.log(`   Dataset items: ${info.itemCount}`);
console.error(`\\n❌ Fatal error: ${error.message}`);
```

## Fix Strategy

### Option 1: Use console.log (Simplest)
Replace ALL `Actor.log.*` with `console.log()` throughout entire file.

```bash
# One-liner fix
cd /Users/ikaris/Desktop/apify-project/actors/yelp-scraper
sed -i '' 's/Actor\.log\.info(/console.log(/g' src/main.js
sed -i '' 's/Actor\.log\.error(/console.error(/g' src/main.js
```

### Option 2: Use log parameter (Best Practice)
- Top-level code: `console.log()`
- Inside handlers: `log.info()` (already correct)
- After crawler: `console.log()`

## Test Locally Before Deploy

```bash
cd /Users/ikaris/Desktop/apify-project/actors/yelp-scraper

# Test locally
apify run --input-file .actor/INPUT.json

# Should see:
# ✅ No errors
# ✅ Console output visible
# ✅ Data saved to dataset
```

## Quick Deploy After Fix

```bash
# 1. Fix all Actor.log calls
sed -i '' 's/Actor\.log\.info(/console.log(/g' src/main.js
sed -i '' 's/Actor\.log\.error(/console.error(/g' src/main.js

# 2. Test locally
apify run --input-file .actor/INPUT.json

# 3. Deploy
./deploy.sh
```

## Current Test Input (.actor/INPUT.json)

```json
{
  "searchQuery": "Restaurants",
  "location": "San Francisco, CA",
  "maxResults": 10
}
```

## Failed Run Details

- **Run ID**: zZIEfqO6sLjOtnv1w
- **Status**: FAILED
- **Duration**: 3.83s
- **CU Used**: 0.001063888888888889
- **Error Line**: src/main.js:39
- **Actor ID**: Oeoyu2AeWt54qnWFt
- **Build ID**: ifRcLZDmiBZkmX8m6

## Working Actor Examples

Check these Apify actors for correct logging:

```bash
# Example 1: Cheerio scraper template
curl -s https://raw.githubusercontent.com/apify/actor-templates/master/templates/js-cheerio/src/main.js | grep -A2 "log\."

# Example 2: Official docs
# https://docs.apify.com/sdk/js/docs/guides/actor-logging
```

## Apify SDK v3 Logging Rules

1. **Top-level (before/after crawler)**: Use `console.log()`
2. **Inside crawler handlers**: Use `log` parameter from `requestHandler({ log })`
3. **Never use**: `Actor.log` outside handlers
4. **Migration**: SDK v2 → v3 changed logging behavior

## Additional Notes

- Actor.log was partially fixed (lines 39-42) but 10+ more instances remain
- Build succeeded (34s) but run fails immediately on line 39
- GitHub repo: https://github.com/osaki-io/yelp-scraper
- Console URL: https://console.apify.com/actors/Oeoyu2AeWt54qnWFt

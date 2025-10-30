import { Actor } from 'apify';

const input = {
    searchQuery: "Restaurants",
    location: "San Francisco, CA",
    maxResults: 10,
    includeReviews: false,
    delayBetweenRequests: 500,
    maxRetries: 2
};

process.env.ACTOR_INPUT = JSON.stringify(input);
process.env.APIFY_LOCAL_STORAGE_DIR = './test_storage';

import('./src/main.js');

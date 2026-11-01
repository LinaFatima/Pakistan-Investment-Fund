// api/stocks/price-history.js
const cache = new Map();
const CACHE_DURATION = 60000; // 1 minute

export default async function handler(req, res) {
  const { symbol, days = '7' } = req.query;
  
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol parameter is required' });
  }
  
  // Check cache first
  const cacheKey = `price_history_${symbol}_${days}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`✅ Returning cached price history for ${symbol} (${days} days)`);
    return res.status(200).json(cached.data);
  }
  
  // Fetch with retry logic
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000;
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(
        `https://beta-restapi.sarmaaya.pk/api/stocks/price-history/${symbol}?days=${days}`,
        {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0'
          },
          signal: AbortSignal.timeout(10000)
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        
        // Store in cache
        cache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });
        
        console.log(`✅ Fetched price history for ${symbol} (${days} days)`);
        return res.status(200).json(data);
      }
      
      if (attempt < MAX_RETRIES && (response.status === 520 || response.status >= 500)) {
        console.log(`⚠️ Attempt ${attempt} failed for ${symbol}, retrying...`);
        await delay(RETRY_DELAY);
        continue;
      }
      
      return res.status(response.status).json({ error: `API returned ${response.status}` });
      
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        console.log(`⚠️ Attempt ${attempt} failed for ${symbol}, retrying...`);
        await delay(RETRY_DELAY);
        continue;
      }
      console.error(`❌ Failed to fetch price history for ${symbol}:`, error);
      return res.status(500).json({ error: 'Failed to fetch price history' });
    }
  }
}

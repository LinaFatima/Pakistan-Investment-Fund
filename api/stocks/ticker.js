// api/stocks/ticker.js
const cache = new Map();
const CACHE_DURATION = 60000; // 1 minute

export default async function handler(req, res) {
  const { index = 'KSE100' } = req.query;
  
  // Check cache first
  const cacheKey = `ticker_${index}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('✅ Returning cached data for', index);
    return res.status(200).json(cached.data);
  }
  
  // Fetch with retry logic (from Option 1)
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000;
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(
        `https://beta-restapi.sarmaaya.pk/api/stocks/ticker?index=${index}`,
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
        
        return res.status(200).json(data);
      }
      
      if (attempt < MAX_RETRIES && (response.status === 520 || response.status >= 500)) {
        await delay(RETRY_DELAY);
        continue;
      }
      
      return res.status(response.status).json({ error: `API returned ${response.status}` });
      
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY);
        continue;
      }
      return res.status(500).json({ error: 'Failed to fetch stock data' });
    }
  }
}
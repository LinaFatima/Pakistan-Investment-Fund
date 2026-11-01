import { supabase } from './supabaseClient.js'
import { PSXApiHandler } from './psxApiHandler.js'


// NEW: Fetch total daily volume from Sarmaaya API
async function fetchTotalVolumeFromAPI(symbol) {
  try {
    const API_URL = `https://beta-restapi.sarmaaya.pk/api/stocks/price-history/${symbol}?days=infinity`;

    const response = await fetch(API_URL, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      console.log(`Failed to fetch volume for ${symbol} - Status: ${response.status}`);
      return null;
    }

    const json = await response.json();

    if (json.success && json.response && json.response.length > 0) {
      // Get the latest entry (today's data)
      const sortedData = json.response.sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      const latestData = sortedData[0];
      const totalVolume = latestData.volume || 0;

      console.log(`✅ Fetched total volume for ${symbol}: ${totalVolume.toLocaleString()}`);
      return totalVolume;
    }

    console.log(`⚠️ No volume data found for ${symbol}`);
    return null;

  } catch (error) {
    console.error(`Error fetching volume for ${symbol}:`, error.message);
    return null;
  }
}
// NEW: Volume scraping function
async function scrapeVolumeFromDPS(symbol) {
  try {
    const url = `https://dps.psx.com.pk/company/${symbol}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.log(`Failed to fetch DPS page for ${symbol}`);
      return null;
    }

    const html = await response.text();

    // Extract volume using regex (adjust pattern based on actual HTML structure)
    // This regex looks for "Volume" followed by numbers
    const volumeMatch = html.match(/Volume[:\s]+([0-9,]+)/i);

    if (volumeMatch && volumeMatch[1]) {
      const volume = parseInt(volumeMatch[1].replace(/,/g, ''));
      console.log(`✅ Scraped volume for ${symbol}: ${volume}`);
      return volume;
    }

    // Alternative: Look for volume in table data
    const tableMatch = html.match(/<td[^>]*>Volume<\/td>\s*<td[^>]*>([0-9,]+)<\/td>/i);
    if (tableMatch && tableMatch[1]) {
      const volume = parseInt(tableMatch[1].replace(/,/g, ''));
      console.log(`✅ Scraped volume for ${symbol} (table): ${volume}`);
      return volume;
    }

    console.log(`⚠️ Volume not found in HTML for ${symbol}`);
    return null;

  } catch (error) {
    console.error(`Error scraping volume for ${symbol}:`, error.message);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const authToken = req.headers.authorization
  if (!authToken || authToken !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  // ⚡ OPTIMIZATION: Skip on weekends (market is closed Sat/Sun)
  // and outside trading hours 9:00 AM – 7:00 PM PKT on weekdays
  const nowPK = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' }))
  const dayOfWeek = nowPK.getDay() // 0=Sun, 6=Sat
  const hourPK = nowPK.getHours()  // 0–23 in Pakistan time

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    // Weekend — skip entirely
    return res.status(200).json({
      success: true,
      skipped: true,
      reason: 'weekend_market_closed',
      day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek],
      timestamp: new Date().toISOString()
    })
  }

  if (hourPK < 9 || hourPK >= 19) {
    // Weekday but outside 9:00 AM – 7:00 PM PKT — skip
    return res.status(200).json({
      success: true,
      skipped: true,
      reason: 'outside_trading_hours',
      pakistan_time: nowPK.toTimeString().slice(0, 8),
      active_window: '09:00–19:00 PKT',
      timestamp: new Date().toISOString()
    })
  }

  const fundType = req.query.fund_type || 'al_meezan'

  // Special handling for Pakistan ETF
  if (fundType === 'pakistan') {
    return await handlePakistanETF(req, res, fundType)
  }

  try {
    console.log('[' + new Date().toISOString() + '] Auto calculation started for fund: ' + fundType)

    // Get all active companies
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('symbol, weight_percentage')
      .eq('is_active', true)
      .eq('fund_type', fundType)

    if (companiesError || !companies || companies.length === 0) {
      return res.status(400).json({ success: false, error: 'No active companies for fund: ' + fundType })
    }

    const totalWeight = companies.reduce((sum, company) => sum + parseFloat(company.weight_percentage), 0)

    const companiesWithWeights = companies.map(company => ({
      ...company,
      actual_weight: parseFloat(company.weight_percentage) / 100
    }))

    console.log(`Total portfolio weight for ${fundType}: ${totalWeight.toFixed(2)}%`)

    // Get previous trading day's closing data
    const { data: latestCloseData, error: closeError } = await supabase
      .from('daily_closes')
      .select('market_date, closing_nav')
      .eq('fund_type', fundType)
      .order('market_date', { ascending: false })
      .limit(1)
      .single()

    if (closeError || !latestCloseData) {
      console.log('No previous closing data found - using fallback from nav_history')

      const { data: navFallback } = await supabase
        .from('nav_history')
        .select('nav_value')
        .eq('fund_type', fundType)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .single()

      if (!navFallback) {
        return res.status(400).json({
          success: false,
          error: 'No baseline data found for ' + fundType + ' - please initialize system first'
        })
      }

      latestCloseData = {
        market_date: new Date().toISOString().split('T')[0],
        closing_nav: navFallback.nav_value
      }
    }

    const previous_nav = parseFloat(latestCloseData.closing_nav)
    const previous_date = latestCloseData.market_date

    const api = new PSXApiHandler()
    let current_nav_difference = 0
    const results = []
    let has_price_changes = false
    let market_closed = true

    // Check if market is closed
    const { data: latestDailyCloseData, error: dailyCloseError } = await supabase
      .from('daily_closes')
      .select('symbol, closing_price')
      .eq('market_date', previous_date)
      .eq('fund_type', fundType)

    if (!dailyCloseError && latestDailyCloseData) {
      const dailyCloseMap = new Map(latestDailyCloseData.map(item => [item.symbol, parseFloat(item.closing_price)]))

      const { data: currentPricesData } = await supabase
        .from('current_prices')
        .select('symbol, price')
        .eq('fund_type', fundType)
        .in('symbol', Array.from(dailyCloseMap.keys()))

      if (currentPricesData) {
        market_closed = currentPricesData.every(priceData => {
          const dailyClosePrice = dailyCloseMap.get(priceData.symbol)
          const currentPrice = parseFloat(priceData.price)
          return Math.abs(currentPrice - dailyClosePrice) < 0.01
        })

        if (market_closed) {
          console.log('🛑 MARKET CLOSED DETECTED for ' + fundType)
        }
      }
    }

    // ⚡ OPTIMIZATION: Batch-load all closing prices for this fund+date in ONE query
    const { data: allClosingPrices } = await supabase
      .from('daily_closes')
      .select('symbol, closing_price')
      .eq('market_date', previous_date)
      .eq('fund_type', fundType)

    const closingPriceMap = new Map(
      (allClosingPrices || []).map(row => [row.symbol, parseFloat(row.closing_price)])
    )

    // Process each company
    for (const company of companiesWithWeights) {
      const symbol = company.symbol
      const investment_percentage = company.actual_weight

      try {
        // ⚡ OPTIMIZATION: Use pre-loaded map instead of per-company DB query
        const previous_day_close = closingPriceMap.get(symbol)

        if (previous_day_close === undefined) {
          console.log(`No closing price found for ${symbol} on ${previous_date} for ${fundType}`)

          const { data: currentPriceFallback } = await supabase
            .from('current_prices')
            .select('price')
            .eq('symbol', symbol)
            .eq('fund_type', fundType)
            .single()

          if (!currentPriceFallback) {
            console.log(`No fallback price for ${symbol} in ${fundType}, skipping`)
            continue
          }

          const current_price = currentPriceFallback.price

          // ⚡ OPTIMIZATION: No volume scraping in 15-min loop — total_volume kept as-is in DB
          await supabase
            .from('current_prices')
            .upsert({
              symbol: symbol,
              price: current_price,
              fund_type: fundType,
              updated_at: new Date().toISOString()
            }, { onConflict: 'symbol,fund_type' })

          results.push({
            symbol: symbol,
            current_price: current_price,
            previous_close: current_price,
            change_percent: 0,
            volume: 0,
            actual_weight: investment_percentage
          })

          continue
        }

        // Fetch current price from PSX API
        const price_data = await api.getCurrentPrice(symbol)

        if (!price_data.success) {
          console.log(`Failed to fetch price for ${symbol}: ${price_data.error}`)
          continue
        }

        const current_price = price_data.price
        const instantVolume = price_data.volume || 0

        // Calculate price change %
        const raw_price_change_percent = ((current_price - previous_day_close) / previous_day_close) * 100
        const price_change_percent = Math.round(raw_price_change_percent * 100) / 100

        if (Math.abs(price_change_percent) > 0.001) {
          has_price_changes = true
          market_closed = false
        }

        // ⚡ OPTIMIZATION: Only update price + instant volume; do NOT overwrite total_volume
        // total_volume is refreshed once per day by insert-daily-closes.js
        await supabase
          .from('current_prices')
          .upsert({
            symbol: symbol,
            price: current_price,
            volume: instantVolume,
            fund_type: fundType,
            updated_at: new Date().toISOString()
          }, { onConflict: 'symbol,fund_type' })

        // Calculate contribution to NAV difference
        const contribution = (price_change_percent / 100) * investment_percentage
        current_nav_difference += contribution

        results.push({
          symbol: symbol,
          current_price: current_price,
          previous_close: previous_day_close,
          change_percent: price_change_percent,
          volume: instantVolume,
          actual_weight: investment_percentage,
          contribution: contribution
        })

        console.log(`${symbol}: Prev=${previous_day_close}, Curr=${current_price}, Change=${price_change_percent.toFixed(2)}%, Vol=${instantVolume}, Weight=${(investment_percentage * 100).toFixed(2)}%`)

      } catch (error) {
        console.log(`Error processing ${symbol}: ${error.message}`)
        continue
      }
    }

    // Calculate new NAV
    const raw_current_nav = previous_nav + (current_nav_difference * previous_nav)
    const current_nav = Math.round(raw_current_nav * 10000) / 10000
    const rounded_nav_difference = Math.round(current_nav_difference * 1000000) / 1000000

    // Smart insertion/update logic
    const { data: latestNav } = await supabase
      .from('nav_history')
      .select('nav_value, id')
      .eq('fund_type', fundType)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single()

    let nav_history_id = null
    let nav_inserted = false
    let price_history_inserted = false
    let nav_updated = false

    const should_insert_new_records =
      !market_closed &&
      has_price_changes &&
      (!latestNav || Math.abs(current_nav - parseFloat(latestNav.nav_value)) > 0.0001)

    if (should_insert_new_records) {
      // INSERT NEW RECORDS
      const { data: newNav, error: navInsertError } = await supabase
        .from('nav_history')
        .insert({
          nav_value: current_nav,
          nav_difference: rounded_nav_difference,
          fund_type: fundType
        })
        .select()
        .single()

      if (navInsertError) {
        throw new Error(`Failed to store NAV: ${navInsertError.message}`)
      }

      nav_history_id = newNav.id
      nav_inserted = true

      // Store price history
      for (const result of results) {
        const rounded_price_change = Math.round(result.change_percent * 100) / 100

        await supabase
          .from('price_history')
          .insert({
            symbol: result.symbol,
            price: result.current_price,
            price_change_percent: rounded_price_change,
            volume: result.volume,
            nav_history_id: newNav.id,
            fund_type: fundType
          })
      }
      price_history_inserted = true

      console.log(`📊 NEW NAV for ${fundType}: ${current_nav.toFixed(4)} (Baseline: ${previous_nav}, Change: ${(current_nav_difference * 100).toFixed(4)}%)`)
    } else if (!market_closed && latestNav) {
      // UPDATE TIMESTAMPS ONLY
      await supabase
        .from('nav_history')
        .update({ calculated_at: new Date().toISOString() })
        .eq('id', latestNav.id)

      nav_history_id = latestNav.id
      nav_updated = true

      console.log(`🔄 MARKET OPEN for ${fundType}: NAV unchanged at ${current_nav.toFixed(4)}`)
    } else if (market_closed) {
      if (latestNav) {
        await supabase
          .from('nav_history')
          .update({ calculated_at: new Date().toISOString() })
          .eq('id', latestNav.id)

        nav_history_id = latestNav.id
        nav_updated = true
      }

      console.log(`🛑 MARKET CLOSED for ${fundType}: NAV unchanged at ${current_nav.toFixed(4)}`)
    }

    res.status(200).json({
      success: true,
      fund_type: fundType,
      nav: current_nav.toFixed(4),
      baseline_nav: previous_nav.toFixed(4),
      change_percent: (current_nav_difference * 100).toFixed(4),
      total_weight: totalWeight.toFixed(2),
      market_closed: market_closed,
      nav_inserted: nav_inserted,
      nav_updated: nav_updated,
      price_history_inserted: price_history_inserted,
      price_changes: has_price_changes,
      timestamp: new Date().toISOString(),
      companies_processed: results.length
    })

  } catch (error) {
    console.error('Auto calculation error for ' + fundType + ':', error)
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message
    })
  }
}

// Special handler for Pakistan ETF
// Special handler for Pakistan ETF
async function handlePakistanETF(req, res, fundType) {
  try {
    console.log('[' + new Date().toISOString() + '] Pakistan ETF price update started')

    const { data: companies } = await supabase
      .from('companies')
      .select('symbol, weight_percentage')
      .eq('is_active', true)
      .eq('fund_type', fundType)

    const api = new PSXApiHandler()

    // Fetch ETF price
    const etf_price_data = await api.getCurrentPrice('MZNPETF')

    if (!etf_price_data.success) {
      throw new Error('Failed to fetch MZNPETF price: ' + etf_price_data.error)
    }

    const current_etf_price = etf_price_data.price
    let etf_instant_volume = etf_price_data.volume || 0  // PSX API instant volume

    // ⚡ OPTIMIZATION: total_volume for ETF refreshed once/day by insert-daily-closes.js
    // Do not call Sarmaaya or scrape DPS on every 15-min invocation
    let etf_total_volume = 0

    // ⚡ OPTIMIZATION: Update price + instant volume only; do NOT overwrite total_volume
    await supabase
      .from('current_prices')
      .upsert({
        symbol: 'MZNPETF',
        price: current_etf_price,
        volume: etf_instant_volume,
        fund_type: fundType,
        updated_at: new Date().toISOString()
      }, { onConflict: 'symbol,fund_type' })

    // ⚡ OPTIMIZATION: Update component stocks — price + instant volume only, no Sarmaaya/DPS calls
    const results = []
    for (const company of companies) {
      const symbol = company.symbol

      try {
        const price_data = await api.getCurrentPrice(symbol)

        if (price_data.success) {
          const current_price = price_data.price
          const instant_volume = price_data.volume || 0

          // ⚡ OPTIMIZATION: Only update price + instant volume; do NOT overwrite total_volume
          // total_volume is refreshed once per day by insert-daily-closes.js
          await supabase
            .from('current_prices')
            .upsert({
              symbol: symbol,
              price: current_price,
              volume: instant_volume,
              fund_type: fundType,
              updated_at: new Date().toISOString()
            }, { onConflict: 'symbol,fund_type' })

          results.push({
            symbol: symbol,
            current_price: current_price,
            instant_volume: instant_volume,
            weight: company.weight_percentage
          })

          console.log(`${symbol}: Price=${current_price}, InstantVol=${instant_volume.toLocaleString()}`)
        }
      } catch (error) {
        console.log(`Error fetching ${symbol}: ${error.message}`)
      }
    }

    // Get previous ETF price
    const { data: prevNav } = await supabase
      .from('nav_history')
      .select('nav_value')
      .eq('fund_type', fundType)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single()

    const previous_etf_price = prevNav?.nav_value || current_etf_price
    const price_difference = current_etf_price - previous_etf_price
    const change_percent = previous_etf_price > 0
      ? ((price_difference / previous_etf_price) * 100)
      : 0

    const price_changed = Math.abs(price_difference) > 0.01

    if (price_changed) {
      // Insert NAV history
      const { data: newNav } = await supabase
        .from('nav_history')
        .insert({
          nav_value: current_etf_price,
          nav_difference: price_difference,
          fund_type: fundType
        })
        .select()
        .single()

      console.log(`📊 Pakistan ETF price updated: ${current_etf_price}`)

      // 🔥 CRITICAL: INSERT INTO price_history TABLE
      if (newNav && newNav.id) {
        // Insert ETF price history (use INSTANT volume for price_history)
        await supabase
          .from('price_history')
          .insert({
            symbol: 'MZNPETF',
            price: current_etf_price,
            price_change_percent: change_percent,
            volume: etf_instant_volume,    // Use INSTANT volume here (not total)
            total_volume: etf_total_volume, // Store total in separate column
            nav_history_id: newNav.id,
            fund_type: fundType
          })

        // Insert component stock price history (use INSTANT volume for price_history)
        for (const result of results) {
          // Get previous price for this stock
          const { data: prevStockPrice } = await supabase
            .from('price_history')
            .select('price')
            .eq('symbol', result.symbol)
            .eq('fund_type', fundType)
            .order('recorded_at', { ascending: false })
            .limit(1)
            .single()

          const previous_stock_price = prevStockPrice?.price || result.current_price
          const stock_price_difference = result.current_price - previous_stock_price
          const stock_change_percent = previous_stock_price > 0
            ? ((stock_price_difference / previous_stock_price) * 100)
            : 0

          await supabase
            .from('price_history')
            .insert({
              symbol: result.symbol,
              price: result.current_price,
              price_change_percent: stock_change_percent,
              volume: result.instant_volume || 0,    // Use INSTANT volume here
              total_volume: result.total_volume || 0, // Store total in separate column
              nav_history_id: newNav.id,
              fund_type: fundType
            })
        }

        console.log(`✅ Inserted ${results.length + 1} records into price_history for ${fundType}`)
      }
    }

    res.status(200).json({
      success: true,
      fund_type: fundType,
      etf_price: current_etf_price.toFixed(2),
      previous_price: previous_etf_price.toFixed(2),
      change: price_difference.toFixed(2),
      change_percent: change_percent.toFixed(2),
      instant_volume: etf_instant_volume,    // PSX API instant volume
      total_volume: etf_total_volume,        // Sarmaaya API total volume
      price_updated: price_changed,
      price_history_inserted: price_changed,
      timestamp: new Date().toISOString(),
      component_stocks_processed: results.length
    })

  } catch (error) {
    console.error('Pakistan ETF update error:', error)
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message
    })
  }
}
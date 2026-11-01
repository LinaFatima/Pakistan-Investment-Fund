// E:\stock-calculator-react\api\insert-daily-closes.js
import { supabase } from './supabaseClient.js'
import fetch from 'node-fetch'
import { parse } from 'node-html-parser'

// Configuration for both funds
const FUND_CONFIGS = {
  'al_meezan': {
    fund_name: 'Al Meezan Mutual Fund',
    fund_display_name: 'Al Meezan Mutual Fund'
  },
  'energy': {
    fund_name: 'Meezan Energy Fund',
    fund_display_name: 'Meezan Energy Fund'
  },
  'islamic': { // ADD THIS
    fund_name: 'Meezan Islamic Fund',
    fund_display_name: 'Meezan Islamic Fund'
  },
  'pakistan': { // ✅ ADD THIS
    fund_name: 'Meezan Pakistan ETF',
    fund_display_name: 'Meezan Pakistan ETF',
    is_etf: true,
    etf_symbol: 'MZNPETF'
  },
  'kse_meezan_index': {
    fund_name: 'KSE Meezan Index Fund',
    fund_display_name: 'KSE Meezan Index Fund'
  }
}

// Al Meezan website URL
const AL_MEEZAN_URL = 'https://www.almeezangroup.com/fund-prices/'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const authToken = req.headers.authorization
  if (!authToken || authToken !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  // Get fund_type from query parameter
  const fundType = req.query.fund_type || 'al_meezan'
  const config = FUND_CONFIGS[fundType]

  if (!config) {
    return res.status(400).json({ success: false, error: 'Invalid fund_type. Use: al_meezan or energy' })
  }

  try {
    console.log('[' + new Date().toISOString() + '] Daily closes job started for: ' + config.fund_name)

    let closingNav = null
    let marketDate = null
    let navDateStr = null

    // ✅ SPECIAL HANDLING FOR PAKISTAN ETF (Use database instead of scraping)
    if (fundType === 'pakistan') {
      // STEP 1a: Get current Pakistan date
      const todayPK = new Date().toLocaleDateString('en-PK', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
      const [day, month, year] = todayPK.split('/')
      marketDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      navDateStr = marketDate

      // STEP 1b: Get MZNPETF price from current_prices (this is our "NAV")
      const { data: etfPriceData, error: etfPriceError } = await supabase
        .from('current_prices')
        .select('price')
        .eq('symbol', 'MZNPETF')
        .eq('fund_type', 'pakistan')
        .single()

      if (etfPriceError || !etfPriceData) {
        throw new Error(`Could not find MZNPETF price for ${config.fund_name}`)
      }

      closingNav = parseFloat(etfPriceData.price)
      console.log(`💰 Using MZNPETF price as NAV for ${config.fund_name}: ${closingNav} (Date: ${marketDate})`)

    } else {
      // ✅ NORMAL FUNDS: Scrape NAV from Al Meezan website
      const scrapedData = await scrapeAlMeezanNAV(config.fund_display_name)

      if (!scrapedData.navValue) {
        throw new Error(`Could not find NAV for ${config.fund_name}. Website might not be updated yet.`)
      }

      closingNav = scrapedData.navValue
      navDateStr = scrapedData.navDate
      marketDate = navDateStr
    }

    console.log(`📅 Using market date: ${marketDate}`)


    // STEP 2: Get ACTIVE companies for this fund
    const activeCompanies = await getActiveCompanies(fundType)

    if (activeCompanies.length === 0) {
      throw new Error(`No active companies found for ${config.fund_name}`)
    }

    console.log(`📊 Found ${activeCompanies.length} active companies for ${config.fund_name}`)

    // ✅ SPECIAL: For Pakistan ETF, include MZNPETF in the list
    let companiesToFetch = [...activeCompanies]
    if (fundType === 'pakistan' && config.etf_symbol) {
      companiesToFetch.push(config.etf_symbol)
    }

    // STEP 3: Get current prices for these companies
    const currentPrices = await getCurrentPricesForCompanies(companiesToFetch, fundType)

    if (currentPrices.length === 0) {
      throw new Error(`No current prices found for companies of ${config.fund_name}`)
    }

    console.log(`💰 Found ${currentPrices.length} current prices for active companies`)

    // STEP 4: Delete existing entries for this date (if any) before inserting
    // This ensures we replace/update the data
    const { error: deleteError } = await supabase
      .from('daily_closes')
      .delete()
      .eq('market_date', marketDate)
      .eq('fund_type', fundType)

    if (deleteError) {
      console.warn(`⚠️ Could not delete existing entries: ${deleteError.message}`)
    } else {
      console.log(`🧹 Cleared existing daily closes for ${marketDate} in ${config.fund_name}`)
    }

    // STEP 5: Prepare batch insert data for ACTIVE companies only
    const insertData = currentPrices.map(price => ({
      symbol: price.symbol,
      closing_price: price.price,
      closing_nav: closingNav,
      market_date: marketDate,
      fund_type: fundType
    }))

    // STEP 6: Insert into daily_closes table
    const { data: insertedData, error: insertError } = await supabase
      .from('daily_closes')
      .insert(insertData)
      .select()

    if (insertError) {
      throw new Error(`Failed to insert daily closes: ${insertError.message}`)
    }

    console.log(`✅ Successfully inserted ${insertedData.length} daily closes for ${config.fund_name}`)

    // STEP 7: Also update nav_history with today's closing NAV
    await updateNavHistory(closingNav, fundType, marketDate)

    // ⚡ STEP 8: Refresh total_volume in current_prices (moved from 15-min cron to here)
    // This runs only once per day per fund, so the extra HTTP calls are acceptable.
    console.log(`📊 Refreshing total_volume for ${config.fund_name}...`)
    let totalVolumeUpdated = 0
    const symbolsToRefresh = companiesToFetch // already contains all active symbols (+ ETF if applicable)
    for (const sym of symbolsToRefresh) {
      try {
        const volRes = await fetch(
          `https://beta-restapi.sarmaaya.pk/api/stocks/price-history/${sym}?days=infinity`,
          { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
        )
        if (!volRes.ok) { console.log(`⚠️ volume fetch failed for ${sym}: ${volRes.status}`); continue }
        const volJson = await volRes.json()
        if (volJson.success && volJson.response && volJson.response.length > 0) {
          const sorted = volJson.response.sort((a, b) => new Date(b.date) - new Date(a.date))
          const latestVol = sorted[0].volume || 0
          await supabase
            .from('current_prices')
            .update({ total_volume: latestVol })
            .eq('symbol', sym)
            .eq('fund_type', fundType)
          console.log(`✅ total_volume updated for ${sym}: ${latestVol.toLocaleString()}`)
          totalVolumeUpdated++
        }
      } catch (volErr) {
        console.log(`⚠️ Could not update total_volume for ${sym}: ${volErr.message}`)
      }
    }
    console.log(`📊 total_volume refreshed for ${totalVolumeUpdated}/${symbolsToRefresh.length} symbols`)

    res.status(200).json({
      success: true,
      fund_type: fundType,
      fund_name: config.fund_name,
      timestamp: new Date().toISOString(),
      data: {
        market_date: marketDate,
        closing_nav: closingNav,
        companies_inserted: insertedData.length,
        total_volume_updated: totalVolumeUpdated,
        companies: currentPrices.map(p => ({ symbol: p.symbol, price: p.price }))
      }
    })

  } catch (error) {
    console.error(`❌ Daily closes job error for ${config.fund_name}:`, error)
    res.status(500).json({
      success: false,
      fund_type: fundType,
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }
}

// Function to scrape NAV from Al Meezan website - FIXED VERSION
async function scrapeAlMeezanNAV(fundName) {
  try {
    console.log(`🌐 Scraping Al Meezan website for ${fundName}...`)

    const response = await fetch(AL_MEEZAN_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    })

    if (!response.ok) {
      throw new Error(`Al Meezan website returned ${response.status}`)
    }

    const html = await response.text()
    const root = parse(html)

    // Find all tables on the page
    const tables = root.querySelectorAll('table')

    let navValue = null
    let navDate = null

    // Look through all tables
    for (const table of tables) {
      const rows = table.querySelectorAll('tr')

      for (const row of rows) {
        const cells = row.querySelectorAll('td')

        // We need at least 4 cells: Fund Name, Launch Date, Validity Date, Repurchase
        if (cells.length >= 4) {
          const currentFundName = cells[0]?.text?.trim()

          // Check if this row contains our fund name
          if (currentFundName && currentFundName.includes(fundName)) {
            const repurchaseCell = cells[3]?.text?.trim() || cells[2]?.text?.trim() // Repurchase is usually 4th or 3rd cell
            const validityDate = cells[2]?.text?.trim() || cells[1]?.text?.trim() // Validity Date is usually 3rd or 2nd cell

            // Extract NAV value from Repurchase column
            if (repurchaseCell) {
              // Match decimal number in the text
              const navMatch = repurchaseCell.match(/(\d+\.\d+)/)
              if (navMatch) {
                navValue = parseFloat(navMatch[0])
              }
            }

            // Extract date from Validity Date column
            if (validityDate) {
              // Try to parse date in format like "17 Dec 2025"
              const dateMatch = validityDate.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
              if (dateMatch) {
                const [_, day, monthStr, year] = dateMatch
                const months = {
                  'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
                  'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
                  'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
                }
                const month = months[monthStr] || '01'
                navDate = `${year}-${month}-${day.padStart(2, '0')}`
              }
            }

            if (navValue) {
              console.log(`✅ Found ${fundName}: NAV=${navValue}, Date=${navDate || 'N/A'}`)
              return { navValue, navDate }
            }
          }
        }
      }
    }

    throw new Error(`Could not find NAV for ${fundName} in any table`)

  } catch (error) {
    console.error('❌ Website scraping error:', error)

    // Fallback: Try to get NAV from nav_history table
    console.log('🔄 Attempting fallback to database...')
    return await getLastNavFromDatabase(fundName)
  }
}

// Fallback function: Get NAV from nav_history
async function getLastNavFromDatabase(fundType) {
  try {
    const { data, error } = await supabase
      .from('nav_history')
      .select('nav_value, calculated_at')
      .eq('fund_type', fundType)
      .order('calculated_at', { ascending: false })
      .limit(1)

    if (error) throw error

    if (data && data.length > 0) {
      const lastNav = data[0].nav_value
      const lastDate = new Date(data[0].calculated_at).toISOString().split('T')[0]
      console.log(`📊 Using last NAV from database: ${lastNav} (Date: ${lastDate})`)
      return { navValue: lastNav, navDate: lastDate }
    }

    throw new Error('No NAV found in database')
  } catch (error) {
    console.error('❌ Database fallback failed:', error)
    throw new Error('Could not retrieve NAV from any source')
  }
}

// Function to get ACTIVE companies for a fund
async function getActiveCompanies(fundType) {
  const { data, error } = await supabase
    .from('companies')
    .select('symbol')
    .eq('fund_type', fundType)
    .eq('is_active', true)
    .order('symbol', { ascending: true })

  if (error) throw error

  return data.map(item => item.symbol) || []
}

// Function to get current prices for specific companies
async function getCurrentPricesForCompanies(companySymbols, fundType) {
  const { data, error } = await supabase
    .from('current_prices')
    .select('symbol, price')
    .in('symbol', companySymbols)
    .eq('fund_type', fundType)
    .order('symbol', { ascending: true })

  if (error) throw error

  return data || []
}

// Function to update NAV history
async function updateNavHistory(navValue, fundType, marketDate) {
  try {
    // Get previous NAV to calculate difference
    const { data: previousNav } = await supabase
      .from('nav_history')
      .select('nav_value')
      .eq('fund_type', fundType)
      .order('calculated_at', { ascending: false })
      .limit(1)

    const previousValue = previousNav?.[0]?.nav_value || 0
    const navDifference = previousValue > 0 ? navValue - previousValue : 0

    // Check if NAV for this date already exists
    const { data: existingNav } = await supabase
      .from('nav_history')
      .select('id')
      .eq('fund_type', fundType)
      .eq('calculated_at', marketDate)

    if (existingNav && existingNav.length > 0) {
      // Update existing entry
      const { error } = await supabase
        .from('nav_history')
        .update({
          nav_value: navValue,
          nav_difference: navDifference,
          updated_at: new Date().toISOString()
        })
        .eq('fund_type', fundType)
        .eq('calculated_at', marketDate)

      if (error) throw error
      console.log(`📈 NAV history updated for ${marketDate}: ${navValue}`)
    } else {
      // Insert new entry
      const { error } = await supabase
        .from('nav_history')
        .insert({
          nav_value: navValue,
          nav_difference: navDifference,
          fund_type: fundType,
          calculated_at: marketDate
        })

      if (error) throw error
      console.log(`📈 NAV history inserted for ${marketDate}: ${navValue}`)
    }

  } catch (error) {
    console.error('❌ Failed to update NAV history:', error)
  }
}
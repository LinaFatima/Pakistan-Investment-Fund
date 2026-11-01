import { supabase } from './supabaseClient.js'

// 🔧 NEW: Configuration for both funds
const FUND_CONFIGS = {
  'al_meezan': {
    api_url: 'https://beta-restapi.sarmaaya.pk/api/mutual-funds/sunburst/ea6b13b2-f1e1-460a-904f-29a8747521da',
    fund_name: 'Al Meezan Mutual Fund'
  },
  'energy': {
    api_url: 'https://beta-restapi.sarmaaya.pk/api/mutual-funds/sunburst/25ec9842-c58c-4b3a-bb7c-eb2a08778fae',
    fund_name: 'Meezan Energy Fund'
  },
  'islamic': { // ADD THIS
    api_url: 'https://beta-restapi.sarmaaya.pk/api/mutual-funds/sunburst/698bac51-81aa-4e0c-ad94-93d630e1e2a4',
    fund_name: 'Meezan Islamic Fund'
  },
  'pakistan': { 
    api_url: 'https://beta-restapi.sarmaaya.pk/api/etf/etf-sunburst/MZNPETF', // ETF API
    fund_name: 'Meezan Pakistan ETF',
    is_etf: true // ✅ Flag to indicate it's an ETF
  },
  'kse_meezan_index': {
    api_url: 'https://beta-restapi.sarmaaya.pk/api/mutual-funds/sunburst/a0aac2a4-0ec4-4718-b2e5-4580f5cd8ddd',
    fund_name: 'KSE Meezan Index Fund'
  }
}

const PRICE_HISTORY_API_URL = 'https://beta-restapi.sarmaaya.pk/api/stocks/price-history'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const authToken = req.headers.authorization
  if (!authToken || authToken !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  // 🔧 NEW: Get fund_type from query parameter (default: al_meezan)
  const fundType = req.query.fund_type || 'al_meezan'
  const config = FUND_CONFIGS[fundType]

  if (!config) {
    return res.status(400).json({ success: false, error: 'Invalid fund_type. Use: al_meezan or energy' })
  }

  try {
    console.log('[' + new Date().toISOString() + '] Company sync started for: ' + config.fund_name)

    // STEP 1: Try to fetch from Sarmaya API 🔧 MODIFIED: Use config.api_url
    let apiData
    try {
      const response = await fetch(config.api_url, { // 🔧 CHANGED from SARMAYA_API_URL
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      })

      if (response.status === 403) {
        console.log(`❌ Sarmaya API returned 403 Forbidden for ${config.fund_name} - rate limiting detected`)
        return res.status(200).json({
          success: true,
          fund_type: fundType, // 🔧 ADDED
          timestamp: new Date().toISOString(),
          warning: 'Sarmaya API is temporarily blocking requests (rate limiting) - this is normal for public APIs',
          hasChanges: false,
          summary: {
            added: 0,
            updated: 0,
            activated: 0,
            deactivated: 0,
            totalApiCompanies: 0,
            totalDbCompanies: 0
          },
          changes: []
        })
      }

      if (!response.ok) {
        throw new Error(`Sarmaya API returned ${response.status}`)
      }

      apiData = await response.json()
      
    } catch (apiError) {
      console.error(`❌ Failed to fetch from Sarmaya API for ${config.fund_name}:`, apiError.message)
      throw apiError
    }

    if (!apiData.success || !apiData.response) {
      throw new Error('Invalid API response format')
    }

    // STEP 2: Extract all companies from nested sectors
    const apiCompanies = []
    for (const sector of apiData.response.sectors) {
      for (const company of sector.companies) {
        apiCompanies.push({
          symbol: company.symbol,
          weightage: parseFloat(company.weightage)
        })
      }
    }

    console.log(`📥 Fetched ${apiCompanies.length} companies from Sarmaya API for ${config.fund_name}`)

    // STEP 3: Get current companies from database 🔧 MODIFIED: Filter by fund_type
    const { data: dbCompanies, error: fetchError } = await supabase
      .from('companies')
      .select('id, company_name, symbol, weight_percentage, is_active')
      .eq('fund_type', fundType) // 🔧 ADDED

    if (fetchError) {
      throw new Error(`Database fetch failed: ${fetchError.message}`)
    }

    console.log(`💾 Found ${dbCompanies.length} companies in database for ${config.fund_name}`)

    // STEP 4: Create lookup maps
    const apiSymbolMap = new Map()
    apiCompanies.forEach(company => {
      apiSymbolMap.set(company.symbol, company.weightage)
    })

    const dbSymbolMap = new Map()
    dbCompanies.forEach(company => {
      dbSymbolMap.set(company.symbol, company)
    })

    // Track changes
    let addedCount = 0
    let updatedCount = 0
    let activatedCount = 0
    let deactivatedCount = 0
    const changes = []

    // STEP 5: Process API companies
    for (const apiCompany of apiCompanies) {
      const symbol = apiCompany.symbol
      const apiWeight = apiCompany.weightage
      const dbCompany = dbSymbolMap.get(symbol)

      if (!dbCompany) {
        // CASE 1: Company NOT in DB - ADD NEW COMPANY
        try {
          const companyName = await getCompanyName(symbol)
          
          // 🔧 MODIFIED: Add fund_type to insert
          const { error: insertError } = await supabase
            .from('companies')
            .insert({
              company_name: companyName,
              symbol: symbol,
              weight_percentage: apiWeight,
              is_active: true,
              fund_type: fundType // 🔧 ADDED
            })

          if (insertError) throw insertError

          // Fetch and insert last day closing price 🔧 MODIFIED: Pass fundType
          await fetchAndInsertLastClosingPrice(symbol, companyName, fundType)
          
          addedCount++
          changes.push({
            action: 'ADDED',
            symbol: symbol,
            name: companyName,
            weight: apiWeight
          })
          console.log(`✅ ADDED: ${symbol} (${companyName}) - Weight: ${apiWeight}% for ${config.fund_name}`)
        } catch (error) {
          console.error(`❌ Failed to add ${symbol}: ${error.message}`)
        }
      } else {
        // CASE 2: Company EXISTS in DB
        const needsWeightUpdate = Math.abs(dbCompany.weight_percentage - apiWeight) > 0.001
        const needsActivation = !dbCompany.is_active

        if (needsWeightUpdate || needsActivation) {
          try {
            const updates = {}
            
            if (needsWeightUpdate) {
              updates.weight_percentage = apiWeight
            }
            
            if (needsActivation) {
              updates.is_active = true
            }

            const { error: updateError } = await supabase
              .from('companies')
              .update(updates)
              .eq('id', dbCompany.id)

            if (updateError) throw updateError

            // If company was just activated 🔧 MODIFIED: Pass fundType
            if (needsActivation) {
              await fetchAndInsertLastClosingPrice(symbol, dbCompany.company_name, fundType)
            }

            if (needsWeightUpdate && needsActivation) {
              updatedCount++
              activatedCount++
              changes.push({
                action: 'UPDATED & ACTIVATED',
                symbol: symbol,
                name: dbCompany.company_name,
                oldWeight: dbCompany.weight_percentage,
                newWeight: apiWeight
              })
              console.log(`🔄 UPDATED & ACTIVATED: ${symbol} - Weight: ${dbCompany.weight_percentage}% → ${apiWeight}% for ${config.fund_name}`)
            } else if (needsWeightUpdate) {
              updatedCount++
              changes.push({
                action: 'UPDATED',
                symbol: symbol,
                name: dbCompany.company_name,
                oldWeight: dbCompany.weight_percentage,
                newWeight: apiWeight
              })
              console.log(`🔄 UPDATED: ${symbol} - Weight: ${dbCompany.weight_percentage}% → ${apiWeight}% for ${config.fund_name}`)
            } else if (needsActivation) {
              activatedCount++
              changes.push({
                action: 'ACTIVATED',
                symbol: symbol,
                name: dbCompany.company_name,
                weight: apiWeight
              })
              console.log(`✅ ACTIVATED: ${symbol} for ${config.fund_name}`)
            }
          } catch (error) {
            console.error(`❌ Failed to update ${symbol}: ${error.message}`)
          }
        }
      }
    }

    // STEP 6: Deactivate companies NOT in API
    for (const dbCompany of dbCompanies) {
      const symbol = dbCompany.symbol
      const isInApi = apiSymbolMap.has(symbol)

      if (!isInApi && dbCompany.is_active) {
        try {
          const { error: deactivateError } = await supabase
            .from('companies')
            .update({ is_active: false })
            .eq('id', dbCompany.id)

          if (deactivateError) throw deactivateError

          deactivatedCount++
          changes.push({
            action: 'DEACTIVATED',
            symbol: symbol,
            name: dbCompany.company_name,
            reason: `Not in ${config.fund_name} anymore`
          })
          console.log(`⛔ DEACTIVATED: ${symbol} (${dbCompany.company_name}) - Not in ${config.fund_name}`)
        } catch (error) {
          console.error(`❌ Failed to deactivate ${symbol}: ${error.message}`)
        }
      }
    }

    // STEP 7: Summary
    const hasChanges = addedCount > 0 || updatedCount > 0 || activatedCount > 0 || deactivatedCount > 0

    if (!hasChanges) {
      console.log(`✨ No changes detected for ${config.fund_name} - all companies are up to date`)
    } else {
      console.log(`\n📊 SYNC SUMMARY for ${config.fund_name}:`)
      console.log(`   ➕ Added: ${addedCount}`)
      console.log(`   🔄 Updated: ${updatedCount}`)
      console.log(`   ✅ Activated: ${activatedCount}`)
      console.log(`   ⛔ Deactivated: ${deactivatedCount}`)
    }

    res.status(200).json({
      success: true,
      fund_type: fundType, // 🔧 ADDED
      fund_name: config.fund_name, // 🔧 ADDED
      timestamp: new Date().toISOString(),
      hasChanges: hasChanges,
      summary: {
        added: addedCount,
        updated: updatedCount,
        activated: activatedCount,
        deactivated: deactivatedCount,
        totalApiCompanies: apiCompanies.length,
        totalDbCompanies: dbCompanies.length
      },
      changes: changes
    })

  } catch (error) {
    console.error(`❌ Company sync error for ${config ? config.fund_name : 'unknown fund'}:`, error)
    res.status(500).json({ 
      success: false, 
      error: 'Server error: ' + error.message 
    })
  }
}

// 🔧 MODIFIED: Add fundType parameter
async function fetchAndInsertLastClosingPrice(symbol, companyName, fundType) {
  try {
    console.log(`📊 Fetching price history for ${symbol} (${fundType})...`)
    
    const response = await fetch(`${PRICE_HISTORY_API_URL}/${symbol}?days=30`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })

    if (!response.ok) {
      throw new Error(`Price history API returned ${response.status}`)
    }

    const priceData = await response.json()
    
    if (!priceData.success || !priceData.response || priceData.response.length === 0) {
      throw new Error('No price history data available')
    }

    const priceHistory = priceData.response
    let lastClosingPriceEntry
    
    if (priceHistory.length >= 2) {
      lastClosingPriceEntry = priceHistory[1]
    } else {
      lastClosingPriceEntry = priceHistory[0]
    }

    const lastClosingPrice = lastClosingPriceEntry.price
    const marketDate = new Date(lastClosingPriceEntry.date).toISOString().split('T')[0]
    
    console.log(`💰 Found last closing price for ${symbol}: ${lastClosingPrice} on ${marketDate}`)

    // Get the correct closing_nav for this market date 🔧 MODIFIED: Filter by fund_type
    const { data: existingDailyCloses, error: fetchNavError } = await supabase
      .from('daily_closes')
      .select('closing_nav')
      .eq('market_date', marketDate)
      .eq('fund_type', fundType) // 🔧 ADDED
      .limit(1)

    if (fetchNavError) {
      throw new Error(`Failed to fetch NAV for date ${marketDate}: ${fetchNavError.message}`)
    }

    let closingNav = 0
    
    if (existingDailyCloses && existingDailyCloses.length > 0) {
      closingNav = existingDailyCloses[0].closing_nav
      console.log(`📈 Using existing NAV for ${marketDate} (${fundType}): ${closingNav}`)
    } else {
      console.warn(`⚠️ No NAV found for market date ${marketDate} in ${fundType}. This might indicate a data gap.`)
    }

    // Insert into daily_closes table 🔧 MODIFIED: Add fund_type
    const { error: dailyCloseError } = await supabase
      .from('daily_closes')
      .insert({
        symbol: symbol,
        closing_price: lastClosingPrice,
        closing_nav: closingNav,
        market_date: marketDate,
        fund_type: fundType // 🔧 ADDED
      })

    if (dailyCloseError) {
      if (dailyCloseError.code !== '23505') {
        throw dailyCloseError
      }
      console.log(`ℹ️ Daily close entry already exists for ${symbol} on ${marketDate} in ${fundType}`)
    }

    // Update current_prices table 🔧 MODIFIED: Add fund_type
    const currentPriceEntry = priceHistory[0]
    const { error: currentPriceError } = await supabase
      .from('current_prices')
      .upsert({
        symbol: symbol,
        price: currentPriceEntry.price,
        volume: currentPriceEntry.volume,
        fund_type: fundType, // 🔧 ADDED
        updated_at: new Date().toISOString()
      })

    if (currentPriceError) {
      throw currentPriceError
    }

    console.log(`✅ Updated price data for ${symbol} (${fundType}): Current=${currentPriceEntry.price}, Last Close=${lastClosingPrice}, NAV=${closingNav}`)
    
  } catch (error) {
    console.error(`❌ Failed to fetch/insert price data for ${symbol}: ${error.message}`)
  }
}

// Helper function to get company name from symbol
async function getCompanyName(symbol) {
  const companyNames = {
    'LUCK': 'Lucky Cement',
    'HUBC': 'The Hub Power Company Limited',
    'OGDC': 'Oil & Gas Development Company Limited',
    'MARI': 'Mari Energies Limited',
    'MEBL': 'Meezan Bank Limited',
    'ENGROH': 'Engro Holdings Limited',
    'PSO': 'Pakistan State Oil Company Limited',
    'CHCC': 'Cherat Cement Company Limited',
    'FFC': 'Fauji Fertilizer Company Limited',
    'SYS': 'Systems Limited',
    'KEL': 'K-Electric Limited',
    'PPL': 'Pakistan Petroleum Limited',
    'KOHC': 'Kohat Cement Company Limited',
    // ✅ ADD THESE FOR PAKISTAN ETF
    'MLCF': 'Maple Leaf Cement Factory Limited',
    'DGKC': 'D.G. Khan Cement Company Limited',
    'PAEL': 'Pakistan Cables Limited',
    'ATRL': 'Attock Refinery Limited'
  }

  return companyNames[symbol] || `${symbol} Company`
}
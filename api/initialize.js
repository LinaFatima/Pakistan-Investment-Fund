import { supabase } from './supabaseClient.js'
import { PSXApiHandler } from './psxApiHandler.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    const { initial_nav } = req.body

    if (!initial_nav || initial_nav <= 0) {
      return res.status(400).json({ success: false, error: 'Please enter a valid Initial NAV value' })
    }

    // Check if already initialized
    const { data: existingNav, error: checkError } = await supabase
      .from('nav_history')
      .select('id')
      .limit(1)

    if (existingNav && existingNav.length > 0) {
      return res.status(400).json({ success: false, error: 'System already initialized. Use Calculate button instead.' })
    }

    // Get all active companies
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('symbol, weight_percentage, company_name')
      .eq('is_active', true)

    if (companiesError || !companies || companies.length === 0) {
      return res.status(400).json({ success: false, error: 'No active companies found' })
    }

    const api = new PSXApiHandler()
    let stored_count = 0
    const errors = []
    const prices_to_store = []

    // Fetch current prices for all companies
    for (const company of companies) {
      const symbol = company.symbol

      try {
        const price_data = await api.getCurrentPrice(symbol)

        if (!price_data.success) {
          errors.push(`${symbol}: ${price_data.error}`)
          console.log(`Failed to fetch price for ${symbol}`)
          continue
        }

        const current_price = price_data.price
        const volume = price_data.volume

        // Store in current_prices
        const { error: upsertError } = await supabase
  .from('current_prices')
  .upsert({
    symbol: symbol,
    price: current_price,
    volume: volume,
    updated_at: new Date().toISOString()
  }, {
    onConflict: 'symbol'  
  })

        if (upsertError) {
          errors.push(`${symbol}: ${upsertError.message}`)
          continue
        }

        prices_to_store.push({
          symbol: symbol,
          price: current_price,
          volume: volume
        })

        stored_count++

      } catch (error) {
        errors.push(`${symbol}: ${error.message}`)
        continue
      }
    }

    if (stored_count === 0) {
      return res.status(400).json({
        success: false,
        error: 'Failed to fetch prices for any companies',
        errors: errors
      })
    }

    // Store initial NAV in nav_history
    const { data: newNav, error: navError } = await supabase
      .from('nav_history')
      .insert({
        nav_value: initial_nav,
        nav_difference: 0
      })
      .select()
      .single()

    if (navError) {
      return res.status(500).json({ success: false, error: 'Failed to store initial NAV: ' + navError.message })
    }

    // Store initial price history
    for (const price of prices_to_store) {
      await supabase
        .from('price_history')
        .insert({
          symbol: price.symbol,
          price: price.price,
          price_change_percent: 0,
          volume: price.volume,
          nav_history_id: newNav.id
        })
    }

    res.status(200).json({
      success: true,
      message: 'Initialization successful',
      initial_nav: parseFloat(initial_nav).toFixed(4),
      prices_stored: stored_count,
      errors: errors,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Initialization error:', error)
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message
    })
  }
}
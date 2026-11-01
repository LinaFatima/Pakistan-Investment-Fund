export class PSXApiHandler {
  base_url = 'https://dps.psx.com.pk'

  async getCurrentPrice(symbol) {
    try {
      const url = `${this.base_url}/timeseries/int/${symbol.toUpperCase()}`
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://dps.psx.com.pk/'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      
      if (!data || !data.data || data.data.length === 0) {
        return {
          success: false,
          error: `No data available for ${symbol}`
        }
      }

      const trades = data.data
      const current_price = parseFloat(trades[0][1])
      const volume = parseInt(trades[0][2])
      const timestamp = trades[0][0]

      return {
        success: true,
        symbol: symbol.toUpperCase(),
        price: current_price,
        volume: volume,
        timestamp: timestamp,
        datetime: new Date(timestamp * 1000).toISOString()
      }
    } catch (error) {
      console.error(`PSX API Error for ${symbol}:`, error)
      return {
        success: false,
        error: error.message
      }
    }
  }
}
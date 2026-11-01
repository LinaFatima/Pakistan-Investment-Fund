import { supabase } from './supabase'

export class NavCalculator {
  static async calculateNAV() {
    try {
      const { data, error } = await supabase.rpc('calculate_nav')
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('NAV Calculation error:', error)
      return { success: false, error: error.message }
    }
  }

  static async initializeSystem(initialNav) {
    try {
      // NEW - Call Vercel API endpoint instead of Supabase function
      const response = await fetch('/api/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          initial_nav: initialNav
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Initialization failed')
      }

      return data
    } catch (error) {
      console.error('Initialization error:', error)
      return { success: false, error: error.message }
    }
  }
}
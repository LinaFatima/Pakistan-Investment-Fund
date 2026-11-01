import { supabase } from './supabase'
import { adminPost } from './adminApi'

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
      const data = await adminPost('/api/initialize', { initial_nav: initialNav })

      return data
    } catch (error) {
      console.error('Initialization error:', error)
      return { success: false, error: error.message }
    }
  }
}
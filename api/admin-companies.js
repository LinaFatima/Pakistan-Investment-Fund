import { supabase } from './supabaseClient.js'
import { requireAdmin } from './_adminAuth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }
  if (!requireAdmin(req, res)) return

  const { action, id, company_name, symbol, weight_percentage, fund_type, is_active } = req.body || {}

  try {
    let query

    switch (action) {
      case 'add': {
        const weight = parseFloat(weight_percentage)
        if (!company_name || !symbol || !fund_type || Number.isNaN(weight)) {
          return res.status(400).json({ success: false, error: 'company_name, symbol, weight_percentage and fund_type are required' })
        }
        query = supabase.from('companies').insert({
          company_name,
          symbol: String(symbol).toUpperCase(),
          weight_percentage: weight,
          fund_type
        })
        break
      }
      case 'update': {
        const weight = parseFloat(weight_percentage)
        if (!id || !company_name || !symbol || Number.isNaN(weight)) {
          return res.status(400).json({ success: false, error: 'id, company_name, symbol and weight_percentage are required' })
        }
        query = supabase.from('companies').update({
          company_name,
          symbol: String(symbol).toUpperCase(),
          weight_percentage: weight
        }).eq('id', id)
        break
      }
      case 'toggle': {
        if (!id || typeof is_active !== 'boolean') {
          return res.status(400).json({ success: false, error: 'id and is_active are required' })
        }
        query = supabase.from('companies').update({ is_active }).eq('id', id)
        break
      }
      case 'delete': {
        if (!id) return res.status(400).json({ success: false, error: 'id is required' })
        query = supabase.from('companies').delete().eq('id', id)
        break
      }
      default:
        return res.status(400).json({ success: false, error: 'Unknown action' })
    }

    const { error } = await query
    if (error) throw error
    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('Admin company error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
}

import { createClient } from '@supabase/supabase-js'

// Server-side only. Prefers the service_role key (bypasses RLS, never sent to the browser).
// Falls back to the anon key so the app keeps working until SUPABASE_SERVICE_ROLE_KEY is set.
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

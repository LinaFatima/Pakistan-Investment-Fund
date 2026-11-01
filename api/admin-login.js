import { supabase } from './supabaseClient.js'
import { signToken, verifyPassword, hashPassword, isHashed } from './_adminAuth.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const { username, password } = req.body || {}
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required' })
  }

  try {
    const { data: user } = await supabase
      .from('users')
      .select('id, username, password')
      .eq('username', username)
      .maybeSingle()

    // Always run a password check so timing doesn't reveal whether the username exists
    const ok = await verifyPassword(password, user?.password)

    if (!user || !ok) {
      await sleep(500)
      return res.status(401).json({ success: false, error: 'Invalid username or password' })
    }

    // Transparently upgrade a legacy plaintext password to a salted hash on first login
    if (!isHashed(user.password)) {
      await supabase.from('users').update({ password: await hashPassword(password) }).eq('id', user.id)
    }

    const { token, expiresAt } = signToken(user)
    return res.status(200).json({
      success: true,
      token,
      expiresAt,
      user: { id: user.id, username: user.username }
    })
  } catch (error) {
    console.error('Admin login error:', error)
    return res.status(500).json({ success: false, error: 'Login failed' })
  }
}

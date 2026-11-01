import crypto from 'crypto'

const SESSION_TTL_MS = 12 * 60 * 60 * 1000

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET is not configured (min 32 chars)')
  }
  return secret
}

const b64 = (buf) => Buffer.from(buf).toString('base64url')

export function signToken(user) {
  const expiresAt = Date.now() + SESSION_TTL_MS
  const payload = b64(JSON.stringify({ id: user.id, username: user.username, exp: expiresAt }))
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url')
  return { token: `${payload}.${sig}`, expiresAt }
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null

  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return data.exp > Date.now() ? data : null
  } catch {
    return null
  }
}

// Returns the admin session, or sends a 401 and returns null.
export function requireAdmin(req, res) {
  let session = null
  try {
    const header = req.headers.authorization || ''
    session = verifyToken(header.startsWith('Bearer ') ? header.slice(7) : '')
  } catch (error) {
    console.error('Admin auth error:', error.message)
  }
  if (!session) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return null
  }
  return session
}

const scrypt = (password, salt) =>
  new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)))
  )

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(password, salt)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export const isHashed = (stored) => typeof stored === 'string' && stored.startsWith('scrypt$')

export async function verifyPassword(password, stored) {
  if (isHashed(stored)) {
    const [, saltB64, keyB64] = stored.split('$')
    const expected = Buffer.from(keyB64, 'base64')
    const actual = await scrypt(password, Buffer.from(saltB64, 'base64'))
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
  }
  // Legacy plaintext row: constant-time compare (the login endpoint upgrades it to a hash on success)
  const a = crypto.createHash('sha256').update(String(password)).digest()
  const b = crypto.createHash('sha256').update(String(stored ?? '')).digest()
  return crypto.timingSafeEqual(a, b) && stored != null
}

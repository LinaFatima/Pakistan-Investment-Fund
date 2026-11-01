const SESSION_KEYS = ['admin_authenticated', 'admin_username', 'admin_id', 'admin_token', 'admin_expires']

export const clearAdminSession = () => SESSION_KEYS.forEach((k) => localStorage.removeItem(k))

export const getAdminToken = () => {
  const token = localStorage.getItem('admin_token')
  const expires = Number(localStorage.getItem('admin_expires'))
  return token && expires > Date.now() ? token : null
}

// POST to a protected /api endpoint with the admin session token.
export async function adminPost(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAdminToken() ?? ''}`
    },
    body: JSON.stringify(body)
  })

  const data = await response.json().catch(() => ({}))

  if (response.status === 401) {
    clearAdminSession()
    window.location.href = '/admin/login'
    throw new Error('Session expired. Please log in again.')
  }
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Request failed')
  }
  return data
}

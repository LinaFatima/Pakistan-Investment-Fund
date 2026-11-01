import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const Login = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data.success) {
        setError(data.error || 'Invalid username or password')
        setLoading(false)
        return
      }

      localStorage.setItem('admin_authenticated', 'true')
      localStorage.setItem('admin_username', data.user.username)
      localStorage.setItem('admin_id', data.user.id)
      localStorage.setItem('admin_token', data.token)
      localStorage.setItem('admin_expires', String(data.expiresAt))

      window.location.href = '/admin/dashboard'

    } catch (err) {
      console.error('Login error:', err)
      setError('Login failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <h2>🔐 Admin Login</h2>

      {error && (
        <div style={{ background: '#f8d7da', color: '#721c24', padding: '10px', borderRadius: '5px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: '20px' }}>
        <a href="/" style={{ color: ' #111827' }}>← Back to Main screen</a>
      </p>
    </div>
  )
}

export default Login
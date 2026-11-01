import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabase'

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
      console.log('Login attempt for username:', username)

      // Query the users table in Supabase
      const { data: user, error: queryError } = await supabase
        .from('users')
        .select('id, username, password')
        .eq('username', username)
        .single()

      console.log('Query result:', user)
      console.log('Query error:', queryError)

      if (queryError || !user) {
        console.log('No user found or query error')
        setError('Invalid username or password')
        setLoading(false)
        return
      }

      // Simple password check - works with plain text passwords
      if (password === user.password) {
        console.log('Password matches, setting localStorage and navigating...')

        localStorage.setItem('admin_authenticated', 'true')
        localStorage.setItem('admin_username', user.username)
        localStorage.setItem('admin_id', user.id)

        console.log('LocalStorage set, navigating to dashboard...')
        // FORCE redirect - this will work reliably
        window.location.href = '/admin/dashboard'

      } else {
        console.log('Password does not match')
        setError('Invalid username or password')
      }

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
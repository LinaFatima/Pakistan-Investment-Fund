import React, { createContext, useState, useContext, useEffect } from 'react'

import { clearAdminSession, getAdminToken } from '../services/adminApi'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log('AuthProvider checking authentication...')
    
    const isAuthenticated = localStorage.getItem('admin_authenticated') === 'true'
    const username = localStorage.getItem('admin_username')
    const userId = localStorage.getItem('admin_id')

    console.log('Auth check - isAuthenticated:', isAuthenticated, 'username:', username)

    if (isAuthenticated && username && getAdminToken()) {
      setUser({
        id: userId,
        username: username,
        isAuthenticated: true
      })
      console.log('User authenticated:', username)
    } else {
      console.log('User not authenticated')
    }
    setLoading(false)
  }, [])

  const login = async (username, password) => {
    return { success: true }
  }

  const logout = async () => {
    clearAdminSession()
    setUser(null)
    console.log('User logged out')
    return { error: null }
  }

  const value = {
    user,
    login,
    logout,
    loading
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
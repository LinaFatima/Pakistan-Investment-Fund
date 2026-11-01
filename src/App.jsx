import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Calculator from './components/Calculator'
import Login from './components/Admin/Login'
import Dashboard from './components/Admin/Dashboard'
import MainScreen from './components/Common/MainScreen'
import StockDetail from './components/StockDetail'

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth()
  
  if (loading) return <div>Loading...</div>
  
  return user ? children : <Navigate to="/admin/login" />
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/" element={<MainScreen />} />
             <Route path="/calculator" element={<Calculator fundType="fund1" />} />
              <Route path="/calculator" element={<Calculator fundType="fund2" />} />
            <Route path="/admin/login" element={<Login />} />
            <Route 
              path="/admin/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route path="/admin" element={<Navigate to="/admin/dashboard" />} />
            <Route path="/stock/:symbol" element={<StockDetail />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  )
}

export default App
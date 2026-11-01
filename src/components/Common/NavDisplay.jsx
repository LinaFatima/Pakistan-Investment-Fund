import React from 'react'
import { autoFormatDate, formatPakistanTimeOnly } from '../../utils/dateUtils'

const NavDisplay = ({ lastNav, previousDayNav }) => {
  if (!lastNav) return null

  // Calculate change and percentage (same logic as Dashboard.jsx)
  const currentNavValue = Number(lastNav.nav_value)
  const prevDayNavValue = previousDayNav ? Number(previousDayNav.nav_value) : null
  
  let navChange = 0
  let changePercent = 0
  let hasChange = false
  
  if (currentNavValue !== null && prevDayNavValue !== null && prevDayNavValue !== 0) {
    navChange = currentNavValue - prevDayNavValue
    changePercent = (navChange / prevDayNavValue) * 100
    hasChange = true
  }
  
  const isPositive = navChange >= 0

  return (
    <div style={{ background: '#f8f9fa', border: '1px solid #e0e0e0', padding: '25px', borderRadius: '10px', marginBottom: '30px', textAlign: 'center' }}>
      <h3 style={{ marginBottom: '10px', color: '#333' }}>Current NAV</h3>
      <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#333' }}>
        {currentNavValue.toFixed(4)}
      </div>

      {/* Change and Percentage */}
      {hasChange && (
        <div style={{ 
          fontSize: '18px', 
          fontWeight: '600', 
          marginTop: '10px',
          color: isPositive ? '#10b981' : '#ef4444'
        }}>
          {isPositive ? '+' : ''}{navChange.toFixed(2)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
        </div>
      )}

      {/* Previous Day NAV */}
      {prevDayNavValue && (
        <div style={{ fontSize: '14px', marginTop: '10px', color: '#666' }}>
          Previous Day NAV: {prevDayNavValue.toFixed(4)}
        </div>
      )}

      <small style={{ color: '#888' }}>Last Updated: {lastNav.calculated_at}</small>
    </div>
  )
}

export default NavDisplay
// Format currency
export const formatCurrency = (amount) => {
  return 'PKR ' + Number(amount).toFixed(2)
}

// Calculate percentage change
export const calculatePercentageChange = (oldValue, newValue) => {
  if (oldValue === 0) return 0
  return ((newValue - oldValue) / oldValue) * 100
}

// Format date for display
export const formatDate = (dateString) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Validate stock symbol format
export const validateSymbol = (symbol) => {
  return /^[A-Z0-9]{2,10}$/.test(symbol)
}

// Sanitize input
export const sanitizeInput = (data) => {
  return data.trim()
}
import React from 'react'
import { formatDate } from '../../utils/helpers'

const PriceGrid = ({ prices }) => {
  if (!prices || prices.length === 0) {
    return <p>No prices available</p>
  }

  return (
    <div className="prices-grid">
      {prices.map(price => (
        <div key={price.symbol} className="price-card">
          <strong style={{ color: '#667eea', fontSize: '18px' }}>{price.symbol}</strong>
          <p style={{ margin: '5px 0' }}>{price.companies?.company_name}</p>
          <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '10px 0' }}>
            PKR {Number(price.price).toFixed(2)}
          </p>
          <small style={{ color: '#666' }}>
            Updated: {formatDate(price.updated_at)}
          </small>
        </div>
      ))}
    </div>
  )
}

export default PriceGrid
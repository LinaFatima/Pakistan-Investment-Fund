import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import NavChart from './Common/Navchart';
import Header from './Admin/Header';
import { autoFormatDate } from '../utils/dateUtils';

const StockDetail = () => {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [stockData, setStockData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadStockData();
    const interval = setInterval(loadStockData, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, [symbol]);

  useEffect(() => {
    if (stockData) {
      document.title = `${stockData.symbol} - Pakistan Investment Fund`;
    }
  }, [stockData]);

  const loadStockData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch company info from companies table
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('symbol', symbol)
        .limit(1);

      if (companyError) throw companyError;
      if (!companyData || companyData.length === 0) {
        throw new Error('Stock not found');
      }

      const company = companyData[0];

      // 2. Fetch current price
      const { data: currentPriceData, error: priceError } = await supabase
        .from('current_prices')
        .select('price, updated_at, total_volume')
        .eq('symbol', symbol)
        .limit(1);

      if (priceError) throw priceError;
      if (!currentPriceData || currentPriceData.length === 0) {
        throw new Error('Current price not found');
      }

      const currentPrice = currentPriceData[0];

      // 3. Fetch LDCP from daily_closes
      const { data: ldcpData, error: ldcpError } = await supabase
        .from('daily_closes')
        .select('closing_price, market_date')
        .eq('symbol', symbol)
        .order('market_date', { ascending: false })
        .limit(1);

      if (ldcpError) console.warn('LDCP not found:', ldcpError);

      const ldcp = ldcpData && ldcpData.length > 0 ? ldcpData[0] : null;

      // Calculate price change and percentage
      const currentPriceValue = parseFloat(currentPrice.price);
      const ldcpValue = ldcp ? parseFloat(ldcp.closing_price) : 0;
      const priceChange = currentPriceValue - ldcpValue;
      const changePercent = ldcpValue !== 0 ? (priceChange / ldcpValue) * 100 : 0;
      const isPositive = priceChange >= 0;

      setStockData({
        symbol: company.symbol,
        companyName: company.company_name,
        isShariahCompliant: company.is_shariah_compliant || false,
        currentPrice: currentPriceValue,
        ldcp: ldcpValue,
        priceChange,
        changePercent,
        isPositive,
        updatedAt: currentPrice.updated_at,
        volume: currentPrice.total_volume || 0,
        fundType: company.fund_type
      });

    } catch (err) {
      console.error('Error loading stock data:', err);
      setError(err.message || 'Failed to load stock data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-spin" style={{
          border: '4px solid rgba(102, 126, 234, 0.1)',
          borderTopColor: '#667eea',
          borderRadius: '50%',
          width: '32px',
          height: '32px',
          marginRight: '12px'
        }}></div>
        <div>Loading stock details...</div>
      </div>
    );
  }

  if (error || !stockData) {
    return (
      <div style={{ minHeight: '100vh', background: 'white' }}>
        <div className="dashboard-header">
          <div className="dashboard-header-content">
            <h1
              className="dashboard-main-heading"
              onClick={() => navigate('/')}
              style={{ cursor: 'pointer' }}
            >
              📊 Pakistan Investment Fund
            </h1>
          </div>
        </div>
        <div style={{ padding: '32px', maxWidth: '1280px', margin: '0 auto' }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              marginBottom: '20px',
              padding: '8px 16px',
              cursor: 'pointer',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600'
            }}
          >
            ← Back
          </button>
          <div style={{ color: '#dc2626', padding: '20px', background: '#fee', borderRadius: '8px' }}>
            {error || 'Stock not found'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'white' }}>
      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-header-content">
          <h1
            className="dashboard-main-heading"
            onClick={() => navigate('/')}
            style={{ cursor: 'pointer' }}
          >
            📊 Pakistan Investment Fund
          </h1>
          <div className="dashboard-user-section">
            <div className="dashboard-center-group"></div>
            <button
              onClick={() => navigate(-1)}
              style={{
                padding: '8px 16px',
                background: 'white',
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                cursor: 'pointer',
                fontWeight: '600',
                color: '#374151',
                fontSize: '14px'
              }}
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      {/* Stock Market Header with Slider */}
      <Header />

      {/* Main Content */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 16px' }}>

        {/* Stock Info Card */}
        <div className="fund-card">
          <div className="fund-header">
            {/* Left - Stock Info */}
            <div className="fund-left">
              <div className="fund-avatar" style={{ backgroundColor: '#1F2433', color: '#ffffff' }}>
                {stockData.symbol.substring(0, 2)}
              </div>
              <div className="fund-info">
                <h2 className="fund-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {stockData.symbol}
                  {stockData.isShariahCompliant && (
                    <span style={{ fontSize: '18px' }} title="Shariah Compliant">🕌</span>
                  )}
                </h2>
                <div className="fund-symbol">{stockData.companyName}</div>
              </div>
            </div>

            {/* Right - Price Info */}
            <div className="header-right">
              <div className="header-right-price">
                PKR {stockData.currentPrice.toFixed(2)}
              </div>
              <div
                className="header-right-change"
                style={{
                  color: stockData.isPositive ? '#16a34a' : '#dc2626',
                  fontWeight: '600'
                }}
              >
                {stockData.isPositive ? '+' : ''}{stockData.priceChange.toFixed(2)} ({stockData.isPositive ? '+' : ''}{stockData.changePercent.toFixed(2)}%)
              </div>
              <div className="header-right-updated">
                {stockData.updatedAt ? autoFormatDate(stockData.updatedAt).replace(/\s/g, '\u00A0') : '--'}
              </div>
            </div>
          </div>

          {/* Description */}
          <p style={{ color: '#4b5563', fontSize: '14px', margin: '20px 0 0 0', lineHeight: '1.6' }}>
            {stockData.symbol} share price today is <span style={{ fontWeight: '600', color: '#111827' }}>PKR {stockData.currentPrice.toFixed(2)}</span>.
            Volume traded in {stockData.symbol} today is <span style={{ fontWeight: '600', color: '#111827' }}>{stockData.volume.toLocaleString()}</span>,
            price change is <span style={{
              fontWeight: '600',
              color: stockData.isPositive ? '#16a34a' : '#dc2626'
            }}>
              {stockData.isPositive ? '+' : ''}{stockData.priceChange.toFixed(2)}
            </span>.
          </p>

          {/* Returns Section with 1D Box */}
          <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' }}>
            <h3 style={{ fontWeight: '600', color: '#374151', margin: '0 0 12px 0', fontSize: '14px' }}>Returns</h3>
            <div className="returns-grid">
              <div
                className="return-box"
                style={{
                  backgroundColor: stockData.isPositive ? '#d1fae5' : '#fef2f2',
                  border: `1px solid ${stockData.isPositive ? '#86efac' : '#fca5a5'}`,
                }}
              >
                <span className="return-box-label" style={{
                  color: stockData.isPositive ? '#16a34a' : '#dc2626'
                }}>1D</span>
                <span className="return-box-value" style={{
                  color: stockData.isPositive ? '#16a34a' : '#dc2626',
                  fontWeight: '600'
                }}>
                  {stockData.isPositive ? '+' : ''}{stockData.changePercent.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* Info Grid */}
          <div style={{
            display: 'flex',
            gap: '10px',
            marginTop: '24px',
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}>
            <div style={{
              backgroundColor: '#f9fafb',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid #e5e7eb',
              flex: '0 0 auto',
              minWidth: '140px',
              maxWidth: '160px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              alignItems: 'center'
            }}>
              <div style={{
                fontSize: '12px',
                color: '#6b7280',
                fontWeight: '500',
                textAlign: 'center'
              }}>
                Prev Close (LDCP)
              </div>
              <div style={{
                fontSize: '15px',
                fontWeight: '600',
                color: '#111827'
              }}>
                PKR {stockData.ldcp.toFixed(2)}
              </div>
            </div>

            <div style={{
              backgroundColor: '#f9fafb',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid #e5e7eb',
              flex: '0 0 auto',
              minWidth: '140px',
              maxWidth: '160px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              alignItems: 'center'
            }}>
              <div style={{
                fontSize: '12px',
                color: '#6b7280',
                fontWeight: '500',
                textAlign: 'center'
              }}>
                Volume
              </div>
              <div style={{
                fontSize: '15px',
                fontWeight: '600',
                color: '#111827'
              }}>
                {stockData.volume.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Auto-refresh indicator */}
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '16px', textAlign: 'center' }}>
            Auto-Refresh every 5 mins
          </p>
        </div>

        {/* Stock Price Chart - Reuse NavChart */}
        <div style={{ marginTop: '32px' }}>
          <NavChart
            mode="stock"
            symbol={stockData.symbol}
            fundType={stockData.fundType}
          />
        </div>
      </div>
    </div>
  );
};

export default StockDetail;
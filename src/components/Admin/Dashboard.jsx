import React, { useState, useEffect } from 'react'
import { supabase } from '../../services/supabase'
import { clearAdminSession } from '../../services/adminApi'
import CompanyManagement from './CompanyManagement'
import { autoFormatDate, formatPakistanTimeOnly } from '../../utils/dateUtils'
import Header from "./Header";
import NavChart from '../Common/Navchart';

const HeaderRight = ({ navPrice, change, changePercent, lastUpdated }) => {
  const isPositive = change >= 0;

  const displayPrice = navPrice ? Number(navPrice.toFixed(2)) : 0
  const displayChange = change ? Number(change.toFixed(2)) : 0
  const displayPercent = changePercent ? Number(changePercent.toFixed(2)) : 0

  return (
    <div className="header-right">
      <div className="header-right-price">
        {displayPrice.toFixed(2)}
      </div>
      <div className="header-right-change" style={{
        color: isPositive ? '#16a34a' : '#dc2626',
        fontWeight: '600'
      }}>
        {displayChange.toFixed(2)} ({isPositive ? '+' : ''}{displayPercent.toFixed(2)}%)
      </div>
      <div className="header-right-updated">
        {lastUpdated ? lastUpdated.replace(/\s/g, '\u00A0') : '--'}
      </div>
    </div>
  );
};

const Dashboard = () => {
  const [companies, setCompanies] = useState([])
  const [latestNav, setLatestNav] = useState(null)
  const [previousDayNav, setPreviousDayNav] = useState(null)
  const [twoWeekNav, setTwoWeekNav] = useState(null)
  const [prices, setPrices] = useState([])
  const [loading, setLoading] = useState(false)
  const [fundMetadata, setFundMetadata] = useState(null);
  const [priceHistories, setPriceHistories] = useState({});


  // Get fund_type from localStorage - UPDATED WITH kse_meezan_index
  const [fundType, setFundType] = useState(() => {
    return localStorage.getItem('selected_fund_type') || 'al_meezan'
  })

  // Fund display names - UPDATED WITH kse_meezan_index
  const fundDisplayNames = fundMetadata?.display_name || 'Mutual Fund';
  const fundSymbols = fundMetadata?.psx_symbol || '';
  const fundCategories = fundMetadata?.category || '';

  const fundAvatarColors = {
    'al_meezan': '#667eea',
    'energy': '#059669',
    'islamic': '#2563eb',
    'pakistan': '#d97706',
    'kse_meezan_index': '#be185d'
  }

  const fundAvatarText = {
    'al_meezan': 'AM',
    'energy': 'ME',
    'islamic': 'MI',
    'pakistan': 'MP',
    'kse_meezan_index': 'KM'
  }

  const [navHistory, setNavHistory] = useState({
    oneDay: null,
    twoWeek: null,
    oneMonth: null,
    threeMonth: null,
    oneYear: null,
    ytd: null
  })

  // ADD THIS HELPER FUNCTION HERE (after state declarations, before useEffect)
const fetchWeeklyPriceHistory = async (symbol, fundType) => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Step 1: Fetch from Sarmaya API (7 days)
    // const ACTUAL_URL = `https://beta-restapi.sarmaaya.pk/api/stocks/price-history/${symbol}?days=9`;
    // const API_URL = `https://corsproxy.io/?${encodeURIComponent(ACTUAL_URL)}`;
     const API_URL = `/api/stocks/price-history?symbol=${symbol}&days=9`;

    const response = await fetch(API_URL, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      console.warn(`API Error for ${symbol}: ${response.status}`);
      return [];
    }

    const json = await response.json();

    if (!json.response || !Array.isArray(json.response)) {
      return [];
    }

    // ✅ FIX 1: Map API data with proper date parsing
    let apiData = json.response.map(entry => {
      const entryDate = new Date(entry.date);
      return {
        date: entryDate.toDateString(),
        dateStr: entryDate.toISOString().split('T')[0], // For comparison
        price: parseFloat(entry.price),
        timestamp: entryDate.getTime() // For sorting
      };
    });

    // ✅ FIX 2: Sort by timestamp ASCENDING (oldest first)
    apiData.sort((a, b) => a.timestamp - b.timestamp);

    console.log(`📊 API data for ${symbol} (sorted):`, apiData.map(d => `${d.dateStr}: ${d.price}`));

    // ✅ FIX 3: Check if LAST point (after sorting) is from today
    const lastPoint = apiData[apiData.length - 1];
    let finalData = [...apiData];

    if (lastPoint && lastPoint.dateStr === todayStr) {
      // Remove today's point from API data
      finalData.pop();
      console.log(`✅ Removed today's API point (${todayStr}) for ${symbol}`);
    }

    // Step 2: Fetch latest price from database (current_prices is most efficient)
    const { data: currentPrice, error: priceError } = await supabase
      .from('current_prices')
      .select('price, updated_at')
      .eq('symbol', symbol)
      .single();

    if (!priceError && currentPrice) {
      // Add today's price from database
      const dbPrice = {
        date: today.toDateString(),
        dateStr: todayStr,
        price: parseFloat(currentPrice.price),
        timestamp: today.getTime()
      };
      
      finalData.push(dbPrice);
      console.log(`✅ Added latest DB price for ${symbol}: ${currentPrice.price} (${todayStr})`);
    } else {
      // Fallback: Try price_history table for today's data
      const { data: historyPrice, error: historyError } = await supabase
        .from('price_history')
        .select('price, recorded_at')
        .eq('symbol', symbol)
        .gte('recorded_at', todayStr)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single();

      if (!historyError && historyPrice) {
        const histDate = new Date(historyPrice.recorded_at);
        finalData.push({
          date: histDate.toDateString(),
          dateStr: histDate.toISOString().split('T')[0],
          price: parseFloat(historyPrice.price),
          timestamp: histDate.getTime()
        });
        console.log(`✅ Added latest price_history data for ${symbol}: ${historyPrice.price}`);
      } else {
        console.warn(`⚠️ No DB price found for ${symbol} today, keeping API data`);
      }
    }

    // ✅ FIX 4: Final sort to ensure chronological order
    finalData.sort((a, b) => a.timestamp - b.timestamp);

    // Ensure we have at least 2 points for graph
    if (finalData.length < 2) {
      console.warn(`⚠️ Insufficient data for ${symbol} (${finalData.length} points)`);
      return [];
    }

    console.log(`✅ Final data for ${symbol}:`, finalData.map(d => `${d.dateStr}: ${d.price}`));

    // Return in the format your graph expects
    return finalData.map(d => ({
      date: d.date,
      price: d.price
    }));

  } catch (error) {
    console.error(`❌ Error fetching price history for ${symbol}:`, error);
    return [];
  }
};

  const isWeekend = (date) => {
    const day = new Date(date).getDay()
    return day === 0 || day === 6
  }

  const getDateOnly = (dateString) => {
    const date = new Date(dateString)
    return date.toISOString().split('T')[0]
  }

  useEffect(() => {
    loadData()
    const interval = setInterval(() => {
      loadData()
    }, 300000)
    return () => clearInterval(interval)
  }, [fundType])

  useEffect(() => {
    const fetchFundMetadata = async () => {
      try {
        const { data, error } = await supabase
          .from('fund_metadata')
          .select('*')
          .eq('fund_type', fundType)
          .single();

        if (error) throw error;
        setFundMetadata(data);
      } catch (error) {
        console.error('Error fetching fund metadata:', error);
      }
    };

    if (fundType) fetchFundMetadata();
  }, [fundType]);
  useEffect(() => {
    // Dynamic title based on fund metadata
    if (fundMetadata?.display_name) {
      document.title = fundMetadata.display_name;
    } else {
      document.title = fundDisplayNames || "Pakistan Investment Fund";
    }
  }, [fundMetadata, fundDisplayNames]);
  const loadData = async () => {
    try {
      console.log('Auto-refreshing dashboard data for fund_type:', fundType)

      // Fetch companies for selected fund_type
      const { data: companiesData } = await supabase
        .from('companies')
        .select('*')
        .eq('fund_type', fundType)
        .order('weight_percentage', { ascending: false })

      console.log(`✅ Loaded ${companiesData?.length || 0} companies for ${fundType}`)
      setCompanies(companiesData || [])

      // Fetch NAV history for selected fund_type
      const { data: navData } = await supabase
        .from('nav_history')
        .select('*')
        .eq('fund_type', fundType)
        .order('calculated_at', { ascending: false })
        .limit(1)

      console.log('📊 Today NAV Data:', navData?.[0])
      setLatestNav(navData?.[0] || null)

      // Fetch daily closes for selected fund_type
      const { data: dailyClosesData } = await supabase
        .from('daily_closes')
        .select('closing_nav, market_date')
        .eq('fund_type', fundType)
        .order('market_date', { ascending: false })
        .limit(20)

      console.log('📊 Daily Closes Data:', dailyClosesData)

      if (dailyClosesData && dailyClosesData.length > 0) {
        const weekdayCloses = dailyClosesData.filter(entry => !isWeekend(entry.market_date))

        console.log('📅 Weekday Closes:', weekdayCloses.length, 'entries')
        weekdayCloses.forEach((entry, idx) => {
          console.log(`   [${idx}] Date: ${entry.market_date}, NAV: ${entry.closing_nav}`)
        })

        if (weekdayCloses.length >= 2) {
          const previousClose = weekdayCloses[1]
          console.log('✅ Previous Weekday NAV from daily_closes:', previousClose.closing_nav)
          console.log('📅 Previous Date:', previousClose.market_date)

          setPreviousDayNav({
            nav_value: parseFloat(previousClose.closing_nav),
            calculated_at: previousClose.market_date
          })
        } else {
          console.log('⚠️ Not enough data for previous day')
          setPreviousDayNav(null)
        }

        if (weekdayCloses.length >= 12) {
          const twoWeekClose = weekdayCloses[11]
          console.log('✅ 2-Week Ago NAV from daily_closes:', twoWeekClose.closing_nav)
          console.log('📅 2-Week Date:', twoWeekClose.market_date)

          setTwoWeekNav({
            nav_value: parseFloat(twoWeekClose.closing_nav),
            calculated_at: twoWeekClose.market_date
          })
        } else {
          console.log('⚠️ Not enough data for 2-week comparison')
          setTwoWeekNav(null)
        }
      } else {
        console.log('❌ daily_closes table empty!')
        setPreviousDayNav(null)
        setTwoWeekNav(null)
      }

      await loadNavHistory()

      // Fetch current prices with LDCP for selected fund_type
      const { data: pricesData } = await supabase
        .from('current_prices')
        .select(`
          symbol,
          price,
          updated_at,
          companies!inner(company_name, is_active, weight_percentage)
        `)
        .eq('companies.is_active', true)
        .eq('fund_type', fundType)

      // Fetch daily closes for LDCP
      const { data: dailyCloses } = await supabase
        .from('daily_closes')
        .select('*')
        .eq('fund_type', fundType)
        .order('market_date', { ascending: false })

      if (pricesData) {
        // Merge prices with LDCP data
        const mergedPrices = pricesData.map(p => {
          const latestClose = dailyCloses?.find(d => d.symbol === p.symbol)
          return {
            ...p,
            lastDayClosing: latestClose?.closing_price ?? null
          }
        })

        const sortedPrices = mergedPrices.sort((a, b) => {
          return parseFloat(b.companies.weight_percentage) - parseFloat(a.companies.weight_percentage)
        })
        setPrices(sortedPrices)
      } else {
        setPrices([])
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    }
  }

  // Add this NEW useEffect after loadData function
  useEffect(() => {
    const fetchAllPriceHistories = async () => {
      const histories = {};
      for (const price of prices) {
        const history = await fetchWeeklyPriceHistory(price.symbol, fundType);
        histories[price.symbol] = history;
      }
      setPriceHistories(histories);
    };

    if (prices.length > 0) {
      fetchAllPriceHistories();
    }
  }, [prices, fundType]);

  const loadNavHistory = async () => {
    try {
      const { data: allNavData } = await supabase
        .from('nav_history')
        .select('nav_value, calculated_at')
        .eq('fund_type', fundType)
        .order('calculated_at', { ascending: false })

      if (!allNavData || allNavData.length === 0) {
        console.log('❌ No NAV history data found')
        return
      }

      const uniqueDateNavData = []
      const seenDates = new Set()

      for (const entry of allNavData) {
        const dateOnly = getDateOnly(entry.calculated_at)
        if (!seenDates.has(dateOnly)) {
          seenDates.add(dateOnly)
          uniqueDateNavData.push(entry)
        }
      }

      const weekdayNavData = uniqueDateNavData.filter(entry => !isWeekend(entry.calculated_at))

      if (weekdayNavData.length === 0) {
        console.log('❌ No weekday NAV data found')
        return
      }

      console.log(`📊 Total NAV entries: ${allNavData.length}`)
      console.log(`📅 Unique dates: ${uniqueDateNavData.length}`)
      console.log(`📅 Weekday dates: ${weekdayNavData.length}`)

      const getNavByIndex = (index) => {
        return weekdayNavData[index]?.nav_value || null
      }

      const currentYear = new Date().getFullYear()
      const ytdNav = weekdayNavData
        .filter(entry => new Date(entry.calculated_at).getFullYear() === currentYear)
        .slice(-1)[0]?.nav_value || null

      setNavHistory({
        oneDay: getNavByIndex(1),
        twoWeek: getNavByIndex(10),
        oneMonth: getNavByIndex(21),
        threeMonth: getNavByIndex(63),
        oneYear: getNavByIndex(252),
        ytd: ytdNav
      })

      console.log('✅ NAV History loaded (unique weekday dates only)')
    } catch (error) {
      console.error('Error loading NAV history:', error)
    }
  }

  const calculateReturn = (oldValue, newValue) => {
    if (!oldValue || !newValue) return null
    return ((newValue - oldValue) / oldValue) * 100
  }

  const handleLogout = () => {
    clearAdminSession()
    window.location.href = '/admin/login'
  }

  const currentNavValue = latestNav ? Number(latestNav.nav_value) : null
  const prevDayNavValue = previousDayNav ? Number(previousDayNav.nav_value) : null
  const twoWeekNavValue = twoWeekNav ? Number(twoWeekNav.nav_value) : null

  console.log('='.repeat(50))
  console.log('💰 Current NAV (Today):', currentNavValue)
  console.log('💰 Current Date:', latestNav?.calculated_at)
  console.log('📅 Previous NAV:', prevDayNavValue)
  console.log('📅 Previous Date:', previousDayNav?.calculated_at)
  console.log('📊 Fund Type:', fundType)

  let navChange = 0
  let changePercent = 0

  if (currentNavValue !== null && prevDayNavValue !== null && prevDayNavValue !== 0) {
    navChange = currentNavValue - prevDayNavValue
    changePercent = (navChange / prevDayNavValue) * 100

    console.log('✅ FRESH CALCULATION:')
    console.log('   Current:', currentNavValue)
    console.log('   Previous:', prevDayNavValue)
    console.log('   Change:', navChange)
    console.log('   Percent:', changePercent.toFixed(2) + '%')
  } else {
    console.log('❌ Cannot calculate - missing data')
  }

  console.log('='.repeat(50))

  const returnsData = [
    {
      label: '1D',
      value: prevDayNavValue && currentNavValue ? calculateReturn(prevDayNavValue, currentNavValue) : null,
      positive: prevDayNavValue && currentNavValue ? calculateReturn(prevDayNavValue, currentNavValue) >= 0 : true
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'white' }}>
      {/* Header - UPDATED STRUCTURE */}
      <div className="dashboard-header">
        <div className="dashboard-header-content">
          {/* Left - Admin Dashboard Title */}
          <h1 className="dashboard-main-heading"
            onClick={() => window.location.href = '/'}
            style={{ cursor: 'pointer' }}
          >📊 Pakistan Investment Fund</h1>

          {/* Right Section */}
          <div className="dashboard-user-section">
            {/* Center Group - Welcome */}
            <div className="dashboard-center-group">
              <span className="dashboard-welcome-text">Welcome, Admin</span>
            </div>

            {/* Right - Logout Button */}
            <button
              onClick={handleLogout}
              onMouseOver={(e) => e.target.style.background = 'rgba(255,255,255,0.3)'}
              onMouseOut={(e) => e.target.style.background = 'white'}
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Stock Market Header with Slider - AT THE TOP */}
      <Header />

      {/* Main Content */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 16px' }}>

        {/* Fund Card - Dynamic based on fundType */}
        <div className="fund-card">
          <div className="fund-header">
            {/* Left */}
            <div className="fund-left">
              <div className="fund-avatar" style={{
                backgroundColor: fundAvatarColors[fundType]
              }}>
                {fundAvatarText[fundType]}
              </div>
              <div className="fund-info">
                <h2 className="fund-title">{fundMetadata?.display_name || fundDisplayNames[fundType]}</h2>
                <div className="fund-symbol">PSX: {fundMetadata?.psx_symbol || fundSymbols[fundType]}</div>
              </div>
            </div>

            {/* Right - NAV */}
            <HeaderRight
              navPrice={currentNavValue}
              change={navChange}
              changePercent={changePercent}
              lastUpdated={latestNav ? autoFormatDate(latestNav.calculated_at) : '--'}
            />
          </div>

          {/* Description */}
          <p style={{ color: '#4b5563', fontSize: '14px', margin: '20px 0 0 0', lineHeight: '1.6' }}>
            {fundMetadata?.display_name || fundDisplayNames[fundType]}'s current NAV price is{' '}
            <span style={{ fontWeight: '600', color: '#111827' }}>{currentNavValue?.toFixed(2) ?? '--'}</span>. One-day return:{' '}
            <span style={{
              fontWeight: '600',
              color: changePercent >= 0 ? '#16a34a' : '#dc2626'
            }}>
              {changePercent >= 0 ? '+' : ''}{changePercent?.toFixed(2)}%
            </span>.
          </p>

          {/* Returns Row - Dynamic green/red */}
          <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' }}>
            <h3 style={{ fontWeight: '600', color: '#374151', margin: '0 0 12px 0', fontSize: '14px' }}>Returns</h3>
            <div className="returns-grid">
              {returnsData.map((item, i) => (
                <div
                  key={i}
                  className="return-box"
                  style={{
                    backgroundColor: item.positive ? '#d1fae5' : '#fef2f2',
                    border: `1px solid ${item.positive ? '#86efac' : '#fca5a5'}`,
                  }}
                >
                  <span className="return-box-label" style={{
                    color: item.positive ? '#16a34a' : '#dc2626'
                  }}>{item.label}</span>
                  <span className="return-box-value" style={{
                    color: item.positive ? '#16a34a' : '#dc2626',
                    fontWeight: '600'
                  }}>
                    {item.value !== null ? `${item.positive ? '+' : ''}${item.value.toFixed(2)}%` : '--'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Info Grid - Three Separate Blocks */}
          <div style={{
            display: 'flex',
            gap: '10px',
            marginTop: '24px',
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}>
            {/* Block 1: Nav / 1-Day Return */}
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
                Nav / 1-Day Return
              </div>
              <div style={{
                fontSize: '15px',
                fontWeight: '600',
                color: navChange >= 0 ? '#16a34a' : '#dc2626'
              }}>
                {navChange >= 0 ? '+' : ''}{navChange?.toFixed(2) ?? '--'}
              </div>
            </div>

            {/* Block 2: Prev Close */}
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
                Prev Close
              </div>
              <div style={{
                fontSize: '15px',
                fontWeight: '600',
                color: '#111827'
              }}>
                {prevDayNavValue ? prevDayNavValue.toFixed(2) : '--'}
              </div>
            </div>

            {/* Block 3: Category */}
            {fundMetadata?.category && (
              <div style={{
                backgroundColor: '#f9fafb',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                flex: '0 0 auto',
                minWidth: '300px',
                maxWidth: '800px',
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
                  Category
                </div>
                <div style={{
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#111827',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'center'
                }}>
                  {fundMetadata.category}
                </div>
              </div>
            )}
          </div>

          {/* Auto-refresh indicator */}
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '16px', textAlign: 'center' }}>
            Auto-Refresh every 5 minutes
          </p>
        </div>

        {/* Nav Chart - BELOW Fund Card */}
        <div style={{ marginTop: '32px' }}>
          <NavChart fundType={fundType} />
        </div>

        {/* Stock Prices Grid */}
        <div style={{ marginTop: '32px' }}>
          <h3 className="dashboard-stock-prices-heading" style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '24px', marginTop: '16px' }}>
            Stock Prices ({prices.length})
          </h3>
          <div className="companies-grid">
            {prices.map(price => {
              // Calculate change and percentage
              const currentPrice = typeof price.price === 'number' ? price.price : parseFloat(price.price)
              const ldcp = typeof price.lastDayClosing === 'number' ? price.lastDayClosing : parseFloat(price.lastDayClosing)

              let priceChange = 0
              let changePercent = 0
              let isPositive = true

              if (!isNaN(currentPrice) && !isNaN(ldcp) && ldcp !== 0) {
                priceChange = currentPrice - ldcp
                changePercent = (priceChange / ldcp) * 100
                isPositive = priceChange >= 0
              }

              return (
                <a
                  key={price.symbol}
                  href={`/stock/${price.symbol}`}
                  className="company-card-link"
                  style={{
                    textDecoration: 'none',
                    color: 'inherit'
                  }}
                  onContextMenu={(e) => {
                    // Right click - allow browser's native context menu
                    console.log('Right-clicked on stock:', price.symbol);
                  }}
                  onClick={(e) => {
                    // Only prevent default for left-click if needed
                    if (e.button === 0) {
                      // Add any custom left-click logic here
                    }
                  }}
                >
                  <div
                    className="company-card"
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: '2px solid #e5e7eb',
                      background: 'white',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      transition: 'all 0.3s ease',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05) translateY(-5px)';
                      e.currentTarget.style.boxShadow = '0 10px 25px rgba(0,0,0,0.15)';
                      e.currentTarget.style.borderColor = '#374151';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1) translateY(0)';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                      e.currentTarget.style.borderColor = '#e5e7eb';
                    }}
                  >
                    {/* Top Section - Symbol & Company Name - CENTER ALIGNED */}
                    <div style={{ textAlign: 'center' }}>
                      <strong style={{
                        fontSize: '18px',
                        fontWeight: '700',
                        color: '#111827',
                        display: 'block'
                      }}>
                        {price.symbol}
                      </strong>
                      <div style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        marginTop: '2px'
                      }}>
                        {price.companies?.company_name}
                      </div>
                    </div>

                    {/* Current Price - ONE LINE - SAME SIZE */}
                    <div style={{
                      textAlign: 'center',
                      marginTop: '8px',
                      marginBottom: '4px'
                    }}>
                      <span style={{
                        fontSize: '13px',
                        color: '#6b7280',
                        fontWeight: 'normal',
                        marginRight: '8px'
                      }}>
                        Current Price:
                      </span>
                      <span style={{
                        fontSize: '13px',
                        fontWeight: 'bold',
                        color: '#111827'
                      }}>
                        {currentPrice.toFixed(2)}
                      </span>
                    </div>

                    {/* REAL WEEKLY PRICE GRAPH */}
                    <div style={{
                      height: '60px',
                      background: 'white',
                      borderRadius: '4px',
                      marginBottom: '12px',
                      position: 'relative',
                      overflow: 'visible'
                    }}>
                      {(() => {
                        const weeklyHistory = priceHistories[price.symbol] || [];

                        // Generate graph points
                        const generateGraphPoints = () => {
                          if (weeklyHistory.length < 2) {
                            return {
                              points: "0,42 20,33 40,45 60,24 80,36 100,27 120,42 140,33 160,39 180,27 200,36 220,30 240,42 260,36 280,30 300,42",
                              areaPoints: "0,42 20,33 40,45 60,24 80,36 100,27 120,42 140,33 160,39 180,27 200,36 220,30 240,42 260,36 280,30 300,42 300,60 0,60",
                              segmentPaths: []
                            };
                          }

                          const prices = weeklyHistory.map(h => h.price);
                          const minPrice = Math.min(...prices);
                          const maxPrice = Math.max(...prices);
                          const priceRange = maxPrice - minPrice || 1;

                          const graphHeight = 60;
                          const graphWidth = 300;
                          const pointCount = weeklyHistory.length;
                          const xStep = graphWidth / (pointCount - 1);

                          let points = '';
                          let areaPoints = '';
                          const segmentPaths = [];

                          weeklyHistory.forEach((history, index) => {
                            const x = index * xStep;
                            const normalizedPrice = ((history.price - minPrice) / priceRange) * 40 + 10;
                            const y = graphHeight - normalizedPrice;

                            if (index === 0) {
                              points = `M ${x} ${y}`;
                              areaPoints = `M ${x} ${y}`;
                            } else {
                              points += ` L ${x} ${y}`;
                              areaPoints += ` L ${x} ${y}`;

                              const prevPrice = weeklyHistory[index - 1].price;
                              const currentPrice = history.price;
                              const segmentColor = currentPrice >= prevPrice ? '#16a34a' : '#dc2626';

                              const prevX = (index - 1) * xStep;
                              const prevY = graphHeight - (((prevPrice - minPrice) / priceRange) * 40 + 10);

                              segmentPaths.push({
                                path: `M ${prevX} ${prevY} L ${x} ${y}`,
                                color: segmentColor
                              });
                            }
                          });

                          areaPoints += ` L ${graphWidth} ${graphHeight} L 0 ${graphHeight} Z`;

                          return { points, areaPoints, segmentPaths };
                        };

                        const graphData = generateGraphPoints();

                        return (
                          <svg
                            width="100%"
                            height="60"
                            style={{ display: 'block' }}
                            viewBox="-5 -5 310 70"
                            preserveAspectRatio="none"
                          >
                            <defs>
                              <linearGradient id={`gradient-green-${price.symbol}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#16a34a" stopOpacity="0" />
                                <stop offset="100%" stopColor="#16a34a" stopOpacity="0.15" />
                              </linearGradient>
                              <linearGradient id={`gradient-red-${price.symbol}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#dc2626" stopOpacity="0" />
                                <stop offset="100%" stopColor="#dc2626" stopOpacity="0.15" />
                              </linearGradient>
                            </defs>

                            {/* Render area fills */}
                            {weeklyHistory.length >= 2 && weeklyHistory.map((history, index) => {
                              if (index === 0) return null;

                              const prices = weeklyHistory.map(h => h.price);
                              const minPrice = Math.min(...prices);
                              const maxPrice = Math.max(...prices);
                              const priceRange = maxPrice - minPrice || 1;
                              const graphHeight = 60;
                              const graphWidth = 300;
                              const xStep = graphWidth / (weeklyHistory.length - 1);

                              const prevPrice = weeklyHistory[index - 1].price;
                              const currentPrice = history.price;
                              const isPositive = currentPrice >= prevPrice;

                              const prevX = (index - 1) * xStep;
                              const currentX = index * xStep;
                              const prevY = graphHeight - (((prevPrice - minPrice) / priceRange) * 40 + 10);
                              const currentY = graphHeight - (((currentPrice - minPrice) / priceRange) * 40 + 10);

                              const areaPath = `
                              M ${prevX} ${prevY}
                              L ${currentX} ${currentY}
                              L ${currentX} ${graphHeight}
                              L ${prevX} ${graphHeight}
                              Z
                            `;

                              return (
                                <path
                                  key={`area-${index}`}
                                  d={areaPath}
                                  fill={isPositive ? `url(#gradient-green-${price.symbol})` : `url(#gradient-red-${price.symbol})`}
                                  stroke="none"
                                />
                              );
                            })}

                            {/* Draw line segments */}
                            {graphData.segmentPaths.map((segment, index) => (
                              <line
                                key={`line-${index}`}
                                x1={segment.path.split(' ')[1]}
                                y1={segment.path.split(' ')[2]}
                                x2={segment.path.split(' ')[4]}
                                y2={segment.path.split(' ')[5]}
                                stroke={segment.color}
                                strokeWidth="2.5"
                              />
                            ))}

                            {/* Interactive hover points */}
                            {weeklyHistory.map((history, index) => {
                              const prices = weeklyHistory.map(h => h.price);
                              const minPrice = Math.min(...prices);
                              const maxPrice = Math.max(...prices);
                              const priceRange = maxPrice - minPrice || 1;
                              const graphHeight = 60;
                              const graphWidth = 300;
                              const xStep = graphWidth / (weeklyHistory.length - 1);

                              const x = index * xStep;
                              const normalizedPrice = ((history.price - minPrice) / priceRange) * 40 + 10;
                              const y = graphHeight - normalizedPrice;

                              const prevPrice = index > 0 ? weeklyHistory[index - 1].price : history.price;
                              const pointIsPositive = history.price >= prevPrice;
                              const pointColor = pointIsPositive ? '#16a34a' : '#dc2626';

                              return (
                                <g key={`point-${index}`}>
                                  <circle
                                    cx={x}
                                    cy={y}
                                    r="8"
                                    fill="transparent"
                                    style={{ cursor: 'pointer' }}
                                    onMouseEnter={(e) => {
                                      const visiblePoint = e.currentTarget.nextElementSibling;
                                      if (visiblePoint) {
                                        visiblePoint.style.opacity = '1';
                                        visiblePoint.setAttribute('r', '5');
                                      }

                                      const date = new Date(history.date);
                                      const formattedDate = date.toLocaleDateString('en-US', {
                                        weekday: 'short',
                                        month: 'short',
                                        day: 'numeric'
                                      });

                                      let tooltip = document.getElementById(`tooltip-${price.symbol}`);
                                      if (!tooltip) {
                                        tooltip = document.createElement('div');
                                        tooltip.id = `tooltip-${price.symbol}`;
                                        tooltip.style.cssText = `
                                        position: fixed;
                                        background: white;
                                        border: 1px solid #e5e7eb;
                                        border-radius: 6px;
                                        padding: 8px 12px;
                                        font-size: 12px;
                                        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                                        z-index: 9999;
                                        pointer-events: none;
                                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                                        min-width: 120px;
                                      `;
                                        document.body.appendChild(tooltip);
                                      }

                                      const svgRect = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                                      const tooltipX = svgRect.left + x * (svgRect.width / 300);
                                      const tooltipY = svgRect.top + y * (svgRect.height / 60) - 60;

                                      tooltip.style.left = `${tooltipX}px`;
                                      tooltip.style.top = `${tooltipY}px`;
                                      tooltip.style.transform = 'translateX(-50%)';
                                      tooltip.innerHTML = `
                                      <div style="color: #374151; font-weight: 600; margin-bottom: 4px; text-align: center;">${formattedDate}</div>
                                      <div style="color: #6b7280; font-size: 11px; text-align: center;">
                                        Price: <span style="color: ${pointColor}; font-weight: 600;">${history.price.toFixed(2)}</span>
                                      </div>
                                    `;
                                      tooltip.style.display = 'block';
                                    }}
                                    onMouseLeave={(e) => {
                                      const visiblePoint = e.currentTarget.nextElementSibling;
                                      if (visiblePoint) {
                                        visiblePoint.style.opacity = '0';
                                        visiblePoint.setAttribute('r', '3');
                                      }

                                      const tooltip = document.getElementById(`tooltip-${price.symbol}`);
                                      if (tooltip) {
                                        tooltip.style.display = 'none';
                                      }
                                    }}
                                  />

                                  <circle
                                    cx={x}
                                    cy={y}
                                    r="3"
                                    fill={pointColor}
                                    stroke="white"
                                    strokeWidth="2"
                                    style={{
                                      opacity: 0,
                                      transition: 'opacity 0.2s, r 0.2s',
                                      pointerEvents: 'none'
                                    }}
                                  />
                                </g>
                              );
                            })}
                          </svg>
                        );
                      })()}
                    </div>

                    {/* Weight & LDCP - Boxes Side by Side */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      marginBottom: '12px'
                    }}>
                      <div style={{
                        padding: '8px',
                        background: '#f9fafb',
                        borderRadius: '6px',
                        border: '1px solid #e5e7eb'
                      }}>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>
                          Weight
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                          {price.companies?.weight_percentage}%
                        </div>
                      </div>

                      <div style={{
                        padding: '8px',
                        background: '#f9fafb',
                        borderRadius: '6px',
                        border: '1px solid #e5e7eb'
                      }}>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>
                          LDCP
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                          {!isNaN(ldcp) && ldcp !== 0 ? ldcp.toFixed(2) : '-'}
                        </div>
                      </div>
                    </div>

                    {/* Change Pill - LIGHT COLORS LIKE 1D RETURN BOX */}
                    {!isNaN(currentPrice) && !isNaN(ldcp) && ldcp !== 0 && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{
                          padding: '6px 12px',
                          borderRadius: '16px',
                          backgroundColor: isPositive ? '#d1fae5' : '#fef2f2',
                          border: `1px solid ${isPositive ? '#86efac' : '#fca5a5'}`,
                          display: 'inline-block',
                          fontSize: '12px',
                          fontWeight: '600',
                          color: isPositive ? '#16a34a' : '#dc2626'
                        }}>
                          {isPositive ? '+' : ''}{priceChange.toFixed(2)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
                        </div>
                      </div>
                    )}
                  </div>
                </a>
              )
            })}
          </div>
        </div>

        {/* Company Management */}
        <div className="company-management-container">
          <CompanyManagement
            companies={companies.filter(c => c.is_active && parseFloat(c.weight_percentage) > 0)}
            onUpdate={loadData}
            fundType={fundType}
          />
        </div>
      </div>
    </div>
  )
}

export default Dashboard
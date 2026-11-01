import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../services/supabase'
import { NavCalculator } from '../services/navCalculator'
import { autoFormatDate, formatPakistanTimeOnly } from '../utils/dateUtils'
import NavChart from './Common/Navchart'
import Header from './Admin/Header'


const Calculator = () => {
  const [companies, setCompanies] = useState([])
  const [lastNav, setLastNav] = useState(null)
  const [previousDayNav, setPreviousDayNav] = useState(null)
  const [hasPrices, setHasPrices] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [initialNav, setInitialNav] = useState('')
  const [error, setError] = useState(null)

  // Add this helper function for fetching weekly price history
// ✅ NEW: Fetch from API like NavChart does, but replace last point with DB data
// ✅ FIXED: Fetch from API with proper date handling and sorting
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
  // Fetch fund metadata from database
  const [fundMetadata, setFundMetadata] = useState(null);

  // 🔥 FIX: Shared data cache state
  const [sharedData, setSharedData] = useState({
    currentPrices: [],
    dailyCloses: [],
    navHistory: [],
    lastFetch: null
  })

  // Get fund_type from localStorage - UPDATED WITH PAKISTAN
  const [fundType, setFundType] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const fundFromUrl = urlParams.get('fund');

    // ✅ KSE KO BHI ADD KARO
    if (fundFromUrl === 'al_meezan' || fundFromUrl === 'energy' || fundFromUrl === 'islamic' || fundFromUrl === 'pakistan' || fundFromUrl === 'kse_meezan_index') {
      localStorage.setItem('selected_fund_type', fundFromUrl);
      return fundFromUrl;
    }

    return localStorage.getItem('selected_fund_type') || 'al_meezan';
  })

  // Fund display names - UPDATED WITH PAKISTAN
  const fundDisplayNames = fundMetadata?.display_name || 'Mutual Fund';
  const fundSymbols = fundMetadata?.psx_symbol || '';
  const fundCategories = fundMetadata?.category || '';

  const fundAvatarColors = {
    'al_meezan': '#667eea',
    'energy': '#059669',
    'islamic': '#2563eb',
    'pakistan': '#d97706',
    'kse_meezan_index': '#1F2433' // ✅ KSE KA CHARCOAL BLUE
  }

  const fundAvatarText = {
    'al_meezan': 'AM',
    'energy': 'ME',
    'islamic': 'MI',
    'pakistan': 'MP',
    'kse_meezan_index': 'KM' // ✅ KSE KA TEXT
  }

  const fundAvatarTextColors = {
    'al_meezan': '#ffffff',
    'energy': '#ffffff',
    'islamic': '#ffffff',
    'pakistan': '#ffffff',
    'kse_meezan_index': '#ffffff' // ✅ KSE KA WHITE TEXT
  }

  // 🔥 FIX 1: Proper auto-refresh setup
  useEffect(() => {
    let intervalId;

    const setupAutoRefresh = () => {
      // Load data immediately
      loadData();

      // Set up auto-refresh interval
      intervalId = setInterval(() => {
        console.log('🔄 Auto-refreshing calculator data...');
        loadData();
      }, 300000); // 5 minutes
    };

    setupAutoRefresh();

    // Cleanup function
    return () => {
      if (intervalId) {
        console.log('🧹 Cleaning up calculator interval');
        clearInterval(intervalId);
      }
    };
  }, [fundType]); // Only depend on fundType

  // Add this useEffect after other useEffects
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

  const isWeekend = (date) => {
    const day = new Date(date).getDay()
    return day === 0 || day === 6
  }

  // 🔥 FIX 2: Optimized loadData function with Promise.all
  const loadData = useCallback(async () => {
    try {
      setError(null);
      console.log('📊 Loading OPTIMIZED data for fund_type:', fundType);

      // ✅ ONLY 2 API CALLS NOW
      const [portfolioResult, navDataResult] = await Promise.all([
        supabase
          .from('portfolio_data')
          .select('*')
          .eq('fund_type', fundType)
          .order('weight_percentage', { ascending: false }),
        supabase.rpc('get_latest_nav_data', { p_fund_type: fundType }),
      ]);

      // Process Portfolio Data
      if (portfolioResult.error) throw portfolioResult.error;

      // ✅ CORRECTLY MAP THE DATA
      const merged = (portfolioResult.data || []).map(p => ({
        id: p.id,
        company_name: p.company_name,
        symbol: p.symbol,
        weight_percentage: p.weight_percentage,
        is_active: p.is_active,
        fund_type: p.fund_type,
        currentPrice: p.current_price, // Map to expected property name
        lastDayClosing: p.last_day_closing_price, // Map to expected property name
        price_updated_at: p.price_updated_at // Keep original for reference
      }));

      setCompanies(merged);

      // Process NAV Data
      if (navDataResult.error) throw navDataResult.error;
      const navData = navDataResult.data?.[0];

      if (navData) {
        setLastNav({
          nav_value: navData.latest_nav_value,
          calculated_at: navData.latest_nav_calculated_at,
        });
        setPreviousDayNav({
          nav_value: navData.previous_day_nav,
          calculated_at: navData.previous_market_date,
        });
      }

      // Update shared cache for NavChart
      setSharedData(prev => ({
        ...prev,
        currentPrices: portfolioResult.data?.map(p => ({
          symbol: p.symbol,
          price: p.current_price,
          updated_at: p.price_updated_at
        })) || [],
        dailyCloses: portfolioResult.data?.map(p => ({
          symbol: p.symbol,
          closing_price: p.last_day_closing_price
        })) || [],
        navHistory: navData ? [{
          nav_value: navData.latest_nav_value,
          calculated_at: navData.latest_nav_calculated_at
        }] : [],
        lastFetch: new Date().toISOString(),
      }));

    } catch (error) {
      console.error('Error loading optimized data:', error);
      setError('Failed to load data. Please try again.');
    }
  }, [fundType]);

  const handleInitialize = async () => {
    if (!initialNav || parseFloat(initialNav) <= 0) {
      alert('Please enter a valid Initial NAV value')
      return
    }

    setLoading(true)
    try {
      const result = await NavCalculator.initializeSystem(parseFloat(initialNav), fundType)
      if (result.success) {
        alert(`Initialization Successful!\n\nInitial NAV: ${result.initial_nav}\nPrices stored: ${result.prices_stored} companies`)
        // 🔥 FIX: Refresh data after initialization
        loadData();
      } else {
        alert('Error: ' + result.error)
      }
    } catch (error) {
      alert('Initialization failed: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCalculate = async () => {
    setLoading(true)
    try {
      const result = await NavCalculator.calculateNAV(fundType)
      if (result.success) {
        setResults(result)
        setLastNav({ nav_value: result.nav, calculated_at: result.timestamp })
        // 🔥 FIX: Refresh data after calculation
        loadData();
      } else {
        alert('Error: ' + result.error)
      }
    } catch (error) {
      alert('Calculation failed: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // 🔥 FIX 3: Memoize nav change data
  const navChangeData = useMemo(() => {
    if (!lastNav || !previousDayNav) return null

    const currentNavValue = Number(lastNav.nav_value)
    const prevDayNavValue = Number(previousDayNav.nav_value)
    const navChange = currentNavValue - prevDayNavValue
    const changePercent = (navChange / prevDayNavValue) * 100
    const isPositive = navChange >= 0

    return {
      currentNavValue,
      prevDayNavValue,
      navChange,
      changePercent,
      isPositive
    }
  }, [lastNav, previousDayNav])

  // 🔥 FIX 4: Memoize company cards to prevent unnecessary re-renders
  const [priceHistories, setPriceHistories] = useState({});

  // Add this useEffect to fetch price histories
// ✅ UPDATED: Fetch price histories using new API method
useEffect(() => {
  const fetchAllPriceHistories = async () => {
    const histories = {};
    
    // Fetch in parallel for better performance
    const promises = companies.map(async (company) => {
      const history = await fetchWeeklyPriceHistory(company.symbol, fundType);
      return { symbol: company.symbol, history };
    });

    const results = await Promise.all(promises);
    
    results.forEach(({ symbol, history }) => {
      histories[symbol] = history;
    });

    setPriceHistories(histories);
    console.log('✅ All price histories fetched:', Object.keys(histories).length);
  };

  if (companies.length > 0) {
    fetchAllPriceHistories();
  }
}, [companies, fundType]);

  // 🔥 FIX 4: Memoize company cards to prevent unnecessary re-renders
  const companyCards = useMemo(() =>
    companies.map(company => {
      const currentPrice = typeof company.currentPrice === 'number' ? company.currentPrice : parseFloat(company.currentPrice);
      const ldcp = typeof company.lastDayClosing === 'number' ? company.lastDayClosing : parseFloat(company.lastDayClosing);
      const weeklyHistory = priceHistories[company.symbol] || [];

      let priceChange = 0;
      let changePercent = 0;
      let isPositive = true;

      if (!isNaN(currentPrice) && !isNaN(ldcp) && ldcp !== 0) {
        priceChange = currentPrice - ldcp;
        changePercent = (priceChange / ldcp) * 100;
        isPositive = priceChange >= 0;
      }

      // Determine graph color based on weekly trend (not just current vs LDCP)
      let graphColor = '#16a34a'; // Default green
      if (weeklyHistory.length >= 2) {
        const startPrice = weeklyHistory[0]?.price || 0;
        const endPrice = weeklyHistory[weeklyHistory.length - 1]?.price || 0;

        // If graph goes down at any point, use red
        let hasDecreased = false;
        for (let i = 1; i < weeklyHistory.length; i++) {
          if (weeklyHistory[i].price < weeklyHistory[i - 1].price) {
            hasDecreased = true;
            break;
          }
        }

        // If end is lower than start OR it decreased at any point, use red
        if (endPrice < startPrice || hasDecreased) {
          graphColor = '#dc2626';
        }
      }

      // Generate graph points from weekly history
      // Generate graph points from weekly history with segment-based coloring
      const generateGraphPoints = () => {
        if (weeklyHistory.length < 2) {
          // Fallback to static graph if no data
          return {
            points: "0,42 20,33 40,45 60,24 80,36 100,27 120,42 140,33 160,39 180,27 200,36 220,30 240,42 260,36 280,30 300,42",
            areaPoints: "0,42 20,33 40,45 60,24 80,36 100,27 120,42 140,33 160,39 180,27 200,36 220,30 240,42 260,36 280,30 300,42 300,60 0,60",
            segmentPaths: [] // For segment-based coloring
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

        // Generate points for the main line
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

            // Create segment paths with individual colors
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

        // Close the area path
        areaPoints += ` L ${graphWidth} ${graphHeight} L 0 ${graphHeight} Z`;

        return { points, areaPoints, segmentPaths };
      };

      const graphData = generateGraphPoints();

      return (
        <a
          key={company.id}
          href={`/stock/${company.symbol}`}
          className="company-card"
          style={{
            padding: '16px',
            borderRadius: '12px',
            border: '2px solid #e5e7eb',
            background: 'white',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            transition: 'all 0.3s ease',
            cursor: 'pointer',
            position: 'relative',
            textDecoration: 'none',
            color: 'inherit',
            display: 'block'
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
              {company.symbol}
            </strong>
            <div style={{
              fontSize: '12px',
              color: '#6b7280',
              marginTop: '2px'
            }}>
              {company.company_name}
            </div>
          </div>

          {/* Current Price - Big & Bold - CENTER ALIGNED - ONE LINE */}
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
              {!isNaN(currentPrice) ? currentPrice.toFixed(2) : '-'}
            </span>
          </div>

          {/* REAL WEEKLY PRICE GRAPH - IMPROVED */}
          <div style={{
            height: '60px',
            background: 'white',
            borderRadius: '4px',
            marginBottom: '12px',
            position: 'relative',
            overflow: 'visible' // Changed from 'hidden' to allow tooltip to show
          }}>
            <svg
              width="100%"
              height="60"
              style={{ display: 'block' }}
              viewBox="-5 -5 310 70"  // Extended viewBox to prevent clipping
              preserveAspectRatio="none"
            >
              <defs>
                {/* Separate gradients for green and red */}
                <linearGradient id={`gradient-green-${company.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#16a34a" stopOpacity="0" />
                  <stop offset="100%" stopColor="#16a34a" stopOpacity="0.15" />
                </linearGradient>
                <linearGradient id={`gradient-red-${company.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#dc2626" stopOpacity="0" />
                  <stop offset="100%" stopColor="#dc2626" stopOpacity="0.15" />
                </linearGradient>
              </defs>

              {/* Render separate area fills for green and red segments */}
              {(() => {
                if (weeklyHistory.length < 2) return null;

                const prices = weeklyHistory.map(h => h.price);
                const minPrice = Math.min(...prices);
                const maxPrice = Math.max(...prices);
                const priceRange = maxPrice - minPrice || 1;
                const graphHeight = 60;
                const graphWidth = 300;
                const pointCount = weeklyHistory.length;
                const xStep = graphWidth / (pointCount - 1);

                // Create segments with individual fills
                return weeklyHistory.map((history, index) => {
                  if (index === 0) return null;

                  const prevPrice = weeklyHistory[index - 1].price;
                  const currentPrice = history.price;
                  const isPositive = currentPrice >= prevPrice;

                  const prevX = (index - 1) * xStep;
                  const currentX = index * xStep;
                  const prevY = graphHeight - (((prevPrice - minPrice) / priceRange) * 40 + 10);
                  const currentY = graphHeight - (((currentPrice - minPrice) / priceRange) * 40 + 10);

                  // Create area path for this segment
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
                      fill={isPositive ? `url(#gradient-green-${company.id})` : `url(#gradient-red-${company.id})`}
                      stroke="none"
                    />
                  );
                });
              })()}

              {/* Draw colored line segments */}
              {(() => {
                if (weeklyHistory.length < 2) return null;

                const prices = weeklyHistory.map(h => h.price);
                const minPrice = Math.min(...prices);
                const maxPrice = Math.max(...prices);
                const priceRange = maxPrice - minPrice || 1;
                const graphHeight = 60;
                const graphWidth = 300;
                const pointCount = weeklyHistory.length;
                const xStep = graphWidth / (pointCount - 1);

                return weeklyHistory.map((history, index) => {
                  if (index === 0) return null;

                  const prevPrice = weeklyHistory[index - 1].price;
                  const currentPrice = history.price;
                  const segmentColor = currentPrice >= prevPrice ? '#16a34a' : '#dc2626';

                  const prevX = (index - 1) * xStep;
                  const currentX = index * xStep;
                  const prevY = graphHeight - (((prevPrice - minPrice) / priceRange) * 40 + 10);
                  const currentY = graphHeight - (((currentPrice - minPrice) / priceRange) * 40 + 10);

                  return (
                    <line
                      key={`line-${index}`}
                      x1={prevX}
                      y1={prevY}
                      x2={currentX}
                      y2={currentY}
                      stroke={segmentColor}
                      strokeWidth="2.5"
                    />
                  );
                });
              })()}

              {/* Interactive hover points - EXACTLY at data coordinates */}
              {weeklyHistory.map((history, index) => {
                const prices = weeklyHistory.map(h => h.price);
                const minPrice = Math.min(...prices);
                const maxPrice = Math.max(...prices);
                const priceRange = maxPrice - minPrice || 1;
                const graphHeight = 60;
                const graphWidth = 300;
                const pointCount = weeklyHistory.length;
                const xStep = graphWidth / (pointCount - 1);

                // EXACT coordinate calculation
                const x = index * xStep;
                const normalizedPrice = ((history.price - minPrice) / priceRange) * 40 + 10;
                const y = graphHeight - normalizedPrice;

                // Color based on previous point
                const prevPrice = index > 0 ? weeklyHistory[index - 1].price : history.price;
                const pointIsPositive = history.price >= prevPrice;
                const pointColor = pointIsPositive ? '#16a34a' : '#dc2626';

                return (
                  <g key={`point-${index}`}>
                    {/* Larger invisible hit area for easier hovering */}
                    <circle
                      cx={x}
                      cy={y}
                      r="8"
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => {
                        // Show the visible point
                        const visiblePoint = e.currentTarget.nextElementSibling;
                        if (visiblePoint) {
                          visiblePoint.style.opacity = '1';
                          visiblePoint.setAttribute('r', '5');
                        }

                        // Show tooltip at EXACT point location
                        const date = new Date(history.date);

                        const formattedDate = date.toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric'
                        });

                        let tooltip = document.getElementById(`tooltip-${company.symbol}`);
                        if (!tooltip) {
                          tooltip = document.createElement('div');
                          tooltip.id = `tooltip-${company.symbol}`;
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

                        // Position tooltip ABOVE the point
                        const svgRect = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                        const tooltipX = svgRect.left + x * (svgRect.width / 300);
                        const tooltipY = svgRect.top + y * (svgRect.height / 60) - 60; // Position above point

                        tooltip.style.left = `${tooltipX}px`;
                        tooltip.style.top = `${tooltipY}px`;
                        tooltip.style.transform = 'translateX(-50%)'; // Center horizontally
                        tooltip.innerHTML = `
                <div style="color: #374151; font-weight: 600; margin-bottom: 4px; text-align: center;">${formattedDate}</div>
                <div style="color: #6b7280; font-size: 11px; text-align: center;">
                  Price: <span style="color: ${pointColor}; font-weight: 600;">${history.price.toFixed(2)}</span>
                </div>
              `;
                        tooltip.style.display = 'block';
                      }}
                      onMouseLeave={(e) => {
                        // Hide the visible point
                        const visiblePoint = e.currentTarget.nextElementSibling;
                        if (visiblePoint) {
                          visiblePoint.style.opacity = '0';
                          visiblePoint.setAttribute('r', '3');
                        }

                        // Hide tooltip
                        const tooltip = document.getElementById(`tooltip-${company.symbol}`);
                        if (tooltip) {
                          tooltip.style.display = 'none';
                        }
                      }}
                    />

                    {/* Visible point (shown on hover) */}
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
                {company.weight_percentage}%
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

          {/* Change Pill - CENTER ALIGNED - LIGHT COLORS LIKE 1D RETURN BOX */}
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
        </a>
      );
    })
    , [companies, priceHistories, fundType]);

  return (
    <div style={{ minHeight: '100vh', background: 'white' }}>
      {/* Header - UPDATED TO MATCH DASHBOARD */}
      <div className="dashboard-header">
        <div className="dashboard-header-content">
          {/* Left - Main Title */}
          <h1
            className="dashboard-main-heading"
            onClick={() => window.location.href = '/'}
            style={{ cursor: 'pointer' }}
          >
            📊 Pakistan Investment Fund
          </h1>
          {/* Right Section */}
          <div className="dashboard-user-section">
            {/* Center Group */}
            <div className="dashboard-center-group">

            </div>

            {/* Admin Link */}
            <a
              href="/admin"
              style={{
                padding: '8px 16px',
                background: 'white',
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                color: '#374151',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'all 0.2s ease',
                display: 'inline-block'
              }}
              onMouseOver={(e) => {
                e.target.style.background = '#f9fafb';
                e.target.style.borderColor = '#d1d5db';
                e.target.style.transform = 'translateY(-1px)';
              }}
              onMouseOut={(e) => {
                e.target.style.background = 'white';
                e.target.style.borderColor = '#e5e7eb';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              Admin Panel
            </a>
          </div>
        </div>
      </div>

      {/* Stock Market Header with Slider */}
      <Header />

      {/* Main Content - UPDATED to match Dashboard container */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 16px' }}>
        {error && (
          <div style={{
            background: '#fee',
            border: '1px solid #fcc',
            padding: '15px',
            borderRadius: '8px',
            marginBottom: '20px',
            color: '#c33'
          }}>
            <strong>⚠️ Error:</strong> {error}
          </div>
        )}

        {!lastNav ? (
          <div style={{ background: '#fff3cd', padding: '20px', borderRadius: '10px', marginBottom: '30px' }}>
            <h3 className="calculator-setup-heading">🎯 First Time Setup</h3>
            <p>Enter your initial NAV value to begin tracking.</p>
          </div>
        ) : (
          <div className="fund-card">
            <div className="fund-header">
              {/* Left */}
              <div className="fund-left">
                <div className="fund-avatar" style={{
                  backgroundColor: '#1F2433', // DIRECT CHARCOAL BLUE
                  color: '#ffffff' // DIRECT WHITE
                }}>
                  {fundAvatarText[fundType]}
                </div>
                <div className="fund-info">
                  <h2 className="fund-title">
                    {fundMetadata?.display_name || fundDisplayNames[fundType]}
                  </h2>
                  <div className="fund-symbol">PSX: {fundMetadata?.psx_symbol || fundSymbols[fundType]}</div>
                </div>
              </div>

              {/* Right - NAV */}
              <div className="header-right">
                <div className="header-right-price">
                  {parseFloat(lastNav.nav_value).toFixed(2)}
                </div>
                {navChangeData && (
                  <>
                    <div className="header-right-change" style={{
                      color: navChangeData.isPositive ? '#16a34a' : '#dc2626',
                      fontWeight: '600'
                    }}>
                      {navChangeData.navChange.toFixed(2)} ({navChangeData.isPositive ? '+' : ''}{navChangeData.changePercent.toFixed(2)}%)
                    </div>
                    <div className="header-right-updated">
                      {lastNav.calculated_at ? new Date(lastNav.calculated_at).toLocaleString('en-PK', {
                        timeZone: 'Asia/Karachi',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                      }) : '--'}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Description */}
            {navChangeData && (
              <p style={{ color: '#4b5563', fontSize: '14px', margin: '20px 0 0 0', lineHeight: '1.6' }}>
                {fundMetadata?.display_name || fundDisplayNames[fundType]}'s current NAV price is{' '}
                <span style={{ fontWeight: '600', color: '#111827' }}>{navChangeData.currentNavValue.toFixed(2)}</span>. One-day return:{' '}
                <span style={{
                  fontWeight: '600',
                  color: navChangeData.changePercent >= 0 ? '#16a34a' : '#dc2626'
                }}>
                  {navChangeData.changePercent >= 0 ? '+' : ''}{navChangeData.changePercent.toFixed(2)}%
                </span>.
              </p>
            )}

            {/* Returns Row */}
            {navChangeData && (
              <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' }}>
                <h3 style={{ fontWeight: '600', color: '#374151', margin: '0 0 12px 0', fontSize: '14px' }}>Returns</h3>
                <div className="returns-grid">
                  <div
                    className="return-box"
                    style={{
                      backgroundColor: navChangeData.isPositive ? '#d1fae5' : '#fef2f2',
                      border: `1px solid ${navChangeData.isPositive ? '#86efac' : '#fca5a5'}`,
                    }}
                  >
                    <span className="return-box-label" style={{
                      color: navChangeData.isPositive ? '#16a34a' : '#dc2626'
                    }}>1D</span>
                    <span className="return-box-value" style={{
                      color: navChangeData.isPositive ? '#16a34a' : '#dc2626',
                      fontWeight: '600'
                    }}>
                      {navChangeData.isPositive ? '+' : ''}{navChangeData.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Info Grid - UPDATED with dynamic color */}
            {/* Info Grid - Three Separate Blocks */}
            {navChangeData && (
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
                    color: navChangeData.navChange >= 0 ? '#16a34a' : '#dc2626'
                  }}>
                    {navChangeData.navChange >= 0 ? '+' : ''}{navChangeData.navChange.toFixed(2)}
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
                    {navChangeData.prevDayNavValue.toFixed(2)}
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
                    minWidth: '180px',
                    maxWidth: '240px',
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
            )}
            {/* Auto-refresh indicator */}
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '16px', textAlign: 'center' }}>
              Auto-Refresh every 5 mins
            </p>
          </div>
        )}

        {/* 🔥 PASS SHARED DATA to NavChart */}
        <div style={{ marginTop: '32px' }}>
          <NavChart
            fundType={fundType}
            sharedData={sharedData}
            key={`navchart-${fundType}`}
          />
        </div>

        <div style={{ marginTop: '32px' }}>

          {companies.length === 0 ? (
            <div style={{ padding: '20px', background: '#f8d7da', borderRadius: '5px', margin: '20px 0' }}>
              <p>⚠️ No active companies found for  {fundMetadata?.display_name || fundDisplayNames[fundType]}. Please add companies from the admin panel.</p>
            </div>
          ) : (
            <div>
              {!lastNav && (
                <div className="form-group" style={{ marginBottom: '30px', maxWidth: '400px' }}>
                  <label htmlFor="lastNav">Initial NAV Value: *</label>
                  <input
                    type="number"
                    id="lastNav"
                    value={initialNav}
                    onChange={(e) => setInitialNav(e.target.value)}
                    step="0.01"
                    placeholder="e.g., 49.96"
                    required
                  />
                  <small style={{ color: '#666' }}>This will be your starting NAV value</small>
                </div>
              )}

              <h3 className='active-companies-heading'>Active Companies ({companies.length}):</h3>
              <div className="companies-grid">
                {companyCards}
              </div>

              {!lastNav && (
                <button
                  onClick={handleInitialize}
                  disabled={loading}
                  className="btn-primary"
                  style={{ marginTop: '30px' }}
                >
                  {loading ? 'Initializing...' : '💾 Initialize & Calculate'}
                </button>
              )}
            </div>
          )}

          {loading && (
            <div className="loading">
              <p>⏳ Fetching live data from PSX...</p>
            </div>
          )}

          {results && (
            <div className="results-section">
              <h2 className="calculator-results-heading">Results</h2>
              <div className="results-content">
                <div style={{ background: '#E7F3FF', padding: '20px', borderRadius: '10px', marginBottom: '30px' }}>
                  <h3 style={{ color: '#667EEA', marginBottom: '15px' }}>📊 NAV Calculation Summary</h3>
                  <p style={{ fontSize: '20px', margin: '15px 0', color: '#667EEA' }}>
                    <strong>{fundDisplayNames[fundType]}</strong>
                  </p>
                  <p style={{ fontSize: '28px', margin: '15px 0', color: '#667EEA' }}>
                    <strong>Current NAV:</strong> {parseFloat(results.nav).toFixed(4)}
                  </p>
                  <p style={{ fontSize: '14px', margin: '10px 0' }}>
                    <strong>Companies Processed:</strong> {results.companies_processed || 0}
                  </p>
                  <small style={{ color: '#666' }}>
                    Calculated at: {results.timestamp}
                  </small>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Calculator
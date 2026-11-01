import { Calendar, ChevronDown } from "lucide-react";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { supabase } from '../../services/supabase';
import { autoFormatDate } from '../../utils/dateUtils';

// Fund configuration
const getFundConfig = (fundType) => {
  const baseConfigs = {
    al_meezan: {
      id: "ea6b13b2-f1e1-460a-904f-29a8747521da",
      defaultRange: "1Y",
      type: "mutual-fund",
    },
    energy: {
      id: "25ec9842-c58c-4b3a-bb7c-eb2a08778fae",
      defaultRange: "6M",
      type: "mutual-fund",
    },
    islamic: {
      id: "698bac51-81aa-4e0c-ad94-93d630e1e2a4",
      defaultRange: "1Y",
      type: "mutual-fund",
    },
    pakistan: {
      id: "MZNPETF",
      defaultRange: "1Y",
      type: "etf",
    },
  };

  return baseConfigs[fundType] || baseConfigs.al_meezan;
};

const DEFAULT_FUND_TYPE = 'al_meezan';
const TIME_RANGES = ["TD", "1D", "1W", "1M", "6M", "1Y", "3Y", "5Y", "All", "CR"];

// ✅ UPDATED: CustomTooltip with percentage calculation (FIXED ERROR)
const CustomTooltip = ({ active, payload, fundType, mode, chartData = [] }) => {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload;
    const isPositive = dataPoint.isPositive;
    const isETF = fundType === 'pakistan';
    const isStock = mode === 'stock';
    const valueLabel = isStock ? 'Price' : (isETF ? 'Price' : 'NAV');

    // ✅ Calculate percentage from start of chart data (with error handling)
    let percentageChange = 0;
    let hasPercentageData = false;

    try {
      if (chartData && Array.isArray(chartData) && chartData.length > 0) {
        // Get the first point in the current chart data (start point)
        const startPoint = chartData[0];

        if (startPoint && startPoint.value !== undefined && dataPoint.value !== undefined) {
          const startValue = parseFloat(startPoint.value);
          const currentValue = parseFloat(dataPoint.value);

          if (!isNaN(startValue) && !isNaN(currentValue) && startValue !== 0) {
            percentageChange = ((currentValue - startValue) / startValue) * 100;
            hasPercentageData = true;
          }
        }
      }
    } catch (error) {
      console.error("Error calculating percentage:", error);
      hasPercentageData = false;
    }

    return (
      <div style={{
        background: 'white',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        minWidth: '220px'
      }}>
        <div style={{
          fontSize: '12px',
          color: '#616E85',
          fontWeight: '600',
          marginBottom: '8px',
          borderBottom: '1px solid #f0f0f0',
          paddingBottom: '6px'
        }}>
          {dataPoint.fullDate || dataPoint.date || 'Unknown Date'}
        </div>

        {/* Value Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '6px'
        }}>
          <span style={{ fontSize: '12px', fontWeight: '600', color: '#616E85' }}>{valueLabel}:</span>
          <span style={{
            fontSize: '12px',
            color: '#111827',
            fontWeight: '600'
          }}>
            {dataPoint.value !== undefined ? parseFloat(dataPoint.value).toFixed(4) : '--'}
          </span>
        </div>

        {/* Percentage Row - Only show if we have valid data */}
        {hasPercentageData && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#616E85' }}>Change:</span>
            <span style={{
              fontSize: '12px',
              color: percentageChange >= 0 ? '#4ADE80' : '#F87171',
              fontWeight: '600'
            }}>
              {percentageChange >= 0 ? '+' : ''}{percentageChange.toFixed(2)}%
            </span>
          </div>
        )}

        {/* Additional info for TD/1D ranges */}
        {(mode !== 'stock' && (fundType === 'TD' || fundType === '1D')) && dataPoint.isPositive !== undefined && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '6px',
            paddingTop: '6px',
            borderTop: '1px solid #f0f0f0'
          }}>
            <span style={{ fontSize: '12px', color: '#616E85' }}>Direction:</span>
            <span style={{
              fontSize: '12px',
              color: dataPoint.isPositive ? '#4ADE80' : '#F87171',
              fontWeight: '600'
            }}>
              {dataPoint.isPositive ? '▲ Up' : '▼ Down'}
            </span>
          </div>
        )}
      </div>
    );
  }
  return null;
};
const CustomActiveDot = (props) => {
  const { cx, cy, payload } = props;
  if (!payload || !cx || !cy) return null;

  const isPositive = payload.isPositive;
  const color = isPositive ? '#4ADE80' : '#F87171';

  return (
    <circle
      cx={cx}
      cy={cy}
      r={6}
      fill={color}
      stroke="white"
      strokeWidth={2}
      style={{ cursor: 'pointer' }}
    />
  );
};

const CustomLine = (props) => {
  const { points } = props;
  if (!points || points.length < 2) return null;

  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];

    const isPositive = end.payload.isPositive;
    const color = isPositive ? '#4ADE80' : '#F87171';

    segments.push(
      <line
        key={i}
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={color}
        strokeWidth={2.5}
        fill="none"
      />
    );
  }

  return <g>{segments}</g>;
};

const NavChart = ({ mode = 'nav', symbol = null, fundType: propFundType = null }) => {
  const [chartData, setChartData] = useState([]);
  const [allHistoricalData, setAllHistoricalData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("TD");
  const [error, setError] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(100);
  const [crZoomState, setCrZoomState] = useState({ start: 0, end: 100 });
  const [isDragging, setIsDragging] = useState(null);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [appliedStartDate, setAppliedStartDate] = useState("");
  const [appliedEndDate, setAppliedEndDate] = useState("");
  const [availableDates, setAvailableDates] = useState({ min: "", max: "" });
  const [fundType, setFundType] = useState(propFundType || DEFAULT_FUND_TYPE);
  const [isFundInitialized, setIsFundInitialized] = useState(false);
  const [isCustomRangeOpen, setIsCustomRangeOpen] = useState(false);
  const [fundMetadata, setFundMetadata] = useState(null);
  const crButtonRef = useRef(null);
  const [previousTimeRange, setPreviousTimeRange] = useState("TD");

  // Initialize fund type
  useEffect(() => {
    if (mode === 'stock' && propFundType) {
      setFundType(propFundType);
      setIsFundInitialized(true);
      return;
    }
    const savedFundType = localStorage.getItem('selected_fund_type');

    if (savedFundType && getFundConfig(savedFundType)) {
      setFundType(savedFundType);
    } else {
      setFundType(DEFAULT_FUND_TYPE);
    }

    setTimeRange("TD");
    setRangeStart(0);
    setRangeEnd(100);
    setIsFundInitialized(true);
  }, []);

  // Fetch fund metadata
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

  // Downsampling function
  const downsampleData = (data, maxPoints = 300) => {
    if (data.length <= maxPoints) {
      return data;
    }

    const sampledData = [];
    const step = data.length / maxPoints;

    for (let i = 0; i < maxPoints; i++) {
      const index = Math.floor(i * step);
      sampledData.push(data[index]);
    }
    return sampledData;
  };


  // ✅ NEW: Fetch NAV data from database based on number of days
  // ✅ FIXED: Fetch NAV data from database based on number of days
  const fetchNAVDataFromDB = async (days) => {
    try {
      console.log(`📊 Fetching data for ${timeRange} range (${days} days) from database for ${fundType}`);

      const today = new Date();
      let startDate = new Date(today);

      // ✅ FIX: For 1D range, fetch last 10 days to ensure we get at least 2-3 trading days
      if (timeRange === "1D") {
        startDate.setDate(today.getDate() - 10);  // Fetch 10 days to account for weekends
      } else if (timeRange === "All") {
        startDate = null;
      } else {
        startDate.setDate(today.getDate() - days);
      }

      const todayStr = today.toISOString().split('T')[0];
      let allData = [];

      // 1. Fetch from historical_nav (past data)
      let historicalQuery = supabase
        .from('historical_nav')
        .select('nav_value, market_date')
        .eq('fund_type', fundType)
        .order('market_date', { ascending: true });

      // Only apply date filter if not "All" range
      if (timeRange !== "All") {
        const startDateStr = startDate.toISOString().split('T')[0];
        historicalQuery = historicalQuery
          .gte('market_date', startDateStr)
          .lte('market_date', todayStr);
      }

      const { data: historicalData, error: histError } = await historicalQuery;

      if (histError) {
        console.warn('⚠️ Error fetching historical_nav:', histError);
      } else if (historicalData && historicalData.length > 0) {
        console.log(`✅ Fetched ${historicalData.length} points from historical_nav for ${timeRange} range`);
        allData = historicalData.map(entry => ({
          date: entry.market_date,
          nav: parseFloat(entry.nav_value),
          source: 'historical_nav'
        }));
      }

      // 2. Fetch from daily_closes (recent data)
      let dailyQuery = supabase
        .from('daily_closes')
        .select('closing_nav, market_date')
        .eq('fund_type', fundType)
        .order('market_date', { ascending: true });

      // Only apply date filter if not "All" range
      if (timeRange !== "All" && startDate) {
        const startDateStr = startDate.toISOString().split('T')[0];
        dailyQuery = dailyQuery
          .gte('market_date', startDateStr)
          .lte('market_date', todayStr);
      }

      const { data: dailyData, error: dailyError } = await dailyQuery;

      if (dailyError) {
        console.warn('⚠️ Error fetching daily_closes:', dailyError);
      } else if (dailyData && dailyData.length > 0) {
        console.log(`✅ Fetched ${dailyData.length} points from daily_closes`);

        // Merge daily_closes data with historical data
        dailyData.forEach(entry => {
          const existingIndex = allData.findIndex(d => d.date === entry.market_date);
          if (existingIndex >= 0) {
            // Replace historical value with daily_closes value
            allData[existingIndex] = {
              date: entry.market_date,
              nav: parseFloat(entry.closing_nav),
              source: 'daily_closes'
            };
          } else {
            // Add new entry
            allData.push({
              date: entry.market_date,
              nav: parseFloat(entry.closing_nav),
              source: 'daily_closes'
            });
          }
        });
      }

      // Sort by date
      allData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // 3. Fetch latest value from nav_history for today
      const { data: latestNav, error: navError } = await supabase
        .from('nav_history')
        .select('nav_value, calculated_at')
        .eq('fund_type', fundType)
        .gte('calculated_at', todayStr)
        .order('calculated_at', { ascending: false })
        .limit(1);

      if (!navError && latestNav && latestNav.length > 0) {
        const latestEntry = latestNav[0];
        const latestDate = new Date(latestEntry.calculated_at).toISOString().split('T')[0];

        // Check if we already have today's data
        const todayExists = allData.some(d => d.date === latestDate);

        if (todayExists) {
          // Replace today's value with latest from nav_history
          const todayIndex = allData.findIndex(d => d.date === latestDate);
          allData[todayIndex] = {
            date: latestDate,
            nav: parseFloat(latestEntry.nav_value),
            source: 'nav_history'
          };
          console.log(`✅ Updated today's value with latest from nav_history`);
        } else {
          // Add today's value
          allData.push({
            date: latestDate,
            nav: parseFloat(latestEntry.nav_value),
            source: 'nav_history'
          });
          console.log(`✅ Added today's value from nav_history`);
        }
      }

      // Remove duplicates and sort again
      const uniqueData = Array.from(
        allData.reduce((map, item) => {
          const existing = map.get(item.date);
          if (!existing || new Date(item.date).getTime() >= new Date(existing.date).getTime()) {
            map.set(item.date, item);
          }
          return map;
        }, new Map()).values()
      );

      uniqueData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // ✅ FIX: For 1D range, return only last 2 previous values + today's latest value
      if (timeRange === "1D") {
        // Get last 2 values from daily_closes/historical_nav (excluding today)
        const todayStr = new Date().toISOString().split('T')[0];
        const historicalValues = uniqueData.filter(d => d.date < todayStr);
        const last2Historical = historicalValues.slice(-2);  // Last 2 trading days

        // Get today's value (should be the last entry with source 'nav_history')
        const todayValue = uniqueData.find(d => d.date === todayStr && d.source === 'nav_history');

        // Combine: 2 old + 1 current = 3 total points
        let finalData = [...last2Historical];
        if (todayValue) {
          finalData.push(todayValue);
        }

        console.log(`✅ 1D Range: Returning ${finalData.length} points (2 historical + 1 current)`);
        return finalData;
      }

      console.log(`📈 Total unique data points for ${timeRange} range: ${uniqueData.length}`);
      return uniqueData;

    } catch (err) {
      console.error("❌ Error fetching NAV data from database:", err);
      throw err;
    }
  };

  // ✅ Format today's intraday data
  const formatTodayIntradayData = async (todayStr) => {
    try {
      // Get previous day's closing value
      const { data: previousDayClose, error: closeError } = await supabase
        .from('daily_closes')
        .select('closing_nav, market_date')
        .eq('symbol', fundType.toUpperCase())
        .lt('market_date', todayStr)
        .order('market_date', { ascending: false })
        .limit(1)
        .single();

      if (closeError) {
        console.warn('⚠️ Could not fetch previous day closing value:', closeError);
      }

      // Get today's data from nav_history
      const { data: navData, error } = await supabase
        .from('nav_history')
        .select('nav_value, calculated_at')
        .eq('fund_type', fundType)
        .gte('calculated_at', todayStr)
        .order('calculated_at', { ascending: true });

      if (error) throw error;

      if (!navData || navData.length === 0) {
        return [];
      }

      // Skip the first entry from nav_history
      const dataToFormat = navData.length > 1 ? navData.slice(1) : navData;

      const formattedData = dataToFormat.map((entry) => {
        const timestampStr = entry.calculated_at;
        const utcTimestampStr = (timestampStr && !timestampStr.endsWith('Z') && !timestampStr.includes('+'))
          ? timestampStr + 'Z'
          : timestampStr;

        const dateObj = new Date(utcTimestampStr);

        const timeOptions = {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Asia/Karachi'
        };

        const fullDateOptions = {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Karachi',
          timeZoneName: 'short'
        };

        const pkTime = dateObj.toLocaleTimeString('en-US', timeOptions);
        const pkFullDate = dateObj.toLocaleString('en-US', fullDateOptions);

        return {
          date: pkTime,
          fullDate: pkFullDate,
          value: parseFloat(entry.nav_value),
          timestamp: dateObj.getTime(),
          originalDate: entry.calculated_at
        };
      });

      // Add previous day's closing value as first point
      if (previousDayClose && previousDayClose.closing_nav && navData.length > 0) {
        const firstEntryTimestamp = navData[0].calculated_at;
        const utcTimestampStr = (firstEntryTimestamp && !firstEntryTimestamp.endsWith('Z') && !firstEntryTimestamp.includes('+'))
          ? firstEntryTimestamp + 'Z'
          : firstEntryTimestamp;

        const dateObj = new Date(utcTimestampStr);

        const timeOptions = {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Asia/Karachi'
        };

        const fullDateOptions = {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Karachi',
          timeZoneName: 'short'
        };

        const pkTime = dateObj.toLocaleTimeString('en-US', timeOptions);
        const pkFullDate = dateObj.toLocaleString('en-US', fullDateOptions);

        formattedData.unshift({
          date: pkTime,
          fullDate: pkFullDate,
          value: parseFloat(previousDayClose.closing_nav),
          timestamp: dateObj.getTime(),
          originalDate: previousDayClose.market_date
        });

        console.log(`✅ Added previous day closing value: ${previousDayClose.closing_nav}`);
      }

      return formattedData;

    } catch (err) {
      console.error("❌ Error formatting today's intraday data:", err);
      throw err;
    }
  };

  const timeRangeConfig = {
    "TD": { days: 0, label: "Today", source: "database" },
    "1D": { days: 1, label: "1 Day", source: "api" },          // ✅ API
    "1W": { days: 7, label: "1 Week", source: "api" },         // ✅ API
    "1M": { days: 30, label: "1 Month", source: "api" },       // ✅ API
    "6M": { days: 180, label: "6 Months", source: "api" },     // ✅ API
    "1Y": { days: 365, label: "1 Year", source: "api" },       // ✅ API
    "3Y": { days: 1095, label: "3 Years", source: "api" },     // ✅ API
    "5Y": { days: 1825, label: "5 Years", source: "api" },     // ✅ API
    All: { days: "infinity", label: "All Time", source: "api" }, // ✅ API
    "CR": { days: "custom", label: "Custom Range", source: "custom" },
  };

  // Data Loading Effect
  useEffect(() => {
    if (!getFundConfig(fundType) || !isFundInitialized) return;

    loadChartData();

    const interval = setInterval(() => {
      loadChartData();
    }, 300000);  // 5 minutes

    return () => clearInterval(interval);
  }, [timeRange, appliedStartDate, appliedEndDate, fundType, isFundInitialized]);

  // Container Width Detection
  useEffect(() => {
    const handleResize = () => {
      const container = document.querySelector('.chart-container');
      if (container) {
        setContainerWidth(container.offsetWidth);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ✅ Load ALL Historical Data from Database
  // ✅ Load Available Date Range from Database
  useEffect(() => {
    if (!getFundConfig(fundType)) return;

    const loadDateRange = async () => {
      try {
        console.log('📊 Loading available date range from database...');
        console.log('🔍 Fund Type:', fundType);

        // Get min date from historical_nav
        const { data: minHistData, error: minHistError } = await supabase
          .from('historical_nav')
          .select('market_date')
          .eq('fund_type', fundType)
          .order('market_date', { ascending: true })
          .limit(1);

        if (minHistError) console.error('Error fetching min from historical_nav:', minHistError);
        console.log('Min from historical_nav:', minHistData);

        // Get max date from historical_nav
        const { data: maxHistData, error: maxHistError } = await supabase
          .from('historical_nav')
          .select('market_date')
          .eq('fund_type', fundType)
          .order('market_date', { ascending: false })
          .limit(1);

        if (maxHistError) console.error('Error fetching max from historical_nav:', maxHistError);
        console.log('Max from historical_nav:', maxHistData);

        // Get min date from daily_closes
        // Note: daily_closes uses 'symbol' field, try both fundType and fundType.toUpperCase()
        const { data: minDailyData, error: minDailyError } = await supabase
          .from('daily_closes')
          .select('market_date')
          .eq('symbol', fundType)
          .order('market_date', { ascending: true })
          .limit(1);

        if (minDailyError) console.error('Error fetching min from daily_closes:', minDailyError);
        console.log('Min from daily_closes (with fundType):', minDailyData);

        // Get max date from daily_closes
        const { data: maxDailyData, error: maxDailyError } = await supabase
          .from('daily_closes')
          .select('market_date')
          .eq('symbol', fundType)
          .order('market_date', { ascending: false })
          .limit(1);

        if (maxDailyError) console.error('Error fetching max from daily_closes:', maxDailyError);
        console.log('Max from daily_closes (with fundType):', maxDailyData);

        // Determine overall min and max dates
        let minDate = null;
        let maxDate = null;

        if (minHistData && minHistData.length > 0) {
          minDate = minHistData[0].market_date;
        }
        if (minDailyData && minDailyData.length > 0) {
          if (!minDate || new Date(minDailyData[0].market_date) < new Date(minDate)) {
            minDate = minDailyData[0].market_date;
          }
        }

        if (maxHistData && maxHistData.length > 0) {
          maxDate = maxHistData[0].market_date;
        }
        if (maxDailyData && maxDailyData.length > 0) {
          if (!maxDate || new Date(maxDailyData[0].market_date) > new Date(maxDate)) {
            maxDate = maxDailyData[0].market_date;
          }
        }

        // Also check today's date from nav_history
        const today = new Date().toISOString().split('T')[0];
        if (!maxDate || new Date(today) > new Date(maxDate)) {
          maxDate = today;
        }

        console.log('📅 Final Date Range:', { minDate, maxDate });

        if (minDate && maxDate) {
          setAvailableDates({ min: minDate, max: maxDate });
          setCustomStartDate(minDate);
          setCustomEndDate(maxDate);

          console.log(`✅ Available date range: ${minDate} to ${maxDate}`);
        } else {
          console.warn('⚠️ Could not determine date range');
        }
      } catch (err) {
        console.error("Error loading date range:", err);
      }
    };

    loadDateRange();
  }, [fundType]);
  const loadCustomRangeData = async () => {
    try {
      console.log(`📊 loadCustomRangeData called with: ${appliedStartDate} to ${appliedEndDate}`);

       // ✅ FIX: If we're in CR mode but coming from TD with same start/end date (today),
    // and we have existing TD data, use that data instead of fetching
    if (previousTimeRange === "TD" && 
        appliedStartDate && appliedEndDate && 
        appliedStartDate === appliedEndDate) {
      const today = new Date().toISOString().split('T')[0];
      if (appliedStartDate === today && chartData.length > 0) {
        console.log("✅ Using existing TD data in CR mode");
        // We already have TD data loaded, just format it for display
        const formattedData = chartData.map(point => ({
          ...point,
          // Ensure proper date formatting for CR display
          date: point.date,
          fullDate: point.fullDate,
          value: point.value,
          timestamp: point.timestamp,
          originalDate: point.originalDate || today
        }));
        setChartData(formattedData);
        return;
      }
    }

      if (!appliedStartDate || !appliedEndDate) {
        console.log("⚠️ Missing applied dates");
        setChartData([]);
        return;
      }

      if (!getFundConfig(fundType)) throw new Error("Invalid fund type for custom range.");

      if (new Date(appliedStartDate) > new Date(appliedEndDate)) {
        console.error("Start date must be before end date");
        setChartData([]);
        return;
      }

      // ✅ FIX: Fetch data directly from database for custom range
      console.log(`🔍 Fetching data from database for range: ${appliedStartDate} to ${appliedEndDate}`);

      let allData = [];

      // 1. Fetch from historical_nav
      const { data: historicalData, error: histError } = await supabase
        .from('historical_nav')
        .select('nav_value, market_date')
        .eq('fund_type', fundType)
        .gte('market_date', appliedStartDate)
        .lte('market_date', appliedEndDate)
        .order('market_date', { ascending: true });

      if (histError) {
        console.warn('⚠️ Error fetching historical_nav:', histError);
      } else if (historicalData && historicalData.length > 0) {
        console.log(`✅ Fetched ${historicalData.length} points from historical_nav`);
        allData = historicalData.map(entry => ({
          date: entry.market_date,
          nav: parseFloat(entry.nav_value),
          source: 'historical_nav'
        }));
      }

      // 2. Fetch from daily_closes
      const { data: dailyData, error: dailyError } = await supabase
        .from('daily_closes')
        .select('closing_nav, market_date')
        .eq('fund_type', fundType)
        .gte('market_date', appliedStartDate)
        .lte('market_date', appliedEndDate)
        .order('market_date', { ascending: true });

      if (dailyError) {
        console.warn('⚠️ Error fetching daily_closes:', dailyError);
      } else if (dailyData && dailyData.length > 0) {
        console.log(`✅ Fetched ${dailyData.length} points from daily_closes`);

        // Merge daily_closes data
        dailyData.forEach(entry => {
          const existingIndex = allData.findIndex(d => d.date === entry.market_date);
          if (existingIndex >= 0) {
            allData[existingIndex] = {
              date: entry.market_date,
              nav: parseFloat(entry.closing_nav),
              source: 'daily_closes'
            };
          } else {
            allData.push({
              date: entry.market_date,
              nav: parseFloat(entry.closing_nav),
              source: 'daily_closes'
            });
          }
        });
      }

      // 3. Check if end date is today, then fetch from nav_history
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const endDateObj = new Date(appliedEndDate);
      const isEndDateToday = endDateObj.toDateString() === today.toDateString();

      if (isEndDateToday) {
        const { data: latestNav, error: navError } = await supabase
          .from('nav_history')
          .select('nav_value, calculated_at')
          .eq('fund_type', fundType)
          .gte('calculated_at', todayStr)
          .order('calculated_at', { ascending: false })
          .limit(1);

        if (!navError && latestNav && latestNav.length > 0) {
          const latestEntry = latestNav[0];
          const latestDate = new Date(latestEntry.calculated_at).toISOString().split('T')[0];

          const todayExists = allData.some(d => d.date === latestDate);

          if (todayExists) {
            const todayIndex = allData.findIndex(d => d.date === latestDate);
            allData[todayIndex] = {
              date: latestDate,
              nav: parseFloat(latestEntry.nav_value),
              source: 'nav_history'
            };
            console.log(`✅ Updated today's value with latest from nav_history`);
          } else {
            allData.push({
              date: latestDate,
              nav: parseFloat(latestEntry.nav_value),
              source: 'nav_history'
            });
            console.log(`✅ Added today's value from nav_history`);
          }
        }
      }

      // Sort by date
      allData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      console.log(`✅ Total data points fetched: ${allData.length}`);

      const filteredData = allData;

      let formattedData = filteredData.map((entry) => {
        const dateObj = new Date(entry.date);
        const displayDate = dateObj.getDate() + " " + dateObj.toLocaleDateString("en-US", { month: "short" });

        return {
          date: displayDate,
          fullDate: dateObj.toLocaleDateString("en-US"),
          value: entry.nav,
          timestamp: dateObj.getTime(),
          year: dateObj.getFullYear(),
          originalDate: entry.date
        };
      });

      const sortedData = formattedData.sort((a, b) => a.timestamp - b.timestamp);

      console.log(`📈 Final sorted data points: ${sortedData.length}`);
      console.log(`📅 Date range in chart: ${sortedData[0]?.fullDate} to ${sortedData[sortedData.length - 1]?.fullDate}`);

      setChartData(sortedData);

    } catch (err) {
      console.error("Error loading custom range data:", err);
      throw err;
    }
  };

  // ✅ Load Today Stock Data
  const loadTodayStockData = async () => {
    try {
      if (!symbol) throw new Error("No symbol provided for stock mode");

      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      const { data: priceData, error } = await supabase
        .from('price_history')
        .select('price, recorded_at')
        .eq('symbol', symbol)
        .gte('recorded_at', todayStr)
        .order('recorded_at', { ascending: true });

      if (error) throw error;

      if (!priceData || priceData.length === 0) {
        setChartData([]);
        return;
      }

      const formattedData = priceData.map((entry) => {
        const dateObj = new Date(entry.recorded_at);
        const pkDate = new Date(dateObj.getTime() + (5 * 60 * 60 * 1000));

        const pkTime = pkDate.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        const pkFullDate = pkDate.toLocaleString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }) + ' PKT';

        return {
          date: pkTime,
          fullDate: pkFullDate,
          value: parseFloat(entry.price),
          timestamp: pkDate.getTime(),
          originalDate: entry.recorded_at
        };
      });

      setChartData(formattedData);

    } catch (err) {
      console.error("❌ Error loading today's stock data:", err);
      throw err;
    }
  };

  // ✅ Load Today NAV Data
  const loadTodayData = async () => {
    try {
      if (!getFundConfig(fundType)) throw new Error("Invalid fund type for today's data.");

      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      const formattedData = await formatTodayIntradayData(todayStr);

      if (formattedData.length === 0) {
        setChartData([]);
        return;
      }

      const downsampledData = downsampleData(formattedData, 300);
      setChartData(downsampledData);

    } catch (err) {
      console.error("❌ Error loading today's data:", err);
      throw err;
    }
  };

  // ✅ Load Historical Stock Data
  const loadHistoricalStockData = async () => {
    try {
      if (!symbol) throw new Error("No symbol provided for stock mode");

      let daysParam = timeRangeConfig[timeRange].days;
      if (timeRange === "1D") {
        daysParam = 7;
      } else if (timeRange === "1W") {
        daysParam = 10;
      }

      // const ACTUAL_URL = `https://beta-restapi.sarmaaya.pk/api/stocks/price-history/${symbol}?days=${daysParam}`;
      // const API_URL = `https://corsproxy.io/?${encodeURIComponent(ACTUAL_URL)}`;
      const API_URL = `/api/stocks/price-history?symbol=${symbol}&days=${daysParam}`;

      const response = await fetch(API_URL, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const json = await response.json();

      if (!json.response || !Array.isArray(json.response)) {
        setChartData([]);
        return;
      }

      let filteredResponse = json.response;

      if (timeRange === "1M") {
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);

        filteredResponse = json.response.filter(entry => {
          const entryDate = new Date(entry.date);
          return entryDate >= thirtyDaysAgo;
        });
      }

      if (timeRange === "1D" && filteredResponse.length > 3) {
        const sortedData = [...filteredResponse].sort((a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        filteredResponse = sortedData.slice(-3);
      }

      if (timeRange === "1W" && filteredResponse.length > 7) {
        const sortedData = [...filteredResponse].sort((a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        filteredResponse = sortedData.slice(-7);
      }

      const formattedData = filteredResponse.map((entry) => {
        const dateObj = new Date(entry.date);

        let displayDate;
        if (timeRange === "3Y" || timeRange === "5Y" || timeRange === "All") {
          displayDate = dateObj.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        } else {
          displayDate = dateObj.getDate() + " " + dateObj.toLocaleDateString("en-US", { month: "short" });
        }

        return {
          date: displayDate,
          fullDate: dateObj.toLocaleDateString("en-US"),
          value: parseFloat(entry.price),
          timestamp: dateObj.getTime(),
          year: dateObj.getFullYear(),
          originalDate: entry.date
        };
      });

      const sortedData = formattedData.sort((a, b) => a.timestamp - b.timestamp);

      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      const { data: latestPrice, error: priceError } = await supabase
        .from('price_history')
        .select('price, recorded_at')
        .eq('symbol', symbol)
        .gte('recorded_at', todayStr)
        .order('recorded_at', { ascending: false })
        .limit(1);

      if (!priceError && latestPrice && latestPrice.length > 0) {
        const latestEntry = latestPrice[0];
        const latestDate = new Date(latestEntry.recorded_at);

        let displayDate;
        if (timeRange === "3Y" || timeRange === "5Y" || timeRange === "All") {
          displayDate = latestDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        } else {
          displayDate = latestDate.getDate() + " " + latestDate.toLocaleDateString("en-US", { month: "short" });
        }

        const newPoint = {
          date: displayDate,
          fullDate: latestDate.toLocaleDateString("en-US"),
          value: parseFloat(latestEntry.price),
          timestamp: latestDate.getTime(),
          year: latestDate.getFullYear(),
          originalDate: latestEntry.recorded_at
        };

        const lastApiPoint = sortedData.length > 0 ? sortedData[sortedData.length - 1] : null;

        if (lastApiPoint) {
          const lastApiDate = new Date(lastApiPoint.originalDate || lastApiPoint.timestamp);
          const isSameDay = lastApiDate.toDateString() === latestDate.toDateString();

          if (isSameDay) {
            sortedData[sortedData.length - 1] = newPoint;
          } else if (latestDate.getTime() > lastApiDate.getTime()) {
            sortedData.push(newPoint);
          }
        }
      }

      setChartData(sortedData);

    } catch (err) {
      console.error("Error loading historical stock data:", err);
      throw err;
    }
  };

  // ✅ NEW: Load Historical NAV Data from Database
  const loadHistoricalData = async () => {
    try {
      if (!getFundConfig(fundType)) throw new Error("Invalid fund type for historical data.");

      const daysParam = timeRangeConfig[timeRange].days;

      console.log(`📊 Loading ${timeRange} range (${daysParam} days) for ${fundType}`);

      // Fetch data from database
      const dbData = await fetchNAVDataFromDB(daysParam);

      if (dbData.length === 0) {
        setChartData([]);
        return;
      }

      // Format the data
      let formattedData = dbData.map((entry) => {
        const dateObj = new Date(entry.date);

        let displayDate;
        if (timeRange === "3Y" || timeRange === "5Y" || timeRange === "All") {
          displayDate = dateObj.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        } else {
          displayDate = dateObj.getDate() + " " + dateObj.toLocaleDateString("en-US", { month: "short" });
        }

        return {
          date: displayDate,
          fullDate: dateObj.toLocaleDateString("en-US"),
          value: entry.nav,
          timestamp: dateObj.getTime(),
          year: dateObj.getFullYear(),
          originalDate: entry.date
        };
      });

      // For 1W range, ensure we show last 7 data points
      if (timeRange === "1W" && formattedData.length > 7) {
        formattedData = formattedData.slice(-7);
      }

      // For 1D range, ensure we show last 3 data points
      if (timeRange === "1D" && formattedData.length > 3) {
        formattedData = formattedData.slice(-3);
      }

      setChartData(formattedData);
      console.log(`✅ Loaded ${formattedData.length} data points for ${timeRange} range`);

    } catch (err) {
      console.error("Error loading historical NAV data:", err);
      throw err;
    }
  };

  const handleApplyCustomRange = () => {
    if (!customStartDate || !customEndDate) {
      alert("Please select both a start and an end date.");
      return;
    }
    if (new Date(customStartDate) > new Date(customEndDate)) {
      alert("Start date must be before end date");
      return;
    }

    setAppliedStartDate(customStartDate);
    setAppliedEndDate(customEndDate);
    setCrZoomState({ start: 0, end: 100 });
    setRangeStart(0);
    setRangeEnd(100);
    setIsCustomRangeOpen(false);

    if (timeRange !== "CR") {
      setTimeRange("CR");
    }
  };

  const loadChartData = async () => {
    if (!getFundConfig(fundType)) {
      setError("Error: Invalid fund type configuration.");
      setLoading(false);
      setChartData([]);
      return;
    }

    const shouldRender = timeRange !== "CR" || (appliedStartDate && appliedEndDate);

     // ✅ FIX: If switching from TD to CR with same date, keep showing existing data
  if (timeRange === "CR" && previousTimeRange === "TD" && 
      appliedStartDate === appliedEndDate && chartData.length > 0) {
    // We already have TD data, just update the display
    setLoading(false);
    return;
  }

    if (timeRange === "CR" && !shouldRender) {
      setChartData([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (chartData.length === 0 || error) {
      setLoading(true);
    }

    setError(null);

    try {
      const config = timeRangeConfig[timeRange];

      if (config.source === "database") {
        if (mode === 'stock') {
          await loadTodayStockData();  // ✅ TD uses price_history
        } else {
          await loadTodayData();  // ✅ Funds TD uses nav_history
        }
      } else if (config.source === "custom") {
        await loadCustomRangeData();
      } else {  // source === "api"
        if (mode === 'stock') {
          await loadHistoricalStockData();  // ✅ Stocks use Sarmaya API for 1D, 1W, etc.
        } else {
          await loadHistoricalData();  // ✅ Funds use database for all tabs
        }
      }
    } catch (err) {
      console.error("Error loading chart:", err);
      setError(err.message);
      setChartData([]);
    } finally {
      if (timeRange !== "TD" || chartData.length === 0 || error) {
        setLoading(false);
      }
    }
  };

  // Memoize filtering the chart data
  const filteredChartData = useMemo(() => {
    if (chartData.length === 0) return [];

    const startIndex = Math.floor((rangeStart / 100) * chartData.length);
    const endIndex = Math.ceil((rangeEnd / 100) * chartData.length);

    return chartData.slice(startIndex, endIndex);
  }, [chartData, rangeStart, rangeEnd]);

  const displayChartData = useMemo(() => {
    const MAX_VISIBLE_POINTS = 5000;

    if (filteredChartData.length <= MAX_VISIBLE_POINTS) {
      return filteredChartData;
    }

    return downsampleData(filteredChartData, MAX_VISIBLE_POINTS);
  }, [filteredChartData]);

  const { minValue, maxValue, values } = useMemo(() => {
    const vals = displayChartData.map((d) => d.value).filter((v) => !isNaN(v));
    const min = vals.length ? Math.min(...vals) : 0;
    const max = vals.length ? Math.max(...vals) : 100;
    return { minValue: min, maxValue: max, values: vals };
  }, [displayChartData]);

  const startValue = chartData.length > 0 ? chartData[0].value : 0;

  const xTicksData = useMemo(() => {
    let indices = [];
    const dataPointCount = displayChartData.length;
    const chartDisplayWidth = containerWidth > 0 ? containerWidth - 100 : 500;
    const MIN_PIXELS_PER_TICK = 90;
    const maxVisibleTicks = Math.max(2, Math.floor(chartDisplayWidth / MIN_PIXELS_PER_TICK));

    if (timeRange === "CR" && dataPointCount > 0) {
      const firstTimestamp = displayChartData[0].timestamp;
      const lastTimestamp = displayChartData[dataPointCount - 1].timestamp;
      const daysDiff = (lastTimestamp - firstTimestamp) / (1000 * 60 * 60 * 24);

      if (daysDiff <= 1) {
        const DESIRED_TICKS_TD = 13;
        if (dataPointCount <= DESIRED_TICKS_TD) {
          for (let i = 0; i < dataPointCount; i++) {
            indices.push(i);
          }
        } else {
          indices = [];
          for (let i = 0; i < DESIRED_TICKS_TD; i++) {
            const exactPosition = i * ((dataPointCount - 1) / (DESIRED_TICKS_TD - 1));
            const index = Math.round(exactPosition);
            indices.push(index);
          }
          indices = Array.from(new Set(indices)).sort((a, b) => a - b);
          if (dataPointCount > 0 && !indices.includes(0)) {
            indices.unshift(0);
          }
          if (dataPointCount > 1 && !indices.includes(dataPointCount - 1)) {
            indices.push(dataPointCount - 1);
          }
          if (indices.length > DESIRED_TICKS_TD) {
            const newIndices = [0];
            const step = (indices.length - 1) / (DESIRED_TICKS_TD - 1);
            for (let i = 1; i < DESIRED_TICKS_TD - 1; i++) {
              const index = Math.round(i * step);
              newIndices.push(indices[index]);
            }
            newIndices.push(dataPointCount - 1);
            indices = newIndices;
          }
        }
      } else if (daysDiff <= 7) {
        const DESIRED_TICKS_1W = 9;
        if (dataPointCount <= DESIRED_TICKS_1W) {
          for (let i = 0; i < dataPointCount; i++) {
            indices.push(i);
          }
        } else {
          indices = [];
          for (let i = 0; i < DESIRED_TICKS_1W; i++) {
            const exactPosition = i * ((dataPointCount - 1) / (DESIRED_TICKS_1W - 1));
            const index = Math.round(exactPosition);
            indices.push(index);
          }
          indices = Array.from(new Set(indices)).sort((a, b) => a - b);
          if (dataPointCount > 0 && !indices.includes(0)) {
            indices.unshift(0);
          }
          if (dataPointCount > 1 && !indices.includes(dataPointCount - 1)) {
            indices.push(dataPointCount - 1);
          }
          if (indices.length > DESIRED_TICKS_1W) {
            const newIndices = [0];
            const step = (indices.length - 1) / (DESIRED_TICKS_1W - 1);
            for (let i = 1; i < DESIRED_TICKS_1W - 1; i++) {
              const index = Math.round(i * step);
              newIndices.push(indices[index]);
            }
            newIndices.push(dataPointCount - 1);
            indices = newIndices;
          }
        }
      } else if (daysDiff <= 31) {
        const desiredTicks = 9;
        if (dataPointCount <= desiredTicks) {
          for (let i = 0; i < dataPointCount; i++) {
            indices.push(i);
          }
        } else {
          indices = [];
          for (let i = 0; i < desiredTicks; i++) {
            const exactPosition = i * ((dataPointCount - 1) / (desiredTicks - 1));
            const index = Math.round(exactPosition);
            indices.push(index);
          }
          indices = Array.from(new Set(indices)).sort((a, b) => a - b);
          if (!indices.includes(0)) indices.unshift(0);
          if (!indices.includes(dataPointCount - 1)) indices.push(dataPointCount - 1);
        }
      } else if (daysDiff <= 180) {
        const desiredTicks = 8;
        if (dataPointCount <= desiredTicks) {
          for (let i = 0; i < dataPointCount; i++) {
            indices.push(i);
          }
        } else {
          indices = [];
          for (let i = 0; i < desiredTicks; i++) {
            const exactPosition = i * ((dataPointCount - 1) / (desiredTicks - 1));
            const index = Math.round(exactPosition);
            indices.push(index);
          }
          indices = Array.from(new Set(indices)).sort((a, b) => a - b);
          if (!indices.includes(0)) indices.unshift(0);
          if (!indices.includes(dataPointCount - 1)) indices.push(dataPointCount - 1);
        }
      } else if (daysDiff <= 365) {
        const desiredTicks = 10;
        if (dataPointCount <= desiredTicks) {
          for (let i = 0; i < dataPointCount; i++) {
            indices.push(i);
          }
        } else {
          indices = [];
          for (let i = 0; i < desiredTicks; i++) {
            const exactPosition = i * ((dataPointCount - 1) / (desiredTicks - 1));
            const index = Math.round(exactPosition);
            indices.push(index);
          }
          indices = Array.from(new Set(indices)).sort((a, b) => a - b);
          if (!indices.includes(0)) indices.unshift(0);
          if (!indices.includes(dataPointCount - 1)) indices.push(dataPointCount - 1);
        }
      } else {
        indices.push(0);
        if (dataPointCount > maxVisibleTicks) {
          const step = Math.floor(dataPointCount / (maxVisibleTicks - 1));
          for (let i = 1; i < dataPointCount - 1; i++) {
            if (i % step === 0) {
              indices.push(i);
            }
          }
        }
        if (dataPointCount > 1) {
          indices.push(dataPointCount - 1);
        }
      }
    }
    else if (timeRange === "TD") {
      const DESIRED_TICKS_TD = 13;

      if (dataPointCount <= DESIRED_TICKS_TD) {
        for (let i = 0; i < dataPointCount; i++) {
          indices.push(i);
        }
      } else {
        indices = [];

        for (let i = 0; i < DESIRED_TICKS_TD; i++) {
          const exactPosition = i * ((dataPointCount - 1) / (DESIRED_TICKS_TD - 1));
          const index = Math.round(exactPosition);
          indices.push(index);
        }

        indices = Array.from(new Set(indices)).sort((a, b) => a - b);

        if (dataPointCount > 0 && !indices.includes(0)) {
          indices.unshift(0);
        }
        if (dataPointCount > 1 && !indices.includes(dataPointCount - 1)) {
          indices.push(dataPointCount - 1);
        }

        if (indices.length > DESIRED_TICKS_TD) {
          const newIndices = [0];
          const step = (indices.length - 1) / (DESIRED_TICKS_TD - 1);
          for (let i = 1; i < DESIRED_TICKS_TD - 1; i++) {
            const index = Math.round(i * step);
            newIndices.push(indices[index]);
          }
          newIndices.push(dataPointCount - 1);
          indices = newIndices;
        }
      }
    }
    else if (timeRange === "1D") {
      if (dataPointCount <= 0) return [];

      const MAX_TICKS_1D = 10;

      if (dataPointCount <= MAX_TICKS_1D) {
        for (let i = 0; i < dataPointCount; i++) {
          indices.push(i);
        }
      } else {
        const step = Math.max(1, Math.floor(dataPointCount / MAX_TICKS_1D));
        for (let i = 0; i < dataPointCount; i += step) {
          indices.push(i);
        }
        if (dataPointCount > 1 && !indices.includes(dataPointCount - 1)) {
          indices.push(dataPointCount - 1);
        }
      }
    }
    else if (["1M", "6M", "1Y"].includes(timeRange)) {
      if (dataPointCount <= 0) return [];

      let desiredTicks;
      switch (timeRange) {
        case "1M":
          desiredTicks = 6;
          break;
        case "6M":
          desiredTicks = 8;
          break;
        case "1Y":
          desiredTicks = 10;
          break;
        default:
          desiredTicks = 6;
      }

      if (dataPointCount <= desiredTicks) {
        for (let i = 0; i < dataPointCount; i++) {
          indices.push(i);
        }
      } else {
        indices = [];

        for (let i = 0; i < desiredTicks; i++) {
          const exactPosition = i * ((dataPointCount - 1) / (desiredTicks - 1));
          const index = Math.round(exactPosition);
          indices.push(index);
        }

        indices = Array.from(new Set(indices)).sort((a, b) => a - b);

        if (dataPointCount > 0 && !indices.includes(0)) {
          indices.unshift(0);
        }
        if (dataPointCount > 1 && !indices.includes(dataPointCount - 1)) {
          indices.push(dataPointCount - 1);
        }

        if (indices.length > desiredTicks) {
          const newIndices = [0];
          const step = (indices.length - 1) / (desiredTicks - 1);
          for (let i = 1; i < desiredTicks - 1; i++) {
            const index = Math.round(i * step);
            newIndices.push(indices[index]);
          }
          newIndices.push(dataPointCount - 1);
          indices = newIndices;
        }
      }
    }
    else if (["1W"].includes(timeRange)) {
      if (timeRange === "1W" && dataPointCount > 0) {
        const step = Math.max(1, Math.floor(dataPointCount / 7));
        for (let i = 0; i < dataPointCount; i += step) {
          indices.push(i);
        }
        if (dataPointCount > 1 && !indices.includes(dataPointCount - 1)) {
          indices.push(dataPointCount - 1);
        }
      }
    }
    else if (dataPointCount > 0) {
      indices.push(0);

      if (dataPointCount > maxVisibleTicks) {
        const step = Math.floor(dataPointCount / (maxVisibleTicks - 1));

        for (let i = 1; i < dataPointCount - 1; i++) {
          if (i % step === 0) {
            indices.push(i);
          }
        }
      }

      if (dataPointCount > 1) {
        indices.push(dataPointCount - 1);
      }
    }

    const uniqueIndices = Array.from(new Set(indices)).sort((a, b) => a - b);

    return uniqueIndices.map(index => displayChartData[index].timestamp);
  }, [displayChartData.length, containerWidth, displayChartData, timeRange]);

  let stepSize = 0.5;
  if (timeRange === "TD") stepSize = 0.02;
  else if (timeRange === "1D") stepSize = 0.05;
  else if (timeRange === "CR") {
    if (previousTimeRange === "TD") stepSize = 0.02;
    else if (previousTimeRange === "1D") stepSize = 0.05;
    else if (previousTimeRange === "1W") stepSize = 1.0;
    else stepSize = 0.5;
  }
  else if (timeRange === "1W") stepSize = 1.0;
  else if (timeRange === "1M") stepSize = 0.5;
  else if (timeRange === "6M") stepSize = 1.0;
  else if (timeRange === "1Y") stepSize = 1.5;
  else if (timeRange === "3Y") stepSize = 2.0;
  else if (timeRange === "5Y") stepSize = 2.5;
  else if (timeRange === "All") stepSize = 3.0;

  const roundToStep = (num) => {
    const rounded = Math.round(num / stepSize) * stepSize;
    return parseFloat(rounded.toFixed(2));
  };

  let yAxisMin = minValue > 0 ? roundToStep(minValue - stepSize) : 0;
  let yAxisMax = roundToStep(maxValue + stepSize);

  const generateTicks = useCallback(() => {
    const ticks = [];
    let current = yAxisMin;
    while (current <= yAxisMax) {
      ticks.push(parseFloat(current.toFixed(2)));
      current += stepSize;
    }
    return ticks;
  }, [yAxisMin, yAxisMax, stepSize]);

  const zonedData = useMemo(() => {
    return displayChartData.map((point) => {
      const isAbove = point.value >= startValue;

      return {
        ...point,
        isPositive: isAbove,
        greenFillValue: isAbove ? point.value : startValue,
        redFillValue: !isAbove ? point.value : startValue,
        startLine: startValue
      };
    });
  }, [displayChartData, startValue]);

  const CustomDot = (props) => {
    const { cx, cy, payload, index } = props;
    if (!payload || !cx || !cy) return null;

    const isPositive = payload.isPositive;
    const color = isPositive ? '#4ADE80' : '#F87171';

    const totalPoints = displayChartData.length;
    if (totalPoints <= 1) return null;

    const isLastPointInView = index === totalPoints - 1;

    const pixelsPerPoint = containerWidth / totalPoints;
    let minPixelThreshold = 15;

    if (timeRange === "6M" || timeRange === "1Y" || timeRange === "CR") {
      minPixelThreshold = 25;
    } else if (timeRange === "3Y" || timeRange === "5Y" || timeRange === "All") {
      minPixelThreshold = 30;
    }

    const showDotsDueToDensity = pixelsPerPoint > minPixelThreshold;

    if (["TD", "1D", "1W", "1M"].includes(timeRange)) {
      return null;
    }

    if (isLastPointInView || showDotsDueToDensity) {
      return (
        <circle
          cx={cx}
          cy={cy}
          r={5}
          fill={color}
          stroke="white"
          strokeWidth={2}
          style={{ cursor: 'pointer' }}
        />
      );
    }

    return null;
  };

  const RangeNavigator = () => {
    const navigatorRef = useRef(null);
    const [localStart, setLocalStart] = useState(rangeStart);
    const [localEnd, setLocalEnd] = useState(rangeEnd);

    useEffect(() => {
      setLocalStart(rangeStart);
      setLocalEnd(rangeEnd);
    }, [rangeStart, rangeEnd]);

    const localStartRef = useRef(localStart);
    const localEndRef = useRef(localEnd);

    useEffect(() => {
      localStartRef.current = localStart;
      localEndRef.current = localEnd;
    }, [localStart, localEnd]);

    const getClientX = (e) => {
      return e.touches ? e.touches[0].clientX : e.clientX;
    };

    const handleStartDrag = (type, e) => {
      if (e.touches) {
        e.preventDefault();
      }
      setIsDragging(type);
    };

    const handleDrag = useCallback((e) => {
      if (!isDragging || !navigatorRef.current) return;

      if (e.touches) {
        e.preventDefault();
      }

      const rect = navigatorRef.current.getBoundingClientRect();
      const x = getClientX(e) - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));

      const currentStart = localStartRef.current;
      const currentEnd = localEndRef.current;

      if (isDragging === 'start') {
        const newStart = Math.min(percentage, currentEnd - 5);
        setLocalStart(newStart);
        localStartRef.current = newStart;
      } else if (isDragging === 'end') {
        const newEnd = Math.max(percentage, currentStart + 5);
        setLocalEnd(newEnd);
        localEndRef.current = newEnd;
      } else if (isDragging === 'middle') {
        const width = currentEnd - currentStart;
        let newStart = percentage - width / 2;

        if (newStart < 0) newStart = 0;
        if (newStart + width > 100) newStart = 100 - width;

        const newEnd = newStart + width;

        setLocalStart(newStart);
        setLocalEnd(newEnd);
        localStartRef.current = newStart;
        localEndRef.current = newEnd;
      }
    }, [isDragging, timeRange]);

    const handleDragEnd = useCallback(() => {
      setIsDragging(null);
      const finalStart = localStartRef.current;
      const finalEnd = localEndRef.current;
      setRangeStart(finalStart);
      setRangeEnd(finalEnd);

      if (timeRange === "CR") {
        setCrZoomState({ start: finalStart, end: finalEnd });
      }

    }, [setIsDragging, setRangeStart, setRangeEnd, timeRange]);

    React.useEffect(() => {
      if (isDragging) {
        window.addEventListener('mousemove', handleDrag);
        window.addEventListener('mouseup', handleDragEnd);

        window.addEventListener('touchmove', handleDrag, { passive: false });
        window.addEventListener('touchend', handleDragEnd);

        return () => {
          window.removeEventListener('mousemove', handleDrag);
          window.removeEventListener('mouseup', handleDragEnd);

          window.removeEventListener('touchmove', handleDrag);
          window.removeEventListener('touchend', handleDragEnd);
        };
      }
    }, [isDragging, handleDrag, handleDragEnd]);

    const rangePercentage = Math.round(localEnd - localStart);
    const startIndex = Math.floor((localStart / 100) * chartData.length);
    const endIndex = Math.ceil((localEnd / 100) * chartData.length);
    const startDate = chartData[startIndex]?.fullDate || '';
    const endDate = chartData[endIndex - 1]?.fullDate || '';

    const HANDLE_WIDTH_PX = 32;
    const HANDLE_BAR_WIDTH_PX = 8;

    return (
      <div style={{ marginTop: '20px', padding: '0 10px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '8px',
          fontSize: '12px',
          color: '#6b7280',
          fontWeight: '500'
        }}>
          <span>{startDate}</span>
          <span style={{ color: '#4ADE80', fontWeight: '600' }}>
            {rangePercentage}% of data
          </span>
          <span>{endDate}</span>
        </div>

        <div
          ref={navigatorRef}
          style={{
            position: 'relative',
            height: '60px',
            background: 'linear-gradient(135deg, #f0f0f0 0%, #ffffff 100%)',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            cursor: isDragging ? 'grabbing' : 'default',
            overflow: 'hidden',
            willChange: isDragging ? 'transform' : 'auto',
            userSelect: 'none',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
            <defs>
              <linearGradient id="miniChartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(74, 222, 128, 0.3)" />
                <stop offset="100%" stopColor="rgba(74, 222, 128, 0.05)" />
              </linearGradient>
            </defs>
            {(() => {
              if (chartData.length < 2 || !navigatorRef.current) return null;
              const width = navigatorRef.current?.offsetWidth || 600;
              const height = 60;
              const padding = 8;

              const values = chartData.map(d => d.value);
              const min = Math.min(...values);
              const max = Math.max(...values);
              const range = max - min || 1;

              let areaPath = '';
              chartData.forEach((point, i) => {
                const x = (i / (chartData.length - 1)) * width;
                const y = height - padding - ((point.value - min) / range) * (height - 2 * padding);
                if (i === 0) {
                  areaPath = `M 0 ${height} L ${x} ${y}`;
                } else {
                  areaPath += ` L ${x} ${y}`;
                }
              });
              areaPath += ` L ${width} ${height} Z`;

              let linePath = '';
              chartData.forEach((point, i) => {
                const x = (i / (chartData.length - 1)) * width;
                const y = height - padding - ((point.value - min) / range) * (height - 2 * padding);
                linePath += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
              });

              return (
                <>
                  <path d={areaPath} fill="url(#miniChartGradient)" />
                  <path d={linePath} fill="none" stroke="#4ADE80" strokeWidth="2" />
                </>
              );
            })()}
          </svg>

          {/* Dimmed left side */}
          <div
            style={{
              position: 'absolute',
              left: `0`,
              width: `${localStart}%`,
              height: '100%',
              background: 'rgba(255, 255, 255, 0.7)',
              backdropFilter: 'blur(1px)',
              borderRight: '1px solid #d1d5db',
              pointerEvents: 'none'
            }}
          />

          {/* Dimmed right side */}
          <div
            style={{
              position: 'absolute',
              right: 0,
              width: `${100 - localEnd}%`,
              height: '100%',
              background: 'rgba(255, 255, 255, 0.7)',
              backdropFilter: 'blur(1px)',
              borderLeft: '1px solid #d1d5db',
              pointerEvents: 'none'
            }}
          />

          {/* Selected range overlay */}
          <div
            style={{
              position: 'absolute',
              left: `${localStart}%`,
              width: `${localEnd - localStart}%`,
              height: '100%',
              cursor: 'grab',
              pointerEvents: 'auto'
            }}
            onMouseDown={(e) => handleStartDrag('middle', e)}
            onTouchStart={(e) => handleStartDrag('middle', e)}
          >
            {/* Left handle */}
            <div
              tabIndex={-1}
              style={{
                position: 'absolute',
                left: `-${HANDLE_WIDTH_PX / 2}px`,
                top: '0',
                width: `${HANDLE_WIDTH_PX}px`,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'ew-resize',
                zIndex: 10,
                outline: 'none',
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                handleStartDrag('start', e);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                handleStartDrag('start', e);
              }}
            >
              <div style={{
                width: `${HANDLE_BAR_WIDTH_PX}px`,
                height: '40px',
                background: '#4ADE80',
                borderRadius: '2px',
                boxShadow: '0 2px 8px rgba(74, 222, 128, 0.4), 0 0 0 2px white'
              }} />
            </div>

            {/* Right handle */}
            <div
              tabIndex={-1}
              style={{
                position: 'absolute',
                right: `-${HANDLE_WIDTH_PX / 2}px`,
                top: '0',
                width: `${HANDLE_WIDTH_PX}px`,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'ew-resize',
                zIndex: 10,
                outline: 'none',
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                handleStartDrag('end', e);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                handleStartDrag('end', e);
              }}
            >
              <div style={{
                width: `${HANDLE_BAR_WIDTH_PX}px`,
                height: '40px',
                background: '#4ADE80',
                borderRadius: '2px',
                boxShadow: '0 2px 8px rgba(74, 222, 128, 0.4), 0 0 0 2px white'
              }} />
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: '8px'
        }}>
          <button
            onClick={() => {
              setLocalStart(0);
              setLocalEnd(100);
              setRangeStart(0);
              setRangeEnd(100);
              if (timeRange === "CR") {
                setCrZoomState({ start: 0, end: 100 });
              }
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#4ADE80',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              padding: '4px 8px',
              borderRadius: '4px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(74, 222, 128, 0.1)'}
            onMouseLeave={(e) => e.target.style.background = 'none'}
          >
            Reset Zoom
          </button>
        </div>
      </div>
    );
  };

  const shouldRenderChart = timeRange !== "CR" || (appliedStartDate && appliedEndDate);

  return (
    <div
      className="chart-container"
      tabIndex="-1"
      style={{
        background: 'white',
        borderRadius: '12px',
        padding: '16px ',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        position: 'relative',
        outline: 'none',
        userSelect: 'none',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '16px 0'
      }}>
        <h3 style={{
          fontSize: '24px',
          fontWeight: '600',
          margin: 0,
          color: '#1f2937'
        }}>
          {mode === 'stock' ? `${symbol} Price History` : (getFundConfig(fundType)?.type === 'etf' ? 'Price History' : 'NAV History')}: {mode === 'stock' ? '' : (fundMetadata?.display_name || 'Loading Fund...')}
          {timeRange === "CR" && appliedStartDate && appliedEndDate && (
            <span style={{ fontSize: '14px', fontWeight: '400', color: '#6b7280', marginLeft: '8px' }}>
              ({appliedStartDate} to {appliedEndDate})
            </span>
          )}
        </h3>
        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          background: '#f3f4f6',
          borderRadius: '12px',
          padding: '6px'
        }}>
          {TIME_RANGES.map((range) => (
            <button
              key={range}
              ref={range === "CR" ? crButtonRef : null}
              onClick={(e) => {
                e.stopPropagation();

                if (timeRange === "CR" && range !== "CR") {
                  setCrZoomState({ start: rangeStart, end: rangeEnd });
                }

if (range === "CR") {
  const isSwitchingFromStandardRange = timeRange !== "CR" && chartData.length > 0;

  if (isSwitchingFromStandardRange) {
    setPreviousTimeRange(timeRange);

    // ✅ FIX: When switching from TD to CR, keep showing TD data
    if (timeRange === "TD") {
      // Keep the current chartData (TD data)
      // Set dates to today for custom range display
      const today = new Date().toISOString().split('T')[0];
      setCustomStartDate(today);
      setCustomEndDate(today);
      setAppliedStartDate(today);
      setAppliedEndDate(today);
      
      // Set timeRange to CR but DON'T reload data - keep showing TD graph
      setTimeRange("CR");
      setIsCustomRangeOpen(prev => !prev);
      return; // Exit early to prevent data reload
    } else {
      // For other ranges (1W, 1M, etc.), use existing logic
      let firstDate, lastDate;

      if (chartData.length > 0) {
        firstDate = chartData[0].originalDate.split('T')[0];
        lastDate = chartData[chartData.length - 1].originalDate.split('T')[0];
      } else {
        firstDate = availableDates.min;
        lastDate = availableDates.max;
      }

      setCustomStartDate(firstDate);
      setCustomEndDate(lastDate);
      setAppliedStartDate(firstDate);
      setAppliedEndDate(lastDate);
      setRangeStart(0);
      setRangeEnd(100);
      setCrZoomState({ start: 0, end: 100 });
    }
  } else if (timeRange === "CR") {
    // Already in CR mode, just toggle dropdown
    if (customStartDate && customEndDate) {
      setAppliedStartDate(customStartDate);
      setAppliedEndDate(customEndDate);
      setRangeStart(crZoomState.start);
      setRangeEnd(crZoomState.end);
    } else {
      setRangeStart(0);
      setRangeEnd(100);
    }
  }
  setTimeRange(range);
  setIsCustomRangeOpen(prev => !prev);
} else {
  setTimeRange(range);
  setAppliedStartDate("");
  setAppliedEndDate("");
  setRangeStart(0);
  setRangeEnd(100);
  setIsCustomRangeOpen(false);
}
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              style={{
                padding: '6px 16px',
                borderRadius: '8px',
                border: 'none',
                background: timeRange === range ? 'white' : 'transparent',
                color: timeRange === range ? '#1f2937' : '#618196',
                fontSize: '13px',
                fontWeight: timeRange === range ? '600' : '500',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: timeRange === range ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                minWidth: '30px'
              }}
            >
              {range === "CR" ? (
                <>
                  <Calendar size={14} />
                  <ChevronDown size={14} />
                </>
              ) : (
                range
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Range Compact Dropdown */}
      {isCustomRangeOpen && crButtonRef.current && (
        <div
          style={{
            position: 'absolute',
            top: `${crButtonRef.current.offsetTop + crButtonRef.current.offsetHeight + 8}px`,
            right: '16px',
            background: 'white',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            zIndex: 9999,
            minWidth: '320px',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            borderBottom: '1px solid #f3f4f6',
            paddingBottom: '8px'
          }}>
            <h4 style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#1F2937',
              margin: 0
            }}>
              Custom Date Range
            </h4>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsCustomRangeOpen(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: '18px',
                padding: '0',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ×
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Start Date */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: '#6B7280', fontWeight: '500' }}>
                START DATE:
              </label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                min={availableDates.min}
                max={availableDates.max}
                style={{
                  padding: '8px 10px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '13px',
                  outline: 'none',
                  width: '100%',
                }}
              />
            </div>

            {/* End Date */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: '#6B7280', fontWeight: '500' }}>
                END DATE:
              </label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                min={customStartDate || availableDates.min}
                max={availableDates.max}
                style={{
                  padding: '8px 10px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontSize: '13px',
                  outline: 'none',
                  width: '100%',
                }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCustomRangeOpen(false);
                }}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: '#F3F4F6',
                  color: '#4B5563',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                CANCEL
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleApplyCustomRange();
                }}
                disabled={(() => {
                  if (!customStartDate || !customEndDate) return true;
                  return new Date(customStartDate) > new Date(customEndDate);
                })()}
                style={(() => {
                  const isValid = customStartDate && customEndDate && new Date(customStartDate) <= new Date(customEndDate);
                  return {
                    flex: 1,
                    padding: '8px',
                    background: isValid ? '#4ADE80' : '#E5E7EB',
                    color: isValid ? 'white' : '#9CA3AF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: isValid ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s',
                  };
                })()}
              >
                APPLY
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: '20px' }}>
        {loading ? (
          <div style={{
            height: '450px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#667eea',
            fontSize: '16px',
            fontWeight: '600'
          }}>
            <div className="animate-spin" style={{
              border: '4px solid rgba(102, 126, 234, 0.1)',
              borderTopColor: '#667eea',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              marginRight: '12px'
            }}></div>
            Loading Chart Data...
          </div>
        ) : error ? (
          <div style={{
            height: '450px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#dc2626'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>❌</div>
            <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>Failed to load data</div>
            <div style={{ fontSize: '14px', marginBottom: '16px', color: '#6b7280' }}>{error}</div>
            <button
              onClick={loadChartData}
              style={{
                padding: '10px 24px',
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(220,38,38,0.2)'
              }}
            >
              🔄 Retry
            </button>
          </div>
        ) : !shouldRenderChart ? (
          <div style={{
            height: '450px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6b7280',
            fontSize: '16px'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📅</div>
              <div>Please select a **Start Date** and **End Date** to view the Custom Range chart.</div>
            </div>
          </div>
        ) : displayChartData.length === 0 ? (
          <div style={{
            height: '450px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6b7280',
            fontSize: '16px'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📭</div>
              <div>No data available for this time range</div>
              {timeRange === "CR" && (
                <div style={{ fontSize: '14px', marginTop: '8px', color: '#9ca3af' }}>
                  Please click the CR button and select a valid date range to apply
                </div>
              )}
              {timeRange === "TD" && (
                <div style={{ fontSize: '14px', marginTop: '8px', color: '#9ca3af' }}>
                  {getFundConfig(fundType)?.type === 'etf'
                    ? "ETF price calculations will appear here throughout the day"
                    : "NAV calculations will appear here throughout the day"}
                </div>
              )}
            </div>
          </div>
        ) : (
          <ResponsiveContainer
            width="100%"
            height={450}
            tabIndex={-1}
            wrapperStyle={{ outline: 'none' }}
          >
            <ComposedChart
              data={zonedData}
              margin={{ top: 10, right: -10, left: 0, bottom: 10 }}
              syncMethod="index"
            >
              <defs>
                <linearGradient id="colorPositive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(34,197,94,0.5)" />
                  <stop offset="100%" stopColor="rgba(34,197,94,0.15)" />
                </linearGradient>

                <linearGradient id="colorNegative" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="rgba(239,68,68,0.5)" />
                  <stop offset="100%" stopColor="rgba(239,68,68,0.15)" />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />

              <XAxis
                dataKey="timestamp"
                tick={{ fontSize: 12, fill: "#6b7280" }}
                stroke="#e5e7eb"
                tickLine={false}
                dy={15}
                allowDataOverflow={true}
                padding={{ left: 8, right: 15 }}
                ticks={xTicksData}
                tickFormatter={(timestamp) => {
                  const point = zonedData.find(d => d.timestamp === timestamp);
                  return point ? point.date : '';
                }}
              />

              <YAxis
  domain={[yAxisMin, yAxisMax]}
  ticks={generateTicks()}
  tick={{ fontSize: 12, fill: "#6b7280" }}
  stroke="#e5e7eb"
  tickLine={false}
  dx={-5}
  width={75}
  tickFormatter={(value) => {
    // ✅ FIX: Use previousTimeRange when in CR mode to maintain decimal formatting
    const currentRange = timeRange === "CR" ? previousTimeRange : timeRange;
    
    if (currentRange === "TD" || currentRange === "1D") return value.toFixed(2);
    if (["1W", "1M"].includes(currentRange)) return value.toFixed(1);
    if (["6M", "1Y"].includes(currentRange)) return value.toFixed(1);
    // For 3Y, 5Y, All - show as integers
    return value.toFixed(0);
  }}
  padding={{ top: 20, bottom: 20 }}
/>

              {/* ✅ UPDATED: Tooltip with displayChartData (not chartData) */}
              <Tooltip
                content={<CustomTooltip fundType={fundType} mode={mode} chartData={displayChartData} />}
                cursor={{ stroke: '#d1d5db', strokeWidth: 1 }}
                allowEscapeViewBox={{ x: false, y: false }}
                isAnimationActive={false}
              />

              <ReferenceLine y={startValue} stroke="transparent" />

              <Area
                type="linear"
                dataKey="greenFillValue"
                stroke="none"
                fill="url(#colorPositive)"
                fillOpacity={1}
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-in-out"
                baseValue={startValue}
                connectNulls={false}
              />

              <Area
                type="linear"
                dataKey="redFillValue"
                stroke="none"
                fill="url(#colorNegative)"
                fillOpacity={1}
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-in-out"
                baseValue={startValue}
                connectNulls={true}
              />

              <Area
                type="monotoneX"
                dataKey="redFillBottom"
                stroke="none"
                fill="white"
                fillOpacity={1}
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-in-out"
                baseValue="dataMin"
                connectNulls={false}
              />

              <Line
                type="linear"
                dataKey="value"
                stroke="transparent"
                strokeWidth={0}
                dot={false}
                activeDot={<CustomActiveDot />}
                isAnimationActive={false}
                shape={<CustomLine />}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Range Navigator */}
      {chartData.length > 0 && shouldRenderChart && <RangeNavigator />}

      {shouldRenderChart && (
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px', textAlign: 'center' }}>

        </p>
      )}
    </div>
  );
};

export default NavChart;

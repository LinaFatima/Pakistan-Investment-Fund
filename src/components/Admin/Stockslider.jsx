import React, { useState, useEffect, useRef } from 'react';

const StockSlider = ({ selectedIndex = 'KSE100' }) => {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const hasFetchedRef = useRef(false);
  const intervalRef = useRef(null);

  // Page Visibility API - comprehensive tab detection
  useEffect(() => {
    const checkVisibility = () => {
      const visible = !document.hidden && document.hasFocus();
      setIsVisible(visible);
      console.log('👁️ Visibility check:', {
        hidden: document.hidden,
        hasFocus: document.hasFocus(),
        finalState: visible ? 'VISIBLE & FOCUSED' : 'HIDDEN/UNFOCUSED'
      });
      return visible;
    };

    checkVisibility();

    const handleVisibilityChange = () => {
      checkVisibility();
    };

    const handleFocus = () => {
      console.log('🎯 Window FOCUSED');
      checkVisibility();
    };

    const handleBlur = () => {
      console.log('😴 Window BLURRED');
      setIsVisible(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    const fetchStocks = async () => {
      if (!isVisible) {
        console.log('⏸️ Skipping fetch - tab not visible or focused');
        return;
      }

      try {
        if (stocks.length === 0 && !hasFetchedRef.current) {
          setLoading(true);
        }

        console.log('🔍 Fetching stocks for:', selectedIndex);

        const response = await fetch(`/api/stocks/ticker?index=${selectedIndex}`);

        console.log('📡 Response status:', response.status);

        if (response.status === 403 || response.status === 401) {
          console.warn('⚠️ Authentication/Authorization error - keeping existing data');
          setError('Rate limit exceeded. Showing cached data.');
          return;
        }

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        console.log('📊 API Response:', data);
        console.log('📈 Stocks array length:', data.response?.length);

        if (data.success && data.response && Array.isArray(data.response)) {
          console.log('✅ Setting stocks:', data.response.length, 'items');

          if (data.response.length === 0 && selectedIndex === 'KMAILLSHR') {
            console.log('⚠️ Empty response for KMAILLSHR, using fallback data');
            const fallbackStocks = [
              { symbol: 'HBL', price: 142.30, changePercentage: 1.89, isShariah: true },
              { symbol: 'MCB', price: 178.60, changePercentage: 0.56, isShariah: true },
              { symbol: 'UBL', price: 156.90, changePercentage: -2.10, isShariah: true },
            ];
            setStocks(fallbackStocks);
          } else {
            setStocks(data.response);
          }

          setError(null);
          hasFetchedRef.current = true;
        } else {
          throw new Error('Invalid data format received');
        }
      } catch (err) {
        console.error('❌ API Error:', err);

        if (stocks.length === 0) {
          setError(err.message);
        } else {
          console.log('⚠️ Error occurred but keeping existing data');
        }
      } finally {
        setLoading(false);
      }
    };

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (isVisible) {
      fetchStocks();

      intervalRef.current = setInterval(() => {
        if (!document.hidden && document.hasFocus()) {
          console.log('⏰ Interval fetch triggered');
          fetchStocks();
        } else {
          console.log('⏸️ Interval skipped - tab not active');
        }
      }, 60000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      hasFetchedRef.current = false;
    };
  }, [selectedIndex, isVisible]);

  console.log('🎯 Current state - isVisible:', isVisible, 'stocks:', stocks.length, 'loading:', loading);

  if (loading && stocks.length === 0) {
    return (
      <div className="stock-slider-container flex-1">
        <div className="text-gray-500 text-sm animate-pulse">Loading stocks...</div>
      </div>
    );
  }

  if (error && stocks.length === 0) {
    return (
      <div className="stock-slider-container flex-1">
        <div className="text-red-500 text-sm">
          Failed to load stocks. Please check your connection.
        </div>
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <div className="stock-slider-container flex-1">
        <div className="text-gray-500 text-sm">No stocks available</div>
      </div>
    );
  }

  const displayStocks = [...stocks, ...stocks, ...stocks];

  const stockWidth = 212;
  const pixelsPerSecond = 350;
  const totalWidth = displayStocks.length * stockWidth;
  const animationDuration = totalWidth / pixelsPerSecond;

  return (
    <div className="stock-slider-container flex-1 overflow-hidden py-4">
      <div className="slider-track flex gap-3">
        {displayStocks.map((stock, index) => (
          <div
            key={`${stock.symbol}-${index}`}
            className="relative flex items-center justify-between gap-2 rounded border-b-2 bg-white px-3 py-2 text-sm transition-all duration-300 ease-out hover:scale-105 hover:shadow-2xl hover:z-10 hover:-translate-y-1 min-w-[200px] cursor-pointer"
            style={{
              borderBottomColor: stock.changePercentage >= 0 ? '#10b981' : '#ef4444',
            }}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            <h3 className="stock-slider-symbol text-gray-900 flex items-center gap-1 font-bold uppercase">
              {stock.symbol}
              {stock.isShariah && (
                <span title="Shariah Compliant">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" fill="none" width="18" height="18">
                    <path d="M16.7984 10.6944H8.854C8.77297 10.6944 8.69525 10.7266 8.63794 10.7839C8.58064 10.8412 8.54845 10.9189 8.54845 10.9999V12.656H6.86789V4.88881C6.86789 4.80777 6.8357 4.73005 6.7784 4.67275C6.72109 4.61544 6.64338 4.58325 6.56234 4.58325H5.03456C4.95352 4.58325 4.8758 4.61544 4.8185 4.67275C4.7612 4.73005 4.729 4.80777 4.729 4.88881V17.111C4.729 17.1921 4.7612 17.2698 4.8185 17.3271C4.8758 17.3844 4.95352 17.4166 5.03456 17.4166H16.7984C16.8795 17.4166 16.9572 17.3844 17.0145 17.3271C17.0718 17.2698 17.104 17.1921 17.104 17.111V10.9999C17.104 10.9189 17.0718 10.8412 17.0145 10.7839C16.9572 10.7266 16.8795 10.6944 16.7984 10.6944Z" fill="#a1a1a1" />
                    <path d="M12.824 6.72466C13.1615 6.72466 13.4351 6.45106 13.4351 6.11355C13.4351 5.77605 13.1615 5.50244 12.824 5.50244C12.4865 5.50244 12.2129 5.77605 12.2129 6.11355C12.2129 6.45106 12.4865 6.72466 12.824 6.72466Z" fill="#F4AA41" />
                    <path d="M12.8262 12.5267L11.7576 14.129C11.6573 14.2796 11.6039 14.4565 11.6039 14.6374V17.11H14.0484V14.6374C14.0484 14.4565 13.9948 14.2796 13.8944 14.129L12.8262 12.5267ZM6.69457 8.6131H4.88935C4.82536 8.61311 4.76298 8.59304 4.71101 8.55571C4.65904 8.51837 4.6201 8.46566 4.59968 8.40502L3.99621 6.60927C3.98087 6.56332 3.97666 6.51439 3.98393 6.4665C3.9912 6.41861 4.00974 6.37313 4.03803 6.33381C4.06631 6.29448 4.10353 6.26244 4.14662 6.24032C4.18971 6.21819 4.23744 6.20661 4.28588 6.20654H7.31057C7.3592 6.20655 7.40712 6.21815 7.45036 6.2404C7.4936 6.26265 7.5309 6.2949 7.55917 6.33446C7.58744 6.37403 7.60586 6.41977 7.61289 6.46788C7.61993 6.516 7.61538 6.5651 7.59963 6.6111L6.98363 8.40685C6.96294 8.46706 6.92396 8.5193 6.87214 8.55627C6.82031 8.59325 6.75823 8.61312 6.69457 8.6131ZM6.69457 12.956H4.88935C4.82536 12.956 4.76298 12.9359 4.71101 12.8986C4.65904 12.8612 4.6201 12.8085 4.59968 12.7479L3.99621 10.9521C3.98087 10.9062 3.97666 10.8572 3.98393 10.8094C3.9912 10.7615 4.00974 10.716 4.03803 10.6767C4.06631 10.6373 4.10353 10.6053 4.14662 10.5832C4.18971 10.5611 4.23744 10.5495 4.28588 10.5494H7.31057C7.3592 10.5494 7.40712 10.561 7.45036 10.5833C7.4936 10.6055 7.5309 10.6378 7.55917 10.6773C7.58744 10.7169 7.60586 10.7626 7.61289 10.8107C7.61993 10.8589 7.61538 10.908 7.59963 10.954L6.98393 12.7497C6.96323 12.81 6.9242 12.8622 6.87232 12.8992C6.82043 12.9362 6.75829 12.956 6.69457 12.956Z" fill="#9B9B9A" />
                    <path d="M16.328 11.3047H9.32463C9.26986 11.3046 9.21611 11.2899 9.16898 11.262C9.12185 11.2341 9.08306 11.1941 9.05666 11.1461C8.82527 10.7267 8.70306 10.2559 8.7013 9.77689C8.7013 7.9237 10.5514 6.41578 12.8263 6.41578C15.1012 6.41578 16.9513 7.9237 16.9513 9.77689C16.9495 10.2559 16.8273 10.7267 16.5959 11.1461C16.5696 11.1941 16.5308 11.2341 16.4836 11.262C16.4365 11.2899 16.3827 11.3047 16.328 11.3047ZM6.56241 5.19356C6.43163 5.19356 5.10644 5.22961 4.9448 5.18011C4.90643 5.16832 4.87077 5.14909 4.83984 5.12351C4.80891 5.09793 4.78332 5.06651 4.76453 5.03105C4.74575 4.99558 4.73414 4.95675 4.73036 4.9168C4.72658 4.87684 4.73071 4.83653 4.74252 4.79817L5.50641 2.31186C5.52559 2.24936 5.56432 2.19465 5.6169 2.15579C5.66948 2.11692 5.73314 2.09595 5.79852 2.09595C5.8639 2.09595 5.92756 2.11692 5.98014 2.15579C6.03272 2.19465 6.07145 2.24936 6.09063 2.31186L6.85452 4.79817C6.86632 4.83653 6.87046 4.87684 6.86668 4.9168C6.8629 4.95675 6.85129 4.99558 6.8325 5.03105C6.81372 5.06651 6.78813 5.09793 6.7572 5.12351C6.72627 5.14909 6.69061 5.16832 6.65224 5.18011C6.62312 5.18899 6.59285 5.19352 6.56241 5.19356Z" fill="#F4AA41" />
                  </svg>
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">{stock.price?.toFixed(2) || 'N/A'}</span>
              <span className={`inline-flex items-center gap-0.5 ${stock.changePercentage >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  {stock.changePercentage >= 0 ? (
                    <>
                      <path d="m5 12 7-7 7 7" />
                      <path d="M12 19V5" />
                    </>
                  ) : (
                    <>
                      <path d="M12 5v14" />
                      <path d="m19 12-7 7-7-7" />
                    </>
                  )}
                </svg>
                {Math.abs(stock.changePercentage || 0).toFixed(2)}%
              </span>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .flex-1.overflow-hidden {
          padding-left: 48px !important;
          padding-right: 48px !important;
        }
        
        .slider-track {
          animation: scroll ${animationDuration}s linear infinite;
          animation-play-state: ${isVisible && !isPaused ? 'running' : 'paused'};
          width: fit-content;
        }
        
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-33.333%);
          }
        }
      `}</style>
    </div>
  );
};

export default StockSlider;
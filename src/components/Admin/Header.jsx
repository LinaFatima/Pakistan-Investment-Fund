import React, { useState, useEffect, useRef } from 'react';
import StockSlider from './Stockslider.jsx';

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState('KSE100');
  const [indexData, setIndexData] = useState({ value: 0, change: 0 });
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef(null);

  const indices = [
    'KSE100', 'KSE30', 'KMI30', 'ALLSHR', 'KMAILLSHR', 
    'BKTI', 'OGTI', 'UPP9', 'NBPPGI', 'MZNPI', 
    'NITPGI', 'PSXDIV20', 'HBLTTI', 'JSMFI', 'JSGBKTI', 
    'MII30', 'ACI', 'KSE100PR'
  ];

  // Fetch index data when selection changes
  useEffect(() => {
    const fetchIndexData = async () => {
      try {
        console.log(`Fetching index data for: ${selectedIndex}`);
        
        const response = await fetch(`/api/index/summary?index=${selectedIndex}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Index API Response:', data);
        
        if (data.success && data.data) {
          setIndexData({ 
            value: data.data.currentValue || 0, 
            change: data.data.changePercentage || 0 
          });
        } else {
          console.error('Invalid index data format:', data);
        }
      } catch (error) {
        console.error('Failed to fetch index data:', error);
      } finally {
        setLoading(false);
      }
    };

    setLoading(true);
    fetchIndexData();
    
    const interval = setInterval(fetchIndexData, 30000);
    return () => clearInterval(interval);
  }, [selectedIndex]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleSelect = (index) => {
    setSelectedIndex(index);
    setIsOpen(false);
  };

  const isPositive = indexData.change >= 0;

  return (
    <div className="rounded-none border-r-4 bg-white px-4 py-2 text-sm border-green-600">
      <div className="flex items-center">
        <div className="flex items-center gap-2 relative" ref={dropdownRef}>
          <button 
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-label="Select stock index"
            className="flex items-center justify-center h-10 px-4 py-2 text-sm font-semibold uppercase rounded-md transition-colors bg-inherit hover:bg-blue-50 text-gray-700 cursor-pointer"
          >
            {selectedIndex}
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="#202831" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className={`ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {isOpen && (
            <div 
              role="listbox"
              aria-label="Stock indices"
              className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto min-w-[140px]"
            >
              {indices.map((index) => (
                <button
                  key={index}
                  role="option"
                  aria-selected={selectedIndex === index}
                  onClick={() => handleSelect(index)}
                  className={`block w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors cursor-pointer ${
                    selectedIndex === index ? 'bg-blue-100 font-semibold' : ''
                  }`}
                >
                  {index}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <span className="text-gray-400 animate-pulse">Loading...</span>
          ) : (
            <>
              {/* <span className="text-gray-500 font-medium">
                {indexData.value.toFixed(2)}
              </span>
              <span 
                className={`inline-flex items-center gap-0.5 font-medium ${
                  isPositive ? 'text-green-500' : 'text-red-600'
                }`}
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="16" 
                  height="16" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className="w-4 h-4"
                  aria-hidden="true"
                >
                  {isPositive ? (
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
                {Math.abs(indexData.change).toFixed(2)}%
              </span> */}
            </>
          )}
        </div>
        
        <StockSlider selectedIndex={selectedIndex} />
      </div>
    </div>
  );
};

export default Header;
// utils/dateUtils.js

/**
 * Convert any date to Pakistan time
 */
export function toPakistanTime(dateString) {
  if (!dateString) return new Date();
  
  const date = new Date(dateString);
  
  // Convert to Pakistan time by adding 5 hours (UTC+5)
  const pakistanTime = new Date(date.getTime() + (5 * 60 * 60 * 1000));
  
  return pakistanTime;
}

/**
 * Format date in Pakistan time with nice formatting
 */
export function formatPakistanTime(dateString) {
  const date = toPakistanTime(dateString);
  return date.toLocaleString("en-PK", { 
    timeZone: "Asia/Karachi",
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

/**
 * Format time only (for updated_at fields)
 */
export function formatPakistanTimeOnly(dateString) {
  const date = toPakistanTime(dateString);
  return date.toLocaleTimeString("en-PK", { 
    timeZone: "Asia/Karachi",
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

/**
 * Auto-format any date field from Supabase
 */
export function autoFormatDate(dateString, type = 'full') {
  if (!dateString) return 'N/A';
  
  try {
    const date = toPakistanTime(dateString);
    
    switch(type) {
      case 'time':
        return date.toLocaleTimeString("en-PK", { 
          timeZone: "Asia/Karachi",
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
      case 'date':
        return date.toLocaleDateString("en-PK", { 
          timeZone: "Asia/Karachi",
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
      default: // full
        return date.toLocaleString("en-PK", { 
          timeZone: "Asia/Karachi",
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
    }
  } catch (error) {
    console.error('Date formatting error:', error);
    return 'Invalid Date';
  }
}

/**
 * Simple debug function to check what's happening
 */
export function debugDateConversion(dateString) {
  const original = new Date(dateString);
  const pakistan = toPakistanTime(dateString);
  
  console.log('Original:', original);
  console.log('Pakistan:', pakistan);
  console.log('Original UTC:', original.toISOString());
  console.log('Pakistan Time:', formatPakistanTime(dateString));
  
  return {
    original: original.toString(),
    pakistan: pakistan.toString(),
    formatted: formatPakistanTime(dateString)
  };
}
import React, { useState, useEffect } from 'react';

const MainScreen = () => {
  // Temporary click effect ke liye state (localStorage se independent)
  const [clickedCard, setClickedCard] = useState(null);

  useEffect(() => {
    document.title = "Pakistan Investment Fund - Select Fund";
  }, []);

  // Cards ka data - paanch cards ke liye alag data
  const cardsData = [
    {
      id: 1,
      title: 'Al Meezan Mutual Fund',
      description: 'Shariah Compliant Equity',
      fundType: 'al_meezan',
      icon: (
        <div style={{
          display: 'flex',
          height: '5rem',
          width: '5rem',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          backgroundColor: '#e5e7eb',
          textTransform: 'uppercase',
          fontSize: '2rem',
          fontWeight: 'bold',
          color: '#6b7280',
          margin: '0 auto'
        }}>
          AM
        </div>
      )
    },
    {
      id: 2,
      title: 'Meezan Energy Fund',
      description: 'Shariah Compliant Equity',
      fundType: 'energy',
      icon: (
        <div style={{
          display: 'flex',
          height: '5rem',
          width: '5rem',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          backgroundColor: '#d1fae5',
          textTransform: 'uppercase',
          fontSize: '2rem',
          fontWeight: 'bold',
          color: '#059669',
          margin: '0 auto'
        }}>
          ME
        </div>
      )
    },
    {
      id: 3,
      title: 'Meezan Islamic Fund',
      description: 'Shariah Compliant Equity',
      fundType: 'islamic',
      icon: (
        <div style={{
          display: 'flex',
          height: '5rem',
          width: '5rem',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          backgroundColor: '#dbeafe',
          textTransform: 'uppercase',
          fontSize: '2rem',
          fontWeight: 'bold',
          color: '#2563eb',
          margin: '0 auto'
        }}>
          MI
        </div>
      )
    },
    {
      id: 4,
      title: 'Meezan Pakistan',
      description: '',
      fundType: 'pakistan',
      icon: (
        <div style={{
          display: 'flex',
          height: '5rem',
          width: '5rem',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          backgroundColor: '#fef3c7',
          textTransform: 'uppercase',
          fontSize: '2rem',
          fontWeight: 'bold',
          color: '#d97706',
          margin: '0 auto'
        }}>
          MP
        </div>
      )
    },
    {
      id: 5,
      title: 'KSE Meezan Index Fund',
      description: 'Shariah Compliant Index Tracker',
      fundType: 'kse_meezan_index',
      icon: (
        <div style={{
          display: 'flex',
          height: '5rem',
          width: '5rem',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          backgroundColor: '#fce7f3',
          textTransform: 'uppercase',
          fontSize: '2rem',
          fontWeight: 'bold',
          color: '#be185d',
          margin: '0 auto'
        }}>
          KM
        </div>
      )
    }
  ];


  // Card click handler
  const handleCardClick = (card) => {
    // Temporary visual effect (will reset on page reload)
    setClickedCard(card.id);

    // Store in localStorage for next page (backup)
    localStorage.setItem('selected_fund_type', card.fundType);

    console.log('Selected fund type:', card.fundType);

    // Small delay for visual feedback, then navigate WITH FUND PARAMETER
    setTimeout(() => {
      if (card.id === 1) {
        window.location.href = '/calculator?fund=al_meezan';
      } else if (card.id === 2) {
        window.location.href = '/calculator?fund=energy';
      } else if (card.id === 3) {
        window.location.href = '/calculator?fund=islamic';
      } else if (card.id === 4) {
        window.location.href = '/calculator?fund=pakistan';
      } else if (card.id === 5) {
        window.location.href = '/calculator?fund=kse_meezan_index';
      }
    }, 300);
  };

  const containerStyle = {
    minHeight: '100vh',
    background: 'linear-gradient(to bottom right, #faf5ff, #dbeafe)',
    padding: '2rem 1rem'
  };

  const contentStyle = {
    maxWidth: '1200px',
    margin: '0 auto'
  };

  const headingStyle = {
    fontSize: 'clamp(1.75rem, 5vw, 2.5rem)',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '1rem',
    color: '#1f2937'
  };

  const subtitleStyle = {
    textAlign: 'center',
    color: '#6b7280',
    marginBottom: '3rem',
    fontSize: 'clamp(0.875rem, 2vw, 1rem)'
  };

  const cardsContainerStyle = {
    display: 'flex',
    gap: '2rem',
    marginBottom: '3rem',
    justifyContent: 'center',
    alignItems: 'stretch',
    flexWrap: 'wrap'
  };

  const cardStyle = (cardId) => ({
    backgroundColor: 'white',
    padding: '2.5rem 2rem',
    borderRadius: '16px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    border: '2px solid #e5e7eb',
    outline: clickedCard === cardId ? '3px solid #1F2433' : 'none',
    outlineOffset: '-3px',
    width: '100%',
    maxWidth: '380px',
    minHeight: '300px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden'
  });

  const cardTitleStyle = {
    fontSize: 'clamp(1.25rem, 3vw, 1.5rem)',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '0.75rem',
    marginTop: '1rem',
    textAlign: 'center'
  };

  const cardDescStyle = {
    color: '#6b7280',
    textAlign: 'center',
    fontSize: 'clamp(0.875rem, 2vw, 1rem)'
  };

  // Selected indicator line
  const selectedLineStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '4px',
    background: 'linear-gradient(90deg, #1F2433 0%, #2D3447 100%)',
    animation: 'slideIn 0.3s ease-out'
  };

  return (
    <div style={containerStyle}>
      <style>{`
        @keyframes slideIn {
          from {
            transform: scaleX(0);
          }
          to {
            transform: scaleX(1);
          }
        }
        
        @media (max-width: 768px) {
          .card-container {
            padding: 1.5rem 1rem !important;
            min-height: 280px !important;
          }
        }
      `}</style>

      <div style={contentStyle}>
        <h1 style={headingStyle}>
          Select Your Fund
        </h1>
        <p style={subtitleStyle}>
          Choose a fund to view details
        </p>


        {/* Cards */}
        {/* Cards */}
        <div style={cardsContainerStyle}>
          {cardsData.map((card) => (
            <a
              key={card.id}
              href={`/calculator?fund=${card.fundType}`}
              className="card-container"
              style={{
                backgroundColor: 'white',
                padding: '2.5rem 2rem',
                borderRadius: '16px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                border: '2px solid #e5e7eb',
                outline: clickedCard === card.id ? '3px solid #1F2433' : 'none',
                outlineOffset: '-3px',
                width: '100%',
                maxWidth: '380px',
                minHeight: '300px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
                textDecoration: 'none', // Important: remove underline
                color: 'inherit' // Inherit text color
              }}
              onClick={(e) => {
                // Only prevent default for left-click
                if (e.button === 0) {
                  e.preventDefault();
                  handleCardClick(card, e);
                }
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.15)';
                e.currentTarget.style.borderColor = '#1F2433';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            >
              {/* Top line indicator when clicked */}
              {clickedCard === card.id && <div style={selectedLineStyle}></div>}

              {card.icon}
              <h3 style={cardTitleStyle}>
                {card.title}
              </h3>
              <p style={cardDescStyle}>
                {card.description}
              </p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MainScreen;
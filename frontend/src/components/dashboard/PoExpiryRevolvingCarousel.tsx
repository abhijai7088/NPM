import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../utils/formatters';

interface ProjectAlert {
  headerId?: number;
  projectCode: string;
  projectName?: string;
  customerName?: string;
  poAmount?: number;
  expiryStatus: 'EXPIRED' | 'EXPIRING_SOON' | string;
  [key: string]: any;
}

interface PoExpiryRevolvingCarouselProps {
  projects: ProjectAlert[];
  title?: string;
  subtitle?: string;
}

export const PoExpiryRevolvingCarousel: React.FC<PoExpiryRevolvingCarouselProps> = ({
  projects,
  title = "PO Expiry Live Alerts",
  subtitle = "Layman summary of projects with expired or near-expiry Purchase Orders"
}) => {
  const navigate = useNavigate();
  const carouselRef = useRef<HTMLDivElement>(null);
  
  const [filter, setFilter] = useState<'ALL' | 'EXPIRED' | 'EXPIRING_SOON'>('ALL');
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const expiredList = projects.filter(p => p.expiryStatus === 'EXPIRED');
  const expiringSoonList = projects.filter(p => p.expiryStatus === 'EXPIRING_SOON');
  
  let filteredProjects = projects.filter(p => p.expiryStatus === 'EXPIRED' || p.expiryStatus === 'EXPIRING_SOON');
  if (filter === 'EXPIRED') {
    filteredProjects = expiredList;
  } else if (filter === 'EXPIRING_SOON') {
    filteredProjects = expiringSoonList;
  }

  const totalAlerts = expiredList.length + expiringSoonList.length;

  // Continuous Auto-Revolve Effect
  useEffect(() => {
    if (isPaused || filteredProjects.length <= 1) return;

    const interval = setInterval(() => {
      if (carouselRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
        const maxScroll = scrollWidth - clientWidth;
        const cardWidth = 320; // Width of single card + gap

        if (scrollLeft >= maxScroll - 10) {
          // Loop back to beginning smoothly
          carouselRef.current.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          carouselRef.current.scrollBy({ left: cardWidth, behavior: 'smooth' });
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isPaused, filteredProjects.length]);

  const handleManualScroll = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const cardWidth = 320;
      const scrollAmount = direction === 'left' ? -cardWidth : cardWidth;
      carouselRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  if (totalAlerts === 0) return null;

  return (
    <div 
      className="card animate-fade-in-up" 
      style={{ 
        borderLeft: '4px solid #dc3545', 
        background: 'linear-gradient(135deg, #ffffff 0%, #fff6f6 100%)', 
        padding: '1rem 1.25rem', 
        marginBottom: '1rem',
        boxShadow: '0 4px 14px rgba(220, 53, 69, 0.08)',
        borderRadius: '12px'
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* ── Carousel Header & Action Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            width: 32, 
            height: 32, 
            borderRadius: '50%', 
            background: '#dc354520', 
            color: '#dc3545', 
            fontWeight: 800,
            fontSize: '1rem',
            boxShadow: '0 0 10px rgba(220, 53, 69, 0.3)'
          }}>
            ⚡
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#003366' }}>
                {title} ({totalAlerts} Projects Require Immediate Attention)
              </h4>
              <span style={{ 
                background: isPaused ? '#6c757d20' : '#28a74520', 
                color: isPaused ? '#6c757d' : '#28a745', 
                fontSize: '0.65rem', 
                fontWeight: 700, 
                padding: '2px 8px', 
                borderRadius: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isPaused ? '#6c757d' : '#28a745' }}></span>
                {isPaused ? 'PAUSED ON HOVER' : 'AUTO REVOLVING'}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#6c757d' }}>
              {subtitle}
            </p>
          </div>
        </div>

        {/* ── Filter Pills & Carousel Controls ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilter('ALL')}
            style={{
              background: filter === 'ALL' ? '#003366' : '#e9ecef',
              color: filter === 'ALL' ? '#ffffff' : '#495057',
              border: 'none',
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            All Alerts ({totalAlerts})
          </button>
          
          <button
            onClick={() => setFilter('EXPIRED')}
            style={{
              background: filter === 'EXPIRED' ? '#dc3545' : '#dc354518',
              color: filter === 'EXPIRED' ? '#ffffff' : '#dc3545',
              border: '1px solid #dc354540',
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            🔴 {expiredList.length} Expired
          </button>

          <button
            onClick={() => setFilter('EXPIRING_SOON')}
            style={{
              background: filter === 'EXPIRING_SOON' ? '#ffc107' : '#ffc10725',
              color: filter === 'EXPIRING_SOON' ? '#000000' : '#b58500',
              border: '1px solid #ffc10760',
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            🟡 {expiringSoonList.length} Expiring Soon
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '0.4rem' }}>
            <button
              onClick={() => handleManualScroll('left')}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: '1px solid #ced4da',
                background: '#ffffff',
                color: '#003366',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
              }}
              title="Scroll left"
            >
              ‹
            </button>
            <button
              onClick={() => handleManualScroll('right')}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: '1px solid #ced4da',
                background: '#ffffff',
                color: '#003366',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
              }}
              title="Scroll right"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* ── Single Horizontal Line Revolving Carousel Track ── */}
      <div 
        ref={carouselRef}
        style={{ 
          display: 'flex', 
          gap: '1rem', 
          overflowX: 'auto', 
          scrollSnapType: 'x mandatory', 
          scrollBehavior: 'smooth',
          paddingBottom: '0.5rem',
          scrollbarWidth: 'thin'
        }}
      >
        {filteredProjects.map((p: any) => {
          const isExpired = p.expiryStatus === 'EXPIRED';
          return (
            <div
              key={p.headerId || p.projectCode}
              onClick={() => navigate(`/projects?id=${p.projectCode}`)}
              style={{
                flex: '0 0 300px',
                scrollSnapAlign: 'start',
                background: '#ffffff',
                border: `1px solid ${isExpired ? '#f5c2c7' : '#ffe69c'}`,
                borderLeft: `5px solid ${isExpired ? '#dc3545' : '#ffc107'}`,
                borderRadius: 10,
                padding: '0.75rem 0.95rem',
                cursor: 'pointer',
                boxShadow: '0 3px 8px rgba(0,0,0,0.04)',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
              className="table-row-hover"
              title="Click to open project registry details"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <code className="proj-code" style={{ fontSize: '0.78rem', fontWeight: 800, background: '#f8f9fa', padding: '2px 6px', borderRadius: 4 }}>
                  {p.projectCode}
                </code>
                <span style={{
                  fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: 12,
                  background: isExpired ? '#dc354518' : '#ffc10730',
                  color: isExpired ? '#dc3545' : '#b58500',
                  border: `1px solid ${isExpired ? '#dc354540' : '#ffc10760'}`
                }}>
                  {isExpired ? 'EXPIRED' : 'EXPIRING SOON'}
                </span>
              </div>

              <div style={{ 
                fontSize: '0.85rem', 
                fontWeight: 700, 
                color: '#003366', 
                whiteSpace: 'nowrap', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis',
                marginBottom: 6
              }}>
                {p.customerName || p.projectName || 'Project ' + p.projectCode}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 6, borderTop: '1px solid #f1f3f5', fontSize: '0.75rem', color: '#6c757d' }}>
                <span>PO: <strong style={{ color: '#006699' }}>{formatCurrency(p.poAmount || 0)}</strong></span>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/projects?id=${p.projectCode}&noticeType=PO_EXPIRY`);
                    }}
                    style={{
                      background: isExpired ? '#dc354515' : '#ffc10720',
                      border: `1px solid ${isExpired ? '#dc354540' : '#ffc10760'}`,
                      color: isExpired ? '#dc3545' : '#b58500',
                      borderRadius: 4,
                      padding: '3px 8px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                    title="Generate official PO Expiry / Extension Notice"
                  >
                    ⚡ Send Notice
                  </button>
                  <span style={{ color: '#006699', fontWeight: 700 }}>Details →</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

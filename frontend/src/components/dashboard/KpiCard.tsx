import React from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  trend?: number;
  icon?: string;
  color?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({ title, value, trend, icon, color = '#3b82f6' }) => {
  return (
    <div style={{ padding: '1.5rem', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', background: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem', fontWeight: 600 }}>{title}</p>
          <h3 style={{ margin: '0.5rem 0 0', fontSize: '1.875rem', color: '#111827' }}>{value}</h3>
          {trend !== undefined && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: trend >= 0 ? '#10b981' : '#ef4444' }}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% from last month
            </p>
          )}
        </div>
        <div style={{ padding: '0.75rem', borderRadius: '50%', backgroundColor: `${color}20`, color }}>
          {icon || '📊'}
        </div>
      </div>
    </div>
  );
};
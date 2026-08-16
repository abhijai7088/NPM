const fs = require('fs');
const path = require('path');

const baseDir = 'c:/knowledge/Confidential/NICSI/npms/frontend/src';

const dirs = [
    'pages/dashboard', 'pages/reports', 'components/dashboard'
];

dirs.forEach(d => {
    fs.mkdirSync(path.join(baseDir, d), { recursive: true });
});

const files = {
  'components/dashboard/KpiCard.tsx': `import React from 'react';

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
        <div style={{ padding: '0.75rem', borderRadius: '50%', backgroundColor: \`\${color}20\`, color }}>
          {icon || '📊'}
        </div>
      </div>
    </div>
  );
};`,

  'pages/dashboard/DashboardPage.tsx': `import React, { useState, useEffect } from 'react';
import { KpiCard } from '../../components/dashboard/KpiCard';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export const DashboardPage = () => {
  const [data, setData] = useState<any>(null);

  // Mock data for Recharts
  const pieData = [
    { name: 'APPROVED', value: 20, color: '#10b981' },
    { name: 'DRAFT', value: 5, color: '#9ca3af' },
    { name: 'IN_PROGRESS', value: 12, color: '#f59e0b' }
  ];

  const lineData = [
    { month: 'Jan', created: 4, approved: 2 },
    { month: 'Feb', created: 3, approved: 3 },
    { month: 'Mar', created: 7, approved: 5 },
    { month: 'Apr', created: 2, approved: 4 }
  ];

  useEffect(() => {
    // Simulate fetch from /api/v1/dashboard/summary
    setTimeout(() => {
      setData({
        totalProjects: 42,
        totalApprovedBudget: '₹50,00,00,000',
        totalSpent: '₹18,00,00,000',
        pendingApprovals: 9
      });
    }, 500);
  }, []);

  if (!data) return <div style={{ padding: '2rem' }}>Loading Dashboard...</div>;

  return (
    <div style={{ padding: '2rem', backgroundColor: '#f3f4f6', minHeight: '100vh' }}>
      <h2 style={{ marginBottom: '2rem' }}>Executive Dashboard</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <KpiCard title="Total Projects" value={data.totalProjects} trend={5} color="#3b82f6" />
        <KpiCard title="Budget Approved" value={data.totalApprovedBudget} trend={12} color="#10b981" />
        <KpiCard title="Total Spent" value={data.totalSpent} trend={-2} color="#ef4444" />
        <KpiCard title="Pending Approvals" value={data.pendingApprovals} color="#f59e0b" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <h3>Project Status Distribution</h3>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {pieData.map((entry, index) => <Cell key={\`cell-\${index}\`} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <h3>Monthly Trend</h3>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="created" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="approved" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};`,

  'pages/reports/ReportsPage.tsx': `import React, { useState } from 'react';

export const ReportsPage = () => {
  const [reportType, setReportType] = useState('PROJECTS');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = (format: string) => {
    setIsExporting(true);
    // Simulate async POST /reports/export
    setTimeout(() => {
      setIsExporting(false);
      alert(\`\${format} Report Generated Successfully! Downloading...\`);
    }, 2000);
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h2>Data Exports & Reports</h2>
      
      <div style={{ display: 'flex', gap: '2rem', marginTop: '2rem' }}>
        <div style={{ flex: 1, background: '#f9fafb', padding: '1.5rem', borderRadius: '8px' }}>
          <h3>Report Configuration</h3>
          <select value={reportType} onChange={e => setReportType(e.target.value)} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem' }}>
            <option value="PROJECTS">Project Portfolio Report</option>
            <option value="FINANCIAL">Financial Summary</option>
            <option value="PO_AGING">Purchase Order Aging</option>
          </select>
          
          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button onClick={() => handleExport('CSV')} disabled={isExporting} style={{ padding: '0.75rem 1.5rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px' }}>
              {isExporting ? 'Processing...' : 'Export to CSV'}
            </button>
            <button onClick={() => handleExport('PDF')} disabled={isExporting} style={{ padding: '0.75rem 1.5rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px' }}>
              {isExporting ? 'Processing...' : 'Export to PDF'}
            </button>
          </div>
        </div>

        <div style={{ flex: 2, background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <h3>Preview Data</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
            <thead>
              <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem' }}>ID</th>
                <th style={{ padding: '0.75rem' }}>Name</th>
                <th style={{ padding: '0.75rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>1</td>
                <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>Example Record A</td>
                <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>APPROVED</td>
              </tr>
            </tbody>
          </table>
          <p style={{ textAlign: 'center', color: '#6b7280', marginTop: '2rem' }}>Showing 1 of 500 records...</p>
        </div>
      </div>
    </div>
  );
};`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(baseDir, name), content);
}

console.log('Phase 5 Frontend Dashboard UI scaffolded.');

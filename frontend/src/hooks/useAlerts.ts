import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export interface EAlert {
  id: string;
  type: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  message: string;
  projectCode?: string;
}

const STORAGE_KEY = (uid: any) => `read_alerts_${uid}`;

export function useAlerts(user: any) {
  const [alerts, setAlerts] = useState<EAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // Restore persisted read-state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY(user?.userId));
      if (raw) setReadIds(new Set(JSON.parse(raw)));
    } catch {}
  }, [user?.userId]);

  const persist = (next: Set<string>) => {
    setReadIds(next);
    localStorage.setItem(STORAGE_KEY(user?.userId), JSON.stringify(Array.from(next)));
  };

  const markRead = useCallback((id: string) => {
    persist(new Set([...readIds, id]));
  }, [readIds]);

  const markAllRead = useCallback(() => {
    persist(new Set([...readIds, ...alerts.map(a => a.id)]));
  }, [readIds, alerts]);

  useEffect(() => {
    if (!user) return;
    const scopeParam = user.role === 'PM' && user.prjMgrId
      ? `&prjMgrId=${user.prjMgrId}`
      : (user.role === 'MD' ? `&managedBy=${encodeURIComponent(user.username || '')}` : '');

    axios.get(`/api/v1/projects/advanced-search?page=0&size=1000${scopeParam}`)
      .then(res => {
        if (!res.data.success) return;
        const generated: EAlert[] = [];
        res.data.data.forEach((p: any) => {
          if (p.expiryStatus === 'EXPIRED') {
            generated.push({
              id: `EXP_${p.projectCode}`, type: 'CRITICAL', projectCode: p.projectCode,
              title: `PO Expired: ${p.projectCode}`,
              message: `Purchase Order for ${p.customerName} has expired. Initiate extension or closure procedures immediately.`,
            });
          } else if (p.expiryStatus === 'EXPIRING_SOON') {
            generated.push({
              id: `EXP_SOON_${p.projectCode}`, type: 'WARNING', projectCode: p.projectCode,
              title: `PO Expiring Soon: ${p.projectCode}`,
              message: `Purchase Order for ${p.customerName} will expire within 90 days. Please review milestones.`,
            });
          }
          if (p.recommendGovtFundRequest) {
            generated.push({
              id: `FUND_${p.projectCode}`, type: 'WARNING', projectCode: p.projectCode,
              title: `Low Client Funds: ${p.projectCode}`,
              message: `NICSI Cash-Hold is below 20% for ${p.customerName}. Raise demand note to client.`,
            });
          }
          if (p.recommendVendorPaymentNotice) {
            generated.push({
              id: `PAY_${p.projectCode}`, type: 'INFO', projectCode: p.projectCode,
              title: `Vendor Payment Due: ${p.projectCode}`,
              message: `Vendor has submitted bills but ₹${p.vendorAmountPending?.toLocaleString('en-IN')} is pending against PO.`,
            });
          }
          if (p.recommendVendorReminder) {
            generated.push({
              id: `BILL_${p.projectCode}`, type: 'INFO', projectCode: p.projectCode,
              title: `Bill Not Submitted: ${p.projectCode}`,
              message: `Purchase Order issued for ${p.customerName} but vendor has not submitted any bills via Bill Desk.`,
            });
          }
        });
        setAlerts(generated);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.role, user?.username, user?.prjMgrId]);

  const displayAlerts = alerts.map(a => ({ ...a, isRead: readIds.has(a.id) }));
  const unreadCount = displayAlerts.filter(a => !a.isRead).length;

  return { alerts: displayAlerts, unreadCount, loading, markRead, markAllRead };
}

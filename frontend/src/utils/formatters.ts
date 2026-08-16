export const STATE_MAP: Record<string, string> = {
  'WB': 'West Bengal', 'UP': 'Uttar Pradesh', 'ND': 'New Delhi',
  'MH': 'Maharashtra', 'ML': 'Meghalaya', 'TS': 'Telangana',
  'GJ': 'Gujarat',     'AP': 'Andhra Pradesh', 'MP': 'Madhya Pradesh',
  'PB': 'Punjab',      'HR': 'Haryana',         'DL': 'Delhi',
  'KA': 'Karnataka',   'TN': 'Tamil Nadu',       'RJ': 'Rajasthan',
  'HP': 'Himachal Pradesh', 'KL': 'Kerala',      'OR': 'Odisha',
  'BR': 'Bihar',       'JK': 'J&K',              'AS': 'Assam',
  'CH': 'Chandigarh',  'JH': 'Jharkhand',        'UK': 'Uttarakhand',
  'MN': 'Manipur',     'TR': 'Tripura',          'CG': 'Chhattisgarh',
  'GA': 'Goa',         'SK': 'Sikkim',           'MZ': 'Mizoram',
  'NL': 'Nagaland',    'AR': 'Arunachal Pradesh','PY': 'Puducherry',
  'NA': 'Others',
};

export function formatCurrency(amount: number): string {
  if (amount >= 10000000) return `₹${(amount/10000000).toFixed(2)} Cr`;
  if (amount >= 100000)   return `₹${(amount/100000).toFixed(2)} L`;
  if (amount >= 1000)     return `₹${(amount/1000).toFixed(1)}K`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatCurrencyFull(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getCommissionTier(pct: number): '5%' | '7%' | '9%' | 'other' {
  if (pct <= 5.5) return '5%';
  if (pct <= 7.5) return '7%';
  if (pct <= 9.5) return '9%';
  return 'other';
}

/**
 * GSTIN state code (first two digits) → State name.
 * Used to determine intra-state (CGST+SGST) vs inter-state (IGST) supply.
 */
export const GSTIN_STATE_CODE: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '36': 'Telangana', '37': 'Andhra Pradesh',
};

/** NICSI's principal place of supply (Delhi HQ) — used as fallback supplier state. */
export const NICSI_SUPPLIER_STATE_CODE = '07';

/** Standard GST rate applied to NICSI IT/consultancy services. */
export const GST_RATE = 0.18;

export interface GstBreakdown {
  /** Total invoice value as recorded in the ERP tax-invoice register. */
  totalAmount: number;
  /** Taxable value (net of GST), back-calculated from the GST-inclusive total. */
  taxableValue: number;
  /** Total GST component. */
  totalGst: number;
  cgst: number;
  sgst: number;
  igst: number;
  /** true = same-state supply (CGST+SGST); false = inter-state (IGST). */
  intraState: boolean;
  rate: number;
  supplierState: string;
  recipientState: string;
}

/**
 * Compute a GST breakdown for a NICSI tax invoice.
 *
 * The source ERP export does NOT carry an explicit CGST/SGST/IGST split, so this
 * derives it correctly from GST first principles:
 *   • Taxable value = totalAmount / (1 + rate)   (amounts are GST-inclusive)
 *   • Total GST     = totalAmount − taxable value
 *   • Place of supply: supplier GSTIN state vs recipient GSTIN state
 *       - same state  → CGST (rate/2) + SGST (rate/2)
 *       - other state → IGST (full rate)
 *
 * @param totalAmount  the tax invoice total (GST-inclusive)
 * @param supplierGstin project/NICSI GSTIN (PRJ_GSTN_NO)
 * @param recipientGstin customer GSTIN (CUST_GSTIN_NO)
 * @param rate GST rate (default 18%)
 */
export function computeGst(
  totalAmount: number,
  supplierGstin?: string | null,
  recipientGstin?: string | null,
  rate: number = GST_RATE,
): GstBreakdown {
  const amount = Number(totalAmount) || 0;
  const taxableValue = amount / (1 + rate);
  const totalGst = amount - taxableValue;

  const supplierCode = (supplierGstin || '').trim().slice(0, 2) || NICSI_SUPPLIER_STATE_CODE;
  const recipientCode = (recipientGstin || '').trim().slice(0, 2) || supplierCode;
  const intraState = supplierCode === recipientCode;

  return {
    totalAmount: amount,
    taxableValue,
    totalGst,
    cgst: intraState ? totalGst / 2 : 0,
    sgst: intraState ? totalGst / 2 : 0,
    igst: intraState ? 0 : totalGst,
    intraState,
    rate,
    supplierState: GSTIN_STATE_CODE[supplierCode] ?? 'Delhi',
    recipientState: GSTIN_STATE_CODE[recipientCode] ?? '—',
  };
}

export interface Project {
  projectCode: string;
  projectName: string;
  customerName: string;
  amountReceived: number;
  poAmount: number;
  totalAmountPaid: number;
  nicsiCommission: number;
  financialStatus: string;
  createdOn: string;
  userEmail: string;
  hodEmail: string;
  [key: string]: any;
}

export const PROJECTS: Project[] = [];
export const PROJECT_STATS: any = {
  total: 0,
  totalAmountReceived: 0,
  totalPOAmount: 0,
  totalInvoiced: 0,
  totalPaid: 0,
  totalABP: 0,
  totalCommission: 0,
  totalVendorPending: 0,
  totalClientPending: 0,
  cleared: 0,
  partial: 0,
  pending: 0,
  totalPOs: 0,
  totalTaxInvoices: 0,
  totalBillDeskInvoices: 0,
  totalExpInvoices: 0,
  totalUnpaid: 0,
  withObjections: 0,
};

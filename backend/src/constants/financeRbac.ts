/** Actions for finance sub-pages (navigation and sensitive operations) */
export const FINANCE_PAGE_ACTIONS = ['view', 'edit'] as const;
export type FinancePageAction = (typeof FINANCE_PAGE_ACTIONS)[number];

export type FinancePageGroup = 'financeManager' | 'financialReports' | 'sensitiveActions';

export interface FinancePageDef {
  key: string;
  label: string;
  group: FinancePageGroup;
  description?: string;
  sensitive?: boolean;
}

export const FINANCE_PAGE_GROUPS: { key: FinancePageGroup; label: string }[] = [
  { key: 'financeManager', label: 'Finance Manager (pages)' },
  { key: 'sensitiveActions', label: 'Sensitive finance actions' },
  { key: 'financialReports', label: 'Financial Reports (pages)' },
];

/** Granular finance pages and actions controllable per RBAC role (e.g. Accountant) */
export const FINANCE_PAGES: FinancePageDef[] = [
  { key: 'billing', label: 'Billing & Invoicing', group: 'financeManager', description: 'Invoice list and single invoice management' },
  { key: 'recordPayment', label: 'Record Payment', group: 'financeManager' },
  { key: 'balanceEnquiry', label: 'Balance Enquiry', group: 'financeManager' },
  { key: 'exemptions', label: 'Fee Exemptions', group: 'financeManager', sensitive: true },
  { key: 'audit', label: 'System Auditor', group: 'financeManager' },
  { key: 'cashLogistics', label: 'Cash / Logistics Receipts', group: 'financeManager' },
  {
    key: 'creditNotes',
    label: 'Credit Notes',
    group: 'sensitiveActions',
    sensitive: true,
    description: 'Apply credit notes to correct overcharges on invoices',
  },
  {
    key: 'debitNotes',
    label: 'Debit Notes',
    group: 'sensitiveActions',
    sensitive: true,
    description: 'Apply debit notes to correct undercharges on invoices',
  },
  {
    key: 'transportAdjust',
    label: 'Transport Adjustments',
    group: 'sensitiveActions',
    sensitive: true,
    description: 'Add or change transport charges on student invoices',
  },
  {
    key: 'diningAdjust',
    label: 'Dining Hall (DH) Adjustments',
    group: 'sensitiveActions',
    sensitive: true,
    description: 'Add or change dining hall meal charges on invoices',
  },
  {
    key: 'tuitionAdjust',
    label: 'Tuition Adjustments on Invoice',
    group: 'sensitiveActions',
    sensitive: true,
    description: 'Add tuition line items via invoice adjustment',
  },
  {
    key: 'bulkInvoices',
    label: 'Bulk Invoice Create / Reverse',
    group: 'sensitiveActions',
    sensitive: true,
  },
  {
    key: 'exemptionCorrection',
    label: 'Tuition Exemption Bulk Correction',
    group: 'sensitiveActions',
    sensitive: true,
  },
  { key: 'reportStudentLedgers', label: 'Student Ledgers', group: 'financialReports' },
  { key: 'reportFeesCollection', label: 'Fees Collection', group: 'financialReports' },
  { key: 'reportUnpaidInvoices', label: 'Unpaid Invoices', group: 'financialReports' },
  { key: 'reportExemption', label: 'Exemption Report', group: 'financialReports' },
  { key: 'reportAgedDebtors', label: 'Aged Debtors', group: 'financialReports' },
  { key: 'reportEnrolmentBilling', label: 'Enrolment vs Billing', group: 'financialReports' },
  { key: 'reportRevenueRecognition', label: 'Revenue Recognition', group: 'financialReports' },
  { key: 'reportStudentReconciliation', label: 'Student Reconciliation', group: 'financialReports' },
  { key: 'reportAnalyticsForecasts', label: 'Analytics & Forecasts', group: 'financialReports' },
  { key: 'reportClassReconciliation', label: 'Class Reconciliation', group: 'financialReports' },
  { key: 'reportDiningHall', label: 'Dining Hall Report', group: 'financialReports' },
  { key: 'reportTransport', label: 'Transport Report', group: 'financialReports' },
];

export const FINANCE_PAGE_MODULE = 'financePage';

export const financePagePermissionKey = (pageKey: string, action: FinancePageAction | string): string =>
  `${FINANCE_PAGE_MODULE}.${pageKey}.${action}`;

/** Default finance-page flags per legacy role key (used when seeding / merging) */
const ACCOUNTANT_FINANCE_DEFAULTS: Record<string, { view: boolean; edit: boolean }> = {
  billing: { view: true, edit: true },
  recordPayment: { view: true, edit: true },
  balanceEnquiry: { view: true, edit: false },
  exemptions: { view: true, edit: false },
  audit: { view: true, edit: false },
  cashLogistics: { view: true, edit: false },
  creditNotes: { view: true, edit: false },
  debitNotes: { view: true, edit: false },
  transportAdjust: { view: false, edit: false },
  diningAdjust: { view: false, edit: false },
  tuitionAdjust: { view: false, edit: false },
  bulkInvoices: { view: false, edit: false },
  exemptionCorrection: { view: false, edit: false },
  reportStudentLedgers: { view: true, edit: false },
  reportFeesCollection: { view: true, edit: false },
  reportUnpaidInvoices: { view: true, edit: false },
  reportExemption: { view: true, edit: false },
  reportAgedDebtors: { view: true, edit: false },
  reportEnrolmentBilling: { view: true, edit: false },
  reportRevenueRecognition: { view: true, edit: false },
  reportStudentReconciliation: { view: true, edit: false },
  reportAnalyticsForecasts: { view: false, edit: false },
  reportClassReconciliation: { view: false, edit: false },
  reportDiningHall: { view: true, edit: false },
  reportTransport: { view: true, edit: false },
};

const ADMIN_FINANCE_REPORT_KEYS = FINANCE_PAGES.filter((p) => p.group === 'financialReports').map((p) => p.key);

function allFinancePagesEnabled(edit: boolean): Record<string, { view: boolean; edit: boolean }> {
  const map: Record<string, { view: boolean; edit: boolean }> = {};
  for (const page of FINANCE_PAGES) {
    map[page.key] = { view: true, edit };
  }
  return map;
}

export function buildFinancePagePermissions(options?: {
  legacyRoleKey?: string;
  adminLevel?: boolean;
}): Record<string, boolean> {
  const perms: Record<string, boolean> = {};
  const adminLevel = options?.adminLevel === true;
  const legacy = options?.legacyRoleKey || 'teacher';

  if (adminLevel) {
    for (const page of FINANCE_PAGES) {
      for (const action of FINANCE_PAGE_ACTIONS) {
        perms[financePagePermissionKey(page.key, action)] = true;
      }
    }
    return perms;
  }

  let defaults: Record<string, { view: boolean; edit: boolean }>;
  if (legacy === 'director' || legacy === 'superadmin') {
    defaults = allFinancePagesEnabled(true);
  } else if (legacy === 'accountant') {
    defaults = { ...ACCOUNTANT_FINANCE_DEFAULTS };
  } else if (legacy === 'headmaster' || legacy === 'deputy_headmaster') {
    /** School Admin leadership: no finance menus unless explicitly granted in RBAC matrix */
    defaults = {};
    for (const page of FINANCE_PAGES) {
      defaults[page.key] = { view: false, edit: false };
    }
  } else if (legacy === 'demo_user') {
    defaults = allFinancePagesEnabled(true);
  } else {
    defaults = {};
    for (const page of FINANCE_PAGES) {
      const allowReports =
        legacy === 'admin' || legacy === 'superadmin'
          ? true
          : ADMIN_FINANCE_REPORT_KEYS.includes(page.key) && legacy === 'accountant';
      const enabled =
        legacy === 'admin' || legacy === 'superadmin'
          ? page.group !== 'sensitiveActions'
          : false;
      defaults[page.key] = {
        view: enabled || allowReports,
        edit: legacy === 'admin' || legacy === 'superadmin' ? page.group !== 'sensitiveActions' : false,
      };
    }
  }

  for (const page of FINANCE_PAGES) {
    const d = defaults[page.key] || { view: false, edit: false };
    for (const action of FINANCE_PAGE_ACTIONS) {
      perms[financePagePermissionKey(page.key, action)] = d[action as FinancePageAction] === true;
    }
  }

  return perms;
}

export function mergeMissingFinancePagePermissions(
  existing: Record<string, boolean>,
  legacyRoleKey: string,
  adminLevel?: boolean
): Record<string, boolean> {
  const defaults = buildFinancePagePermissions({ legacyRoleKey, adminLevel });
  const merged = { ...existing };
  for (const [key, val] of Object.entries(defaults)) {
    if (merged[key] === undefined || adminLevel === true) {
      merged[key] = val;
    }
  }
  return merged;
}

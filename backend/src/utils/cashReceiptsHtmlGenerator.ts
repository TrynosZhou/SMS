export interface CashReceiptsHTMLRow {
  paymentDate: string;
  receiptNumber: string;
  invoiceNumber: string;
  studentName: string;
  studentNumber: string;
  amountPaid: number;
  paymentMethod?: string | null;
}

export interface CashReceiptsHTMLData {
  schoolName: string;
  currencySymbol: string;
  term: string;
  reportDate: Date;
  rows: CashReceiptsHTMLRow[];
  schoolLogo?: string | null;
  systemName?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(sym: string, amount: number): string {
  const n = Number(amount) || 0;
  return `${sym} ${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string | Date): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function formatPrintedAt(d: Date): string {
  return d.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

type MethodBadge = { label: string; bg: string; color: string };

function methodBadge(raw: string | null | undefined): MethodBadge {
  const m = String(raw || '').trim().toUpperCase();
  if (!m) return { label: '—', bg: '#F6F8FA', color: '#64748B' };
  if (m.includes('CASH')) return { label: 'CASH', bg: '#E7F7EE', color: '#1A7F4E' };
  if (m.includes('ECOCASH') || m.includes('ONEMONEY') || m.includes('MOBILE'))
    return { label: m.includes('ECOCASH') ? 'ECOCASH' : m.replace('(USD)', '').trim() || 'MOBILE', bg: '#F1ECFB', color: '#6B3FB8' };
  if (m.includes('BANK') || m.includes('TRANSFER') || m.includes('CARD') || m.includes('CHEQUE'))
    return { label: m.includes('BANK') ? 'BANK' : m.replace('(USD)', '').trim() || 'TRANSFER', bg: '#EAF1FB', color: '#1D5FA8' };
  return { label: m.replace('(USD)', '').trim() || m, bg: '#F6F8FA', color: '#3A4A63' };
}

function computeTopMethod(rows: CashReceiptsHTMLRow[]): { method: string; total: number; pct: number } {
  const totals = new Map<string, number>();
  let grand = 0;
  for (const row of rows) {
    const amt = Number(row.amountPaid) || 0;
    grand += amt;
    const key = String(row.paymentMethod || 'Other').trim() || 'Other';
    totals.set(key, (totals.get(key) || 0) + amt);
  }
  if (!totals.size || grand <= 0) return { method: '—', total: 0, pct: 0 };
  let best = '';
  let bestTotal = 0;
  for (const [method, total] of totals) {
    if (total > bestTotal) {
      best = method;
      bestTotal = total;
    }
  }
  return { method: best, total: bestTotal, pct: Math.round((bestTotal / grand) * 100) };
}

function buildTableRows(rows: CashReceiptsHTMLRow[], sym: string): string {
  if (!rows.length) {
    return `<tr><td colspan="6" class="empty-row">No payment transactions for this period.</td></tr>`;
  }

  return rows
    .map((row, i) => {
      const badge = methodBadge(row.paymentMethod);
      const stripe = i % 2 === 1 ? 'row-alt' : '';
      return `
        <tr class="${stripe}">
          <td class="mono receipt">${escapeHtml(row.receiptNumber || '—')}</td>
          <td class="mono date">${escapeHtml(formatDate(row.paymentDate))}</td>
          <td class="student-cell">
            <span class="student-name">${escapeHtml(row.studentName || '—')}</span>
            <span class="student-id">${escapeHtml(row.studentNumber || '—')}</span>
          </td>
          <td class="mono invoice">${escapeHtml(row.invoiceNumber || '—')}</td>
          <td class="mono num amount">${escapeHtml(money(sym, row.amountPaid))}</td>
          <td class="method-cell">
            <span class="method-pill" style="background:${badge.bg};color:${badge.color}">${escapeHtml(badge.label)}</span>
          </td>
        </tr>`;
    })
    .join('');
}

export function createCashReceiptsHTML(data: CashReceiptsHTMLData): string {
  const sym = data.currencySymbol || '$';
  const rows = data.rows || [];
  const total = parseFloat(rows.reduce((s, r) => s + (Number(r.amountPaid) || 0), 0).toFixed(2));
  const count = rows.length;
  const average = count ? parseFloat((total / count).toFixed(2)) : 0;
  const top = computeTopMethod(rows);
  const printedAt = formatPrintedAt(data.reportDate);
  const systemName = data.systemName || 'SMS School Management System';

  const rawLogo = String(data.schoolLogo ?? '').trim();
  const logoHtml = rawLogo.startsWith('data:image')
    ? `<img src="${escapeHtml(rawLogo)}" alt="" class="logo-img" />`
    : `<div class="logo-placeholder" aria-hidden="true"><span>LOGO</span></div>`;

  const topBadge = methodBadge(top.method);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fees Collection Report — ${escapeHtml(data.term)}</title>
  <style>
    :root {
      --navy: #142850;
      --navy-soft: #3A4A63;
      --teal: #0E9B8A;
      --teal-light: #E4F5F2;
      --gray-text: #64748B;
      --gray-light: #F6F8FA;
      --border: #E2E8F0;
      --sans: Helvetica, Arial, system-ui, -apple-system, sans-serif;
      --mono: 'IBM Plex Mono', Consolas, 'Courier New', monospace;
    }

    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      font-family: var(--sans);
      font-size: 13px;
      line-height: 1.45;
      color: var(--navy);
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body { padding: 28px 32px 48px; }

    .report-header {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 16px 24px;
      align-items: start;
      padding-bottom: 14px;
      border-bottom: 3px solid var(--teal);
      margin-bottom: 22px;
    }

    .brand { display: flex; align-items: center; gap: 14px; }

    .logo-placeholder {
      width: 38px;
      height: 38px;
      background: var(--gray-light);
      border: 1px dashed var(--border);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .logo-placeholder span {
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--gray-text);
    }

    .logo-img {
      width: 38px;
      height: 38px;
      object-fit: contain;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .school-name {
      margin: 0;
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--navy);
      line-height: 1.15;
    }

    .report-eyebrow {
      margin: 4px 0 0;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--teal);
    }

    .header-meta {
      text-align: right;
      min-width: 200px;
    }

    .header-meta .term {
      margin: 0 0 6px;
      font-size: 1rem;
      font-weight: 700;
      color: var(--navy);
    }

    .header-meta .printed,
    .header-meta .count {
      margin: 0 0 3px;
      font-size: 0.78rem;
      color: var(--gray-text);
    }

    .summary-head {
      margin-bottom: 14px;
    }

    .summary-head h2 {
      margin: 0 0 4px;
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--navy);
    }

    .summary-head .meta {
      margin: 0;
      font-size: 0.8rem;
      color: var(--gray-text);
    }

    .stat-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }

    .stat-card {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 14px 12px 16px;
      position: relative;
      overflow: hidden;
    }

    .stat-card::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
    }

    .stat-card--total::before { background: var(--teal); }
    .stat-card--count::before { background: var(--navy); }
    .stat-card--avg::before { background: #1D5FA8; }
    .stat-card--method::before { background: #6B3FB8; }

    .stat-label {
      display: block;
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--gray-text);
      margin-bottom: 6px;
    }

    .stat-value {
      display: block;
      font-size: 1.2rem;
      font-weight: 700;
      color: var(--navy);
      line-height: 1.2;
    }

    .stat-sub {
      display: block;
      margin-top: 4px;
      font-size: 0.72rem;
      color: var(--gray-text);
    }

    .table-wrap {
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 0;
    }

    table.collections {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
    }

    .collections thead th {
      background: var(--navy);
      color: #fff;
      padding: 10px 12px;
      text-align: left;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      border-bottom: 1px solid var(--navy);
    }

    .collections thead th.num { text-align: right; }
    .collections thead th.method { text-align: center; }

    .collections tbody td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }

    .collections tbody tr.row-alt { background: var(--gray-light); }
    .collections tbody tr:last-child td { border-bottom: none; }

    .collections tfoot td {
      padding: 12px;
      background: var(--teal-light);
      border-top: 3px solid var(--teal);
      font-weight: 700;
      vertical-align: middle;
    }

    .mono { font-family: var(--mono); font-size: 0.78rem; }
    .num { text-align: right; white-space: nowrap; }
    .amount { font-weight: 700; color: var(--navy); }
    .method-cell { text-align: center; }

    .student-cell { line-height: 1.3; }
    .student-name { display: block; font-weight: 700; color: var(--navy); }
    .student-id { display: block; font-size: 0.72rem; color: var(--gray-text); margin-top: 2px; }

    .method-pill {
      display: inline-block;
      padding: 0.22rem 0.55rem;
      border-radius: 999px;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .total-amount {
      text-align: right;
      font-family: var(--mono);
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--teal);
    }

    .empty-row {
      text-align: center;
      color: var(--gray-text);
      padding: 28px !important;
    }

    .report-footer {
      margin-top: 28px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      font-size: 0.72rem;
      color: var(--gray-text);
    }

    .report-footer .center { text-align: center; }
    .report-footer .right { text-align: right; }

    @media (max-width: 800px) {
      .report-header { grid-template-columns: 1fr; }
      .header-meta { text-align: left; }
      .stat-grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 520px) {
      body { padding: 16px; }
      .stat-grid { grid-template-columns: 1fr; }
      .table-wrap { overflow-x: auto; }
      .collections { min-width: 640px; }
    }

    @media print {
      body { padding: 0; }
      .report-header { break-after: avoid; }
      .stat-grid { break-after: avoid; }
      .collections thead { display: table-header-group; }
      .collections tfoot { display: table-footer-group; }
      .report-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: #fff;
        padding: 8px 0;
      }
    }
  </style>
</head>
<body>
  <header class="report-header">
    <div class="brand">
      ${logoHtml}
      <div>
        <h1 class="school-name">${escapeHtml(data.schoolName)}</h1>
        <p class="report-eyebrow">Fees Collection Report</p>
      </div>
    </div>
    <div></div>
    <div class="header-meta">
      <p class="term">${escapeHtml(data.term)}</p>
      <p class="printed">Printed ${escapeHtml(printedAt)}</p>
      <p class="count">${count} transaction${count === 1 ? '' : 's'}</p>
    </div>
  </header>

  <section class="summary-head">
    <h2>Fees Collection Summary</h2>
    <p class="meta">${escapeHtml(data.term)} · ${count} transaction${count === 1 ? '' : 's'} · Printed ${escapeHtml(printedAt)}</p>
  </section>

  <section class="stat-grid" aria-label="Summary statistics">
    <article class="stat-card stat-card--total">
      <span class="stat-label">Total Collected</span>
      <span class="stat-value">${escapeHtml(money(sym, total))}</span>
    </article>
    <article class="stat-card stat-card--count">
      <span class="stat-label">Transaction Count</span>
      <span class="stat-value">${count}</span>
    </article>
    <article class="stat-card stat-card--avg">
      <span class="stat-label">Average Payment</span>
      <span class="stat-value">${escapeHtml(money(sym, average))}</span>
    </article>
    <article class="stat-card stat-card--method">
      <span class="stat-label">Top Payment Method</span>
      <span class="stat-value">${escapeHtml(money(sym, top.total))}</span>
      <span class="stat-sub">
        <span class="method-pill" style="background:${topBadge.bg};color:${topBadge.color};font-size:0.6rem">${escapeHtml(topBadge.label)}</span>
        ${top.pct}% of total
      </span>
    </article>
  </section>

  <div class="table-wrap">
    <table class="collections">
      <thead>
        <tr>
          <th>Receipt No.</th>
          <th>Date</th>
          <th>Student</th>
          <th>Invoice</th>
          <th class="num">Amount</th>
          <th class="method">Method</th>
        </tr>
      </thead>
      <tbody>
        ${buildTableRows(rows, sym)}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4"><strong>TOTAL (${count} transaction${count === 1 ? '' : 's'})</strong></td>
          <td class="total-amount">${escapeHtml(money(sym, total))}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <footer class="report-footer">
    <span>Confidential — for internal accounting use only</span>
    <span class="center">Generated via ${escapeHtml(systemName)}</span>
    <span class="right"></span>
  </footer>
</body>
</html>`;
}

export function createCashReceiptsHTMLBuffer(data: CashReceiptsHTMLData): Buffer {
  return Buffer.from(createCashReceiptsHTML(data), 'utf-8');
}

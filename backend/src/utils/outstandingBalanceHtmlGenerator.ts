import { OutstandingBalanceRow } from './outstandingBalances';

export interface OutstandingBalanceHTMLData {
  schoolName: string;
  currencySymbol: string;
  reportDate: Date;
  balances: OutstandingBalanceRow[];
  schoolLogo?: string | null;
  schoolEmail?: string | null;
  schoolPhone?: string | null;
  schoolAddress?: string | null;
  scopeSubtitle?: string;
}

export type AggregatedOutstandingRow = {
  studentNumber: string;
  firstName: string;
  lastName: string;
  gender: string;
  className: string | null;
  phoneNumber: string | null;
  invoiceBalance: number;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(sym: string, amount: number): string {
  const n = Number(amount) || 0;
  return `${sym}${Math.abs(n).toFixed(2)}`;
}

function dash(value: unknown): string {
  const s = String(value ?? '').trim();
  return s || '—';
}

/** One row per student — sum balances when a student owes on multiple invoices. */
export function aggregateOutstandingByStudent(rows: OutstandingBalanceRow[]): AggregatedOutstandingRow[] {
  const byStudent = new Map<string, AggregatedOutstandingRow>();

  for (const row of rows) {
    const key = row.studentId || row.studentNumber;
    if (!key) continue;
    const amount = Number(row.invoiceBalance) || 0;
    if (amount <= 0.005) continue;

    const existing = byStudent.get(key);
    if (existing) {
      existing.invoiceBalance = parseFloat((existing.invoiceBalance + amount).toFixed(2));
      if (!existing.className && row.className) existing.className = row.className;
      if (!existing.phoneNumber && row.phoneNumber) existing.phoneNumber = row.phoneNumber;
    } else {
      byStudent.set(key, {
        studentNumber: row.studentNumber,
        firstName: row.firstName,
        lastName: row.lastName,
        gender: row.gender,
        className: row.className,
        phoneNumber: row.phoneNumber || null,
        invoiceBalance: amount,
      });
    }
  }

  return [...byStudent.values()].sort((a, b) => {
    const diff = b.invoiceBalance - a.invoiceBalance;
    if (Math.abs(diff) > 0.005) return diff;
    return String(a.studentNumber).localeCompare(String(b.studentNumber));
  });
}

function housePillClass(className: string): string {
  const lower = className.toLowerCase();
  if (lower.includes('gold')) return 'house-pill--gold';
  if (lower.includes('white')) return 'house-pill--white';
  if (lower.includes('blue')) return 'house-pill--blue';
  if (lower.includes('red')) return 'house-pill--red';
  if (lower.includes('green')) return 'house-pill--green';
  if (lower.includes('silver')) return 'house-pill--silver';
  return 'house-pill--neutral';
}

function buildTableRows(rows: AggregatedOutstandingRow[], sym: string): string {
  if (!rows.length) {
    return `<tr><td colspan="6" class="empty-row">No outstanding balances.</td></tr>`;
  }

  return rows
    .map((row) => {
      const name = [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || '—';
      const classLabel = dash(row.className);
      const classHtml =
        classLabel === '—'
          ? `<span class="muted-dash">—</span>`
          : `<span class="house-pill ${housePillClass(classLabel)}">${escapeHtml(classLabel)}</span>`;

      return `
        <tr>
          <td class="mono id">${escapeHtml(row.studentNumber)}</td>
          <td class="name">${escapeHtml(name)}</td>
          <td>${escapeHtml(dash(row.gender))}</td>
          <td>${classHtml}</td>
          <td class="mono phone col-phone">${escapeHtml(dash(row.phoneNumber))}</td>
          <td class="mono num balance">${escapeHtml(money(sym, row.invoiceBalance))}</td>
        </tr>`;
    })
    .join('');
}

export function createOutstandingBalanceHTML(data: OutstandingBalanceHTMLData): string {
  const sym = data.currencySymbol || '$';
  const aggregated = aggregateOutstandingByStudent(data.balances || []);
  const total = parseFloat(aggregated.reduce((s, r) => s + r.invoiceBalance, 0).toFixed(2));
  const studentCount = aggregated.length;
  const average = studentCount ? parseFloat((total / studentCount).toFixed(2)) : 0;
  const generatedLabel = data.reportDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const scopeSubtitle = data.scopeSubtitle || 'All terms with unpaid invoice balances';

  const rawLogo = String(data.schoolLogo ?? '').trim();
  const logoHtml = rawLogo.startsWith('data:image')
    ? `<img src="${escapeHtml(rawLogo)}" alt="" class="crest" />`
    : `<div class="crest crest--placeholder" aria-hidden="true">${escapeHtml(data.schoolName.slice(0, 1))}</div>`;

  const contactParts = [
    data.schoolEmail ? `Email: ${escapeHtml(data.schoolEmail)}` : '',
    data.schoolPhone ? `Tel: ${escapeHtml(data.schoolPhone)}` : '',
    data.schoolAddress ? escapeHtml(data.schoolAddress) : '',
  ].filter(Boolean);
  const contactLine = contactParts.length
    ? contactParts.join(' · ')
    : 'Contact the school office for assistance.';

  const statusText =
    studentCount === 1
      ? '1 student account has an unpaid balance totalling'
      : `${studentCount} student accounts have unpaid balances totalling`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Outstanding Balances Report — ${escapeHtml(data.schoolName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=IBM+Plex+Mono:wght@400;500&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --navy-900: #0c1a3a;
      --navy-800: #122654;
      --navy-700: #1a3568;
      --gold-500: #c9a227;
      --gold-400: #d4b44a;
      --paper: #f4f2ed;
      --surface: #ffffff;
      --ink: #1c2434;
      --muted: #5c677d;
      --line: #dde3ec;
      --rust: #9b4438;
      --rust-soft: #f7ecea;
      --green: #1f6b4f;
      --shadow: 0 10px 40px rgba(12, 26, 58, 0.08);
      --radius: 14px;
      --serif: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
      --sans: 'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif;
      --mono: 'IBM Plex Mono', Consolas, 'Courier New', monospace;
    }

    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: var(--sans);
      font-size: 15px;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body { padding: 24px 16px 40px; }

    .statement {
      position: relative;
      max-width: 980px;
      margin: 0 auto;
      background: var(--surface);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .statement::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: linear-gradient(180deg, var(--gold-500) 0%, var(--gold-400) 100%);
      z-index: 2;
    }

    .header-band {
      background: linear-gradient(135deg, var(--navy-900) 0%, var(--navy-700) 100%);
      color: #fff;
      padding: 28px 32px 24px 36px;
      position: relative;
    }

    .header-band::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--gold-500), var(--gold-400), var(--gold-500));
    }

    .header-grid {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 20px 24px;
      align-items: center;
    }

    .crest {
      width: 72px;
      height: 72px;
      object-fit: contain;
      border-radius: 50%;
      background: rgba(255,255,255,0.95);
      padding: 6px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    }

    .crest--placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--serif);
      font-size: 2rem;
      font-weight: 700;
      color: var(--navy-800);
    }

    .school-block .school-name {
      margin: 0 0 4px;
      font-family: var(--serif);
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: 0.01em;
      line-height: 1.15;
    }

    .school-block .office {
      margin: 0;
      font-size: 0.82rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.72);
    }

    .report-meta { text-align: right; min-width: 220px; }

    .report-meta .eyebrow {
      margin: 0 0 4px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.65);
    }

    .report-meta .report-title {
      margin: 0 0 6px;
      font-family: var(--serif);
      font-size: 1.35rem;
      font-weight: 700;
      line-height: 1.2;
    }

    .report-meta .report-subtitle {
      margin: 0 0 10px;
      font-size: 0.88rem;
      color: rgba(255,255,255,0.78);
    }

    .report-meta .generated {
      margin: 0;
      font-family: var(--mono);
      font-size: 0.78rem;
      color: rgba(255,255,255,0.65);
    }

    .body { padding: 28px 32px 32px 36px; }

    .status-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 18px;
      border-radius: 10px;
      margin-bottom: 22px;
      background: var(--rust-soft);
      border: 1px solid #e8cfcb;
      color: #6f2f28;
    }

    .status-banner .status-text {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      max-width: 520px;
    }

    .status-banner .status-amount {
      margin: 0;
      font-family: var(--mono);
      font-size: 1.45rem;
      font-weight: 500;
      letter-spacing: -0.02em;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-bottom: 26px;
    }

    .summary-card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px 16px 16px;
      box-shadow: 0 2px 8px rgba(12, 26, 58, 0.04);
      border-top: 3px solid #b8c2d0;
    }

    .summary-card .label {
      display: block;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }

    .summary-card .value {
      display: block;
      font-family: var(--mono);
      font-size: 1.2rem;
      font-weight: 500;
      color: var(--ink);
    }

    .summary-card--avg { border-top-color: var(--gold-500); }
    .summary-card--total {
      background: linear-gradient(135deg, var(--navy-900) 0%, var(--navy-700) 100%);
      border-color: var(--navy-800);
      border-top-color: var(--gold-500);
    }

    .summary-card--total .label { color: rgba(255,255,255,0.72); }
    .summary-card--total .value { color: #fff; font-size: 1.35rem; }

    .section-heading {
      margin: 0 0 12px;
      font-family: var(--serif);
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--navy-900);
    }

    .table-wrap {
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 24px;
    }

    table.balances {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }

    .balances thead th {
      background: #f6f8fb;
      padding: 11px 14px;
      text-align: left;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #4a5568;
      border-bottom: 1px solid var(--line);
    }

    .balances tbody td {
      padding: 11px 14px;
      border-bottom: 1px solid #edf1f6;
      vertical-align: middle;
    }

    .balances tbody tr:nth-child(even) { background: #fbfcfe; }
    .balances tbody tr:last-child td { border-bottom: none; }

    .balances tfoot td {
      padding: 14px;
      background: #f3f6fa;
      border-top: 3px solid var(--navy-800);
      font-weight: 700;
    }

    .mono { font-family: var(--mono); font-size: 0.82rem; }
    .num { text-align: right; white-space: nowrap; }
    .balance { color: var(--rust); font-weight: 700; }
    .muted-dash { color: #94a3b8; }

    .house-pill {
      display: inline-block;
      padding: 0.2rem 0.62rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }

    .house-pill--gold { background: #faf5e6; color: #7a5c12; border: 1px solid #e8d48a; }
    .house-pill--white { background: #fff; color: #475569; border: 1px solid #cbd5e1; }
    .house-pill--blue { background: #e8f0fa; color: #1e4a7a; border: 1px solid #b8cfe8; }
    .house-pill--red { background: #fce8e8; color: #8b2e2e; border: 1px solid #e8b4b4; }
    .house-pill--green { background: #e8f5ef; color: #145a42; border: 1px solid #b8dcc8; }
    .house-pill--silver { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
    .house-pill--neutral { background: #eef2f7; color: #334155; border: 1px solid #d5dde8; }

    .empty-row {
      text-align: center;
      color: var(--muted);
      padding: 24px !important;
    }

    .footer {
      padding-top: 18px;
      border-top: 1px solid var(--line);
      font-size: 0.84rem;
      color: var(--muted);
      line-height: 1.6;
    }

    .footer p { margin: 0 0 8px; }
    .footer strong { color: var(--ink); font-weight: 600; }

    @media (max-width: 820px) {
      .header-grid { grid-template-columns: auto 1fr; }
      .report-meta { grid-column: 1 / -1; text-align: left; }
      .summary-grid { grid-template-columns: 1fr; }
    }

    @media (max-width: 640px) {
      body { padding: 12px 8px 24px; }
      .header-band, .body { padding-left: 24px; padding-right: 20px; }
      .col-phone, .balances thead th.col-phone { display: none; }
      .balances tbody td.phone { display: none; }
      .table-wrap { overflow-x: auto; }
      .balances { min-width: 560px; }
    }

    @media print {
      body { background: #fff; padding: 0; }
      .statement { box-shadow: none; border-radius: 0; max-width: none; }
      .header-band, .status-banner, .summary-card--total, .house-pill {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <article class="statement">
    <header class="header-band">
      <div class="header-grid">
        ${logoHtml}
        <div class="school-block">
          <h1 class="school-name">${escapeHtml(data.schoolName)}</h1>
          <p class="office">Office of Student Finance</p>
        </div>
        <div class="report-meta">
          <p class="eyebrow">Outstanding Balances Report</p>
          <h2 class="report-title">Accounts Receivable Summary</h2>
          <p class="report-subtitle">${escapeHtml(scopeSubtitle)}</p>
          <p class="generated">Generated ${escapeHtml(generatedLabel)}</p>
        </div>
      </div>
    </header>

    <div class="body">
      <section class="status-banner" aria-label="Outstanding summary">
        <p class="status-text">${escapeHtml(statusText)}</p>
        <p class="status-amount">${escapeHtml(money(sym, total))}</p>
      </section>

      <section class="summary-grid" aria-label="Summary figures">
        <article class="summary-card">
          <span class="label">Students Affected</span>
          <span class="value">${studentCount}</span>
        </article>
        <article class="summary-card summary-card--avg">
          <span class="label">Average Balance</span>
          <span class="value">${escapeHtml(money(sym, average))}</span>
        </article>
        <article class="summary-card summary-card--total">
          <span class="label">Total Outstanding</span>
          <span class="value">${escapeHtml(money(sym, total))}</span>
        </article>
      </section>

      <h3 class="section-heading">Student Balances</h3>
      <div class="table-wrap">
        <table class="balances">
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Student Name</th>
              <th>Sex</th>
              <th>Class</th>
              <th class="col-phone">Phone</th>
              <th class="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${buildTableRows(aggregated, sym)}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5"><strong>Total outstanding</strong></td>
              <td class="mono num balance"><strong>${escapeHtml(money(sym, total))}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <footer class="footer">
        <p><strong>Currency note:</strong> All amounts are shown in ${escapeHtml(sym)} (United States Dollars) unless otherwise stated.</p>
        <p><strong>How balances are calculated:</strong> Figures reflect unpaid invoice balances across all terms, including any prior-term amounts brought forward. Payments recorded in the system reduce the balance shown.</p>
        <p>To query a balance, quote the student ID when contacting the finance office.</p>
        <p><strong>Finance office:</strong> ${contactLine}</p>
      </footer>
    </div>
  </article>
</body>
</html>`;
}

export function createOutstandingBalanceHTMLBuffer(data: OutstandingBalanceHTMLData): Buffer {
  return Buffer.from(createOutstandingBalanceHTML(data), 'utf-8');
}

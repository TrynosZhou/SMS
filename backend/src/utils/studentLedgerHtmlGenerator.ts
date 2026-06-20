import { StudentLedgerReport } from './studentLedgerReport';

export interface StudentLedgerHTMLData {
  schoolName: string;
  currencySymbol: string;
  report: StudentLedgerReport;
  generatedAt: Date;
  schoolLogo?: string | null;
  schoolEmail?: string | null;
  schoolPhone?: string | null;
  schoolAddress?: string | null;
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
  const prefix = n < 0 ? '-' : '';
  return `${prefix}${sym}${Math.abs(n).toFixed(2)}`;
}

function formatDisplayDate(value: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatIsoDate(value: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 10);
}

function balanceTone(balance: number): 'owed' | 'credit' | 'settled' {
  if (Math.abs(balance) < 0.005) return 'settled';
  return balance > 0 ? 'owed' : 'credit';
}

function statusCopy(report: StudentLedgerReport, sym: string): { tone: 'owed' | 'credit' | 'settled'; text: string; amount: string } {
  const closing = report.summary.closingBalance;
  const term = report.term.name;
  const tone = balanceTone(closing);
  if (tone === 'owed') {
    return {
      tone,
      text: `Balance due for ${term}`,
      amount: money(sym, closing),
    };
  }
  if (tone === 'credit') {
    return {
      tone,
      text: `Credit balance for ${term}`,
      amount: money(sym, Math.abs(closing)),
    };
  }
  return {
    tone,
    text: `Account settled for ${term}`,
    amount: money(sym, 0),
  };
}

function typeLabel(type: string): string {
  const t = String(type || '').toLowerCase();
  if (t === 'payment') return 'Payment';
  if (t === 'invoice') return 'Invoice';
  if (t === 'opening') return 'Opening';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function buildTransactionRows(report: StudentLedgerReport, sym: string): string {
  if (!report.lines.length) {
    return `<tr><td colspan="7" class="empty-row">No transactions recorded for this term.</td></tr>`;
  }

  return report.lines
    .map((line) => {
      const tone = balanceTone(line.balance);
      const debitCell = line.debit > 0 ? money(sym, line.debit) : '—';
      const creditCell = line.credit > 0 ? money(sym, line.credit) : '—';
      return `
        <tr>
          <td class="mono date">${escapeHtml(formatIsoDate(line.date))}</td>
          <td><span class="type-pill type-pill--${escapeHtml(line.type)}">${escapeHtml(typeLabel(line.type))}</span></td>
          <td class="mono ref">${escapeHtml(line.reference || '—')}</td>
          <td class="desc">${escapeHtml(line.description || '—')}</td>
          <td class="mono num debit">${escapeHtml(debitCell)}</td>
          <td class="mono num credit">${escapeHtml(creditCell)}</td>
          <td class="mono num balance balance--${tone}">${escapeHtml(money(sym, line.balance))}</td>
        </tr>`;
    })
    .join('');
}

export function createStudentLedgerHTML(data: StudentLedgerHTMLData): string {
  const { schoolName, currencySymbol, report, generatedAt, schoolLogo } = data;
  const sym = currencySymbol || '$';
  const st = report.student;
  const studentName = `${st.firstName} ${st.lastName}`.trim();
  const generatedLabel = generatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const status = statusCopy(report, sym);
  const termRange =
    report.term.startDate && report.term.endDate
      ? `${formatDisplayDate(report.term.startDate)} – ${formatDisplayDate(report.term.endDate)}`
      : '—';

  const logoHtml = String(schoolLogo || '').trim().startsWith('data:image')
    ? `<img src="${escapeHtml(schoolLogo)}" alt="" class="crest" />`
    : `<div class="crest crest--placeholder" aria-hidden="true">${escapeHtml(schoolName.slice(0, 1))}</div>`;

  const contactParts = [
    data.schoolEmail ? `Email: ${escapeHtml(data.schoolEmail)}` : '',
    data.schoolPhone ? `Tel: ${escapeHtml(data.schoolPhone)}` : '',
    data.schoolAddress ? escapeHtml(data.schoolAddress) : '',
  ].filter(Boolean);

  const contactLine = contactParts.length
    ? contactParts.join(' · ')
    : 'Contact the school office for assistance.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Student Ledger Report — ${escapeHtml(studentName)}</title>
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
      --green-soft: #e8f5ef;
      --gold-soft: #faf5e6;
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

    .report-meta {
      text-align: right;
      min-width: 220px;
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

    .body {
      padding: 28px 32px 32px 36px;
    }

    .student-identity {
      margin-bottom: 18px;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--line);
    }

    .student-name {
      margin: 0 0 10px;
      font-family: var(--serif);
      font-size: 2rem;
      font-weight: 700;
      color: var(--navy-900);
      letter-spacing: -0.01em;
      line-height: 1.1;
    }

    .meta-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0;
      font-size: 0.92rem;
      color: var(--muted);
    }

    .meta-row span {
      display: inline-flex;
      align-items: center;
      padding: 0 14px;
    }

    .meta-row span:first-child { padding-left: 0; }

    .meta-row span + span {
      border-left: 1px solid #c8d0dc;
    }

    .meta-row strong { color: var(--ink); font-weight: 600; }

    .status-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 18px;
      border-radius: 10px;
      margin-bottom: 22px;
      border: 1px solid transparent;
    }

    .status-banner--owed {
      background: var(--rust-soft);
      border-color: #e8cfcb;
      color: #6f2f28;
    }

    .status-banner--credit {
      background: var(--green-soft);
      border-color: #c5e6d6;
      color: #145a42;
    }

    .status-banner--settled {
      background: #eef2f7;
      border-color: #d5dde8;
      color: #334155;
    }

    .status-banner .status-text {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }

    .status-banner .status-amount {
      margin: 0;
      font-family: var(--mono);
      font-size: 1.35rem;
      font-weight: 500;
      letter-spacing: -0.02em;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
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

    .summary-card--debit { border-top-color: var(--rust); }
    .summary-card--credit { border-top-color: var(--green); }
    .summary-card--closing {
      border-top-color: var(--navy-800);
      background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
    }

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

    table.ledger {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }

    .ledger thead th {
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

    .ledger tbody td {
      padding: 11px 14px;
      border-bottom: 1px solid #edf1f6;
      vertical-align: middle;
    }

    .ledger tbody tr:last-child td { border-bottom: none; }
    .ledger tbody tr:nth-child(even) { background: #fbfcfe; }

    .ledger tfoot td {
      padding: 12px 14px;
      background: #f3f6fa;
      border-top: 2px solid var(--line);
      font-weight: 700;
    }

    .mono { font-family: var(--mono); font-size: 0.82rem; }
    .num { text-align: right; white-space: nowrap; }
    .debit { color: var(--ink); }
    .credit { color: var(--green); }
    .balance--owed { color: var(--rust); font-weight: 600; }
    .balance--credit { color: var(--green); font-weight: 600; }
    .balance--settled { color: var(--muted); font-weight: 600; }

    .desc { max-width: 240px; color: #334155; }

    .type-pill {
      display: inline-block;
      padding: 0.22rem 0.62rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .type-pill--payment { background: #d8f0e6; color: #145a42; }
    .type-pill--invoice { background: var(--gold-soft); color: #7a5c12; }
    .type-pill--opening { background: #e8edf4; color: #334155; }

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
      .header-grid {
        grid-template-columns: auto 1fr;
      }
      .report-meta {
        grid-column: 1 / -1;
        text-align: left;
      }
      .summary-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 560px) {
      body { padding: 12px 8px 24px; }
      .header-band, .body { padding-left: 24px; padding-right: 20px; }
      .student-name { font-size: 1.55rem; }
      .meta-row span {
        padding: 4px 0;
        border-left: none !important;
        width: 100%;
      }
      .summary-grid { grid-template-columns: 1fr; }
      .table-wrap { overflow-x: auto; }
      .ledger { min-width: 680px; }
    }

    @media print {
      body {
        background: #fff;
        padding: 0;
      }
      .statement {
        box-shadow: none;
        border-radius: 0;
        max-width: none;
      }
      .header-band { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .status-banner, .summary-card, .type-pill { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <article class="statement">
    <header class="header-band">
      <div class="header-grid">
        ${logoHtml}
        <div class="school-block">
          <h1 class="school-name">${escapeHtml(schoolName)}</h1>
          <p class="office">Office of Student Finance</p>
        </div>
        <div class="report-meta">
          <h2 class="report-title">Student Ledger Report</h2>
          <p class="report-subtitle">Term Account Statement</p>
          <p class="generated">Generated ${escapeHtml(generatedLabel)}</p>
        </div>
      </div>
    </header>

    <div class="body">
      <section class="student-identity">
        <h3 class="student-name">${escapeHtml(studentName)}</h3>
        <div class="meta-row">
          <span><strong>Admission</strong>&nbsp; ${escapeHtml(st.admissionNumber)}</span>
          <span><strong>Class</strong>&nbsp; ${escapeHtml(st.className || '—')}</span>
          <span><strong>Form</strong>&nbsp; ${escapeHtml(st.formName || '—')}</span>
          <span><strong>Term</strong>&nbsp; ${escapeHtml(report.term.name)} (${escapeHtml(termRange)})</span>
        </div>
      </section>

      <section class="status-banner status-banner--${status.tone}" aria-label="Account status">
        <p class="status-text">${escapeHtml(status.text)}</p>
        <p class="status-amount">${escapeHtml(status.amount)}</p>
      </section>

      <section class="summary-grid" aria-label="Account summary">
        <article class="summary-card">
          <span class="label">Opening Balance</span>
          <span class="value">${escapeHtml(money(sym, report.summary.openingBalance))}</span>
        </article>
        <article class="summary-card summary-card--debit">
          <span class="label">Total Debits</span>
          <span class="value">${escapeHtml(money(sym, report.summary.totalDebits))}</span>
        </article>
        <article class="summary-card summary-card--credit">
          <span class="label">Total Credits</span>
          <span class="value">${escapeHtml(money(sym, report.summary.totalCredits))}</span>
        </article>
        <article class="summary-card summary-card--closing">
          <span class="label">Closing Balance</span>
          <span class="value">${escapeHtml(money(sym, report.summary.closingBalance))}</span>
        </article>
      </section>

      <h4 class="section-heading">Transaction History</h4>
      <div class="table-wrap">
        <table class="ledger">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Reference</th>
              <th>Description</th>
              <th class="num">Debit</th>
              <th class="num">Credit</th>
              <th class="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${buildTransactionRows(report, sym)}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4"><strong>Term totals</strong></td>
              <td class="mono num debit"><strong>${escapeHtml(money(sym, report.summary.totalDebits))}</strong></td>
              <td class="mono num credit"><strong>${escapeHtml(money(sym, report.summary.totalCredits))}</strong></td>
              <td class="mono num balance balance--${balanceTone(report.summary.closingBalance)}"><strong>${escapeHtml(money(sym, report.summary.closingBalance))}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <footer class="footer">
        <p><strong>Currency note:</strong> All amounts are shown in ${escapeHtml(sym)} (United States Dollars) unless otherwise stated.</p>
        <p>To query a transaction, quote the reference number (e.g. invoice or receipt number) when contacting the finance office.</p>
        <p><strong>Finance office:</strong> ${contactLine}</p>
      </footer>
    </div>
  </article>
</body>
</html>`;
}

export function createStudentLedgerHTMLBuffer(data: StudentLedgerHTMLData): Buffer {
  return Buffer.from(createStudentLedgerHTML(data), 'utf-8');
}

import { ExemptionReportRow } from './exemptionReport';

export interface ExemptionReportHTMLData {
  schoolName: string;
  currencySymbol: string;
  reportDate: Date;
  rows: ExemptionReportRow[];
  schoolLogo?: string | null;
  schoolEmail?: string | null;
  schoolPhone?: string | null;
  schoolAddress?: string | null;
  scopeSubtitle?: string;
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
  return `${sym}${Math.abs(n).toFixed(2)}`;
}

function dash(value: unknown): string {
  const s = String(value ?? '').trim();
  return s || '—';
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

function amountCellClass(amount: number): string {
  return Math.abs(Number(amount) || 0) <= 0.005 ? 'amount-zero' : 'amount-waived';
}

function buildTableRows(rows: ExemptionReportRow[], sym: string): string {
  if (!rows.length) {
    return `<tr><td colspan="6" class="empty-row">No students with active fee exemptions.</td></tr>`;
  }

  const sorted = [...rows].sort((a, b) => b.amountExempted - a.amountExempted);

  return sorted
    .map((row) => {
      const classLabel = dash(row.className);
      const classHtml =
        classLabel === '—'
          ? `<span class="muted-dash">—</span>`
          : `<span class="house-pill ${housePillClass(classLabel)}">${escapeHtml(classLabel)}</span>`;
      const amtClass = amountCellClass(row.amountExempted);

      return `
        <tr>
          <td class="mono id">${escapeHtml(row.studentNumber)}</td>
          <td>${escapeHtml(dash(row.lastName))}</td>
          <td>${escapeHtml(dash(row.firstName))}</td>
          <td>${escapeHtml(dash(row.gender))}</td>
          <td>${classHtml}</td>
          <td class="mono num ${amtClass}">${escapeHtml(money(sym, row.amountExempted))}</td>
        </tr>`;
    })
    .join('');
}

export function createExemptionReportHTML(data: ExemptionReportHTMLData): string {
  const sym = data.currencySymbol || '$';
  const rows = data.rows || [];
  const studentCount = rows.length;
  const totalExempted = parseFloat(rows.reduce((s, r) => s + (Number(r.amountExempted) || 0), 0).toFixed(2));
  const average = studentCount ? parseFloat((totalExempted / studentCount).toFixed(2)) : 0;
  const generatedLabel = data.reportDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const scopeSubtitle = data.scopeSubtitle || 'Active fee exemptions across all terms';

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
      ? '1 student was granted a fee exemption totalling'
      : `${studentCount} students were granted fee exemptions totalling`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Exemption Report — ${escapeHtml(data.schoolName)}</title>
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
      --green: #1f6b4f;
      --green-soft: #e8f5ef;
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
      background: var(--green-soft);
      border: 1px solid #c5e6d6;
      color: #145a42;
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
      color: var(--green);
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

    table.exemptions {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }

    .exemptions thead th {
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

    .exemptions tbody td {
      padding: 11px 14px;
      border-bottom: 1px solid #edf1f6;
      vertical-align: middle;
    }

    .exemptions tbody tr:nth-child(even) { background: #fbfcfe; }
    .exemptions tbody tr:last-child td { border-bottom: none; }

    .exemptions tfoot td {
      padding: 14px;
      background: #f3f6fa;
      border-top: 3px solid var(--navy-800);
      font-weight: 700;
      vertical-align: top;
    }

    .exemptions tfoot .total-note {
      display: block;
      font-size: 0.72rem;
      font-weight: 500;
      color: var(--muted);
      margin-top: 4px;
    }

    .mono { font-family: var(--mono); font-size: 0.82rem; }
    .num { text-align: right; white-space: nowrap; }
    .amount-waived { color: var(--green); font-weight: 700; }
    .amount-zero { color: #94a3b8; font-weight: 500; }
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
      .table-wrap { overflow-x: auto; }
      .exemptions { min-width: 640px; }
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
          <p class="eyebrow">Exemption Report</p>
          <h2 class="report-title">Fee Exemption Summary</h2>
          <p class="report-subtitle">${escapeHtml(scopeSubtitle)}</p>
          <p class="generated">Generated ${escapeHtml(generatedLabel)}</p>
        </div>
      </div>
    </header>

    <div class="body">
      <section class="status-banner" aria-label="Exemption summary">
        <p class="status-text">${escapeHtml(statusText)}</p>
        <p class="status-amount">${escapeHtml(money(sym, totalExempted))}</p>
      </section>

      <section class="summary-grid" aria-label="Summary figures">
        <article class="summary-card">
          <span class="label">Students Exempted</span>
          <span class="value">${studentCount}</span>
        </article>
        <article class="summary-card summary-card--avg">
          <span class="label">Average Exemption</span>
          <span class="value">${escapeHtml(money(sym, average))}</span>
        </article>
        <article class="summary-card summary-card--total">
          <span class="label">Total Exempted</span>
          <span class="value">${escapeHtml(money(sym, totalExempted))}</span>
        </article>
      </section>

      <h3 class="section-heading">Exempted Students</h3>
      <div class="table-wrap">
        <table class="exemptions">
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Last Name</th>
              <th>First Name</th>
              <th>Gender</th>
              <th>Class</th>
              <th class="num">Amount Exempted</th>
            </tr>
          </thead>
          <tbody>
            ${buildTableRows(rows, sym)}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5">
                <strong>Total exempted</strong>
                <span class="total-note">${studentCount} student${studentCount === 1 ? '' : 's'} listed</span>
              </td>
              <td class="mono num ${amountCellClass(totalExempted)}"><strong>${escapeHtml(money(sym, totalExempted))}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <footer class="footer">
        <p><strong>Currency note:</strong> All amounts are shown in ${escapeHtml(sym)} (United States Dollars) unless otherwise stated.</p>
        <p><strong>How exemptions are calculated:</strong> Amounts reflect the fee reduction applied to each student's latest invoice based on their exemption type (fixed amount, percentage, or staff-child policy). A figure of ${escapeHtml(money(sym, 0))} indicates an active exemption with no measurable waiver on the current invoice.</p>
        <p>To query an exemption, quote the student ID when contacting the finance office.</p>
        <p><strong>Finance office:</strong> ${contactLine}</p>
      </footer>
    </div>
  </article>
</body>
</html>`;
}

export function createExemptionReportHTMLBuffer(data: ExemptionReportHTMLData): Buffer {
  return Buffer.from(createExemptionReportHTML(data), 'utf-8');
}

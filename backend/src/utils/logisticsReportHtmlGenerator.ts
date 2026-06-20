export interface LogisticsReportRow {
  studentNumber: string;
  lastName: string;
  firstName: string;
  className: string;
  contact: string;
}

export interface LogisticsReportHTMLData {
  schoolName: string;
  schoolMotto?: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  schoolLogo?: string | null;
  reportTitle: string;
  serviceType: 'transport' | 'diningHall';
  reportDate: Date;
  classFilterLabel?: string | null;
  rows: LogisticsReportRow[];
  systemName?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Extract short grade label from full class/stream name (matches legacy PDF report). */
export function extractGradeLabel(name: string | undefined | null): string {
  const n = (name || '').trim();
  if (!n) return '';
  const hyphenIdx = n.indexOf('-');
  if (hyphenIdx > 0) {
    const beforeHyphen = n.slice(0, hyphenIdx).trim();
    if (beforeHyphen) return beforeHyphen;
  }
  const parts = n.split(/\s+/);
  if (parts[0]?.toLowerCase() === 'ecd' && parts[1]) return `ECD ${parts[1]}`;
  if (parts[0]?.toLowerCase() === 'stage' && parts[1]) return `Stage ${parts[1]}`;
  const gradeKeywords = ['grade', 'form', 'class', 'year', 'stage'];
  if (gradeKeywords.includes(parts[0]?.toLowerCase()) && parts[1]) {
    return `${parts[0][0].toUpperCase()}${parts[0].slice(1).toLowerCase()} ${parts[1]}`;
  }
  return parts[0] || n;
}

function safeJsonEmbed(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

export function createLogisticsReportHTML(data: LogisticsReportHTMLData): string {
  const generatedAt = data.reportDate.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const rawLogo = String(data.schoolLogo ?? '').trim();
  const logoHtml = rawLogo.startsWith('data:image')
    ? `<img src="${escapeHtml(rawLogo)}" alt="" class="crest" />`
    : `<div class="crest crest--placeholder" aria-hidden="true">${escapeHtml((data.schoolName || 'S').slice(0, 1))}</div>`;

  const mottoHtml = data.schoolMotto
    ? `<p class="school-motto">${escapeHtml(data.schoolMotto)}</p>`
    : '';
  const addressHtml = data.schoolAddress
    ? `<p class="school-address">${escapeHtml(data.schoolAddress)}</p>`
    : '';

  const serviceLabel = data.serviceType === 'transport' ? 'School Transport' : 'Dining Hall';
  const filterNote = data.classFilterLabel
    ? ` · Filter: ${escapeHtml(data.classFilterLabel)}`
    : '';

  const payload = {
    title: data.reportTitle,
    service: data.serviceType,
    serviceLabel,
    generatedAt,
    systemName: data.systemName || 'School Management System',
    filterNote: data.classFilterLabel || null,
    rows: data.rows,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(data.reportTitle)} — ${escapeHtml(data.schoolName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,500&family=IBM+Plex+Mono:wght@400;500&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --brand: #1F4B99;
      --brand-dark: #163a78;
      --brand-soft: #EAF1FB;
      --accent: #0E9B8A;
      --accent-soft: #E4F5F2;
      --ink: #1c2434;
      --muted: #64748B;
      --line: #E2E8F0;
      --paper: #F6F8FA;
      --surface: #ffffff;
      --missing-bg: #FEF3E2;
      --missing-text: #9A6700;
      --serif: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
      --sans: 'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif;
      --mono: 'IBM Plex Mono', Consolas, 'Courier New', monospace;
      --radius: 10px;
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

    body { padding: 20px 16px 48px; }

    .report {
      max-width: 960px;
      margin: 0 auto;
      background: var(--surface);
      border-radius: var(--radius);
      box-shadow: 0 8px 32px rgba(31, 75, 153, 0.08);
      overflow: hidden;
    }

    /* ── Letterhead ── */
    .letterhead {
      padding: 28px 32px 22px;
      border-bottom: 3px solid var(--brand);
      background: linear-gradient(180deg, #fff 0%, #fafbfd 100%);
    }

    .letterhead-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 20px;
      align-items: center;
    }

    .crest {
      width: 76px;
      height: 76px;
      object-fit: contain;
      border-radius: 50%;
      background: #fff;
      border: 2px solid var(--line);
      padding: 6px;
      box-shadow: 0 2px 12px rgba(31, 75, 153, 0.12);
    }

    .crest--placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--serif);
      font-size: 2rem;
      font-weight: 700;
      color: var(--brand);
    }

    .school-name {
      margin: 0 0 4px;
      font-family: var(--serif);
      font-size: 1.85rem;
      font-weight: 700;
      color: var(--ink);
      line-height: 1.15;
    }

    .school-motto {
      margin: 0 0 6px;
      font-family: var(--serif);
      font-style: italic;
      font-size: 1.05rem;
      color: var(--muted);
    }

    .school-address {
      margin: 0;
      font-size: 0.88rem;
      color: var(--muted);
    }

    /* ── Toolbar ── */
    .toolbar {
      padding: 18px 32px;
      background: var(--brand-soft);
      border-bottom: 1px solid var(--line);
      display: flex;
      flex-wrap: wrap;
      gap: 12px 16px;
      align-items: center;
      justify-content: space-between;
    }

    .toolbar-title-block { flex: 1 1 220px; min-width: 0; }

    .report-title {
      margin: 0 0 4px;
      font-family: var(--serif);
      font-size: 1.45rem;
      font-weight: 700;
      color: var(--brand);
      line-height: 1.2;
    }

    .generated-meta {
      margin: 0;
      font-size: 0.78rem;
      color: var(--muted);
      letter-spacing: 0.02em;
    }

    .toolbar-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .search-wrap { position: relative; }

    .search-input {
      width: 220px;
      max-width: 100%;
      padding: 8px 12px 8px 34px;
      border: 1px solid var(--line);
      border-radius: 8px;
      font-family: var(--sans);
      font-size: 0.88rem;
      background: #fff;
      color: var(--ink);
    }

    .search-input:focus {
      outline: 2px solid var(--brand);
      outline-offset: 1px;
      border-color: var(--brand);
    }

    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--muted);
      font-size: 0.85rem;
      pointer-events: none;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 8px;
      font-family: var(--sans);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background 0.15s, border-color 0.15s;
    }

    .btn--ghost {
      background: #fff;
      border-color: var(--line);
      color: var(--ink);
    }

    .btn--ghost:hover { background: var(--paper); border-color: var(--brand); color: var(--brand); }

    .btn--primary {
      background: var(--brand);
      color: #fff;
      border-color: var(--brand-dark);
    }

    .btn--primary:hover { background: var(--brand-dark); }

    /* ── Summary cards ── */
    .body { padding: 22px 32px 32px; }

    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 22px;
    }

    @media (max-width: 860px) {
      .stats { grid-template-columns: repeat(2, 1fr); }
    }

    .stat-card {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 14px 16px 14px 18px;
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
      background: var(--brand);
    }

    .stat-card:nth-child(2)::before { background: var(--accent); }
    .stat-card:nth-child(3)::before { background: #C9A227; }
    .stat-card:nth-child(4)::before { background: #6B3FB8; }

    .stat-label {
      margin: 0 0 6px;
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .stat-value {
      margin: 0;
      font-size: 1.65rem;
      font-weight: 700;
      color: var(--ink);
      line-height: 1.1;
    }

    .stat-sub {
      margin: 4px 0 0;
      font-size: 0.75rem;
      color: var(--muted);
    }

    /* ── Table (desktop) ── */
    .table-wrap {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      overflow: hidden;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }

    .data-table thead {
      position: sticky;
      top: 0;
      z-index: 2;
    }

    .data-table th {
      background: var(--brand);
      color: #fff;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      text-align: left;
      padding: 11px 12px;
      border-bottom: 2px solid var(--brand-dark);
    }

    .data-table th.col-num { width: 44px; text-align: center; }
    .data-table th.col-id { width: 120px; }

    .data-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      vertical-align: middle;
    }

    .data-table tbody tr:nth-child(even) { background: var(--paper); }
    .data-table tbody tr:hover { background: var(--brand-soft); }

    .col-num { text-align: center; color: var(--muted); font-size: 0.82rem; }

    .student-cell {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .avatar {
      flex-shrink: 0;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: var(--brand-soft);
      color: var(--brand);
      font-size: 0.72rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      letter-spacing: -0.02em;
    }

    .student-names .name-line {
      font-weight: 600;
      color: var(--ink);
      line-height: 1.25;
    }

    .student-names .name-sub {
      font-size: 0.78rem;
      color: var(--muted);
    }

    .mono {
      font-family: var(--mono);
      font-size: 0.82rem;
      letter-spacing: -0.01em;
    }

    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .badge--class {
      background: var(--brand-soft);
      color: var(--brand);
    }

    .badge--missing {
      background: var(--missing-bg);
      color: var(--missing-text);
    }

    .badge--service {
      background: var(--accent-soft);
      color: var(--accent);
    }

    a.tel-link {
      color: var(--brand);
      text-decoration: none;
      font-weight: 500;
    }

    a.tel-link:hover { text-decoration: underline; }

    .empty-state {
      padding: 40px 20px;
      text-align: center;
      color: var(--muted);
      font-size: 0.95rem;
    }

    /* ── Mobile cards ── */
    .card-list { display: none; }

    @media (max-width: 720px) {
      .table-wrap { display: none; }
      .card-list { display: flex; flex-direction: column; gap: 10px; }

      .toolbar { padding: 16px 18px; }
      .body { padding: 16px 18px 28px; }
      .letterhead { padding: 20px 18px 18px; }
      .search-input { width: 100%; }

      .student-card {
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 14px 16px;
        background: #fff;
      }

      .student-card:nth-child(even) { background: var(--paper); }

      .student-card-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 10px;
      }

      .student-card-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 4px 0;
        font-size: 0.85rem;
      }

      .student-card-row .label {
        color: var(--muted);
        font-size: 0.72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
    }

    /* ── Footer ── */
    .report-footer {
      padding: 14px 32px;
      border-top: 1px solid var(--line);
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: space-between;
      font-size: 0.75rem;
      color: var(--muted);
      background: var(--paper);
    }

    .report-footer .confidential { font-style: italic; }

    /* ── Print ── */
    @media print {
      body { padding: 0; background: #fff; }
      .report { box-shadow: none; border-radius: 0; max-width: none; }
      .no-print { display: none !important; }
      .toolbar-actions .search-wrap,
      .toolbar-actions .btn { display: none !important; }
      .toolbar { background: #fff; border-bottom: 2px solid var(--brand); padding: 12px 24px; }
      .letterhead { padding: 16px 24px; }
      .body { padding: 16px 24px 24px; }
      .data-table thead { position: static; }
      .data-table tbody tr:hover { background: inherit; }
      .stats { break-inside: avoid; }
      .table-wrap { break-inside: auto; }
      .data-table { font-size: 0.8rem; }
      .data-table th { background: var(--brand) !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .report-footer { padding: 10px 24px; }
      @page { margin: 14mm 12mm; size: A4; }
    }
  </style>
</head>
<body>
  <div class="report">
    <header class="letterhead">
      <div class="letterhead-grid">
        ${logoHtml}
        <div>
          <h1 class="school-name">${escapeHtml(data.schoolName)}</h1>
          ${mottoHtml}
          ${addressHtml}
        </div>
      </div>
    </header>

    <div class="toolbar">
      <div class="toolbar-title-block">
        <h2 class="report-title">${escapeHtml(data.reportTitle)}</h2>
        <p class="generated-meta">Generated on <span id="meta-generated">${escapeHtml(generatedAt)}</span><span id="meta-filter">${filterNote}</span></p>
      </div>
      <div class="toolbar-actions no-print">
        <div class="search-wrap">
          <span class="search-icon" aria-hidden="true">⌕</span>
          <input type="search" id="search" class="search-input" placeholder="Search students…" autocomplete="off" />
        </div>
        <button type="button" class="btn btn--ghost" id="btn-export">Export CSV</button>
        <button type="button" class="btn btn--primary" id="btn-print">Print</button>
      </div>
    </div>

    <main class="body">
      <div class="stats" id="stats"></div>

      <div class="table-wrap">
        <table class="data-table" id="data-table">
          <thead>
            <tr>
              <th class="col-num">#</th>
              <th class="col-id">Student No</th>
              <th>Student</th>
              <th>Class</th>
              <th>Guardian Contact</th>
            </tr>
          </thead>
          <tbody id="table-body"></tbody>
        </table>
      </div>

      <div class="card-list" id="card-list"></div>
      <div class="empty-state" id="empty-state" hidden>No students match your search.</div>
    </main>

    <footer class="report-footer">
      <span class="confidential">Confidential — for internal school use only</span>
      <span id="footer-system">Generated via ${escapeHtml(data.systemName || 'School Management System')}</span>
      <span id="page-count"></span>
    </footer>
  </div>

  <script type="application/json" id="report-data">${safeJsonEmbed(payload)}</script>
  <script>
(function () {
  var DATA = JSON.parse(document.getElementById('report-data').textContent);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function initials(first, last) {
    var f = String(first || '').trim();
    var l = String(last || '').trim();
    var a = (f.charAt(0) + l.charAt(0)).toUpperCase();
    return a || '?';
  }

  function isMissingClass(c) {
    var s = String(c || '').trim();
    return !s || s === '-' || s === '—';
  }

  function isMissingContact(c) {
    return !String(c || '').trim();
  }

  function computeStats(rows) {
    var missingClass = 0;
    var missingContact = 0;
    var classes = {};
    rows.forEach(function (r) {
      if (isMissingClass(r.className)) missingClass++;
      if (isMissingContact(r.contact)) missingContact++;
      if (!isMissingClass(r.className)) classes[r.className] = true;
    });
    return {
      total: rows.length,
      missingClass: missingClass,
      missingContact: missingContact,
      classCount: Object.keys(classes).length
    };
  }

  function filterRows(query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return DATA.rows.slice();
    return DATA.rows.filter(function (r) {
      var hay = [
        r.studentNumber, r.lastName, r.firstName, r.className, r.contact
      ].join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function classBadge(cls) {
    if (isMissingClass(cls)) {
      return '<span class="badge badge--missing">Unassigned</span>';
    }
    return '<span class="badge badge--class">' + esc(cls) + '</span>';
  }

  function contactCell(contact) {
    var c = String(contact || '').trim();
    if (!c) return '<span class="badge badge--missing">No contact</span>';
    var tel = c.replace(/[^+\\d]/g, '');
    if (tel) {
      return '<a class="tel-link mono" href="tel:' + esc(tel) + '">' + esc(c) + '</a>';
    }
    return '<span class="mono">' + esc(c) + '</span>';
  }

  function renderStats(stats) {
    document.getElementById('stats').innerHTML =
      '<div class="stat-card"><p class="stat-label">Total Students</p><p class="stat-value">' + stats.total + '</p><p class="stat-sub">' + esc(DATA.serviceLabel) + '</p></div>' +
      '<div class="stat-card"><p class="stat-label">Classes</p><p class="stat-value">' + stats.classCount + '</p><p class="stat-sub">Distinct grades</p></div>' +
      '<div class="stat-card"><p class="stat-label">Missing Class</p><p class="stat-value">' + stats.missingClass + '</p><p class="stat-sub">Unassigned grade</p></div>' +
      '<div class="stat-card"><p class="stat-label">Missing Contact</p><p class="stat-value">' + stats.missingContact + '</p><p class="stat-sub">No guardian phone</p></div>';
  }

  function renderTable(rows) {
    var tbody = document.getElementById('table-body');
    if (!rows.length) {
      tbody.innerHTML = '';
      return;
    }
    tbody.innerHTML = rows.map(function (r, i) {
      return '<tr>' +
        '<td class="col-num">' + (i + 1) + '</td>' +
        '<td class="mono">' + esc(r.studentNumber || '—') + '</td>' +
        '<td><div class="student-cell">' +
          '<div class="avatar" aria-hidden="true">' + esc(initials(r.firstName, r.lastName)) + '</div>' +
          '<div class="student-names">' +
            '<div class="name-line">' + esc(r.firstName || '—') + ' ' + esc(r.lastName || '') + '</div>' +
            '<div class="name-sub"><span class="badge badge--service">' + esc(DATA.serviceLabel) + '</span></div>' +
          '</div></div></td>' +
        '<td>' + classBadge(r.className) + '</td>' +
        '<td>' + contactCell(r.contact) + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderCards(rows) {
    var list = document.getElementById('card-list');
    if (!rows.length) { list.innerHTML = ''; return; }
    list.innerHTML = rows.map(function (r, i) {
      return '<article class="student-card">' +
        '<div class="student-card-header">' +
          '<div class="avatar">' + esc(initials(r.firstName, r.lastName)) + '</div>' +
          '<div><strong>' + esc(r.firstName) + ' ' + esc(r.lastName) + '</strong><br>' +
          '<span class="mono">' + esc(r.studentNumber) + '</span></div>' +
        '</div>' +
        '<div class="student-card-row"><span class="label">Class</span>' + classBadge(r.className) + '</div>' +
        '<div class="student-card-row"><span class="label">Contact</span>' + contactCell(r.contact) + '</div>' +
      '</article>';
    }).join('');
  }

  function render() {
    var q = document.getElementById('search').value;
    var rows = filterRows(q);
    var stats = computeStats(DATA.rows);
    renderStats(stats);
    renderTable(rows);
    renderCards(rows);
    document.getElementById('empty-state').hidden = rows.length > 0;
  }

  function exportCsv() {
    var rows = filterRows(document.getElementById('search').value);
    var header = ['#', 'Student No', 'Last Name', 'First Name', 'Class', 'Contact'];
    var lines = [header.join(',')];
    rows.forEach(function (r, i) {
      lines.push([
        i + 1,
        r.studentNumber || '',
        r.lastName || '',
        r.firstName || '',
        r.className || '',
        r.contact || ''
      ].map(function (v) {
        var s = String(v);
        return /[",\\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(','));
    });
    var blob = new Blob([lines.join('\\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (DATA.title || 'report').replace(/\\s+/g, '_') + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  document.getElementById('search').addEventListener('input', render);
  document.getElementById('btn-export').addEventListener('click', exportCsv);
  document.getElementById('btn-print').addEventListener('click', function () { window.print(); });

  render();
})();
  </script>
</body>
</html>`;
}

export function createLogisticsReportHTMLBuffer(data: LogisticsReportHTMLData): Buffer {
  return Buffer.from(createLogisticsReportHTML(data), 'utf-8');
}

import { Settings } from '../entities/Settings';
import {
  formatMarkSheetAverage,
  isCoreSubjectName,
} from './markSheetSubjectOrder';

export interface MarkSheetHTMLRow {
  studentId: string;
  studentNumber: string;
  studentName: string;
  position: number;
  subjects: Record<
    string,
    {
      subjectName: string;
      score: number;
      maxScore: number;
      percentage: number;
    }
  >;
  totalScore: number;
  totalMaxScore: number;
  average: number;
  includeInClassPassRate?: boolean;
}

export interface MarkSheetHTMLData {
  class: {
    id: string;
    name: string;
    form: string;
    classTeacherName?: string | null;
  };
  examType: string;
  subjects: Array<{ id: string; name: string }>;
  exams: Array<{ id: string; name: string; examDate: Date; term: string | null }>;
  markSheet: MarkSheetHTMLRow[];
  generatedAt: Date;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeLogo(raw: unknown): string | null {
  let v = String(raw ?? '').trim();
  if (!v) return null;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  if (v.startsWith('data:image')) {
    const commaIndex = v.indexOf(',');
    if (commaIndex > -1) {
      return `${v.slice(0, commaIndex + 1)}${v.slice(commaIndex + 1).replace(/\s/g, '')}`;
    }
    return v;
  }
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[A-Za-z0-9+/=\s]+$/.test(v) && v.length > 64) {
    return `data:image/png;base64,${v.replace(/\s/g, '')}`;
  }
  return v;
}

function formatExamType(raw: string): string {
  return String(raw || '')
    .replace(/_/g, ' ')
    .trim()
    .toUpperCase();
}

function rankClass(position: number): string {
  if (position === 1) return 'rank rank--gold';
  if (position === 2) return 'rank rank--silver';
  if (position === 3) return 'rank rank--bronze';
  return 'rank rank--default';
}

function averageBarClass(average: number): string {
  if (average >= 85) return 'avg-fill avg-fill--high';
  if (average >= 70) return 'avg-fill avg-fill--mid';
  return 'avg-fill avg-fill--low';
}

function buildLogoHtml(logo: string | null, schoolName: string): string {
  if (logo) {
    return `<img src="${escapeHtml(logo)}" alt="" class="logo-badge logo-badge--img" />`;
  }
  const initials = schoolName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'S';
  return `<div class="logo-badge logo-badge--text" aria-hidden="true">${escapeHtml(initials)}</div>`;
}

export interface MarkSheetHTMLOptions {
  /** Absolute frontend URL for the Dashboard link (blob previews need an absolute URL). */
  dashboardUrl?: string;
}

export function createMarkSheetHTML(
  data: MarkSheetHTMLData,
  settings: Settings | null,
  options?: MarkSheetHTMLOptions
): string {
  const schoolName = String(settings?.schoolName || 'School').trim() || 'School';
  const logo = normalizeLogo(settings?.schoolLogo);
  const classLabel = `${data.class.name}${data.class.form ? ` (${data.class.form})` : ''}`;
  const examLabel = formatExamType(data.examType);
  const teacherName = String(data.class.classTeacherName || 'Not assigned').trim() || 'Not assigned';
  const generated = new Date(data.generatedAt);
  const generatedDate = generated.toLocaleDateString('en-GB');
  const generatedTime = generated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const passRateRows = data.markSheet.filter((r) => r.includeInClassPassRate !== false);
  const passCount = passRateRows.filter((r) => r.average >= 70).length;
  const passRate = passRateRows.length > 0 ? Math.round((passCount / passRateRows.length) * 100) : 0;

  const studentCount = data.markSheet.length;
  const classAverage =
    studentCount > 0
      ? Number((data.markSheet.reduce((s, r) => s + r.average, 0) / studentCount).toFixed(2))
      : 0;

  const topStudent = data.markSheet.length
    ? [...data.markSheet].sort((a, b) => b.average - a.average)[0]
    : null;

  const excludedSubjects = data.subjects.filter((s) => !isCoreSubjectName(s.name));
  const coreNames = data.subjects.filter((s) => isCoreSubjectName(s.name)).map((s) => s.name);
  const footnote =
    excludedSubjects.length > 0
      ? `* Total and Average are calculated from ${coreNames.join(', ')} only. ${excludedSubjects.map((s) => s.name).join(', ')} ${excludedSubjects.length === 1 ? 'is' : 'are'} shown for reference but excluded from totals.`
      : '';

  const subjectCount = data.subjects.length;
  const tableRows = data.markSheet
    .map((row, index) => {
      const subjectCells = data.subjects
        .map((subject) => {
          const cell = row.subjects[subject.id];
          if (!cell) {
            return `<td class="col-mark"><span class="muted">—</span></td>`;
          }
          const score = Math.round(Number(cell.score) || 0);
          return `<td class="col-mark">${escapeHtml(String(score))}</td>`;
        })
        .join('');

      const avg = Number(row.average) || 0;
      const avgPct = Math.min(100, Math.max(0, avg));

      return `
        <tr class="${index % 2 === 1 ? 'row-alt' : ''}">
          <td class="col-pos"><span class="${rankClass(row.position)}">${row.position}</span></td>
          <td class="col-id">${escapeHtml(row.studentNumber)}</td>
          <td class="col-name">${escapeHtml(row.studentName)}</td>
          ${subjectCells}
          <td class="col-total"><strong>${row.totalScore}/${row.totalMaxScore}</strong></td>
          <td class="col-avg">
            <div class="avg-cell">
              <div class="avg-bar" aria-hidden="true"><span class="${averageBarClass(avg)}" style="width:${avgPct}%"></span></div>
              <span class="avg-text">${escapeHtml(formatMarkSheetAverage(avg))}</span>
            </div>
          </td>
        </tr>`;
    })
    .join('');

  const subjectHeaderCells = data.subjects
    .map((s) => `<th class="col-mark">${escapeHtml(s.name)}</th>`)
    .join('');

  const logoHtml = buildLogoHtml(logo, schoolName);
  const downloadFileName = `mark-sheet-${String(data.class.name || 'class').replace(/\s+/g, '-')}-${String(data.examType || 'exam').replace(/_/g, '-')}-${generated.toISOString().split('T')[0]}.pdf`;
  const dashboardUrl = String(options?.dashboardUrl || '/dashboard').trim() || '/dashboard';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Mark Sheet — ${escapeHtml(classLabel)}</title>
  <style>
    :root {
      --navy: #1c3a78;
      --navy-dark: #142952;
      --gold: #e8b923;
      --gold-soft: #fef9e7;
      --ink: #111827;
      --muted: #6b7280;
      --line: #94a3b8;
      --line-soft: #cbd5e1;
      --row-alt: #f1f5f9;
      --paper: #f3f4f6;
      --score: #000;
      --present: #059669;
      --mid: #2563eb;
      --low: #d97706;
    }

    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body { padding: 18px; }

    .report {
      max-width: 1100px;
      margin: 0 auto;
      background: #fff;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 6px 28px rgba(28, 58, 120, 0.1);
    }

    /* Banner */
    .banner {
      background: linear-gradient(135deg, var(--navy) 0%, var(--navy-dark) 100%);
      padding: 20px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }

    .banner-left {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }

    .logo-badge {
      flex-shrink: 0;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      border: 3px solid var(--gold);
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 10px rgba(0,0,0,0.15);
    }

    .logo-badge--img {
      object-fit: contain;
      padding: 4px;
    }

    .logo-badge--text {
      font-weight: 700;
      font-size: 0.8rem;
      color: var(--navy);
    }

    .banner-school {
      margin: 0 0 4px;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(232, 185, 35, 0.95);
    }

    .banner-title {
      margin: 0;
      font-size: 1.45rem;
      font-weight: 700;
      color: #fff;
      line-height: 1.15;
    }

    .exam-pill {
      flex-shrink: 0;
      padding: 8px 16px;
      border-radius: 999px;
      background: var(--gold);
      color: var(--navy-dark);
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .banner-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .btn-download-pdf {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border: none;
      border-radius: 999px;
      background: var(--gold);
      color: #000;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      white-space: nowrap;
      text-decoration: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
      transition: filter 0.15s ease, transform 0.15s ease;
      font-family: inherit;
      line-height: 1;
    }

    a.btn-download-pdf:visited {
      color: #000;
    }

    .btn-download-pdf:hover {
      filter: brightness(1.06);
      transform: translateY(-1px);
    }

    .btn-download-pdf:active {
      transform: translateY(0);
    }

    .btn-download-pdf:disabled {
      opacity: 0.7;
      cursor: wait;
      transform: none;
    }

    .btn-download-pdf svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    /* Meta */
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 22px;
      padding: 12px 24px;
      background: #fafbfc;
      border-bottom: 1px solid var(--line);
      font-size: 0.98rem;
    }

    .meta-row span { color: var(--muted); }
    .meta-row strong { color: var(--ink); margin-left: 4px; }

    /* Summary */
    .summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      padding: 18px 24px;
    }

    .card {
      border-radius: 12px;
      padding: 14px 16px;
      position: relative;
      background: #fff;
      border: 1px solid #cbd5e1;
      color: #000;
    }

    .card__label {
      margin: 0 0 6px;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #000;
    }

    .card__value {
      margin: 0;
      font-size: 1.85rem;
      font-weight: 700;
      line-height: 1.1;
      color: #000;
    }

    .card__sub {
      margin: 5px 0 0;
      font-size: 0.72rem;
      color: #000;
    }

    .card__icon {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--gold-soft);
      border: 1px solid rgba(232, 185, 35, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.85rem;
    }

    /* Table — solid grid lines, flush with outer frame (no double right edge) */
    .table-section { padding: 0 24px 18px; }

    .table-wrap {
      border: 1.5px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
      background: #fff;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      border-spacing: 0;
      table-layout: auto;
    }

    thead th {
      background: var(--navy);
      color: #fff !important;
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 9px 6px;
      text-align: center;
      border: 1.5px solid var(--navy-dark);
    }

    thead .group-row > th:first-child,
    tbody > tr > td:first-child {
      border-left: none;
    }

    thead .group-row > th:last-child,
    tbody > tr > td:last-child {
      border-right: none;
    }

    thead .group-row > th {
      border-top: none;
      padding: 10px 8px;
      font-size: 0.78rem;
    }

    thead .subject-row th {
      background: #234585;
      color: #fff !important;
      font-size: 0.74rem;
      font-weight: 700;
      padding: 9px 6px;
      border-color: #1a3468;
    }

    thead th.col-mark {
      color: #fff !important;
      font-weight: 700;
    }

    th.col-pos, th.col-id, th.col-name, th.col-total, th.col-avg {
      text-align: left;
      color: #fff !important;
      font-weight: 700;
    }
    th.col-pos { width: 44px; text-align: center; }
    th.col-id { width: 88px; }
    th.col-name { min-width: 140px; text-align: left; }
    th.col-total { width: 72px; text-align: center; }
    th.col-avg { width: 110px; }

    tbody td {
      padding: 7px 6px;
      border: 1.5px solid var(--line);
      vertical-align: middle;
      background: #fff;
      font-size: 0.92rem;
    }

    tbody tr.row-alt td {
      background: var(--row-alt);
    }

    tbody tr:last-child > td {
      border-bottom: none;
    }

    tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    tbody td.col-pos { text-align: center; }
    tbody td.col-id { color: #000; font-size: 0.88rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    tbody td.col-name { font-weight: 700; color: #000; font-size: 0.92rem; }
    tbody td.col-mark { text-align: center; font-weight: 700; color: #000; font-size: 0.95rem; font-variant-numeric: tabular-nums; }
    tbody td.col-total { text-align: center; font-variant-numeric: tabular-nums; font-weight: 700; color: #000; }
    tbody td.col-avg { text-align: center; }

    .rank {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      font-size: 0.75rem;
      font-weight: 700;
      color: #fff;
    }

    .rank--gold { background: linear-gradient(135deg, #f59e0b, #d97706); }
    .rank--silver { background: linear-gradient(135deg, #9ca3af, #6b7280); }
    .rank--bronze { background: linear-gradient(135deg, #d97706, #92400e); }
    .rank--default { background: #cbd5e1; color: #475569; }

    .avg-cell {
      display: flex;
      align-items: center;
      gap: 6px;
      justify-content: center;
    }

    .avg-bar {
      display: none;
    }

    .avg-text {
      font-size: 0.92rem;
      font-weight: 700;
      min-width: 42px;
      text-align: center;
      color: #000;
      font-variant-numeric: tabular-nums;
    }

    .muted { color: var(--muted); }

    .footnote {
      margin: 10px 0 0;
      font-size: 0.75rem;
      font-style: italic;
      color: var(--muted);
    }

    /* Footer */
    .report-footer {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 24px 16px;
      border-top: 1px solid var(--line);
      font-size: 0.72rem;
      color: var(--muted);
    }

    /* Crisp export / print — avoid clipped rows and blurry canvas artifacts */
    body.pdf-exporting {
      background: #fff !important;
      padding: 0 !important;
    }

    body.pdf-exporting .report {
      max-width: none !important;
      width: 100% !important;
      margin: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      overflow: visible !important;
    }

    body.pdf-exporting .table-wrap {
      overflow: visible !important;
      border-radius: 0 !important;
    }

    body.pdf-exporting .banner,
    body.pdf-exporting .summary,
    body.pdf-exporting .meta-row,
    body.pdf-exporting .card,
    body.pdf-exporting tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    @media print {
      body { padding: 0; background: #fff; }
      .report { box-shadow: none; border-radius: 0; max-width: none; }
      .no-print { display: none !important; }
      thead { display: table-header-group; }
      thead th {
        background: var(--navy) !important;
        color: #fff !important;
        border-color: var(--navy-dark) !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      thead .subject-row th { background: #234585 !important; color: #fff !important; border-color: #1a3468 !important; }
      tbody td {
        border: 1.5px solid #64748b !important;
        color: #000 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      tbody td.col-mark,
      tbody td.col-total,
      tbody td.col-name,
      tbody td.col-id,
      .avg-text {
        color: #000 !important;
      }
      tbody tr.row-alt td {
        background: #e2e8f0 !important;
      }
      .table-wrap {
        border: 1.5px solid #64748b !important;
        overflow: visible !important;
        border-radius: 0 !important;
      }
      thead .group-row > th:first-child,
      tbody > tr > td:first-child { border-left: none !important; }
      thead .group-row > th:last-child,
      tbody > tr > td:last-child { border-right: none !important; }
      thead .group-row > th { border-top: none !important; }
      tbody tr:last-child > td { border-bottom: none !important; }
      tbody tr,
      .card,
      .banner,
      .meta-row,
      .summary {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .report-footer {
        position: running(footer);
        position: static;
        background: #fff;
        padding: 8px 0 0;
        margin-top: 10px;
      }
      .table-section { padding-bottom: 12px; }
      .avg-bar { display: none !important; }
      @page { size: A4 landscape; margin: 8mm; }
    }
  </style>
</head>
<body>
  <article class="report">
    <header class="banner">
      <div class="banner-left">
        ${logoHtml}
        <div>
          <p class="banner-school">${escapeHtml(schoolName)}</p>
          <h1 class="banner-title">Mark Sheet</h1>
        </div>
      </div>
      <div class="banner-actions">
        <a
          id="btn-dashboard"
          class="btn-download-pdf btn-dashboard no-print"
          href="${escapeHtml(dashboardUrl)}"
          title="Go to Dashboard">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M4 13h7V4H4v9zm0 7h7v-5H4v5zm9 0h7V11h-7v9zm0-16v5h7V4h-7z" fill="currentColor"/>
          </svg>
          <span>Dashboard</span>
        </a>
        <button type="button" id="btn-download-pdf" class="btn-download-pdf no-print" title="Download mark sheet as PDF">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M4 19h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
          </svg>
          <span>Download</span>
        </button>
        <div class="exam-pill">${escapeHtml(examLabel)}</div>
      </div>
    </header>

    <div class="meta-row">
      <div><span>Class:</span><strong>${escapeHtml(classLabel)}</strong></div>
      <div><span>Exam Type:</span><strong>${escapeHtml(examLabel)}</strong></div>
      <div><span>Class Teacher:</span><strong>${escapeHtml(teacherName)}</strong></div>
      <div><span>Generated:</span><strong>${escapeHtml(generatedDate)} ${escapeHtml(generatedTime)}</strong></div>
    </div>

    <section class="summary">
      <article class="card">
        <p class="card__label">Pass Rate</p>
        <p class="card__value">${passRate}%</p>
        <p class="card__sub">Students scoring 70% and above</p>
      </article>
      <article class="card">
        <span class="card__icon" aria-hidden="true">👥</span>
        <p class="card__label">Students</p>
        <p class="card__value">${studentCount}</p>
        <p class="card__sub">Enrolled in this class</p>
      </article>
      <article class="card">
        <p class="card__label">Class Average</p>
        <p class="card__value">${escapeHtml(formatMarkSheetAverage(classAverage))}</p>
        <p class="card__sub">Mean of all student averages</p>
      </article>
      <article class="card">
        <p class="card__label">Top Score</p>
        <p class="card__value">${topStudent ? escapeHtml(formatMarkSheetAverage(topStudent.average)) : '—'}</p>
        <p class="card__sub">${topStudent ? escapeHtml(topStudent.studentName) : 'No data'}</p>
      </article>
    </section>

    <section class="table-section">
      <div class="table-wrap">
        <table>
          <thead>
            <tr class="group-row">
              <th rowspan="2" class="col-pos">Pos</th>
              <th rowspan="2" class="col-id">Student No.</th>
              <th rowspan="2" class="col-name">Student Name</th>
              <th colspan="${subjectCount}">Subjects</th>
              <th rowspan="2" class="col-total">Total</th>
              <th rowspan="2" class="col-avg">Average</th>
            </tr>
            <tr class="subject-row">
              ${subjectHeaderCells}
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
      ${footnote ? `<p class="footnote">${escapeHtml(footnote)}</p>` : ''}
    </section>

    <footer class="report-footer">
      <span>${escapeHtml(schoolName)} · ${escapeHtml(classLabel)} · ${escapeHtml(examLabel)}</span>
      <span>Page <span class="page-num"></span></span>
    </footer>
  </article>
  <script>
    (function () {
      var PDF_FILENAME = ${JSON.stringify(downloadFileName)};
      var DASHBOARD_URL = ${JSON.stringify(dashboardUrl)};

      if (typeof window !== 'undefined') {
        var style = document.createElement('style');
        style.textContent = '@media print { .page-num::after { content: counter(page); } }';
        document.head.appendChild(style);
      }

      var dashboardBtn = document.getElementById('btn-dashboard');
      if (dashboardBtn) {
        dashboardBtn.addEventListener('click', function (e) {
          e.preventDefault();
          var target = DASHBOARD_URL || '/dashboard';
          try {
            if (window.opener && !window.opener.closed) {
              window.opener.location.href = target;
              window.close();
              return;
            }
          } catch (err) { /* cross-origin opener — fall through */ }
          window.location.href = target;
        });
      }

      function loadHtml2Pdf(callback) {
        if (typeof html2pdf !== 'undefined') {
          callback(null);
          return;
        }
        var script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        script.onload = function () { callback(null); };
        script.onerror = function () { callback(new Error('Failed to load PDF library')); };
        document.head.appendChild(script);
      }

      function downloadAsPdf() {
        var btn = document.getElementById('btn-download-pdf');
        var report = document.querySelector('.report');
        if (!report) return;

        if (btn) {
          btn.disabled = true;
          btn.setAttribute('aria-busy', 'true');
        }

        var hidden = [];
        document.querySelectorAll('.no-print').forEach(function (el) {
          hidden.push({ el: el, display: el.style.display });
          el.style.display = 'none';
        });

        document.body.classList.add('pdf-exporting');

        function restoreHidden() {
          document.body.classList.remove('pdf-exporting');
          hidden.forEach(function (item) {
            item.el.style.display = item.display;
          });
          if (btn) {
            btn.disabled = false;
            btn.removeAttribute('aria-busy');
          }
        }

        function finishWithPrint() {
          restoreHidden();
          window.print();
        }

        loadHtml2Pdf(function (err) {
          if (err || typeof html2canvas === 'undefined') {
            finishWithPrint();
            return;
          }

          var JsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
          if (!JsPDF) {
            // Fallback to html2pdf helper if jsPDF global is unavailable
            if (typeof html2pdf !== 'undefined') {
              html2pdf()
                .set({
                  margin: [6, 6, 6, 6],
                  filename: PDF_FILENAME,
                  image: { type: 'jpeg', quality: 0.95 },
                  html2canvas: {
                    scale: 3,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff',
                    scrollX: 0,
                    scrollY: 0,
                    windowWidth: report.scrollWidth,
                    windowHeight: report.scrollHeight
                  },
                  jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape', compress: true },
                  pagebreak: { mode: ['css'], avoid: ['tr', 'thead', '.card', '.banner', '.meta-row', '.summary'] }
                })
                .from(report)
                .save()
                .then(restoreHidden)
                .catch(finishWithPrint);
              return;
            }
            finishWithPrint();
            return;
          }

          // High-resolution canvas → clean page slices (avoids white mid-row tears)
          html2canvas(report, {
            scale: 3,
            useCORS: true,
            allowTaint: true,
            logging: false,
            backgroundColor: '#ffffff',
            scrollX: 0,
            scrollY: 0,
            windowWidth: Math.max(report.scrollWidth, report.offsetWidth),
            windowHeight: Math.max(report.scrollHeight, report.offsetHeight)
          }).then(function (canvas) {
            var imgData = canvas.toDataURL('image/jpeg', 0.95);
            var pdf = new JsPDF({
              orientation: 'landscape',
              unit: 'mm',
              format: 'a4',
              compress: true
            });
            var pageW = pdf.internal.pageSize.getWidth();
            var pageH = pdf.internal.pageSize.getHeight();
            var margin = 5;
            var usableW = pageW - margin * 2;
            var usableH = pageH - margin * 2;
            var imgW = usableW;
            var imgH = (canvas.height * imgW) / canvas.width;

            var y = margin;
            pdf.addImage(imgData, 'JPEG', margin, y, imgW, imgH, undefined, 'FAST');

            var heightLeft = imgH - usableH;
            while (heightLeft > 1) {
              y = margin - (imgH - heightLeft);
              pdf.addPage();
              pdf.addImage(imgData, 'JPEG', margin, y, imgW, imgH, undefined, 'FAST');
              heightLeft -= usableH;
            }

            pdf.save(PDF_FILENAME);
            restoreHidden();
          }).catch(function () {
            finishWithPrint();
          });
        });
      }

      var downloadBtn = document.getElementById('btn-download-pdf');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadAsPdf);
      }
    })();
  </script>
</body>
</html>`;
}

export function createMarkSheetHTMLBuffer(
  data: MarkSheetHTMLData,
  settings: Settings | null,
  options?: MarkSheetHTMLOptions
): Buffer {
  return Buffer.from(createMarkSheetHTML(data, settings, options), 'utf-8');
}

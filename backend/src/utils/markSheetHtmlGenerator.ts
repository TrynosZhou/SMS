import { Settings } from '../entities/Settings';
import {
  formatMarkSheetAverage,
  isCoreSubjectName,
  MARK_SHEET_SCORE_BLUE,
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

export function createMarkSheetHTML(data: MarkSheetHTMLData, settings: Settings | null): string {
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
      --line: #e5e7eb;
      --paper: #f3f4f6;
      --score: ${MARK_SHEET_SCORE_BLUE};
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
      font-size: 12px;
      line-height: 1.4;
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

    /* Meta */
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 22px;
      padding: 12px 24px;
      background: #fafbfc;
      border-bottom: 1px solid var(--line);
      font-size: 0.82rem;
    }

    .meta-row span { color: var(--muted); }
    .meta-row strong { color: var(--ink); margin-left: 4px; }

    /* Summary */
    .summary {
      display: grid;
      grid-template-columns: 1.25fr 1fr 1fr 1fr;
      gap: 12px;
      padding: 18px 24px;
    }

    .card {
      border-radius: 12px;
      padding: 14px 16px;
      position: relative;
    }

    .card--featured {
      background: linear-gradient(135deg, var(--navy) 0%, var(--navy-dark) 100%);
      color: #fff;
    }

    .card--light {
      background: #f9fafb;
      border: 1px solid var(--line);
    }

    .card__label {
      margin: 0 0 6px;
      font-size: 0.65rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.85;
    }

    .card--light .card__label { color: var(--muted); }

    .card__value {
      margin: 0;
      font-size: 1.85rem;
      font-weight: 700;
      line-height: 1.1;
    }

    .card__sub {
      margin: 5px 0 0;
      font-size: 0.72rem;
      opacity: 0.82;
    }

    .card--light .card__sub { color: var(--muted); }

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

    /* Table */
    .table-section { padding: 0 24px 18px; }

    .table-wrap {
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    thead th {
      background: var(--navy);
      color: #fff !important;
      font-size: 0.74rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 10px 8px;
      text-align: center;
      border-right: 1px solid rgba(255,255,255,0.15);
    }

    thead th:last-child { border-right: none; }

    thead .group-row th {
      padding: 10px 8px;
      font-size: 0.78rem;
    }

    thead .subject-row th {
      background: #234585;
      color: #fff !important;
      font-size: 0.74rem;
      font-weight: 700;
      padding: 9px 6px;
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
      padding: 8px;
      border-bottom: 1px solid var(--line);
      vertical-align: middle;
    }

    tbody tr:last-child td { border-bottom: none; }
    tbody tr.row-alt { background: #f9fafb; }

    tbody td.col-pos { text-align: center; }
    tbody td.col-id { color: var(--ink); font-size: 0.88rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    tbody td.col-name { font-weight: 700; color: var(--ink); }
    tbody td.col-mark { text-align: center; font-weight: 700; color: var(--score); font-variant-numeric: tabular-nums; }
    tbody td.col-total { text-align: center; font-variant-numeric: tabular-nums; }
    tbody td.col-avg { text-align: right; }

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
      justify-content: flex-end;
    }

    .avg-bar {
      flex: 1;
      max-width: 56px;
      height: 6px;
      background: #e5e7eb;
      border-radius: 999px;
      overflow: hidden;
    }

    .avg-fill {
      display: block;
      height: 100%;
      border-radius: 999px;
    }

    .avg-fill--high { background: var(--present); }
    .avg-fill--mid { background: var(--mid); }
    .avg-fill--low { background: var(--low); }

    .avg-text {
      font-size: 0.78rem;
      font-weight: 700;
      min-width: 38px;
      text-align: right;
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

    @media print {
      body { padding: 0; background: #fff; }
      .report { box-shadow: none; border-radius: 0; max-width: none; }
      thead { display: table-header-group; }
      thead th { background: var(--navy) !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      thead .subject-row th { background: #234585 !important; color: #fff !important; }
      tbody tr { break-inside: avoid; }
      .summary, .banner, .meta-row { break-inside: avoid; }
      .report-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: #fff;
        padding: 8px 18px;
      }
      .table-section { padding-bottom: 36px; }
      @page { size: A4 landscape; margin: 10mm; }
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
      <div class="exam-pill">${escapeHtml(examLabel)}</div>
    </header>

    <div class="meta-row">
      <div><span>Class:</span><strong>${escapeHtml(classLabel)}</strong></div>
      <div><span>Exam Type:</span><strong>${escapeHtml(examLabel)}</strong></div>
      <div><span>Class Teacher:</span><strong>${escapeHtml(teacherName)}</strong></div>
      <div><span>Generated:</span><strong>${escapeHtml(generatedDate)} ${escapeHtml(generatedTime)}</strong></div>
    </div>

    <section class="summary">
      <article class="card card--featured">
        <p class="card__label">Pass Rate</p>
        <p class="card__value">${passRate}%</p>
        <p class="card__sub">Students scoring 70% and above</p>
      </article>
      <article class="card card--light">
        <span class="card__icon" aria-hidden="true">👥</span>
        <p class="card__label">Students</p>
        <p class="card__value">${studentCount}</p>
        <p class="card__sub">Enrolled in this class</p>
      </article>
      <article class="card card--light">
        <p class="card__label">Class Average</p>
        <p class="card__value">${escapeHtml(formatMarkSheetAverage(classAverage))}</p>
        <p class="card__sub">Mean of all student averages</p>
      </article>
      <article class="card card--light">
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
      if (typeof window !== 'undefined') {
        var els = document.querySelectorAll('.page-num');
        var style = document.createElement('style');
        style.textContent = '@media print { .page-num::after { content: counter(page); } }';
        document.head.appendChild(style);
      }
    })();
  </script>
</body>
</html>`;
}

export function createMarkSheetHTMLBuffer(data: MarkSheetHTMLData, settings: Settings | null): Buffer {
  return Buffer.from(createMarkSheetHTML(data, settings), 'utf-8');
}

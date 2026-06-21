import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { AttendanceService } from '../../../services/attendance.service';
import { ClassService } from '../../../services/class.service';
import { SettingsService } from '../../../services/settings.service';

@Component({
  standalone: false,  selector: 'app-attendance-reports',
  templateUrl: './attendance-reports.component.html',
  styleUrls: ['./attendance-reports.component.css']
})
export class AttendanceReportsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  classes: any[] = [];
  selectedClassId: string = '';
  selectedTerm: string = '';
  startDate: string = '';
  endDate: string = '';
  report: any = null;
  rawReportRows: any[] = [];
  filteredReport: any[] = [];
  loading = false;
  loadingClasses = true;
  success = '';
  error = '';
  availableTerms: string[] = [];
  searchTerm = '';
  minAttendance = 0;
  showOnlyConcerns = false;
  sortField: 'attendanceRateNumber' | 'firstName' | 'studentNumber' = 'attendanceRateNumber';
  sortDirection: 'asc' | 'desc' = 'desc';
  lastGeneratedAt: Date | null = null;
  concernThreshold = 75;
  schoolName = 'School';
  schoolLogo: string | null = null;
  topPerformer: any = null;
  lowestPerformer: any = null;
  averageAttendanceRate = 0;
  concernCount = 0;
  attendanceDistribution: { excellent: number; good: number; attention: number; counts?: { excellent: number; good: number; attention: number } } = {
    excellent: 0,
    good: 0,
    attention: 0
  };
  distributionCounts = {
    excellent: 0,
    good: 0,
    attention: 0
  };
  
  // Modern features
  dateRangePreset: string = '';
  showCharts = true;
  filtersExpanded = true;
  isPrintMode = false;
  weeklyTrend: any[] = [];
  monthlyTrend: any[] = [];
  attendanceByStatus = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0
  };
  previousPeriodAverage = 0;
  trendDirection: 'up' | 'down' | 'stable' = 'stable';
  viewMode: 'table' | 'cards' = 'table';
  private autoGenerateTimer: any = null;

  constructor(
    private attendanceService: AttendanceService,
    private classService: ClassService,
    private settingsService: SettingsService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    activatePageLoad(this.router, this.destroy$, '/attendance/reports', () => this.bootstrapPage());
  }

  ngOnDestroy(): void {
    if (this.autoGenerateTimer) {
      clearTimeout(this.autoGenerateTimer);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  private bootstrapPage(): void {
    this.loadClasses();
    this.loadAvailableTerms();
    this.settingsService.getSettings().subscribe({
      next: (s: any) => {
        this.schoolName = String(s?.schoolName || 'School').trim() || 'School';
        const logo = this.normalizeSchoolLogo(s?.schoolLogo);
        this.schoolLogo = logo;
        this.cdr.markForCheck();
      },
    });
  }

  get dashboardStats() {
    return {
      students: this.filteredReport.length,
      total: this.rawReportRows.length,
      average: Math.round(this.averageAttendanceRate * 10) / 10,
      concerns: this.concernCount,
      excellent: this.attendanceDistribution.excellent,
      records: this.getTotalRecords()
    };
  }

  get statusBreakdown(): { key: 'present' | 'absent' | 'late' | 'excused'; label: string; count: number; cls: string }[] {
    return [
      { key: 'present', label: 'Present', count: this.attendanceByStatus.present, cls: 'present' },
      { key: 'absent', label: 'Absent', count: this.attendanceByStatus.absent, cls: 'absent' },
      { key: 'late', label: 'Late', count: this.attendanceByStatus.late, cls: 'late' },
      { key: 'excused', label: 'Excused', count: this.attendanceByStatus.excused, cls: 'excused' },
    ];
  }

  get filterSummary(): { class: string; term?: string; dates?: string } | null {
    if (!this.hasReportData && !this.selectedClassId) return null;
    const cls = this.getClassName(this.selectedClassId) || '—';
    const summary: { class: string; term?: string; dates?: string } = { class: cls };
    if (this.selectedTerm) summary.term = this.selectedTerm;
    if (this.startDate || this.endDate) {
      summary.dates = `${this.formatISOToDDMMYYYY(this.startDate) || '…'} – ${this.formatISOToDDMMYYYY(this.endDate) || '…'}`;
    } else if (this.dateRangePreset) {
      summary.dates = this.dateRangePreset.replace(/([A-Z])/g, ' $1').trim();
    }
    return summary;
  }

  clearAlert(type: 'success' | 'error'): void {
    if (type === 'success') this.success = '';
    else this.error = '';
    this.cdr.markForCheck();
  }

  loadAvailableTerms() {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    this.availableTerms = [
      `Term 1 ${currentYear}`,
      `Term 2 ${currentYear}`,
      `Term 3 ${currentYear}`,
      `Term 1 ${nextYear}`,
      `Term 2 ${nextYear}`,
      `Term 3 ${nextYear}`
    ];

    // Load active term and set it as default
    this.settingsService
      .getActiveTerm()
      .pipe(finalize(() => this.cdr.markForCheck()))
      .subscribe({
next: (data: any) => {
        if (data.activeTerm) {
          this.selectedTerm = data.activeTerm;
          if (!this.availableTerms.includes(data.activeTerm)) {
            this.availableTerms.unshift(data.activeTerm);
          }
        } else if (data.currentTerm) {
          this.selectedTerm = data.currentTerm;
          if (!this.availableTerms.includes(data.currentTerm)) {
            this.availableTerms.unshift(data.currentTerm);
          }
        }
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        console.error('Error loading active term:', err);
        this.cdr.markForCheck();
}
    });
  }

  loadClasses() {
    this.loadingClasses = true;
    this.classService
      .getClasses()
      .pipe(
        finalize(() => {
          this.loadingClasses = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data: any) => {
          const classesArray = Array.isArray(data) ? data : [];
          this.classes = classesArray.filter((c: any) => c.isActive);
        },
        error: (err: any) => {
          this.error = 'Failed to load classes';
          this.classes = [];
          console.error(err);
        }
      });
  }

  generateReport() {
    if (!this.selectedClassId) {
      this.error = 'Please select a class';
      return;
    }

    this.loading = true;
    this.error = '';
    this.report = null;

    const params: any = { classId: this.selectedClassId };
    
    if (this.selectedTerm) {
      params.term = this.selectedTerm;
    }
    
    if (this.startDate) {
      params.startDate = this.startDate;
    }
    
    if (this.endDate) {
      params.endDate = this.endDate;
    }

    this.attendanceService.getAttendanceReport(params).subscribe({
      next: (response: any) => {
        this.report = response;
        this.lastGeneratedAt = new Date();
        this.loading = false;
        this.prepareReportData();
        const count = this.rawReportRows.length;
        this.success = count
          ? `Report generated for ${count} student${count === 1 ? '' : 's'}.`
          : 'Report generated — no student records in range.';
        this.cdr.markForCheck();
        setTimeout(() => { this.success = ''; this.cdr.markForCheck(); }, 5000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to generate report';
        this.loading = false;
        this.cdr.markForCheck();
        setTimeout(() => { this.error = ''; this.cdr.markForCheck(); }, 7000);
      }
    });
  }

  getClassName(classId: string): string {
    const cls = this.classes.find(c => c.id === classId);
    return cls ? cls.name : '';
  }

  get hasReportData(): boolean {
    return this.rawReportRows.length > 0;
  }

  onSearchChange() {
    this.applyFilters();
  }

  onMinAttendanceChange(value: number) {
    this.minAttendance = value;
    this.applyFilters();
  }

  toggleConcerns() {
    this.showOnlyConcerns = !this.showOnlyConcerns;
    this.applyFilters();
  }

  resetFilters() {
    this.searchTerm = '';
    this.minAttendance = 0;
    this.showOnlyConcerns = false;
    this.sortField = 'attendanceRateNumber';
    this.sortDirection = 'desc';
    this.applyFilters();
  }

  changeSort(field: 'attendanceRateNumber' | 'firstName' | 'studentNumber') {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = field === 'firstName' ? 'asc' : 'desc';
    }
    this.applyFilters();
  }

  getSortDirection(field: string): 'asc' | 'desc' | null {
    return this.sortField === field ? this.sortDirection : null;
  }

  exportToCSV() {
    if (!this.filteredReport.length) {
      return;
    }

    const headers = [
      'Student Number',
      'First Name',
      'Last Name',
      'Present',
      'Absent',
      'Late',
      'Excused',
      'Total',
      'Attendance Rate (%)'
    ];

    const rows = this.filteredReport.map(item => [
      item.studentNumber,
      item.firstName,
      item.lastName,
      item.present ?? 0,
      item.absent ?? 0,
      item.late ?? 0,
      item.excused ?? 0,
      item.total ?? 0,
      (item.attendanceRateNumber ?? 0).toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const className = this.getClassName(this.selectedClassId) || 'Class';
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const fileDate = `${dd}-${mm}-${yyyy}`;
    const fileName = `Attendance_Report_${className.replace(/\s+/g, '_')}_${fileDate}.csv`;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  trackByStudent(index: number, item: any) {
    return item.studentId || item.studentNumber || index;
  }

  getAttendanceBadgeClass(rate: number): string {
    if (rate >= 95) {
      return 'badge badge-excellent';
    }
    if (rate >= 85) {
      return 'badge badge-good';
    }
    if (rate >= this.concernThreshold) {
      return 'badge badge-average';
    }
    return 'badge badge-warning';
  }

  getAttendanceStatus(rate: number): string {
    if (rate >= 95) {
      return 'Excellent';
    }
    if (rate >= 85) {
      return 'Good';
    }
    if (rate >= this.concernThreshold) {
      return 'Needs Attention';
    }
    return 'Critical';
  }

  getProgressStyle(rate: number) {
    return { width: `${Math.min(rate, 100)}%` };
  }

  private prepareReportData() {
    const rows = Array.isArray(this.report?.report) ? [...this.report.report] : [];
    this.rawReportRows = Array.isArray(rows) ? rows.map(item => ({
      ...item,
      attendanceRateNumber: this.toNumber(item.attendanceRate),
      present: item.present ?? 0,
      absent: item.absent ?? 0,
      late: item.late ?? 0,
      excused: item.excused ?? 0,
      total: item.total ?? 0
    })) : [];

    const reportRowsArray = Array.isArray(this.rawReportRows) ? this.rawReportRows : [];
    this.averageAttendanceRate = reportRowsArray.length
      ? reportRowsArray.reduce((sum, row) => sum + (row.attendanceRateNumber ?? 0), 0) / reportRowsArray.length
      : 0;

    this.topPerformer = reportRowsArray.length
      ? [...reportRowsArray].sort((a, b) => (b.attendanceRateNumber ?? 0) - (a.attendanceRateNumber ?? 0))[0]
      : null;

    this.lowestPerformer = reportRowsArray.length
      ? [...reportRowsArray].sort((a, b) => (a.attendanceRateNumber ?? 0) - (b.attendanceRateNumber ?? 0))[0]
      : null;

    this.concernCount = reportRowsArray.filter(row => (row.attendanceRateNumber ?? 0) < this.concernThreshold).length;

    this.attendanceDistribution = this.calculateDistribution(reportRowsArray);
    this.distributionCounts = this.attendanceDistribution.counts ?? { excellent: 0, good: 0, attention: 0 };

    // Calculate attendance by status totals
    this.attendanceByStatus = {
      present: reportRowsArray.reduce((sum, row) => sum + (row.present ?? 0), 0),
      absent: reportRowsArray.reduce((sum, row) => sum + (row.absent ?? 0), 0),
      late: reportRowsArray.reduce((sum, row) => sum + (row.late ?? 0), 0),
      excused: reportRowsArray.reduce((sum, row) => sum + (row.excused ?? 0), 0)
    };

    // Calculate trend (simplified - comparing with previous period)
    this.calculateTrend();

    this.applyFilters();
  }

  // Date range presets
  applyDateRangePreset(preset: string) {
    this.dateRangePreset = preset;
    const today = new Date();
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);

    switch (preset) {
      case 'today':
        this.startDate = today.toISOString().split('T')[0];
        this.endDate = today.toISOString().split('T')[0];
        break;
      case 'last7days':
        const last7Days = new Date(today);
        last7Days.setDate(today.getDate() - 7);
        this.startDate = last7Days.toISOString().split('T')[0];
        this.endDate = today.toISOString().split('T')[0];
        break;
      case 'last30days':
        const last30Days = new Date(today);
        last30Days.setDate(today.getDate() - 30);
        this.startDate = last30Days.toISOString().split('T')[0];
        this.endDate = today.toISOString().split('T')[0];
        break;
      case 'thisMonth':
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        this.startDate = firstDay.toISOString().split('T')[0];
        this.endDate = today.toISOString().split('T')[0];
        break;
      case 'lastMonth':
        const lastMonthFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthLast = new Date(today.getFullYear(), today.getMonth(), 0);
        this.startDate = lastMonthFirst.toISOString().split('T')[0];
        this.endDate = lastMonthLast.toISOString().split('T')[0];
        break;
      case 'thisTerm':
        this.startDate = '';
        this.endDate = '';
        break;
      case 'custom':
        // Keep current dates
        break;
      default:
        this.startDate = '';
        this.endDate = '';
    }
  }

  // Calculate trend direction
  private calculateTrend() {
    // Simplified trend calculation - in a real scenario, you'd compare with previous period
    // For now, we'll set it based on average attendance
    if (this.averageAttendanceRate >= 90) {
      this.trendDirection = 'up';
    } else if (this.averageAttendanceRate < 75) {
      this.trendDirection = 'down';
    } else {
      this.trendDirection = 'stable';
    }
  }

  // Export to PDF (opens styled HTML print view)
  exportToPDF() {
    this.openPrintableReport(true);
  }

  // Print report
  printReport() {
    this.openPrintableReport(true);
  }

  private openPrintableReport(autoPrint: boolean): void {
    if (!this.filteredReport.length) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(this.buildAttendanceReportHtml());
    printWindow.document.close();
    printWindow.focus();
    if (autoPrint) {
      setTimeout(() => printWindow.print(), 300);
    }
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private schoolInitials(): string {
    const words = this.schoolName.split(/\s+/).filter(Boolean);
    if (!words.length) return 'S';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  private normalizeSchoolLogo(value: unknown): string | null {
    let v = String(value ?? '').trim();
    if (!v) return null;

    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1).trim();
    }

    if (v.startsWith('data:image')) {
      const commaIndex = v.indexOf(',');
      if (commaIndex > -1) {
        const header = v.slice(0, commaIndex + 1);
        const payload = v.slice(commaIndex + 1).replace(/\s/g, '');
        return `${header}${payload}`;
      }
      return v;
    }

    if (/^https?:\/\//i.test(v)) return v;

    if (/^[A-Za-z0-9+/=\s]+$/.test(v) && v.length > 64) {
      return `data:image/png;base64,${v.replace(/\s/g, '')}`;
    }

    return v;
  }

  private buildHeaderLogoHtml(): string {
    const raw = String(this.schoolLogo ?? '').trim();
    if (raw) {
      return `<img src="${this.escapeHtml(raw)}" alt="${this.escapeHtml(this.schoolName)} logo" class="crest crest--logo" />`;
    }
    return `<div class="crest crest--placeholder" aria-hidden="true">${this.escapeHtml(this.schoolInitials())}</div>`;
  }

  private formatTermPill(term: string): string {
    const t = String(term || '').trim();
    if (!t) return 'All terms';
    const match = t.match(/^(Term\s*\d+)\s+(\d{4})$/i);
    if (match) return `${match[1]} · ${match[2]}`;
    return t;
  }

  private buildAttendanceReportHtml(): string {
    const className = this.getClassName(this.selectedClassId) || 'Class';
    const generatedAt = new Date();
    const reportDate = this.formatDateObjToDDMMYYYY(generatedAt);
    const reportTime = generatedAt.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const termLabel = this.selectedTerm || 'All Terms';
    const dateFrom = this.formatISOToDDMMYYYY(this.startDate) || 'N/A';
    const dateTo = this.formatISOToDDMMYYYY(this.endDate) || 'N/A';
    const avgRate = this.averageAttendanceRate.toFixed(2);
    const totalStudents = this.filteredReport.length;
    const concernCount = this.concernCount;
    const headerLogo = this.buildHeaderLogoHtml();
    const concernOk = concernCount === 0;

    const tableRows = this.filteredReport
      .map((item, index) => {
        const rate = item.attendanceRateNumber ?? 0;
        const present = item.present ?? 0;
        const absent = item.absent ?? 0;
        const late = item.late ?? 0;
        const excused = item.excused ?? 0;
        const total = item.total ?? 0;
        const rowClass = index % 2 === 1 ? 'row-alt' : '';
        return `
          <tr class="${rowClass}">
            <td class="col-id">${this.escapeHtml(item.studentNumber)}</td>
            <td class="col-name">${this.escapeHtml(item.firstName)} ${this.escapeHtml(item.lastName)}</td>
            <td class="col-num col-present">${present}</td>
            <td class="col-num col-absent">${absent}</td>
            <td class="col-num col-late">${late}</td>
            <td class="col-num col-excused">${excused}</td>
            <td class="col-num col-total">${total}</td>
            <td class="col-rate">
              <div class="rate-cell">
                <div class="rate-bar" aria-hidden="true"><span class="rate-fill" style="width:${Math.min(100, Math.max(0, rate))}%"></span></div>
                <span class="rate-text">${rate.toFixed(2)}%</span>
              </div>
            </td>
          </tr>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Attendance Report — ${this.escapeHtml(className)}</title>
  <style>
    :root {
      --navy: #2b3a67;
      --navy-dark: #1e2a4a;
      --navy-soft: #eef1f8;
      --ink: #111827;
      --muted: #6b7280;
      --line: #e5e7eb;
      --paper: #f3f4f6;
      --present: #059669;
      --absent: #dc2626;
      --late: #d97706;
      --excused: #2563eb;
      --radius: 10px;
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

    body { padding: 24px; }

    .report {
      max-width: 980px;
      margin: 0 auto;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(43, 58, 103, 0.08);
      overflow: hidden;
    }

    /* ── Header ── */
    .report-header {
      padding: 22px 28px 18px;
      border-bottom: 3px solid var(--navy);
    }

    .header-grid {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }

    .crest {
      flex-shrink: 0;
      width: 52px;
      height: 52px;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(43, 58, 103, 0.18);
    }

    .crest--logo {
      object-fit: contain;
      background: #fff;
      border: 1px solid var(--line);
      padding: 4px;
    }

    .crest--placeholder {
      background: linear-gradient(135deg, var(--navy) 0%, var(--navy-dark) 100%);
      color: #fff;
      font-weight: 700;
      font-size: 0.85rem;
      letter-spacing: 0.04em;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .header-titles .school-name {
      margin: 0 0 4px;
      font-size: 1.2rem;
      font-weight: 700;
      color: var(--ink);
      line-height: 1.2;
    }

    .header-titles h1 {
      margin: 0 0 2px;
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--navy);
      line-height: 1.2;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .header-titles .class-name {
      margin: 0;
      font-size: 0.92rem;
      font-weight: 600;
      color: var(--muted);
    }

    .header-right {
      text-align: right;
      flex-shrink: 0;
    }

    .term-pill {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 999px;
      background: var(--navy-soft);
      color: var(--navy);
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      margin-bottom: 6px;
    }

    .header-meta {
      margin: 0;
      font-size: 0.75rem;
      color: var(--muted);
      line-height: 1.5;
    }

    /* ── Meta row ── */
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 24px;
      padding: 12px 28px;
      background: #fafbfc;
      border-bottom: 1px solid var(--line);
      font-size: 0.82rem;
    }

    .meta-row span { color: var(--muted); }
    .meta-row strong { color: var(--ink); font-weight: 700; margin-left: 4px; }

    /* ── Summary cards ── */
    .summary {
      display: grid;
      grid-template-columns: 1.2fr 1fr 1fr;
      gap: 14px;
      padding: 20px 28px;
    }

    .card {
      border-radius: var(--radius);
      padding: 16px 18px;
      position: relative;
      overflow: hidden;
    }

    .card--featured {
      background: linear-gradient(135deg, var(--navy) 0%, var(--navy-dark) 100%);
      color: #fff;
      box-shadow: 0 4px 16px rgba(43, 58, 103, 0.22);
    }

    .card--light {
      background: #f9fafb;
      border: 1px solid var(--line);
    }

    .card__label {
      margin: 0 0 8px;
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.85;
    }

    .card--light .card__label { color: var(--muted); }

    .card__value {
      margin: 0;
      font-size: 2rem;
      font-weight: 700;
      line-height: 1.1;
    }

    .card__sub {
      margin: 6px 0 0;
      font-size: 0.75rem;
      opacity: 0.8;
    }

    .card--light .card__sub { color: var(--muted); }

    .card__icon {
      position: absolute;
      top: 14px;
      right: 14px;
      font-size: 1.1rem;
      opacity: 0.55;
    }

    .card__icon--ok { color: var(--present); opacity: 1; }

    /* ── Table ── */
    .table-section { padding: 0 28px 20px; }

    .table-wrap {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      overflow: hidden;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    thead th {
      background: var(--navy);
      color: #fff;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      text-align: left;
      padding: 11px 12px;
    }

    thead th:first-child { border-top-left-radius: var(--radius); }
    thead th:last-child { border-top-right-radius: var(--radius); }

    tbody td {
      padding: 9px 12px;
      border-bottom: 1px solid var(--line);
      vertical-align: middle;
    }

    tbody tr:last-child td { border-bottom: none; }
    tbody tr.row-alt { background: #f9fafb; }

    .col-id { color: var(--muted); font-size: 0.82rem; font-variant-numeric: tabular-nums; }
    .col-name { font-weight: 700; color: var(--ink); }
    .col-num { text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; }
    .col-total { color: var(--muted); font-weight: 600; }
    .col-present { color: var(--present); }
    .col-absent { color: var(--absent); }
    .col-late { color: var(--late); }
    .col-excused { color: var(--excused); }

    th.col-num, th.col-total { text-align: center; }

    .rate-cell {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 120px;
    }

    .rate-bar {
      flex: 1;
      height: 7px;
      background: #e5e7eb;
      border-radius: 999px;
      overflow: hidden;
    }

    .rate-fill {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, #34d399, var(--present));
      border-radius: 999px;
    }

    .rate-text {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--ink);
      min-width: 44px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    /* ── Legend ── */
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      margin-top: 12px;
      font-size: 0.75rem;
      color: var(--muted);
    }

    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .legend-dot--present { background: var(--present); }
    .legend-dot--absent { background: var(--absent); }
    .legend-dot--late { background: var(--late); }
    .legend-dot--excused { background: var(--excused); }

    /* ── Footer ── */
    .report-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 12px 28px 18px;
      border-top: 1px solid var(--line);
      font-size: 0.75rem;
      color: var(--muted);
    }

    /* ── Print ── */
    @media print {
      body { padding: 0; background: #fff; }
      .report { box-shadow: none; border-radius: 0; max-width: none; }

      .report-header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #fff;
        z-index: 100;
        padding: 14px 18px 12px;
      }

      .meta-row {
        position: fixed;
        top: 100px;
        left: 0;
        right: 0;
        z-index: 99;
        padding: 8px 18px;
      }

      .summary {
        margin-top: 148px;
        padding: 12px 18px;
        break-inside: avoid;
      }

      .table-section { padding: 0 18px 36px; }

      thead { display: table-header-group; }
      thead th { background: var(--navy) !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tbody tr { break-inside: avoid; }

      .report-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: #fff;
        padding: 8px 18px;
        border-top: 1px solid var(--line);
      }

      .page-num::after { content: counter(page); }

      @page {
        margin: 0 0 28mm 0;
        size: A4;
      }
    }
  </style>
</head>
<body>
  <article class="report">
    <header class="report-header">
      <div class="header-grid">
        <div class="header-left">
          ${headerLogo}
          <div class="header-titles">
            <p class="school-name">${this.escapeHtml(this.schoolName)}</p>
            <h1>Attendance Report</h1>
            <p class="class-name">${this.escapeHtml(className)}</p>
          </div>
        </div>
        <div class="header-right">
          <div class="term-pill">${this.escapeHtml(this.formatTermPill(termLabel))}</div>
          <p class="header-meta">Generated ${this.escapeHtml(reportDate)} · ${this.escapeHtml(reportTime)}<br />Page <span class="page-num"></span></p>
        </div>
      </div>
    </header>

    <div class="meta-row">
      <div><span>Term:</span><strong>${this.escapeHtml(termLabel)}</strong></div>
      <div><span>Date Range:</span><strong>${this.escapeHtml(dateFrom)} to ${this.escapeHtml(dateTo)}</strong></div>
      <div><span>Class:</span><strong>${this.escapeHtml(className)}</strong></div>
    </div>

    <section class="summary">
      <article class="card card--featured">
        <p class="card__label">Average Attendance</p>
        <p class="card__value">${avgRate}%</p>
        <p class="card__sub">Class-wide rate for selected period</p>
      </article>
      <article class="card card--light">
        <span class="card__icon" aria-hidden="true">👥</span>
        <p class="card__label">Total Students</p>
        <p class="card__value">${totalStudents}</p>
        <p class="card__sub">Enrolled in this class group</p>
      </article>
      <article class="card card--light">
        <span class="card__icon${concernOk ? ' card__icon--ok' : ''}" aria-hidden="true">${concernOk ? '✓' : '⚠'}</span>
        <p class="card__label">Students Needing Attention</p>
        <p class="card__value">${concernCount}</p>
        <p class="card__sub">Below ${this.concernThreshold}% attendance threshold</p>
      </article>
    </section>

    <section class="table-section">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student #</th>
              <th>Name</th>
              <th class="col-num">Present</th>
              <th class="col-num">Absent</th>
              <th class="col-num">Late</th>
              <th class="col-num">Excused</th>
              <th class="col-num">Total</th>
              <th>Attendance Rate</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
      <div class="legend">
        <span class="legend-item"><span class="legend-dot legend-dot--present"></span> Present</span>
        <span class="legend-item"><span class="legend-dot legend-dot--absent"></span> Absent</span>
        <span class="legend-item"><span class="legend-dot legend-dot--late"></span> Late</span>
        <span class="legend-item"><span class="legend-dot legend-dot--excused"></span> Excused</span>
      </div>
    </section>

    <footer class="report-footer">
      <span>${this.escapeHtml(this.schoolName)} · ${this.escapeHtml(className)}</span>
      <span>Page <span class="page-num"></span></span>
    </footer>
  </article>
</body>
</html>`;
  }

  // Toggle view mode
  toggleViewMode() {
    this.viewMode = this.viewMode === 'table' ? 'cards' : 'table';
  }

  toggleCharts() {
    this.showCharts = !this.showCharts;
  }

  toggleFiltersExpanded() {
    this.filtersExpanded = !this.filtersExpanded;
  }

  getDistributionCount(tier: 'excellent' | 'good' | 'attention'): number {
    return this.distributionCounts[tier] ?? 0;
  }

  getProgressBarClass(rate: number): string {
    if (rate >= 95) return 'progress-bar--excellent';
    if (rate >= 85) return 'progress-bar--good';
    if (rate >= this.concernThreshold) return 'progress-bar--average';
    return 'progress-bar--critical';
  }

  // Get trend icon
  getTrendIcon(): string {
    switch (this.trendDirection) {
      case 'up':
        return '📈';
      case 'down':
        return '📉';
      default:
        return '➡️';
    }
  }

  // Get trend text
  getTrendText(): string {
    switch (this.trendDirection) {
      case 'up':
        return 'Improving';
      case 'down':
        return 'Declining';
      default:
        return 'Stable';
    }
  }

  // Get total attendance records
  getTotalRecords(): number {
    return this.attendanceByStatus.present + 
           this.attendanceByStatus.absent + 
           this.attendanceByStatus.late + 
           this.attendanceByStatus.excused;
  }

  // Get status percentage
  getStatusPercentage(status: 'present' | 'absent' | 'late' | 'excused'): number {
    const total = this.getTotalRecords();
    if (total === 0) return 0;
    return (this.attendanceByStatus[status] / total) * 100;
  }

  private applyFilters() {
    const reportRowsArray = Array.isArray(this.rawReportRows) ? this.rawReportRows : [];
    let data = [...reportRowsArray];

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.trim().toLowerCase();
      data = data.filter(item =>
        `${item.firstName} ${item.lastName}`.toLowerCase().includes(term) ||
        String(item.studentNumber).toLowerCase().includes(term)
      );
    }

    if (this.minAttendance > 0) {
      data = data.filter(item => (item.attendanceRateNumber ?? 0) >= this.minAttendance);
    }

    if (this.showOnlyConcerns) {
      data = data.filter(item => (item.attendanceRateNumber ?? 0) < this.concernThreshold);
    }

    data.sort((a, b) => {
      const aValue = this.getSortValue(a);
      const bValue = this.getSortValue(b);
      if (aValue < bValue) {
        return this.sortDirection === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return this.sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });

    this.filteredReport = data;
  }

  private getSortValue(item: any): any {
    if (this.sortField === 'firstName') {
      return `${item.firstName ?? ''} ${item.lastName ?? ''}`.toLowerCase();
    }
    if (this.sortField === 'studentNumber') {
      return String(item.studentNumber ?? '');
    }
    return item.attendanceRateNumber ?? 0;
  }

  private calculateDistribution(rows: any[]) {
    if (!rows.length) {
      return { excellent: 0, good: 0, attention: 0, counts: { excellent: 0, good: 0, attention: 0 } };
    }

    let excellent = 0;
    let good = 0;
    let attention = 0;

    rows.forEach(row => {
      const rate = row.attendanceRateNumber ?? 0;
      if (rate >= 95) {
        excellent++;
      } else if (rate >= this.concernThreshold) {
        good++;
      } else {
        attention++;
      }
    });

    const total = rows.length || 1;
    return {
      excellent: Math.round((excellent / total) * 100),
      good: Math.round((good / total) * 100),
      attention: Math.round((attention / total) * 100),
      counts: { excellent, good, attention }
    };
  }

  private toNumber(value: any): number {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  private formatISOToDDMMYYYY(value: string): string {
    if (!value) return '';
    const parts = value.split('-');
    if (parts.length === 3) {
      const [yyyy, mm, dd] = parts;
      return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
    }
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  onSelectionChange() {
    if (this.autoGenerateTimer) {
      clearTimeout(this.autoGenerateTimer);
    }
    this.autoGenerateTimer = setTimeout(() => {
      if (this.selectedClassId && this.selectedTerm) {
        this.generateReport();
      }
    }, 300);
  }

  private formatDateObjToDDMMYYYY(d: Date): string {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
}


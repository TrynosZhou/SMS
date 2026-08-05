import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { activatePageLoad } from '../../../utils/route-activation';
import {
  computeCoreMarkSheetTotals,
  formatMarkSheetAverage,
  sortMarkSheetSubjectsForDisplay
} from '../../../utils/mark-sheet-subject-order';
import { pdfBlobViewerUrl } from '../../../utils/pdf-preview.util';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

interface GradeBand {
  key: string;
  label: string;
  threshold: number;
}

interface StudentRank {
  studentId: string;
  studentName: string;
  average: number;
  position: number;
}

interface SubjectPassRate {
  id: string;
  name: string;
  passRate: number;
}

interface GradeDistributionRow {
  label: string;
  count: number;
}

interface SubjectScoreBar {
  id: string;
  name: string;
  percentage: number;
  score: number | null;
  maxScore: number | null;
  grade: string;
}

@Component({
  standalone: false,
  selector: 'app-results-analysis',
  templateUrl: './results-analysis.component.html',
  styleUrls: ['./results-analysis.component.css']
})
export class ResultsAnalysisComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  classes: any[] = [];
  selectedClassId = '';
  selectedExamType = '';
  selectedTerm = '';
  selectedSubjectId = '';

  availableTerms: string[] = [];
  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End of Term' }
  ];

  activeTab: 'overall' | 'individual' = 'overall';
  individualView: 'performance' | 'ranking' = 'performance';
  selectedStudentId = '';
  selectedStudentBars: SubjectScoreBar[] = [];
  loading = false;
  loadingClasses = false;
  loadingTerms = false;
  loadingPdf = false;
  downloadingPdf = false;
  error = '';
  analysisLoaded = false;

  markSheetData: any = null;
  subjectPassRates: SubjectPassRate[] = [];
  topStudents: StudentRank[] = [];
  bottomStudents: StudentRank[] = [];
  allStudentsRanked: StudentRank[] = [];
  gradeDistribution: GradeDistributionRow[] = [];
  readonly skeletonRows = [1, 2, 3, 4, 5];
  isAdmin = false;

  gradeThresholds: Record<string, number> = {
    excellent: 90,
    veryGood: 80,
    good: 60,
    satisfactory: 40,
    needsImprovement: 20,
    basic: 1
  };
  gradeLabels: Record<string, string> = {
    excellent: 'OUTSTANDING',
    veryGood: 'VERY HIGH',
    good: 'HIGH',
    satisfactory: 'GOOD',
    needsImprovement: 'ASPIRING',
    basic: 'BASIC',
    fail: 'UNCLASSIFIED'
  };

  schoolName = '';
  schoolLogo: string | null = null;

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private settingsService: SettingsService,
    public authService: AuthService,
    public router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.isAdmin = this.authService.isAdmin();
    activatePageLoad(this.router, this.destroy$, '/results-analysis', () => this.bootstrapPage());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private bootstrapPage(): void {
    this.isAdmin = this.authService.isAdmin();
    this.loadGradeSettings();
    this.loadTermOptions();
    this.loadClasses();
  }

  clearAlert(): void {
    this.error = '';
  }

  get dashboardStats(): {
    students: number;
    subjects: number;
    classAverage: number;
    passRate: number;
    avgSubjectPass: number;
  } {
    const allRows = this.markSheetData?.markSheet || [];
    const students = this.allStudentsRanked.length;
    const subjects = this.markSheetData?.subjects?.length || 0;
    const classAverage =
      students > 0
        ? Math.round((this.allStudentsRanked.reduce((sum, row) => sum + row.average, 0) / students) * 10) / 10
        : 0;
    const passEligible = this.allStudentsRanked.filter((row) => {
      const raw = allRows.find((r: any) => r.studentId === row.studentId);
      return raw?.includeInClassPassRate !== false;
    });
    const passCount = passEligible.filter((row) => row.average >= 70).length;
    const passRate =
      passEligible.length > 0 ? Math.round((passCount / passEligible.length) * 1000) / 10 : 0;
    const avgSubjectPass =
      this.subjectPassRates.length > 0
        ? Math.round(
            (this.subjectPassRates.reduce((sum, row) => sum + row.passRate, 0) / this.subjectPassRates.length) * 10
          ) / 10
        : 0;
    return { students, subjects, classAverage, passRate, avgSubjectPass };
  }

  loadGradeSettings(): void {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        if (data?.gradeThresholds) {
          this.gradeThresholds = { ...this.gradeThresholds, ...data.gradeThresholds };
        }
        if (data?.gradeLabels) {
          this.gradeLabels = { ...this.gradeLabels, ...data.gradeLabels };
        }
        this.schoolName = data?.schoolName || '';
        this.schoolLogo = data?.schoolLogo || null;
        if (this.selectedSubjectId) {
          this.updateGradeDistribution();
        }
        this.cdr.markForCheck();
      },
      error: () => {}
    });
  }

  loadTermOptions(): void {
    this.loadingTerms = true;
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

    this.settingsService
      .getActiveTerm()
      .pipe(
        finalize(() => {
          this.loadingTerms = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (data: any) => {
          const activeTerm = data?.activeTerm || data?.currentTerm;
          if (activeTerm) {
            if (!this.availableTerms.includes(activeTerm)) {
              this.availableTerms.unshift(activeTerm);
            }
            if (!this.selectedTerm) {
              this.selectedTerm = activeTerm;
            }
          } else if (!this.selectedTerm && this.availableTerms.length > 0) {
            this.selectedTerm = this.availableTerms[0];
          }
        },
        error: () => {
          if (!this.selectedTerm && this.availableTerms.length > 0) {
            this.selectedTerm = this.availableTerms[0];
          }
        }
      });
  }

  loadClasses(): void {
    this.loadingClasses = true;
    this.classes = [];
    this.cdr.markForCheck();
    this.loadAllClasses(1, []);
  }

  private loadAllClasses(page: number, accumulatedClasses: any[]): void {
    this.classService.getClassesPaginated(page, 100).subscribe({
      next: (response: any) => {
        const data = response?.data || response || [];
        const allClasses = [...accumulatedClasses, ...data];
        const totalPages = response?.totalPages || 1;
        const currentPage = response?.page || page;

        if (currentPage < totalPages) {
          this.loadAllClasses(currentPage + 1, allClasses);
          return;
        }

        const cleanedClasses = allClasses.map((classItem: any) => {
          if (classItem.id) {
            let cleanId = String(classItem.id).trim();
            if (cleanId.includes(':')) {
              cleanId = cleanId.split(':')[0].trim();
            }
            classItem.id = cleanId;
          }
          return classItem;
        });

        const uniqueClassesMap = new Map<string, any>();
        cleanedClasses.forEach((classItem: any) => {
          const id = classItem.id || '';
          if (id && !uniqueClassesMap.has(id)) {
            uniqueClassesMap.set(id, classItem);
          }
        });
        this.classes = Array.from(uniqueClassesMap.values()).filter((c) => c.isActive !== false);
        this.loadingClasses = false;
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
        this.error = err.status === 401 ? 'Your session has expired. Please log in again.' : 'Failed to load classes';
        if (accumulatedClasses.length > 0) {
          this.classes = accumulatedClasses.filter((c) => c.isActive !== false);
        }
        this.loadingClasses = false;
        this.cdr.markForCheck();
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  isSelectionValid(): boolean {
    return !!(this.selectedClassId && this.selectedExamType && this.selectedTerm);
  }

  onSelectionReset(): void {
    this.analysisLoaded = false;
    this.markSheetData = null;
    this.subjectPassRates = [];
    this.topStudents = [];
    this.bottomStudents = [];
    this.allStudentsRanked = [];
    this.selectedSubjectId = '';
    this.selectedStudentId = '';
    this.selectedStudentBars = [];
    this.individualView = 'performance';
    this.gradeDistribution = [];
  }

  getAnalysis(): void {
    if (!this.isSelectionValid()) {
      this.error = 'Please select term, class, and exam type';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }

    this.loading = true;
    this.error = '';
    this.onSelectionReset();
    this.cdr.markForCheck();

    this.examService.generateMarkSheet(this.selectedClassId, this.selectedExamType, this.selectedTerm).subscribe({
      next: (data: any) => {
        this.markSheetData = {
          ...data,
          subjects: sortMarkSheetSubjectsForDisplay(data.subjects || [])
        };
        this.buildAnalysis();
        this.analysisLoaded = true;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        console.error('Error loading results analysis:', err);
        if (err.status === 401) {
          this.error = 'Your session has expired. Please log in again.';
          setTimeout(() => this.router.navigate(['/login']), 2000);
        } else {
          this.error = err.error?.message || 'Failed to load results analysis';
        }
        this.loading = false;
        this.cdr.markForCheck();
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  private buildAnalysis(): void {
    if (!this.markSheetData?.markSheet?.length) {
      return;
    }

    const rows = [...this.markSheetData.markSheet];
    const subjects = this.markSheetData.subjects || [];

    this.subjectPassRates = subjects.map((subject: any) => ({
      id: subject.id,
      name: subject.name,
      passRate: this.computeSubjectPassRate(subject.id, rows)
    }));

    const ranked: StudentRank[] = rows
      .map((row: any) => ({
        studentId: row.studentId,
        studentName: row.studentName,
        average: computeCoreMarkSheetTotals(row, subjects).average,
        position: row.position || 0
      }))
      .sort((a, b) => b.average - a.average)
      .map((student, index) => ({ ...student, position: index + 1 }));

    this.allStudentsRanked = ranked;
    this.topStudents = ranked.slice(0, 5);
    this.bottomStudents = [...ranked].reverse().slice(0, 5);

    if (subjects.length > 0 && !this.selectedSubjectId) {
      this.selectedSubjectId = subjects[0].id;
    }
    if (ranked.length > 0) {
      this.selectedStudentId = ranked[0].studentId;
      this.buildSelectedStudentBars();
    } else {
      this.selectedStudentId = '';
      this.selectedStudentBars = [];
    }
    this.updateGradeDistribution();
  }

  private computeSubjectPassRate(subjectId: string, rows: any[]): number {
    const eligible = rows.filter((row) => row.includeInClassPassRate !== false);
    if (!eligible.length) {
      return 0;
    }
    let passed = 0;
    for (const row of eligible) {
      const pct = this.getSubjectPercentage(row, subjectId);
      if (pct >= 70) {
        passed++;
      }
    }
    return Math.round((passed / eligible.length) * 1000) / 10;
  }

  private getSubjectPercentage(row: any, subjectId: string): number {
    const subjectData = row.subjects?.[subjectId];
    if (!subjectData) {
      return 0;
    }
    const pct = Number(subjectData.percentage);
    if (Number.isFinite(pct)) {
      return pct;
    }
    const max = Number(subjectData.maxScore) || 100;
    const score = Number(subjectData.score) || 0;
    return max > 0 ? (score / max) * 100 : 0;
  }

  onSubjectChange(): void {
    this.updateGradeDistribution();
    this.cdr.markForCheck();
  }

  updateGradeDistribution(): void {
    if (!this.selectedSubjectId || !this.markSheetData?.markSheet?.length) {
      this.gradeDistribution = [];
      return;
    }

    const bands = this.getGradeBands();
    const counts = new Map<string, number>();
    bands.forEach((band) => counts.set(band.label, 0));

    for (const row of this.markSheetData.markSheet) {
      const pct = this.getSubjectPercentage(row, this.selectedSubjectId);
      const label = this.getGradeLabel(pct);
      counts.set(label, (counts.get(label) || 0) + 1);
    }

    this.gradeDistribution = bands
      .map((band) => ({
        label: band.label,
        count: counts.get(band.label) || 0
      }))
      .filter((row) => row.count > 0);
  }

  private getGradeBands(): GradeBand[] {
    return [
      { key: 'excellent', label: this.gradeLabels['excellent'] || 'OUTSTANDING', threshold: this.gradeThresholds['excellent'] ?? 90 },
      { key: 'veryGood', label: this.gradeLabels['veryGood'] || 'VERY HIGH', threshold: this.gradeThresholds['veryGood'] ?? 80 },
      { key: 'good', label: this.gradeLabels['good'] || 'HIGH', threshold: this.gradeThresholds['good'] ?? 60 },
      { key: 'satisfactory', label: this.gradeLabels['satisfactory'] || 'GOOD', threshold: this.gradeThresholds['satisfactory'] ?? 40 },
      { key: 'needsImprovement', label: this.gradeLabels['needsImprovement'] || 'ASPIRING', threshold: this.gradeThresholds['needsImprovement'] ?? 20 },
      { key: 'basic', label: this.gradeLabels['basic'] || 'BASIC', threshold: this.gradeThresholds['basic'] ?? 1 },
      { key: 'fail', label: this.gradeLabels['fail'] || 'UNCLASSIFIED', threshold: 0 }
    ];
  }

  private getGradeLabel(percentage: number): string {
    const bands = this.getGradeBands();
    if (percentage === 0) {
      return this.gradeLabels['fail'] || 'UNCLASSIFIED';
    }
    for (const band of bands) {
      if (band.key === 'fail') {
        continue;
      }
      if (percentage >= band.threshold) {
        return band.label;
      }
    }
    return this.gradeLabels['fail'] || 'UNCLASSIFIED';
  }

  formatAverage(average: number): string {
    return formatMarkSheetAverage(average);
  }

  get selectedClassLabel(): string {
    const cls = this.classes.find((c) => c.id === this.selectedClassId);
    return cls ? `${cls.name} (${cls.form})` : '';
  }

  get selectedExamTypeLabel(): string {
    return this.examTypes.find((t) => t.value === this.selectedExamType)?.label || this.selectedExamType;
  }

  setActiveTab(tab: 'overall' | 'individual'): void {
    this.activeTab = tab;
    this.cdr.markForCheck();
  }

  setIndividualView(view: 'performance' | 'ranking'): void {
    this.individualView = view;
    if (view === 'performance' && this.selectedStudentId) {
      this.buildSelectedStudentBars();
    }
    this.cdr.markForCheck();
  }

  onStudentChange(): void {
    this.buildSelectedStudentBars();
    this.cdr.markForCheck();
  }

  private buildSelectedStudentBars(): void {
    if (!this.selectedStudentId || !this.markSheetData?.markSheet?.length) {
      this.selectedStudentBars = [];
      return;
    }

    const row = this.markSheetData.markSheet.find((r: any) => r.studentId === this.selectedStudentId);
    const subjects = this.markSheetData.subjects || [];
    if (!row || !subjects.length) {
      this.selectedStudentBars = [];
      return;
    }

    this.selectedStudentBars = subjects.map((subject: any) => {
      const subjectData = row.subjects?.[subject.id];
      const percentage = this.getSubjectPercentage(row, subject.id);
      const hasScore =
        subjectData &&
        (subjectData.score != null ||
          subjectData.percentage != null ||
          Number.isFinite(Number(subjectData.score)) ||
          Number.isFinite(Number(subjectData.percentage)));
      return {
        id: subject.id,
        name: subject.name,
        percentage: Math.round(percentage * 10) / 10,
        score: hasScore && subjectData?.score != null ? Number(subjectData.score) : hasScore ? percentage : null,
        maxScore: subjectData?.maxScore != null ? Number(subjectData.maxScore) : null,
        grade: this.getGradeLabel(percentage)
      } as SubjectScoreBar;
    });
  }

  get selectedStudentName(): string {
    const student = this.allStudentsRanked.find((s) => s.studentId === this.selectedStudentId);
    return student?.studentName || '';
  }

  get selectedStudentRank(): StudentRank | null {
    return this.allStudentsRanked.find((s) => s.studentId === this.selectedStudentId) || null;
  }

  barHeight(percentage: number): string {
    const pct = Math.max(0, Math.min(100, Number(percentage) || 0));
    return `${pct}%`;
  }

  barColorClass(percentage: number): string {
    if (percentage >= 70) return 'ra-vbar__fill--pass';
    if (percentage >= 40) return 'ra-vbar__fill--mid';
    return 'ra-vbar__fill--low';
  }

  async previewPDF(): Promise<void> {
    if (!this.analysisLoaded || !this.markSheetData) {
      this.error = 'Load analysis first, then preview the PDF.';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }

    this.loadingPdf = true;
    this.error = '';
    this.cdr.markForCheck();

    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      const pdf = this.buildAnalysisPdf();
      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      window.open(pdfBlobViewerUrl(url), '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (err: any) {
      console.error('Results analysis PDF preview failed:', err);
      this.error = err?.message || 'Failed to preview PDF';
      setTimeout(() => (this.error = ''), 5000);
    } finally {
      this.loadingPdf = false;
      this.cdr.markForCheck();
    }
  }

  async downloadPDF(): Promise<void> {
    if (!this.analysisLoaded || !this.markSheetData) {
      this.error = 'Load analysis first, then download the PDF.';
      setTimeout(() => (this.error = ''), 5000);
      return;
    }

    this.downloadingPdf = true;
    this.error = '';
    this.cdr.markForCheck();

    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      const pdf = this.buildAnalysisPdf();
      pdf.save(this.buildPdfFilename());
    } catch (err: any) {
      console.error('Results analysis PDF download failed:', err);
      this.error = err?.message || 'Failed to download PDF';
      setTimeout(() => (this.error = ''), 5000);
    } finally {
      this.downloadingPdf = false;
      this.cdr.markForCheck();
    }
  }

  private buildPdfFilename(): string {
    const classPart = (this.selectedClassLabel || 'class')
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    const termPart = (this.selectedTerm || 'term')
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    const examPart = (this.selectedExamType || 'exam').replace(/[^a-zA-Z0-9_-]/g, '');
    return `Results_Analysis_${classPart}_${termPart}_${examPart}.pdf`;
  }

  /** Keep header and body cells on the same horizontal alignment per column. */
  private pdfColumnAlign(alignByIndex: Record<number, 'left' | 'center' | 'right'>) {
    return (data: any) => {
      const align = alignByIndex[data.column.index];
      if (!align) return;
      data.cell.styles.halign = align;
      data.cell.styles.valign = 'middle';
    };
  }

  private pdfTableBase() {
    return {
      styles: {
        fontSize: 8,
        cellPadding: { top: 2.6, right: 3, bottom: 2.6, left: 3 },
        textColor: [15, 23, 42] as [number, number, number],
        lineColor: [148, 163, 184] as [number, number, number],
        lineWidth: 0.2,
        valign: 'middle' as const,
        minCellHeight: 7
      },
      headStyles: {
        fillColor: [30, 58, 95] as [number, number, number],
        textColor: [255, 255, 255] as [number, number, number],
        fontStyle: 'bold' as const,
        valign: 'middle' as const,
        cellPadding: { top: 3, right: 3, bottom: 3, left: 3 }
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252] as [number, number, number]
      }
    };
  }

  private buildAnalysisPdf(): jsPDF {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 14;
    const stats = this.dashboardStats;
    const generatedAt = new Date().toLocaleString();
    const school = (this.schoolName || '').trim() || 'School Management System';
    const metaLine = `${this.selectedClassLabel || 'Class'} · ${this.selectedTerm || 'Term'} · ${this.selectedExamTypeLabel || 'Exam'}`;

    const navy: [number, number, number] = [30, 58, 95];
    const gold: [number, number, number] = [245, 158, 11];
    const softWhite: [number, number, number] = [226, 232, 240];

    const HEADER_H = 42;
    const LOGO_SIZE = 22;
    const LOGO_PAD = 1.5;
    const PLATE = LOGO_SIZE + LOGO_PAD * 2;

    doc.setFillColor(...navy);
    doc.rect(0, 0, pageW, HEADER_H, 'F');
    doc.setFillColor(...gold);
    doc.rect(0, 0, 3.5, HEADER_H, 'F');

    // Subtle bottom rule
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.6);
    doc.line(0, HEADER_H, pageW, HEADER_H);

    let contentLeft = marginX;
    const contentTop = 8;
    const logoX = 9;
    const logoPlateY = (HEADER_H - PLATE) / 2;

    if (this.schoolLogo) {
      try {
        let fmt = 'PNG';
        const m = this.schoolLogo.match(/^data:image\/(\w+);base64,/i);
        if (m) {
          fmt = m[1].toUpperCase() === 'JPG' ? 'JPEG' : m[1].toUpperCase();
        }
        // Soft plate so the crest sits cleanly on the navy banner
        doc.setFillColor(255, 255, 255);
        if (typeof (doc as any).roundedRect === 'function') {
          (doc as any).roundedRect(logoX, logoPlateY, PLATE, PLATE, 2, 2, 'F');
        } else {
          doc.rect(logoX, logoPlateY, PLATE, PLATE, 'F');
        }
        doc.addImage(
          this.schoolLogo,
          fmt,
          logoX + LOGO_PAD,
          logoPlateY + LOGO_PAD,
          LOGO_SIZE,
          LOGO_SIZE
        );
        contentLeft = logoX + PLATE + 5;
      } catch {
        contentLeft = marginX;
      }
    }

    const rightBlockW = 52;
    const textMaxW = pageW - contentLeft - marginX - rightBlockW - 4;

    // School name — eyebrow hierarchy
    doc.setTextColor(...gold);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const schoolLines = doc.splitTextToSize(school.toUpperCase(), Math.max(40, textMaxW));
    doc.text(schoolLines.slice(0, 1), contentLeft, contentTop + 2);

    // Report title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Results Analysis', contentLeft, contentTop + 11);

    // Context meta
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...softWhite);
    const metaLines = doc.splitTextToSize(metaLine, Math.max(40, textMaxW));
    doc.text(metaLines.slice(0, 2), contentLeft, contentTop + 18);

    // Right meta block — aligned to header content band
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...gold);
    doc.text('GENERATED', pageW - marginX, contentTop + 2, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...softWhite);
    const dateLines = doc.splitTextToSize(generatedAt, rightBlockW);
    doc.text(dateLines, pageW - marginX, contentTop + 8, { align: 'right' });

    let y = HEADER_H + 10;
    doc.setTextColor(...navy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Summary', marginX, y);
    y += 4;

    const tableBase = this.pdfTableBase();

    autoTable(doc, {
      ...tableBase,
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Students', 'Subjects', 'Class average', 'Pass rate (≥70%)', 'Avg subject pass']],
      body: [[
        String(stats.students),
        String(stats.subjects),
        `${this.formatAverage(stats.classAverage)}%`,
        `${stats.passRate}%`,
        `${stats.avgSubjectPass}%`
      ]],
      didParseCell: this.pdfColumnAlign({
        0: 'center',
        1: 'center',
        2: 'center',
        3: 'center',
        4: 'center'
      })
    });

    y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...navy);
    doc.text('Subject pass rates', marginX, y);
    y += 3;

    autoTable(doc, {
      ...tableBase,
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Subject', 'Pass rate']],
      body: this.subjectPassRates.length
        ? this.subjectPassRates.map((s) => [s.name, `${s.passRate}%`])
        : [['No subjects found', '—']],
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 32 }
      },
      didParseCell: this.pdfColumnAlign({ 0: 'left', 1: 'center' })
    });

    y = (doc as any).lastAutoTable.finalY + 10;
    if (y > 240) {
      doc.addPage();
      y = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...navy);
    doc.text('Top 5 students', marginX, y);
    y += 3;

    autoTable(doc, {
      ...tableBase,
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Pos', 'Student', 'Core average']],
      body: this.topStudents.length
        ? this.topStudents.map((s) => [String(s.position), s.studentName, `${this.formatAverage(s.average)}%`])
        : [['—', 'No student data', '—']],
      columnStyles: {
        0: { cellWidth: 18 },
        2: { cellWidth: 32 }
      },
      didParseCell: this.pdfColumnAlign({ 0: 'center', 1: 'left', 2: 'center' })
    });

    y = (doc as any).lastAutoTable.finalY + 10;
    if (y > 240) {
      doc.addPage();
      y = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...navy);
    doc.text('Bottom 5 students', marginX, y);
    y += 3;

    autoTable(doc, {
      ...tableBase,
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Pos', 'Student', 'Core average']],
      body: this.bottomStudents.length
        ? this.bottomStudents.map((s) => [String(s.position), s.studentName, `${this.formatAverage(s.average)}%`])
        : [['—', 'No student data', '—']],
      columnStyles: {
        0: { cellWidth: 18 },
        2: { cellWidth: 32 }
      },
      didParseCell: this.pdfColumnAlign({ 0: 'center', 1: 'left', 2: 'center' })
    });

    if (this.selectedSubjectId && this.gradeDistribution.length) {
      y = (doc as any).lastAutoTable.finalY + 10;
      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      const subjectName =
        this.markSheetData?.subjects?.find((s: any) => s.id === this.selectedSubjectId)?.name || 'Selected subject';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...navy);
      doc.text(`Grade distribution — ${subjectName}`, marginX, y);
      y += 3;

      autoTable(doc, {
        ...tableBase,
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [['Grade / attainment', 'Students']],
        body: this.gradeDistribution.map((g) => [g.label, String(g.count)]),
        columnStyles: {
          1: { cellWidth: 28 }
        },
        didParseCell: this.pdfColumnAlign({ 0: 'left', 1: 'center' })
      });
    }

    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...navy);
    doc.text('Class ranking (core average)', marginX, 18);

    autoTable(doc, {
      ...tableBase,
      startY: 22,
      margin: { left: marginX, right: marginX },
      head: [['Position', 'Student name', 'Core average']],
      body: this.allStudentsRanked.length
        ? this.allStudentsRanked.map((s) => [
            String(s.position),
            s.studentName,
            `${this.formatAverage(s.average)}%`
          ])
        : [['—', 'No student data', '—']],
      columnStyles: {
        0: { cellWidth: 24 },
        2: { cellWidth: 34 }
      },
      didParseCell: this.pdfColumnAlign({ 0: 'center', 1: 'left', 2: 'center' })
    });

    if (this.selectedStudentBars.length && this.selectedStudentName) {
      const student = this.selectedStudentRank;
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...navy);
      doc.text(`Individual subject scores — ${this.selectedStudentName}`, marginX, 18);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Position ${student?.position ?? '—'} / ${this.allStudentsRanked.length} · Core average ${
          student ? this.formatAverage(student.average) : '—'
        }%`,
        marginX,
        24
      );

      autoTable(doc, {
        ...tableBase,
        startY: 28,
        margin: { left: marginX, right: marginX },
        head: [['Subject', 'Score', '%', 'Grade']],
        body: this.selectedStudentBars.map((bar) => [
          bar.name,
          bar.score != null
            ? `${bar.score}${bar.maxScore != null ? `/${bar.maxScore}` : ''}`
            : '—',
          `${bar.percentage}%`,
          bar.grade
        ]),
        columnStyles: {
          1: { cellWidth: 28 },
          2: { cellWidth: 22 },
          3: { cellWidth: 36 }
        },
        didParseCell: this.pdfColumnAlign({
          0: 'left',
          1: 'center',
          2: 'center',
          3: 'center'
        })
      });
    }

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(`Page ${i} of ${totalPages}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, {
        align: 'center'
      });
    }

    return doc;
  }
}

import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import {
  computeCoreMarkSheetTotals,
  formatMarkSheetAverage,
  sortMarkSheetSubjectsForDisplay
} from '../../../utils/mark-sheet-subject-order';
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
  loading = false;
  loadingClasses = false;
  loadingTerms = false;
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
    const students = this.allStudentsRanked.length;
    const subjects = this.markSheetData?.subjects?.length || 0;
    const classAverage =
      students > 0
        ? Math.round((this.allStudentsRanked.reduce((sum, row) => sum + row.average, 0) / students) * 10) / 10
        : 0;
    const passCount = this.allStudentsRanked.filter((row) => row.average >= 70).length;
    const passRate = students > 0 ? Math.round((passCount / students) * 1000) / 10 : 0;
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
    this.updateGradeDistribution();
  }

  private computeSubjectPassRate(subjectId: string, rows: any[]): number {
    if (!rows.length) {
      return 0;
    }
    let passed = 0;
    for (const row of rows) {
      const pct = this.getSubjectPercentage(row, subjectId);
      if (pct >= 70) {
        passed++;
      }
    }
    return Math.round((passed / rows.length) * 1000) / 10;
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
}

import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { SettingsService } from '../../services/settings.service';
import { ClassService } from '../../services/class.service';
import { SubjectService } from '../../services/subject.service';
import { AuthService } from '../../services/auth.service';
import { PromotionRuleService } from '../../services/promotion-rule.service';

export interface AcademicTermRecord {
  id: string;
  type: string;
  label: string;
  term: string;
  year: string;
  startDate: string;
  endDate: string;
}

export type AcademicSettingsTab =
  | 'terms'
  | 'classes'
  | 'subjects'
  | 'departments'
  | 'report-releases'
  | 'grading-system';

@Component({
  standalone: false,
  selector: 'app-academic-settings',
  templateUrl: './academic-settings.component.html',
  styleUrls: ['./academic-settings.component.css']
})
export class AcademicSettingsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly tabs: { id: AcademicSettingsTab; label: string; icon: string }[] = [
    { id: 'terms', label: 'Terms', icon: '📅' },
    { id: 'classes', label: 'Classes', icon: '🏫' },
    { id: 'subjects', label: 'Subjects', icon: '📚' },
    { id: 'departments', label: 'Departments', icon: '🏛️' },
    { id: 'report-releases', label: 'Report Releases', icon: '📋' },
    { id: 'grading-system', label: 'Grading System', icon: '🏆' }
  ];

  activeTab: AcademicSettingsTab = 'terms';
  loading = false;
  saving = false;
  error = '';
  success = '';

  terms: AcademicTermRecord[] = [];
  termSearch = '';
  yearFilter = 'all';

  classes: any[] = [];
  subjects: any[] = [];
  classSearch = '';
  classFormFilter = 'all';
  classPageSize = 5;
  classCurrentPage = 1;
  readonly classPageSizeOptions = [5, 10, 20, 50];
  deletingClassId: string | null = null;
  subjectSearch = '';
  subjectsLoading = false;
  deletingSubjectId: string | null = null;

  settings: any = {
    classLevels: [],
    gradeThresholds: {},
    gradeLabels: {},
    academicYear: '',
    activeTerm: '',
    currentTerm: ''
  };

  termModalOpen = false;
  editingTerm: AcademicTermRecord | null = null;
  termForm: AcademicTermRecord = this.emptyTermForm();

  newClassLevel = '';
  promotionRules: any[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private settingsService: SettingsService,
    private classService: ClassService,
    private subjectService: SubjectService,
    private authService: AuthService,
    private promotionRuleService: PromotionRuleService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const tab = (params.get('tab') || 'terms') as AcademicSettingsTab;
      const prev = this.activeTab;
      this.activeTab = this.tabs.some(t => t.id === tab) ? tab : 'terms';
      if (this.activeTab === 'subjects' && prev !== 'subjects') {
        this.loadSubjectsList();
      }
    });
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isDemoUser(): boolean {
    return this.authService.getCurrentUser()?.isDemo === true;
  }

  canEditGrading(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
  }

  navigateTab(tab: AcademicSettingsTab): void {
    this.router.navigate(['/academic-settings', tab]);
  }

  private emptyTermForm(): AcademicTermRecord {
    return {
      id: '',
      type: 'Regular',
      label: '',
      term: '',
      year: new Date().getFullYear().toString(),
      startDate: '',
      endDate: ''
    };
  }

  loadAll(): void {
    this.loading = true;
    this.error = '';
    this.settingsService
      .getSettings()
      .pipe(
        timeout(60000),
        takeUntil(this.destroy$),
        finalize(() => {
          this.loading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (data: any) => {
          try {
            if (data) {
              Object.assign(this.settings, data);
            }
            this.terms = this.normalizeTerms(data?.academicTerms);
            if (this.terms.length === 0) {
              this.terms = this.seedTermsFromLegacySettings(data);
            }
            this.restoreClassLevelsFromCache();
            this.ensureGradingDefaults();
          } catch (e) {
            console.error('[AcademicSettings] Failed to process settings:', e);
            this.error = 'Failed to process academic settings.';
            this.ensureGradingDefaults();
          }
          this.cdr.detectChanges();
        },
        error: (err) => {
          if (err?.name === 'TimeoutError') {
            this.error = 'Request timed out. Check that the backend is running and try again.';
          } else {
            this.error = err?.error?.message || err?.message || 'Failed to load academic settings.';
          }
          this.ensureGradingDefaults();
          this.cdr.detectChanges();
        }
      });

    this.loadClassesList();

    this.loadSubjectsList();

    this.promotionRuleService
      .getPromotionRules()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rules) => {
          this.promotionRules = rules || [];
          this.cdr.detectChanges();
        },
        error: () => {
          this.promotionRules = [];
        }
      });
  }

  private normalizeTerms(raw: any): AcademicTermRecord[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map((t, i) => ({
      id: t.id || `term-${i}`,
      type: t.type || 'Regular',
      label: t.label || '',
      term: t.term || '',
      year: String(t.year || ''),
      startDate: t.startDate ? String(t.startDate).split('T')[0] : '',
      endDate: t.endDate ? String(t.endDate).split('T')[0] : ''
    }));
  }

  private seedTermsFromLegacySettings(data: any): AcademicTermRecord[] {
    const termName = String(data?.activeTerm || data?.currentTerm || '').trim();
    if (!termName) {
      return [];
    }
    const yearMatch = termName.match(/\d{4}/);
    return [{
      id: 'legacy-1',
      type: 'Regular',
      label: this.shortLabel(termName),
      term: termName,
      year: yearMatch ? yearMatch[0] : String(data?.academicYear || new Date().getFullYear()),
      startDate: data?.termStartDate ? new Date(data.termStartDate).toISOString().split('T')[0] : '',
      endDate: data?.termEndDate ? new Date(data.termEndDate).toISOString().split('T')[0] : ''
    }];
  }

  private shortLabel(term: unknown): string {
    const s = String(term ?? '').trim();
    if (!s) {
      return '';
    }
    const m = s.match(/Term\s*(\d)/i);
    return m ? `T${m[1]}` : s.slice(0, 6);
  }

  get filteredTerms(): AcademicTermRecord[] {
    const q = this.termSearch.trim().toLowerCase();
    return this.terms.filter(t => {
      if (this.yearFilter !== 'all' && String(t.year) !== this.yearFilter) {
        return false;
      }
      if (!q) {
        return true;
      }
      return [t.type, t.label, t.term, t.year].some(v => String(v).toLowerCase().includes(q));
    });
  }

  get yearFilterOptions(): string[] {
    const years = new Set(this.terms.map(t => String(t.year)).filter(Boolean));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }

  getTermStatus(term: AcademicTermRecord): 'Active' | 'Upcoming' | 'Completed' {
    if (!term.startDate || !term.endDate) {
      if (term.term === this.settings.activeTerm) {
        return 'Active';
      }
      return 'Upcoming';
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(term.startDate);
    const end = new Date(term.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    if (today < start) {
      return 'Upcoming';
    }
    if (today > end) {
      return 'Completed';
    }
    return 'Active';
  }

  formatDuration(term: AcademicTermRecord): string {
    if (!term.startDate || !term.endDate) {
      return '—';
    }
    const start = new Date(term.startDate);
    const end = new Date(term.endDate);
    const ms = end.getTime() - start.getTime();
    if (ms < 0) {
      return '—';
    }
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const weeks = Math.floor(days / 7);
    const rem = days % 7;
    if (weeks > 0) {
      return rem > 0 ? `${weeks}w ${rem}d` : `${weeks}w`;
    }
    return `${days}d`;
  }

  formatDisplayDate(iso: string): string {
    if (!iso) {
      return '—';
    }
    const d = new Date(iso);
    if (isNaN(d.getTime())) {
      return iso;
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  openAddTerm(): void {
    this.editingTerm = null;
    this.termForm = this.emptyTermForm();
    this.termModalOpen = true;
  }

  openEditTerm(term: AcademicTermRecord): void {
    this.editingTerm = term;
    this.termForm = { ...term };
    this.termModalOpen = true;
  }

  closeTermModal(): void {
    this.termModalOpen = false;
    this.editingTerm = null;
  }

  saveTermModal(): void {
    if (!this.termForm.term?.trim() || !this.termForm.year?.trim()) {
      this.error = 'Term name and year are required.';
      return;
    }
    if (!this.termForm.label?.trim()) {
      this.termForm.label = this.shortLabel(this.termForm.term);
    }
    if (this.editingTerm) {
      const idx = this.terms.findIndex(t => t.id === this.editingTerm!.id);
      if (idx >= 0) {
        this.terms[idx] = { ...this.termForm, id: this.editingTerm.id };
      }
    } else {
      this.terms.push({
        ...this.termForm,
        id: `term-${Date.now()}`
      });
    }
    this.closeTermModal();
    this.persistTerms();
  }

  persistTerms(): void {
    if (this.isDemoUser()) {
      this.error = 'Demo accounts cannot modify terms.';
      return;
    }
    this.saving = true;
    this.error = '';
    const active = this.terms.find(t => this.getTermStatus(t) === 'Active') || this.terms[this.terms.length - 1];
    const payload = {
      ...this.settings,
      academicTerms: this.terms,
      activeTerm: active?.term || this.settings.activeTerm,
      currentTerm: active?.term || this.settings.currentTerm,
      academicYear: active?.year || this.settings.academicYear,
      termStartDate: active?.startDate || null,
      termEndDate: active?.endDate || null
    };
    this.settingsService.updateSettings(payload).subscribe({
      next: () => {
        this.success = 'Academic terms saved successfully.';
        this.saving = false;
        setTimeout(() => (this.success = ''), 4000);
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to save terms.';
        this.saving = false;
      }
    });
  }

  validateGradeThresholds(): void {
    if (!this.settings.gradeThresholds) {
      return;
    }
    const thresholds = {
      excellent: Number(this.settings.gradeThresholds.excellent) || 0,
      veryGood: Number(this.settings.gradeThresholds.veryGood) || 0,
      good: Number(this.settings.gradeThresholds.good) || 0,
      satisfactory: Number(this.settings.gradeThresholds.satisfactory) || 0,
      needsImprovement: Number(this.settings.gradeThresholds.needsImprovement) || 0,
      basic: Number(this.settings.gradeThresholds.basic || 1) || 0
    };
    if (
      thresholds.excellent < thresholds.veryGood ||
      thresholds.veryGood < thresholds.good ||
      thresholds.good < thresholds.satisfactory ||
      thresholds.satisfactory < thresholds.needsImprovement ||
      thresholds.needsImprovement < thresholds.basic
    ) {
      this.error =
        'Grade thresholds must be in descending order (Excellent ≥ Very Good ≥ Good ≥ Satisfactory ≥ Needs Improvement ≥ Basic)';
      setTimeout(() => (this.error = ''), 5000);
    } else if (this.error?.includes('Grade thresholds')) {
      this.error = '';
    }
  }

  private validateGradingForSave(): boolean {
    if (!this.canEditGrading()) {
      this.error = 'Only Administrators and Super Admins can modify grade thresholds and labels.';
      return false;
    }
    if (!this.settings.gradeThresholds || !this.settings.gradeLabels) {
      this.error = 'Grading settings are not loaded.';
      return false;
    }
    this.validateGradeThresholds();
    if (this.error?.includes('Grade thresholds')) {
      return false;
    }
    const thresholds = {
      excellent: Number(this.settings.gradeThresholds.excellent),
      veryGood: Number(this.settings.gradeThresholds.veryGood),
      good: Number(this.settings.gradeThresholds.good),
      satisfactory: Number(this.settings.gradeThresholds.satisfactory),
      needsImprovement: Number(this.settings.gradeThresholds.needsImprovement),
      basic: Number(this.settings.gradeThresholds.basic || 1)
    };
    if (
      thresholds.excellent < thresholds.veryGood ||
      thresholds.veryGood < thresholds.good ||
      thresholds.good < thresholds.satisfactory ||
      thresholds.satisfactory < thresholds.needsImprovement ||
      thresholds.needsImprovement < thresholds.basic
    ) {
      this.error =
        'Grade thresholds must be in descending order (Excellent ≥ Very Good ≥ Good ≥ Satisfactory ≥ Needs Improvement ≥ Basic)';
      return false;
    }
    if (
      thresholds.excellent > 100 ||
      thresholds.excellent < 0 ||
      thresholds.veryGood > 100 ||
      thresholds.veryGood < 0 ||
      thresholds.good > 100 ||
      thresholds.good < 0 ||
      thresholds.satisfactory > 100 ||
      thresholds.satisfactory < 0 ||
      thresholds.needsImprovement > 100 ||
      thresholds.needsImprovement < 0 ||
      thresholds.basic > 100 ||
      thresholds.basic < 0
    ) {
      this.error = 'All grade thresholds must be between 0 and 100';
      return false;
    }
    const labelChecks: { key: string; label: string }[] = [
      { key: 'excellent', label: 'Excellent' },
      { key: 'veryGood', label: 'Very Good' },
      { key: 'good', label: 'Good' },
      { key: 'satisfactory', label: 'Satisfactory' },
      { key: 'needsImprovement', label: 'Needs Improvement' },
      { key: 'basic', label: 'Basic' },
      { key: 'fail', label: 'Fail' }
    ];
    for (const { key, label } of labelChecks) {
      const v = (this.settings.gradeLabels[key] || '').toString().trim();
      if (!v) {
        this.error = `Grade label for ${label} is required`;
        return false;
      }
    }
    this.settings.gradeThresholds.excellent = thresholds.excellent;
    this.settings.gradeThresholds.veryGood = thresholds.veryGood;
    this.settings.gradeThresholds.good = thresholds.good;
    this.settings.gradeThresholds.satisfactory = thresholds.satisfactory;
    this.settings.gradeThresholds.needsImprovement = thresholds.needsImprovement;
    this.settings.gradeThresholds.basic = thresholds.basic;
    for (const { key } of labelChecks) {
      this.settings.gradeLabels[key] = this.settings.gradeLabels[key].toString().trim();
    }
    return true;
  }

  private ensureGradingDefaults(): void {
    if (!this.settings.gradeThresholds) {
      this.settings.gradeThresholds = {
        excellent: 90,
        veryGood: 80,
        good: 60,
        satisfactory: 40,
        needsImprovement: 20,
        basic: 1
      };
    }
    if (!this.settings.gradeLabels) {
      this.settings.gradeLabels = {
        excellent: 'OUTSTANDING',
        veryGood: 'VERY HIGH',
        good: 'HIGH',
        satisfactory: 'GOOD',
        needsImprovement: 'ASPIRING',
        basic: 'BASIC',
        fail: 'UNCLASSIFIED'
      };
    }
    if (!this.settings.gradeLabels.fail) {
      this.settings.gradeLabels.fail = 'UNCLASSIFIED';
    }
  }

  saveGradingSettings(): void {
    if (this.isDemoUser()) {
      return;
    }
    if (!this.validateGradingForSave()) {
      return;
    }
    this.saving = true;
    this.error = '';
    this.settingsService
      .updateSettings({
        gradeThresholds: { ...this.settings.gradeThresholds },
        gradeLabels: { ...this.settings.gradeLabels }
      })
      .subscribe({
      next: () => {
        this.success = 'Grading settings saved.';
        this.saving = false;
        setTimeout(() => (this.success = ''), 4000);
      },
      error: () => {
        this.error = 'Failed to save grading settings.';
        this.saving = false;
      }
    });
  }

  addClassLevel(): void {
    const v = (this.newClassLevel || '').trim();
    if (!v) {
      return;
    }
    if (!Array.isArray(this.settings.classLevels)) {
      this.settings.classLevels = [];
    }
    if (!this.settings.classLevels.includes(v)) {
      this.settings.classLevels.push(v);
    }
    this.newClassLevel = '';
    this.persistClassLevelsToCache();
  }

  removeClassLevel(i: number): void {
    this.settings.classLevels.splice(i, 1);
    this.persistClassLevelsToCache();
  }

  private persistClassLevelsToCache(): void {
    try {
      localStorage.setItem('settings_classLevels', JSON.stringify(this.settings.classLevels || []));
    } catch (_) {}
  }

  private restoreClassLevelsFromCache(): void {
    try {
      const cached = localStorage.getItem('settings_classLevels');
      if (cached) {
        const arr = JSON.parse(cached);
        if (Array.isArray(arr)) {
          this.settings.classLevels = arr;
        }
      }
    } catch (_) {}
  }

  get classFormFilterOptions(): string[] {
    const forms = new Set(
      this.classes.map(c => String(c.form || '').trim()).filter(Boolean)
    );
    return Array.from(forms).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  get classesAfterFilter(): any[] {
    const q = this.classSearch.trim().toLowerCase();
    return this.classes.filter(c => {
      if (this.classFormFilter !== 'all') {
        const form = String(c.form || '').trim();
        if (form !== this.classFormFilter) {
          return false;
        }
      }
      if (!q) {
        return true;
      }
      return [c.name, c.classid, c.form].some(v =>
        String(v || '').toLowerCase().includes(q)
      );
    });
  }

  get classTotalPages(): number {
    const n = this.classesAfterFilter.length;
    return Math.max(1, Math.ceil(n / this.classPageSize) || 1);
  }

  get paginatedClasses(): any[] {
    const start = (this.classCurrentPage - 1) * this.classPageSize;
    return this.classesAfterFilter.slice(start, start + this.classPageSize);
  }

  get classPaginationLabel(): string {
    const total = this.classesAfterFilter.length;
    if (total === 0) {
      return '0 of 0';
    }
    const start = (this.classCurrentPage - 1) * this.classPageSize + 1;
    const end = Math.min(this.classCurrentPage * this.classPageSize, total);
    return `${start}-${end} of ${total}`;
  }

  getStudentCount(cls: any): number {
    if (typeof cls?.studentCount === 'number') {
      return cls.studentCount;
    }
    return Array.isArray(cls?.students) ? cls.students.length : 0;
  }

  onClassSearchChange(): void {
    this.classCurrentPage = 1;
  }

  onClassFormFilterChange(): void {
    this.classCurrentPage = 1;
  }

  clearClassFilters(): void {
    this.classSearch = '';
    this.classFormFilter = 'all';
    this.classCurrentPage = 1;
  }

  onClassPageSizeChange(size: number | string): void {
    this.classPageSize = Number(size) || 5;
    this.classCurrentPage = 1;
  }

  goToClassPage(page: number): void {
    if (page < 1 || page > this.classTotalPages) {
      return;
    }
    this.classCurrentPage = page;
  }

  private loadClassesList(): void {
    this.classService
      .getClassesPaginated(1, 1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.classes = res?.data || [];
          if (!Array.isArray(this.classes)) {
            this.classes = [];
          }
          if (this.classCurrentPage > this.classTotalPages) {
            this.classCurrentPage = this.classTotalPages;
          }
          this.cdr.detectChanges();
        },
        error: () => {
          this.classes = [];
          this.cdr.detectChanges();
        }
      });
  }

  addClass(): void {
    this.router.navigate(['/classes/new']);
  }

  getCleanClassId(id: unknown): string {
    if (!id) {
      return '';
    }
    let cleanId = String(id).trim();
    if (cleanId.includes(':')) {
      cleanId = cleanId.split(':')[0].trim();
    }
    return cleanId;
  }

  deleteClass(cls: any): void {
    const id = this.getCleanClassId(cls?.id);
    if (!id || this.isDemoUser()) {
      return;
    }
    const name = cls?.name || 'this class';
    if (!confirm(`Delete class "${name}"? This cannot be undone.`)) {
      return;
    }
    this.deletingClassId = id;
    this.error = '';
    this.classService.deleteClass(id).subscribe({
      next: () => {
        this.deletingClassId = null;
        this.success = `Class "${name}" deleted.`;
        this.classes = this.classes.filter(c => this.getCleanClassId(c.id) !== id);
        if (this.classCurrentPage > this.classTotalPages) {
          this.classCurrentPage = this.classTotalPages;
        }
        this.cdr.detectChanges();
        setTimeout(() => (this.success = ''), 5000);
      },
      error: (err) => {
        this.deletingClassId = null;
        this.error = err?.error?.message || 'Failed to delete class.';
        this.cdr.detectChanges();
      }
    });
  }

  get filteredSubjects(): any[] {
    const q = this.subjectSearch.trim().toLowerCase();
    if (!q) {
      return this.subjects;
    }
    return this.subjects.filter(s =>
      [s.name, s.code, s.description].some(v => String(v || '').toLowerCase().includes(q))
    );
  }

  loadSubjectsList(): void {
    this.subjectsLoading = true;
    this.subjectService
      .getSubjects()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.subjectsLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (data) => {
          this.subjects = Array.isArray(data) ? data : [];
        },
        error: (err) => {
          this.subjects = [];
          this.error = err?.error?.message || err?.message || 'Failed to load subjects.';
          setTimeout(() => (this.error = ''), 5000);
        }
      });
  }

  addSubject(): void {
    this.router.navigate(['/subjects/new']);
  }

  editSubject(id: string): void {
    if (!id) {
      return;
    }
    this.router.navigate(['/subjects', id, 'edit']);
  }

  deleteSubject(sub: any): void {
    if (!sub?.id || this.isDemoUser()) {
      return;
    }
    const name = sub.name || 'this subject';
    const code = sub.code ? ` (${sub.code})` : '';
    if (!confirm(`Are you sure you want to delete subject "${name}"${code}? This action cannot be undone.`)) {
      return;
    }
    this.deletingSubjectId = sub.id;
    this.error = '';
    this.subjectService.deleteSubject(sub.id).subscribe({
      next: (data: any) => {
        this.deletingSubjectId = null;
        this.subjects = this.subjects.filter(s => s.id !== sub.id);
        this.success = data?.message || 'Subject deleted successfully.';
        this.cdr.detectChanges();
        setTimeout(() => (this.success = ''), 5000);
      },
      error: (err) => {
        this.deletingSubjectId = null;
        this.error = err?.error?.message || 'Failed to delete subject.';
        this.cdr.detectChanges();
        setTimeout(() => (this.error = ''), 5000);
      }
    });
  }

  goToPublishResults(): void {
    this.router.navigate(['/publish-results']);
  }

  goToClassPromotion(): void {
    this.router.navigate(['/admin/class-promotion']);
  }
}

import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { AppraisalService } from '../../../services/appraisal.service';
import { AuthService } from '../../../services/auth.service';
import { TeacherService } from '../../../services/teacher.service';

type HubTab =
  | 'dashboard'
  | 'cycles'
  | 'criteria'
  | 'peers'
  | 'evaluate'
  | 'my-results'
  | 'feedback'
  | 'goals';

@Component({
  standalone: false,
  selector: 'app-teacher-appraisal',
  templateUrl: './teacher-appraisal.component.html',
  styleUrls: ['./teacher-appraisal.component.css'],
})
export class TeacherAppraisalComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  loading = false;
  saving = false;
  error = '';
  success = '';
  activeTab: HubTab = 'dashboard';

  cycles: any[] = [];
  criteria: any[] = [];
  teachers: any[] = [];
  dashboard: any = null;
  peerAssignments: any[] = [];
  myPeerTargets: any[] = [];
  history: any = null;
  goals: any[] = [];

  selectedCycleId = '';
  evalTeacherId = '';
  evalSourceType: 'self' | 'supervisor' | 'peer' | 'student' | 'parent' = 'self';
  evalComments = '';
  scoreDraft: Record<string, { score: number | null; comment: string }> = {};

  cycleForm: any = {
    name: '',
    startDate: '',
    endDate: '',
    status: 'draft',
    sourceWeights: { self: 20, supervisor: 40, peer: 20, student: 10, parent: 10 },
  };
  editingCycleId: string | null = null;

  criterionForm: any = {
    name: '',
    description: '',
    weight: 1,
    scaleMin: 1,
    scaleMax: 5,
    sortOrder: 0,
  };
  editingCriterionId: string | null = null;

  peerForm = { evaluatorTeacherId: '', targetTeacherId: '' };
  goalForm: any = { description: '', status: 'open', followUpCycleId: '' };

  isLeadership = false;
  isTeacher = false;
  isParent = false;
  isStudent = false;
  myTeacherId: string | null = null;

  constructor(
    private appraisalService: AppraisalService,
    private authService: AuthService,
    private teacherService: TeacherService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    const role = String(user?.role || '').toLowerCase();
    this.isLeadership = ['superadmin', 'director', 'admin', 'headmaster', 'deputy_headmaster'].includes(role);
    this.isTeacher = role === 'teacher' || !!user?.teacher;
    this.isParent = role === 'parent' || !!user?.parent;
    this.isStudent = role === 'student' || !!user?.student;
    this.myTeacherId = user?.teacher?.id || null;

    if (this.isParent || this.isStudent) this.activeTab = 'feedback';
    else if (this.isTeacher && !this.isLeadership) this.activeTab = 'my-results';
    else this.activeTab = 'dashboard';

    this.bootstrap();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get tabs(): { id: HubTab; label: string }[] {
    if (this.isParent || this.isStudent) {
      return [{ id: 'feedback', label: 'Teacher feedback' }];
    }
    const tabs: { id: HubTab; label: string }[] = [];
    if (this.isLeadership) {
      tabs.push(
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'cycles', label: 'Cycles' },
        { id: 'criteria', label: 'Criteria' },
        { id: 'peers', label: 'Peer assignments' },
        { id: 'evaluate', label: 'Evaluate' }
      );
    }
    if (this.isTeacher || this.isLeadership) {
      if (!tabs.find((t) => t.id === 'evaluate')) tabs.push({ id: 'evaluate', label: 'Evaluate' });
      tabs.push({ id: 'my-results', label: 'My results' }, { id: 'goals', label: 'Goals' });
    }
    return tabs;
  }

  setTab(tab: HubTab): void {
    this.activeTab = tab;
    this.clearAlerts();
    if (tab === 'dashboard') this.loadDashboard();
    if (tab === 'peers') this.loadPeers();
    if (tab === 'evaluate') this.prepareEvaluate();
    if (tab === 'my-results') this.loadMyResults();
    if (tab === 'goals') this.loadGoals();
    if (tab === 'feedback') this.prepareFeedback();
  }

  clearAlerts(): void {
    this.error = '';
    this.success = '';
  }

  private bootstrap(): void {
    this.loading = true;
    this.appraisalService
      .listCycles()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.cycles = res?.data || [];
          const active = this.cycles.find((c) => c.status === 'active') || this.cycles[0];
          this.selectedCycleId = active?.id || '';
          this.loadCriteria();
          this.loadTeachers();
          if (this.isLeadership) this.loadDashboard();
          if (this.isTeacher && !this.myTeacherId) this.resolveMyTeacher();
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to load appraisal cycles';
          this.loading = false;
        },
      });
  }

  private resolveMyTeacher(): void {
    this.teacherService
      .getTeachers(1, 1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (list: any) => {
          const user = this.authService.getCurrentUser();
          const teachers = Array.isArray(list) ? list : list?.data || [];
          const me = teachers.find((t: any) => t.userId === user?.id || t.user?.id === user?.id);
          if (me) this.myTeacherId = me.id;
        },
        error: () => {},
      });
  }

  loadCriteria(): void {
    this.appraisalService.listCriteria().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.criteria = (res?.data || []).filter((c: any) => c.isActive !== false);
        this.resetScoreDraft();
      },
    });
  }

  loadTeachers(): void {
    this.appraisalService.listTeachers().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.teachers = res?.data || [];
      },
    });
  }

  loadDashboard(): void {
    if (!this.isLeadership) return;
    this.appraisalService
      .getDashboard(this.selectedCycleId || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.dashboard = res;
          if (res?.cycle?.id) this.selectedCycleId = res.cycle.id;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to load dashboard';
        },
      });
  }

  onCycleFilterChange(): void {
    if (this.activeTab === 'dashboard') this.loadDashboard();
    if (this.activeTab === 'peers') this.loadPeers();
    if (this.activeTab === 'my-results') this.loadMyResults();
    if (this.activeTab === 'evaluate') this.prepareEvaluate();
    if (this.activeTab === 'goals') this.loadGoals();
  }

  // Cycles CRUD
  editCycle(cycle: any): void {
    this.editingCycleId = cycle.id;
    this.cycleForm = {
      name: cycle.name,
      startDate: String(cycle.startDate || '').slice(0, 10),
      endDate: String(cycle.endDate || '').slice(0, 10),
      status: cycle.status,
      sourceWeights: {
        self: cycle.sourceWeights?.self ?? 20,
        supervisor: cycle.sourceWeights?.supervisor ?? 40,
        peer: cycle.sourceWeights?.peer ?? 20,
        student: cycle.sourceWeights?.student ?? 10,
        parent: cycle.sourceWeights?.parent ?? 10,
      },
    };
  }

  resetCycleForm(): void {
    this.editingCycleId = null;
    this.cycleForm = {
      name: '',
      startDate: '',
      endDate: '',
      status: 'draft',
      sourceWeights: { self: 20, supervisor: 40, peer: 20, student: 10, parent: 10 },
    };
  }

  saveCycle(): void {
    this.saving = true;
    this.clearAlerts();
    const req$ = this.editingCycleId
      ? this.appraisalService.updateCycle(this.editingCycleId, this.cycleForm)
      : this.appraisalService.createCycle(this.cycleForm);
    req$.pipe(finalize(() => (this.saving = false)), takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.success = 'Cycle saved.';
        this.resetCycleForm();
        this.bootstrap();
      },
      error: (err) => (this.error = err?.error?.message || 'Failed to save cycle'),
    });
  }

  // Criteria CRUD
  editCriterion(c: any): void {
    this.editingCriterionId = c.id;
    this.criterionForm = {
      name: c.name,
      description: c.description || '',
      weight: Number(c.weight) || 1,
      scaleMin: Number(c.scaleMin) || 1,
      scaleMax: Number(c.scaleMax) || 5,
      sortOrder: Number(c.sortOrder) || 0,
    };
  }

  resetCriterionForm(): void {
    this.editingCriterionId = null;
    this.criterionForm = { name: '', description: '', weight: 1, scaleMin: 1, scaleMax: 5, sortOrder: 0 };
  }

  saveCriterion(): void {
    this.saving = true;
    this.clearAlerts();
    const req$ = this.editingCriterionId
      ? this.appraisalService.updateCriterion(this.editingCriterionId, this.criterionForm)
      : this.appraisalService.createCriterion(this.criterionForm);
    req$.pipe(finalize(() => (this.saving = false)), takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.success = 'Criterion saved.';
        this.resetCriterionForm();
        this.loadCriteria();
      },
      error: (err) => (this.error = err?.error?.message || 'Failed to save criterion'),
    });
  }

  deactivateCriterion(id: string): void {
    this.appraisalService.deleteCriterion(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.success = 'Criterion deactivated.';
        this.loadCriteria();
      },
      error: (err) => (this.error = err?.error?.message || 'Failed to deactivate'),
    });
  }

  // Peers
  loadPeers(): void {
    if (!this.selectedCycleId) return;
    this.appraisalService.listPeerAssignments(this.selectedCycleId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => (this.peerAssignments = res?.data || []),
    });
  }

  savePeer(): void {
    if (!this.selectedCycleId) {
      this.error = 'Select a cycle first';
      return;
    }
    this.saving = true;
    this.appraisalService
      .createPeerAssignment({ cycleId: this.selectedCycleId, ...this.peerForm })
      .pipe(finalize(() => (this.saving = false)), takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.success = 'Peer assignment saved.';
          this.peerForm = { evaluatorTeacherId: '', targetTeacherId: '' };
          this.loadPeers();
        },
        error: (err) => (this.error = err?.error?.message || 'Failed to save assignment'),
      });
  }

  removePeer(id: string): void {
    this.appraisalService.deletePeerAssignment(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.loadPeers(),
    });
  }

  // Evaluate / feedback
  prepareEvaluate(): void {
    if (this.isTeacher && !this.isLeadership) {
      this.evalSourceType = 'self';
      this.evalTeacherId = this.myTeacherId || '';
    } else if (this.isLeadership) {
      this.evalSourceType = 'supervisor';
    }
    this.resetScoreDraft();
    if (this.selectedCycleId && this.isTeacher) {
      this.appraisalService.myPeerTargets(this.selectedCycleId).pipe(takeUntil(this.destroy$)).subscribe({
        next: (res) => (this.myPeerTargets = res?.data || []),
      });
    }
  }

  prepareFeedback(): void {
    this.evalSourceType = this.isParent ? 'parent' : 'student';
    this.resetScoreDraft();
  }

  resetScoreDraft(): void {
    this.scoreDraft = {};
    for (const c of this.criteria) {
      this.scoreDraft[c.id] = { score: null, comment: '' };
    }
  }

  onSourceTypeChange(): void {
    if (this.evalSourceType === 'self' && this.myTeacherId) {
      this.evalTeacherId = this.myTeacherId;
    }
  }

  submitAppraisal(): void {
    this.clearAlerts();
    if (!this.selectedCycleId || !this.evalTeacherId) {
      this.error = 'Select a cycle and teacher.';
      return;
    }
    const scores = this.criteria
      .map((c) => ({
        criterionId: c.id,
        score: Number(this.scoreDraft[c.id]?.score),
        comment: this.scoreDraft[c.id]?.comment || null,
      }))
      .filter((s) => Number.isFinite(s.score));

    if (!scores.length) {
      this.error = 'Enter at least one criterion score.';
      return;
    }

    this.saving = true;
    this.appraisalService
      .upsertAppraisal({
        teacherId: this.evalTeacherId,
        cycleId: this.selectedCycleId,
        sourceType: this.evalSourceType,
        comments: this.evalComments,
        scores,
        status: 'submitted',
      })
      .pipe(finalize(() => (this.saving = false)), takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.success = 'Appraisal submitted successfully.';
          this.evalComments = '';
          this.resetScoreDraft();
          if (this.isLeadership) this.loadDashboard();
        },
        error: (err) => (this.error = err?.error?.message || 'Failed to submit appraisal'),
      });
  }

  // Results + trends
  loadMyResults(): void {
    const teacherId = this.isLeadership && this.evalTeacherId ? this.evalTeacherId : this.myTeacherId;
    if (!teacherId) {
      // leadership can pick a teacher on this tab
      return;
    }
    this.appraisalService.getTeacherHistory(teacherId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.history = res;
        this.cdr.markForCheck();
      },
      error: (err) => (this.error = err?.error?.message || 'Failed to load results'),
    });
  }

  trendWidth(score: number | null | undefined): string {
    if (score == null) return '0%';
    const pct = Math.max(0, Math.min(100, (Number(score) / 5) * 100));
    return `${pct}%`;
  }

  downloadTeacherPdf(teacherId: string): void {
    if (!this.selectedCycleId) {
      this.error = 'Select a cycle first';
      return;
    }
    const url = this.appraisalService.teacherReportUrl(teacherId, this.selectedCycleId);
    this.appraisalService.downloadPdf(url, `teacher_appraisal_${teacherId}.pdf`);
  }

  downloadDeptPdf(): void {
    if (!this.selectedCycleId) {
      this.error = 'Select a cycle first';
      return;
    }
    const url = this.appraisalService.departmentReportUrl(this.selectedCycleId);
    this.appraisalService.downloadPdf(url, `appraisal_summary.pdf`);
  }

  // Goals
  loadGoals(): void {
    const filters: Record<string, string> = {};
    if (this.selectedCycleId) filters['cycleId'] = this.selectedCycleId;
    if (!this.isLeadership && this.myTeacherId) filters['teacherId'] = this.myTeacherId;
    if (this.isLeadership && this.evalTeacherId) filters['teacherId'] = this.evalTeacherId;
    this.appraisalService.listGoals(filters).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => (this.goals = res?.data || []),
    });
  }

  saveGoal(): void {
    const teacherId = this.isLeadership ? this.evalTeacherId || this.myTeacherId : this.myTeacherId;
    if (!teacherId || !this.selectedCycleId || !this.goalForm.description?.trim()) {
      this.error = 'Teacher, cycle and description are required.';
      return;
    }
    this.saving = true;
    this.appraisalService
      .upsertGoal({
        teacherId,
        cycleId: this.selectedCycleId,
        description: this.goalForm.description,
        status: this.goalForm.status,
        followUpCycleId: this.goalForm.followUpCycleId || null,
      })
      .pipe(finalize(() => (this.saving = false)), takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.success = 'Goal saved.';
          this.goalForm = { description: '', status: 'open', followUpCycleId: '' };
          this.loadGoals();
        },
        error: (err) => (this.error = err?.error?.message || 'Failed to save goal'),
      });
  }

  deleteGoal(id: string): void {
    this.appraisalService.deleteGoal(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.loadGoals(),
    });
  }

  teacherLabel(t: any): string {
    if (!t) return '—';
    return `${t.firstName || ''} ${t.lastName || ''}`.trim() + (t.teacherId ? ` (${t.teacherId})` : '');
  }
}

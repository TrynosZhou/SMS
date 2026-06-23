import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { activatePageLoad } from '../../utils/route-activation';
import { pdfBlobViewerUrl } from '../../utils/pdf-preview.util';
import { AuthService } from '../../services/auth.service';
import { SettingsService } from '../../services/settings.service';
import { StudentService } from '../../services/student.service';
import { TeacherService } from '../../services/teacher.service';
import { ClassService } from '../../services/class.service';
import { FinanceService } from '../../services/finance.service';
import { SubjectService } from '../../services/subject.service';
import { ModuleAccessService } from '../../services/module-access.service';
import { ThemeService } from '../../services/theme.service';
import { IncomingMessageNotificationService } from '../../services/incoming-message-notification.service';

export interface DashboardAdminHubTile {
  route: string;
  icon: string;
  title: string;
  desc: string;
  search: string;
  module?: string;
  accent?: 'violet' | 'sky' | 'emerald' | 'amber' | 'rose' | 'slate';
}

export interface DashboardAdminHubGroup {
  id: string;
  label: string;
  subtitle: string;
  tiles: DashboardAdminHubTile[];
}

export type DashboardModulePastel =
  | 'violet'
  | 'sky'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'pink'
  | 'slate';

export interface DashboardModuleShortcut {
  route: string;
  label: string;
  icon: string;
  pastel: DashboardModulePastel;
  module?: string;
  adminOnly?: boolean;
  desc?: string;
}

@Component({
  standalone: false,  selector: 'app-dashboard',
templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  moduleAccess: any = null;
  schoolName: string = '';
  schoolMotto: string = '';
  schoolLogo: string | null = null;
  schoolLogo2: string | null = null;
  showBulkMessage = false;
  displayedText: string = '';
  private textToggleInterval: any;
  private rotateTexts: string[] = [];
  private rotateIndex = 0;
  teacherName: string = '';

  studentManagementOpen = true;
  examManagementOpen = true;
  financeManagementOpen = true;
  reportsOpen = true;
  generalSettingsOpen = true;

  stats = {
    totalStudents: 0,
    totalTeachers: 0,
    totalClasses: 0,
    totalSubjects: 0,
    totalInvoices: 0,
    totalBalance: 0,
    totalInvoicedAmount: 0,
    totalPaidAmount: 0,
    dayScholars: 0,
    boarders: 0,
    staffChildren: 0
  };

  loadingStats = true;
  statsLastUpdated: Date | null = null;
  private readonly destroy$ = new Subject<void>();
recentStudents: any[] = [];
  recentInvoices: any[] = [];

  adminHubSearch = '';
  readonly statSkeletonSlots = [0, 1, 2, 3, 4, 5];
  unreadParentMessageCount = 0;

  readonly adminModuleShortcuts: DashboardModuleShortcut[] = [
    { route: '/students', label: 'Students', icon: '👥', pastel: 'violet', module: 'students' },
    { route: '/teachers', label: 'Teachers', icon: '👨‍🏫', pastel: 'sky', module: 'teachers' },
    { route: '/classes', label: 'Classes', icon: '🏫', pastel: 'emerald', module: 'classes' },
    { route: '/invoices', label: 'Billing', icon: '💳', pastel: 'rose', module: 'finance' },
    { route: '/attendance/mark', label: 'Attendance', icon: '📋', pastel: 'amber', module: 'attendance' },
    { route: '/report-cards', label: 'Reports', icon: '📊', pastel: 'violet', module: 'reportCards' },
    { route: '/messages/incoming', label: 'Messages', icon: '💬', pastel: 'pink' },
    { route: '/settings', label: 'Settings', icon: '⚙️', pastel: 'slate', module: 'settings' },
    {
      route: '/settings/payment-receipt-manager',
      label: 'Payment / Receipt',
      icon: '🧾',
      pastel: 'slate',
      adminOnly: true
    }
  ];

  readonly accountantModuleShortcuts: DashboardModuleShortcut[] = [
    { route: '/students', label: 'Students', icon: '👥', pastel: 'violet', module: 'students' },
    { route: '/invoices', label: 'Billing', icon: '💳', pastel: 'rose', module: 'finance' },
    { route: '/outstanding-balance', label: 'Outstanding', icon: '⚠️', pastel: 'amber', module: 'finance' },
    { route: '/payments/record', label: 'Record payment', icon: '💵', pastel: 'emerald', module: 'finance' },
    { route: '/balance-enquiry', label: 'Balance enquiry', icon: '🔎', pastel: 'sky', module: 'finance' },
    { route: '/attendance/reports', label: 'Attendance', icon: '📋', pastel: 'amber', module: 'attendance' },
    { route: '/report-cards', label: 'Reports', icon: '📊', pastel: 'violet', module: 'reportCards' },
    { route: '/classes', label: 'Classes', icon: '🏫', pastel: 'emerald', module: 'classes' },
    { route: '/messages/incoming', label: 'Messages', icon: '💬', pastel: 'pink' },
    { route: '/settings', label: 'Settings', icon: '⚙️', pastel: 'slate', module: 'settings' }
  ];

  readonly studentModuleShortcuts: DashboardModuleShortcut[] = [
    { route: '/student/report-card', label: 'Report Card', icon: '📄', pastel: 'violet', desc: 'Grades, remarks & PDF' },
    { route: '/student/invoice-statement', label: 'Invoice Statement', icon: '💰', pastel: 'sky', desc: 'Fees & payments' },
    { route: '/student/parent-portal', label: 'Parent Portal', icon: '👨‍👩‍👧', pastel: 'emerald', desc: 'View as parent' },
    { route: '/account/change-password', label: 'Change password', icon: '🔐', pastel: 'slate', desc: 'Update login' },
  ];

  readonly adminHubGroups: DashboardAdminHubGroup[] = [
    {
      id: 'people',
      label: 'People & structure',
      subtitle: 'Enroll students and staff, define classes and subjects',
      tiles: [
        { route: '/students/new', icon: '👥', title: 'Add student', desc: 'Register and enroll new learners', search: 'student enroll admission register learner', accent: 'violet' },
        { route: '/teachers/new', icon: '👨‍🏫', title: 'Add teacher', desc: 'Onboard staff and assignments', search: 'teacher staff hire faculty', accent: 'violet' },
        { route: '/classes/new', icon: '🏫', title: 'Add class', desc: 'Forms, streams, and grading', search: 'class form grade stream', accent: 'sky' },
        { route: '/subjects/new', icon: '📚', title: 'Add subject', desc: 'Build your course catalog', search: 'subject course syllabus catalog', accent: 'sky' },
        { route: '/students', icon: '📇', title: 'Student directory', desc: 'Browse and edit profiles', search: 'student list directory search', accent: 'sky' },
      ],
    },
    {
      id: 'academic',
      label: 'Academic operations',
      subtitle: 'Exams, attendance, and day-to-day teaching',
      tiles: [
        { route: '/exams', icon: '📋', title: 'Exams', desc: 'Schedules, types, and marks', search: 'exam test marks assessment', accent: 'amber' },
        { route: '/attendance/mark', icon: '✅', title: 'Mark attendance', desc: 'Daily rolls by class', search: 'attendance present absent register', accent: 'emerald' },
        { route: '/attendance/reports', icon: '📈', title: 'Attendance reports', desc: 'Class and term analytics', search: 'attendance report statistics analytics', accent: 'emerald' },
      ],
    },
    {
      id: 'finance',
      label: 'Finance',
      subtitle: 'Fees, billing, and balances',
      tiles: [
        { route: '/invoices', icon: '💰', title: 'Finance hub', desc: 'Invoices, payments, balances', search: 'invoice payment fees balance billing money', accent: 'rose' },
        { route: '/outstanding-balance', icon: '⚠️', title: 'Outstanding balances', desc: 'Who owes what', search: 'outstanding debt arrears balance', accent: 'rose' },
        { route: '/balance-enquiry', icon: '🔎', title: 'Balance enquiry', desc: 'Look up balances and invoice statements', search: 'balance enquiry statement invoice preview', accent: 'sky', module: 'finance' },
        { route: '/payments/record', icon: '💳', title: 'Record payment', desc: 'Post fee payments and receipts', search: 'record payment receipt cash', accent: 'emerald', module: 'finance' },
      ],
    },
    {
      id: 'reports',
      label: 'Reports & insight',
      subtitle: 'Report cards and academic insight',
      tiles: [
        { route: '/report-cards', icon: '📄', title: 'Report cards', desc: 'Generate and review PDFs', search: 'report card transcript grade', accent: 'violet' },
      ],
    },
    {
      id: 'admin',
      label: 'School administration',
      subtitle: 'Accounts, parents, and platform configuration',
      tiles: [
        { route: '/admin/manage-accounts', icon: '👤', title: 'Manage accounts', desc: 'Users, roles, and access', search: 'user account role login admin', accent: 'slate' },
        { route: '/admin/parents', icon: '👨‍👩‍👧', title: 'Parent management', desc: 'Guardian linking and outreach', search: 'parent guardian family portal', accent: 'slate' },
        { route: '/admin/class-promotion', icon: '⬆️', title: 'Class promotion', desc: 'Move cohorts to next level', search: 'promotion graduate advance year', accent: 'sky' },
        { route: '/admin/license-config', icon: '🔑', title: 'License configuration', desc: 'Plans, features, and tier access', search: 'license tier gold bronze platinum feature', accent: 'amber' },
        { route: '/settings', icon: '⚙️', title: 'School settings', desc: 'Branding, fees, terms, modules', search: 'settings configuration logo fees term', accent: 'slate' },
        {
          route: '/settings/payment-receipt-manager',
          icon: '🧾',
          title: 'Payment / Receipt Manager',
          desc: 'Payment logs, receipt numbers, and exports',
          search: 'payment receipt manager log sequence number',
          accent: 'slate'
        },
      ],
    },
  ];

  studentBalance: number = 0;
  loadingBalance = false;
  activeTerm: string = '';
  currencySymbol: string = '$';
  studentDataLastUpdated: Date | null = null;
  studentError = '';
  loadingInvoicePdf = false;
  showInvoicePdfViewer = false;
  invoiceModalSafePdfUrl: SafeResourceUrl | null = null;
  private invoiceModalPdfBlobUrl: string | null = null;
  invoiceModalNumber = '';
  invoiceModalId = '';
  invoiceModalBalance = 0;
  invoiceModalPdfError = false;

  private studentDataRetryCount = 0;
  private readonly MAX_STUDENT_DATA_RETRIES = 3;
  private statsLoadGeneration = 0;
  private unreadMessagesPollHandle: ReturnType<typeof setInterval> | null = null;
constructor(
    private authService: AuthService,
    private router: Router,
    private settingsService: SettingsService,
    private studentService: StudentService,
    private teacherService: TeacherService,
    private classService: ClassService,
    private financeService: FinanceService,
    private subjectService: SubjectService,
    private moduleAccessService: ModuleAccessService,
    public themeService: ThemeService,
    private incomingMessageNotifications: IncomingMessageNotificationService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
) {}

  ngOnInit() {
    if (this.isTeacher()) {
      this.loadingStats = false;
      this.router.navigate(['/teacher/dashboard']);
      return;
    }

    if (this.isParent()) {
      this.loadingStats = false;
      this.router.navigate(['/parent/dashboard']);
      return;
    }

    this.themeService.darkMode$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.cdr.markForCheck();
    });

    this.moduleAccessService.loadModuleAccess();
    this.loadSettings();
    if (this.canViewDashboardStats()) {
      activatePageLoad(this.router, this.destroy$, '/dashboard', () => {
        this.loadStatistics();
        this.loadUnreadParentMessageCount();
      });
      this.loadUnreadParentMessageCount();
      this.startUnreadMessagesPolling();
    } else {
      this.loadingStats = false;
}
    if (this.isStudent()) {
      this.loadStudentData();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopUnreadMessagesPolling();
    this.revokeInvoiceModalPdfUrl();
if (this.textToggleInterval) {
      clearInterval(this.textToggleInterval);
    }
  }

  private revokeInvoiceModalPdfUrl(): void {
    if (this.invoiceModalPdfBlobUrl) {
      window.URL.revokeObjectURL(this.invoiceModalPdfBlobUrl);
      this.invoiceModalPdfBlobUrl = null;
    }
  }

  private getStudentId(): string {
    const user = this.authService.getCurrentUser();
    return user?.student?.id || '';
  }

  loadStatistics() {
    if (!this.canViewDashboardStats()) {
      this.loadingStats = false;
      this.cdr.markForCheck();
      return;
    }

    const generation = ++this.statsLoadGeneration;
    this.loadingStats = true;
    this.cdr.markForCheck();

    const includeFinance = this.canAccessModule('finance');
    let pending = includeFinance ? 5 : 4;
    const finishIfCurrent = () => {
      pending = Math.max(0, pending - 1);
      if (pending === 0 && generation === this.statsLoadGeneration) {
        this.loadingStats = false;
        this.statsLastUpdated = new Date();
        this.cdr.markForCheck();
      }
    };

    this.studentService
      .getStudentsPaginated({ page: 1, limit: 5 })
      .pipe(finalize(finishIfCurrent))
      .subscribe({
        next: (response: any) => {
          if (generation !== this.statsLoadGeneration) return;
          const studentsArray = Array.isArray(response?.data) ? response.data : [];
          const statsObj = response?.stats || {};
          const totalFromStats = Number(statsObj['totalStudents'] || 0);
          this.stats.totalStudents =
            totalFromStats || Number(response?.total || studentsArray.length || 0);
          this.stats.dayScholars = Number(statsObj['totalDayScholars'] || 0);
          this.stats.boarders = Number(statsObj['totalBoarders'] || 0);
          this.stats.staffChildren = Number(statsObj['staffChildren'] || 0);
          this.recentStudents = [...studentsArray]
            .sort(
              (a: any, b: any) =>
                new Date(b.enrollmentDate || b.createdAt || 0).getTime() -
                new Date(a.enrollmentDate || a.createdAt || 0).getTime()
            )
            .slice(0, 5);
        },
        error: () => {
          if (generation !== this.statsLoadGeneration) return;
          this.stats.totalStudents = 0;
          this.stats.dayScholars = 0;
          this.stats.boarders = 0;
          this.stats.staffChildren = 0;
          this.recentStudents = [];
        }
      });

    this.teacherService
      .getTeachersPaginated(1, 1)
      .pipe(finalize(finishIfCurrent))
      .subscribe({
        next: (response: any) => {
          if (generation !== this.statsLoadGeneration) return;
          this.stats.totalTeachers = Number(response?.total || 0);
        },
        error: () => {
          if (generation !== this.statsLoadGeneration) return;
          this.stats.totalTeachers = 0;
        }
      });

    this.classService
      .getClassesPaginated(1, 1)
      .pipe(finalize(finishIfCurrent))
      .subscribe({
        next: (response: any) => {
          if (generation !== this.statsLoadGeneration) return;
          this.stats.totalClasses = Number(response?.total || 0);
        },
        error: () => {
          if (generation !== this.statsLoadGeneration) return;
          this.stats.totalClasses = 0;
        }
      });

    this.subjectService
      .getSubjects()
      .pipe(finalize(finishIfCurrent))
      .subscribe({
        next: (subjects: any[]) => {
          if (generation !== this.statsLoadGeneration) return;
          const subjectsArray = Array.isArray(subjects) ? subjects : [];
          this.stats.totalSubjects = subjectsArray.length;
        },
        error: () => {
          if (generation !== this.statsLoadGeneration) return;
          this.stats.totalSubjects = 0;
        }
      });

    if (includeFinance) {
      this.financeService
        .getInvoicesPaginated({ page: 1, limit: 5 })
        .pipe(finalize(finishIfCurrent))
        .subscribe({
          next: (response: any) => {
            if (generation !== this.statsLoadGeneration) return;
            const invoicesArray = Array.isArray(response?.data) ? response.data : [];
            this.stats.totalInvoices = Number(response?.total || invoicesArray.length || 0);
            this.stats.totalBalance = Number(response?.totalBalance || 0);
            this.stats.totalInvoicedAmount = Number(response?.totalInvoicedAmount ?? 0);
            this.stats.totalPaidAmount = Number(response?.totalPaidAmount ?? 0);
            this.recentInvoices = [...invoicesArray]
              .sort(
                (a: any, b: any) =>
                  new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
              )
              .slice(0, 5);
          },
          error: () => {
            if (generation !== this.statsLoadGeneration) return;
            this.stats.totalInvoices = 0;
            this.stats.totalBalance = 0;
            this.stats.totalInvoicedAmount = 0;
            this.stats.totalPaidAmount = 0;
            this.recentInvoices = [];
          }
        });
    }
}

  refreshDashboardStats(): void {
    if (!this.canViewDashboardStats()) {
      return;
    }
    this.loadStatistics();
    this.loadUnreadParentMessageCount();
  }

  loadUnreadParentMessageCount(): void {
    if (!this.incomingMessageNotifications.canShowIncomingBadge()) {
      this.unreadParentMessageCount = 0;
      return;
    }
    this.incomingMessageNotifications.refresh().pipe(takeUntil(this.destroy$)).subscribe((count) => {
      this.unreadParentMessageCount = count;
      this.cdr.markForCheck();
    });
  }

  isMessagesShortcut(route: string): boolean {
    return route === '/messages/incoming';
  }

  getMessagesBadgeLabel(): string {
    const n = this.unreadParentMessageCount;
    if (n <= 0) {
      return '';
    }
    return n > 99 ? '99+' : String(n);
  }

  private startUnreadMessagesPolling(): void {
    this.stopUnreadMessagesPolling();
    if (!this.incomingMessageNotifications.canShowIncomingBadge()) {
      return;
    }
    this.incomingMessageNotifications.unreadCount$.pipe(takeUntil(this.destroy$)).subscribe((count) => {
      this.unreadParentMessageCount = count;
      this.cdr.markForCheck();
    });
    this.unreadMessagesPollHandle = setInterval(() => this.loadUnreadParentMessageCount(), 60000);
  }

  private stopUnreadMessagesPolling(): void {
    if (this.unreadMessagesPollHandle) {
      clearInterval(this.unreadMessagesPollHandle);
      this.unreadMessagesPollHandle = null;
    }
  }

  /** Load and show dashboard stat cards (admin, director, school leadership, accountant). */
  canViewDashboardStats(): boolean {
    return (
      this.authService.isAdmin() ||
      this.authService.isAccountant() ||
      this.authService.isSchoolLeadership()
    );
  }

  canChangeOwnPassword(): boolean {
    return this.authService.canChangeOwnPassword();
  }

  get changePasswordRoute(): string {
    return this.authService.getChangePasswordRoute();
  }

  getRoleLabel(): string {
    const r = this.authService.getEffectiveRole();
    if (!r) return 'Guest';
    if (r === 'superadmin') return 'Super Admin';
    if (r === 'director') return 'Director';
    if (r === 'headmaster') return 'Headmaster';
    if (r === 'deputy_headmaster') return 'Deputy Headmaster';
    if (r === 'admin') return 'Administrator';
    if (r === 'accountant') return 'Accountant';
    if (r === 'teacher') return 'Teacher';
    if (r === 'parent') return 'Parent';
    if (r === 'student') return 'Student';
    return 'User';
  }

  formatStatsUpdatedAt(): string {
    if (!this.statsLastUpdated) return '';
    return this.statsLastUpdated.toLocaleString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  getSmartGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  /** Honorific shown before the user name in the dashboard greeting (e.g. Mr, Mrs). */
  getNamePrefix(): string {
    const user = this.authService.getCurrentUser();
    if (!user) return '';

    const custom = String((user as { namePrefix?: string }).namePrefix || '').trim();
    if (custom) return custom;

    const role = String(user.role || '').toLowerCase();
    if (role === 'director') {
      return 'Mr';
    }
    return '';
  }

  getStudentDashboardSubtitle(): string {
    return 'Your report card, invoice statement, and parent portal — all in one place.';
  }

  formatStudentUpdatedAt(): string {
    if (!this.studentDataLastUpdated) {
      return '';
    }
    return this.studentDataLastUpdated.toLocaleString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  refreshStudentDashboard(): void {
    this.studentDataRetryCount = 0;
    this.loadStudentData();
  }

  getStudentNumber(): string {
    const user = this.authService.getCurrentUser();
    return String(user?.student?.studentNumber || '').trim();
  }

  getStudentClassName(): string {
    const user = this.authService.getCurrentUser();
    const cls = user?.student?.classEntity || user?.student?.class;
    if (!cls) return '';
    return String(cls.name || cls).trim();
  }

  getGreetingName(): string {
    const name = this.getDisplayName();
    const prefix = this.getNamePrefix();
    if (!prefix || !name || name === 'User') {
      return name;
    }
    if (/^(Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s/i.test(name)) {
      return name;
    }
    return `${prefix} ${name}`;
  }

  getCollectionRatePercent(): number {
    const inv = this.stats.totalInvoicedAmount;
    if (!inv || inv <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((this.stats.totalPaidAmount / inv) * 100));
  }

  getModuleShortcutsForView(): DashboardModuleShortcut[] {
    let list: DashboardModuleShortcut[];
    if (this.isAccountant()) {
      list = this.accountantModuleShortcuts;
    } else if (this.isStudent()) {
      return this.studentModuleShortcuts;
    } else {
      list = this.adminModuleShortcuts;
    }
    return list.filter(m => {
      if (m.adminOnly && !this.isAdmin()) {
        return false;
      }
      if (m.module && !this.canAccessModule(m.module)) {
        return false;
      }
      return true;
    });
  }

  clearAdminHubSearch(): void {
    this.adminHubSearch = '';
  }

  getAdminHubGroupsForView(): DashboardAdminHubGroup[] {
    const base = this.filterAdminHubGroupsForRole(this.adminHubGroups);
    const q = this.adminHubSearch.trim().toLowerCase();
    if (!q) {
      return base;
    }
    return base
      .map(group => ({
        ...group,
        tiles: group.tiles.filter(
          t =>
            t.search.includes(q) ||
            t.title.toLowerCase().includes(q) ||
            t.desc.toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.tiles.length > 0);
  }

  private filterAdminHubGroupsForRole(groups: DashboardAdminHubGroup[]): DashboardAdminHubGroup[] {
    if (!this.isDirector()) {
      return groups;
    }
    return groups
      .map(group => ({
        ...group,
        tiles: group.tiles.filter(t => !t.route.includes('/admin/parents')),
      }))
      .filter(group => group.tiles.length > 0);
  }

  isDemoUser(): boolean {
    const user = this.authService.getCurrentUser();
    return user?.isDemo === true || user?.email === 'demo@school.com' || user?.username === 'demo@school.com';
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        if (data) {
          this.schoolName = data.schoolName || '';
        }
        this.schoolMotto = data.schoolMotto || '';
        this.schoolLogo = data.schoolLogo || null;
        this.schoolLogo2 = data.schoolLogo2 || null;
        this.moduleAccess = data.moduleAccess || {};
        this.currencySymbol = data.currencySymbol || '$';

        if (data.moduleAccess) {
          (this.moduleAccessService as any).moduleAccess = data.moduleAccess;
        }

        const motto = (this.schoolMotto || 'After Instruction We Soar').trim();
        const names = [this.schoolName, motto].filter(Boolean);
        this.rotateTexts = [...new Set(names)];
        this.displayedText = this.rotateTexts[0] || this.schoolName;
        if (this.textToggleInterval) {
          clearInterval(this.textToggleInterval);
        }
        if (this.rotateTexts.length > 1) {
          this.rotateIndex = 0;
          this.textToggleInterval = setInterval(() => {
            this.rotateIndex = (this.rotateIndex + 1) % this.rotateTexts.length;
            this.displayedText = this.rotateTexts[this.rotateIndex];
          }, 4000);
        }
      },
      error: () => {
        this.schoolName = '';
        this.moduleAccess = this.moduleAccessService.getModuleAccess();
      }
    });
  }

  isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  isSuperAdmin(): boolean {
    return this.authService.isSuperAdmin();
  }

  isDirector(): boolean {
    return this.authService.isDirector();
  }

  canShowParentManagement(): boolean {
    return !this.isDirector() && this.canAccessModule('parents');
  }

  isAccountant(): boolean {
    return this.authService.hasRole('accountant');
  }

  isTeacher(): boolean {
    return this.authService.hasRole('teacher');
  }

  isParent(): boolean {
    return this.authService.hasRole('parent');
  }

  isStudent(): boolean {
    return this.authService.hasRole('student');
  }

  openBulkMessage() {
    this.showBulkMessage = true;
  }

  closeBulkMessage() {
    this.showBulkMessage = false;
  }

  toggleSection(section: string) {
    switch (section) {
      case 'studentManagement':
        this.studentManagementOpen = !this.studentManagementOpen;
        break;
      case 'examManagement':
        this.examManagementOpen = !this.examManagementOpen;
        break;
      case 'financeManagement':
        this.financeManagementOpen = !this.financeManagementOpen;
        break;
      case 'reports':
        this.reportsOpen = !this.reportsOpen;
        break;
      case 'generalSettings':
        this.generalSettingsOpen = !this.generalSettingsOpen;
        break;
    }
  }

  hasModuleAccess(module: string): boolean {
    return this.moduleAccessService.canAccessModule(module);
  }

  canAccessModule(module: string): boolean {
    return this.moduleAccessService.canAccessModule(module);
  }

  private normalizeModuleKey(module: string): string {
    const baseMap: any = {
      exams: 'exams',
      reportCards: 'reportCards',
      students: 'students',
      classes: 'classes',
      subjects: 'subjects',
      finance: 'finance',
      invoices: 'invoices',
      settings: 'settings',
      dashboard: 'dashboard',
      attendance: 'attendance',
      assignments: 'assignments',
      teachers: 'teachers'
    };
    return baseMap[module] || module;
  }

  getCurrentDateTime(): string {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return now.toLocaleDateString('en-US', options);
  }

  loadTeacherName() {
    const user = this.authService.getCurrentUser();
    if (!user || user.role !== 'teacher') {
      return;
    }

    if ((user as any).isUniversalTeacher) {
      this.teacherName = 'Universal Teacher';
      return;
    }

    if (user.teacher) {
      if (
        user.teacher.fullName &&
        user.teacher.fullName.trim() &&
        user.teacher.fullName !== 'Teacher' &&
        user.teacher.fullName !== 'Account Teacher'
      ) {
        this.teacherName = user.teacher.fullName.trim();
        return;
      }

      const name = this.extractTeacherName(user.teacher);
      if (name && name !== 'Teacher' && name.trim()) {
        this.teacherName = name;
        return;
      }
    }

    this.teacherService.getCurrentTeacher().subscribe({
      next: (teacher: any) => {
        if (
          teacher.fullName &&
          teacher.fullName.trim() &&
          teacher.fullName !== 'Teacher' &&
          teacher.fullName !== 'Account Teacher'
        ) {
          this.teacherName = teacher.fullName.trim();
        } else {
          const name = this.extractTeacherName(teacher);
          if (name && name !== 'Teacher' && name.trim()) {
            this.teacherName = name;
          }
        }
      },
      error: () => {
        this.teacherName = '';
      }
    });
  }

  private extractTeacherName(teacher: any): string {
    if (!teacher) {
      return '';
    }

    if (teacher.fullName && teacher.fullName.trim() && teacher.fullName !== 'Teacher' && teacher.fullName !== 'Account Teacher') {
      return teacher.fullName.trim();
    }

    const firstName = teacher.firstName && typeof teacher.firstName === 'string' ? teacher.firstName.trim() : '';
    const lastName = teacher.lastName && typeof teacher.lastName === 'string' ? teacher.lastName.trim() : '';

    const validFirst = firstName && firstName !== 'Teacher' && firstName !== 'Account' ? firstName : '';
    const validLast = lastName && lastName !== 'Teacher' && lastName !== 'Account' ? lastName : '';

    const parts = [validLast, validFirst].filter(part => part.length > 0);
    return parts.join(' ').trim();
  }

  getDisplayName(): string {
    const user = this.authService.getCurrentUser();
    if (!user) {
      return 'User';
    }

    if (user.fullName && user.fullName.trim()) {
      return user.fullName.trim();
    }

    if (user.role === 'teacher') {
      if (this.teacherName && this.teacherName !== 'Teacher' && this.teacherName.trim()) {
        return this.teacherName;
      }
      if (user.teacher) {
        if (user.teacher.fullName && user.teacher.fullName.trim() && user.teacher.fullName !== 'Teacher' && user.teacher.fullName !== 'Account Teacher') {
          return user.teacher.fullName.trim();
        }
        const extractedName = this.extractTeacherName(user.teacher);
        if (extractedName && extractedName !== 'Teacher' && extractedName.trim()) {
          return extractedName;
        }
      }
      return 'Teacher';
    }

    if (user.student && (user.student.firstName || user.student.lastName)) {
      return [user.student.firstName, user.student.lastName].filter(Boolean).join(' ').trim();
    }
    if (user.parent && (user.parent.firstName || user.parent.lastName)) {
      return [user.parent.lastName, user.parent.firstName].filter(Boolean).join(' ').trim();
    }

    return this.formatFriendlyDisplay(user.email || user.username || '') || 'User';
  }

  private formatFriendlyDisplay(emailOrUsername: string): string {
    if (!emailOrUsername || !emailOrUsername.trim()) return '';
    const local = emailOrUsername.split('@')[0].trim();
    if (!local) return emailOrUsername;
    return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
  }

  initializeTextToggle() {
    if (this.textToggleInterval) {
      clearInterval(this.textToggleInterval);
    }
    if (this.rotateTexts.length > 0) {
      this.displayedText = this.rotateTexts[0];
      this.rotateIndex = 0;
    } else {
      this.displayedText = this.schoolName;
    }
  }

  loadStudentData() {
    const user = this.authService.getCurrentUser();
    if (!user) {
      if (this.studentDataRetryCount < this.MAX_STUDENT_DATA_RETRIES) {
        this.studentDataRetryCount++;
        setTimeout(() => this.loadStudentData(), 500);
      }
      return;
    }

    if (!user.student) {
      if (this.studentDataRetryCount < this.MAX_STUDENT_DATA_RETRIES) {
        this.studentDataRetryCount++;
        setTimeout(() => {
          const retryUser = this.authService.getCurrentUser();
          if (retryUser && retryUser.student && retryUser.student.id) {
            this.studentDataRetryCount = 0;
            this.loadStudentData();
          }
        }, 1000);
      }
      return;
    }

    if (!user.student.id) {
      return;
    }

    this.studentDataRetryCount = 0;
    const studentId = user.student.id;

    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        this.activeTerm = data.activeTerm || data.currentTerm || '';
      },
      error: () => {}
    });

    this.loadingBalance = true;
    this.financeService.getStudentBalance(studentId).pipe(
      finalize(() => {
        this.loadingBalance = false;
        this.studentDataLastUpdated = new Date();
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (data: any) => {
        this.studentBalance = parseFloat(String(data.balance || 0));
      },
      error: () => {
        this.studentBalance = 0;
      }
    });
  }

  viewReportCard() {
    this.router.navigate(['/student/report-card']);
  }

  viewInvoiceStatement() {
    this.router.navigate(['/student/invoice-statement']);
  }

  viewStudentInvoicePreview(): void {
    const studentId = this.getStudentId();
    if (!studentId) {
      this.studentError = 'Student information not found. Please log in again.';
      return;
    }

    this.studentError = '';
    this.loadingInvoicePdf = true;
    this.cdr.markForCheck();

    this.financeService.getInvoices(studentId).pipe(
      takeUntil(this.destroy$),
      catchError((err: any) => {
        this.studentError = err?.error?.message || 'Failed to load invoices.';
        return of([]);
      }),
      finalize(() => {
        if (!this.showInvoicePdfViewer) {
          this.loadingInvoicePdf = false;
          this.cdr.markForCheck();
        }
      })
    ).subscribe({
      next: (invoices: any) => {
        const list = Array.isArray(invoices) ? invoices : [];
        if (!list.length) {
          this.studentError = 'No invoice statement is available yet.';
          this.loadingInvoicePdf = false;
          this.cdr.markForCheck();
          return;
        }

        const latestInvoice = [...list].sort((a: any, b: any) => {
          const dateA = new Date(a.createdAt || a.dueDate || 0).getTime();
          const dateB = new Date(b.createdAt || b.dueDate || 0).getTime();
          return dateB - dateA;
        })[0];

        this.invoiceModalId = latestInvoice.id;
        this.invoiceModalNumber = latestInvoice.invoiceNumber || `INV-${latestInvoice.id}`;
        this.invoiceModalBalance = parseFloat(String(latestInvoice.balance ?? this.studentBalance ?? 0));
        this.showInvoicePdfViewer = true;
        this.invoiceModalPdfError = false;
        this.invoiceModalSafePdfUrl = null;
        this.loadStudentInvoiceModalPdf(latestInvoice.id);
      },
    });
  }

  private loadStudentInvoiceModalPdf(invoiceId: string): void {
    this.loadingInvoicePdf = true;
    this.invoiceModalPdfError = false;
    this.revokeInvoiceModalPdfUrl();
    this.invoiceModalSafePdfUrl = null;

    this.financeService.getInvoicePDF(invoiceId).pipe(
      takeUntil(this.destroy$),
      catchError(() => {
        this.invoiceModalPdfError = true;
        return of(null);
      }),
      finalize(() => {
        this.loadingInvoicePdf = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (response: any) => {
        if (!response) {
          return;
        }
        const blob: Blob = response.blob || response;
        if (!blob || blob.size === 0) {
          this.invoiceModalPdfError = true;
          return;
        }
        this.revokeInvoiceModalPdfUrl();
        this.invoiceModalPdfBlobUrl = window.URL.createObjectURL(blob);
        this.invoiceModalSafePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
          pdfBlobViewerUrl(this.invoiceModalPdfBlobUrl)
        );
        this.cdr.markForCheck();
      },
    });
  }

  retryStudentInvoicePdf(): void {
    if (this.invoiceModalId) {
      this.loadStudentInvoiceModalPdf(this.invoiceModalId);
    }
  }

  closeStudentInvoicePdfViewer(): void {
    this.showInvoicePdfViewer = false;
    this.revokeInvoiceModalPdfUrl();
    this.invoiceModalSafePdfUrl = null;
    this.invoiceModalPdfError = false;
    this.loadingInvoicePdf = false;
    this.cdr.markForCheck();
  }

  downloadStudentInvoicePdf(): void {
    if (!this.invoiceModalId) {
      return;
    }
    this.financeService.getInvoicePDF(this.invoiceModalId).subscribe({
      next: (response: any) => {
        const blob: Blob = response.blob || response;
        const filename = response.filename || `Invoice-${this.invoiceModalId}.pdf`;
        if (!blob || blob.size === 0) {
          this.studentError = 'Received empty PDF file.';
          return;
        }
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      },
      error: (err: any) => {
        this.studentError = err?.error?.message || 'Failed to download invoice PDF.';
      },
    });
  }
}

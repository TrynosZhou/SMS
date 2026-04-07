import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SettingsService } from '../../services/settings.service';
import { StudentService } from '../../services/student.service';
import { TeacherService } from '../../services/teacher.service';
import { ClassService } from '../../services/class.service';
import { FinanceService } from '../../services/finance.service';
import { SubjectService } from '../../services/subject.service';
import { ModuleAccessService } from '../../services/module-access.service';
import { ThemeService } from '../../services/theme.service';

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
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  user: any;
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
  private statsPendingRequests = 0;
  recentStudents: any[] = [];
  recentInvoices: any[] = [];

  adminHubSearch = '';
  readonly statSkeletonSlots = [0, 1, 2, 3, 4, 5];

  readonly adminModuleShortcuts: DashboardModuleShortcut[] = [
    { route: '/students', label: 'Students', icon: '👥', pastel: 'violet', module: 'students' },
    { route: '/teachers', label: 'Teachers', icon: '👨‍🏫', pastel: 'sky', module: 'teachers' },
    { route: '/classes', label: 'Classes', icon: '🏫', pastel: 'emerald', module: 'classes' },
    { route: '/invoices', label: 'Billing', icon: '💳', pastel: 'rose', module: 'finance' },
    { route: '/attendance/mark', label: 'Attendance', icon: '📋', pastel: 'amber', module: 'attendance' },
    { route: '/report-cards', label: 'Reports', icon: '📊', pastel: 'violet', module: 'reportCards' },
    { route: '/inventory', label: 'Inventory Manager', icon: '📦', pastel: 'emerald', module: 'inventory' },
    { route: '/timetable/generate', label: 'Timetable', icon: '📅', pastel: 'sky' },
    { route: '/messages/inbox', label: 'Messages', icon: '💬', pastel: 'pink' },
    { route: '/settings', label: 'Settings', icon: '⚙️', pastel: 'slate', module: 'settings' },
    { route: '/admin/elearning', label: 'E-Learning', icon: '💻', pastel: 'violet', adminOnly: true }
  ];

  readonly accountantModuleShortcuts: DashboardModuleShortcut[] = [
    { route: '/students', label: 'Students', icon: '👥', pastel: 'violet', module: 'students' },
    { route: '/invoices', label: 'Billing', icon: '💳', pastel: 'rose', module: 'finance' },
    { route: '/outstanding-balance', label: 'Outstanding', icon: '⚠️', pastel: 'amber', module: 'finance' },
    { route: '/payments/record', label: 'Record payment', icon: '💵', pastel: 'emerald', module: 'finance' },
    { route: '/attendance/reports', label: 'Attendance', icon: '📋', pastel: 'amber', module: 'attendance' },
    { route: '/report-cards', label: 'Reports', icon: '📊', pastel: 'violet', module: 'reportCards' },
    { route: '/classes', label: 'Classes', icon: '🏫', pastel: 'emerald', module: 'classes' },
    { route: '/messages/inbox', label: 'Messages', icon: '💬', pastel: 'pink' },
    { route: '/inventory', label: 'Inventory Manager', icon: '📦', pastel: 'emerald', module: 'inventory' },
    { route: '/settings', label: 'Settings', icon: '⚙️', pastel: 'slate', module: 'settings' }
  ];

  readonly parentModuleShortcuts: DashboardModuleShortcut[] = [
    { route: '/parent/dashboard', label: 'Balances', icon: '💳', pastel: 'rose' },
    { route: '/parent/link-students', label: 'Link students', icon: '🔗', pastel: 'sky' },
    { route: '/parent/invoice-statement', label: 'Statement', icon: '📑', pastel: 'violet' },
    { route: '/student/report-card', label: 'Report cards', icon: '📄', pastel: 'amber' },
    { route: '/messages/inbox', label: 'Messages', icon: '💬', pastel: 'pink' },
    { route: '/parent/manage-account', label: 'Account', icon: '⚙️', pastel: 'slate' }
  ];

  readonly studentModuleShortcuts: DashboardModuleShortcut[] = [
    { route: '/student/report-card', label: 'Report card', icon: '📄', pastel: 'violet' },
    { route: '/student/invoice-statement', label: 'Statement', icon: '📑', pastel: 'sky' },
    { route: '/student/inventory', label: 'Books & fines', icon: '📚', pastel: 'emerald', module: 'inventory' }
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
      id: 'inventory',
      label: 'Inventory & library',
      subtitle: 'Textbooks, furniture, loans, fines, and stock',
      tiles: [
        {
          route: '/inventory',
          icon: '📦',
          title: 'Inventory Manager',
          desc: 'Stock, issuance, returns, and reports',
          search: 'inventory textbook library furniture loan fine asset catalog issue return isbn desk chair',
          module: 'inventory',
          accent: 'emerald',
        },
      ],
    },
    {
      id: 'finance',
      label: 'Finance & payroll',
      subtitle: 'Fees, billing, and staff compensation',
      tiles: [
        { route: '/invoices', icon: '💰', title: 'Finance hub', desc: 'Invoices, payments, balances', search: 'invoice payment fees balance billing money', accent: 'rose' },
        { route: '/payroll', icon: '💵', title: 'Payroll', desc: 'Salaries and payroll runs', search: 'payroll salary pay slip wages', module: 'payroll', accent: 'rose' },
        { route: '/outstanding-balance', icon: '⚠️', title: 'Outstanding balances', desc: 'Who owes what', search: 'outstanding debt arrears balance', accent: 'rose' },
      ],
    },
    {
      id: 'reports',
      label: 'Reports & insight',
      subtitle: 'Report cards and performance rankings',
      tiles: [
        { route: '/report-cards', icon: '📄', title: 'Report cards', desc: 'Generate and review PDFs', search: 'report card transcript grade', accent: 'violet' },
        { route: '/rankings', icon: '🏆', title: 'Rankings', desc: 'Class and subject leagues', search: 'ranking position leaderboard top', accent: 'amber' },
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
        { route: '/admin/elearning', icon: '💻', title: 'E-learning', desc: 'Digital content and services', search: 'elearning online learning lms', accent: 'sky' },
        { route: '/settings', icon: '⚙️', title: 'School settings', desc: 'Branding, fees, terms, modules', search: 'settings configuration logo fees term', accent: 'slate' },
      ],
    },
  ];

  studentBalance: number = 0;
  loadingBalance = false;
  activeTerm: string = '';
  currencySymbol: string = '$';
  private studentDataRetryCount = 0;
  private readonly MAX_STUDENT_DATA_RETRIES = 3;

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
    public themeService: ThemeService
  ) {}

  ngOnInit() {
    this.user = this.authService.getCurrentUser();

    if (this.isTeacher()) {
      this.router.navigate(['/teacher/dashboard']);
      return;
    }

    this.moduleAccessService.loadModuleAccess();
    this.loadSettings();
    if (this.isAdmin() || this.isAccountant()) {
      this.loadStatistics();
    }
    if (this.isStudent()) {
      this.loadStudentData();
    }
  }

  ngOnDestroy() {
    if (this.textToggleInterval) {
      clearInterval(this.textToggleInterval);
    }
  }

  loadStatistics() {
    this.loadingStats = true;
    this.statsPendingRequests = 5;

    const markStatsSliceDone = () => {
      this.statsPendingRequests = Math.max(0, this.statsPendingRequests - 1);
      if (this.statsPendingRequests === 0) {
        this.loadingStats = false;
        this.statsLastUpdated = new Date();
      }
    };

    this.studentService.getStudentsPaginated({ page: 1, limit: 5 }).subscribe({
      next: (response: any) => {
        const studentsArray = Array.isArray(response?.data) ? response.data : [];
        const statsObj = response?.stats || {};
        const totalFromStats = Number(statsObj?.totalStudents || 0);
        this.stats.totalStudents = totalFromStats || Number(response?.total || studentsArray.length || 0);
        this.stats.dayScholars = Number(statsObj?.totalDayScholars || 0);
        this.stats.boarders = Number(statsObj?.totalBoarders || 0);
        this.stats.staffChildren = Number(statsObj?.staffChildren || 0);
        this.recentStudents = studentsArray
          .sort((a: any, b: any) => new Date(b.enrollmentDate || b.createdAt || 0).getTime() - new Date(a.enrollmentDate || a.createdAt || 0).getTime())
          .slice(0, 5);
        markStatsSliceDone();
      },
      error: () => {
        this.stats.totalStudents = 0;
        this.stats.dayScholars = 0;
        this.stats.boarders = 0;
        this.stats.staffChildren = 0;
        this.recentStudents = [];
        markStatsSliceDone();
      }
    });

    this.teacherService.getTeachersPaginated(1, 1).subscribe({
      next: (response: any) => {
        this.stats.totalTeachers = Number(response?.total || 0);
        markStatsSliceDone();
      },
      error: () => {
        this.stats.totalTeachers = 0;
        markStatsSliceDone();
      }
    });

    this.classService.getClasses().subscribe({
      next: (classes: any[]) => {
        const classesArray = Array.isArray(classes) ? classes : [];
        this.stats.totalClasses = classesArray.filter(c => c.isActive).length;
        markStatsSliceDone();
      },
      error: () => {
        this.stats.totalClasses = 0;
        markStatsSliceDone();
      }
    });

    this.subjectService.getSubjects().subscribe({
      next: (subjects: any[]) => {
        const subjectsArray = Array.isArray(subjects) ? subjects : [];
        this.stats.totalSubjects = subjectsArray.length;
        markStatsSliceDone();
      },
      error: () => {
        this.stats.totalSubjects = 0;
        markStatsSliceDone();
      }
    });

    this.financeService.getInvoicesPaginated({ page: 1, limit: 5 }).subscribe({
      next: (response: any) => {
        const invoicesArray = Array.isArray(response?.data) ? response.data : [];
        this.stats.totalInvoices = Number(response?.total || invoicesArray.length || 0);
        this.stats.totalBalance = Number(response?.totalBalance || 0);
        this.stats.totalInvoicedAmount = Number(response?.totalInvoicedAmount ?? 0);
        this.stats.totalPaidAmount = Number(response?.totalPaidAmount ?? 0);
        this.recentInvoices = invoicesArray
          .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
          .slice(0, 5);
        markStatsSliceDone();
      },
      error: () => {
        this.stats.totalInvoices = 0;
        this.stats.totalBalance = 0;
        this.stats.totalInvoicedAmount = 0;
        this.stats.totalPaidAmount = 0;
        this.recentInvoices = [];
        markStatsSliceDone();
      }
    });
  }

  refreshDashboardStats(): void {
    if (!this.isAdmin() && !this.isAccountant()) {
      return;
    }
    this.loadStatistics();
  }

  getRoleLabel(): string {
    const u = this.authService.getCurrentUser();
    if (!u) return 'Guest';
    const r = String(u.role || '').toLowerCase();
    if (r === 'superadmin') return 'Super Admin';
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
    } else if (this.isParent()) {
      return this.parentModuleShortcuts;
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
    const q = this.adminHubSearch.trim().toLowerCase();
    if (!q) {
      return this.adminHubGroups;
    }
    return this.adminHubGroups
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
    const user = this.authService.getCurrentUser();
    return user ? (user.role === 'admin' || user.role === 'superadmin') : false;
  }

  isSuperAdmin(): boolean {
    const user = this.authService.getCurrentUser();
    return user ? user.role === 'superadmin' : false;
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
      rankings: 'rankings',
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

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
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
      return [user.parent.firstName, user.parent.lastName].filter(Boolean).join(' ').trim();
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
    this.financeService.getStudentBalance(studentId).subscribe({
      next: (data: any) => {
        this.loadingBalance = false;
        this.studentBalance = parseFloat(String(data.balance || 0));
      },
      error: () => {
        this.loadingBalance = false;
        this.studentBalance = 0;
      }
    });
  }

  viewReportCard() {
    const user = this.authService.getCurrentUser();
    if (!user || !user.student || !user.student.id) {
      return;
    }

    this.router.navigate(['/report-cards'], {
      queryParams: { studentId: user.student.id }
    });
  }

  viewInvoiceStatement() {
    const user = this.authService.getCurrentUser();
    if (!user || !user.student || !user.student.id) {
      return;
    }

    this.router.navigate(['/invoices/statements'], {
      queryParams: { studentId: user.student.id }
    });
  }
}

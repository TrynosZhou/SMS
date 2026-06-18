import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { AuthService } from './services/auth.service';
import { SettingsService } from './services/settings.service';
import { ModuleAccessService } from './services/module-access.service';
import { PermissionService } from './services/permission.service';
import { LicenseService } from './services/license.service';
import { ThemeService } from './services/theme.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuditService } from './services/audit.service';
import { environment } from '../environments/environment';
import { LogoutConfirmService } from './services/logout-confirm.service';
import { ConnectivityService } from './services/connectivity.service';
import { IncomingMessageNotificationService } from './services/incoming-message-notification.service';
import { RbacService, RbacRole } from './services/rbac.service';

/** When the current URL matches a prefix, keep that sidebar section expanded (fixes “click twice” on submenus). */
const SIDEBAR_MENU_ROUTE_PREFIXES: Record<string, string[]> = {
  dashboard: ['/dashboard', '/teacher/dashboard', '/parent/dashboard'],
  registration: ['/teachers', '/students', '/admin/parents'],
  classManagement: ['/students/enroll', '/students/transfer', '/classes', '/admin/class-promotion'],
  attendance: ['/attendance'],
  examManagement: ['/exams', '/mark-sheet', '/rankings', '/report-cards', '/check_mark_progess', '/publish-results'],
  financeManagement: ['/invoices', '/payments', '/balance-enquiry', '/finance/'],
  financialReports: ['/financial-reports'],
  payrollManagement: ['/payroll'],
  messages: ['/messages'],
  newsManagement: ['/news', '/news-feed'],
  recordKeeping: ['/teacher/record-book', '/teacher/my-classes'],
  teacherInventory: ['/teacher/inventory-record'],
  timetableManagement: ['/subjects/assign', '/timetable'],
  systemAdministration: ['/system-settings', '/admin/manage-accounts', '/user-log', '/admin/license-config', '/system/integrations'],
};

@Component({
  standalone: false,  selector: 'app-root',
templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  schoolName = '';
  schoolLogo: string | null = null;
  schoolWebsite = '';
  schoolFacebookUrl = '';
  /** Current page label shown in the top navbar (route title). */
  pageNavbarTitle = 'Dashboard';
  mobileMenuOpen = false;
  sidebarCollapsed = false;
  expandedMenus: { [key: string]: boolean } = {};
  sidebarMenuFilter = '';
  private authSubscription?: Subscription;
  private titleRotationTimerId: number | null = null;
  private readonly titleRotationIntervalMs = 4000;
  private static readonly SCHOOL_NAME_CACHE_KEY = 'sms_schoolDisplayName';
  private static readonly SCHOOL_LOGO_CACHE_KEY = 'sms_schoolDisplayLogo';
  private readonly dashboardTitleOptions = [
    'After instruction we soar',
    'Kaizen',
    'Junior Primary School'
  ];
  private dashboardTitleIndex = 0;
  private currentUrl = '';
  userMenuOpen = false;
  connectionBanner = '';
  viewAsRoles: RbacRole[] = [];
  selectedViewAsRoleId = '';
  loadingViewAsRoles = false;
  unreadIncomingMessageCount = 0;
  private unreadPollHandle: ReturnType<typeof setInterval> | null = null;
  private unreadCountSub?: Subscription;

  constructor(
    public authService: AuthService, 
    private settingsService: SettingsService,
    public moduleAccessService: ModuleAccessService,
    private permissionService: PermissionService,
    private licenseService: LicenseService,
    public themeService: ThemeService,
    private router: Router,
    private auditService: AuditService,
    private activatedRoute: ActivatedRoute,
    private title: Title,
    private meta: Meta,
    private cdr: ChangeDetectorRef,
    public logoutConfirm: LogoutConfirmService,
    public connectivity: ConnectivityService,
    private rbacService: RbacService,
    private incomingMessageNotifications: IncomingMessageNotificationService
  ) {
    const cachedName = sessionStorage.getItem(AppComponent.SCHOOL_NAME_CACHE_KEY);
    if (cachedName) {
      this.schoolName = cachedName;
    }
    const cachedLogo = sessionStorage.getItem(AppComponent.SCHOOL_LOGO_CACHE_KEY);
    if (cachedLogo) {
      this.schoolLogo = this.normalizeSchoolLogoSrc(cachedLogo);
    }
  }

  ngOnInit(): void {
    this.connectivity.connectionMessage$.subscribe((msg) => {
      this.connectionBanner = msg;
      this.cdr.markForCheck();
      if (msg) {
        setTimeout(() => {
          if (this.connectionBanner === msg) {
            this.connectionBanner = '';
            this.cdr.markForCheck();
          }
        }, 6000);
      }
    });

    // Load module access and permissions when already authenticated (e.g. page refresh)
    if (this.authService.isAuthenticated()) {
      // Load module access settings
      this.moduleAccessService.loadModuleAccess();
      this.permissionService.loadPermissionsFromApi();
      this.licenseService.load().subscribe();
      this.syncExpandedMenusFromUrl(this.router.url || '');
      this.loadViewAsRoles();
      this.startIncomingMessageBadge();
    }

    this.authService.currentUser$.subscribe((user) => {
      if (user) {
        this.loadSchoolBranding();
        this.moduleAccessService.loadModuleAccess();
        this.permissionService.loadPermissionsFromApi();
        this.syncExpandedMenusFromUrl(this.router.url || '');
        this.loadViewAsRoles();
        this.startIncomingMessageBadge();
        this.cdr.markForCheck();
      } else {
        this.viewAsRoles = [];
        this.selectedViewAsRoleId = '';
        this.stopIncomingMessageBadge();
        this.schoolLogo = null;
        this.schoolWebsite = '';
        this.schoolFacebookUrl = '';
        sessionStorage.removeItem(AppComponent.SCHOOL_LOGO_CACHE_KEY);
        this.cdr.markForCheck();
      }
    });

    this.moduleAccessService.ready$.subscribe(() => {
      this.syncExpandedMenusFromUrl(this.router.url || '');
      this.cdr.markForCheck();
    });

    this.permissionService.permissionsReady$.subscribe(() => {
      this.syncExpandedMenusFromUrl(this.router.url || '');
      this.cdr.markForCheck();
    });

    // Log module access and update meta tags on navigation
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.currentUrl = (e.urlAfterRedirects || e.url || '').toString();
      this.syncExpandedMenusFromUrl(this.currentUrl);
      this.syncDashboardTitleRotation();
      this.updateMetaFromRoute();
      // Close mobile menu/drawer after navigation
      if (this.mobileMenuOpen) {
        this.closeMobileMenu();
      }
      if (!this.authService.isAuthenticated()) return;
      if (!this.schoolLogo) {
        this.loadSchoolBranding();
      }
      this.refreshIncomingMessageBadge();
      const user = this.authService.getCurrentUser();
      const role = (user?.role || '').toLowerCase();
      if (
        !['admin', 'superadmin', 'director', 'headmaster', 'deputy_headmaster', 'teacher', 'accountant'].includes(
          role
        )
      ) {
        return;
      }
      const url = (e.urlAfterRedirects || e.url || '').toString();
      const moduleName = this.resolveModuleName(url);
      if (moduleName) {
        const sessionId = sessionStorage.getItem('sessionId') || undefined;
        this.auditService.logActivity(moduleName, sessionId).subscribe({ next: () => {}, error: () => {} });
      }
    });

    this.authSubscription = this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.syncExpandedMenusFromUrl(this.router.url || '');
        this.cdr.markForCheck();
      }
    });

    // Set initial meta tags
    this.updateMetaFromRoute();

    // Initialize dashboard title rotation state
    this.currentUrl = this.router.url || '';
    this.syncDashboardTitleRotation();
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
    this.stopDashboardTitleRotation();
    this.stopIncomingMessageBadge();
  }

  getTopNavbarTitle(): string {
    return this.pageNavbarTitle || this.deriveTitleFromUrl(this.currentUrl);
  }

  /** Only system administrators may preview the UI as another role. */
  canShowViewAsRole(): boolean {
    const actual = this.authService.getActualRole();
    return actual === 'admin' || actual === 'superadmin' || actual === 'director';
  }

  private loadViewAsRoles(): void {
    if (!this.authService.isAuthenticated() || !this.canShowViewAsRole()) {
      this.viewAsRoles = [];
      this.selectedViewAsRoleId = '';
      return;
    }
    this.loadingViewAsRoles = true;
    this.rbacService.listRoles().subscribe({
      next: (res) => {
        this.viewAsRoles = (res?.roles || []).slice().sort((a, b) => a.name.localeCompare(b.name));
        const savedId = this.authService.getViewAsRoleId();
        this.selectedViewAsRoleId = savedId && this.viewAsRoles.some((r) => r.id === savedId) ? savedId : '';
        if (this.selectedViewAsRoleId && this.authService.isViewAsRoleActive()) {
          const active = this.viewAsRoles.find((r) => r.id === this.selectedViewAsRoleId);
          if (active) {
            this.permissionService.applyViewAsPreview(active.permissions || {});
          }
        }
        this.loadingViewAsRoles = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.viewAsRoles = [];
        this.loadingViewAsRoles = false;
        this.cdr.markForCheck();
      },
    });
  }

  /** Human-readable label for the signed-in user's real role (default “View as role” option). */
  getActualRoleLabel(): string {
    const r = this.authService.getActualRole();
    if (!r) return 'User';
    if (r === 'superadmin') return 'Super Administrator';
    if (r === 'director') return 'Director';
    if (r === 'headmaster') return 'Headmaster';
    if (r === 'deputy_headmaster') return 'Deputy Headmaster';
    if (r === 'admin') return 'Administrator';
    if (r === 'accountant') return 'Accountant';
    if (r === 'teacher') return 'Teacher';
    if (r === 'parent') return 'Parent';
    if (r === 'student') return 'Student';
    if (r === 'demo_user') return 'Demo User';
    return r;
  }

  onViewAsRoleChange(): void {
    if (!this.canShowViewAsRole()) {
      return;
    }
    if (!this.selectedViewAsRoleId) {
      this.authService.setViewAsRole(null);
      this.permissionService.loadPermissionsFromApi();
      this.expandedMenus = {};
      this.syncExpandedMenusFromUrl(this.router.url || '');
      this.router.navigate([this.authService.getDashboardRouteForRole(this.authService.getActualRole())]).catch(() => {});
      this.cdr.markForCheck();
      return;
    }
    const role = this.viewAsRoles.find((r) => r.id === this.selectedViewAsRoleId);
    if (!role) {
      return;
    }
    const legacyKey = (role.legacyRoleKey || role.slug || '').replace(/-/g, '_').toLowerCase();
    this.authService.setViewAsRole(legacyKey, role.id);
    this.permissionService.applyViewAsPreview(role.permissions || {});
    this.expandedMenus = {};
    this.syncExpandedMenusFromUrl('');
    const dashboardRoute = this.authService.getDashboardRouteForRole(legacyKey);
    this.router.navigate([dashboardRoute]).catch(() => {});
    this.cdr.markForCheck();
  }

  hasWebsiteLink(): boolean {
    return !!String(this.schoolWebsite || '').trim();
  }

  /** Fetch school name, primary logo, and social links for the top navbar. */
  private loadSchoolBranding(): void {
    if (!this.authService.isAuthenticated()) return;

    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        if (!settings || typeof settings !== 'object') return;

        const name = String(settings?.schoolName || '').trim();
        const logo = this.normalizeSchoolLogoSrc(settings?.schoolLogo || null);
        const websiteUrl = String(settings?.schoolWebsite || '').trim();
        const facebookUrl = String(settings?.schoolFacebookUrl || '').trim();

        if (name) {
          sessionStorage.setItem(AppComponent.SCHOOL_NAME_CACHE_KEY, name);
        }
        if (logo) {
          try {
            if (logo.length < 500_000) {
              sessionStorage.setItem(AppComponent.SCHOOL_LOGO_CACHE_KEY, logo);
            }
          } catch {
            // ignore sessionStorage quota errors for large logos
          }
        }

        this.schoolName = name || this.schoolName;
        this.schoolLogo = logo;
        this.schoolWebsite = websiteUrl;
        this.schoolFacebookUrl = facebookUrl;
        this.cdr.detectChanges();
      },
      error: () => {
        // keep cached branding if the request fails
      }
    });
  }

  private normalizeSchoolLogoSrc(value: string | null): string | null {
    if (!value) return null;

    let v = String(value).trim();
    if (!v) return null;

    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1).trim();
    }

    v = v.replace(/\\n/g, '').replace(/\\r/g, '').replace(/\\t/g, '').replace(/\\"/g, '"');

    if (v.startsWith('data:image')) {
      const commaIndex = v.indexOf(',');
      if (commaIndex > -1) {
        const header = v.slice(0, commaIndex + 1);
        const payload = v.slice(commaIndex + 1).replace(/\s/g, '');
        return `${header}${payload}`;
      }
      return v;
    }

    if (/^https?:\/\//i.test(v)) {
      return v;
    }

    if (/^[A-Za-z0-9+/=\r\n]+$/.test(v) && v.length > 64) {
      return `data:image/png;base64,${v.replace(/\s/g, '')}`;
    }

    return v;
  }

  getWebsiteLink(): string {
    return this.normalizeExternalUrl(this.schoolWebsite);
  }

  hasFacebookLink(): boolean {
    return !!String(this.schoolFacebookUrl || '').trim();
  }

  getFacebookLink(): string {
    return this.normalizeExternalUrl(this.schoolFacebookUrl);
  }

  private normalizeExternalUrl(raw: string): string {
    const url = String(raw || '').trim();
    if (!url) return '#';
    if (/^https?:\/\//i.test(url)) return url;
    return `https://${url}`;
  }

  openNavSearch(): void {
    if (this.isParent() && !this.isActingAsStudent()) {
      this.router.navigate(['/parent/inbox']).catch(() => {});
      return;
    }
    if (this.sidebarCollapsed) {
      this.sidebarCollapsed = false;
    }
    if (this.mobileMenuOpen) {
      this.closeMobileMenu();
    } else if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 992px)').matches) {
      this.mobileMenuOpen = true;
    }
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.sidebar-filter');
      input?.focus();
    }, 150);
  }

  getMessagesNavLink(): string {
    if (this.isParent() && !this.isActingAsStudent()) {
      return '/parent/inbox';
    }
    if (this.isStudent() || this.isActingAsStudent()) {
      return '/messages/inbox';
    }
    if (this.incomingMessageNotifications.canShowIncomingBadge()) {
      return '/messages/incoming';
    }
    return '/messages/inbox';
  }

  getMessagesNavBadgeLabel(): string {
    const n = this.unreadIncomingMessageCount;
    if (n <= 0) {
      return '';
    }
    return n > 99 ? '99+' : String(n);
  }

  showMessagesNavBadge(): boolean {
    return this.incomingMessageNotifications.canShowIncomingBadge() && this.unreadIncomingMessageCount > 0;
  }

  private startIncomingMessageBadge(): void {
    this.stopIncomingMessageBadge();
    if (!this.authService.isAuthenticated() || !this.incomingMessageNotifications.canShowIncomingBadge()) {
      this.unreadIncomingMessageCount = 0;
      return;
    }
    this.unreadCountSub = this.incomingMessageNotifications.unreadCount$.subscribe((count) => {
      this.unreadIncomingMessageCount = count;
      this.cdr.markForCheck();
    });
    this.refreshIncomingMessageBadge();
    this.unreadPollHandle = setInterval(() => this.refreshIncomingMessageBadge(), 60000);
  }

  private stopIncomingMessageBadge(): void {
    if (this.unreadPollHandle) {
      clearInterval(this.unreadPollHandle);
      this.unreadPollHandle = null;
    }
    if (this.unreadCountSub) {
      this.unreadCountSub.unsubscribe();
      this.unreadCountSub = undefined;
    }
    this.unreadIncomingMessageCount = 0;
  }

  private refreshIncomingMessageBadge(): void {
    if (!this.authService.isAuthenticated() || !this.incomingMessageNotifications.canShowIncomingBadge()) {
      return;
    }
    this.incomingMessageNotifications.refresh().subscribe(() => this.cdr.markForCheck());
  }

  getCalendarNavLink(): string {
    if (this.isTeacher()) {
      return '/teacher/my-classes';
    }
    return '/timetable/view';
  }

  getNavbarDisplayName(): string {
    const display = this.getProfileDisplayName();
    if (display) {
      return display;
    }
    return this.getProfileUsername();
  }

  getProfileDisplayName(): string {
    const u = this.authService.getCurrentUser();
    if (!u) return '';

    // 1. Backend-supplied fullName (set for all roles at login)
    if (u.fullName && String(u.fullName).trim()) {
      return String(u.fullName).trim();
    }

    // 2. Teacher profile
    const teacher = u.teacher;
    if (teacher) {
      if (teacher.fullName && String(teacher.fullName).trim()) {
        return String(teacher.fullName).trim();
      }
      const tf = String(teacher.firstName || '').trim();
      const tl = String(teacher.lastName || '').trim();
      if (tf || tl) return [tl, tf].filter(Boolean).join(' ');
    }

    // 3. Student profile
    if (u.student && (u.student.firstName || u.student.lastName)) {
      return [u.student.firstName, u.student.lastName].filter(Boolean).join(' ').trim();
    }

    // 4. Parent profile
    if (u.parent && (u.parent.firstName || u.parent.lastName)) {
      return [u.parent.firstName, u.parent.lastName].filter(Boolean).join(' ').trim();
    }

    // 5. User-level firstName / lastName (admin, accountant, director, etc.)
    const uf = String(u.firstName || '').trim();
    const ul = String(u.lastName || '').trim();
    if (uf || ul) return [uf, ul].filter(Boolean).join(' ');

    return '';
  }

  /** Teachers always see exam/record nav; RBAC may load after first paint. */
  canAccessExamsNav(): boolean {
    return this.canAccessModule('exams') || this.isAdmin() || this.isSuperAdmin() || this.isTeacher();
  }

  canAccessReportCardsNav(): boolean {
    return this.canAccessModule('reportCards') || this.isAdmin() || this.isSuperAdmin() || this.isTeacher();
  }

  canAccessRankingsNav(): boolean {
    return this.canAccessModule('rankings') || this.isAdmin() || this.isSuperAdmin() || this.isTeacher();
  }

  canAccessRecordBookNav(): boolean {
    return this.canAccessModule('recordBook') || this.isTeacher();
  }

  private deriveTitleFromUrl(url: string): string {
    const path = this.normalizeSidebarPath(url);
    const exactTitles: Record<string, string> = {
      '/dashboard': 'Dashboard',
      '/teacher/dashboard': 'Teacher Dashboard',
      '/teacher/manage-account': 'My Account',
      '/parent/dashboard': 'Parent Dashboard',
      '/exams': 'Enter Marks',
      '/mark-sheet': 'Mark Sheet',
      '/report-cards': 'Report Cards',
      '/rankings': 'Rankings',
      '/check_mark_progess': 'Marks Entry Progress',
      '/publish-results': 'Publish Results',
      '/students': 'Students',
      '/teachers': 'Teachers',
      '/classes': 'Classes',
      '/attendance': 'Attendance',
      '/invoices': 'Billing & Invoicing',
      '/payments/record': 'Record Payment',
      '/balance-enquiry': 'Balance Enquiry',
      '/finance/exemptions': 'Exemptions',
      '/finance/audit': 'System Auditor',
      '/system-settings': 'System Settings',
      '/teacher/record-book': 'Record Book',
      '/teacher/my-classes': 'My Classes',
      '/teacher/inventory-record': 'Inventory Record',
      '/messages/inbox': 'Messages Inbox',
      '/news-feed': 'News Feed'
    };
    if (exactTitles[path]) {
      return exactTitles[path];
    }
    if (path.startsWith('/students/') && path.endsWith('/edit')) {
      return 'Edit Student';
    }
    if (path === '/students/new') {
      return 'New Student';
    }
    const segments = path.split('/').filter(Boolean);
    const last = segments[segments.length - 1] || 'dashboard';
    return last
      .replace(/_/g, ' ')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private syncDashboardTitleRotation(): void {
    this.stopDashboardTitleRotation();
  }

  private startDashboardTitleRotation(): void {
    if (this.titleRotationTimerId !== null) {
      return;
    }
    if (!this.dashboardTitleOptions || this.dashboardTitleOptions.length <= 1) {
      return;
    }
    this.titleRotationTimerId = window.setInterval(() => {
      this.dashboardTitleIndex = (this.dashboardTitleIndex + 1) % this.dashboardTitleOptions.length;
    }, this.titleRotationIntervalMs);
  }

  private stopDashboardTitleRotation(): void {
    if (this.titleRotationTimerId !== null) {
      window.clearInterval(this.titleRotationTimerId);
      this.titleRotationTimerId = null;
    }
    this.dashboardTitleIndex = 0;
  }

  isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }

  /** Global left navigation (admin, teacher, parent, student). */
  showAppSidebar(): boolean {
    return this.isAuthenticated();
  }

  /** Parent portal menu — real parents and “view as parent”, not while in student portal mode. */
  isParentNavVisible(): boolean {
    if (this.isActingAsStudent()) {
      return false;
    }
    return this.authService.hasRole('parent') || this.isActingAsParent();
  }

  getParentPortalLabel(): string {
    const u = this.authService.getCurrentUser();
    if (u?.parent) {
      const name = [u.parent.firstName, u.parent.lastName].filter(Boolean).join(' ').trim();
      if (name) {
        return name;
      }
    }
    return this.getNavbarDisplayName();
  }

  isParent(): boolean {
    return this.authService.hasRole('parent') || this.authService.isParentPortalActive();
  }

  isActingAsStudent(): boolean {
    return this.authService.isStudentPortalActive();
  }

  isActingAsParent(): boolean {
    return this.authService.isParentPortalActive();
  }

  isStudent(): boolean {
    return this.authService.hasRole('student') || this.isActingAsStudent();
  }

  isTeacher(): boolean {
    return this.authService.hasRole('teacher');
  }

  isSuperAdmin(): boolean {
    return this.authService.hasRole('superadmin');
  }

  isDirector(): boolean {
    return this.authService.isDirector();
  }

  isFullAccess(): boolean {
    return this.authService.isFullAccess();
  }

  isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  isSchoolLeadership(): boolean {
    return this.authService.isSchoolLeadership();
  }

  isAccountant(): boolean {
    return this.authService.hasRole('accountant');
  }

  /** Only SuperAdmin, Admin, and Accountant can access Outstanding Invoices (teachers cannot). */
  canAccessOutstandingInvoices(): boolean {
    return this.isSuperAdmin() || this.isAdmin() || this.isAccountant();
  }

  isDemoUser(): boolean {
    const user = this.authService.getCurrentUser();
    return user?.isDemo === true || user?.email === 'demo@school.com' || user?.username === 'demo@school.com';
  }

  canAccessModule(moduleName: string): boolean {
    return this.permissionService.canAccessModule(moduleName);
  }

  canAccessFinancePage(pageKey: string, action: 'view' | 'edit' = 'view'): boolean {
    return this.permissionService.canAccessFinancePage(pageKey, action);
  }

  canAccessFinanceManagerMenu(): boolean {
    if (this.authService.isSchoolLeadership() && !this.canAccessModule('finance')) {
      return false;
    }
    return (
      this.canAccessFinancePage('billing') ||
      this.canAccessFinancePage('recordPayment') ||
      this.canAccessFinancePage('balanceEnquiry') ||
      this.canAccessFinancePage('exemptions') ||
      this.canAccessFinancePage('audit')
    );
  }

  canAccessFinancialReportsMenu(): boolean {
    if (this.authService.isSchoolLeadership() && !this.canAccessModule('finance')) {
      return false;
    }
    return (
      this.canAccessFinancePage('reportStudentLedgers') ||
      this.canAccessFinancePage('reportFeesCollection') ||
      this.canAccessFinancePage('reportUnpaidInvoices') ||
      this.canAccessFinancePage('reportExemption') ||
      this.canAccessFinancePage('reportAgedDebtors') ||
      this.canAccessFinancePage('reportEnrolmentBilling') ||
      this.canAccessFinancePage('reportRevenueRecognition') ||
      this.canAccessFinancePage('reportStudentReconciliation') ||
      this.canAccessFinancePage('reportAnalyticsForecasts') ||
      this.canAccessFinancePage('reportClassReconciliation') ||
      this.canAccessFinancePage('reportDiningHall') ||
      this.canAccessFinancePage('reportTransport')
    );
  }

  matchesSidebarFilter(...labels: string[]): boolean {
    const q = this.sidebarMenuFilter.trim().toLowerCase();
    if (!q) {
      return true;
    }
    return labels.some(label => label.toLowerCase().includes(q));
  }

  sidebarMenuVisible(labels: string[], baseShow = true): boolean {
    if (!baseShow) {
      return false;
    }
    return this.matchesSidebarFilter(...labels);
  }

  clearSidebarMenuFilter(): void {
    this.sidebarMenuFilter = '';
  }

  showRegistrationMenu(): boolean {
    return (
      this.showTeachersRegistrationLink() ||
      this.showStudentsRegistrationLink() ||
      this.showParentsRegistrationLink()
    );
  }

  showTeachersRegistrationLink(): boolean {
    return this.canAccessModule('teachers');
  }

  showStudentsRegistrationLink(): boolean {
    return (
      this.isAdmin() ||
      this.isSuperAdmin() ||
      this.isAccountant() ||
      this.canAccessModule('students')
    );
  }

  showParentsRegistrationLink(): boolean {
    if (this.isDirector()) {
      return false;
    }
    return this.canAccessModule('parents');
  }

  isRegistrationSidebarVisible(): boolean {
    if (!this.showRegistrationMenu()) {
      return false;
    }
    return this.sidebarMenuVisible(['Registration', 'Teachers', 'Students', 'Parents']);
  }

  isRegistrationTeachersVisible(): boolean {
    return (
      this.showTeachersRegistrationLink() &&
      this.matchesSidebarFilter('Registration', 'Teachers')
    );
  }

  isRegistrationStudentsVisible(): boolean {
    return (
      this.showStudentsRegistrationLink() &&
      this.matchesSidebarFilter('Registration', 'Students')
    );
  }

  isRegistrationParentsVisible(): boolean {
    return (
      this.showParentsRegistrationLink() &&
      this.matchesSidebarFilter('Registration', 'Parents')
    );
  }

  showClassManagerMenu(): boolean {
    return (
      this.isAdmin() ||
      this.isSuperAdmin() ||
      this.isTeacher() ||
      this.canAccessModule('classes') ||
      this.canAccessEnrolStudent() ||
      this.authService.hasRole('accountant')
    );
  }

  canAccessEnrolStudent(): boolean {
    return (
      this.isAdmin() ||
      this.isSuperAdmin() ||
      this.isTeacher() ||
      this.canAccessModule('students')
    );
  }

  isClassManagerSidebarVisible(): boolean {
    if (!this.showClassManagerMenu()) {
      return false;
    }
    return this.sidebarMenuVisible([
      'Class Manager',
      'Enroll Student',
      'Transfer Student',
      'Manage Classes',
      'Class Lists',
      'Promote Class'
    ]);
  }

  showAttendanceMenu(): boolean {
    return (
      this.isAdmin() ||
      this.isSuperAdmin() ||
      this.isTeacher() ||
      this.canAccessModule('attendance')
    );
  }

  canAccessAttendanceMark(): boolean {
    return (
      this.canAccessModule('attendance') ||
      this.isAdmin() ||
      this.isSuperAdmin() ||
      this.isTeacher()
    );
  }

  canAccessAttendanceReports(): boolean {
    return this.canAccessAttendanceMark();
  }

  isAttendanceSidebarVisible(): boolean {
    if (!this.showAttendanceMenu()) {
      return false;
    }
    return this.sidebarMenuVisible([
      'Attendance',
      'Mark Register',
      'Attendance Reports'
    ]);
  }

  isAttendanceMarkVisible(): boolean {
    return (
      this.canAccessAttendanceMark() &&
      this.matchesSidebarFilter('Attendance', 'Mark Register')
    );
  }

  isAttendanceReportsVisible(): boolean {
    return (
      this.canAccessAttendanceReports() &&
      this.matchesSidebarFilter('Attendance', 'Attendance Reports')
    );
  }

  isClassManagerEnrollVisible(): boolean {
    return (
      this.canAccessEnrolStudent() &&
      this.matchesSidebarFilter('Class Manager', 'Enroll Student')
    );
  }

  isClassManagerTransferVisible(): boolean {
    return (
      (this.isAdmin() ||
        this.isSuperAdmin() ||
        this.authService.hasRole('accountant') ||
        this.canAccessModule('studentManager')) &&
      this.matchesSidebarFilter('Class Manager', 'Transfer Student')
    );
  }

  showTimetableManagerMenu(): boolean {
    return (
      this.isAdmin() ||
      this.isSuperAdmin() ||
      this.isTeacher() ||
      this.canAccessModule('settings')
    );
  }

  isTimetableManagerSidebarVisible(): boolean {
    if (!this.showTimetableManagerMenu()) {
      return false;
    }
    return this.sidebarMenuVisible([
      'Timetable Manager',
      'Assign Subject',
      'Subject Periods',
      'Configure Timetable',
      'Generate Timetable',
      'View Timetable'
    ]);
  }

  isTimetableAssignSubjectVisible(): boolean {
    return (
      (this.isAdmin() || this.isSuperAdmin()) &&
      this.matchesSidebarFilter('Timetable Manager', 'Assign Subject')
    );
  }

  isTimetableSubjectPeriodsVisible(): boolean {
    return (
      (this.isAdmin() || this.isSuperAdmin()) &&
      this.matchesSidebarFilter('Timetable Manager', 'Subject Periods')
    );
  }

  isTimetableConfigureVisible(): boolean {
    return (
      (this.isAdmin() || this.isSuperAdmin()) &&
      this.matchesSidebarFilter('Timetable Manager', 'Configure Timetable')
    );
  }

  isTimetableGenerateVisible(): boolean {
    return (
      (this.isAdmin() || this.isSuperAdmin()) &&
      this.matchesSidebarFilter('Timetable Manager', 'Generate Timetable')
    );
  }

  isTimetableViewVisible(): boolean {
    return this.matchesSidebarFilter('Timetable Manager', 'View Timetable');
  }

  showSystemAdministrationMenu(): boolean {
    return (
      this.isAdmin() ||
      this.isSuperAdmin() ||
      this.canAccessModule('settings')
    );
  }

  isSystemAdministrationSidebarVisible(): boolean {
    if (!this.showSystemAdministrationMenu()) {
      return false;
    }
    return this.sidebarMenuVisible([
      'System Administration',
      'User Management',
      'Role & Permissions',
      'Academic Settings',
      'System Settings',
      'Audit Logs',
      'Analytics & Reports',
      'License Configuration',
      'Integrations'
    ]);
  }

  isSystemAdminUserManagementVisible(): boolean {
    return (
      (this.isAdmin() || this.isSuperAdmin()) &&
      this.matchesSidebarFilter('System Administration', 'User Management')
    );
  }

  isSystemAdminRolesVisible(): boolean {
    return (
      (this.isAdmin() || this.isSuperAdmin()) &&
      this.matchesSidebarFilter('System Administration', 'Role & Permissions', 'Role', 'Permissions')
    );
  }

  isSystemAdminAcademicSettingsVisible(): boolean {
    return (
      (this.isAdmin() || this.isSuperAdmin() || this.canAccessModule('settings')) &&
      this.matchesSidebarFilter('System Administration', 'Academic Settings')
    );
  }

  isSystemAdminSystemSettingsVisible(): boolean {
    return (
      (this.canAccessModule('settings') || this.isAdmin() || this.isSuperAdmin()) &&
      this.matchesSidebarFilter('System Administration', 'System Settings')
    );
  }

  isSystemAdminAuditLogsVisible(): boolean {
    return (
      (this.isAdmin() || this.isSuperAdmin()) &&
      this.matchesSidebarFilter('System Administration', 'Audit Logs', 'Audit', 'Log')
    );
  }

  isSystemAdminAnalyticsVisible(): boolean {
    return (
      (this.isAdmin() ||
        this.isSuperAdmin() ||
        this.canAccessModule('finance') ||
        this.canAccessModule('logistics')) &&
      this.matchesSidebarFilter(
        'System Administration',
        'Analytics & Reports',
        'Analytics',
        'Reports'
      )
    );
  }

  isSystemAdminLicenseConfigVisible(): boolean {
    return (
      (this.isAdmin() || this.isSuperAdmin()) &&
      this.matchesSidebarFilter(
        'System Administration',
        'License Configuration',
        'License',
        'Configuration'
      )
    );
  }

  isSystemAdminIntegrationsVisible(): boolean {
    return (
      (this.isAdmin() || this.isSuperAdmin()) &&
      this.matchesSidebarFilter('System Administration', 'Integrations')
    );
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    // Prevent body scroll when menu is open
    if (this.mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
    document.body.style.overflow = '';
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.userMenuOpen) {
      this.userMenuOpen = false;
      this.cdr.markForCheck();
    }
  }

  toggleUserMenu(event: Event): void {
    event.stopPropagation();
    this.userMenuOpen = !this.userMenuOpen;
    this.cdr.markForCheck();
  }

  closeUserMenu(): void {
    this.userMenuOpen = false;
    this.cdr.markForCheck();
  }

  get profileRoute(): string {
    return this.authService.getManageAccountRoute();
  }

  getProfileUsername(): string {
    const u = this.authService.getCurrentUser();
    if (!u) return 'User';

    // Strip @domain from usernames that happen to be formatted as email addresses
    let username = String(u.username || '').trim();
    if (username.includes('@')) {
      username = username.split('@')[0];
    }
    if (username) return username;

    const email = String(u.email || '').trim();
    if (email.includes('@')) return email.split('@')[0];
    return email || 'User';
  }

  getProfileRoleShort(): string {
    const u = this.authService.getCurrentUser();
    if (!u) {
      return 'User';
    }
    const r = String(this.authService.getEffectiveRole() || u.role || '').toLowerCase();
    if (r === 'superadmin') return 'Super Admin';
    if (r === 'admin') return 'Admin';
    if (r === 'director') return 'Director';
    if (r === 'headmaster') return 'Headmaster';
    if (r === 'deputy_headmaster') return 'Deputy Head';
    if (r === 'accountant') return 'Accountant';
    if (r === 'teacher') return 'Teacher';
    if (r === 'parent') return 'Parent';
    if (r === 'student') return 'Student';
    return 'User';
  }

  getProfileInitials(): string {
    const display = this.getProfileDisplayName();
    if (display) {
      const parts = display.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
      }
      return display.slice(0, 2).toUpperCase();
    }
    return this.getProfileUsername().slice(0, 2).toUpperCase();
  }

  onMyProfileClick(): void {
    this.closeUserMenu();
    this.closeMobileMenu();
  }

  signOut(): void {
    this.closeUserMenu();
    this.logout();
  }

  logout(): void {
    this.closeMobileMenu();
    void this.authService.confirmLogout().then((confirmed) => {
      if (!confirmed) {
        return;
      }
      fetch(`${environment.apiUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: `Bearer ${this.authService.getToken() || ''}` },
      }).finally(() => this.authService.logout('manual', { skipConfirm: true }));
    });
  }

  onLogoutConfirmYes(): void {
    this.logoutConfirm.confirm();
    this.cdr.markForCheck();
  }

  onLogoutConfirmNo(): void {
    this.logoutConfirm.cancel();
    this.cdr.markForCheck();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.logoutConfirm.visible) {
      this.onLogoutConfirmNo();
      return;
    }
    if (this.userMenuOpen) {
      this.closeUserMenu();
    }
  }

  exitStudentPortal(): void {
    this.authService.exitStudentPortal();
    this.router.navigate(['/parent/dashboard']).catch(() => {});
  }

  exitParentPortal(): void {
    this.authService.exitParentPortal();
    this.router.navigate(['/dashboard']).catch(() => {});
  }

  toggleSidebar(): void {
    // On tablet/mobile, use the sidebar toggle button as a drawer open/close control
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 992px)').matches) {
      this.toggleMobileMenu();
      return;
    }

    this.sidebarCollapsed = !this.sidebarCollapsed;
    if (this.sidebarCollapsed) {
      this.expandedMenus = {};
    } else {
      this.syncExpandedMenusFromUrl(this.router.url || '');
    }
    this.cdr.markForCheck();
  }

  toggleMenu(menuKey: string): void {
    if (this.sidebarCollapsed) {
      return;
    }
    if (this.isMenuExpanded(menuKey)) {
      this.expandedMenus = {};
    } else {
      this.expandedMenus = { [menuKey]: true };
    }
    this.cdr.markForCheck();
  }

  /** Called from submenu links so the section is open before navigation (avoids needing two clicks). */
  ensureMenuExpanded(menuKey: string): void {
    if (this.sidebarCollapsed) {
      return;
    }
    this.expandedMenus = { [menuKey]: true };
  }

  /** Expand a sidebar section before following a submenu routerLink (one-click navigation). */
  prepareSidebarNavigation(menuKey: string): void {
    if (this.sidebarCollapsed) {
      return;
    }
    this.expandedMenus = { [menuKey]: true };
    this.cdr.markForCheck();
  }

  /** Expand a section when navigating to a child route so submenu links work on first click. */
  private normalizeSidebarPath(url: string): string {
    const path = (url || '').split('?')[0].split('#')[0];
    if (!path || path === '/') return '/';
    return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
  }

  private syncExpandedMenusFromUrl(url: string): void {
    const path = this.normalizeSidebarPath(url);
    let matchedKey: string | null = null;
    let matchedPrefixLen = 0;

    for (const [menuKey, prefixes] of Object.entries(SIDEBAR_MENU_ROUTE_PREFIXES)) {
      for (const prefix of prefixes) {
        const hit = path === prefix || path.startsWith(prefix + '/');
        if (hit && prefix.length > matchedPrefixLen) {
          matchedPrefixLen = prefix.length;
          matchedKey = menuKey;
        }
      }
    }

    this.expandedMenus = matchedKey ? { [matchedKey]: true } : {};
  }

  isMenuRouteActive(menuKey: string): boolean {
    const path = this.normalizeSidebarPath(this.currentUrl || this.router.url || '');
    const prefixes = SIDEBAR_MENU_ROUTE_PREFIXES[menuKey];
    if (!prefixes?.length) return false;
    return prefixes.some((p) => path === p || path.startsWith(p + '/'));
  }

  isMenuExpanded(menuKey: string): boolean {
    return !!this.expandedMenus[menuKey];
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  getCurrentUserRole(): string {
    const role = this.authService.getEffectiveRole();
    if (!role) {
      return '';
    }

    if (role === 'superadmin') return 'SuperAdmin';
    if (role === 'admin') return 'Admin';
    if (role === 'director') return 'Director';
    if (role === 'headmaster') return 'Headmaster';
    if (role === 'deputy_headmaster') return 'Deputy Headmaster';
    if (role === 'accountant') return 'Accountant';
    if (role === 'teacher') return 'Teacher';
    if (role === 'parent') return 'Parent';
    if (role === 'student') return 'Student';
    if (role === 'demo_user' || role === 'demo-user') return 'Demo User';

    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  private resolveModuleName(url: string): string | null {
    if (!url) return null;
    if (url.startsWith('/students')) return 'Students';
    if (url.startsWith('/teachers')) return 'Teachers';
    if (url.startsWith('/classes')) return 'Classes';
    if (url.startsWith('/subjects')) return 'Subjects';
    if (url.startsWith('/exams') || url.startsWith('/mark-sheet') || url.startsWith('/report-cards') || url.startsWith('/publish-results') || url.startsWith('/check_mark_progess') || url.startsWith('/rankings')) return 'Exams';
    if (url.startsWith('/timetable')) return 'Timetable';
if (url.startsWith('/settings')) return 'Settings';
    if (url.startsWith('/attendance')) return 'Attendance';
    if (url.startsWith('/invoices') || url.startsWith('/payments') || url.startsWith('/finance')) return 'Finance';
    if (url.startsWith('/messages')) return 'Messages';
    if (url.startsWith('/dashboard')) return 'Dashboard';
    if (url.startsWith('/user-log')) return 'Activity Log';
    return 'Other';
  }

  private updateMetaFromRoute(): void {
    const deepest = this.getDeepestRoute(this.activatedRoute);
    const data = deepest.snapshot.data || {};

    const routeTitle =
      (data['pageTitle'] as string) ||
      (data['title'] as string) ||
      this.deriveTitleFromUrl(this.currentUrl || this.router.url || '');
    this.pageNavbarTitle = routeTitle;

    const description = data['description'] || '';
    const robots = data['robots'] || 'noindex,nofollow';

    const browserTitle = this.schoolName
      ? `${routeTitle} | ${this.schoolName}`
      : routeTitle;
    this.title.setTitle(browserTitle);

    if (description) {
      this.meta.updateTag({ name: 'description', content: description });
    } else {
      this.meta.removeTag("name='description'");
    }

    this.meta.updateTag({ name: 'robots', content: robots });
    this.cdr.markForCheck();
  }

  private getDeepestRoute(route: ActivatedRoute): ActivatedRoute {
    let current: ActivatedRoute = route;
    while (current.firstChild) {
      current = current.firstChild;
    }
    return current;
  }
}


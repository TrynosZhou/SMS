import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { AuthService } from './services/auth.service';
import { SettingsService } from './services/settings.service';
import { ModuleAccessService } from './services/module-access.service';
import { ThemeService } from './services/theme.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuditService } from './services/audit.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  schoolName = 'School Management System';
  schoolLogo: string | null = null;
  mobileMenuOpen = false;
  sidebarCollapsed = false;
  expandedMenus: { [key: string]: boolean } = {};
  private authSubscription?: Subscription;

  constructor(
    public authService: AuthService, 
    private settingsService: SettingsService,
    public moduleAccessService: ModuleAccessService,
    public themeService: ThemeService,
    private router: Router,
    private auditService: AuditService,
    private activatedRoute: ActivatedRoute,
    private title: Title,
    private meta: Meta
  ) { }

  ngOnInit(): void {
    // Load school name from settings if authenticated
    if (this.authService.isAuthenticated()) {
      this.settingsService.getSettings().subscribe({
        next: (settings: any) => {
          this.schoolName = settings?.schoolName || 'School Management System';
          this.schoolLogo = settings?.schoolLogo || null;
        },
        error: () => {
          // ignore settings fetch errors to avoid blocking UI
        }
      });
      
      // Load module access settings
      this.moduleAccessService.loadModuleAccess();
    }

    // Log module access and update meta tags on navigation
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.updateMetaFromRoute();
      // Close mobile menu/drawer after navigation
      if (this.mobileMenuOpen) {
        this.closeMobileMenu();
      }
      if (!this.authService.isAuthenticated()) return;
      const user = this.authService.getCurrentUser();
      const role = (user?.role || '').toLowerCase();
      if (!['admin', 'superadmin', 'teacher', 'accountant'].includes(role)) return;
      const url = (e.urlAfterRedirects || e.url || '').toString();
      const moduleName = this.resolveModuleName(url);
      if (moduleName) {
        const sessionId = localStorage.getItem('sessionId') || undefined;
        this.auditService.logActivity(moduleName, sessionId).subscribe({ next: () => {}, error: () => {} });
      }
    });

    this.authSubscription = this.authService.currentUser$.subscribe(user => {
      // User state changes handled by auth service
    });

    // Set initial meta tags
    this.updateMetaFromRoute();
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }

  isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }

  isParent(): boolean {
    return this.authService.hasRole('parent');
  }

  isStudent(): boolean {
    return this.authService.hasRole('student');
  }

  isTeacher(): boolean {
    return this.authService.hasRole('teacher');
  }

  isSuperAdmin(): boolean {
    return this.authService.hasRole('superadmin');
  }

  isAdmin(): boolean {
    return this.authService.hasRole('admin') || this.authService.hasRole('superadmin');
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
    return this.moduleAccessService.canAccessModule(moduleName);
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

  logout(): void {
    this.closeMobileMenu();
    // Try to inform backend to finalize session log; ignore errors
    fetch(`${environment.apiUrl}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Authorization': `Bearer ${this.authService.getToken() || ''}` }
    }).finally(() => this.authService.logout());
  }

  toggleSidebar(): void {
    // On mobile, use the sidebar toggle button as a drawer open/close control
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
      this.toggleMobileMenu();
      return;
    }

    this.sidebarCollapsed = !this.sidebarCollapsed;
    // Collapse all menus when sidebar is collapsed
    if (this.sidebarCollapsed) {
      this.expandedMenus = {};
    }
  }

  toggleMenu(menuKey: string): void {
    // Don't expand menus when sidebar is collapsed
    if (this.sidebarCollapsed) {
      return;
    }
    this.expandedMenus[menuKey] = !this.expandedMenus[menuKey];
  }

  isMenuExpanded(menuKey: string): boolean {
    return this.expandedMenus[menuKey] || false;
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  getCurrentUserRole(): string {
    const user = this.authService.getCurrentUser();
    if (!user || !user.role) {
      return '';
    }

    const role = user.role.toLowerCase();

    if (role === 'superadmin') return 'SuperAdmin';
    if (role === 'admin') return 'Admin';
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

    const pageTitle = data['title'] || 'School Management System';
    const description = data['description'] || '';
    const robots = data['robots'] || 'noindex,nofollow';

    this.title.setTitle(pageTitle);

    if (description) {
      this.meta.updateTag({ name: 'description', content: description });
    } else {
      this.meta.removeTag("name='description'");
    }

    this.meta.updateTag({ name: 'robots', content: robots });
  }

  private getDeepestRoute(route: ActivatedRoute): ActivatedRoute {
    let current: ActivatedRoute = route;
    while (current.firstChild) {
      current = current.firstChild;
    }
    return current;
  }
}


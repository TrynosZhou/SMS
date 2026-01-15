import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { AuthService } from './services/auth.service';
import { SettingsService } from './services/settings.service';
import { ModuleAccessService } from './services/module-access.service';
import { of } from 'rxjs';

describe('AppComponent', () => {
  let component: AppComponent;
  let authService: jasmine.SpyObj<AuthService>;
  let settingsService: jasmine.SpyObj<SettingsService>;
  let moduleAccessService: jasmine.SpyObj<ModuleAccessService>;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', [
      'isAuthenticated',
      'hasRole',
      'getCurrentUser',
      'logout'
    ], {
      currentUser$: of(null)
    });

    const settingsServiceSpy = jasmine.createSpyObj('SettingsService', ['getSettings']);
    const moduleAccessServiceSpy = jasmine.createSpyObj('ModuleAccessService', [
      'loadModuleAccess',
      'canAccessModule'
    ]);

    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: SettingsService, useValue: settingsServiceSpy },
        { provide: ModuleAccessService, useValue: moduleAccessServiceSpy }
      ]
    }).compileComponents();

    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    settingsService = TestBed.inject(SettingsService) as jasmine.SpyObj<SettingsService>;
    moduleAccessService = TestBed.inject(ModuleAccessService) as jasmine.SpyObj<ModuleAccessService>;

    authService.isAuthenticated.and.returnValue(false);
    authService.hasRole.and.returnValue(false);
    authService.getCurrentUser.and.returnValue(null);
    settingsService.getSettings.and.returnValue(of({}));
    moduleAccessService.canAccessModule.and.returnValue(true);

    const fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  it('should have default school name', () => {
    expect(component.schoolName).toBe('School Management System');
  });

  it('should check authentication status', () => {
    authService.isAuthenticated.and.returnValue(true);
    expect(component.isAuthenticated()).toBe(true);
  });

  it('should check if user is admin', () => {
    authService.hasRole.and.returnValue(true);
    expect(component.isAdmin()).toBe(true);
  });

  it('should toggle mobile menu', () => {
    expect(component.mobileMenuOpen).toBe(false);
    component.toggleMobileMenu();
    expect(component.mobileMenuOpen).toBe(true);
    component.toggleMobileMenu();
    expect(component.mobileMenuOpen).toBe(false);
  });

  it('should toggle sidebar', () => {
    expect(component.sidebarCollapsed).toBe(false);
    component.toggleSidebar();
    expect(component.sidebarCollapsed).toBe(true);
    component.toggleSidebar();
    expect(component.sidebarCollapsed).toBe(false);
  });

  it('should toggle menu expansion', () => {
    expect(component.isMenuExpanded('test-menu')).toBe(false);
    component.toggleMenu('test-menu');
    expect(component.isMenuExpanded('test-menu')).toBe(true);
    component.toggleMenu('test-menu');
    expect(component.isMenuExpanded('test-menu')).toBe(false);
  });

  it('should call logout on auth service', () => {
    component.logout();
    expect(authService.logout).toHaveBeenCalled();
  });
});


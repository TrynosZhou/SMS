import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { TeacherService } from '../../../services/teacher.service';
import { SettingsService } from '../../../services/settings.service';
import { ModuleAccessService } from '../../../services/module-access.service';

@Component({
  selector: 'app-teacher-dashboard',
  templateUrl: './teacher-dashboard.component.html',
  styleUrls: ['./teacher-dashboard.component.css']
})
export class TeacherDashboardComponent implements OnInit {
  teacher: any = null;
  teacherClasses: any[] = [];
  selectedClassId: string = '';
  loading = false;
  error = '';
  teacherName = '';
  schoolName = '';
  moduleAccess: any = null;
  availableModules: any[] = [];
  sidebarCollapsed = false;
  expandedMenus: { [key: string]: boolean } = {};

  constructor(
    private authService: AuthService,
    private teacherService: TeacherService,
    private settingsService: SettingsService,
    private moduleAccessService: ModuleAccessService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    // Initialize teacher name from user data if available (from login response)
    const user = this.authService.getCurrentUser();
    if (user?.teacher) {
      // Use fullName from login response if available, otherwise construct it
      if (user.teacher.fullName && user.teacher.fullName.trim() && user.teacher.fullName !== 'Teacher') {
        this.teacherName = user.teacher.fullName.trim();
        console.log('Constructor: Using fullName from login response:', this.teacherName);
      } else {
        this.teacherName = this.getFullName(user.teacher.firstName, user.teacher.lastName);
        console.log('Constructor: Constructed fullName:', this.teacherName);
      }
    } else {
      this.teacherName = 'Teacher';
      console.log('Constructor: No teacher data, using default:', this.teacherName);
    }
  }

  private getFullName(firstName?: string, lastName?: string): string {
    // Handle null, undefined, or empty strings
    const first = (firstName && typeof firstName === 'string') ? firstName.trim() : '';
    const last = (lastName && typeof lastName === 'string') ? lastName.trim() : '';
    
    console.log('getFullName called with:', { firstName: first, lastName: last });
    
    // Filter out default placeholder values
    const validFirst = (first && first !== 'Teacher' && first !== 'Account') ? first : '';
    const validLast = (last && last !== 'Teacher' && last !== 'Account') ? last : '';
    
    console.log('After filtering:', { validFirst, validLast });
    
    // Combine as LastName + FirstName (as requested)
    const parts = [validLast, validFirst].filter(part => part.length > 0);
    const fullName = parts.join(' ').trim();
    
    console.log('getFullName result:', fullName);
    
    // Return full name if available, otherwise return 'Teacher'
    return fullName || 'Teacher';
  }

  ngOnInit() {
    this.loadSettings();
    // Initialize with default modules first
    this.updateAvailableModules();
    // Then load from settings
    this.loadModuleAccess();
    
    // Log initial state
    console.log('=== ngOnInit ===');
    console.log('Initial teacherName:', this.teacherName);
    const user = this.authService.getCurrentUser();
    console.log('Current user:', user);
    console.log('User teacher:', user?.teacher);
    
    this.loadTeacherInfo();
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.schoolName = data.schoolName || 'School';
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
      }
    });
  }

  loadModuleAccess() {
    // Ensure module access service is loaded
    this.moduleAccessService.loadModuleAccess();
    
    // Get module access (will use default if not loaded yet)
    this.moduleAccess = this.moduleAccessService.getModuleAccess();
    
    // Load from settings and update
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        // Update module access from settings
        if (settings?.moduleAccess) {
          this.moduleAccess = settings.moduleAccess;
          // Update the service as well
          (this.moduleAccessService as any).moduleAccess = settings.moduleAccess;
        }
        
        this.updateAvailableModules();
        console.log('Available modules for teacher:', this.availableModules);
        console.log('Module access from settings:', this.moduleAccess?.teachers);
      },
      error: (err: any) => {
        console.error('Error loading module access:', err);
        // Use default module access from service
        this.updateAvailableModules();
      }
    });
  }

  private updateAvailableModules() {
    // Get module access (use service which has defaults)
    const access = this.moduleAccessService.getModuleAccess();
    const teacherModules = access?.teachers || {};
    
    const allModules = [
      { key: 'students', name: 'Students', route: '/students', icon: '👥', description: 'View and manage students' },
      { key: 'classes', name: 'Classes', route: '/classes', icon: '🏫', description: 'View class information' },
      { key: 'subjects', name: 'Subjects', route: '/subjects', icon: '📚', description: 'View subject details' },
      { key: 'exams', name: 'Exams', route: '/exams', icon: '📝', description: 'Manage exams and assessments' },
      { key: 'reportCards', name: 'Report Cards', route: '/report-cards', icon: '📊', description: 'View and generate report cards' },
      { key: 'rankings', name: 'Rankings', route: '/rankings', icon: '🏆', description: 'View student rankings' },
      { key: 'recordBook', name: 'Record Book', route: '/teacher/record-book', icon: '📖', description: 'Enter and view marks' },
      { key: 'attendance', name: 'Attendance', route: '/attendance', icon: '✅', description: 'Manage student attendance' },
      { key: 'finance', name: 'Finance', route: '/invoices', icon: '💰', description: 'View financial information' },
      { key: 'settings', name: 'Settings', route: '/settings', icon: '⚙️', description: 'System settings' }
    ];
    
    // Filter modules based on access (default to true if not explicitly set to false)
    this.availableModules = allModules.filter(module => {
      // Use type-safe access with type assertion
      const moduleAccess = teacherModules as { [key: string]: boolean | undefined };
      const hasAccess = moduleAccess[module.key] !== false;
      return hasAccess;
    });
    
    console.log('Updated available modules:', this.availableModules.length);
  }

  loadTeacherInfo() {
    const user = this.authService.getCurrentUser();
    
    // Check if user is a teacher
    if (!user || user.role !== 'teacher') {
      this.error = 'Only teachers can access this dashboard';
      return;
    }

    this.loading = true;
    this.error = '';
    
    // Load teacher info first
    this.teacherService.getCurrentTeacher().subscribe({
      next: (teacher: any) => {
        this.teacher = teacher;
        
        // Debug: Log raw teacher data
        console.log('Raw teacher data:', JSON.stringify(teacher, null, 2));
        console.log('Teacher firstName:', teacher.firstName, 'Type:', typeof teacher.firstName, 'Value:', JSON.stringify(teacher.firstName));
        console.log('Teacher lastName:', teacher.lastName, 'Type:', typeof teacher.lastName, 'Value:', JSON.stringify(teacher.lastName));
        console.log('Teacher fullName from response:', teacher.fullName);
        
        // Update teacher name - prioritize fullName from response, otherwise construct it
        // Filter out default placeholder values ("Teacher", "Account")
        const hasValidName = teacher.firstName && 
                            teacher.firstName.trim() && 
                            teacher.firstName !== 'Teacher' && 
                            teacher.firstName !== 'Account' &&
                            teacher.lastName && 
                            teacher.lastName.trim() && 
                            teacher.lastName !== 'Teacher' && 
                            teacher.lastName !== 'Account';
        
        if (hasValidName) {
          // Construct fullName from firstName/lastName (LastName + FirstName format)
          const firstName = teacher.firstName.trim();
          const lastName = teacher.lastName.trim();
          this.teacherName = this.getFullName(firstName, lastName);
          console.log('Using valid firstName/lastName to construct fullName:', this.teacherName);
        } else if (teacher.fullName && teacher.fullName.trim() && teacher.fullName !== 'Teacher' && teacher.fullName !== 'Account Teacher') {
          // Use fullName from backend response if firstName/lastName are placeholders
          this.teacherName = teacher.fullName.trim();
          console.log('Using fullName from response:', this.teacherName);
        } else {
          // Last resort: try to construct from whatever we have
          const firstName = (teacher.firstName && teacher.firstName.trim()) ? teacher.firstName.trim() : '';
          const lastName = (teacher.lastName && teacher.lastName.trim()) ? teacher.lastName.trim() : '';
          this.teacherName = this.getFullName(firstName, lastName);
          console.log('Fallback: Constructed fullName from available data:', this.teacherName);
        }
        
        console.log('Teacher loaded successfully - Full Name:', this.teacherName);
        console.log('Teacher details:', { 
          rawFirstName: teacher.firstName,
          rawLastName: teacher.lastName,
          fullNameFromResponse: teacher.fullName,
          finalFullName: this.teacherName,
          teacherId: teacher.teacherId
        });
        
        // Force UI update
        console.log('Forcing change detection...');
        this.cdr.detectChanges();
        console.log('teacherName after change detection:', this.teacherName);
        
        // Always fetch classes from dedicated endpoint to ensure we get correct classes from junction table
        if (teacher.id) {
          console.log('Fetching classes for teacher ID:', teacher.id);
          this.loadTeacherClasses(teacher.id);
        } else {
          // Fallback to classes from getCurrentTeacher response
          this.teacherClasses = teacher.classes || [];
          this.loading = false;
          console.log('Using classes from getCurrentTeacher (fallback):', this.teacherClasses.length);
        }
        
        // Force change detection to update the view with the new name
        this.cdr.detectChanges();
        
        // Double-check: if teacherName is still empty or default, try to get it from user object
        if (!this.teacherName || this.teacherName === 'Teacher' || this.teacherName.trim() === '') {
          console.log('TeacherName is empty or default, trying fallback...');
          const user = this.authService.getCurrentUser();
          console.log('User object:', user);
          console.log('User teacher:', user?.teacher);
          
          if (user?.teacher) {
            // Try fullName first
            if (user.teacher.fullName && user.teacher.fullName.trim() && user.teacher.fullName !== 'Teacher') {
              this.teacherName = user.teacher.fullName.trim();
              console.log('Fallback: Set teacherName from user.teacher.fullName:', this.teacherName);
            } 
            // Try constructing from firstName/lastName
            else if (user.teacher.firstName && user.teacher.lastName && 
                     user.teacher.firstName !== 'Teacher' && user.teacher.lastName !== 'Account') {
              this.teacherName = this.getFullName(user.teacher.firstName, user.teacher.lastName);
              console.log('Fallback: Constructed teacherName from user.teacher:', this.teacherName);
            }
            
            if (this.teacherName && this.teacherName !== 'Teacher') {
              this.cdr.detectChanges();
              console.log('Final teacherName after fallback:', this.teacherName);
            }
          }
        }
      },
      error: (err: any) => {
        console.error('Error loading teacher:', err);
        this.loading = false;
        
        // Fallback: Try to get name from user object if API call fails
        const user = this.authService.getCurrentUser();
        if (user?.teacher) {
          if (user.teacher.fullName && user.teacher.fullName.trim() && user.teacher.fullName !== 'Teacher') {
            this.teacherName = user.teacher.fullName.trim();
            console.log('Error handler: Using fullName from user object:', this.teacherName);
          } else {
            this.teacherName = this.getFullName(user.teacher.firstName, user.teacher.lastName);
            console.log('Error handler: Constructed fullName:', this.teacherName);
          }
          this.cdr.detectChanges();
        }
        
        if (err.status === 404) {
          this.error = 'No teacher profile found for your account. Please contact the administrator.';
        } else if (err.status === 401) {
          this.error = 'You are not authenticated. Please log in again.';
          setTimeout(() => {
            this.authService.logout();
          }, 2000);
        } else {
          this.error = 'Failed to load teacher information. Please try again.';
        }
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  loadTeacherClasses(teacherId: string) {
    this.teacherService.getTeacherClasses(teacherId).subscribe({
      next: (response: any) => {
        const classes = response.classes || [];
        // Only use classes from the dedicated endpoint (these are from junction table)
        this.teacherClasses = classes;
        console.log('✓ Assigned classes loaded from dedicated endpoint:', this.teacherClasses.length);
        console.log('Classes:', this.teacherClasses.map(c => c.name).join(', '));
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading teacher classes:', err);
        // Fallback to classes from teacher object if available
        this.teacherClasses = this.teacher?.classes || [];
        console.log('Using fallback classes from teacher object:', this.teacherClasses.length);
        this.loading = false;
      }
    });
  }

  openRecordBook(classItem?: any) {
    // Use selected class from dropdown or passed classItem
    const classId = classItem?.id || this.selectedClassId;
    if (!classId) {
      this.error = 'Please select a class first';
      setTimeout(() => this.error = '', 3000);
      return;
    }
    // Navigate to record book with class ID
    this.router.navigate(['/teacher/record-book'], {
      queryParams: { classId: classId }
    });
  }

  onClassSelected() {
    // When a class is selected from dropdown, can navigate or show details
    if (this.selectedClassId) {
      console.log('Class selected:', this.selectedClassId);
    }
  }

  navigateToModule(module: any) {
    if (module.route) {
      this.router.navigate([module.route]);
    }
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    // Collapse all menus when sidebar is collapsed
    if (this.sidebarCollapsed) {
      this.expandedMenus = {};
    }
  }

  toggleMenu(menuKey: string) {
    if (this.sidebarCollapsed) {
      return;
    }
    this.expandedMenus[menuKey] = !this.expandedMenus[menuKey];
  }

  isMenuExpanded(menuKey: string): boolean {
    return this.expandedMenus[menuKey] || false;
  }

  canAccessModule(moduleName: string): boolean {
    // Use module access service which has default access as fallback
    return this.moduleAccessService.canAccessModule(moduleName);
  }

  logout() {
    this.authService.logout();
  }

  manageAccount() {
    this.router.navigate(['/teacher/manage-account']);
  }
}


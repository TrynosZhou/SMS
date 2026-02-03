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
  showBulkMessage = false;
  displayedText: string = '';
  private textToggleInterval: any;
  private showMotto: boolean = false;
  teacherName: string = '';

  // Sidebar collapse state
  studentManagementOpen = true;
  examManagementOpen = true;
  financeManagementOpen = true;
  reportsOpen = true;
  generalSettingsOpen = true;
  
  // Statistics
  stats = {
    totalStudents: 0,
    totalTeachers: 0,
    totalClasses: 0,
    totalSubjects: 0,
    totalInvoices: 0,
    totalBalance: 0,
    dayScholars: 0,
    boarders: 0,
    staffChildren: 0
  };
  
  loadingStats = true;
  recentStudents: any[] = [];
  recentInvoices: any[] = [];
  
  // Student-specific properties
  studentBalance: number = 0;
  loadingBalance = false;
  activeTerm: string = '';
  currencySymbol: string = 'KES';
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
  ) { }

  ngOnInit() {
    this.user = this.authService.getCurrentUser();
    // Load module access from service
    this.moduleAccessService.loadModuleAccess();
    this.loadSettings();
    if (this.isAdmin() || this.isAccountant() || this.isTeacher()) {
      this.loadStatistics();
    }
    // Load teacher name if user is a teacher (this will set teacherName immediately from user.teacher)
    if (this.isTeacher()) {
      this.loadTeacherName();
    }
    // Load student-specific data if user is a student
    if (this.isStudent()) {
      this.loadStudentData();
    }
  }

  ngOnDestroy() {
    // Clear interval when component is destroyed
    if (this.textToggleInterval) {
      clearInterval(this.textToggleInterval);
    }
  }

  loadStatistics() {
    this.loadingStats = true;
    
    // Load students
    this.studentService.getStudents().subscribe({
      next: (students: any[]) => {
        const studentsArray = Array.isArray(students) ? students : [];
        this.stats.totalStudents = studentsArray.length;
        this.stats.dayScholars = studentsArray.filter(s => s.studentType === 'Day Scholar').length;
        this.stats.boarders = studentsArray.filter(s => s.studentType === 'Boarder').length;
        this.stats.staffChildren = studentsArray.filter(s => s.isStaffChild).length;
        this.recentStudents = studentsArray
          .sort((a, b) => new Date(b.enrollmentDate || b.createdAt || 0).getTime() - new Date(a.enrollmentDate || a.createdAt || 0).getTime())
          .slice(0, 5);
        this.checkLoadingComplete();
      },
      error: (err) => {
        console.error('Error loading students:', err);
        this.stats.totalStudents = 0;
        this.stats.dayScholars = 0;
        this.stats.boarders = 0;
        this.stats.staffChildren = 0;
        this.recentStudents = [];
        this.checkLoadingComplete();
      }
    });
    
    // Load teachers
    this.teacherService.getTeachers().subscribe({
      next: (teachers: any[]) => {
        const teachersArray = Array.isArray(teachers) ? teachers : [];
        this.stats.totalTeachers = teachersArray.length;
        this.checkLoadingComplete();
      },
      error: (err) => {
        console.error('Error loading teachers:', err);
        this.stats.totalTeachers = 0;
        this.checkLoadingComplete();
      }
    });
    
    // Load classes
    this.classService.getClasses().subscribe({
      next: (classes: any[]) => {
        const classesArray = Array.isArray(classes) ? classes : [];
        this.stats.totalClasses = classesArray.filter(c => c.isActive).length;
        this.checkLoadingComplete();
      },
      error: (err) => {
        console.error('Error loading classes:', err);
        this.stats.totalClasses = 0;
        this.checkLoadingComplete();
      }
    });
    
    // Load subjects
    this.subjectService.getSubjects().subscribe({
      next: (subjects: any[]) => {
        const subjectsArray = Array.isArray(subjects) ? subjects : [];
        this.stats.totalSubjects = subjectsArray.length;
        this.checkLoadingComplete();
      },
      error: (err) => {
        console.error('Error loading subjects:', err);
        this.stats.totalSubjects = 0;
        this.checkLoadingComplete();
      }
    });
    
    // Load invoices (for admin/accountant)
    if (this.isAdmin() || this.isAccountant()) {
      this.financeService.getInvoices().subscribe({
        next: (invoices: any[]) => {
          const invoicesArray = Array.isArray(invoices) ? invoices : [];
          this.stats.totalInvoices = invoicesArray.length;
          this.stats.totalBalance = invoicesArray.reduce((sum, inv) => sum + (parseFloat(inv.balance) || 0), 0);
          this.recentInvoices = invoicesArray
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            .slice(0, 5);
          this.checkLoadingComplete();
        },
        error: (err) => {
          console.error('Error loading invoices:', err);
          this.stats.totalInvoices = 0;
          this.stats.totalBalance = 0;
          this.recentInvoices = [];
          this.checkLoadingComplete();
        }
      });
    }
  }
  
  private checkLoadingComplete() {
    // Simple check - in a real app, you'd use a more sophisticated loading state
    setTimeout(() => {
      this.loadingStats = false;
    }, 500);
  }

  isDemoUser(): boolean {
    const user = this.authService.getCurrentUser();
    return user?.isDemo === true || user?.email === 'demo@school.com' || user?.username === 'demo@school.com';
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        // For demo users, always use "Demo School"
        if (this.isDemoUser()) {
          this.schoolName = 'Demo School';
        } else {
          this.schoolName = data.schoolName || '';
        }
        this.schoolMotto = data.schoolMotto || '';
        this.moduleAccess = data.moduleAccess || {};
        this.currencySymbol = data.currencySymbol || 'KES';
        
        // Update module access service with latest settings
        if (data.moduleAccess) {
          (this.moduleAccessService as any).moduleAccess = data.moduleAccess;
        }
        
        // Initialize displayed text and start toggle timer
        this.initializeTextToggle();
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
        this.schoolName = '';
        // Use default module access from service
        this.moduleAccess = this.moduleAccessService.getModuleAccess();
      }
    });
  }


  isAdmin(): boolean {
    // Check if user is SUPERADMIN or ADMIN
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
    // Use module access service which has proper defaults and settings integration
    return this.moduleAccessService.canAccessModule(module);
  }

  canAccessModule(module: string): boolean {
    // Alias for hasModuleAccess for consistency
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

    // Universal teacher has no linked teacher profile
    if ((user as any).isUniversalTeacher) {
      this.teacherName = 'Universal Teacher';
      return;
    }

    // First, try to get name from user object (from login response)
    if (user.teacher) {
      // Prioritize fullName from login response
      if (user.teacher.fullName && 
          user.teacher.fullName.trim() && 
          user.teacher.fullName !== 'Teacher' && 
          user.teacher.fullName !== 'Account Teacher') {
        this.teacherName = user.teacher.fullName.trim();
        return;
      }
      
      // Fallback to extracting from firstName/lastName
        const name = this.extractTeacherName(user.teacher);
        if (name && name !== 'Teacher' && name.trim()) {
          this.teacherName = name;
          return;
        }
    }

    // If not available in user object, fetch from API as fallback
    this.teacherService.getCurrentTeacher().subscribe({
      next: (teacher: any) => {
        // Prioritize fullName from API response
        if (teacher.fullName && 
            teacher.fullName.trim() && 
            teacher.fullName !== 'Teacher' && 
            teacher.fullName !== 'Account Teacher') {
          this.teacherName = teacher.fullName.trim();
        } else {
          const name = this.extractTeacherName(teacher);
          if (name && name !== 'Teacher' && name.trim()) {
            this.teacherName = name;
          }
        }
      },
      error: (err) => {
        console.error('Error loading teacher name from API:', err);
        // Keep teacherName empty, getDisplayName() will handle fallback
        this.teacherName = '';
      }
    });
  }

  private extractTeacherName(teacher: any): string {
    if (!teacher) {
      return '';
    }

    // Use fullName if available and valid
    if (teacher.fullName && teacher.fullName.trim() && teacher.fullName !== 'Teacher' && teacher.fullName !== 'Account Teacher') {
      return teacher.fullName.trim();
    }

    // Otherwise construct from firstName and lastName
    const firstName = (teacher.firstName && typeof teacher.firstName === 'string') ? teacher.firstName.trim() : '';
    const lastName = (teacher.lastName && typeof teacher.lastName === 'string') ? teacher.lastName.trim() : '';
    
    // Filter out placeholder values
    const validFirst = (firstName && firstName !== 'Teacher' && firstName !== 'Account') ? firstName : '';
    const validLast = (lastName && lastName !== 'Teacher' && lastName !== 'Account') ? lastName : '';
    
    // Combine as LastName + FirstName
    const parts = [validLast, validFirst].filter(part => part.length > 0);
    return parts.join(' ').trim();
  }

  getDisplayName(): string {
    const user = this.authService.getCurrentUser();
    if (!user) {
      return 'User';
    }

    // Prefer full name from database (set by login for teacher/student/parent)
    if (user.fullName && user.fullName.trim()) {
      return user.fullName.trim();
    }

    // For teachers, fallback to teacher fullName from login response
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

    // For students/parents, build from linked profile if fullName was not set
    if (user.student && (user.student.firstName || user.student.lastName)) {
      return [user.student.firstName, user.student.lastName].filter(Boolean).join(' ').trim();
    }
    if (user.parent && (user.parent.firstName || user.parent.lastName)) {
      return [user.parent.firstName, user.parent.lastName].filter(Boolean).join(' ').trim();
    }

    // Fallback: show a friendly label instead of raw email/username (e.g. "changamire2026@admin.local" -> "Changamire2026")
    return this.formatFriendlyDisplay(user.email || user.username || '') || 'User';
  }

  /** Derives a display-friendly label from email/username when full name is not available */
  private formatFriendlyDisplay(emailOrUsername: string): string {
    if (!emailOrUsername || !emailOrUsername.trim()) return '';
    const local = emailOrUsername.split('@')[0].trim();
    if (!local) return emailOrUsername;
    return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
  }

  initializeTextToggle() {
    // Clear any existing interval
    if (this.textToggleInterval) {
      clearInterval(this.textToggleInterval);
    }

    // Set initial displayed text
    if (this.schoolName && this.schoolMotto) {
      // If both exist, start with school name and toggle
      this.displayedText = this.schoolName;
      this.showMotto = false;
      
      // Toggle every 3 seconds (3000ms)
      this.textToggleInterval = setInterval(() => {
        this.showMotto = !this.showMotto;
        this.displayedText = this.showMotto ? this.schoolMotto : this.schoolName;
      }, 3000);
    } else if (this.schoolName) {
      // Only school name available
      this.displayedText = this.schoolName;
    } else if (this.schoolMotto) {
      // Only motto available
      this.displayedText = this.schoolMotto;
    } else {
      this.displayedText = '';
    }
  }

  loadStudentData() {
    const user = this.authService.getCurrentUser();
    if (!user) {
      // User might not be loaded yet, try again after a short delay
      if (this.studentDataRetryCount < this.MAX_STUDENT_DATA_RETRIES) {
        this.studentDataRetryCount++;
        setTimeout(() => this.loadStudentData(), 500);
      }
      return;
    }

    if (!user.student) {
      // Student data might not be loaded yet, wait a bit and retry
      if (this.studentDataRetryCount < this.MAX_STUDENT_DATA_RETRIES) {
        this.studentDataRetryCount++;
        setTimeout(() => {
          const retryUser = this.authService.getCurrentUser();
          if (retryUser && retryUser.student && retryUser.student.id) {
            this.studentDataRetryCount = 0; // Reset on success
            this.loadStudentData();
          }
        }, 1000);
      } else {
        console.warn('Student data not available after retries');
      }
      return;
    }

    if (!user.student.id) {
      console.error('Student ID not available');
      return;
    }

    // Reset retry count on successful load
    this.studentDataRetryCount = 0;
    const studentId = user.student.id;
    
    // Load active term
    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        this.activeTerm = data.activeTerm || data.currentTerm || '';
      },
      error: (err: any) => {
        console.error('Error loading active term:', err);
      }
    });

    // Load student balance
    this.loadingBalance = true;
    this.financeService.getStudentBalance(studentId).subscribe({
      next: (data: any) => {
        this.loadingBalance = false;
        this.studentBalance = parseFloat(String(data.balance || 0));
      },
      error: (err: any) => {
        this.loadingBalance = false;
        console.error('Error loading student balance:', err);
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


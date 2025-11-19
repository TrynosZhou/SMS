import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SettingsService } from '../../services/settings.service';
import { StudentService } from '../../services/student.service';
import { TeacherService } from '../../services/teacher.service';
import { ClassService } from '../../services/class.service';
import { FinanceService } from '../../services/finance.service';
import { SubjectService } from '../../services/subject.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  user: any;
  moduleAccess: any = null;
  schoolName: string = '';
  showBulkMessage = false;
  
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
  
  constructor(
    private authService: AuthService,
    private router: Router,
    private settingsService: SettingsService,
    private studentService: StudentService,
    private teacherService: TeacherService,
    private classService: ClassService,
    private financeService: FinanceService,
    private subjectService: SubjectService
  ) { }

  ngOnInit() {
    this.user = this.authService.getCurrentUser();
    this.loadSettings();
    if (this.isAdmin() || this.isAccountant()) {
      this.loadStatistics();
    }
  }
  
  loadStatistics() {
    this.loadingStats = true;
    
    // Load students
    this.studentService.getStudents().subscribe({
      next: (students: any[]) => {
        this.stats.totalStudents = students.length;
        this.stats.dayScholars = students.filter(s => s.studentType === 'Day Scholar').length;
        this.stats.boarders = students.filter(s => s.studentType === 'Boarder').length;
        this.stats.staffChildren = students.filter(s => s.isStaffChild).length;
        this.recentStudents = students
          .sort((a, b) => new Date(b.enrollmentDate || b.createdAt || 0).getTime() - new Date(a.enrollmentDate || a.createdAt || 0).getTime())
          .slice(0, 5);
        this.checkLoadingComplete();
      },
      error: (err) => {
        console.error('Error loading students:', err);
        this.checkLoadingComplete();
      }
    });
    
    // Load teachers
    this.teacherService.getTeachers().subscribe({
      next: (teachers: any[]) => {
        this.stats.totalTeachers = teachers.length;
        this.checkLoadingComplete();
      },
      error: (err) => {
        console.error('Error loading teachers:', err);
        this.checkLoadingComplete();
      }
    });
    
    // Load classes
    this.classService.getClasses().subscribe({
      next: (classes: any[]) => {
        this.stats.totalClasses = classes.filter(c => c.isActive).length;
        this.checkLoadingComplete();
      },
      error: (err) => {
        console.error('Error loading classes:', err);
        this.checkLoadingComplete();
      }
    });
    
    // Load subjects
    this.subjectService.getSubjects().subscribe({
      next: (subjects: any[]) => {
        this.stats.totalSubjects = subjects.length;
        this.checkLoadingComplete();
      },
      error: (err) => {
        console.error('Error loading subjects:', err);
        this.checkLoadingComplete();
      }
    });
    
    // Load invoices (for admin/accountant)
    if (this.isAdmin() || this.isAccountant()) {
      this.financeService.getInvoices().subscribe({
        next: (invoices: any[]) => {
          this.stats.totalInvoices = invoices.length;
          this.stats.totalBalance = invoices.reduce((sum, inv) => sum + (parseFloat(inv.balance) || 0), 0);
          this.recentInvoices = invoices
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            .slice(0, 5);
          this.checkLoadingComplete();
        },
        error: (err) => {
          console.error('Error loading invoices:', err);
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
        this.moduleAccess = data.moduleAccess || {};
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
        this.schoolName = '';
        // Default to allowing all modules if settings can't be loaded
        this.moduleAccess = {
          teachers: {
            exams: true,
            reportCards: true,
            rankings: true
          },
          parents: {
            reportCards: true,
            invoices: true,
            dashboard: true
          }
        };
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

  hasModuleAccess(module: string): boolean {
    if (!this.moduleAccess) {
      // Default to true if settings not loaded (for backward compatibility)
      return true;
    }

    const normalizedModule = this.normalizeModuleKey(module);

    // Apply demo account restrictions first (demo users have explicit limits)
    if (this.isDemoUser()) {
      const demoModules = this.moduleAccess.demoAccount || {};
      if (demoModules[normalizedModule] === false) {
        return false;
      }
    }

    // Check module access for Accountants
    if (this.isAccountant()) {
      const accountantModules = this.moduleAccess.accountant || {};
      const moduleMap: any = {
        'exams': 'exams',
        'reportCards': 'reportCards',
        'rankings': 'rankings',
        'students': 'students',
        'classes': 'classes',
        'subjects': 'subjects',
        'finance': 'finance',
        'invoices': 'invoices',
        'settings': 'settings',
        'dashboard': 'dashboard'
      };
      const key = moduleMap[module] || normalizedModule;
      return accountantModules[key] !== false; // Default to true if not explicitly set
    }

    // Check module access for Administrators (respect settings)
    if (this.isAdmin() && !this.isSuperAdmin()) {
      const adminModules = this.moduleAccess.admin || {};
      const moduleMap: any = {
        'exams': 'exams',
        'reportCards': 'reportCards',
        'rankings': 'rankings',
        'students': 'students',
        'teachers': 'teachers',
        'classes': 'classes',
        'subjects': 'subjects',
        'finance': 'finance',
        'attendance': 'attendance',
        'settings': 'settings',
        'dashboard': 'dashboard'
      };
      const key = moduleMap[module] || normalizedModule;
      return adminModules[key] !== false; // Default to true if not explicitly set
    }

    // SuperAdmins always have access to all modules
    if (this.isSuperAdmin()) {
      return true;
    }

    if (this.isTeacher()) {
      const teacherModules = this.moduleAccess.teachers || {};
      // Map module names to settings keys
      const moduleMap: any = {
        'exams': 'exams',
        'reportCards': 'reportCards',
        'rankings': 'rankings',
        'students': 'students',
        'classes': 'classes',
        'subjects': 'subjects',
        'finance': 'finance',
        'settings': 'settings'
      };
      const key = moduleMap[module] || normalizedModule;
      return teacherModules[key] !== false; // Default to true if not explicitly set
    }

    if (this.isParent()) {
      const parentModules = this.moduleAccess.parents || {};
      const moduleMap: any = {
        'reportCards': 'reportCards',
        'invoices': 'invoices',
        'dashboard': 'dashboard'
      };
      const key = moduleMap[module] || normalizedModule;
      return parentModules[key] !== false; // Default to true if not explicitly set
    }

    if (this.isStudent()) {
      const studentModules = this.moduleAccess.students || {};
      const moduleMap: any = {
        'dashboard': 'dashboard',
        'subjects': 'subjects',
        'assignments': 'assignments',
        'reportCards': 'reportCards',
        'finance': 'finance'
      };
      const key = moduleMap[module] || normalizedModule;
      return studentModules[key] !== false;
    }

    return false;
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
}


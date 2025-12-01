import { Component, OnInit } from '@angular/core';
import { StudentService } from '../../../services/student.service';
import { ClassService } from '../../../services/class.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-class-lists',
  templateUrl: './class-lists.component.html',
  styleUrls: ['./class-lists.component.css']
})
export class ClassListsComponent implements OnInit {
  classes: any[] = [];
  students: any[] = [];
  filteredStudents: any[] = [];
  selectedClassId = '';
  selectedTerm = '';
  availableTerms: string[] = [];
  
  loading = false;
  loadingStudents = false;
  error = '';
  success = '';
  
  // User role checks
  isAdmin = false;
  isTeacher = false;
  isSuperAdmin = false;

  constructor(
    private studentService: StudentService,
    private classService: ClassService,
    private settingsService: SettingsService,
    public authService: AuthService
  ) {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? (user.role === 'admin') : false;
    this.isSuperAdmin = user ? (user.role === 'superadmin') : false;
    this.isTeacher = user ? (user.role === 'teacher') : false;
  }

  ngOnInit() {
    this.loadClasses();
    this.loadTerms();
  }

  loadClasses() {
    this.loading = true;
    this.error = '';
    
    this.classService.getClasses().subscribe({
      next: (response: any) => {
        const classesData = Array.isArray(response) ? response : (response?.classes || response?.data || []);
        this.classes = Array.isArray(classesData) ? classesData : [];
        
        // Filter active classes only
        this.classes = this.classes.filter((cls: any) => cls.isActive !== false);
        
        // Remove duplicates by ID
        const uniqueClassesMap = new Map<string, any>();
        this.classes.forEach((classItem: any) => {
          if (classItem.id && !uniqueClassesMap.has(classItem.id)) {
            uniqueClassesMap.set(classItem.id, classItem);
          }
        });
        this.classes = Array.from(uniqueClassesMap.values());
        
        // Sort by name
        this.classes.sort((a: any, b: any) => {
          const nameA = (a.name || '').toLowerCase();
          const nameB = (b.name || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
        
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading classes:', err);
        this.error = 'Failed to load classes. Please try again.';
        this.loading = false;
      }
    });
  }

  loadTerms() {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        // Get available terms from settings
        // Terms are typically stored as currentTerm and activeTerm
        const terms: string[] = [];
        
        if (settings.activeTerm) {
          terms.push(settings.activeTerm);
        }
        if (settings.currentTerm && !terms.includes(settings.currentTerm)) {
          terms.push(settings.currentTerm);
        }
        
        // Generate common terms if none found
        if (terms.length === 0) {
          const currentYear = new Date().getFullYear();
          terms.push(`Term 1 ${currentYear}`);
          terms.push(`Term 2 ${currentYear}`);
          terms.push(`Term 3 ${currentYear}`);
        }
        
        this.availableTerms = terms;
        
        // Set default term to activeTerm if available
        if (settings.activeTerm) {
          this.selectedTerm = settings.activeTerm;
        } else if (this.availableTerms.length > 0) {
          this.selectedTerm = this.availableTerms[0];
        }
      },
      error: (err) => {
        console.error('Error loading terms:', err);
        // Set default terms
        const currentYear = new Date().getFullYear();
        this.availableTerms = [
          `Term 1 ${currentYear}`,
          `Term 2 ${currentYear}`,
          `Term 3 ${currentYear}`
        ];
        if (this.availableTerms.length > 0) {
          this.selectedTerm = this.availableTerms[0];
        }
      }
    });
  }

  loadStudents() {
    if (!this.selectedClassId) {
      this.error = 'Please select a class first.';
      return;
    }
    
    if (!this.selectedTerm) {
      this.error = 'Please select a term first.';
      return;
    }
    
    this.loadingStudents = true;
    this.error = '';
    this.success = '';
    this.students = [];
    this.filteredStudents = [];
    
    this.studentService.getStudents(this.selectedClassId).subscribe({
      next: (response: any) => {
        const studentsData = Array.isArray(response) ? response : (response?.data || response?.students || []);
        this.students = Array.isArray(studentsData) ? studentsData : [];
        this.filteredStudents = [...this.students];
        
        // Sort by student number or name
        this.filteredStudents.sort((a: any, b: any) => {
          const numA = (a.studentNumber || '').toLowerCase();
          const numB = (b.studentNumber || '').toLowerCase();
          if (numA && numB) {
            return numA.localeCompare(numB);
          }
          const nameA = `${a.firstName || ''} ${a.lastName || ''}`.toLowerCase();
          const nameB = `${b.firstName || ''} ${b.lastName || ''}`.toLowerCase();
          return nameA.localeCompare(nameB);
        });
        
        this.loadingStudents = false;
        
        if (this.filteredStudents.length === 0) {
          this.error = 'No students found in the selected class for this term.';
        } else {
          this.success = `Successfully loaded ${this.filteredStudents.length} student(s) from the selected class.`;
        }
      },
      error: (err) => {
        console.error('Error loading students:', err);
        this.error = 'Failed to load students. Please try again.';
        this.loadingStudents = false;
        this.students = [];
        this.filteredStudents = [];
      }
    });
  }

  getSelectedClassName(): string {
    const selectedClass = this.classes.find(c => c.id === this.selectedClassId);
    return selectedClass ? selectedClass.name : 'Selected Class';
  }
}


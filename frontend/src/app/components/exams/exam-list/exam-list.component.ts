import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { ExamService } from '../../../services/exam.service';
import { ClassService } from '../../../services/class.service';
import { SubjectService } from '../../../services/subject.service';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';
import { TeacherService } from '../../../services/teacher.service';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  selector: 'app-exam-list',
  templateUrl: './exam-list.component.html',
  styleUrls: ['./exam-list.component.css'],
  animations: [
    trigger('fadeInOut', [
      state('void', style({ opacity: 0, transform: 'translateY(-10px)' })),
      transition(':enter', [
        animate('300ms ease-in', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-out', style({ opacity: 0, transform: 'translateY(-10px)' }))
      ])
    ])
  ]
})
export class ExamListComponent implements OnInit, OnDestroy {
  // Selection form
  selectedClassId = '';
  selectedTerm = '';
  selectedExamType = '';
  selectedSubjectId = '';
  
  // Data
  classes: any[] = [];
  allSubjects: any[] = []; // All subjects in the system
  subjects: any[] = []; // Filtered subjects for selected class
  students: any[] = [];
  filteredStudents: any[] = [];
  
  // Teacher data
  teacher: any = null;
  teacherSubjects: any[] = []; // Subjects assigned to teacher
  
  // Marks entry
  marks: any = {};
  currentExam: any = null;
  
  // UI state
  loading = false;
  loadingStudents = false;
  error = '';
  success = '';
  showMarksEntry = false;
  studentSearchQuery = '';
  
  // Auto-save state
  lastSavedStudentId: string | null = null;
  autoSaveTimeout: any = null;
  isAutoSaving = false;
  pendingSaves: Set<string> = new Set();
  
  // Form validation
  fieldErrors: any = {};
  touchedFields: Set<string> = new Set();
  loadingTerm = false;
  
  // Terms and exam types
  examTypes = [
    { value: 'mid_term', label: 'Mid Term' },
    { value: 'end_term', label: 'End of Term' }
  ];

  // Admin and publish status
  isAdmin = false;
  isPublished = false;
  publishing = false;
  canPublish = false;
  checkingCompleteness = false;
  
  // Publish section (separate from marks entry)
  publishExamType = '';
  publishTerm = '';

  constructor(
    private examService: ExamService,
    private classService: ClassService,
    private subjectService: SubjectService,
    private studentService: StudentService,
    private settingsService: SettingsService,
    private authService: AuthService,
    private teacherService: TeacherService,
    private router: Router
  ) {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? (user.role === 'admin' || user.role === 'superadmin') : false;
    console.log('ExamListComponent - User role check:', { user, isAdmin: this.isAdmin });
  }

  ngOnInit() {
    const user = this.authService.getCurrentUser();
    
    // If user is a teacher, load teacher-specific data
    if (user && user.role === 'teacher' && !this.isAdmin) {
      this.loadTeacherInfo();
    } else {
      // Admin/SuperAdmin can see all classes and subjects
      this.loadClasses();
      this.loadSubjects();
    }
    
    this.loadActiveTerm();
    
    // Set publish term from active term
    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        if (data.activeTerm) {
          this.publishTerm = data.activeTerm;
        } else if (data.currentTerm) {
          this.publishTerm = data.currentTerm;
        }
      },
      error: (err: any) => {
        console.error('Error loading active term for publish:', err);
      }
    });
    
    // Save pending marks when page is about to unload
    window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
  }

  ngOnDestroy() {
    // Clean up auto-save timeout
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    
    // Save any pending marks before component is destroyed
    if (this.pendingSaves.size > 0) {
      this.processPendingSaves();
    }
    
    // Remove event listener
    window.removeEventListener('beforeunload', this.handleBeforeUnload.bind(this));
  }

  handleBeforeUnload(event: BeforeUnloadEvent) {
    // Save any pending marks before page unloads
    if (this.pendingSaves.size > 0) {
      // Use synchronous save if possible, or at least try to save
      this.processPendingSaves();
    }
  }

  loadActiveTerm() {
    this.loadingTerm = true;
    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        if (data.activeTerm) {
          this.selectedTerm = data.activeTerm;
        } else if (data.currentTerm) {
          this.selectedTerm = data.currentTerm;
        }
        this.loadingTerm = false;
      },
      error: (err: any) => {
        console.error('Error loading active term:', err);
        this.loadingTerm = false;
        // Don't show error to user, just log it
      }
    });
  }

  loadTeacherInfo() {
    // Load teacher profile to get teacher ID and subjects
    this.teacherService.getCurrentTeacher().subscribe({
      next: (teacher: any) => {
        this.teacher = teacher;
        this.teacherSubjects = teacher.subjects || [];
        
        // Load classes assigned to this teacher
        if (teacher.id) {
          this.loadTeacherClasses(teacher.id);
        } else {
          this.classes = [];
          this.error = 'Teacher ID not found. Please contact administrator.';
        }
        
        // Load all subjects (we'll filter them later based on selected class)
        this.loadAllSubjects();
      },
      error: (err: any) => {
        console.error('Error loading teacher info:', err);
        this.error = 'Failed to load teacher information. Please try again.';
      }
    });
  }

  loadTeacherClasses(teacherId: string) {
    this.teacherService.getTeacherClasses(teacherId).subscribe({
      next: (response: any) => {
        this.classes = response.classes || [];
        console.log('Loaded teacher classes:', this.classes.length);
      },
      error: (err: any) => {
        console.error('Error loading teacher classes:', err);
        this.classes = [];
        this.error = 'Failed to load assigned classes. Please try again.';
      }
    });
  }

  loadClasses() {
    // For admin/superadmin - load all classes using pagination
    this.classes = [];
    this.loadAllClasses(1, []);
  }

  loadAllClasses(page: number, accumulatedClasses: any[]) {
    this.classService.getClassesPaginated(page, 100).subscribe({
      next: (response: any) => {
        const data = response?.data || response || [];
        const allClasses = [...accumulatedClasses, ...data];
        
        // Check if there are more pages to fetch
        const totalPages = response?.totalPages || 1;
        const currentPage = response?.page || page;
        
        if (currentPage < totalPages) {
          // Fetch next page
          this.loadAllClasses(currentPage + 1, allClasses);
        } else {
          // All classes loaded - clean IDs and remove duplicates
          const cleanedClasses = allClasses.map((classItem: any) => {
            if (classItem.id) {
              let cleanId = String(classItem.id).trim();
              if (cleanId.includes(':')) {
                cleanId = cleanId.split(':')[0].trim();
              }
              classItem.id = cleanId;
            }
            return classItem;
          });
          
          // Remove duplicates by ID
          const uniqueClassesMap = new Map<string, any>();
          cleanedClasses.forEach((classItem: any) => {
            const id = classItem.id || '';
            if (id && !uniqueClassesMap.has(id)) {
              uniqueClassesMap.set(id, classItem);
            }
          });
          
          this.classes = Array.from(uniqueClassesMap.values());
          console.log(`Loaded ${this.classes.length} classes for exams page`);
        }
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
        // Use accumulated classes if we got some before the error
        if (accumulatedClasses.length > 0) {
          this.classes = accumulatedClasses;
          console.warn(`Loaded partial class list (${accumulatedClasses.length} classes) due to error`);
        } else {
          this.classes = [];
        }
      }
    });
  }

  loadAllSubjects() {
    // Load all subjects (we'll filter based on teacher and class)
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        this.allSubjects = data || [];
        // Update subjects list when class is selected
        this.updateSubjectsForSelectedClass();
      },
      error: (err: any) => {
        console.error('Error loading subjects:', err);
        this.allSubjects = [];
      }
    });
  }

  loadSubjects() {
    // For admin/superadmin - load all subjects
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        this.allSubjects = data || [];
        this.subjects = data || [];
      },
      error: (err: any) => {
        console.error('Error loading subjects:', err);
        this.allSubjects = [];
        this.subjects = [];
      }
    });
  }

  updateSubjectsForSelectedClass() {
    if (!this.selectedClassId || this.isAdmin) {
      // If no class selected or admin, show all subjects (or teacher's subjects if teacher)
      if (!this.isAdmin && this.teacherSubjects.length > 0) {
        this.subjects = this.teacherSubjects;
      } else {
        this.subjects = this.allSubjects;
      }
      return;
    }

    // For teachers: filter subjects that:
    // 1. Teacher is assigned to teach
    // 2. Are taught in the selected class
    if (this.teacher && this.teacherSubjects.length > 0) {
      // Get class details to check which subjects are taught in this class
      this.classService.getClassById(this.selectedClassId).subscribe({
        next: (classData: any) => {
          const classSubjectIds = (classData.subjects || []).map((s: any) => s.id);
          
          // Find intersection: subjects teacher teaches AND that are in the class
          this.subjects = this.teacherSubjects.filter((teacherSubject: any) => 
            classSubjectIds.includes(teacherSubject.id)
          );
          
          console.log('Filtered subjects for class:', this.subjects.length);
          
          // Reset subject selection if current selection is not in filtered list
          if (this.selectedSubjectId && !this.subjects.find(s => s.id === this.selectedSubjectId)) {
            this.selectedSubjectId = '';
            this.onSelectionChange();
          }
        },
        error: (err: any) => {
          console.error('Error loading class details:', err);
          // Fallback: show only teacher's subjects
          this.subjects = this.teacherSubjects;
        }
      });
    } else {
      // Fallback: show all subjects if teacher info not loaded
      this.subjects = this.allSubjects;
    }
  }

  onSelectionChange() {
    // Reset marks entry when selections change
    this.showMarksEntry = false;
    this.students = [];
    this.filteredStudents = [];
    this.marks = {};
    this.currentExam = null;
    this.studentSearchQuery = '';
    this.canPublish = false;
    this.isPublished = false;
    
    // If class changed and user is a teacher, update subjects list
    if (!this.isAdmin && this.selectedClassId) {
      this.updateSubjectsForSelectedClass();
    }
    
    // Reset subject selection if class changed
    if (!this.selectedClassId) {
      this.selectedSubjectId = '';
    }
  }

  loadStudents() {
    if (!this.selectedClassId || !this.selectedTerm || !this.selectedExamType || !this.selectedSubjectId) {
      this.error = 'Please select Class, Term, Exam Type, and Subject';
      return;
    }

    this.loadingStudents = true;
    this.error = '';
    this.success = '';

    // First, find or create exam
    this.findOrCreateExam().then((exam: any) => {
      if (!exam) {
        this.error = 'Failed to create or find exam';
        this.loadingStudents = false;
        return;
      }
      
      // Ensure exam has an ID
      if (!exam.id) {
        console.error('Exam missing ID:', exam);
        this.error = 'Exam ID is missing. Please try again.';
        this.loadingStudents = false;
        return;
      }
      
      console.log('Setting currentExam:', exam);
      console.log('Current exam ID:', exam.id);
      this.currentExam = exam;
      this.isPublished = exam.status === 'published';
      
      // Check completeness after exam is loaded
      setTimeout(() => this.checkCompleteness(), 500);
      
      // Load students for the selected class, sorted by LastName
      this.studentService.getStudents(this.selectedClassId).subscribe({
        next: (data: any) => {
          console.log('Received students from API:', data);
          console.log('Number of students received:', data?.length || 0);
          
          // Ensure data is an array
          const studentsArray = Array.isArray(data) ? data : [];
          
          // Sort by LastName ascending, then FirstName
          this.students = studentsArray.sort((a: any, b: any) => {
            const lastNameA = (a.lastName || '').toLowerCase();
            const lastNameB = (b.lastName || '').toLowerCase();
            if (lastNameA !== lastNameB) {
              return lastNameA.localeCompare(lastNameB);
            }
            const firstNameA = (a.firstName || '').toLowerCase();
            const firstNameB = (b.firstName || '').toLowerCase();
            return firstNameA.localeCompare(firstNameB);
          });
          
          console.log('Sorted students count:', this.students.length);
          if (this.students.length > 0) {
            console.log('First student:', this.students[0].firstName, this.students[0].lastName);
            console.log('Last student:', this.students[this.students.length - 1].firstName, this.students[this.students.length - 1].lastName);
          }
          
          this.initializeMarks();
          this.loadExistingMarks();
          this.filteredStudents = [...this.students];
          this.showMarksEntry = true;
          this.loadingStudents = false;
        },
        error: (err: any) => {
          console.error('Error loading students:', err);
          this.error = err.error?.message || 'Failed to load students';
          this.loadingStudents = false;
        }
      });
    }).catch((err: any) => {
      console.error('Error finding/creating exam:', err);
      this.error = err.error?.message || 'Failed to initialize exam';
      this.loadingStudents = false;
    });
  }

  findOrCreateExam(): Promise<any> {
    return new Promise((resolve, reject) => {
      // Try to find existing exam with matching criteria
      const examName = `${this.selectedTerm} - ${this.examTypes.find(t => t.value === this.selectedExamType)?.label} - ${this.classes.find(c => c.id === this.selectedClassId)?.name}`;
      
      // For now, create a new exam or find existing one
      // We'll need a backend endpoint for this, but for now let's use the existing exam creation
      const examData = {
        name: examName,
        type: this.selectedExamType,
        term: this.selectedTerm,
        examDate: new Date().toISOString().split('T')[0],
        classId: this.selectedClassId,
        subjectIds: [this.selectedSubjectId]
      };

      // Check if exam exists first by getting exams for this class
      this.examService.getExams(this.selectedClassId).subscribe({
        next: (exams: any) => {
          // Find exam with matching term, type, and subject
          const existingExam = exams.find((e: any) => 
            e.term === this.selectedTerm &&
            e.type === this.selectedExamType &&
            e.classId === this.selectedClassId &&
            e.subjects?.some((s: any) => s.id === this.selectedSubjectId)
          );

          if (existingExam) {
            console.log('Found existing exam:', existingExam);
            resolve(existingExam);
          } else {
            // Create new exam
            console.log('Creating new exam with data:', examData);
            this.examService.createExam(examData).subscribe({
              next: (response: any) => {
                // Backend returns { message: '...', exam: {...} }
                const exam = response.exam || response;
                console.log('Exam created, response:', response);
                console.log('Extracted exam:', exam);
                console.log('Exam ID:', exam.id);
                if (!exam.id) {
                  console.error('Created exam missing ID:', exam);
                  reject(new Error('Created exam is missing ID'));
                } else {
                  resolve(exam);
                }
              },
              error: (err: any) => {
                console.error('Error creating exam:', err);
                reject(err);
              }
            });
          }
        },
        error: (err: any) => reject(err)
      });
    });
  }

  initializeMarks() {
    this.marks = {};
    const studentsArray = Array.isArray(this.students) ? this.students : [];
    studentsArray.forEach((student: any) => {
      const key = this.getMarkKey(student.id, this.selectedSubjectId);
      this.marks[key] = {
        score: null,
        maxScore: 100, // Default max score of 100
        comments: ''
      };
    });
  }

  loadExistingMarks() {
    if (!this.currentExam || !this.selectedSubjectId) return;

    this.examService.getMarks(this.currentExam.id).subscribe({
      next: (marksData: any) => {
        // Ensure marksData is an array
        const marksArray = Array.isArray(marksData) ? marksData : [];
        // Filter marks for the selected subject
        const subjectMarks = marksArray.filter((m: any) => m.subjectId === this.selectedSubjectId);
        
        subjectMarks.forEach((mark: any) => {
          const key = this.getMarkKey(mark.studentId, this.selectedSubjectId);
          if (this.marks[key]) {
            this.marks[key].score = mark.score;
            this.marks[key].maxScore = mark.maxScore;
            this.marks[key].comments = mark.comments || '';
          }
        });
      },
      error: (err: any) => {
        console.error('Error loading existing marks:', err);
      }
    });
  }

  getMarkKey(studentId: string, subjectId: string): string {
    return `${studentId}_${subjectId}`;
  }

  getSelectedClassName(): string {
    const cls = this.classes.find(c => c.id == this.selectedClassId);
    return cls ? cls.name : '';
  }

  getSelectedSubjectName(): string {
    const subject = this.subjects.find(s => s.id == this.selectedSubjectId);
    return subject ? subject.name : '';
  }

  getSelectedExamTypeLabel(): string {
    const examType = this.examTypes.find(t => t.value == this.selectedExamType);
    return examType ? examType.label : '';
  }

  getSelectionSummary(): string {
    const className = this.getSelectedClassName();
    const examTypeLabel = this.getSelectedExamTypeLabel();
    const subjectName = this.getSelectedSubjectName();
    return `${className} | ${this.selectedTerm} | ${examTypeLabel} | ${subjectName}`;
  }

  cancelMarksEntry() {
    // Save any pending marks before canceling
    if (this.pendingSaves.size > 0) {
      this.processPendingSaves();
    }
    
    this.showMarksEntry = false;
    this.students = [];
    this.filteredStudents = [];
    this.marks = {};
    this.studentSearchQuery = '';
    this.lastSavedStudentId = null;
    this.pendingSaves.clear();
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
      this.autoSaveTimeout = null;
    }
  }

  // Validation methods
  isSelectionValid(): boolean {
    return !!(this.selectedClassId && this.selectedTerm && this.selectedExamType && this.selectedSubjectId);
  }

  isFieldInvalid(fieldName: string): boolean {
    return this.touchedFields.has(fieldName) && !!this.fieldErrors[fieldName];
  }

  getFieldError(fieldName: string): string {
    return this.fieldErrors[fieldName] || '';
  }

  resetSelection() {
    this.selectedClassId = '';
    // Don't reset term - it should remain from settings
    // this.selectedTerm = '';
    this.selectedExamType = '';
    this.selectedSubjectId = '';
    this.onSelectionChange();
    this.fieldErrors = {};
    this.touchedFields.clear();
  }

  // Student filtering
  filterStudents() {
    if (!this.studentSearchQuery.trim()) {
      this.filteredStudents = [...this.students];
      return;
    }
    const query = this.studentSearchQuery.toLowerCase().trim();
    this.filteredStudents = this.students.filter(student => {
      const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
      const studentNumber = (student.studentNumber || '').toLowerCase();
      return fullName.includes(query) || studentNumber.includes(query);
    });
  }

  // Marks statistics
  hasMarks(studentId: string): boolean {
    const key = this.getMarkKey(studentId, this.selectedSubjectId);
    const mark = this.marks[key];
    return mark && (mark.score !== null && mark.score !== undefined && mark.score !== '');
  }

  getEnteredMarksCount(): number {
    return this.filteredStudents.filter(student => this.hasMarks(student.id)).length;
  }

  getMarksProgress(): number {
    if (this.filteredStudents.length === 0) return 0;
    return Math.round((this.getEnteredMarksCount() / this.filteredStudents.length) * 100);
  }

  getAverageScore(): number {
    const marksWithScores = this.filteredStudents
      .map(student => {
        const key = this.getMarkKey(student.id, this.selectedSubjectId);
        const mark = this.marks[key];
        return mark && mark.score !== null && mark.score !== undefined && mark.score !== '' 
          ? Math.round(parseFloat(mark.score)) 
          : null;
      })
      .filter(score => score !== null) as number[];

    if (marksWithScores.length === 0) return 0;
    const sum = marksWithScores.reduce((acc, score) => acc + score, 0);
    return Math.round(sum / marksWithScores.length);
  }

  // Quick actions
  clearAllMarks() {
    if (!confirm('Are you sure you want to clear all entered marks? This action cannot be undone.')) {
      return;
    }
    this.filteredStudents.forEach(student => {
      const key = this.getMarkKey(student.id, this.selectedSubjectId);
      if (this.marks[key]) {
        this.marks[key].score = null;
        this.marks[key].comments = '';
      }
    });
  }

  fillRemainingWithZero() {
    this.filteredStudents.forEach(student => {
      const key = this.getMarkKey(student.id, this.selectedSubjectId);
      if (this.marks[key] && (this.marks[key].score === null || this.marks[key].score === undefined || this.marks[key].score === '')) {
        this.marks[key].score = 0;
      }
    });
  }

  validateMark(studentId: string) {
    const key = this.getMarkKey(studentId, this.selectedSubjectId);
    const mark = this.marks[key];
    if (mark && mark.score !== null && mark.score !== undefined && mark.score !== '') {
      const score = parseFloat(mark.score);
      if (isNaN(score) || score < 0) {
        mark.score = null;
      } else {
        // Round to integer
        const roundedScore = Math.round(score);
        if (roundedScore > 100) {
          if (confirm(`Score ${roundedScore} exceeds 100. Do you want to keep it?`)) {
            mark.score = roundedScore;
          } else {
            mark.score = 100;
          }
        } else {
          mark.score = roundedScore;
        }
      }
    }
  }

  onMarkChange(studentId: string) {
    // Round to integer when user types
    const key = this.getMarkKey(studentId, this.selectedSubjectId);
    const mark = this.marks[key];
    if (mark && mark.score !== null && mark.score !== undefined && mark.score !== '') {
      const score = parseFloat(mark.score);
      if (!isNaN(score)) {
        const roundedScore = Math.round(score);
        mark.score = roundedScore;
      }
    }
    // Schedule auto-save for this student
    this.scheduleAutoSave(studentId);
  }

  onCommentsChange(studentId: string) {
    // Schedule auto-save when comments change
    this.scheduleAutoSave(studentId);
  }

  onStudentFocus(studentId: string) {
    // Auto-save previous student when moving to a new one
    if (this.lastSavedStudentId && this.lastSavedStudentId !== studentId) {
      this.autoSaveStudent(this.lastSavedStudentId);
    }
    this.lastSavedStudentId = studentId;
  }

  onStudentBlur(studentId: string) {
    // Auto-save when leaving a student's row
    this.autoSaveStudent(studentId);
  }

  scheduleAutoSave(studentId: string) {
    // Add to pending saves
    this.pendingSaves.add(studentId);
    
    // Clear existing timeout
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    
    // Schedule auto-save after 2 seconds of inactivity
    this.autoSaveTimeout = setTimeout(() => {
      this.processPendingSaves();
    }, 2000);
  }

  processPendingSaves() {
    if (this.pendingSaves.size === 0 || this.isAutoSaving || !this.currentExam) {
      return;
    }

    // Save all pending students
    const studentsToSave = Array.from(this.pendingSaves);
    this.pendingSaves.clear();
    
    // Save marks for all pending students
    this.autoSaveStudents(studentsToSave);
  }

  autoSaveStudent(studentId: string) {
    if (!this.currentExam || !this.currentExam.id || this.isAutoSaving) {
      return;
    }

    const key = this.getMarkKey(studentId, this.selectedSubjectId);
    const mark = this.marks[key];
    
    // Only save if there's data to save
    if (!mark || (mark.score === null && !mark.comments)) {
      return;
    }

    const marksData = [{
      studentId: studentId,
      subjectId: this.selectedSubjectId,
      score: mark.score ? Math.round(parseFloat(mark.score)) : null,
      maxScore: 100,
      comments: mark.comments || ''
    }];

    this.isAutoSaving = true;
    this.examService.captureMarks(this.currentExam.id, marksData).subscribe({
      next: (data: any) => {
        this.isAutoSaving = false;
        // Show brief success message
        const student = this.students.find(s => s.id === studentId);
        const studentName = student ? `${student.firstName} ${student.lastName}` : 'Student';
        this.showAutoSaveSuccess(`✓ ${studentName}'s marks saved automatically`);
      },
      error: (err: any) => {
        this.isAutoSaving = false;
        // Don't show error for auto-save failures, just log them
        console.error('Auto-save failed:', err);
      }
    });
  }

  autoSaveStudents(studentIds: string[]) {
    if (!this.currentExam || !this.currentExam.id || this.isAutoSaving || studentIds.length === 0) {
      return;
    }

    const marksData = studentIds.map(studentId => {
      const key = this.getMarkKey(studentId, this.selectedSubjectId);
      const mark = this.marks[key];
      
      if (mark && (mark.score !== null || mark.comments)) {
        return {
          studentId: studentId,
          subjectId: this.selectedSubjectId,
          score: mark.score ? Math.round(parseFloat(mark.score)) : null,
          maxScore: 100,
          comments: mark.comments || ''
        };
      }
      return null;
    }).filter((m: any) => m !== null);

    if (marksData.length === 0) {
      return;
    }

    this.isAutoSaving = true;
    this.examService.captureMarks(this.currentExam.id, marksData).subscribe({
      next: (data: any) => {
        this.isAutoSaving = false;
        this.showAutoSaveSuccess(`✓ Auto-saved marks for ${marksData.length} student(s)`);
      },
      error: (err: any) => {
        this.isAutoSaving = false;
        console.error('Auto-save failed:', err);
      }
    });
  }

  showAutoSaveSuccess(message: string) {
    this.success = message;
    // Auto-hide after 3 seconds
    setTimeout(() => {
      if (this.success === message) {
        this.success = '';
      }
    }, 3000);
  }

  deleteAllExams() {
    if (!confirm('Are you sure you want to delete ALL scheduled exams? This will also delete all marks associated with these exams. This action cannot be undone.')) {
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    this.examService.deleteAllExams().subscribe({
      next: (data: any) => {
        this.success = data.message || `Successfully deleted ${data.deletedCount || 0} exam(s)`;
        this.loading = false;
        // Reset the form
        this.showMarksEntry = false;
        this.students = [];
        this.marks = {};
        this.currentExam = null;
      },
      error: (err: any) => {
        console.error('Error deleting all exams:', err);
        console.error('Error response:', err.error);
        
        let errorMessage = 'Failed to delete all exams';
        
        if (err.status === 0 || err.status === undefined) {
          errorMessage = 'Cannot connect to server. Please ensure the backend server is running on port 3001.';
        } else if (err.error) {
          if (typeof err.error === 'string') {
            errorMessage = err.error;
          } else if (err.error.message) {
            errorMessage = err.error.message;
          }
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        this.error = errorMessage;
        this.loading = false;
      }
    });
  }

  onSubmit() {
    if (!this.currentExam) {
      this.error = 'No exam selected';
      return;
    }

    if (!this.currentExam.id) {
      this.error = 'Exam ID is missing. Please try loading students again.';
      return;
    }

    // Process any pending auto-saves first
    if (this.pendingSaves.size > 0) {
      this.processPendingSaves();
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    // Prepare marks data for the selected subject only
    const marksData = this.filteredStudents.map((student: any) => {
      const key = this.getMarkKey(student.id, this.selectedSubjectId);
      const mark = this.marks[key];
      
      if (mark && (mark.score !== null || mark.comments)) {
        return {
          studentId: student.id,
          subjectId: this.selectedSubjectId,
          score: mark.score ? Math.round(parseFloat(mark.score)) : null,
          maxScore: 100, // Default max score of 100
          comments: mark.comments || ''
        };
      }
      return null;
    }).filter((m: any) => m !== null);

    if (marksData.length === 0) {
      this.error = 'Please enter at least one mark or remark';
      this.loading = false;
      return;
    }

    console.log('Saving marks for examId:', this.currentExam.id);
    console.log('Marks data to send:', marksData);

    this.examService.captureMarks(this.currentExam.id, marksData).subscribe({
      next: (data: any) => {
        this.success = `Successfully saved marks for ${marksData.length} student(s)`;
        this.loading = false;
        // Reload existing marks to reflect saved data
        setTimeout(() => {
          this.loadExistingMarks();
          // Check completeness after saving
          this.checkCompleteness();
        }, 500);
      },
      error: (err: any) => {
        console.error('Error saving marks:', err);
        if (err.status === 403) {
          this.error = 'You do not have permission to save marks. Please contact an administrator.';
        } else if (err.status === 401) {
          this.error = 'Authentication required. Please log in again.';
        } else {
          this.error = err.error?.message || 'Failed to save marks. Please try again.';
        }
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  checkCompleteness() {
    if (!this.currentExam || !this.currentExam.id || !this.selectedClassId || !this.selectedExamType || !this.selectedTerm) {
      this.canPublish = false;
      return;
    }

    if (this.isPublished) {
      this.canPublish = false;
      return;
    }

    this.checkingCompleteness = true;

    // Get all marks for this exam
    this.examService.getMarks(this.currentExam.id, undefined, this.selectedClassId).subscribe({
      next: (allMarks: any) => {
        // Get all subjects for this exam
        const examSubjects = this.currentExam.subjects || [];
        if (examSubjects.length === 0) {
          this.canPublish = false;
          this.checkingCompleteness = false;
          return;
        }

        // Check if all students have marks for all subjects
        const studentIds = this.students.map(s => s.id);
        const subjectIds = examSubjects.map((s: any) => s.id);
        
        let allMarksComplete = true;
        for (const studentId of studentIds) {
          for (const subjectId of subjectIds) {
            const mark = allMarks.find((m: any) => 
              m.studentId === studentId && 
              m.subjectId === subjectId && 
              m.examId === this.currentExam.id
            );
            // Marks must have a score (can be 0, but must be a number)
            if (!mark || mark.score === null || mark.score === undefined || mark.score === '') {
              allMarksComplete = false;
              break;
            }
          }
          if (!allMarksComplete) break;
        }

        // Check report card remarks (class teacher and headmaster)
        // We'll check this by trying to get report card data
        this.examService.getReportCard(
          this.selectedClassId,
          this.selectedExamType,
          this.selectedTerm
        ).subscribe({
          next: (reportCardData: any) => {
            const reportCards = reportCardData.reportCards || [];
            let allRemarksComplete = true;

            for (const studentId of studentIds) {
              const card = reportCards.find((c: any) => c.student?.id === studentId);
              if (!card || !card.remarks) {
                allRemarksComplete = false;
                break;
              }
              // Check if class teacher and headmaster remarks are entered
              const hasClassTeacherRemarks = card.remarks.classTeacherRemarks && 
                card.remarks.classTeacherRemarks.trim().length > 0;
              const hasHeadmasterRemarks = card.remarks.headmasterRemarks && 
                card.remarks.headmasterRemarks.trim().length > 0;
              
              if (!hasClassTeacherRemarks || !hasHeadmasterRemarks) {
                allRemarksComplete = false;
                break;
              }
            }

            // Require both marks and remarks to be complete
            this.canPublish = allMarksComplete && allRemarksComplete;
            this.checkingCompleteness = false;
          },
          error: (err: any) => {
            // If we can't get report cards, just check marks
            // But we should still require remarks, so set to false if we can't verify
            this.canPublish = false;
            this.checkingCompleteness = false;
          }
        });
      },
      error: (err: any) => {
        console.error('Error checking completeness:', err);
        this.canPublish = false;
        this.checkingCompleteness = false;
      }
    });
  }

  publishResults() {
    // For publishing, only exam type and term are required
    if (!this.publishExamType) {
      this.error = 'Please select an exam type to publish results.';
      return;
    }

    if (!this.publishTerm) {
      this.error = 'Term is required. Please ensure the active term is set in settings.';
      return;
    }

    if (!confirm(`Are you sure you want to publish all ${this.examTypes.find(t => t.value === this.publishExamType)?.label || this.publishExamType} results for ${this.publishTerm}? Once published, results will be visible to all users (students, parents, and teachers) and marks/comments cannot be edited.`)) {
      return;
    }

    this.publishing = true;
    this.error = '';
    this.success = '';

    // Publish by exam type and term (all classes)
    this.examService.publishExamByType(this.publishExamType, this.publishTerm).subscribe({
      next: (response: any) => {
        this.success = `Results published successfully! ${response.publishedCount || 0} exam(s) published. All users (students, parents, and teachers) can now view the results.`;
        this.publishing = false;
        setTimeout(() => this.success = '', 8000);
      },
      error: (err: any) => {
        console.error('Error publishing exam:', err);
        this.error = err.error?.message || 'Failed to publish results. Please try again.';
        this.publishing = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }
}


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
  /** When true, student's marks count toward class pass rate on mark sheet (default true). */
  studentPassRateInclusion: Record<string, boolean> = {};
  
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
  savedRecords: Set<string> = new Set(); // Track which student+subject combinations have been saved
  
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
  canPublish = false;
  checkingCompleteness = false;

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
    const isUniversalTeacher = user?.role === 'teacher' && (user as any).isUniversalTeacher;

    // Universal teacher or Admin/SuperAdmin: load all classes and subjects
    if (this.isAdmin || isUniversalTeacher) {
      this.loadClasses();
      this.loadSubjects();
    } else if (user && user.role === 'teacher') {
      this.loadTeacherInfo();
    } else {
      this.loadClasses();
      this.loadSubjects();
    }
    
    this.loadActiveTerm();
    
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
        
        // After term is loaded, check if we can auto-load students
        setTimeout(() => {
          this.checkAndAutoLoadStudents();
        }, 100);
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
    // For admin/superadmin - load all subjects (class filter applied separately)
    this.subjectService.getSubjects().subscribe({
      next: (data: any) => {
        this.allSubjects = data || [];
        // Apply class-based filtering so only subjects allocated to the class appear
        this.updateSubjectsForSelectedClass();
      },
      error: (err: any) => {
        console.error('Error loading subjects:', err);
        this.allSubjects = [];
        this.subjects = [];
      }
    });
  }

  updateSubjectsForSelectedClass() {
    if (!this.selectedClassId) {
      this.subjects = [];
      return;
    }

    // Always base the list on subjects allocated to the selected class.
    // For teachers, we further restrict to subjects they teach.
    this.classService.getClassById(this.selectedClassId).subscribe({
      next: (rawClassData: any) => {
        const classData = rawClassData?.class || rawClassData || {};
        const classSubjects: any[] = Array.isArray(classData.subjects) ? classData.subjects : [];

        if (!classSubjects.length) {
          this.subjects = [];
          // Clear selected subject if it no longer belongs to this class
          if (this.selectedSubjectId) {
            this.selectedSubjectId = '';
          }
          return;
        }

        const classSubjectIds = classSubjects.map((s: any) => s.id);

        if (this.teacher && this.teacherSubjects.length > 0 && !this.isAdmin) {
          // Teacher: intersection of teacher's subjects and class subjects
          const matchedSubjects = this.teacherSubjects.filter((teacherSubject: any) =>
            classSubjectIds.includes(teacherSubject.id)
          );
          
          // FALLBACK: If no matching subjects found, show all class subjects
          // This allows teachers to enter marks for any subject in their assigned classes
          if (matchedSubjects.length === 0) {
            console.log('No matching teacher subjects for class, showing all class subjects as fallback');
            this.subjects = classSubjects;
          } else {
            this.subjects = matchedSubjects;
          }
        } else if (this.teacher && this.teacherSubjects.length === 0 && !this.isAdmin) {
          // Teacher with no subjects assigned: show all class subjects as fallback
          console.log('Teacher has no assigned subjects, showing all class subjects');
          this.subjects = classSubjects;
        } else {
          // Admin / superadmin / universal teacher: all subjects allocated to the class
          const allSubjectsMap = new Map<string, any>(
            (this.allSubjects || []).map((s: any) => [s.id, s])
          );
          const merged: any[] = [];
          classSubjects.forEach((clsSubj: any) => {
            const fromAll = allSubjectsMap.get(clsSubj.id);
            merged.push(fromAll || clsSubj);
          });

          // Remove duplicates by ID
          const unique = new Map<string, any>();
          merged.forEach((s: any) => {
            if (s?.id && !unique.has(s.id)) {
              unique.set(s.id, s);
            }
          });
          this.subjects = Array.from(unique.values());
        }

        // Sort by name for consistent display
        this.subjects.sort((a: any, b: any) => {
          const an = String(a.name || '').toLowerCase();
          const bn = String(b.name || '').toLowerCase();
          return an.localeCompare(bn);
        });

        // If the currently selected subject is not in the filtered list, clear it
        if (this.selectedSubjectId && !this.subjects.find(s => s.id === this.selectedSubjectId)) {
          this.selectedSubjectId = '';
        }

        // After updating subjects based on class, re-check if we can auto-load students
        this.checkAndAutoLoadStudents();
      },
      error: (err: any) => {
        console.error('Error loading class details for subject filtering:', err);
        // On error, fall back to empty list to avoid exposing subjects not linked to the class
        this.subjects = [];
        if (this.selectedSubjectId) {
          this.selectedSubjectId = '';
        }
      }
    });
  }

  onSelectionChange() {
    // Reset marks entry when selections change
    this.showMarksEntry = false;
    this.students = [];
    this.filteredStudents = [];
    this.marks = {};
    this.currentExam = null;
    this.studentPassRateInclusion = {};
    this.studentSearchQuery = '';
    this.canPublish = false;
    this.isPublished = false;
    this.savedRecords.clear(); // Clear saved records when selection changes
    
    // Reset subject selection if class changed
    if (!this.selectedClassId) {
      this.selectedSubjectId = '';
      this.subjects = [];
    }
    
    // Whenever class/term/exam type/subject selection changes, we re-derive
    // the subjects from the class allocation. After that, checkAndAutoLoadStudents()
    // will be called from updateSubjectsForSelectedClass().
    if (this.selectedClassId) {
      this.updateSubjectsForSelectedClass();
    } else {
      this.subjects = [];
      this.checkAndAutoLoadStudents();
    }
  }

  checkAndAutoLoadStudents() {
    // Auto-load students when all 4 criteria are selected and subjects are available
    if (this.isSelectionValid() && !this.loadingStudents) {
      // Make sure subjects are loaded (for teachers)
      if (!this.isAdmin && this.subjects.length === 0) {
        // Subjects still loading, wait a bit more
        setTimeout(() => this.checkAndAutoLoadStudents(), 200);
        return;
      }
      
      console.log('All criteria selected - auto-loading students...');
      // Use setTimeout to avoid triggering during the same change event cycle
      setTimeout(() => {
        if (this.isSelectionValid() && !this.loadingStudents) {
          this.loadStudents();
        }
      }, 100);
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
          this.loadPassRateInclusionsForScope();
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
      if (!this.selectedClassId || !this.selectedTerm || !this.selectedExamType || !this.selectedSubjectId) {
        reject(new Error('Missing selection criteria'));
        return;
      }

      // Normalize term for consistent lookup
      const normalizedTerm = (this.selectedTerm || '').trim();
      const normalizedType = this.selectedExamType;
      const normalizedClassId = this.selectedClassId;
      const normalizedSubjectId = this.selectedSubjectId;

      // Try to find existing exam with matching criteria
      const examName = `${normalizedTerm} - ${this.examTypes.find(t => t.value === normalizedType)?.label} - ${this.classes.find(c => c.id === normalizedClassId)?.name}`;
      
      const examData = {
        name: examName,
        type: normalizedType,
        term: normalizedTerm,
        examDate: new Date().toISOString().split('T')[0],
        classId: normalizedClassId,
        subjectIds: [normalizedSubjectId]
      };

      // Check if exam exists first by getting exams for this class
      this.examService.getExams(normalizedClassId).subscribe({
        next: (exams: any) => {
          const examsArray = Array.isArray(exams) ? exams : [];
          // Find exam with matching term, type, and subject
          // Be more lenient with term matching (trimming) and subject check
          const existingExam = examsArray.find((e: any) => 
            (e.term || '').trim() === normalizedTerm &&
            e.type === normalizedType &&
            e.classId === normalizedClassId &&
            e.subjects?.some((s: any) => s.id === normalizedSubjectId)
          );

          if (existingExam) {
            console.log('Found existing exam:', existingExam);
            resolve(existingExam);
          } else {
            // Check if there is an exam of the same type and term for this class, even without this subject
            // We might want to add this subject to THAT exam instead of creating a new one
            const generalExam = examsArray.find((e: any) => 
              (e.term || '').trim() === normalizedTerm &&
              e.type === normalizedType &&
              e.classId === normalizedClassId
            );

            if (generalExam) {
              console.log('Found general exam for this class/term/type, adding subject to it:', generalExam.id);
              // Update existing exam with new subject
              const currentSubjectIds = (generalExam.subjects || []).map((s: any) => s.id);
              if (!currentSubjectIds.includes(normalizedSubjectId)) {
                currentSubjectIds.push(normalizedSubjectId);
                const updateData = {
                  ...generalExam,
                  subjectIds: currentSubjectIds
                };
                this.examService.updateExam(generalExam.id, updateData).subscribe({
                  next: (updated: any) => resolve(updated.exam || updated),
                  error: (err: any) => {
                    console.error('Error updating exam with subject:', err);
                    // Fallback: use the general exam anyway, it might work if subject was already there but missed in lookup
                    resolve(generalExam);
                  }
                });
                return;
              }
              resolve(generalExam);
            } else {
              // Create new exam
              console.log('Creating new exam with data:', examData);
              this.examService.createExam(examData).subscribe({
                next: (response: any) => {
                  const exam = response.exam || response;
                  if (!exam.id) {
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
          }
        },
        error: (err: any) => reject(err)
      });
    });
  }

  initializeMarks() {
    this.marks = {};
    this.savedRecords.clear(); // Clear saved records when initializing
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

  loadPassRateInclusionsForScope() {
    this.students.forEach(s => {
      this.studentPassRateInclusion[s.id] = true;
    });
    if (!this.selectedClassId || !this.selectedTerm || !this.selectedExamType) {
      return;
    }
    this.examService
      .getPassRateInclusionsByScope(this.selectedClassId, this.selectedTerm, this.selectedExamType)
      .subscribe({
        next: (res: any) => {
          const inc = res?.inclusions || {};
          this.students.forEach(s => {
            this.studentPassRateInclusion[s.id] = inc[s.id] !== false;
          });
        },
        error: () => {
          this.students.forEach(s => {
            this.studentPassRateInclusion[s.id] = true;
          });
        }
      });
  }

  passRateInclusionForStudent(studentId: string): boolean {
    return this.studentPassRateInclusion[studentId] !== false;
  }

  onPassRateInclusionChange(studentId: string, checked: boolean) {
    if (this.isPublished) {
      return;
    }
    this.studentPassRateInclusion[studentId] = checked;
    if (!this.selectedClassId || !this.selectedTerm || !this.selectedExamType) {
      return;
    }
    this.examService
      .setPassRateInclusionByScope({
        classId: this.selectedClassId,
        term: this.selectedTerm,
        examType: this.selectedExamType,
        studentId,
        includeInClassPassRate: checked
      })
      .subscribe({
        error: (err: any) => console.error('Pass rate inclusion update failed:', err)
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
            // Mark as saved if marks were loaded from backend
            if (mark.score !== null || mark.comments) {
              this.savedRecords.add(key);
            }
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
    this.studentPassRateInclusion = {};
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

  isRecordSaved(studentId: string): boolean {
    const key = this.getMarkKey(studentId, this.selectedSubjectId);
    return this.savedRecords.has(key);
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
        mark.score = 0;
      } else if (score > 100) {
        alert('Maximum mark allowed is 100%. The mark has been adjusted to 100.');
        mark.score = 100;
      } else {
        mark.score = Math.round(score);
      }
    }
  }

  onMarkChange(studentId: string) {
    const key = this.getMarkKey(studentId, this.selectedSubjectId);
    const mark = this.marks[key];
    if (mark && mark.score !== null && mark.score !== undefined && mark.score !== '') {
      const score = parseFloat(mark.score);
      if (!isNaN(score)) {
        if (score > 100) {
          mark.score = 100;
        } else if (score < 0) {
          mark.score = 0;
        } else {
          mark.score = Math.round(score);
        }
      }
    }
    // Strict replacement: This updates the local model which is then sent to the backend
    // Remove from saved records to trigger a fresh save
    this.savedRecords.delete(key);
    this.scheduleAutoSave(studentId);
  }

  onCommentsChange(studentId: string) {
    // Remove from saved records when comments change (will be re-added after save)
    const key = this.getMarkKey(studentId, this.selectedSubjectId);
    this.savedRecords.delete(key);
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
    // Auto-save immediately when leaving a student's row (faster feedback)
    this.autoSaveStudent(studentId);
    // Clear any pending timeout since we're saving now
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
      this.autoSaveTimeout = null;
    }
    this.pendingSaves.delete(studentId);
  }

  scheduleAutoSave(studentId: string) {
    // Add to pending saves
    this.pendingSaves.add(studentId);
    
    // Clear existing timeout
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    
    // Schedule auto-save after 1.5 seconds of inactivity (reduced from 2 seconds for faster feedback)
    this.autoSaveTimeout = setTimeout(() => {
      this.processPendingSaves();
    }, 1500);
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
      comments: mark.comments || '',
      includeInClassPassRate: this.passRateInclusionForStudent(studentId)
    }];

    this.isAutoSaving = true;
    this.examService.captureMarks(this.currentExam.id, marksData).subscribe({
      next: (data: any) => {
        this.isAutoSaving = false;
        // Mark this record as saved
        this.savedRecords.add(key);
        
        // Show brief success message
        const student = this.students.find(s => s.id === studentId);
        const studentName = student ? `${student.firstName} ${student.lastName}` : 'Student';
        this.showAutoSaveSuccess(`✓ ${studentName}'s marks saved automatically`);
      },
      error: (err: any) => {
        this.isAutoSaving = false;
        // Remove from saved records if save failed
        this.savedRecords.delete(key);
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
          comments: mark.comments || '',
          includeInClassPassRate: this.passRateInclusionForStudent(studentId)
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
        // Mark all saved records
        studentIds.forEach(studentId => {
          const key = this.getMarkKey(studentId, this.selectedSubjectId);
          const mark = this.marks[key];
          if (mark && (mark.score !== null || mark.comments)) {
            this.savedRecords.add(key);
          }
        });
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

  deleteMark(studentId: string) {
    if (!this.currentExam || !this.currentExam.id) return;
    
    const student = this.students.find(s => s.id === studentId);
    const studentName = student ? `${student.firstName} ${student.lastName}` : 'this student';
    
    if (!confirm(`Are you sure you want to delete the mark for ${studentName}? This will also remove it from marksheets and report cards.`)) {
      return;
    }

    const key = this.getMarkKey(studentId, this.selectedSubjectId);
    
    this.loading = true;
    this.examService.deleteMark(this.currentExam.id, studentId, this.selectedSubjectId).subscribe({
      next: () => {
        this.success = `Mark deleted for ${studentName}`;
        this.loading = false;
        
        // Update local state
        if (this.marks[key]) {
          this.marks[key].score = null;
          this.marks[key].comments = '';
        }
        this.savedRecords.delete(key);
        
        // Set focus back to the input
        setTimeout(() => {
          const inputElement = document.getElementById(`score_${studentId}`);
          if (inputElement) {
            inputElement.focus();
          }
          this.success = '';
        }, 100);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to delete mark';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  restoreMarks() {
    if (!this.currentExam || !this.selectedSubjectId) return;
    
    this.loading = true;
    this.success = 'Restoring marks from database...';
    
    this.examService.getMarks(this.currentExam.id).subscribe({
      next: (marksData: any) => {
        const marksArray = Array.isArray(marksData) ? marksData : [];
        const subjectMarks = marksArray.filter((m: any) => m.subjectId === this.selectedSubjectId);
        
        if (subjectMarks.length === 0) {
          this.success = 'No marks found in database to restore.';
        } else {
          subjectMarks.forEach((mark: any) => {
            const key = this.getMarkKey(mark.studentId, this.selectedSubjectId);
            if (this.marks[key]) {
              this.marks[key].score = mark.score;
              this.marks[key].maxScore = mark.maxScore;
              this.marks[key].comments = mark.comments || '';
              this.savedRecords.add(key);
            }
          });
          this.success = `Successfully restored ${subjectMarks.length} marks from database.`;
        }
        this.loading = false;
        setTimeout(() => this.success = '', 4000);
      },
      error: (err: any) => {
        this.error = 'Failed to restore marks';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
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
    // Only include marks that have been modified or entered
    const marksData = this.filteredStudents.map((student: any) => {
      const key = this.getMarkKey(student.id, this.selectedSubjectId);
      const mark = this.marks[key];
      
      // Only include this student if their mark is not already saved in the backend
      // OR if it's currently being edited (not in savedRecords)
      if (mark && !this.isRecordSaved(student.id)) {
        return {
          studentId: student.id,
          subjectId: this.selectedSubjectId,
          score: (mark.score !== null && mark.score !== undefined && mark.score !== '') ? Math.round(parseFloat(String(mark.score))) : null,
          maxScore: 100, // Default max score of 100
          comments: mark.comments || '',
          includeInClassPassRate: this.passRateInclusionForStudent(student.id)
        };
      }
      return null;
    }).filter((m: any) => m !== null);

    if (marksData.length === 0) {
      this.success = 'All marks are already up to date.';
      this.loading = false;
      return;
    }

    console.log('Saving marks for examId:', this.currentExam.id);
    console.log('Marks data to send:', marksData);

    this.examService.captureMarks(this.currentExam.id, marksData).subscribe({
      next: (data: any) => {
        this.success = `Successfully saved marks for ${marksData.length} student(s)`;
        this.loading = false;
        
        // Mark all saved records
        this.filteredStudents.forEach((student: any) => {
          const key = this.getMarkKey(student.id, this.selectedSubjectId);
          const mark = this.marks[key];
          if (mark && (mark.score !== null || mark.comments)) {
            this.savedRecords.add(key);
          }
        });
        
        // Reload existing marks to reflect saved data and ensure cascade
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

}


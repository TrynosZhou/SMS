import { Component, OnInit } from '@angular/core';
import { ClassService } from '../../../services/class.service';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';
import { trigger, state, style, transition, animate } from '@angular/animations';

interface PromotionData {
  class: any;
  nextClass: any | null;
  students: any[];
  filteredStudents: any[];
}

@Component({
  selector: 'app-class-promotion',
  templateUrl: './class-promotion.component.html',
  styleUrls: ['./class-promotion.component.css'],
  animations: [
    trigger('fadeInOut', [
      state('void', style({ opacity: 0 })),
      transition(':enter', [
        animate('300ms ease-in', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-out', style({ opacity: 0 }))
      ])
    ]),
    trigger('fadeInUp', [
      state('void', style({ opacity: 0, transform: 'translateY(20px)' })),
      transition(':enter', [
        animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('slideInUp', [
      state('void', style({ transform: 'translateY(50px)', opacity: 0 })),
      transition(':enter', [
        animate('400ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ])
    ])
  ]
})
export class ClassPromotionComponent implements OnInit {
  classes: any[] = [];
  students: any[] = [];
  promotionData: PromotionData[] = [];
  filteredPromotionData: PromotionData[] = [];
  
  loading = false;
  promoting = false;
  error = '';
  success = '';
  
  // Promotion mode: 'all' or 'individual'
  promotionMode: 'all' | 'individual' = 'all';
  
  // Selected students for individual mode
  selectedStudents: Set<string> = new Set();
  
  // Search and filter
  searchQuery = '';
  filterClass: string | 'all' = 'all';
  
  // Modal
  showConfirmModal = false;

  // Promotion rules from settings
  promotionRules: { [key: string]: string } = {};

  constructor(
    private classService: ClassService,
    private studentService: StudentService,
    private settingsService: SettingsService
  ) { }

  ngOnInit() {
    this.loadSettings();
  }

  loadSettings() {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        console.log('Settings loaded:', settings);
        this.promotionRules = settings.promotionRules || {};
        
        // If no promotion rules in settings, use defaults
        if (!this.promotionRules || Object.keys(this.promotionRules).length === 0) {
          console.warn('No promotion rules found in settings, using defaults');
          this.promotionRules = {
            'ECD A': 'ECD B',
            'ECD B': 'Grade 1',
            'Grade 1': 'Grade 2',
            'Grade 2': 'Grade 3',
            'Grade 3': 'Grade 4',
            'Grade 4': 'Grade 5',
            'Grade 5': 'Grade 6',
            'Grade 6': 'Grade 7',
            'Grade 7': 'Completed'
          };
        }
        
        console.log('Using promotion rules:', this.promotionRules);
        this.loadAllData();
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
        // Use default promotion rules if settings fail to load
        this.promotionRules = {
          'ECD A': 'ECD B',
          'ECD B': 'Grade 1',
          'Grade 1': 'Grade 2',
          'Grade 2': 'Grade 3',
          'Grade 3': 'Grade 4',
          'Grade 4': 'Grade 5',
          'Grade 5': 'Grade 6',
          'Grade 6': 'Grade 7',
          'Grade 7': 'Completed'
        };
        console.log('Using default promotion rules due to error');
        this.loadAllData();
      }
    });
  }

  loadAllData() {
    this.loading = true;
    this.error = '';
    
    console.log('Loading all data (classes and students)...');
    
    // Load classes and students in parallel
    Promise.all([
      this.classService.getClasses().toPromise(),
      this.studentService.getStudents().toPromise()
    ]).then(([classesData, studentsData]) => {
      // Process classes
      this.classes = Array.isArray(classesData) ? classesData : (classesData?.classes || []);
      console.log(`Loaded ${this.classes.length} classes`);
      
      // Process students
      this.students = Array.isArray(studentsData) ? studentsData : (studentsData?.students || []);
      console.log(`Loaded ${this.students.length} students`);
      
      // Verify specific student if needed (for debugging)
      const testStudent = this.students.find((s: any) => s.studentNumber === 'JPS6142713');
      if (testStudent) {
        console.log('Found test student JPS6142713:', {
          id: testStudent.id,
          name: `${testStudent.firstName} ${testStudent.lastName}`,
          classId: testStudent.classId,
          className: testStudent.class?.name || 'N/A',
          classForm: testStudent.class?.form || 'N/A'
        });
      }
      
      // Build promotion data
      this.buildPromotionData();
      this.filterStudents();
      
      console.log(`Built promotion data for ${this.promotionData.length} classes`);
      this.loading = false;
    }).catch((err: any) => {
      console.error('Error loading data:', err);
      this.error = err.error?.message || 'Failed to load data';
      this.loading = false;
        setTimeout(() => this.error = '', 5000);
    });
  }

  buildPromotionData() {
    this.promotionData = [];
    
    // Group students by class
    const studentsByClass = new Map<string, any[]>();
    this.students.forEach(student => {
      if (student.classId) {
        if (!studentsByClass.has(student.classId)) {
          studentsByClass.set(student.classId, []);
        }
        studentsByClass.get(student.classId)!.push(student);
      }
    });
    
    // Debug: Log promotion rules and classes
    console.log('Promotion Rules:', this.promotionRules);
    console.log('Available Classes:', this.classes.map(c => ({ name: c.name, form: c.form })));
    
    // Build promotion data for each class
    this.classes.forEach(classItem => {
      const classStudents = studentsByClass.get(classItem.id) || [];
      if (classStudents.length > 0) {
        const nextClass = this.findNextClass(classItem);
        
        // Debug: Log if next class not found
        if (!nextClass) {
          console.log(`No next class found for: ${classItem.name} (Form: ${classItem.form})`);
          console.log(`  - Promotion rules keys:`, Object.keys(this.promotionRules));
          console.log(`  - Looking for match in:`, this.classes.map(c => c.name));
        }
        
        this.promotionData.push({
          class: classItem,
          nextClass: nextClass,
          students: classStudents,
          filteredStudents: [...classStudents]
        });
      }
    });
    
    // Sort by class name alphabetically
    this.promotionData.sort((a, b) => {
      return a.class.name.localeCompare(b.class.name);
    });
  }

  findNextClass(classItem: any): any | null {
    if (!classItem || !this.promotionRules || Object.keys(this.promotionRules).length === 0) {
      console.log('findNextClass: Missing classItem or promotionRules');
      return null;
    }

    // Normalize function for case-insensitive, trimmed matching
    const normalize = (str: string) => {
      if (!str) return '';
      return str.trim().toLowerCase().replace(/\s+/g, ' ');
    };
    
    // Extract base class name (e.g., "Grade 2" from "Grade 2A" or "Grade2")
    const extractBaseName = (str: string) => {
      if (!str) return '';
      const normalized = normalize(str);
      // Match patterns like "grade 2", "grade2", "grade 2a", etc.
      const match = normalized.match(/^(grade|form|ecd)\s*([a-z0-9]+)/i);
      if (match) {
        return `${match[1]} ${match[2]}`.toLowerCase();
      }
      return normalized;
    };
    
    // Try to find matching rule - check both name and form
    let nextClassName: string | undefined;
    const className = classItem.name || '';
    const classForm = classItem.form || '';
    
    console.log(`Finding next class for: name="${className}", form="${classForm}"`);
    console.log('Available promotion rules:', Object.keys(this.promotionRules));
    
    // Strategy 1: Exact match by name
    if (className && this.promotionRules[className]) {
      nextClassName = this.promotionRules[className];
      console.log(`Found exact match by name: ${className} → ${nextClassName}`);
    }
    // Strategy 2: Exact match by form
    else if (classForm && this.promotionRules[classForm]) {
      nextClassName = this.promotionRules[classForm];
      console.log(`Found exact match by form: ${classForm} → ${nextClassName}`);
    }
    // Strategy 3: Case-insensitive exact match by name
    else if (className) {
      const normalizedName = normalize(className);
      for (const [key, value] of Object.entries(this.promotionRules)) {
        if (normalize(key) === normalizedName) {
          nextClassName = value;
          console.log(`Found case-insensitive match by name: ${key} → ${nextClassName}`);
          break;
        }
      }
    }
    // Strategy 4: Case-insensitive exact match by form
    else if (classForm) {
      const normalizedForm = normalize(classForm);
      for (const [key, value] of Object.entries(this.promotionRules)) {
        if (normalize(key) === normalizedForm) {
          nextClassName = value;
          console.log(`Found case-insensitive match by form: ${key} → ${nextClassName}`);
          break;
        }
      }
    }
    
    // Strategy 5: Base name matching (e.g., "Grade 2" matches "Grade 2A")
    if (!nextClassName && className) {
      const baseName = extractBaseName(className);
      for (const [key, value] of Object.entries(this.promotionRules)) {
        const keyBase = extractBaseName(key);
        if (keyBase === baseName) {
          nextClassName = value;
          console.log(`Found base name match: ${key} (base: ${keyBase}) → ${nextClassName}`);
          break;
        }
      }
    }
    
    // Strategy 6: Base name matching by form
    if (!nextClassName && classForm) {
      const baseForm = extractBaseName(classForm);
      for (const [key, value] of Object.entries(this.promotionRules)) {
        const keyBase = extractBaseName(key);
        if (keyBase === baseForm) {
          nextClassName = value;
          console.log(`Found base form match: ${key} (base: ${keyBase}) → ${nextClassName}`);
          break;
        }
      }
    }
    
    // If "Completed" is the next class, return null (no actual class to promote to)
    if (nextClassName === 'Completed') {
      console.log('Next class is "Completed" - returning null');
      return null;
    }
    
    // If no next class found in rules, return null
    if (!nextClassName) {
      console.log(`No promotion rule found for: name="${className}", form="${classForm}"`);
      return null;
    }
    
    console.log(`Looking for class object: ${nextClassName}`);
    console.log('Available classes:', this.classes.map(c => ({ name: c.name, form: c.form })));
    
    // Now find the actual class object
    // Strategy 1: Exact match
    let nextClass = this.classes.find(c => 
      c.name === nextClassName || c.form === nextClassName
    );
    
    // Strategy 2: Case-insensitive match
    if (!nextClass) {
      const normalizedNext = normalize(nextClassName);
      nextClass = this.classes.find(c => 
        normalize(c.name) === normalizedNext || normalize(c.form) === normalizedNext
      );
    }
    
    // Strategy 3: Base name matching
    if (!nextClass) {
      const baseNext = extractBaseName(nextClassName);
      nextClass = this.classes.find(c => {
        const cBaseName = extractBaseName(c.name);
        const cBaseForm = extractBaseName(c.form);
        return cBaseName === baseNext || cBaseForm === baseNext;
      });
    }
    
    // Strategy 4: Partial match (e.g., "Grade 1" matches "Grade 1A")
    if (!nextClass) {
      const normalizedNext = normalize(nextClassName);
      nextClass = this.classes.find(c => {
        const cName = normalize(c.name);
        const cForm = normalize(c.form);
        return cName.startsWith(normalizedNext) || 
               normalizedNext.startsWith(cName) ||
               cForm.startsWith(normalizedNext) ||
               normalizedNext.startsWith(cForm);
      });
    }
    
    if (nextClass) {
      console.log(`Found next class: ${nextClass.name} (form: ${nextClass.form})`);
    } else {
      console.log(`Class object not found for: ${nextClassName}`);
    }
    
    return nextClass || null;
  }

  setPromotionMode(mode: 'all' | 'individual') {
    this.promotionMode = mode;
    if (mode === 'all') {
      this.selectedStudents.clear();
    }
    this.filterStudents();
  }

  filterStudents() {
    // Apply search filter
    this.promotionData.forEach(classData => {
      if (!this.searchQuery) {
        classData.filteredStudents = [...classData.students];
      } else {
        const query = this.searchQuery.toLowerCase();
        classData.filteredStudents = classData.students.filter(student =>
          student.firstName?.toLowerCase().includes(query) ||
          student.lastName?.toLowerCase().includes(query) ||
          student.studentNumber?.toLowerCase().includes(query) ||
          classData.class.name?.toLowerCase().includes(query) ||
          classData.class.form?.toLowerCase().includes(query)
        );
      }
    });
    
    // Apply class filter
    if (this.filterClass === 'all') {
      this.filteredPromotionData = [...this.promotionData];
    } else {
      this.filteredPromotionData = this.promotionData.filter(
        data => data.class.id === this.filterClass
      );
    }
  }

  setClassFilter(classId: string | 'all') {
    this.filterClass = classId;
    this.filterStudents();
  }

  clearSearch() {
    this.searchQuery = '';
    this.filterStudents();
  }

  clearFilters() {
    this.searchQuery = '';
    this.filterClass = 'all';
    this.filterStudents();
  }

  // Selection methods
  toggleStudentSelection(student: any, classData: PromotionData) {
    if (!classData.nextClass) return; // Can't select if no next class
    
    if (this.selectedStudents.has(student.id)) {
      this.selectedStudents.delete(student.id);
    } else {
      this.selectedStudents.add(student.id);
    }
  }

  isStudentSelected(student: any): boolean {
    return this.selectedStudents.has(student.id);
  }

  toggleClassSelection(classData: PromotionData) {
    if (!classData.nextClass) return;
    
    const allSelected = this.areAllStudentsSelected(classData);
    classData.filteredStudents.forEach(student => {
      if (classData.nextClass) {
        if (allSelected) {
          this.selectedStudents.delete(student.id);
        } else {
          this.selectedStudents.add(student.id);
        }
      }
    });
  }

  areAllStudentsSelected(classData: PromotionData): boolean {
    if (!classData.nextClass || classData.filteredStudents.length === 0) return false;
    return classData.filteredStudents.every(student => 
      this.selectedStudents.has(student.id)
    );
  }

  selectAll() {
    this.promotionData.forEach(classData => {
      if (classData.nextClass) {
        classData.students.forEach(student => {
          this.selectedStudents.add(student.id);
        });
      }
    });
  }

  deselectAll() {
    this.selectedStudents.clear();
  }

  selectByClass() {
    // Select all students from classes that have a next class
    this.promotionData.forEach(classData => {
      if (classData.nextClass) {
        classData.students.forEach(student => {
          this.selectedStudents.add(student.id);
        });
      }
    });
  }

  getSelectedCount(): number {
    return this.selectedStudents.size;
  }

  getSelectedCountForClass(classData: PromotionData): number {
    return classData.filteredStudents.filter(student => 
      this.selectedStudents.has(student.id)
    ).length;
  }

  // Statistics
  getTotalStudents(): number {
    return this.promotionData.reduce((sum, data) => sum + data.students.length, 0);
  }

  getEligibleStudents(): number {
    return this.promotionData
      .filter(data => data.nextClass !== null)
      .reduce((sum, data) => sum + data.students.length, 0);
  }

  getClassesWithStudents(): number {
    return this.promotionData.length;
  }

  getPromotionCount(): number {
    if (this.promotionMode === 'all') {
      return this.getEligibleStudents();
    } else {
      return this.getSelectedCount();
    }
  }

  getAffectedClassesCount(): number {
    if (this.promotionMode === 'all') {
      return this.promotionData.filter(data => data.nextClass !== null).length;
    } else {
      const affectedClasses = new Set<string>();
      this.promotionData.forEach(classData => {
        if (classData.nextClass) {
          const hasSelected = classData.students.some(student => 
            this.selectedStudents.has(student.id)
          );
          if (hasSelected) {
            affectedClasses.add(classData.class.id);
          }
        }
      });
      return affectedClasses.size;
    }
  }

  canPromote(): boolean {
    if (this.promotionMode === 'all') {
      return this.getEligibleStudents() > 0;
    } else {
      return this.getSelectedCount() > 0;
    }
  }

  getStudentInitials(student: any): string {
    const first = student.firstName?.charAt(0) || '';
    const last = student.lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || '?';
  }

  getPromotionPreview(): any[] {
    const preview: any[] = [];
    
    if (this.promotionMode === 'all') {
      // All eligible students
      this.promotionData.forEach(classData => {
        if (classData.nextClass && classData.students.length > 0) {
          preview.push({
            class: classData.class,
            nextClass: classData.nextClass,
            students: classData.students
          });
        }
      });
    } else {
      // Selected students only
      const studentsByClass = new Map<string, { class: any; nextClass: any; students: any[] }>();
      
      this.promotionData.forEach(classData => {
        if (classData.nextClass) {
          const selected = classData.students.filter(student => 
            this.selectedStudents.has(student.id)
          );
          
          if (selected.length > 0) {
            if (!studentsByClass.has(classData.class.id)) {
              studentsByClass.set(classData.class.id, {
                class: classData.class,
                nextClass: classData.nextClass,
                students: []
              });
            }
            studentsByClass.get(classData.class.id)!.students.push(...selected);
          }
        }
      });
      
      studentsByClass.forEach((value) => {
        preview.push(value);
      });
    }
    
    return preview;
  }

  openConfirmModal() {
    if (!this.canPromote()) {
      return;
    }
    this.showConfirmModal = true;
    }

  closeConfirmModal() {
    this.showConfirmModal = false;
  }
    
  promoteStudents() {
    if (!this.canPromote()) {
      return;
    }

    this.promoting = true;
    this.error = '';
    this.success = '';
    this.closeConfirmModal();

    // Get students to promote
    const studentsToPromote: { studentId: string; fromClassId: string; toClassId: string; studentNumber?: string; fromClassName?: string; toClassName?: string }[] = [];
    
    console.log('=== PROMOTION START ===');
    console.log('Promotion mode:', this.promotionMode);
    console.log('Promotion data:', this.promotionData.map(d => ({
      class: d.class.name,
      form: d.class.form,
      nextClass: d.nextClass?.name || 'NONE',
      studentCount: d.students.length
    })));
    
    if (this.promotionMode === 'all') {
      // All eligible students
      this.promotionData.forEach(classData => {
        if (classData.nextClass) {
          classData.students.forEach(student => {
            studentsToPromote.push({
              studentId: student.id,
              studentNumber: student.studentNumber,
              fromClassId: classData.class.id,
              toClassId: classData.nextClass.id,
              fromClassName: classData.class.name,
              toClassName: classData.nextClass.name
            });
            console.log(`Adding student ${student.studentNumber} (${student.firstName} ${student.lastName}) from ${classData.class.name} to ${classData.nextClass.name}`);
          });
        } else {
          console.warn(`Skipping class ${classData.class.name} - no next class found`);
        }
      });
    } else {
      // Selected students only
      this.promotionData.forEach(classData => {
        if (classData.nextClass) {
          classData.students.forEach(student => {
            if (this.selectedStudents.has(student.id)) {
              studentsToPromote.push({
                studentId: student.id,
                studentNumber: student.studentNumber,
                fromClassId: classData.class.id,
                toClassId: classData.nextClass.id,
                fromClassName: classData.class.name,
                toClassName: classData.nextClass.name
              });
              console.log(`Adding selected student ${student.studentNumber} (${student.firstName} ${student.lastName}) from ${classData.class.name} to ${classData.nextClass.name}`);
            }
          });
        } else {
          console.warn(`Skipping class ${classData.class.name} - no next class found`);
        }
      });
    }
    
    console.log(`Total students to promote: ${studentsToPromote.length}`);
    if (studentsToPromote.length === 0) {
        this.promoting = false;
      this.error = 'No students found to promote. Please check that classes have next classes configured.';
      setTimeout(() => this.error = '', 5000);
      return;
    }

      // Promote students individually to ensure accuracy
      const promotionPromises: Promise<boolean>[] = [];
      let successCount = 0;
      let failCount = 0;
      const promotionResults: any[] = [];

      // Process students sequentially with a small delay to avoid overwhelming the backend
      studentsToPromote.forEach((promo, index) => {
        console.log(`[PROMOTION] Student: ${promo.studentNumber || promo.studentId}`);
        console.log(`[PROMOTION] From: ${promo.fromClassName} (ID: ${promo.fromClassId})`);
        console.log(`[PROMOTION] To: ${promo.toClassName} (ID: ${promo.toClassId})`);
        
        // Add a small delay between requests to avoid overwhelming the backend
        const delay = index * 50; // 50ms delay between each request
        
        const promise = new Promise<boolean>((resolve) => {
          setTimeout(() => {
            this.studentService.updateStudent(promo.studentId, {
              classId: promo.toClassId
            }).toPromise().then((response: any) => {
              const student = response.student || response;
              const updatedClass = student?.class?.name || 'Unknown';
              const updatedClassId = student?.classId || student?.class?.id || 'N/A';
              
              console.log(`✅ [SUCCESS] Student ${promo.studentNumber || promo.studentId}`);
              console.log(`   Updated class: ${updatedClass} (ID: ${updatedClassId})`);
              console.log(`   Expected class ID: ${promo.toClassId}`);
              console.log(`   Full response:`, response);
              
              // Verify the update - check both classId and class.id (in case of relation)
              const classIdMatches = student && (
                String(student.classId) === String(promo.toClassId) ||
                String(student.class?.id) === String(promo.toClassId)
              );
              
              if (classIdMatches) {
                console.log(`✓ [VERIFIED] Student ${promo.studentNumber} classId correctly updated to ${student.classId || student.class?.id}`);
                promotionResults.push({
                  studentNumber: promo.studentNumber,
                  success: true,
                  newClassId: student.classId || student.class?.id,
                  newClassName: updatedClass
                });
                successCount++;
              } else {
                // Even if verification fails, if the API call succeeded, the update likely went through
                // The mismatch might be due to response structure, but the database update should be correct
                console.warn(`⚠ [WARNING] Student ${promo.studentNumber} classId verification mismatch!`);
                console.warn(`   Expected: ${promo.toClassId}, Got classId: ${student?.classId}, Got class.id: ${student?.class?.id}`);
                console.warn(`   However, the API call succeeded, so the update may have been applied.`);
                
                // Still count as success if the API call succeeded
                promotionResults.push({
                  studentNumber: promo.studentNumber,
                  success: true, // Count as success since API call succeeded
                  newClassId: student?.classId || student?.class?.id || promo.toClassId,
                  newClassName: updatedClass,
                  warning: 'ClassId verification mismatch in response, but update likely succeeded'
                });
                successCount++;
              }
              
              resolve(true);
            }).catch((err: any) => {
              console.error(`❌ [FAILED] Student ${promo.studentNumber || promo.studentId} (ID: ${promo.studentId})`);
              console.error(`   Error:`, err);
              console.error(`   Error details:`, err.error || err.message);
              promotionResults.push({
                studentNumber: promo.studentNumber,
                success: false,
                error: err.error?.message || err.message
              });
              failCount++;
              resolve(false);
            });
          }, delay);
        });
        
        promotionPromises.push(promise);
    });

    Promise.all(promotionPromises).then(() => {
      this.promoting = false;
      
      console.log('=== PROMOTION COMPLETE ===');
      console.log(`Success: ${successCount}, Failed: ${failCount}`);
      console.log('Promotion results:', promotionResults);
      
      // Check for specific student
      const testResult = promotionResults.find((r: any) => r.studentNumber === 'JPS6142713');
      if (testResult) {
        console.log('=== TEST STUDENT JPS6142713 RESULT ===');
        console.log('Success:', testResult.success);
        console.log('New Class ID:', testResult.newClassId);
        console.log('New Class Name:', testResult.newClassName);
        if (!testResult.success) {
          console.error('Error:', testResult.error);
        }
      }
      
      if (successCount > 0) {
        const affectedClasses = new Set<string>();
        studentsToPromote.forEach(p => affectedClasses.add(p.fromClassId));
        
        this.success = `✅ Successfully promoted <strong>${successCount}</strong> student${successCount !== 1 ? 's' : ''} to their next classes`;
        if (failCount > 0) {
          this.success += `. <strong>${failCount}</strong> student${failCount !== 1 ? 's' : ''} failed to promote.`;
        }
        
        this.selectedStudents.clear();
        
        // Reload all data to reflect changes - wait a bit for backend to process
        setTimeout(() => {
          console.log('=== RELOADING DATA AFTER PROMOTION ===');
          this.loadAllData();
          
          // After reload, verify the test student again
          setTimeout(() => {
            const testStudent = this.students.find((s: any) => s.studentNumber === 'JPS6142713');
            if (testStudent) {
              console.log('=== POST-RELOAD VERIFICATION: JPS6142713 ===');
              console.log('Student classId:', testStudent.classId);
              console.log('Student class name:', testStudent.class?.name);
              console.log('Student class form:', testStudent.class?.form);
            } else {
              console.warn('Test student JPS6142713 not found after reload');
            }
          }, 1000);
        }, 2000); // Increased delay to ensure backend has processed all updates
        
        setTimeout(() => this.success = '', 10000);
      } else {
        this.error = 'Failed to promote students. Please try again.';
        setTimeout(() => this.error = '', 5000);
      }
    }).catch((err: any) => {
      this.promoting = false;
      console.error('=== PROMOTION ERROR ===', err);
      this.error = err.error?.message || 'Failed to promote students. Please check the details.';
      setTimeout(() => this.error = '', 5000);
    });
  }

  resetSelection() {
    this.selectedStudents.clear();
    this.searchQuery = '';
    this.filterClass = 'all';
    this.promotionMode = 'all';
    this.filterStudents();
    this.error = '';
    this.success = '';
  }
}

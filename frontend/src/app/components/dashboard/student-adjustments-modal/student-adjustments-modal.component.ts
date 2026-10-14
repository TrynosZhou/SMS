import { Component, EventEmitter, Output, OnDestroy, Input, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { StudentService } from '../../../services/student.service';
import { AuthService } from '../../../services/auth.service';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

interface AdjustmentStudent {
  id: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  grade: string | null;
  classLevel: string | null;
  classEntity?: { name: string } | null;
  studentType: string;
  usesTransport: boolean;
  usesDiningHall: boolean;
  isStaffChild: boolean;
  isExempted: boolean;
}

@Component({
  standalone: false,
  selector: 'app-student-adjustments-modal',
  templateUrl: './student-adjustments-modal.component.html',
  styleUrls: ['./student-adjustments-modal.component.css']
})
export class StudentAdjustmentsModalComponent implements OnInit, OnChanges, OnDestroy {
  @Output() close = new EventEmitter<void>();
  @Input() studentId: string | null = null;

  searchQuery = '';
  searching = false;
  searchError = '';
  searchResults: AdjustmentStudent[] = [];
  selectedStudent: AdjustmentStudent | null = null;

  editing = false;
  saving = false;
  saveError = '';
  saveSuccess = '';

  formStudentType = 'Day Scholar';
  formUsesTransport = false;
  formUsesDiningHall = false;

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  @ViewChild('modalBody') modalBody!: ElementRef<HTMLDivElement>;

  constructor(
    private studentService: StudentService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    // Set up debounced search
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      this.performSearch(query);
    });
  }

  ngOnInit(): void {
    if (this.studentId) {
      this.loadStudentById(this.studentId);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['studentId']) {
      this.selectedStudent = null;
      this.searchResults = [];
      this.searchError = '';
      this.editing = false;
      this.saveSuccess = '';
      this.saveError = '';
      if (this.studentId) {
        this.loadStudentById(this.studentId);
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  canAdjust(): boolean {
    return this.authService.isAdmin() || this.authService.isAccountant();
  }

  closeModal(): void {
    this.close.emit();
  }

  private scrollToTop(): void {
    const el = this.modalBody?.nativeElement;
    if (el) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  refreshModal(): void {
    // Clear search results and errors
    this.searchResults = [];
    this.searchError = '';
    this.saveError = '';
    this.saveSuccess = '';
    this.searchQuery = '';

    // If a student was selected via studentId input, reload it
    if (this.studentId) {
      this.loadStudentById(this.studentId);
    } else {
      // Otherwise, just reset to search state
      this.selectedStudent = null;
      this.editing = false;
    }

    this.cdr.detectChanges();
  }

  searchStudents(): void {
    const q = this.searchQuery.trim();
    if (!q) {
      this.searchError = 'Please enter a First Name, Last Name, or Student ID.';
      this.searchResults = [];
      this.selectedStudent = null;
      this.cdr.detectChanges();
      this.scrollToTop();
      return;
    }
    this.searchSubject.next(q);
  }

  private performSearch(query: string): void {
    this.searching = true;
    this.searchError = '';
    this.searchResults = [];
    this.selectedStudent = null;
    this.cdr.detectChanges();

    this.studentService.getStudentsPaginated({ search: query, page: 1, limit: 50 }).subscribe({
      next: (response: any) => {
        this.searching = false;
        const data = Array.isArray(response?.data) ? response.data : [];
        if (data.length === 0) {
          this.searchError = 'No students found matching your search.';
        } else {
          this.searchResults = data.map((s: any) => ({
            id: s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            studentNumber: s.studentNumber,
            grade: s.grade || s.classLevel || null,
            classLevel: s.classLevel || s.grade || null,
            classEntity: s.classEntity || null,
            studentType: s.studentType || 'Day Scholar',
            usesTransport: s.usesTransport === true,
            usesDiningHall: s.usesDiningHall === true,
            isStaffChild: s.isStaffChild === true,
            isExempted: s.isExempted === true
          }));
        }
        this.cdr.detectChanges();
        this.scrollToTop();
      },
      error: (err: any) => {
        this.searching = false;
        this.searchError = err?.error?.message || 'Failed to search students. Please try again.';
        this.cdr.detectChanges();
        this.scrollToTop();
      }
    });
  }

  private loadStudentById(studentId: string): void {
    this.searching = true;
    this.searchError = '';
    this.searchResults = [];
    this.selectedStudent = null;
    this.editing = false;
    this.saveSuccess = '';
    this.saveError = '';
    this.cdr.detectChanges();

    this.studentService.getStudentById(studentId).subscribe({
      next: (response: any) => {
        this.searching = false;
        if (!response) {
          this.searchError = 'Student not found.';
        } else {
          this.selectedStudent = {
            id: response.id,
            firstName: response.firstName,
            lastName: response.lastName,
            studentNumber: response.studentNumber,
            grade: response.grade || response.classLevel || null,
            classLevel: response.classLevel || response.grade || null,
            classEntity: response.classEntity || null,
            studentType: response.studentType || 'Day Scholar',
            usesTransport: response.usesTransport === true,
            usesDiningHall: response.usesDiningHall === true,
            isStaffChild: response.isStaffChild === true,
            isExempted: response.isExempted === true
          };
        }
        this.cdr.detectChanges();
        this.scrollToTop();
      },
      error: (err: any) => {
        this.searching = false;
        this.searchError = err?.error?.message || 'Failed to load student. Please try again.';
        this.cdr.detectChanges();
        this.scrollToTop();
      }
    });
  }

  selectStudent(student: AdjustmentStudent): void {
    this.selectedStudent = student;
    this.searchResults = [];
    this.editing = false;
    this.saveSuccess = '';
    this.saveError = '';
    this.cdr.detectChanges();
    this.scrollToTop();
  }

  startEditing(): void {
    if (!this.selectedStudent) {
      return;
    }
    this.formStudentType = this.selectedStudent.studentType;
    this.formUsesTransport = this.selectedStudent.usesTransport;
    this.formUsesDiningHall = this.selectedStudent.usesDiningHall;
    this.editing = true;
    this.saveError = '';
    this.saveSuccess = '';
  }

  cancelEditing(): void {
    this.editing = false;
    this.saveError = '';
    this.saveSuccess = '';
  }

  get studentTypeDisplay(): string {
    return this.selectedStudent?.studentType === 'Boarder' ? 'Boarder' : 'Day Scholar';
  }

  get className(): string {
    return this.selectedStudent?.classEntity?.name || this.selectedStudent?.classLevel || '—';
  }

  saveAdjustments(): void {
    if (!this.selectedStudent || !this.canAdjust()) {
      return;
    }

    this.saving = true;
    this.saveError = '';
    this.saveSuccess = '';
    this.cdr.detectChanges();

    const payload: any = {
      studentType: this.formStudentType,
      usesTransport: this.formUsesTransport,
      usesDiningHall: this.formUsesDiningHall
    };

    this.studentService.updateStudent(this.selectedStudent.id, payload).subscribe({
      next: (response: any) => {
        this.saving = false;
        this.editing = false;

        const updated: AdjustmentStudent = {
          ...this.selectedStudent!,
          studentType: this.formStudentType,
          usesTransport: this.formUsesTransport,
          usesDiningHall: this.formUsesDiningHall
        };
        this.selectedStudent = updated;

        const parts: string[] = [];
        const logisticsSync = response?.logisticsInvoiceSync;
        if (logisticsSync) {
          if (logisticsSync.deltaTuition && Math.abs(logisticsSync.deltaTuition) >= 0.005) {
            parts.push(`Tuition adjusted by ${logisticsSync.deltaTuition > 0 ? '+' : ''}${Number(logisticsSync.deltaTuition).toFixed(2)}`);
          }
          if (logisticsSync.deltaTransport && Math.abs(logisticsSync.deltaTransport) >= 0.005) {
            parts.push(`Transport ${logisticsSync.deltaTransport > 0 ? 'added' : 'removed'} (${Math.abs(Number(logisticsSync.deltaTransport)).toFixed(2)})`);
          }
          if (logisticsSync.deltaDiningHall && Math.abs(logisticsSync.deltaDiningHall) >= 0.005) {
            parts.push(`Dining Hall ${logisticsSync.deltaDiningHall > 0 ? 'added' : 'removed'} (${Math.abs(Number(logisticsSync.deltaDiningHall)).toFixed(2)})`);
          }
          if (logisticsSync.updatedInvoices) {
            parts.push(`${logisticsSync.updatedInvoices} invoice(s) updated`);
          }
        }

        this.saveSuccess = parts.length > 0
          ? `Adjustments saved. ${parts.join('; ')}.`
          : 'Adjustments saved successfully. Invoice balances have been updated automatically.';
        this.cdr.detectChanges();
        this.scrollToTop();
      },
      error: (err: any) => {
        this.saving = false;
        this.saveError = err?.error?.message || 'Failed to save adjustments. Please try again.';
        this.cdr.detectChanges();
        this.scrollToTop();
      }
    });
  }

  backToSearch(): void {
    this.selectedStudent = null;
    this.editing = false;
    this.searchResults = [];
    this.saveError = '';
    this.saveSuccess = '';
    this.studentId = null;
  }
}

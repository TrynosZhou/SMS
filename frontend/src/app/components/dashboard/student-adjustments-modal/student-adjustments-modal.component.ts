import { Component, EventEmitter, Output, Input, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { StudentService } from '../../../services/student.service';
import { AuthService } from '../../../services/auth.service';
import { FinanceService } from '../../../services/finance.service';
import { SettingsService } from '../../../services/settings.service';

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
  exemptionType: string | null;
  exemptionAmount: number | null;
  exemptionPercent: number | null;
}

@Component({
  standalone: false,
  selector: 'app-student-adjustments-modal',
  templateUrl: './student-adjustments-modal.component.html',
  styleUrls: ['./student-adjustments-modal.component.css']
})
export class StudentAdjustmentsModalComponent implements OnInit, OnChanges {
  @Output() close = new EventEmitter<void>();
  @Input() studentId: string | null = null;

  searchQuery = '';
  searching = false;
  searchError = '';
  searchResults: AdjustmentStudent[] = [];
  selectedStudent: AdjustmentStudent | null = null;
  studentBalance: number | null = null;
  loadingBalance = false;
  balanceError = '';
  currencySymbol = 'USD';

  editing = false;
  saving = false;
  saveError = '';
  saveSuccess = '';

  formStudentType = 'Day Scholar';
  formUsesTransport = false;
  formUsesDiningHall = false;
  formIsExempted = false;
  formExemptionType: string | null = null;
  formExemptionAmount = '';
  formExemptionPercent = '';

  // Credit / Debit Note popup state
  showAdjustmentNote = false;
  noteType: 'credit' | 'debit' = 'credit';
  noteAmount = '';
  noteReason = '';
  noteSaving = false;
  noteError = '';

  // Exemption popup state
  showExemptionPopup = false;
  exemptionSaving = false;
  exemptionError = '';

  @ViewChild('modalBody') modalBody!: ElementRef<HTMLDivElement>;

  constructor(
    private studentService: StudentService,
    private authService: AuthService,
    private financeService: FinanceService,
    private settingsService: SettingsService,
    private cdr: ChangeDetectorRef
  ) {
    this.loadCurrencySymbol();
  }

  ngOnInit(): void {
    if (this.studentId) {
      this.loadStudentById(this.studentId);
    }
  }

  private loadCurrencySymbol(): void {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        const currency = String(settings?.currencySymbol || '').trim();
        if (currency) {
          this.currencySymbol = currency;
        }
      },
      error: () => {
        // Keep default USD
      }
    });
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

  canAdjust(): boolean {
    return this.authService.isAdmin() || this.authService.isAccountant();
  }

  /** Only administrators and super-administrators may issue credit/debit notes. */
  canIssueNote(): boolean {
    return this.authService.isAdmin() || this.authService.isSuperAdmin();
  }

  openAdjustmentNote(type: 'credit' | 'debit'): void {
    if (!this.selectedStudent || !this.canIssueNote()) {
      return;
    }
    this.noteType = type;
    this.noteAmount = '';
    this.noteReason = '';
    this.noteError = '';
    this.showAdjustmentNote = true;
    this.cdr.detectChanges();
  }

  closeAdjustmentNote(): void {
    this.showAdjustmentNote = false;
    this.noteSaving = false;
    this.noteError = '';
    this.cdr.detectChanges();
  }

  openExemptionPopup(): void {
    if (!this.selectedStudent || !this.canAdjust()) {
      return;
    }
    this.formExemptionType = this.selectedStudent.exemptionType || 'fixed';
    this.formExemptionAmount = this.selectedStudent.exemptionAmount ? String(this.selectedStudent.exemptionAmount) : '';
    this.formExemptionPercent = this.selectedStudent.exemptionPercent ? String(this.selectedStudent.exemptionPercent) : '';
    this.exemptionError = '';
    this.showExemptionPopup = true;
    this.cdr.detectChanges();
  }

  closeExemptionPopup(): void {
    this.showExemptionPopup = false;
    this.exemptionSaving = false;
    this.exemptionError = '';
    // Reset form is exempted if popup was cancelled
    if (!this.formIsExempted) {
      this.formExemptionType = null;
      this.formExemptionAmount = '';
      this.formExemptionPercent = '';
    }
    this.cdr.detectChanges();
  }

  saveExemption(): void {
    if (!this.selectedStudent) {
      return;
    }

    const type = this.formExemptionType;
    if (!type) {
      this.exemptionError = 'Please select an exemption type.';
      return;
    }

    if (type === 'fixed') {
      const amount = parseFloat(this.formExemptionAmount);
      if (!isFinite(amount) || amount <= 0) {
        this.exemptionError = 'Please enter a valid exemption amount.';
        return;
      }
      this.formExemptionPercent = '';
    } else if (type === 'percentage') {
      const percent = parseFloat(this.formExemptionPercent);
      if (!isFinite(percent) || percent <= 0 || percent > 100) {
        this.exemptionError = 'Please enter a valid percentage (0-100).';
        return;
      }
      this.formExemptionAmount = '';
    } else if (type === 'staff_sibling') {
      this.formExemptionAmount = '';
      this.formExemptionPercent = '';
    }

    this.exemptionSaving = true;
    this.exemptionError = '';

    const payload: any = {
      isExempted: true,
      exemptionType: type,
      exemptionAmount: this.formExemptionAmount ? parseFloat(this.formExemptionAmount) : null,
      exemptionPercent: this.formExemptionPercent ? parseFloat(this.formExemptionPercent) : null
    };

    this.studentService.updateStudent(this.selectedStudent.id, payload).subscribe({
      next: (response: any) => {
        this.exemptionSaving = false;
        this.showExemptionPopup = false;
        this.formIsExempted = true;

        if (this.selectedStudent) {
          this.selectedStudent.isExempted = true;
          this.selectedStudent.exemptionType = type;
          this.selectedStudent.exemptionAmount = payload.exemptionAmount;
          this.selectedStudent.exemptionPercent = payload.exemptionPercent;
        }

        this.saveSuccess = 'Exemption settings saved successfully.';
        this.saveError = '';
        this.cdr.detectChanges();
        this.scrollToTop();
        // Refresh balance after exemption change
        if (this.selectedStudent) {
          this.loadStudentBalance(this.selectedStudent.id);
        }
      },
      error: (err: any) => {
        this.exemptionSaving = false;
        this.exemptionError = err?.error?.message || 'Failed to save exemption settings. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }

  onExemptionToggleChange(): void {
    if (this.formIsExempted) {
      this.openExemptionPopup();
    } else {
      // If disabling exemption, confirm and update
      if (this.selectedStudent && this.selectedStudent.isExempted) {
        this.saving = true;
        this.saveError = '';

        const payload: any = {
          isExempted: false,
          exemptionType: null,
          exemptionAmount: null,
          exemptionPercent: null
        };

        this.studentService.updateStudent(this.selectedStudent.id, payload).subscribe({
          next: () => {
            this.saving = false;
            if (this.selectedStudent) {
              this.selectedStudent.isExempted = false;
              this.selectedStudent.exemptionType = null;
              this.selectedStudent.exemptionAmount = null;
              this.selectedStudent.exemptionPercent = null;
            }
            this.saveSuccess = 'Exemption removed successfully.';
            this.cdr.detectChanges();
            this.scrollToTop();
            // Refresh balance after exemption removal
            if (this.selectedStudent) {
              this.loadStudentBalance(this.selectedStudent.id);
            }
          },
          error: (err: any) => {
            this.saving = false;
            this.saveError = err?.error?.message || 'Failed to remove exemption. Please try again.';
            this.formIsExempted = true; // Revert toggle
            this.cdr.detectChanges();
          }
        });
      }
    }
  }

  submitAdjustmentNote(): void {
    if (!this.selectedStudent) {
      return;
    }
    const amount = parseFloat(this.noteAmount);
    if (!isFinite(amount) || amount <= 0) {
      this.noteError = 'Please enter a valid positive amount.';
      return;
    }
    const reason = this.noteReason.trim();
    if (!reason) {
      this.noteError = 'Please provide a reason for this adjustment.';
      return;
    }

    this.noteSaving = true;
    this.noteError = '';

    this.studentService.applyAdjustmentNote(this.selectedStudent.id, {
      type: this.noteType,
      amount,
      reason
    }).subscribe({
      next: (response: any) => {
        this.noteSaving = false;
        this.showAdjustmentNote = false;
        const label = this.noteType === 'credit' ? 'Credit Note' : 'Debit Note';
        const inv = response?.invoice;
        const balanceStr = inv != null && inv.balance != null ? ` New balance: ${Number(inv.balance).toFixed(2)}.` : '';
        this.saveSuccess = `${label} of ${amount.toFixed(2)} applied successfully.${balanceStr}`;
        this.saveError = '';
        this.cdr.detectChanges();
        this.scrollToTop();
        // Refresh balance after credit/debit note
        if (this.selectedStudent) {
          this.loadStudentBalance(this.selectedStudent.id);
        }
      },
      error: (err: any) => {
        this.noteSaving = false;
        this.noteError = err?.error?.message || 'Failed to apply adjustment note. Please try again.';
        this.cdr.detectChanges();
      }
    });
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
    this.performSearch(q);
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
            isExempted: s.isExempted === true,
            exemptionType: s.exemptionType || null,
            exemptionAmount: s.exemptionAmount || null,
            exemptionPercent: s.exemptionPercent || null
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
    this.studentBalance = null;
    this.balanceError = '';
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
            isExempted: response.isExempted === true,
            exemptionType: response.exemptionType || null,
            exemptionAmount: response.exemptionAmount || null,
            exemptionPercent: response.exemptionPercent || null
          };
          this.loadStudentBalance(studentId);
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
    this.studentBalance = null;
    this.balanceError = '';
    this.cdr.detectChanges();
    this.scrollToTop();
    this.loadStudentBalance(student.id);
  }

  startEditing(): void {
    if (!this.selectedStudent) {
      return;
    }
    this.formStudentType = this.selectedStudent.studentType;
    this.formUsesTransport = this.selectedStudent.usesTransport;
    this.formUsesDiningHall = this.selectedStudent.usesDiningHall;
    this.formIsExempted = this.selectedStudent.isExempted;
    this.formExemptionType = this.selectedStudent.exemptionType;
    this.formExemptionAmount = this.selectedStudent.exemptionAmount ? String(this.selectedStudent.exemptionAmount) : '';
    this.formExemptionPercent = this.selectedStudent.exemptionPercent ? String(this.selectedStudent.exemptionPercent) : '';
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

  get formattedBalance(): string {
    if (this.studentBalance === null || this.studentBalance === undefined || typeof this.studentBalance !== 'number') {
      return '';
    }
    const value = Math.abs(this.studentBalance);
    const sign = this.studentBalance < 0 ? '-' : '';
    return `${sign}${this.currencySymbol}${value.toFixed(2)}`;
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
        // Refresh balance after adjustments
        if (this.selectedStudent) {
          this.loadStudentBalance(this.selectedStudent.id);
        }
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
    this.studentBalance = null;
    this.balanceError = '';
  }

  private loadStudentBalance(studentId: string): void {
    this.loadingBalance = true;
    this.balanceError = '';
    this.studentBalance = null;

    this.financeService.getStudentBalance(studentId).subscribe({
      next: (response: any) => {
        this.loadingBalance = false;
        // Try multiple possible response structures
        this.studentBalance = response?.balance ?? response?.totalBalance ?? response?.amount ?? null;
        console.log('Balance response:', response, 'Parsed balance:', this.studentBalance);
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.loadingBalance = false;
        this.balanceError = err?.error?.message || 'Failed to load balance';
        console.error('Balance error:', err);
        this.cdr.detectChanges();
      }
    });
  }
}

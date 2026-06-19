import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ParentService } from '../../../services/parent.service';
import { AuthService } from '../../../services/auth.service';
import { PermissionService } from '../../../services/permission.service';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { activatePageLoad } from '../../../utils/route-activation';
import { validatePhoneNumber } from '../../../utils/phone-validator';

@Component({
  standalone: false,  selector: 'app-parent-management',
templateUrl: './parent-management.component.html',
  styleUrls: ['./parent-management.component.css']
})
export class ParentManagementComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  parents: any[] = [];
  filteredParents: any[] = [];
  selectedParent: any = null;
  unlinkedParentsCount = 0;
  linkedStudentsTotalCount = 0;
  /** Count of students who have created a student account and have logged in at least once */
  studentsWithAccountLoggedInCount = 0;
  loading = false;
  savingParent = false;
  deletingParent = false;
  linking = false;
  unlinking = false;
  searchingStudents = false;
  error = '';
  success = '';
  parentSearchQuery = '';
  studentSearchQuery = '';
  studentsSearchResults: any[] = [];
  selectedStudentIds: Set<string> = new Set<string>();
  relationshipType = 'guardian';
  editMode = false;
  editParent: any = null;
  phoneNumberError = '';
  emailError = '';

  activeAdminTab: 'manage' | 'create' | 'reset' = 'manage';

  createParentForm = {
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    address: '',
    gender: '',
    createAccount: true,
    generatePassword: true,
    password: ''
  };
  creatingParent = false;
  createdParentTempPassword = '';

  resetParentEmail = '';
  resetParentGeneratePassword = true;
  resetParentNewPassword = '';
  resettingParentPassword = false;
  resetParentTempPassword = '';
  /** Email autocomplete: suggestions from database as admin types */
  resetParentEmailSuggestions: { id: string; email: string; firstName: string; lastName: string }[] = [];
  resetParentEmailSearching = false;
  private resetParentEmailSearchTimeout: any = null;
  private alertDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private parentsLoadInFlight = false;

  constructor(
    private parentService: ParentService,
    private authService: AuthService,
    private permissionService: PermissionService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  get dashboardStats() {
    const withStudents = this.parents.filter(p => (p?.parentStudents || []).length > 0).length;
    return {
      total: this.parents.length,
      showing: this.filteredParents.length,
      unlinked: this.unlinkedParentsCount,
      linkedStudents: this.linkedStudentsTotalCount,
      studentAccounts: this.studentsWithAccountLoggedInCount,
      withStudents
    };
  }

  clearAlert(type: 'success' | 'error'): void {
    if (type === 'success') {
      this.success = '';
    } else {
      this.error = '';
    }
    if (this.alertDismissTimer) {
      clearTimeout(this.alertDismissTimer);
      this.alertDismissTimer = null;
    }
    this.cdr.markForCheck();
  }

  private scheduleAlertDismiss(field: 'error' | 'success', ms: number): void {
    if (this.alertDismissTimer) {
      clearTimeout(this.alertDismissTimer);
    }
    this.alertDismissTimer = setTimeout(() => {
      this[field] = '';
      this.alertDismissTimer = null;
      this.cdr.markForCheck();
    }, ms);
  }

  private showError(message: string, autoDismissMs = 7000): void {
    this.error = message;
    this.cdr.markForCheck();
    if (autoDismissMs > 0) {
      this.scheduleAlertDismiss('error', autoDismissMs);
    }
  }

  private showSuccess(message: string, autoDismissMs = 7000): void {
    this.success = message;
    this.cdr.markForCheck();
    if (autoDismissMs > 0) {
      this.scheduleAlertDismiss('success', autoDismissMs);
    }
  }

  refreshParents(): void {
    this.loadParents(false, true);
  }

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (!user || !this.permissionService.canAccessModule('parents')) {
      this.router.navigate(['/dashboard']);
      return;
    }
    activatePageLoad(this.router, this.destroy$, '/admin/parents', () => this.loadParents());
  }

  ngOnDestroy(): void {
    if (this.alertDismissTimer) {
      clearTimeout(this.alertDismissTimer);
    }
    if (this.resetParentEmailSearchTimeout) {
      clearTimeout(this.resetParentEmailSearchTimeout);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadParents(silent = false, clearAlerts = false) {
    if (this.parentsLoadInFlight && !silent) {
      return;
    }
    if (!silent) {
      this.loading = true;
      this.parentsLoadInFlight = true;
      if (clearAlerts) {
        this.error = '';
        this.success = '';
      }
    }
    const previousParents = this.parents || [];
    this.parentService.getAllParentsAdmin().pipe(
      finalize(() => {
        if (!silent) {
          this.loading = false;
          this.parentsLoadInFlight = false;
        }
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (response: any) => {
        const incomingParents = response.parents || [];

        // Some endpoints/environments may not consistently include parentStudents.
        // Preserve any existing parentStudents we already have in memory.
        const previousById = new Map<string, any>(previousParents.map(p => [p.id, p]));
        this.parents = incomingParents.map((p: any) => {
          const prev = previousById.get(p.id);
          if (p && (p.parentStudents === undefined || p.parentStudents === null) && prev?.parentStudents) {
            return { ...p, parentStudents: prev.parentStudents };
          }
          return p;
        });

        this.unlinkedParentsCount = this.parents.filter(p => (p?.parentStudents || []).length === 0).length;
        this.linkedStudentsTotalCount = this.parents.reduce((sum, p) => sum + ((p?.parentStudents || []).length), 0);
        this.studentsWithAccountLoggedInCount = response.studentsWithAccountLoggedInCount ?? 0;
        this.filteredParents = this.parentSearchQuery ? this.filteredParents : this.parents;
        if (this.parentSearchQuery) {
          this.filterParents();
        }
        this.cdr.markForCheck();
        if (this.selectedParent) {
          const updated = this.parents.find(p => p.id === this.selectedParent.id);
          if (updated) {
            // Ensure we never wipe linked students on refresh
            const mergedSelected = {
              ...updated,
              parentStudents: (updated.parentStudents ?? this.selectedParent.parentStudents ?? [])
            };
            this.selectedParent = mergedSelected;
            if (this.editMode) {
              this.editParent = { ...mergedSelected };
            }
          } else {
            this.clearSelectedParent();
          }
        }
      },
      error: (err: any) => {
        const status = err?.status ?? 0;
        const msg = status === 0 || status === 502
          ? 'Backend unavailable. Run the backend with npm run dev in the backend folder (port 3000).'
          : (err.error?.message || 'Failed to load parents');
        this.showError(msg);
      }
    });
  }

  selectParent(parent: any) {
    this.selectedParent = parent;
    this.editMode = false;
    this.editParent = { ...parent };
    this.studentsSearchResults = [];
    this.selectedStudentIds = new Set<string>();
    this.relationshipType = 'guardian';
    this.phoneNumberError = '';
    this.emailError = '';
  }

  clearSelectedParent() {
    this.selectedParent = null;
    this.editMode = false;
    this.editParent = null;
    this.studentsSearchResults = [];
    this.selectedStudentIds = new Set<string>();
    this.relationshipType = 'guardian';
    this.phoneNumberError = '';
    this.emailError = '';
  }

  setAdminTab(tab: 'manage' | 'create' | 'reset') {
    this.activeAdminTab = tab;
    this.error = '';
    this.success = '';
    this.createdParentTempPassword = '';
    this.resetParentTempPassword = '';
  }

  createParentAccount() {
    this.error = '';
    this.success = '';
    this.createdParentTempPassword = '';

    const firstName = (this.createParentForm.firstName || '').trim();
    const lastName = (this.createParentForm.lastName || '').trim();
    const email = (this.createParentForm.email || '').trim();
    if (!firstName || !lastName || !email) {
      this.error = 'First name, last name, and email are required';
      this.cdr.markForCheck();
      setTimeout(() => this.error = '', 5000);
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      this.error = 'Please enter a valid email address';
      this.cdr.markForCheck();
      setTimeout(() => this.error = '', 5000);
      return;
    }

    const phone = (this.createParentForm.phoneNumber || '').trim();
    if (phone) {
      const phoneResult = validatePhoneNumber(phone, false);
      if (!phoneResult.isValid) {
        this.error = phoneResult.error || 'Please enter a valid phone number';
        this.cdr.markForCheck();
        setTimeout(() => this.error = '', 5000);
        return;
      }
    }

    if (this.createParentForm.createAccount && !this.createParentForm.generatePassword) {
      const pw = (this.createParentForm.password || '').trim();
      if (!pw) {
        this.error = 'Password is required';
        this.cdr.markForCheck();
        setTimeout(() => this.error = '', 5000);
        return;
      }
      if (pw.length < 8) {
        this.error = 'Password must be at least 8 characters long';
        this.cdr.markForCheck();
        setTimeout(() => this.error = '', 5000);
        return;
      }
    }

    this.creatingParent = true;
    this.cdr.markForCheck();
    this.parentService.adminCreateParent({
      firstName,
      lastName,
      email,
      phoneNumber: phone || null,
      address: (this.createParentForm.address || '').trim() || null,
      gender: (this.createParentForm.gender || '').trim() || null,
      createAccount: !!this.createParentForm.createAccount,
      generatePassword: !!this.createParentForm.generatePassword,
      password: (this.createParentForm.password || '').trim() || undefined
    }).pipe(
      finalize(() => {
        this.creatingParent = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (res: any) => {
        this.showSuccess(res?.message || 'Parent created successfully');
        const temp = res?.temporaryCredentials?.password;
        this.createdParentTempPassword = (typeof temp === 'string' ? temp : '') || '';

        const createdParent = res?.parent;
        if (createdParent?.id) {
          const withLinks = { ...createdParent, parentStudents: [] };
          this.parents = [withLinks, ...this.parents.filter(p => p.id !== withLinks.id)];
          this.filteredParents = this.parentSearchQuery ? this.filteredParents : this.parents;
          if (this.parentSearchQuery) {
            this.filterParents();
          }
          this.unlinkedParentsCount = this.parents.filter(p => (p?.parentStudents || []).length === 0).length;
        }

        this.createParentForm = {
          firstName: '',
          lastName: '',
          email: '',
          phoneNumber: '',
          address: '',
          gender: '',
          createAccount: true,
          generatePassword: true,
          password: ''
        };

        this.loadParents(true);
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        const status = err?.status ?? 0;
        const msg = status === 0 || status === 502
          ? 'Backend unavailable. Run the backend with npm run dev in the backend folder (port 3000).'
          : (err.error?.message || 'Failed to create parent');
        this.showError(msg);
      }
    });
  }

  onResetParentEmailInput() {
    const q = (this.resetParentEmail || '').trim();
    if (this.resetParentEmailSearchTimeout) clearTimeout(this.resetParentEmailSearchTimeout);
    if (q.length < 2) {
      this.resetParentEmailSuggestions = [];
      return;
    }
    this.resetParentEmailSearchTimeout = setTimeout(() => {
      this.resetParentEmailSearchTimeout = null;
      this.resetParentEmailSearching = true;
      this.parentService.searchParentEmails(q).subscribe({
        next: (res) => {
          this.resetParentEmailSearching = false;
          this.resetParentEmailSuggestions = Array.isArray(res?.parents) ? res.parents : [];
        },
        error: () => {
          this.resetParentEmailSearching = false;
          this.resetParentEmailSuggestions = [];
        }
      });
    }, 300);
  }

  selectResetParentEmail(item: { email: string }) {
    this.resetParentEmail = item.email || '';
    this.resetParentEmailSuggestions = [];
  }

  resetParentAccountPassword() {
    this.error = '';
    this.success = '';
    this.resetParentTempPassword = '';

    const email = (this.resetParentEmail || '').trim();
    if (!email) {
      this.error = 'Email is required';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    const generatePassword = !!this.resetParentGeneratePassword;
    const newPassword = (this.resetParentNewPassword || '').trim();
    if (!generatePassword && !newPassword) {
      this.error = 'New password is required';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    this.resettingParentPassword = true;
    this.cdr.markForCheck();
    this.parentService.adminResetParentPassword({
      email,
      generatePassword,
      newPassword: generatePassword ? undefined : newPassword
    }).pipe(
      finalize(() => {
        this.resettingParentPassword = false;
        this.cdr.markForCheck();
      })
    ).subscribe({
      next: (res: any) => {
        this.showSuccess(res?.message || 'Password reset successfully');
        const temp = res?.temporaryCredentials?.password;
        this.resetParentTempPassword = (typeof temp === 'string' ? temp : '') || '';
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        const status = err?.status ?? 0;
        const msg = status === 0 || status === 502
          ? 'Backend unavailable. Run the backend with npm run dev in the backend folder (port 3000).'
          : (err.error?.message || 'Failed to reset password');
        this.showError(msg);
      }
    });
  }

  filterParents() {
    const query = this.parentSearchQuery.toLowerCase();
    if (!query) {
      this.filteredParents = this.parents;
      return;
    }
    this.filteredParents = this.parents.filter(p =>
      (p.firstName || '').toLowerCase().includes(query) ||
      (p.lastName || '').toLowerCase().includes(query) ||
      (p.email || '').toLowerCase().includes(query) ||
      (p.phoneNumber || '').toLowerCase().includes(query)
    );
  }

  clearSearch() {
    this.parentSearchQuery = '';
    this.filterParents();
  }

  startEditParent() {
    if (!this.selectedParent) {
      return;
    }
    this.editMode = true;
    this.editParent = { ...this.selectedParent };
    this.phoneNumberError = '';
    this.emailError = '';
  }

  cancelEditParent() {
    if (!this.selectedParent) {
      this.editMode = false;
      this.editParent = null;
      return;
    }
    this.editMode = false;
    this.editParent = { ...this.selectedParent };
    this.phoneNumberError = '';
    this.emailError = '';
  }

  saveParentChanges() {
    if (!this.selectedParent || !this.editParent) {
      return;
    }

    this.error = '';
    this.success = '';
    this.phoneNumberError = '';
    this.emailError = '';

    if (!this.editParent.firstName || !this.editParent.lastName) {
      this.error = 'First name and last name are required';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    if (this.editParent.phoneNumber && this.editParent.phoneNumber.trim()) {
      const phoneResult = validatePhoneNumber(this.editParent.phoneNumber, false);
      if (!phoneResult.isValid) {
        this.phoneNumberError = phoneResult.error || 'Invalid phone number';
        this.error = phoneResult.error || 'Please enter a valid phone number';
        setTimeout(() => this.error = '', 5000);
        return;
      }
      if (phoneResult.normalized) {
        this.editParent.phoneNumber = phoneResult.normalized;
      }
    }

    if (this.editParent.email && this.editParent.email.trim()) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(this.editParent.email.trim())) {
        this.emailError = 'Please enter a valid email address';
        this.error = 'Please enter a valid email address';
        setTimeout(() => this.error = '', 5000);
        return;
      }
    }

    const payload = {
      firstName: this.editParent.firstName,
      lastName: this.editParent.lastName,
      phoneNumber: this.editParent.phoneNumber || null,
      address: this.editParent.address || null,
      email: this.editParent.email || null,
      gender: this.editParent.gender || null
    };

    this.savingParent = true;
    this.parentService.updateParentAdmin(this.selectedParent.id, payload).subscribe({
      next: (response: any) => {
        this.savingParent = false;
        this.success = response.message || 'Parent updated successfully';
        this.editMode = false;
        this.loadParents();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.savingParent = false;
        this.error = err.error?.message || 'Failed to update parent';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  deleteSelectedParent() {
    if (!this.selectedParent) {
      return;
    }
    if (!confirm('Are you sure you want to delete this parent record? This cannot be undone.')) {
      return;
    }
    this.deletingParent = true;
    this.error = '';
    this.success = '';
    this.parentService.deleteParentAdmin(this.selectedParent.id).subscribe({
      next: (response: any) => {
        this.deletingParent = false;
        this.success = response.message || 'Parent deleted successfully';
        this.clearSelectedParent();
        this.loadParents();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.deletingParent = false;
        this.error = err.error?.message || 'Failed to delete parent';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  searchStudents() {
    if (!this.selectedParent) {
      this.error = 'Please select a parent first';
      setTimeout(() => this.error = '', 5000);
      return;
    }
    if (!this.studentSearchQuery || !this.studentSearchQuery.trim()) {
      this.error = 'Enter a Student ID or name to search';
      setTimeout(() => this.error = '', 5000);
      return;
    }
    this.searchingStudents = true;
    this.studentsSearchResults = [];
    this.selectedStudentIds = new Set<string>();
    this.parentService.searchStudents(this.studentSearchQuery.trim()).subscribe({
      next: (response: any) => {
        this.studentsSearchResults = response.students || [];
        this.selectedStudentIds = new Set<string>();
        this.searchingStudents = false;
      },
      error: (err: any) => {
        this.searchingStudents = false;
        this.error = err.error?.message || 'Failed to search students';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  toggleStudentSelection(student: any) {
    if (this.selectedStudentIds.has(student.id)) {
      this.selectedStudentIds.delete(student.id);
    } else {
      this.selectedStudentIds.add(student.id);
    }
    // Trigger change detection
    this.selectedStudentIds = new Set(this.selectedStudentIds);
  }

  toggleAllStudents() {
    const alreadyLinkedIds = new Set(
      (this.selectedParent?.parentStudents || []).map((l: any) => l?.student?.id)
    );
    const linkable = this.studentsSearchResults.filter(s => !alreadyLinkedIds.has(s.id));
    if (linkable.every(s => this.selectedStudentIds.has(s.id))) {
      linkable.forEach(s => this.selectedStudentIds.delete(s.id));
    } else {
      linkable.forEach(s => this.selectedStudentIds.add(s.id));
    }
    this.selectedStudentIds = new Set(this.selectedStudentIds);
  }

  isAlreadyLinked(studentId: string): boolean {
    return (this.selectedParent?.parentStudents || []).some((l: any) => l?.student?.id === studentId);
  }

  get allLinkableSelected(): boolean {
    if (!this.studentsSearchResults.length) return false;
    const linkable = this.studentsSearchResults.filter(s => !this.isAlreadyLinked(s.id));
    return linkable.length > 0 && linkable.every(s => this.selectedStudentIds.has(s.id));
  }

  get allLinkableDisabled(): boolean {
    return this.studentsSearchResults.length > 0 &&
      this.studentsSearchResults.every(s => this.isAlreadyLinked(s.id));
  }

  onStudentRowClick(student: any) {
    if (!this.isAlreadyLinked(student.id)) {
      this.toggleStudentSelection(student);
    }
  }

  linkSelectedStudents() {
    if (!this.selectedParent) {
      this.error = 'Please select a parent first';
      setTimeout(() => this.error = '', 5000);
      return;
    }
    if (this.selectedStudentIds.size === 0) {
      this.error = 'Please select at least one student to link';
      setTimeout(() => this.error = '', 5000);
      return;
    }

    this.linking = true;
    this.success = '';
    this.error = '';

    const ids = Array.from(this.selectedStudentIds);
    const relationship = this.relationshipType || 'guardian';
    let completed = 0;
    let failed = 0;
    const linked: any[] = [];

    const linkNext = (index: number) => {
      if (index >= ids.length) {
        this.linking = false;
        if (failed === 0) {
          this.success = ids.length === 1
            ? 'Student linked successfully'
            : `${ids.length} students linked successfully`;
        } else {
          this.success = `${completed} linked, ${failed} failed.`;
          this.error = `${failed} student(s) could not be linked. They may already be linked or an error occurred.`;
        }

        // Update UI immediately
        const existingLinks = Array.isArray(this.selectedParent?.parentStudents)
          ? this.selectedParent.parentStudents
          : [];
        const wasUnlinked = existingLinks.length === 0;
        this.selectedParent = {
          ...this.selectedParent,
          parentStudents: [
            ...existingLinks,
            ...linked.map(s => ({ student: s, relationshipType: relationship }))
          ]
        };
        if (wasUnlinked && linked.length > 0 && this.unlinkedParentsCount > 0) {
          this.unlinkedParentsCount--;
        }

        this.selectedStudentIds = new Set<string>();
        this.studentSearchQuery = '';
        this.studentsSearchResults = [];

        this.loadParents();
        setTimeout(() => { this.success = ''; this.error = ''; }, 6000);
        return;
      }

      const studentId = ids[index];
      this.parentService.adminLinkStudentToParent(
        this.selectedParent.id,
        studentId,
        relationship
      ).subscribe({
        next: () => {
          completed++;
          const student = this.studentsSearchResults.find(s => s.id === studentId);
          if (student) linked.push(student);
          linkNext(index + 1);
        },
        error: () => {
          failed++;
          linkNext(index + 1);
        }
      });
    };

    linkNext(0);
  }

  unlinkStudent(link: any) {
    if (!this.selectedParent) {
      return;
    }
    if (!confirm('Are you sure you want to unlink this student from the parent?')) {
      return;
    }
    this.unlinking = true;
    this.error = '';
    this.success = '';
    this.parentService.adminUnlinkStudentFromParent(link.id).subscribe({
      next: () => {
        this.unlinking = false;
        this.success = 'Student unlinked successfully';
        this.loadParents();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.unlinking = false;
        this.error = err.error?.message || 'Failed to unlink student';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }
}

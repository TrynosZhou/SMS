import { Component, OnInit } from '@angular/core';
import { ParentService } from '../../../services/parent.service';
import { AuthService } from '../../../services/auth.service';
import { Router } from '@angular/router';
import { validatePhoneNumber } from '../../../utils/phone-validator';

@Component({
  selector: 'app-parent-management',
  templateUrl: './parent-management.component.html',
  styleUrls: ['./parent-management.component.css']
})
export class ParentManagementComponent implements OnInit {
  parents: any[] = [];
  filteredParents: any[] = [];
  selectedParent: any = null;
  unlinkedParentsCount = 0;
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
  selectedStudentId: string | null = null;
  relationshipType = 'guardian';
  editMode = false;
  editParent: any = null;
  phoneNumberError = '';
  emailError = '';

  constructor(
    private parentService: ParentService,
    private authService: AuthService,
    private router: Router
  ) { }

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.loadParents();
  }

  loadParents() {
    this.loading = true;
    this.error = '';
    const previousParents = this.parents || [];
    this.parentService.getAllParentsAdmin().subscribe({
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
        this.filteredParents = this.parents;
        this.loading = false;
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
        this.loading = false;
        this.error = err.error?.message || 'Failed to load parents';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  selectParent(parent: any) {
    this.selectedParent = parent;
    this.editMode = false;
    this.editParent = { ...parent };
    this.studentsSearchResults = [];
    this.selectedStudentId = null;
    this.relationshipType = 'guardian';
    this.phoneNumberError = '';
    this.emailError = '';
  }

  clearSelectedParent() {
    this.selectedParent = null;
    this.editMode = false;
    this.editParent = null;
    this.studentsSearchResults = [];
    this.selectedStudentId = null;
    this.relationshipType = 'guardian';
    this.phoneNumberError = '';
    this.emailError = '';
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
      email: this.editParent.email || null
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
    this.selectedStudentId = null;
    this.parentService.searchStudents(this.studentSearchQuery.trim()).subscribe({
      next: (response: any) => {
        this.studentsSearchResults = response.students || [];
        this.searchingStudents = false;
      },
      error: (err: any) => {
        this.searchingStudents = false;
        this.error = err.error?.message || 'Failed to search students';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  selectStudent(student: any) {
    this.selectedStudentId = student.id;
  }

  linkSelectedStudent() {
    if (!this.selectedParent) {
      this.error = 'Please select a parent first';
      setTimeout(() => this.error = '', 5000);
      return;
    }
    if (!this.selectedStudentId) {
      this.error = 'Please select a student to link';
      setTimeout(() => this.error = '', 5000);
      return;
    }
    this.linking = true;
    this.success = '';
    this.error = '';
    this.parentService.adminLinkStudentToParent(
      this.selectedParent.id,
      this.selectedStudentId,
      this.relationshipType || 'guardian'
    ).subscribe({
      next: () => {
        this.linking = false;
        this.success = 'Student linked successfully';

        // Update UI immediately (count + linked list) without waiting for a full reload.
        const linkedStudent = this.studentsSearchResults.find(s => s.id === this.selectedStudentId);
        if (linkedStudent) {
          const existingLinks = Array.isArray(this.selectedParent?.parentStudents)
            ? this.selectedParent.parentStudents
            : [];

          const alreadyLinked = existingLinks.some((l: any) => l?.student?.id === linkedStudent.id);
          if (!alreadyLinked && this.selectedParent) {
            this.selectedParent = {
              ...this.selectedParent,
              parentStudents: [
                ...existingLinks,
                { student: linkedStudent, relationshipType: this.relationshipType || 'guardian' }
              ]
            };

            // Parent just became linked; update header metric immediately
            if (existingLinks.length === 0 && this.unlinkedParentsCount > 0) {
              this.unlinkedParentsCount = this.unlinkedParentsCount - 1;
            }
          }
        }

        // Clear selection/search so admin doesn't accidentally link the same student twice
        this.selectedStudentId = null;
        this.studentSearchQuery = '';
        this.studentsSearchResults = [];

        this.loadParents();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.linking = false;
        this.error = err.error?.message || 'Failed to link student';
        setTimeout(() => this.error = '', 5000);
      }
    });
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

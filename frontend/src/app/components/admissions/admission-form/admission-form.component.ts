import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AdmissionClassOption, AdmissionService } from '../../../services/admission.service';
import { validatePhoneNumber } from '../../../utils/phone-validator';

@Component({
  standalone: false,
  selector: 'app-admission-form',
  templateUrl: './admission-form.component.html',
  styleUrls: ['./admission-form.component.css'],
})
export class AdmissionFormComponent implements OnInit {
  applicationType: 'new_admission' | 'transfer' = 'new_admission';

  firstName = '';
  lastName = '';
  dateOfBirth = '';
  gender = '';
  address = '';
  phone = '';
  email = '';
  previousSchool = '';
  classApplyingForId = '';
  gradeApplyingFor = '';
  guardianName = '';
  guardianRelationship = '';
  guardianPhone = '';
  guardianEmail = '';
  guardianAddress = '';
  academicNotes = '';

  birthCertificate: File | null = null;
  reportCard: File | null = null;
  idPhoto: File | null = null;
  medicalForm: File | null = null;
  otherDocument: File | null = null;

  classes: AdmissionClassOption[] = [];
  loading = false;
  error = '';
  success = '';

  readonly maxFileSize = 5 * 1024 * 1024;
  readonly allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

  constructor(
    private admissionService: AdmissionService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.admissionService.getClasses().subscribe({
      next: (c) => (this.classes = Array.isArray(c) ? c : []),
      error: () => (this.classes = []),
    });
  }

  onFile(selected: File | null, kind: string): void {
    if (!selected) return;
    if (!this.allowedTypes.includes(selected.type)) {
      this.error = 'Only PDF, JPEG, PNG, or WebP files are allowed';
      return;
    }
    if (selected.size > this.maxFileSize) {
      this.error = 'Each file must be 5 MB or smaller';
      return;
    }
    this.error = '';
    switch (kind) {
      case 'birth': this.birthCertificate = selected; break;
      case 'report': this.reportCard = selected; break;
      case 'photo': this.idPhoto = selected; break;
      case 'medical': this.medicalForm = selected; break;
      case 'other': this.otherDocument = selected; break;
    }
  }

  validate(): string | null {
    if (!this.firstName.trim() || !this.lastName.trim()) return 'Applicant first and last name are required';
    if (!this.dateOfBirth) return 'Date of birth is required';
    if (!this.gender) return 'Gender is required';
    if (!this.address.trim()) return 'Address is required';
    const phoneCheck = validatePhoneNumber(this.phone, true);
    if (!phoneCheck.isValid) return phoneCheck.error || 'Valid contact phone is required';
    if (!this.classApplyingForId && !this.gradeApplyingFor.trim()) {
      return 'Select a class or enter the grade applying for';
    }
    if (!this.guardianName.trim() || !this.guardianPhone.trim()) {
      return 'Guardian name and phone are required';
    }
    if (this.applicationType === 'transfer' && !this.previousSchool.trim()) {
      return 'Previous school is required for transfer applications';
    }
    if (!this.birthCertificate) return 'Birth certificate upload is required';
    if (!this.reportCard) return 'Report card for the previous term is required';
    return null;
  }

  submit(): void {
    this.error = '';
    this.success = '';
    const validation = this.validate();
    if (validation) {
      this.error = validation;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const fd = new FormData();
    fd.append('applicationType', this.applicationType);
    fd.append('firstName', this.firstName.trim());
    fd.append('lastName', this.lastName.trim());
    fd.append('dateOfBirth', this.dateOfBirth);
    fd.append('gender', this.gender);
    fd.append('address', this.address.trim());
    fd.append('phone', this.phone.trim());
    if (this.email.trim()) fd.append('email', this.email.trim());
    if (this.previousSchool.trim()) fd.append('previousSchool', this.previousSchool.trim());
    if (this.classApplyingForId) fd.append('classApplyingForId', this.classApplyingForId);
    if (this.gradeApplyingFor.trim()) fd.append('gradeApplyingFor', this.gradeApplyingFor.trim());
    fd.append('guardianName', this.guardianName.trim());
    if (this.guardianRelationship.trim()) fd.append('guardianRelationship', this.guardianRelationship.trim());
    fd.append('guardianPhone', this.guardianPhone.trim());
    if (this.guardianEmail.trim()) fd.append('guardianEmail', this.guardianEmail.trim());
    if (this.guardianAddress.trim()) fd.append('guardianAddress', this.guardianAddress.trim());
    if (this.academicNotes.trim()) fd.append('academicNotes', this.academicNotes.trim());

    if (this.birthCertificate) fd.append('birthCertificate', this.birthCertificate);
    if (this.reportCard) fd.append('reportCard', this.reportCard);
    if (this.idPhoto) fd.append('idPhoto', this.idPhoto);
    if (this.medicalForm) fd.append('medicalForm', this.medicalForm);
    if (this.otherDocument) fd.append('otherDocument', this.otherDocument);

    this.loading = true;
    this.admissionService.submitApplication(fd).subscribe({
      next: (res) => {
        this.loading = false;
        this.success = res.message || 'Application submitted';
        const id = res.application?.id;
        setTimeout(() => {
          if (id) {
            sessionStorage.setItem('admissionFocusApplicationId', id);
            this.router.navigate(['/admissions/status', id], { replaceUrl: true });
          } else {
            this.router.navigate(['/admissions/portal'], { replaceUrl: true });
          }
        }, 800);
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.message || 'Failed to submit application';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    });
  }

  cancel(): void {
    this.router.navigate(['/admissions/portal']);
  }
}

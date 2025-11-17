import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SchoolService } from '../../services/school.service';

@Component({
  selector: 'app-schools',
  templateUrl: './schools.component.html',
  styleUrls: ['./schools.component.css']
})
export class SchoolsComponent implements OnInit {
  schools: any[] = [];
  loading = false;
  submitting = false;
  error = '';
  success = '';
  schoolForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private schoolService: SchoolService
  ) {
    this.schoolForm = this.fb.group({
      name: ['', [Validators.required]],
      code: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9_-]+$/)]],
      logoUrl: [''],
      address: [''],
      phone: [''],
      subscriptionEndDate: ['']
    });
  }

  ngOnInit(): void {
    this.loadSchools();
  }

  loadSchools(): void {
    this.loading = true;
    this.schoolService.getSchools().subscribe({
      next: (schools) => {
        this.schools = schools;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to load schools';
        this.loading = false;
      }
    });
  }

  onSubmit(): void {
    if (this.schoolForm.invalid) {
      this.schoolForm.markAllAsTouched();
      return;
    }

    this.submitting = true;
    this.error = '';
    this.success = '';

    const payload = {
      ...this.schoolForm.value,
      code: this.schoolForm.value.code?.toLowerCase()
    };

    this.schoolService.createSchool(payload).subscribe({
      next: (response) => {
        this.success = response?.message || 'School created successfully';
        this.schoolForm.reset();
        this.submitting = false;
        this.loadSchools();
        setTimeout(() => (this.success = ''), 4000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to create school';
        this.submitting = false;
      }
    });
  }
}



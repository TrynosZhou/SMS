import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { StudentService } from '../../../services/student.service';
import { ClassService } from '../../../services/class.service';
import { SettingsService } from '../../../services/settings.service';
import { validatePhoneNumber } from '../../../utils/phone-validator';

@Component({
  selector: 'app-student-form',
  templateUrl: './student-form.component.html',
  styleUrls: ['./student-form.component.css']
})
export class StudentFormComponent implements OnInit {
  student: any = {
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: '',
    studentStatus: '',
    address: '',
    phoneNumber: '',
    contactNumber: '',
    studentType: 'Day Scholar',
    usesTransport: false,
    usesDiningHall: false,
    isStaffChild: false,
    isExempted: false,
    classId: '',
    parentId: '',
    photo: null
  };
  classes: any[] = [];
  filteredClasses: any[] = [];
  classSearchQuery = '';
  isEdit = false;
  error = '';
  success = '';
  submitting = false;
  maxDate = '';
  selectedPhoto: File | null = null;
  photoPreview: string | null = null;
  studentIdPrefix = 'JPS';
  feesSettings: any = null;
  currencySymbol = '';
  estimatedFees = {
    registration: 0,
    desk: 0,
    tuition: 0,
    transport: 0,
    diningHall: 0,
    total: 0
  };
  
  // Phone validation errors
  contactNumberError = '';
  phoneNumberError = '';

  constructor(
    private studentService: StudentService,
    private classService: ClassService,
    private settingsService: SettingsService,
    private route: ActivatedRoute,
    public router: Router
  ) {
    // Set max date to today (for date of birth)
    const today = new Date();
    this.maxDate = today.toISOString().split('T')[0];
  }

  ngOnInit() {
    this.loadClasses();
    this.loadStudentIdPrefix();
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.isEdit = true;
      this.loadStudent(id);
    }
  }

  loadStudentIdPrefix() {
    this.settingsService.getSettings().subscribe({
      next: (settings: any) => {
        const prefix = typeof settings?.studentIdPrefix === 'string'
          ? settings.studentIdPrefix.trim()
          : '';
        if (prefix) {
          this.studentIdPrefix = prefix.toUpperCase();
        }
        this.feesSettings = settings?.feesSettings || null;
        this.currencySymbol = typeof settings?.currencySymbol === 'string' ? settings.currencySymbol : '';
        this.recalculateEstimatedFees();
      },
      error: (err: any) => {
        console.error('Error loading student ID prefix:', err);
      }
    });
  }

  loadClasses() {
    this.classService.getClasses().subscribe({
      next: (data: any) => {
        this.classes = data;
        this.filteredClasses = data;
      },
      error: (err: any) => {
        console.error('Error loading classes:', err);
        this.error = 'Failed to load classes';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  filterClasses() {
    if (!this.classSearchQuery.trim()) {
      this.filteredClasses = this.classes;
      return;
    }
    const query = this.classSearchQuery.toLowerCase();
    this.filteredClasses = this.classes.filter(cls =>
      cls.name.toLowerCase().includes(query) ||
      (cls.level && cls.level.toLowerCase().includes(query))
    );
  }

  selectClass(classId: string) {
    this.student.classId = classId;
    // Clear search after selection
    this.classSearchQuery = '';
    this.filterClasses();
  }

  onStaffChildChange() {
    if (this.student.isStaffChild) {
      this.student.usesTransport = false;
    }
    this.recalculateEstimatedFees();
  }
  
  onExemptedChange() {
    if (this.student.isExempted) {
      this.student.usesTransport = false;
    }
    this.recalculateEstimatedFees();
  }

  onStudentTypeChange() {
    this.recalculateEstimatedFees();
  }

  onUsesTransportChange() {
    this.recalculateEstimatedFees();
  }

  onUsesDiningHallChange() {
    this.recalculateEstimatedFees();
  }
  
  onStudentStatusChange() {
    this.recalculateEstimatedFees();
  }

  private toNumber(value: any): number {
    const n = parseFloat(value as any);
    return isNaN(n) ? 0 : n;
  }

  private recalculateEstimatedFees() {
    if (!this.feesSettings) {
      this.estimatedFees = {
        registration: 0,
        desk: 0,
        tuition: 0,
        transport: 0,
        diningHall: 0,
        total: 0
      };
      return;
    }

    const isDayScholar = this.student.studentType === 'Day Scholar';
    const isStaffChild = !!this.student.isStaffChild;
    const isExempted = !!this.student.isExempted;
    const normalizedStatusText = (this.student.studentStatus || '').toString().trim().toLowerCase();
    const status = normalizedStatusText.includes('existing') ? 'Existing' : normalizedStatusText.includes('new') ? 'New' : 'New';

    const registrationFee = this.toNumber(this.feesSettings.registrationFee);
    const deskFee = this.toNumber(this.feesSettings.deskFee);
    const dayScholarTuition = this.toNumber(this.feesSettings.dayScholarTuitionFee);
    const boarderTuition = this.toNumber(this.feesSettings.boarderTuitionFee);
    const transportCost = this.toNumber(this.feesSettings.transportCost);
    const diningHallCost = this.toNumber(this.feesSettings.diningHallCost);

    let registration = 0;
    let desk = 0;
    let tuition = 0;
    let transport = 0;
    let diningHall = 0;

    if (!isStaffChild && !isExempted) {
      if (status === 'New') {
        if (registrationFee > 0) {
          registration = registrationFee;
        }
        if (deskFee > 0) {
          desk = deskFee;
        }
      }
      const tuitionFee = isDayScholar ? dayScholarTuition : boarderTuition;
      if (tuitionFee > 0) {
        tuition = tuitionFee;
      }
      if (isDayScholar && this.student.usesTransport && transportCost > 0) {
        transport = transportCost;
      }
      if (isDayScholar && this.student.usesDiningHall && diningHallCost > 0) {
        diningHall = diningHallCost;
      }
    } else {
      if (isDayScholar && this.student.usesDiningHall && diningHallCost > 0) {
        diningHall = diningHallCost * 0.5;
      }
    }

    const total = parseFloat((registration + desk + tuition + transport + diningHall).toFixed(2));

    this.estimatedFees = {
      registration,
      desk,
      tuition,
      transport,
      diningHall,
      total
    };
  }

  loadStudent(id: string) {
    this.studentService.getStudentById(id).subscribe({
      next: (data: any) => {
        console.log('Loaded student data:', data);
        
        // Format dateOfBirth for HTML date input (YYYY-MM-DD)
        let formattedDate = '';
        if (data.dateOfBirth) {
          const date = new Date(data.dateOfBirth);
          if (!isNaN(date.getTime())) {
            formattedDate = date.toISOString().split('T')[0];
          }
        }
        
        // Get classId - prefer direct classId, then class.id, then empty string
        const studentClassId = data.classId || data.class?.id || '';
        console.log('Setting classId to:', studentClassId);
        
        this.student = {
          ...data,
          dateOfBirth: formattedDate,
          classId: studentClassId,
          contactNumber: data.contactNumber || data.phoneNumber || '',
          usesTransport: data.usesTransport || false,
          usesDiningHall: data.usesDiningHall || false,
          isStaffChild: data.isStaffChild || false,
          isExempted: data.isExempted || false,
          studentStatus: data.studentStatus || '',
          photo: data.photo || null
        };
        
        // Set photo preview if photo exists
        if (data.photo) {
          this.photoPreview = `http://localhost:3001${data.photo}`;
          this.student.photo = data.photo;
        }
        console.log('Formatted student data:', this.student);
        this.recalculateEstimatedFees();
      },
      error: (err: any) => {
        console.error('Error loading student:', err);
        this.error = err.error?.message || 'Failed to load student';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  onPhotoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        this.error = 'Please select an image file';
        setTimeout(() => this.error = '', 5000);
        return;
      }
      
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        this.error = 'Image size must be less than 2MB';
        setTimeout(() => this.error = '', 5000);
        return;
      }
      
      this.selectedPhoto = file;
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.photoPreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  removePhoto() {
    this.selectedPhoto = null;
    this.photoPreview = null;
    this.student.photo = null;
  }

  private calculateAge(dateString: string): number {
    const dob = new Date(dateString);
    if (isNaN(dob.getTime())) {
      return 0;
    }
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }

  validateContactNumber(): void {
    const result = validatePhoneNumber(this.student.contactNumber, false);
    this.contactNumberError = result.isValid ? '' : (result.error || '');
    if (result.isValid && result.normalized) {
      this.student.contactNumber = result.normalized;
    }
  }

  validatePhoneNumber(): void {
    if (this.student.phoneNumber && this.student.phoneNumber.trim()) {
      const result = validatePhoneNumber(this.student.phoneNumber, false);
      this.phoneNumberError = result.isValid ? '' : (result.error || '');
      if (result.isValid && result.normalized) {
        this.student.phoneNumber = result.normalized;
      }
    } else {
      this.phoneNumberError = '';
    }
  }

  onSubmit() {
    this.error = '';
    this.success = '';
    this.contactNumberError = '';
    this.phoneNumberError = '';
    this.submitting = true;

    // Validate contact number if provided (optional)
    if (this.student.contactNumber && this.student.contactNumber.trim()) {
      const contactResult = validatePhoneNumber(this.student.contactNumber, true);
      if (!contactResult.isValid) {
        this.contactNumberError = contactResult.error || 'Invalid contact number';
        this.error = contactResult.error || 'Please enter a valid contact number';
        this.submitting = false;
        return;
      }
      if (contactResult.normalized) {
        this.student.contactNumber = contactResult.normalized;
      }
    } else {
      this.contactNumberError = '';
    }

    if (this.student.phoneNumber && this.student.phoneNumber.trim()) {
      const phoneResult = validatePhoneNumber(this.student.phoneNumber, false);
      if (!phoneResult.isValid) {
        this.phoneNumberError = phoneResult.error || 'Invalid phone number';
        this.error = phoneResult.error || 'Please enter a valid phone number';
        this.submitting = false;
        return;
      }
      if (phoneResult.normalized) {
        this.student.phoneNumber = phoneResult.normalized;
      }
    }

    // Validate required fields (DOB is optional)
    if (!this.student.firstName || !this.student.lastName || 
        !this.student.gender || !this.student.studentType) {
      this.error = 'Please fill in all required fields';
      this.submitting = false;
      return;
    }

    if (!this.student.classId) {
      this.error = 'Please select a class for enrollment';
      this.submitting = false;
      return;
    }

    // If DOB is provided, enforce age range 3–13 years
    if (this.student.dateOfBirth) {
      const studentAge = this.calculateAge(this.student.dateOfBirth);
      if (studentAge < 3 || studentAge > 13) {
        this.error = 'Students must be between 3 and 13 years old at registration';
        this.submitting = false;
        return;
      }
    }
    
    if (this.isEdit) {
      // Prepare update data - exclude fields that shouldn't be updated
      const updateData: any = {
        firstName: this.student.firstName,
        lastName: this.student.lastName,
        dateOfBirth: this.student.dateOfBirth,
        gender: this.student.gender,
        address: this.student.address || null,
        contactNumber: this.student.contactNumber,
        studentType: this.student.studentType,
        studentStatus: this.student.studentStatus || 'New',
        usesTransport: this.student.usesTransport || false,
        usesDiningHall: this.student.usesDiningHall || false,
        isStaffChild: this.student.isStaffChild || false,
        isExempted: this.student.isExempted || false
      };

      // Include phoneNumber if provided
      if (this.student.phoneNumber) {
        updateData.phoneNumber = this.student.phoneNumber;
      }

      // Always include classId - it's required
      if (!this.student.classId) {
        this.error = 'Class is required. Students must be enrolled in a class.';
        this.submitting = false;
        return;
      }
      updateData.classId = this.student.classId;

      // Only include parentId if it exists
      if (this.student.parentId) {
        updateData.parentId = this.student.parentId;
      }

      // Include photo path if no new photo is selected but photo exists
      if (!this.selectedPhoto && this.student.photo) {
        updateData.photo = this.student.photo;
      }

      console.log('Updating student with ID:', this.student.id);
      console.log('Update data:', updateData);

      this.studentService.updateStudent(this.student.id, updateData, this.selectedPhoto || undefined).subscribe({
        next: (response: any) => {
          console.log('Student update response:', response);
          this.success = response.message || 'Student updated successfully';
          this.submitting = false;
          setTimeout(() => this.router.navigate(['/students']), 1500);
        },
        error: (err: any) => {
          console.error('Error updating student:', err);
          this.error = err.error?.message || err.message || 'Failed to update student';
          this.submitting = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
    } else {
      // For new students, don't send studentNumber (it will be auto-generated)
      const studentData = { ...this.student };
      delete studentData.studentNumber; // Remove studentNumber, it will be auto-generated
      
      this.studentService.createStudent(studentData, this.selectedPhoto || undefined).subscribe({
        next: (response: any) => {
          this.success = 'Record saved successfully';
          this.submitting = false;
          setTimeout(() => this.router.navigate(['/students']), 1500);
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to create student';
          this.submitting = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
    }
  }
}

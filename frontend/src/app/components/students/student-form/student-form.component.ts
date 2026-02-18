import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { StudentService } from '../../../services/student.service';
import { ClassService } from '../../../services/class.service';
import { SettingsService } from '../../../services/settings.service';
import { validatePhoneNumber } from '../../../utils/phone-validator';
import { AuthService } from '../../../services/auth.service';

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
    studentStatus: 'New Student',
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
  gradeLevels: string[] = [];
  selectedGradeLevel: string = '';
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
  dobError = '';
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
  limitedEditMode = false;
  returnUrl: string | null = null;

  constructor(
    private studentService: StudentService,
    private classService: ClassService,
    private settingsService: SettingsService,
    private route: ActivatedRoute,
    public router: Router,
    private authService: AuthService
  ) {
    // Set max date to today (for date of birth)
    const today = new Date();
    this.maxDate = today.toISOString().split('T')[0];
  }

  goBack() {
    const target = this.returnUrl || '/students';
    this.router.navigate([target]);
  }

  ngOnInit() {
    this.loadClasses();
    this.loadStudentIdPrefix();
    const qp = this.route.snapshot.queryParamMap;
    const mode = qp.get('mode') || '';
    const limited = qp.get('limited') || '';
    this.limitedEditMode = mode.toLowerCase() === 'limited' || ['1', 'true', 'yes'].includes(limited.toLowerCase());
    this.returnUrl = qp.get('returnUrl');

    // Teachers cannot add students
    const user = this.authService.getCurrentUser();
    if (!this.route.snapshot.params['id'] && user && String(user.role).toLowerCase() === 'teacher') {
      this.router.navigate([this.returnUrl || '/dashboard']);
      return;
    }
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.isEdit = true;
      this.loadStudent(id);
    }
  }

  private isValidDDMMYYYY(input: string): boolean {
    const m = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return false;
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const y = parseInt(m[3], 10);
    if (mo < 1 || mo > 12) return false;
    const daysInMonth = new Date(y, mo, 0).getDate();
    return d >= 1 && d <= daysInMonth;
  }

  private toISOFromDDMMYYYY(input: string): string {
    const m = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return '';
    const d = m[1];
    const mo = m[2];
    const y = m[3];
    return `${y}-${mo}-${d}`;
  }

  private toDDMMYYYYFromDate(input: any): string {
    const dt = new Date(input);
    if (isNaN(dt.getTime())) return '';
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = String(dt.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  }

  onDobInput(event: any) {
    this.dobError = '';
    const value = String(event.target.value || '').replace(/[^0-9/]/g, '');
    let cleaned = value.replace(/\/+/g, '/').slice(0, 10);
    if (/^\d{2}$/.test(cleaned)) {
      cleaned = cleaned + '/';
    } else if (/^\d{2}\/\d{2}$/.test(cleaned)) {
      cleaned = cleaned + '/';
    }
    this.student.dateOfBirth = cleaned;
  }

  onDobBlur() {
    const v = String(this.student.dateOfBirth || '').trim();
    if (!v) {
      this.dobError = '';
      return;
    }
    if (!this.isValidDDMMYYYY(v)) {
      this.dobError = 'Invalid date. Use dd/mm/yyyy';
      return;
    }
    const age = this.calculateAge(v);
    if (age < 3 || age > 13) {
      this.dobError = 'Age must be between 3 and 13 years';
    } else {
      this.dobError = '';
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
        if (Array.isArray(settings?.classLevels) && settings.classLevels.length > 0) {
          this.gradeLevels = settings.classLevels;
        } else {
          try {
            const cached = localStorage.getItem('settings_classLevels');
            if (cached) {
              const arr = JSON.parse(cached);
              this.gradeLevels = Array.isArray(arr) ? arr : [];
            } else {
              this.gradeLevels = [];
            }
          } catch (_) {
            this.gradeLevels = [];
          }
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

  private normalizeStatusForSubmit(value: any): string {
    const txt = String(value || '').trim().toLowerCase();
    if (txt.includes('existing')) return 'Existing';
    if (txt.includes('new')) return 'New';
    return 'New';
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
    const normalizedStatusText = (this.student.studentStatus || 'New Student').toString().trim().toLowerCase();
    const status = normalizedStatusText.includes('existing') ? 'Existing' : 'New';

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
        
        // Format dateOfBirth for display input (dd/mm/yyyy)
        let formattedDate = '';
        if (data.dateOfBirth) {
          formattedDate = this.toDDMMYYYYFromDate(data.dateOfBirth);
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
          studentStatus: data.studentStatus === 'Existing'
            ? 'Existing Student'
            : data.studentStatus === 'New'
              ? 'New Student'
              : 'Select Status',
          photo: data.photo || null
        };
        this.selectedGradeLevel = (data as any).grade || (data as any).classLevel || (data as any).gradeLevel || '';
        
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

  private setSuccess(msg: string, ms: number = 5000) {
    this.success = msg;
    setTimeout(() => {
      if (this.success === msg) {
        this.success = '';
      }
    }, ms);
  }

  private calculateAge(dateString: string): number {
    let dob: Date;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
      const iso = this.toISOFromDDMMYYYY(dateString);
      dob = new Date(iso);
    } else {
      dob = new Date(dateString);
    }
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
      // When in limited edit mode, only allow personal and contact fields
      if (this.limitedEditMode) {
        const updateData: any = {
          firstName: this.student.firstName,
          lastName: this.student.lastName,
          dateOfBirth: this.student.dateOfBirth ? this.toISOFromDDMMYYYY(this.student.dateOfBirth) : '',
          gender: this.student.gender,
          address: this.student.address || null,
          contactNumber: this.student.contactNumber
        };
        if (this.student.phoneNumber) {
          updateData.phoneNumber = this.student.phoneNumber;
        }
        if (!this.selectedPhoto && this.student.photo) {
          updateData.photo = this.student.photo;
        }
        this.studentService.updateStudent(this.student.id, updateData, this.selectedPhoto || undefined).subscribe({
          next: (response: any) => {
            this.success = response.message || 'Student updated successfully';
            this.submitting = false;
            setTimeout(() => this.router.navigate([this.returnUrl || '/classes/lists']), 1200);
          },
          error: (err: any) => {
            this.error = err.error?.message || err.message || 'Failed to update student';
            this.submitting = false;
            setTimeout(() => this.error = '', 5000);
          }
        });
        return;
      }
      // Prepare update data - exclude class enrollment (managed via enroll page)
      const updateData: any = {
        firstName: this.student.firstName,
        lastName: this.student.lastName,
        dateOfBirth: this.student.dateOfBirth ? this.toISOFromDDMMYYYY(this.student.dateOfBirth) : '',
        gender: this.student.gender,
        address: this.student.address || null,
        contactNumber: this.student.contactNumber,
        studentType: this.student.studentType,
        studentStatus: this.normalizeStatusForSubmit(this.student.studentStatus),
        usesTransport: this.student.usesTransport || false,
        usesDiningHall: this.student.usesDiningHall || false,
        isStaffChild: this.student.isStaffChild || false,
        isExempted: this.student.isExempted || false
      };
      if (this.selectedGradeLevel && this.selectedGradeLevel.trim()) {
        const g = this.selectedGradeLevel.trim();
        (updateData as any).grade = g;
        (updateData as any).classLevel = g;
      }

      // Include phoneNumber if provided
      if (this.student.phoneNumber) {
        updateData.phoneNumber = this.student.phoneNumber;
      }

      // Class enrollment is handled separately; do not update classId here

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
      // For creation, explicitly mark as New (registration) so backend does not require classId
      (studentData as any).studentStatus = 'New';
      if (studentData.dateOfBirth) {
        studentData.dateOfBirth = this.toISOFromDDMMYYYY(String(studentData.dateOfBirth));
      }
      if (this.selectedGradeLevel && this.selectedGradeLevel.trim()) {
        const g = this.selectedGradeLevel.trim();
        (studentData as any).grade = g;
        (studentData as any).classLevel = g;
      }
      delete studentData.studentNumber; // Remove studentNumber, it will be auto-generated
      // Remove fields that should not be sent or are empty
      if (!studentData.classId) {
        delete (studentData as any).classId;
      }
      if (!studentData.parentId) {
        delete (studentData as any).parentId;
      }
      if (!studentData.phoneNumber) {
        delete (studentData as any).phoneNumber;
      }
      if (!studentData.contactNumber) {
        delete (studentData as any).contactNumber;
      }
      if (!studentData.address) {
        delete (studentData as any).address;
      }
      if (!this.selectedPhoto && !studentData.photo) {
        delete (studentData as any).photo;
      }
      // Normalize gender to expected backend values (Male/Female)
      const g = String(studentData.gender || '').trim().toLowerCase();
      if (g === 'm' || g === 'male') studentData.gender = 'Male';
      else if (g === 'f' || g === 'female') studentData.gender = 'Female';
      
      this.studentService.createStudent(studentData, this.selectedPhoto || undefined).subscribe({
        next: (response: any) => {
          this.setSuccess('Record saved successfully');
          this.submitting = false;
          setTimeout(() => this.router.navigate(['/students']), 1500);
        },
        error: (err: any) => {
          const msg = err?.error?.message || err?.message || '';
          if (String(msg).toLowerCase().includes('class id') && String(msg).toLowerCase().includes('enroll')) {
            this.error = 'Registration does not require class. Please use Enroll Student later.';
          } else {
            this.error = msg || 'Failed to create student';
          }
          this.submitting = false;
          setTimeout(() => this.error = '', 5000);
        }
      });
    }
  }
}

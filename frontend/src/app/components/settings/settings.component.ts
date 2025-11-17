import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { SettingsService } from '../../services/settings.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  settings: any = {
    studentIdPrefix: 'JPS',
    feesSettings: {
      dayScholarTuitionFee: 0,
      boarderTuitionFee: 0,
      registrationFee: 0,
      deskFee: 0,
      libraryFee: 0,
      sportsFee: 0,
      transportCost: 0,
      diningHallCost: 0,
      otherFees: []
    },
    gradeThresholds: {
      excellent: 90,
      veryGood: 80,
      good: 60,
      satisfactory: 40,
      needsImprovement: 20,
      basic: 1
    },
    gradeLabels: {
      excellent: 'OUTSTANDING',
      veryGood: 'VERY HIGH',
      good: 'HIGH',
      satisfactory: 'GOOD',
      needsImprovement: 'ASPIRING',
      basic: 'BASIC',
      fail: 'UNCLASSIFIED'
    },
    schoolName: '',
    schoolCode: '',
    schoolAddress: '',
    schoolPhone: '',
    schoolEmail: '',
    headmasterName: '',
    academicYear: new Date().getFullYear().toString(),
    currentTerm: `Term 1 ${new Date().getFullYear()}`,
    schoolLogo: null,
    schoolLogo2: null,
    currencySymbol: 'KES',
    moduleAccess: {
      teachers: {
        students: true,
        classes: true,
        subjects: true,
        exams: true,
        reportCards: true,
        rankings: true,
        finance: false,
        settings: false
      },
      parents: {
        reportCards: true,
        invoices: true,
        dashboard: true
      },
      accountant: {
        students: true,
        invoices: true,
        finance: true,
        dashboard: true,
        settings: false
      },
      admin: {
        students: true,
        teachers: true,
        classes: true,
        subjects: true,
        exams: true,
        reportCards: true,
        rankings: true,
        finance: true,
        attendance: true,
        settings: true,
        dashboard: true
      }
    },
    promotionRules: {
      'ECD A': 'ECD B',
      'ECD B': 'Grade 1',
      'Grade 1': 'Grade 2',
      'Grade 2': 'Grade 3',
      'Grade 3': 'Grade 4',
      'Grade 4': 'Grade 5',
      'Grade 5': 'Grade 6',
      'Grade 6': 'Grade 7',
      'Grade 7': 'Completed'
    }
  };

  loading = false;
  error = '';
  success = '';
  newFeeName = '';
  newFeeAmount = 0;
  newPromotionFrom = '';
  newPromotionTo = '';
  editingPromotionRule: string | null = null; // Track which rule is being edited
  termStartDateInput: string = '';
  termEndDateInput: string = '';
  reminders: string[] = [];
  needsPromotion: boolean = false;
  needsFeeCalculation: boolean = false;
  processingOpeningDay: boolean = false;
  processingClosingDay: boolean = false;
  loadingReminders: boolean = false;
  uniformItems: any[] = [];
  uniformItemForm: {
    id?: string;
    name: string;
    description: string;
    unitPrice: number;
    isActive: boolean;
  } = {
    id: undefined,
    name: '',
    description: '',
    unitPrice: 0,
    isActive: true
  };
  uniformItemModalOpen = false;
  uniformItemSubmitting = false;
  uniformItemError = '';

  constructor(
    private settingsService: SettingsService,
    private router: Router,
    public authService: AuthService,
    private cdr: ChangeDetectorRef
  ) { }

  isDemoUser(): boolean {
    const user = this.authService.getCurrentUser();
    return user?.isDemo === true;
  }

  ngOnInit() {
    this.loadSettings();
    this.loadReminders();
    this.loadUniformItems();
  }

  loadSettings() {
    // For demo users, always set school name to "Demo School"
    if (this.isDemoUser()) {
      this.settings.schoolName = 'Demo School';
      this.settings.schoolCode = 'DEMO';
    }
    this.loading = true;
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.settings = { ...this.settings, ...data };
        // Load school code from settings (human-readable format, preserve case for display)
        if (data?.schoolCode) {
          this.settings.schoolCode = data.schoolCode;
        } else if (!this.settings.schoolCode) {
          this.settings.schoolCode = '';
        }
        
        // For demo users, always set school name to "Demo School"
        if (this.isDemoUser()) {
          this.settings.schoolName = 'Demo School';
          this.settings.schoolCode = 'demo';
        }
        
        // Initialize term date inputs
        if (data.termStartDate) {
          const startDate = new Date(data.termStartDate);
          this.termStartDateInput = startDate.toISOString().split('T')[0];
        }
        if (data.termEndDate) {
          const endDate = new Date(data.termEndDate);
          this.termEndDateInput = endDate.toISOString().split('T')[0];
        }
        
        // Initialize activeTerm if not present
        if (!this.settings.activeTerm && this.settings.currentTerm) {
          this.settings.activeTerm = this.settings.currentTerm;
        }
        
        if (!this.settings.feesSettings) {
          this.settings.feesSettings = {
            dayScholarTuitionFee: 0,
            boarderTuitionFee: 0,
            registrationFee: 0,
            deskFee: 0,
            libraryFee: 0,
            sportsFee: 0,
            transportCost: 0,
            diningHallCost: 0,
            otherFees: []
          };
        }
        if (this.settings.feesSettings.registrationFee === undefined) {
          this.settings.feesSettings.registrationFee = 0;
        }
        if (this.settings.feesSettings.deskFee === undefined) {
          this.settings.feesSettings.deskFee = 0;
        }
        // Initialize transport and dining hall costs if not present
        if (this.settings.feesSettings.transportCost === undefined) {
          this.settings.feesSettings.transportCost = 0;
        }
        if (this.settings.feesSettings.diningHallCost === undefined) {
          this.settings.feesSettings.diningHallCost = 0;
        }
        // Migrate old tuitionFee to both dayScholarTuitionFee and boarderTuitionFee if needed
        if (this.settings.feesSettings.tuitionFee !== undefined && 
            this.settings.feesSettings.dayScholarTuitionFee === undefined &&
            this.settings.feesSettings.boarderTuitionFee === undefined) {
          const oldTuitionFee = this.settings.feesSettings.tuitionFee;
          this.settings.feesSettings.dayScholarTuitionFee = oldTuitionFee;
          this.settings.feesSettings.boarderTuitionFee = oldTuitionFee;
          delete this.settings.feesSettings.tuitionFee;
        }
        if (!this.settings.gradeThresholds) {
          this.settings.gradeThresholds = {
            excellent: 90,
            veryGood: 80,
            good: 60,
            satisfactory: 40,
            needsImprovement: 20,
            basic: 1
          };
        }
        if (!this.settings.gradeLabels) {
          this.settings.gradeLabels = {
            excellent: 'OUTSTANDING',
            veryGood: 'VERY HIGH',
            good: 'HIGH',
            satisfactory: 'GOOD',
            needsImprovement: 'ASPIRING',
            basic: 'BASIC',
            fail: 'UNCLASSIFIED'
          };
        }
        if (!this.settings.currencySymbol) {
          this.settings.currencySymbol = 'KES';
        }
        if (!this.settings.currentTerm) {
          const currentYear = new Date().getFullYear();
          this.settings.currentTerm = `Term 1 ${currentYear}`;
        }
        if (!this.settings.moduleAccess) {
          this.settings.moduleAccess = {
            teachers: {
              students: true,
              classes: true,
              subjects: true,
              exams: true,
              reportCards: true,
              rankings: true,
              finance: false,
              settings: false
            },
            parents: {
              reportCards: true,
              invoices: true,
              dashboard: true
            },
            accountant: {
              students: true,
              invoices: true,
              finance: true,
              dashboard: true,
              settings: false
            },
            admin: {
              students: true,
              teachers: true,
              classes: true,
              subjects: true,
              exams: true,
              reportCards: true,
              rankings: true,
              finance: true,
              attendance: true,
              settings: true,
              dashboard: true
            }
          };
        } else {
          // Ensure accountant and admin module access exist
          if (!this.settings.moduleAccess.accountant) {
            this.settings.moduleAccess.accountant = {
              students: true,
              invoices: true,
              finance: true,
              dashboard: true,
              settings: false
            };
          }
          if (!this.settings.moduleAccess.admin) {
            this.settings.moduleAccess.admin = {
              students: true,
              teachers: true,
              classes: true,
              subjects: true,
              exams: true,
              reportCards: true,
              rankings: true,
              finance: true,
              attendance: true,
              settings: true,
              dashboard: true
            };
          }
        }
        if (!this.settings.promotionRules) {
          this.settings.promotionRules = {
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
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading settings:', err);
        this.error = 'Failed to load settings';
        this.loading = false;
      }
    });
  }

  onLogoChange(event: any, logoNumber: number = 1) {
    const file = event.target.files[0];
    if (file) {
      // Check file size (limit to 2MB)
      if (file.size > 2 * 1024 * 1024) {
        this.error = 'Image file is too large. Please use an image smaller than 2MB.';
        setTimeout(() => this.error = '', 5000);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e: any) => {
        const img = new Image();
        img.onload = () => {
          // Create canvas to resize/compress image
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 300;
          const MAX_HEIGHT = 300;
          
          let width = img.width;
          let height = img.height;
          
          // Calculate new dimensions
          if (width > height) {
            if (width > MAX_WIDTH) {
              height = (height * MAX_WIDTH) / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = (width * MAX_HEIGHT) / height;
              height = MAX_HEIGHT;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          // Draw and compress
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Convert to base64 with compression (quality 0.8)
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          
          if (logoNumber === 2) {
            this.settings.schoolLogo2 = compressedDataUrl;
          } else {
            this.settings.schoolLogo = compressedDataUrl;
          }
        };
        img.onerror = () => {
          this.error = 'Failed to load image. Please try a different image.';
          setTimeout(() => this.error = '', 5000);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  addOtherFee() {
    if (this.newFeeName && this.newFeeAmount > 0) {
      if (!this.settings.feesSettings.otherFees) {
        this.settings.feesSettings.otherFees = [];
      }
      this.settings.feesSettings.otherFees.push({
        name: this.newFeeName,
        amount: this.newFeeAmount
      });
      this.newFeeName = '';
      this.newFeeAmount = 0;
    }
  }

  removeOtherFee(index: number) {
    this.settings.feesSettings.otherFees.splice(index, 1);
  }

  addPromotionRule() {
    console.log('addPromotionRule called', { from: this.newPromotionFrom, to: this.newPromotionTo });
    
    // Trim whitespace
    const fromClass = this.newPromotionFrom?.trim();
    const toClass = this.newPromotionTo?.trim();
    
    if (!fromClass || !toClass) {
      this.error = 'Please enter both current class and next class';
      setTimeout(() => this.error = '', 3000);
      this.cdr.markForCheck();
      return;
    }
    
    if (!this.settings.promotionRules) {
      this.settings.promotionRules = {};
    }
    
    // If editing an existing rule
    if (this.editingPromotionRule) {
      // If the from class changed, we need to remove the old one
      if (fromClass !== this.editingPromotionRule) {
        // Remove old rule
        const { [this.editingPromotionRule]: removed, ...rest } = this.settings.promotionRules;
        this.settings.promotionRules = rest;
      }
      
      // Add/update the rule
      this.settings.promotionRules = {
        ...this.settings.promotionRules,
        [fromClass]: toClass
      };
      
      this.success = `Promotion rule updated: ${fromClass} → ${toClass}. Don't forget to save settings!`;
      this.editingPromotionRule = null; // Clear editing state
    } else {
      // Check if rule already exists (only when adding new, not editing)
      if (this.settings.promotionRules[fromClass]) {
        this.error = `A promotion rule for "${fromClass}" already exists. Please remove it first or click Edit to update it.`;
        setTimeout(() => this.error = '', 4000);
        this.cdr.markForCheck();
        return;
      }
      
      // Add the new rule - create new object reference to trigger change detection
      this.settings.promotionRules = {
        ...this.settings.promotionRules,
        [fromClass]: toClass
      };
      
      this.success = `Promotion rule added: ${fromClass} → ${toClass}. Don't forget to save settings!`;
    }
    
    console.log('Promotion rule saved', this.settings.promotionRules);
    
    // Clear input fields
    this.newPromotionFrom = '';
    this.newPromotionTo = '';
    
    setTimeout(() => this.success = '', 5000);
    
    // Trigger change detection
    this.cdr.detectChanges();
  }

  editPromotionRule(fromClass: string) {
    // Populate input fields with existing values
    this.newPromotionFrom = fromClass;
    this.newPromotionTo = this.settings.promotionRules[fromClass] || '';
    this.editingPromotionRule = fromClass;
    
    // Scroll to input fields
    setTimeout(() => {
      const inputElement = document.querySelector('input[name="newPromotionFrom"]') as HTMLElement;
      if (inputElement) {
        inputElement.focus();
        inputElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
    
    this.cdr.markForCheck();
  }

  cancelEditPromotionRule() {
    this.newPromotionFrom = '';
    this.newPromotionTo = '';
    this.editingPromotionRule = null;
    this.cdr.markForCheck();
  }

  removePromotionRule(fromClass: string) {
    if (this.settings.promotionRules && this.settings.promotionRules[fromClass]) {
      // Create new object without the deleted rule to trigger change detection
      const { [fromClass]: removed, ...rest } = this.settings.promotionRules;
      this.settings.promotionRules = rest;
      this.cdr.markForCheck();
    }
  }

  getPromotionRulesArray(): { from: string; to: string }[] {
    if (!this.settings.promotionRules) {
      return [];
    }
    return Object.entries(this.settings.promotionRules).map(([from, to]) => ({
      from,
      to: to as string
    }));
  }

  validateGradeThresholds() {
    if (!this.settings.gradeThresholds) return;
    
    const thresholds = {
      excellent: Number(this.settings.gradeThresholds.excellent) || 0,
      veryGood: Number(this.settings.gradeThresholds.veryGood) || 0,
      good: Number(this.settings.gradeThresholds.good) || 0,
      satisfactory: Number(this.settings.gradeThresholds.satisfactory) || 0,
      needsImprovement: Number(this.settings.gradeThresholds.needsImprovement) || 0,
      basic: Number(this.settings.gradeThresholds.basic || 1) || 0
    };

    // Check if thresholds are in descending order
    if (thresholds.excellent < thresholds.veryGood ||
        thresholds.veryGood < thresholds.good ||
        thresholds.good < thresholds.satisfactory ||
        thresholds.satisfactory < thresholds.needsImprovement ||
        thresholds.needsImprovement < thresholds.basic) {
      this.error = 'Grade thresholds must be in descending order (Excellent ≥ Very Good ≥ Good ≥ Satisfactory ≥ Needs Improvement ≥ Basic)';
      setTimeout(() => this.error = '', 5000);
    } else {
      // Clear error if validation passes
      if (this.error && this.error.includes('Grade thresholds')) {
        this.error = '';
      }
    }
  }

  onSubmit() {
    // Prevent demo users from saving settings
    if (this.isDemoUser()) {
      this.error = 'Demo accounts cannot modify system settings. This is a demo environment.';
      this.loading = false;
      setTimeout(() => this.error = '', 5000);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    const normalizedSchoolCode = (this.settings.schoolCode || '').toString().trim();
    const normalizedSchoolName = (this.settings.schoolName || '').toString().trim();
    const lowerCaseCode = normalizedSchoolCode.toLowerCase();
    const isDemoCode = lowerCaseCode === 'demo';

    if (!normalizedSchoolCode || !normalizedSchoolName) {
      this.error = 'School code and school name are both required.';
      this.loading = false;
      setTimeout(() => this.error = '', 5000);
      return;
    }

    // Validate human-readable school code: alphanumeric, hyphens, underscores, 3-50 chars
    const codePattern = /^[a-zA-Z0-9_-]{3,50}$/;
    if (!isDemoCode && !codePattern.test(normalizedSchoolCode)) {
      this.error = 'School code must be 3-50 characters long and contain only letters, numbers, hyphens, or underscores (e.g., riverton, school-2024).';
      this.loading = false;
      setTimeout(() => this.error = '', 5000);
      return;
    }

    // Store code in lowercase for consistency (but display as entered)
    this.settings.schoolCode = lowerCaseCode;
    this.settings.schoolName = normalizedSchoolName;

    // Convert date inputs to Date objects for backend
    if (this.termStartDateInput) {
      this.settings.termStartDate = new Date(this.termStartDateInput).toISOString();
    }
    if (this.termEndDateInput) {
      this.settings.termEndDate = new Date(this.termEndDateInput).toISOString();
    }

    // Ensure activeTerm is set (default to currentTerm if not provided)
    if (!this.settings.activeTerm && this.settings.currentTerm) {
      this.settings.activeTerm = this.settings.currentTerm;
    }

    // Ensure numeric values are numbers
    if (this.settings.feesSettings) {
      this.settings.feesSettings.dayScholarTuitionFee = Number(this.settings.feesSettings.dayScholarTuitionFee) || 0;
      this.settings.feesSettings.boarderTuitionFee = Number(this.settings.feesSettings.boarderTuitionFee) || 0;
      this.settings.feesSettings.deskFee = Number(this.settings.feesSettings.deskFee) || 0;
      this.settings.feesSettings.libraryFee = Number(this.settings.feesSettings.libraryFee) || 0;
      this.settings.feesSettings.sportsFee = Number(this.settings.feesSettings.sportsFee) || 0;
      this.settings.feesSettings.transportCost = Number(this.settings.feesSettings.transportCost) || 0;
      this.settings.feesSettings.diningHallCost = Number(this.settings.feesSettings.diningHallCost) || 0;
    }

    if (this.settings.gradeThresholds) {
      // Validate grade thresholds are in descending order
      const thresholds = {
        excellent: Number(this.settings.gradeThresholds.excellent),
        veryGood: Number(this.settings.gradeThresholds.veryGood),
        good: Number(this.settings.gradeThresholds.good),
        satisfactory: Number(this.settings.gradeThresholds.satisfactory),
        needsImprovement: Number(this.settings.gradeThresholds.needsImprovement),
        basic: Number(this.settings.gradeThresholds.basic || 1)
      };

      // Check if thresholds are in descending order
      if (thresholds.excellent < thresholds.veryGood ||
          thresholds.veryGood < thresholds.good ||
          thresholds.good < thresholds.satisfactory ||
          thresholds.satisfactory < thresholds.needsImprovement ||
          thresholds.needsImprovement < thresholds.basic) {
        this.error = 'Grade thresholds must be in descending order (Excellent ≥ Very Good ≥ Good ≥ Satisfactory ≥ Needs Improvement ≥ Basic)';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
        return;
      }

      // Check if all values are within valid range
      if (thresholds.excellent > 100 || thresholds.excellent < 0 ||
          thresholds.veryGood > 100 || thresholds.veryGood < 0 ||
          thresholds.good > 100 || thresholds.good < 0 ||
          thresholds.satisfactory > 100 || thresholds.satisfactory < 0 ||
          thresholds.needsImprovement > 100 || thresholds.needsImprovement < 0 ||
          thresholds.basic > 100 || thresholds.basic < 0) {
        this.error = 'All grade thresholds must be between 0 and 100';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
        return;
      }

      this.settings.gradeThresholds.excellent = thresholds.excellent;
      this.settings.gradeThresholds.veryGood = thresholds.veryGood;
      this.settings.gradeThresholds.good = thresholds.good;
      this.settings.gradeThresholds.satisfactory = thresholds.satisfactory;
      this.settings.gradeThresholds.needsImprovement = thresholds.needsImprovement;
      this.settings.gradeThresholds.basic = thresholds.basic;
    }

    // Validate and trim grade labels
    if (this.settings.gradeLabels) {
      if (!this.settings.gradeLabels.excellent || this.settings.gradeLabels.excellent.trim() === '') {
        this.error = 'Grade label for Excellent is required';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
        return;
      }
      if (!this.settings.gradeLabels.veryGood || this.settings.gradeLabels.veryGood.trim() === '') {
        this.error = 'Grade label for Very Good is required';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
        return;
      }
      if (!this.settings.gradeLabels.good || this.settings.gradeLabels.good.trim() === '') {
        this.error = 'Grade label for Good is required';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
        return;
      }
      if (!this.settings.gradeLabels.satisfactory || this.settings.gradeLabels.satisfactory.trim() === '') {
        this.error = 'Grade label for Satisfactory is required';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
        return;
      }
      if (!this.settings.gradeLabels.needsImprovement || this.settings.gradeLabels.needsImprovement.trim() === '') {
        this.error = 'Grade label for Needs Improvement is required';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
        return;
      }
      if (!this.settings.gradeLabels.basic || this.settings.gradeLabels.basic.trim() === '') {
        this.error = 'Grade label for Basic is required';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
        return;
      }
      if (!this.settings.gradeLabels.fail || this.settings.gradeLabels.fail.trim() === '') {
        this.error = 'Grade label for Fail is required';
        this.loading = false;
        setTimeout(() => this.error = '', 5000);
        return;
      }

      // Trim all grade labels
      this.settings.gradeLabels.excellent = this.settings.gradeLabels.excellent.trim();
      this.settings.gradeLabels.veryGood = this.settings.gradeLabels.veryGood.trim();
      this.settings.gradeLabels.good = this.settings.gradeLabels.good.trim();
      this.settings.gradeLabels.satisfactory = this.settings.gradeLabels.satisfactory.trim();
      this.settings.gradeLabels.needsImprovement = this.settings.gradeLabels.needsImprovement.trim();
      this.settings.gradeLabels.basic = this.settings.gradeLabels.basic.trim();
      this.settings.gradeLabels.fail = this.settings.gradeLabels.fail.trim();
    }

    // Ensure currencySymbol is set and not empty
    if (!this.settings.currencySymbol || this.settings.currencySymbol.trim() === '') {
      this.settings.currencySymbol = 'KES';
    }

    const payload = { ...this.settings, schoolCode: lowerCaseCode, schoolName: normalizedSchoolName };

    this.settingsService.updateSettings(payload).subscribe({
      next: (response: any) => {
        this.success = 'Settings saved successfully!';
        this.loading = false;
        this.error = ''; // Clear any previous errors
        
        // Scroll to top to show success message
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Clear success message after 5 seconds (increased from 3)
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        console.error('Error saving settings:', err);
        
        // Handle specific error cases
        if (err.status === 413 || err.error?.status === 413) {
          this.error = 'The data being saved is too large. Please reduce the size of the school logo or other large data and try again.';
        } else if (err.error?.message) {
          this.error = err.error.message;
        } else {
          this.error = 'Failed to save settings. Please try again.';
        }
        
        this.loading = false;
        this.success = ''; // Clear any previous success message
        
        // Scroll to top to show error message
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Clear error message after 5 seconds
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  loadUniformItems() {
    this.settingsService.getUniformItems().subscribe({
      next: (items: any[]) => {
        this.uniformItems = items || [];
      },
      error: (err: any) => {
        console.error('Error loading uniform items:', err);
      }
    });
  }

  openUniformItemModal(item?: any) {
    if (item) {
      this.uniformItemForm = {
        id: item.id,
        name: item.name,
        description: item.description || '',
        unitPrice: parseFloat(String(item.unitPrice || 0)),
        isActive: item.isActive !== false
      };
    } else {
      this.uniformItemForm = {
        id: undefined,
        name: '',
        description: '',
        unitPrice: 0,
        isActive: true
      };
    }
    this.uniformItemError = '';
    this.uniformItemModalOpen = true;
  }

  closeUniformItemModal() {
    this.uniformItemModalOpen = false;
    this.uniformItemSubmitting = false;
    this.uniformItemError = '';
  }

  saveUniformItem() {
    if (!this.uniformItemForm.name || this.uniformItemForm.name.trim() === '') {
      this.uniformItemError = 'Uniform item name is required';
      return;
    }

    if (this.uniformItemForm.unitPrice === null || this.uniformItemForm.unitPrice === undefined || this.uniformItemForm.unitPrice < 0) {
      this.uniformItemError = 'Please enter a valid price';
      return;
    }

    this.uniformItemSubmitting = true;
    const payload = {
      name: this.uniformItemForm.name.trim(),
      description: this.uniformItemForm.description?.trim() || '',
      unitPrice: Number(this.uniformItemForm.unitPrice),
      isActive: this.uniformItemForm.isActive
    };

    const request$ = this.uniformItemForm.id
      ? this.settingsService.updateUniformItem(this.uniformItemForm.id, payload)
      : this.settingsService.createUniformItem(payload);

    request$.subscribe({
      next: (response: any) => {
        this.uniformItemSubmitting = false;
        this.success = response?.message || 'Uniform item saved successfully!';
        this.loadUniformItems();
        this.closeUniformItemModal();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.uniformItemSubmitting = false;
        this.uniformItemError = err.error?.message || 'Failed to save uniform item';
      }
    });
  }

  deleteUniformItem(item: any) {
    if (!item?.id) {
      return;
    }

    if (!confirm(`Delete uniform item "${item.name}"? This cannot be undone.`)) {
      return;
    }

    this.settingsService.deleteUniformItem(item.id).subscribe({
      next: (response: any) => {
        this.success = response?.message || 'Uniform item deleted successfully';
        this.loadUniformItems();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to delete uniform item';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  loadReminders() {
    this.loadingReminders = true;
    this.settingsService.getYearEndReminders().subscribe({
      next: (data: any) => {
        this.reminders = data.reminders || [];
        this.needsPromotion = data.needsPromotion || false;
        this.needsFeeCalculation = data.needsFeeCalculation || false;
        this.loadingReminders = false;
      },
      error: (err: any) => {
        console.error('Error loading reminders:', err);
        this.loadingReminders = false;
      }
    });
  }

  processOpeningDay() {
    if (!confirm('Are you sure you want to process opening day? This will mark all pending invoices as due.')) {
      return;
    }

    this.processingOpeningDay = true;
    this.error = '';
    this.success = '';

    this.settingsService.processOpeningDay().subscribe({
      next: (response: any) => {
        this.success = response.message || 'Opening day processed successfully!';
        this.processingOpeningDay = false;
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        console.error('Error processing opening day:', err);
        this.error = err.error?.message || 'Failed to process opening day. Please try again.';
        this.processingOpeningDay = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  processClosingDay() {
    if (!confirm('Are you sure you want to process closing day? This will calculate closing balances for all students (current balance + fees for next term).')) {
      return;
    }

    this.processingClosingDay = true;
    this.error = '';
    this.success = '';

    this.settingsService.processClosingDay().subscribe({
      next: (response: any) => {
        this.success = response.message || 'Closing day processed successfully!';
        this.processingClosingDay = false;
        this.loadReminders(); // Refresh reminders after processing
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        console.error('Error processing closing day:', err);
        this.error = err.error?.message || 'Failed to process closing day. Please try again.';
        this.processingClosingDay = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }
}


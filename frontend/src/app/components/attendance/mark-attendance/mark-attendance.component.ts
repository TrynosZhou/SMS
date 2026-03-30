import { Component, OnInit } from '@angular/core';
import { AttendanceService } from '../../../services/attendance.service';
import { ClassService } from '../../../services/class.service';
import { TeacherService } from '../../../services/teacher.service';
import { StudentService } from '../../../services/student.service';
import { SettingsService } from '../../../services/settings.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-mark-attendance',
  templateUrl: './mark-attendance.component.html',
  styleUrls: ['./mark-attendance.component.css']
})
export class MarkAttendanceComponent implements OnInit {
  classes: any[] = [];
  students: any[] = [];
  selectedClassId: string = '';
  selectedDate: string = '';
  attendanceData: any[] = [];
  loading = false;
  submitting = false;
  success = '';
  error = '';
  currentTerm: string = '';
  searchQuery: string = '';
  filteredAttendanceData: any[] = [];
  /** Filtered data sorted by last name ascending and grouped by gender for display */
  filteredAttendanceDataGroupedByGender: { gender: string; items: any[] }[] = [];
  statusFilter: string = 'all'; // 'all', 'present', 'absent', 'late', 'excused'
  hasUnsavedChanges = false;
  lastSavedDate: Date | null = null;

  // Bulk marking properties
  showBulkModal = false;
  showReverseBulkModal = false;
  bulkSelectedClassId = '';
  reverseBulkSelectedClassId = '';
  bulkMarkingInProgress = false;
  reverseBulkInProgress = false;
  bulkProgress = { total: 0, done: 0, skipped: 0, current: '' };
  reverseBulkProgress = { total: 0, done: 0, skipped: 0, current: '' };

  constructor(
    private attendanceService: AttendanceService,
    private classService: ClassService,
    private teacherService: TeacherService,
    private studentService: StudentService,
    private settingsService: SettingsService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.loadClasses();
    this.loadActiveTerm();
    // Set default date to today
    const today = new Date();
    this.selectedDate = this.toIsoDate(today);
    // Enforce Mon–Fri only: if today is weekend, move to nearest school day
    const normalized = this.normalizeToWeekday(this.selectedDate);
    if (normalized !== this.selectedDate) {
      this.selectedDate = normalized;
    }
  }

  loadActiveTerm() {
    this.settingsService.getActiveTerm().subscribe({
      next: (data: any) => {
        this.currentTerm = data.activeTerm || data.currentTerm || '';
      },
      error: (err: any) => {
        console.error('Error loading active term:', err);
      }
    });
  }

  loadClasses() {
    const user = this.authService.getCurrentUser();
    const isTeacher = user?.role === 'teacher';
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

    if (isTeacher && !(user as any).isUniversalTeacher) {
      // Teachers see only classes assigned to them
      this.teacherService.getCurrentTeacher().subscribe({
        next: (teacher: any) => {
          if (!teacher?.id) {
            this.classes = [];
            this.error = 'No teacher profile found. Please contact the administrator.';
            return;
          }
          this.teacherService.getTeacherClasses(teacher.id).subscribe({
            next: (response: any) => {
              const classesData = response?.classes || response || [];
              const arr = Array.isArray(classesData) ? classesData : [];
              this.classes = arr.filter((c: any) => c.isActive !== false);
              if (this.classes.length === 0) {
                this.error = 'No classes assigned to you. Please contact the administrator to assign a class.';
              } else {
                this.error = '';
              }
            },
            error: (err: any) => {
              this.error = 'Failed to load your assigned classes';
              this.classes = [];
              console.error(err);
            }
          });
        },
        error: (err: any) => {
          this.error = 'Failed to load teacher profile';
          this.classes = [];
          console.error(err);
        }
      });
    } else {
      // Admins and superadmins see all classes
      this.classService.getClasses().subscribe({
        next: (data: any) => {
          this.classes = data.filter((c: any) => c.isActive !== false);
          this.error = '';
        },
        error: (err: any) => {
          this.error = 'Failed to load classes';
          this.classes = [];
          console.error(err);
        }
      });
    }
  }

  onClassChange() {
    if (!this.selectedClassId) {
      this.students = [];
      this.attendanceData = [];
      return;
    }

    this.loading = true;
    this.error = '';
    
    // Load students for the selected class
    this.studentService.getStudents(this.selectedClassId).subscribe({
      next: (data: any) => {
        this.students = data.filter((s: any) => s.isActive);
        this.initializeAttendanceData();
        this.loadExistingAttendance();
        this.loading = false;
      },
      error: (err: any) => {
        this.error = 'Failed to load students';
        this.loading = false;
        console.error(err);
      }
    });
  }

  initializeAttendanceData() {
    this.attendanceData = this.students.map(student => ({
      studentId: student.id,
      status: 'present',
      remarks: ''
    }));
    this.updateFilteredData();
    this.hasUnsavedChanges = true;
  }

  loadExistingAttendance() {
    if (!this.selectedClassId || !this.selectedDate) {
      return;
    }

    this.attendanceService.getAttendance({
      classId: this.selectedClassId,
      date: this.selectedDate
    }).subscribe({
      next: (response: any) => {
        if (response.attendance && response.attendance.length > 0) {
          // Map existing attendance to our data structure
          const existingMap = new Map(
            response.attendance.map((a: any) => [a.studentId, a])
          );
          
          this.attendanceData = this.attendanceData.map(item => {
            const existing = existingMap.get(item.studentId) as any;
            if (existing) {
              return {
                studentId: item.studentId,
                status: existing.status,
                remarks: existing.remarks || ''
              };
            }
            return item;
          });
          this.updateFilteredData();
          this.hasUnsavedChanges = false;
        }
      },
      error: (err: any) => {
        // If no attendance found, that's okay - we'll create new records
        console.log('No existing attendance found for this date');
      }
    });
  }

  onDateChange() {
    if (this.selectedClassId && this.selectedDate) {
      // Enforce Mon–Fri only: if weekend selected, auto-correct to nearest weekday.
      const normalized = this.normalizeToWeekday(this.selectedDate);
      if (normalized !== this.selectedDate) {
        this.selectedDate = normalized;
        this.error = 'Weekends are not allowed. Date was moved to the nearest school day (Mon–Fri).';
      } else if (this.isWeekendSelected()) {
        // Fallback (should not happen because normalizeToWeekday handles it)
        this.error = 'You cannot mark attendance on weekends (Saturday or Sunday).';
      } else {
        this.error = '';
      }
      this.loadExistingAttendance();
    }
  }

  getStudentName(studentId: string): string {
    const student = this.students.find(s => s.id === studentId);
    return student ? `${student.firstName} ${student.lastName}` : '';
  }

  getStudentFirstName(studentId: string): string {
    const student = this.students.find(s => s.id === studentId);
    return student ? (student.firstName || '').trim() : '';
  }

  getStudentLastName(studentId: string): string {
    const student = this.students.find(s => s.id === studentId);
    return student ? (student.lastName || '').trim() : '';
  }

  getStudentGender(studentId: string): string {
    const student = this.students.find(s => s.id === studentId);
    const g = student?.gender || student?.sex;
    return g ? String(g).trim() : '';
  }

  getStudentNumber(studentId: string): string {
    const student = this.students.find(s => s.id === studentId);
    return student ? student.studentNumber : '';
  }

  markAll(status: string) {
    this.attendanceData.forEach(item => {
      item.status = status;
    });
    this.hasUnsavedChanges = true;
    this.updateFilteredData();
  }

  submitAttendance() {
    if (!this.selectedClassId || !this.selectedDate) {
      this.error = 'Please select a class and date';
      return;
    }

    if (this.isWeekendSelected()) {
      this.error = 'You cannot mark attendance on weekends (Saturday or Sunday).';
      return;
    }

    if (this.attendanceData.length === 0) {
      this.error = 'No students to mark attendance for';
      return;
    }

    this.submitting = true;
    this.error = '';
    this.success = '';

    this.attendanceService.markAttendance(
      this.selectedClassId,
      this.selectedDate,
      this.attendanceData
    ).subscribe({
      next: (response: any) => {
        const count = typeof response?.count === 'number' ? response.count : this.attendanceData.length;
        const msg = response?.message;
        const dateText = this.getFormattedDate();
        this.success = msg || `Attendance saved for ${dateText}. Records saved: ${count}.`;
        this.submitting = false;
        this.hasUnsavedChanges = false;
        this.lastSavedDate = new Date();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to mark attendance';
        this.submitting = false;
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  isWeekendSelected(): boolean {
    if (!this.selectedDate) return false;
    const day = this.getIsoWeekdayUtc(this.selectedDate);
    return day === 0 || day === 6;
  }

  private toIsoDate(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  private fromIsoDate(iso: string): Date {
    const { y, m, d } = this.parseIsoDateParts(iso);
    // Create a Date at UTC midnight for stable weekday math
    return new Date(Date.UTC(y, m - 1, d));
  }

  /**
   * Enforce school days only (Mon–Fri).
   * - Saturday → Friday (backward) or Monday (forward)
   * - Sunday   → Friday (backward) or Monday (forward)
   */
  private normalizeToWeekday(iso: string, direction: 'forward' | 'backward' = 'forward'): string {
    if (!iso) return iso;
    const d = this.fromIsoDate(iso);
    const day = d.getUTCDay(); // 0=Sun, 6=Sat (stable because d is UTC midnight)
    if (day === 6) {
      // Saturday
      d.setUTCDate(d.getUTCDate() + (direction === 'forward' ? 2 : -1));
      return this.toIsoDate(d);
    }
    if (day === 0) {
      // Sunday
      d.setUTCDate(d.getUTCDate() + (direction === 'forward' ? 1 : -2));
      return this.toIsoDate(d);
    }
    return iso;
  }

  private parseIsoDateParts(iso: string): { y: number; m: number; d: number } {
    const parts = String(iso || '').split('-').map(p => parseInt(p, 10));
    if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) {
      // Fallback: let Date parse if format is unexpected
      const dt = new Date(iso);
      return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
    }
    const [y, m, d] = parts;
    return { y, m, d };
  }

  /** Returns 0..6 for Sun..Sat computed from YYYY-MM-DD without timezone shifting. */
  private getIsoWeekdayUtc(iso: string): number {
    const { y, m, d } = this.parseIsoDateParts(iso);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  isAccountant(): boolean {
    return this.authService.isAccountant();
  }

  isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  openBulkModal() {
    this.showBulkModal = true;
    this.bulkSelectedClassId = '';
    this.bulkMarkingInProgress = false;
    this.bulkProgress = { total: 0, done: 0, skipped: 0, current: '' };
  }

  closeBulkModal() {
    if (this.bulkMarkingInProgress) return;
    this.showBulkModal = false;
  }

  openReverseBulkModal() {
    this.showReverseBulkModal = true;
    this.reverseBulkSelectedClassId = '';
    this.reverseBulkInProgress = false;
    this.reverseBulkProgress = { total: 0, done: 0, skipped: 0, current: '' };
  }

  closeReverseBulkModal() {
    if (this.reverseBulkInProgress) return;
    this.showReverseBulkModal = false;
  }

  async startReverseBulk() {
    if (!this.reverseBulkSelectedClassId) {
      this.error = 'Please select a class for reverse bulk marking';
      return;
    }

    if (!confirm('Are you sure you want to reverse bulk marking for this class? This will delete all attendance records for the entire term.')) {
      return;
    }

    this.reverseBulkInProgress = true;
    this.error = '';
    this.success = '';

    try {
      // 1. Fetch settings to get term start and end dates
      const settings = await this.settingsService.getSettings().toPromise();
      const termStartDateStr = settings.termStartDate || settings.openingDay;
      const termEndDateStr = settings.termEndDate || settings.closingDay;

      if (!termStartDateStr || !termEndDateStr) {
        throw new Error('Term start or end dates are not configured in settings');
      }

      const termStartDate = this.fromIsoDate(termStartDateStr);
      const termEndDate = this.fromIsoDate(termEndDateStr);

      // 2. Iterate through each date from start to end
      let currentDate = new Date(termStartDate);
      const datesToProcess: string[] = [];

      while (currentDate <= termEndDate) {
        const isoDate = this.toIsoDate(currentDate);
        const day = currentDate.getUTCDay();
        // Only process week days (Mon-Fri)
        if (day !== 0 && day !== 6) {
          datesToProcess.push(isoDate);
        }
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }

      this.reverseBulkProgress.total = datesToProcess.length;
      this.reverseBulkProgress.done = 0;
      this.reverseBulkProgress.skipped = 0;

      for (const date of datesToProcess) {
        this.reverseBulkProgress.current = date;

        // Check if attendance exists for this date
        const existing = await this.attendanceService.getAttendance({
          classId: this.reverseBulkSelectedClassId,
          date: date
        }).toPromise();

        if (existing && existing.attendance && existing.attendance.length > 0) {
          // Delete attendance for this date
          await this.attendanceService.deleteAttendance(this.reverseBulkSelectedClassId, date).toPromise();
          this.reverseBulkProgress.done++;
        } else {
          this.reverseBulkProgress.skipped++;
        }
      }

      this.success = `Reverse bulk marking completed. Records removed for ${this.reverseBulkProgress.done} days.`;
      this.reverseBulkInProgress = false;
      setTimeout(() => {
        this.closeReverseBulkModal();
        if (this.selectedClassId === this.reverseBulkSelectedClassId) {
          this.loadExistingAttendance();
        }
      }, 3000);

    } catch (err: any) {
      this.error = err.message || 'Failed to complete reverse bulk marking';
      this.reverseBulkInProgress = false;
    }
  }

  async startBulkMarking() {
    if (!this.bulkSelectedClassId) {
      this.error = 'Please select a class for bulk marking';
      return;
    }

    this.bulkMarkingInProgress = true;
    this.error = '';
    this.success = '';

    try {
      // 1. Fetch settings to get term start and end dates
      const settings = await this.settingsService.getSettings().toPromise();
      const termStartDateStr = settings.termStartDate || settings.openingDay;
      const termEndDateStr = settings.termEndDate || settings.closingDay;

      if (!termStartDateStr || !termEndDateStr) {
        throw new Error('Term start or end dates are not configured in settings');
      }

      const termStartDate = this.fromIsoDate(termStartDateStr);
      const termEndDate = this.fromIsoDate(termEndDateStr);
      
      // 2. Load students for the selected class to mark them all as present
      const students = await this.studentService.getStudents(this.bulkSelectedClassId).toPromise();
      if (!students) {
        throw new Error('Could not fetch students for the selected class');
      }
      const activeStudents = students.filter((s: any) => s.isActive);
      
      if (activeStudents.length === 0) {
        throw new Error('No active students found in the selected class');
      }

      const attendanceData = activeStudents.map((s: any) => ({
        studentId: s.id,
        status: 'present',
        remarks: 'Bulk marked as present'
      }));

      // 3. Iterate through each date from start to end
      let currentDate = new Date(termStartDate);
      const datesToProcess: string[] = [];
      
      while (currentDate <= termEndDate) {
        const isoDate = this.toIsoDate(currentDate);
        const day = currentDate.getUTCDay();
        // Skip weekends (0=Sun, 6=Sat)
        if (day !== 0 && day !== 6) {
          datesToProcess.push(isoDate);
        }
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }

      this.bulkProgress.total = datesToProcess.length;
      this.bulkProgress.done = 0;
      this.bulkProgress.skipped = 0;

      for (const date of datesToProcess) {
        this.bulkProgress.current = date;
        
        // Check if attendance already exists for this date
        const existing = await this.attendanceService.getAttendance({
          classId: this.bulkSelectedClassId,
          date: date
        }).toPromise();

        if (existing && existing.attendance && existing.attendance.length > 0) {
          this.bulkProgress.skipped++;
        } else {
          // Mark attendance
          await this.attendanceService.markAttendance(
            this.bulkSelectedClassId,
            date,
            attendanceData
          ).toPromise();
          this.bulkProgress.done++;
        }
      }

      this.success = `Bulk marking completed. Marked: ${this.bulkProgress.done}, Skipped: ${this.bulkProgress.skipped} (already marked).`;
      this.bulkMarkingInProgress = false;
      setTimeout(() => {
        this.closeBulkModal();
        if (this.selectedClassId === this.bulkSelectedClassId) {
          this.loadExistingAttendance();
        }
      }, 3000);

    } catch (err: any) {
      this.error = err.message || 'Failed to complete bulk marking';
      this.bulkMarkingInProgress = false;
    }
  }

  // Statistics
  getStatistics() {
    const stats = {
      present: 0,
      absent: 0,
      late: 0,
      total: this.attendanceData.length
    };
    
    this.attendanceData.forEach(item => {
      if (item.status === 'present') stats.present++;
      else if (item.status === 'absent') stats.absent++;
      else if (item.status === 'late') stats.late++;
    });
    
    return stats;
  }

  getAttendanceRate(): number {
    const stats = this.getStatistics();
    if (stats.total === 0) return 0;
    return Math.round((stats.present / stats.total) * 100);
  }

  // Search and Filter
  onSearchChange() {
    this.updateFilteredData();
  }

  onStatusFilterChange() {
    this.updateFilteredData();
  }

  updateFilteredData() {
    let filtered = [...this.attendanceData];

    // Apply search filter
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(item => {
        const name = this.getStudentName(item.studentId).toLowerCase();
        const number = this.getStudentNumber(item.studentId).toLowerCase();
        return name.includes(query) || number.includes(query);
      });
    }

    // Apply status filter
    if (this.statusFilter !== 'all') {
      filtered = filtered.filter(item => item.status === this.statusFilter);
    }

    // Sort by Gender ascending, then Lastname ascending
    filtered = filtered.slice().sort((a, b) => {
      const genderA = (this.getStudentGender(a.studentId) || '').toLowerCase();
      const genderB = (this.getStudentGender(b.studentId) || '').toLowerCase();
      const gComp = genderA.localeCompare(genderB, undefined, { sensitivity: 'base' });
      if (gComp !== 0) return gComp;
      const lastA = this.getStudentLastName(a.studentId).toLowerCase();
      const lastB = this.getStudentLastName(b.studentId).toLowerCase();
      return lastA.localeCompare(lastB, undefined, { sensitivity: 'base' });
    });

    this.filteredAttendanceData = filtered;

    // Do not display gender group headers; keep a flat list
    this.filteredAttendanceDataGroupedByGender = [{ gender: '', items: filtered }];
  }

  // Quick status update
  updateStatus(studentId: string, status: string) {
    const item = this.attendanceData.find(a => a.studentId === studentId);
    if (item) {
      item.status = status;
      this.hasUnsavedChanges = true;
      this.updateFilteredData();
    }
  }

  // Date navigation
  navigateDate(days: number) {
    const currentDate = this.fromIsoDate(this.selectedDate);
    currentDate.setDate(currentDate.getDate() + days);
    let nextIso = this.toIsoDate(currentDate);
    // Skip weekends when navigating
    nextIso = this.normalizeToWeekday(nextIso, days >= 0 ? 'forward' : 'backward');
    this.selectedDate = nextIso;
    this.onDateChange();
  }

  goToToday() {
    const today = new Date();
    let iso = this.toIsoDate(today);
    iso = this.normalizeToWeekday(iso);
    this.selectedDate = iso;
    this.onDateChange();
  }

  goToYesterday() {
    this.navigateDate(-1);
  }

  goToTomorrow() {
    this.navigateDate(1);
  }

  // Check if date is today
  isToday(): boolean {
    const today = new Date().toISOString().split('T')[0];
    return this.selectedDate === today;
  }

  // Check if date is in the past
  isPastDate(): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(this.selectedDate);
    selected.setHours(0, 0, 0, 0);
    return selected < today;
  }

  // Format date for display
  getFormattedDate(): string {
    if (!this.selectedDate) return '';
    // Expecting selectedDate in YYYY-MM-DD
    const parts = this.selectedDate.split('-');
    if (parts.length === 3) {
      const [yyyy, mm, dd] = parts;
      const p = (v: string) => v.padStart(2, '0');
      return `${p(dd)}/${p(mm)}/${yyyy}`;
    }
    // Fallback: format via Date if input is not canonical
    const d = new Date(this.selectedDate);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  // Clear search
  clearSearch() {
    this.searchQuery = '';
    this.updateFilteredData();
  }

  // Clear status filter
  clearStatusFilter() {
    this.statusFilter = 'all';
    this.updateFilteredData();
  }
}


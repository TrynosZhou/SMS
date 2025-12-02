import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TimetableService } from '../../services/timetable.service';
import { ClassService } from '../../services/class.service';
import { TeacherService } from '../../services/teacher.service';
import { SubjectService } from '../../services/subject.service';
import { SettingsService } from '../../services/settings.service';
import { AuthService } from '../../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

@Component({
  selector: 'app-timetable-generate',
  templateUrl: './timetable-generate.component.html',
  styleUrls: ['./timetable-generate.component.css']
})
export class TimetableGenerateComponent implements OnInit {
  // Data from backend
  teachers: any[] = [];
  classes: any[] = [];
  subjects: any[] = [];
  teacherAssignments: any[] = []; // Teacher-class-subject assignments
  
  // Selected timetable
  selectedTimetable: any = null;
  timetables: any[] = [];
  timetableEntries: any[] = [];
  
  // View options
  viewType: 'teacher' | 'class' | 'summary' = 'teacher';
  selectedTeacherId: string = '';
  selectedClassId: string = '';
  
  // Periods and days
  daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  periods: any[] = [];
  
  // Configuration
  config: any = null;
  
  // Generation state
  generating = false;
  conflicts: any[] = [];
  showConflicts = false;
  
  // Version control
  versions: any[] = [];
  currentVersion: any = null;
  
  // Manual editing
  editingEntry: any = null;
  editMode = false;
  
  // School info for PDF
  schoolName = '';
  schoolLogo = '';
  
  // User permissions
  isAdmin = false;
  isSuperAdmin = false;
  
  loading = false;
  error = '';
  success = '';
  
  constructor(
    private timetableService: TimetableService,
    private classService: ClassService,
    private teacherService: TeacherService,
    private subjectService: SubjectService,
    private settingsService: SettingsService,
    private authService: AuthService,
    private http: HttpClient,
    private router: Router
  ) {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? (user.role === 'admin') : false;
    this.isSuperAdmin = user ? (user.role === 'superadmin') : false;
  }
  
  ngOnInit() {
    this.loadConfig();
    this.loadAllData();
    this.loadTimetables();
    this.loadSchoolInfo();
  }
  
  loadConfig() {
    // Load settings first to get times
    this.settingsService.getSettings().subscribe({
      next: (settingsData: any) => {
        // Now load timetable config
        this.timetableService.getTimetableConfig().subscribe({
          next: (data: any) => {
            this.config = data;
            if (data) {
              this.daysOfWeek = data.daysOfWeek || this.daysOfWeek;
              
              // Ensure periodDuration is loaded from config (required - no default fallback)
              // If periodDuration is 40, it's an old value - update to 35
              if (this.config.periodDuration === 40) {
                console.warn('Period duration is 40 minutes (old default). Updating to 35 minutes.');
                this.config.periodDuration = 35;
              }
              
              if (!this.config.periodDuration || this.config.periodDuration <= 0) {
                console.error('Period duration not found in config! Please set it in timetable configuration.');
                this.config.periodDuration = 35; // Only use as last resort
              }
              
              // Log the period duration being used
              console.log('Using period duration:', this.config.periodDuration, 'minutes');
              
              // Use settings values if available, otherwise use config values
              if (settingsData?.schoolStartTime) {
                this.config.schoolStartTime = settingsData.schoolStartTime;
              }
              if (settingsData?.schoolEndTime) {
                this.config.schoolEndTime = settingsData.schoolEndTime;
              }
              
              // Ensure breaks are present (exactly 2)
              // If settings have breakTimes, use them
              if (settingsData?.breakTimes && Array.isArray(settingsData.breakTimes) && settingsData.breakTimes.length > 0) {
                this.config.breakPeriods = settingsData.breakTimes.map((breakTime: any, index: number) => ({
                  name: breakTime.name || (index === 0 ? 'Tea Break' : 'Lunch Break'),
                  startTime: breakTime.startTime || (index === 0 ? '10:00' : '12:00'),
                  endTime: breakTime.endTime || (index === 0 ? '10:20' : '13:00'),
                  periodAfter: index === 0 ? 4 : 8
                }));
              } else if (!data.breakPeriods || data.breakPeriods.length === 0) {
                this.config.breakPeriods = [
                  { name: 'Tea Break', startTime: '10:00', endTime: '10:20', periodAfter: 4 },
                  { name: 'Lunch Break', startTime: '12:00', endTime: '13:00', periodAfter: 8 }
                ];
              } else if (data.breakPeriods.length === 1) {
                this.config.breakPeriods = [...data.breakPeriods, { name: 'Lunch Break', startTime: '12:00', endTime: '13:00', periodAfter: 8 }];
              } else if (data.breakPeriods.length > 2) {
                this.config.breakPeriods = data.breakPeriods.slice(0, 2);
              }
              this.initializePeriods();
            }
          },
          error: (err) => {
            console.error('Error loading config:', err);
            // Use defaults with breaks
            this.config = {
              periodsPerDay: 14,
              schoolStartTime: settingsData?.schoolStartTime || '07:30:00',
              schoolEndTime: settingsData?.schoolEndTime || '16:10:00',
              periodDuration: 35, // Default fallback only - should always come from config
              daysOfWeek: this.daysOfWeek,
              breakPeriods: settingsData?.breakTimes ? settingsData.breakTimes.map((bt: any, i: number) => ({
                name: bt.name || (i === 0 ? 'Tea Break' : 'Lunch Break'),
                startTime: bt.startTime || (i === 0 ? '10:00' : '12:00'),
                endTime: bt.endTime || (i === 0 ? '10:20' : '13:00'),
                periodAfter: i === 0 ? 4 : 8
              })) : [
                { name: 'Tea Break', startTime: '10:00', endTime: '10:20', periodAfter: 4 },
                { name: 'Lunch Break', startTime: '12:00', endTime: '13:00', periodAfter: 8 }
              ]
            };
            this.initializePeriods();
          }
        });
      },
      error: (settingsErr) => {
        console.error('Error loading settings:', settingsErr);
        // Fallback to loading config without settings
        this.timetableService.getTimetableConfig().subscribe({
          next: (data: any) => {
            this.config = data;
            if (data) {
              this.daysOfWeek = data.daysOfWeek || this.daysOfWeek;
              if (!data.breakPeriods || data.breakPeriods.length === 0) {
                this.config.breakPeriods = [
                { name: 'Tea Break', startTime: '10:00', endTime: '10:20', periodAfter: 4 },
                { name: 'Lunch Break', startTime: '12:00', endTime: '13:00', periodAfter: 8 }
                ];
              }
              this.initializePeriods();
            }
          },
          error: (err) => {
            console.error('Error loading config:', err);
            this.initializePeriods();
          }
        });
      }
    });
  }
  
  loadSchoolInfo() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.schoolName = data?.schoolName || 'School';
        this.schoolLogo = data?.logo || '';
        
        // Update config with times from settings if available
        if (data.schoolStartTime && this.config) {
          this.config.schoolStartTime = data.schoolStartTime;
        }
        if (data.schoolEndTime && this.config) {
          this.config.schoolEndTime = data.schoolEndTime;
        }
        if (data.breakTimes && Array.isArray(data.breakTimes) && data.breakTimes.length > 0 && this.config) {
          // Map breakTimes from settings to breakPeriods format
          this.config.breakPeriods = data.breakTimes.map((breakTime: any, index: number) => ({
            name: breakTime.name || (index === 0 ? 'Tea Break' : 'Lunch Break'),
            startTime: breakTime.startTime || (index === 0 ? '10:00' : '12:00'),
            endTime: breakTime.endTime || (index === 0 ? '10:20' : '13:00'),
            periodAfter: index === 0 ? 4 : 8
          }));
          // Ensure exactly 2 breaks
          while (this.config.breakPeriods.length < 2) {
            this.config.breakPeriods.push({
              name: this.config.breakPeriods.length === 0 ? 'Tea Break' : 'Lunch Break',
              startTime: this.config.breakPeriods.length === 0 ? '10:00' : '12:00',
              endTime: this.config.breakPeriods.length === 0 ? '10:20' : '13:00',
              periodAfter: this.config.breakPeriods.length === 0 ? 4 : 8
            });
          }
          if (this.config.breakPeriods.length > 2) {
            this.config.breakPeriods = this.config.breakPeriods.slice(0, 2);
          }
          // Reinitialize periods with updated break times
          this.initializePeriods();
        }
      },
      error: (err) => {
        console.error('Error loading school info:', err);
      }
    });
  }
  
  initializePeriods() {
    if (this.config) {
      const start = this.parseTime(this.config.schoolStartTime);
      
      // Ensure periodDuration is 35 (not 40)
      if (this.config.periodDuration === 40) {
        console.warn('Period duration is 40 minutes (old default). Updating to 35 minutes.');
        this.config.periodDuration = 35;
      }
      
      if (!this.config.periodDuration || this.config.periodDuration <= 0) {
        console.warn('Period duration not set in config, using 35 minutes as default');
        this.config.periodDuration = 35;
      }
      
      const periodDuration = this.config.periodDuration;
      console.log('Calculating periods with duration:', periodDuration, 'minutes');
      this.periods = [];
      
      // Get break periods (exactly 2) - sorted by periodAfter
      const breakPeriods = (this.config.breakPeriods || [
        { name: 'Tea Break', startTime: '10:00', endTime: '10:20', periodAfter: 4 },
        { name: 'Lunch Break', startTime: '12:00', endTime: '13:00', periodAfter: 8 }
      ]).sort((a: any, b: any) => a.periodAfter - b.periodAfter);
      
      let periodNumber = 1;
      let currentTime = new Date(start);
      
      // Build periods array with breaks inserted at correct positions
      for (let i = 1; i <= this.config.periodsPerDay; i++) {
        // Check if there's a break after this period
        const breakAfter = breakPeriods.find((b: any) => b.periodAfter === i);
        
        // Calculate period times strictly (not counting breaks in period numbering)
        const periodStart = new Date(currentTime);
        const periodEnd = new Date(periodStart);
        periodEnd.setMinutes(periodEnd.getMinutes() + periodDuration);
        
        // Add the period
        this.periods.push({
          id: periodNumber,
          name: `Period ${periodNumber}`,
          startTime: this.formatTime(periodStart),
          endTime: this.formatTime(periodEnd),
          isBreak: false,
          periodNumber: periodNumber
        });
        
        periodNumber++;
        currentTime = new Date(periodEnd);
        
        // Add break if needed (using strict times from config)
        if (breakAfter) {
          const breakStart = this.parseTime(breakAfter.startTime);
          const breakEnd = this.parseTime(breakAfter.endTime);
          
          this.periods.push({
            id: `break-${i}`,
            name: breakAfter.name || 'Break',
            startTime: this.formatTime(breakStart),
            endTime: this.formatTime(breakEnd),
            isBreak: true,
            breakLabel: breakAfter.name,
            periodAfter: breakAfter.periodAfter
          });
          
          // Update current time to after break (strict time from config)
          currentTime = new Date(breakEnd);
        }
      }
    } else {
      // Default periods with breaks (14 periods starting at 07:30)
      this.periods = [
        { id: 1, name: 'Period 1', startTime: '07:30', endTime: '08:10', isBreak: false, periodNumber: 1 },
        { id: 2, name: 'Period 2', startTime: '08:10', endTime: '08:50', isBreak: false, periodNumber: 2 },
        { id: 3, name: 'Period 3', startTime: '08:50', endTime: '09:30', isBreak: false, periodNumber: 3 },
        { id: 'break-4', name: 'Tea Break', startTime: '10:00', endTime: '10:20', isBreak: true, breakLabel: 'Tea Break', periodAfter: 4 },
        { id: 4, name: 'Period 4', startTime: '10:20', endTime: '11:00', isBreak: false, periodNumber: 4 },
        { id: 5, name: 'Period 5', startTime: '11:00', endTime: '11:40', isBreak: false, periodNumber: 5 },
        { id: 'break-8', name: 'Lunch Break', startTime: '12:00', endTime: '13:00', isBreak: true, breakLabel: 'Lunch Break', periodAfter: 8 },
        { id: 6, name: 'Period 6', startTime: '13:00', endTime: '13:40', isBreak: false, periodNumber: 6 },
        { id: 7, name: 'Period 7', startTime: '13:40', endTime: '14:20', isBreak: false, periodNumber: 7 },
        { id: 8, name: 'Period 8', startTime: '14:20', endTime: '15:00', isBreak: false, periodNumber: 8 },
        { id: 9, name: 'Period 9', startTime: '15:00', endTime: '15:40', isBreak: false, periodNumber: 9 },
        { id: 10, name: 'Period 10', startTime: '15:40', endTime: '16:10', isBreak: false, periodNumber: 10 }
      ];
    }
  }
  
  private parseTime(time: string): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes || 0, 0, 0);
    return date;
  }
  
  private formatTime(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  
  loadAllData() {
    this.loading = true;
    this.error = '';
    
    // Load teachers with their assignments
    this.teacherService.getTeachers().subscribe({
      next: (teachersData: any) => {
        const teachersArray = Array.isArray(teachersData) ? teachersData : [];
        this.teachers = teachersArray.filter((t: any) => t.isActive);
        
        // Load teacher assignments (classes and subjects)
        this.loadTeacherAssignments();
      },
      error: (err) => {
        console.error('Error loading teachers:', err);
        this.error = 'Failed to load teachers';
        this.loading = false;
      }
    });
    
    // Load classes
    this.classService.getClasses().subscribe({
      next: (classesData: any) => {
        const classesArray = Array.isArray(classesData) ? classesData : [];
        this.classes = classesArray.filter((c: any) => c.isActive);
      },
      error: (err) => {
        console.error('Error loading classes:', err);
      }
    });
    
    // Load subjects
    this.subjectService.getSubjects().subscribe({
      next: (subjectsData: any) => {
        const subjectsArray = Array.isArray(subjectsData) ? subjectsData : [];
        this.subjects = subjectsArray;
      },
      error: (err) => {
        console.error('Error loading subjects:', err);
      }
    });
  }
  
  loadTeacherAssignments() {
    // Fetch teacher assignments from backend
    // Each teacher has classes and subjects assigned
    const assignments: any[] = [];
    let loadedCount = 0;
    const totalTeachers = this.teachers.length;
    
    if (totalTeachers === 0) {
      this.loading = false;
      return;
    }
    
    this.teachers.forEach((teacher: any) => {
      // Load teacher details with classes and subjects
      this.http.get(`${environment.apiUrl}/teachers/${teacher.id}`).subscribe({
        next: (teacherData: any) => {
          const teacherWithAssignments = teacherData.teacher || teacherData;
          
          if (teacherWithAssignments.classes && Array.isArray(teacherWithAssignments.classes)) {
            teacherWithAssignments.classes.forEach((classItem: any) => {
              if (teacherWithAssignments.subjects && Array.isArray(teacherWithAssignments.subjects)) {
                teacherWithAssignments.subjects.forEach((subject: any) => {
                  assignments.push({
                    teacherId: teacher.id,
                    teacherName: `${teacher.firstName} ${teacher.lastName}`,
                    classId: classItem.id,
                    className: classItem.name,
                    subjectId: subject.id,
                    subjectName: subject.name
                  });
                });
              }
            });
          }
          
          loadedCount++;
          
          // Update teacher assignments when all teachers are processed
          if (loadedCount === totalTeachers) {
            this.teacherAssignments = assignments;
            this.loading = false;
          }
        },
        error: (err) => {
          console.error(`Error loading assignments for teacher ${teacher.id}:`, err);
          loadedCount++;
          
          if (loadedCount === totalTeachers) {
            this.teacherAssignments = assignments;
            this.loading = false;
          }
        }
      });
    });
  }
  
  loadTimetables() {
    this.timetableService.getTimetables().subscribe({
      next: (data: any) => {
        const timetablesArray = Array.isArray(data) ? data : (data?.timetables || data?.data || []);
        this.timetables = timetablesArray;
        if (this.timetables.length > 0 && !this.selectedTimetable) {
          this.selectedTimetable = this.timetables[0];
          this.loadTimetableEntries(this.selectedTimetable.id);
        } else if (this.timetables.length === 0) {
          // No timetables exist - user needs to create one first
          this.error = 'No timetables found. Please create a timetable first.';
        }
      },
      error: (err) => {
        console.error('Error loading timetables:', err);
        this.error = 'Failed to load timetables. Please try again.';
      }
    });
  }
  
  createNewTimetable() {
    if (!this.isAdmin && !this.isSuperAdmin) {
      this.error = 'You do not have permission to create timetables';
      return;
    }
    
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const term = currentDate.getMonth() < 6 ? 'Term 1' : 'Term 2';
    
    const newTimetable = {
      name: `Timetable ${term} ${currentYear}`,
      term: term,
      academicYear: `${currentYear}`,
      startDate: null,
      endDate: null,
      isActive: true,
      entries: []
    };
    
    this.loading = true;
    this.timetableService.createTimetable(newTimetable).subscribe({
      next: (data: any) => {
        this.success = 'Timetable created successfully';
        this.loadTimetables();
        this.loading = false;
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        console.error('Error creating timetable:', err);
        this.error = err.error?.message || 'Failed to create timetable';
        this.loading = false;
      }
    });
  }
  
  loadTimetableEntries(timetableId: string) {
    this.loading = true;
    this.timetableService.getTimetableById(timetableId).subscribe({
      next: (data: any) => {
        this.timetableEntries = data?.entries || [];
        this.loadVersions(timetableId);
        this.detectConflicts();
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading timetable entries:', err);
        this.error = 'Failed to load timetable entries';
        this.loading = false;
      }
    });
  }
  
  loadVersions(timetableId: string) {
    this.timetableService.getTimetableVersions(timetableId).subscribe({
      next: (data: any) => {
        this.versions = data?.versions || [];
        this.currentVersion = this.versions.find((v: any) => v.isActive) || this.versions[0];
      },
      error: (err) => {
        console.error('Error loading versions:', err);
      }
    });
  }
  
  detectConflicts() {
    if (!this.selectedTimetable) return;
    
    this.timetableService.detectConflicts(this.selectedTimetable.id).subscribe({
      next: (data: any) => {
        this.conflicts = data?.conflicts || [];
        this.showConflicts = this.conflicts.length > 0;
      },
      error: (err) => {
        console.error('Error detecting conflicts:', err);
      }
    });
  }
  
  onTimetableChange() {
    if (this.selectedTimetable) {
      this.loadTimetableEntries(this.selectedTimetable.id);
      // Reset filters when timetable changes
      this.selectedTeacherId = '';
      this.selectedClassId = '';
    } else {
      this.timetableEntries = [];
      this.conflicts = [];
      this.showConflicts = false;
    }
  }
  
  onViewTypeChange() {
    // Reset filters when view type changes
    this.selectedTeacherId = '';
    this.selectedClassId = '';
  }

  generateTimetable() {
    if (!this.selectedTimetable) {
      this.error = 'Please select a timetable first';
      return;
    }
    
    if (!this.isAdmin && !this.isSuperAdmin) {
      this.error = 'You do not have permission to generate timetables';
      return;
    }
    
    this.generating = true;
    this.error = '';
    this.success = '';
    
    // Get assignments from backend
    this.timetableService.getAssignments().subscribe({
      next: (assignmentsData: any) => {
        const assignments = assignmentsData?.assignments || [];
        
        // Use config.id if available, otherwise use null (backend will handle it)
        const configId = this.config?.id || null;
        
        this.timetableService.generateTimetable(
          this.selectedTimetable.id,
          configId,
          assignments
        ).subscribe({
          next: (result: any) => {
            this.success = result.message || 'Timetable generated successfully';
            // No conflicts during auto-generation
            this.conflicts = [];
            this.showConflicts = false;
            
            // Reload timetable entries
            this.loadTimetableEntries(this.selectedTimetable.id);
            
            // Create version (only if versioning tables exist)
            this.timetableService.createTimetableVersion(
              this.selectedTimetable.id,
              'Auto-generated timetable'
            ).subscribe({
              next: () => {
                this.loadVersions(this.selectedTimetable.id);
              },
              error: (versionErr) => {
                // Version creation is optional, just log the error
                console.warn('Could not create version (tables may not exist):', versionErr);
              }
            });
            
            this.generating = false;
            setTimeout(() => this.success = '', 5000);
          },
          error: (err) => {
            console.error('Error generating timetable:', err);
            this.error = err.error?.message || 'Failed to generate timetable';
            this.generating = false;
          }
        });
      },
      error: (err) => {
        console.error('Error loading assignments:', err);
        this.error = 'Failed to load teacher assignments';
        this.generating = false;
      }
    });
  }
  
  // Manual editing
  editEntry(entry: any) {
    if (!this.isAdmin && !this.isSuperAdmin) {
      this.error = 'You do not have permission to edit entries';
      return;
    }
    
    this.editingEntry = { ...entry };
    this.editMode = true;
  }
  
  saveEntry() {
    if (!this.editingEntry || !this.selectedTimetable) return;
    
    const entryData = {
      timetableId: this.selectedTimetable.id,
      day: this.editingEntry.day,
      period: this.editingEntry.period,
      teacherId: this.editingEntry.teacherId || null,
      classId: this.editingEntry.classId || null,
      subjectId: this.editingEntry.subjectId || null,
      room: this.editingEntry.room || null,
      isLocked: this.editingEntry.isLocked || false
    };

    // If new entry, create it manually (with conflict checking)
    if (!this.editingEntry.id || this.editingEntry.id.toString().startsWith('temp_')) {
      this.timetableService.createEntryManual(entryData).subscribe({
        next: (result: any) => {
          if (result.conflicts && result.conflicts.length > 0) {
            // Show conflicts
            this.conflicts = result.conflicts;
            this.showConflicts = true;
            this.error = 'Conflicts detected. Please resolve them before saving.';
          } else {
            this.success = 'Entry added successfully';
            this.loadTimetableEntries(this.selectedTimetable.id);
            this.editingEntry = null;
            this.editMode = false;
            this.conflicts = [];
            this.showConflicts = false;
            setTimeout(() => this.success = '', 3000);
          }
        },
        error: (err) => {
          console.error('Error creating entry:', err);
          if (err.status === 409 && err.error?.conflicts) {
            // Conflict error
            this.conflicts = err.error.conflicts;
            this.showConflicts = true;
            this.error = 'Conflicts detected: ' + err.error.conflicts.map((c: any) => c.message).join(', ');
          } else {
            this.error = err.error?.message || 'Failed to create entry';
          }
        }
      });
    } else {
      // Update existing entry manually (with conflict checking)
      this.timetableService.updateEntryManual(this.editingEntry.id, entryData).subscribe({
        next: (result: any) => {
          if (result.conflicts && result.conflicts.length > 0) {
            // Show conflicts
            this.conflicts = result.conflicts;
            this.showConflicts = true;
            this.error = 'Conflicts detected. Please resolve them before saving.';
          } else {
            this.success = 'Entry updated successfully';
            this.loadTimetableEntries(this.selectedTimetable.id);
            this.editingEntry = null;
            this.editMode = false;
            this.conflicts = [];
            this.showConflicts = false;
            setTimeout(() => this.success = '', 3000);
          }
        },
        error: (err) => {
          console.error('Error updating entry:', err);
          if (err.status === 409 && err.error?.conflicts) {
            // Conflict error
            this.conflicts = err.error.conflicts;
            this.showConflicts = true;
            this.error = 'Conflicts detected: ' + err.error.conflicts.map((c: any) => c.message).join(', ');
          } else {
            this.error = err.error?.message || 'Failed to update entry';
          }
        }
      });
    }
  }
  
  toggleLock(entry: any) {
    if (!this.isAdmin && !this.isSuperAdmin) {
      this.error = 'You do not have permission to lock entries';
      return;
    }
    
    const newLockState = !entry.isLocked;
    this.timetableService.toggleEntryLock(entry.id, newLockState).subscribe({
      next: (result: any) => {
        this.success = `Entry ${newLockState ? 'locked' : 'unlocked'} successfully`;
        this.loadTimetableEntries(this.selectedTimetable.id);
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        console.error('Error toggling lock:', err);
        this.error = err.error?.message || 'Failed to toggle lock';
      }
    });
  }
  
  cancelEdit() {
    this.editMode = false;
    this.editingEntry = null;
  }
  
  deleteEntry(entry: any) {
    if (entry.isLocked) {
      this.error = 'Cannot delete a locked entry. Unlock it first.';
      return;
    }
    if (!this.isAdmin && !this.isSuperAdmin) {
      this.error = 'You do not have permission to delete entries';
      return;
    }
    
    if (!confirm('Are you sure you want to delete this entry?')) {
      return;
    }
    
    this.timetableEntries = this.timetableEntries.filter(e => e.id !== entry.id);
    
    this.timetableService.updateTimetable(this.selectedTimetable.id, {
      entries: this.timetableEntries
    }).subscribe({
      next: () => {
        this.success = 'Entry deleted successfully';
        this.detectConflicts();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to delete entry';
      }
    });
  }
  
  checkPotentialConflicts(entry: any): any[] {
    const conflicts: any[] = [];
    
    // Check teacher conflicts
    const teacherConflicts = this.timetableEntries.filter(e => 
      e.id !== entry.id &&
      e.teacherId === entry.teacherId &&
      e.day === entry.day &&
      e.period === entry.period
    );
    
    if (teacherConflicts.length > 0) {
      conflicts.push({
        type: 'teacher',
        message: `Teacher is already assigned at this time`
      });
    }
    
    // Check class conflicts
    const classConflicts = this.timetableEntries.filter(e => 
      e.id !== entry.id &&
      e.classId === entry.classId &&
      e.day === entry.day &&
      e.period === entry.period
    );
    
    if (classConflicts.length > 0) {
      conflicts.push({
        type: 'class',
        message: `Class already has a lesson at this time`
      });
    }
    
    return conflicts;
  }
  
  hasConflict(day: string, period: number, teacherId?: string, classId?: string): boolean {
    if (!this.conflicts || this.conflicts.length === 0) return false;
    
    const periodStr = period.toString();
    return this.conflicts.some(conflict => {
      const matchesDay = conflict.day === day;
      const matchesPeriod = conflict.period === periodStr;
      const matchesTeacher = !teacherId || conflict.entityId === teacherId || 
        (conflict.type === 'teacher' && conflict.entityId === teacherId);
      const matchesClass = !classId || conflict.entityId === classId ||
        (conflict.type === 'class' && conflict.entityId === classId);
      
      return matchesDay && matchesPeriod && (matchesTeacher || matchesClass);
    });
  }
  
  addEntry(day: string, period: number, teacherId?: string, classId?: string) {
    if (!this.isAdmin && !this.isSuperAdmin) {
      this.error = 'You do not have permission to add entries';
      return;
    }
    
    if (!this.selectedTimetable) {
      this.error = 'Please select a timetable first';
      return;
    }
    
    this.editingEntry = {
      id: null,
      timetableId: this.selectedTimetable.id,
      day: day,
      period: period.toString(),
      teacherId: teacherId || null,
      classId: classId || null,
      subjectId: null,
      room: null
    };
    
    this.editMode = true;
  }
  
  // Get timetable entries for a specific teacher
  getTeacherTimetable(teacherId: string): any[] {
    return this.timetableEntries.filter((entry: any) => entry.teacherId === teacherId);
  }
  
  // Get timetable entries for a specific class
  getClassTimetable(classId: string): any[] {
    return this.timetableEntries.filter((entry: any) => entry.classId === classId);
  }
  
  // Get teacher summary
  getTeacherSummary(): any[] {
    const summaryMap = new Map<string, any>();
    
    this.timetableEntries.forEach((entry: any) => {
      if (!entry.teacherId) return;
      
      if (!summaryMap.has(entry.teacherId)) {
        const teacher = this.teachers.find(t => t.id === entry.teacherId);
        summaryMap.set(entry.teacherId, {
          teacherId: entry.teacherId,
          teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Unknown',
          totalPeriods: 0,
          subjects: new Set<string>(),
          classes: new Set<string>()
        });
      }
      
      const summary = summaryMap.get(entry.teacherId);
      summary.totalPeriods++;
      if (entry.subjectId) summary.subjects.add(entry.subjectId);
      if (entry.classId) summary.classes.add(entry.classId);
    });
    
    return Array.from(summaryMap.values()).map(summary => ({
      ...summary,
      subjects: Array.from(summary.subjects as Set<string>).map((id: string) => this.getSubjectName(id)),
      classes: Array.from(summary.classes as Set<string>).map((id: string) => this.getClassName(id))
    }));
  }
  
  // Helper methods
  getTeacherName(teacherId: string): string {
    const teacher = this.teachers.find(t => t.id === teacherId);
    return teacher ? `${teacher.firstName} ${teacher.lastName}` : 'N/A';
  }
  
  getClassName(classId: string): string {
    const classItem = this.classes.find(c => c.id === classId);
    return classItem ? classItem.name : 'N/A';
  }
  
  getSubjectName(subjectId: string): string {
    const subject = this.subjects.find(s => s.id === subjectId);
    return subject ? subject.name : 'N/A';
  }
  
  getEntryForCell(day: string, period: number, teacherId?: string, classId?: string): any {
    return this.timetableEntries.find(entry => {
      const matchesDay = entry.day === day;
      const matchesPeriod = parseInt(entry.period) === period;
      const matchesTeacher = !teacherId || entry.teacherId === teacherId;
      const matchesClass = !classId || entry.classId === classId;
      return matchesDay && matchesPeriod && matchesTeacher && matchesClass;
    });
  }
  
  // PDF Generation with school logo and name
  async previewPDF() {
    const element = document.getElementById('timetable-preview');
    if (!element) {
      this.error = 'Timetable preview element not found';
      return;
    }
    
    try {
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      let position = 0;
      
      // Add header with school logo and name
      this.addPDFHeader(pdf);
      
      // Add timetable content
      pdf.addImage(imgData, 'PNG', 0, 30, imgWidth, imgHeight);
      heightLeft -= (pageHeight - 30);
      
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      // Open in new window for preview
      const pdfBlob = pdf.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      window.open(pdfUrl, '_blank');
    } catch (error: any) {
      this.error = 'Failed to generate PDF preview: ' + error.message;
    }
  }
  
  async downloadPDF() {
    const element = document.getElementById('timetable-preview');
    if (!element) {
      this.error = 'Timetable preview element not found';
      return;
    }
    
    try {
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      let position = 0;
      
      // Add header with school logo and name
      this.addPDFHeader(pdf);
      
      // Add timetable content
      pdf.addImage(imgData, 'PNG', 0, 30, imgWidth, imgHeight);
      heightLeft -= (pageHeight - 30);
      
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      // Generate filename
      const timetableName = this.selectedTimetable?.name || 'timetable';
      const viewType = this.viewType.charAt(0).toUpperCase() + this.viewType.slice(1);
      const filename = `${timetableName}_${viewType}_${new Date().getTime()}.pdf`;
      
      pdf.save(filename);
      this.success = 'PDF downloaded successfully';
      setTimeout(() => this.success = '', 3000);
    } catch (error: any) {
      this.error = 'Failed to generate PDF: ' + error.message;
    }
  }
  
  private addPDFHeader(pdf: jsPDF) {
    // Add school name
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text(this.schoolName || 'School', 105, 15, { align: 'center' });
    
    // Add timetable title
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    const timetableTitle = this.selectedTimetable?.name || 'Timetable';
    pdf.text(timetableTitle, 105, 22, { align: 'center' });
    
    // Add school logo if available
    if (this.schoolLogo) {
      try {
        // If logo is a base64 string or URL, add it
        const logoX = 10;
        const logoY = 5;
        const logoWidth = 15;
        const logoHeight = 15;
        
        pdf.addImage(this.schoolLogo, 'PNG', logoX, logoY, logoWidth, logoHeight);
      } catch (error) {
        console.warn('Could not add logo to PDF:', error);
      }
    }
    
    // Add line separator
    pdf.setLineWidth(0.5);
    pdf.line(10, 25, 200, 25);
  }
  
  goBack() {
    this.router.navigate(['/dashboard']);
  }
}


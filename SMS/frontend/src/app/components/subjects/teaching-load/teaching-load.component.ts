import { Component, OnInit } from '@angular/core';
import { SubjectService } from '../../../services/subject.service';
import { TimetableService } from '../../../services/timetable.service';
import { ClassService } from '../../../services/class.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-teaching-load',
  templateUrl: './teaching-load.component.html',
  styleUrls: ['./teaching-load.component.css']
})
export class TeachingLoadComponent implements OnInit {
  subjects: any[] = [];
  teachingLoads: any[] = [];
  filteredTeachingLoads: any[] = [];
  loading = false;
  saving = false;
  error = '';
  success = '';
  searchQuery = '';
  isAdmin = false;
  isSuperAdmin = false;
  hasUnsavedChanges = false;

  constructor(
    private subjectService: SubjectService,
    private timetableService: TimetableService,
    private classService: ClassService,
    private authService: AuthService
  ) {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? (user.role === 'admin') : false;
    this.isSuperAdmin = user ? (user.role === 'superadmin') : false;
  }

  ngOnInit() {
    this.loadTeachingLoads();
  }

  loadTeachingLoads() {
    this.loading = true;
    this.error = '';

    // Load subjects and timetable entries
    this.subjectService.getSubjects().subscribe({
      next: (subjectsData: any) => {
        const subjectsArray = Array.isArray(subjectsData) ? subjectsData : (subjectsData?.subjects || []);
        this.subjects = subjectsArray.filter((s: any) => s.isActive);

        // Load timetable entries to count periods
        this.timetableService.getTimetables().subscribe({
          next: (timetablesData: any) => {
            const timetables = Array.isArray(timetablesData) ? timetablesData : (timetablesData?.timetables || []);
            
            // Load all timetable entries
            this.loadAllTimetableEntries(timetables);
          },
          error: (err) => {
            console.error('Error loading timetables:', err);
            this.calculateTeachingLoads([]);
            this.loading = false;
          }
        });
      },
      error: (err) => {
        console.error('Error loading subjects:', err);
        this.error = 'Failed to load subjects';
        this.loading = false;
      }
    });
  }

  loadAllTimetableEntries(timetables: any[]) {
    const allEntries: any[] = [];
    let loadedCount = 0;

    if (timetables.length === 0) {
      this.calculateTeachingLoads([]);
      this.loading = false;
      return;
    }

    timetables.forEach((timetable: any) => {
      this.timetableService.getTimetableById(timetable.id).subscribe({
        next: (data: any) => {
          if (data?.entries && Array.isArray(data.entries)) {
            allEntries.push(...data.entries);
          }
          loadedCount++;
          
          if (loadedCount === timetables.length) {
            this.calculateTeachingLoads(allEntries);
            this.loading = false;
          }
        },
        error: (err) => {
          console.error(`Error loading timetable ${timetable.id}:`, err);
          loadedCount++;
          
          if (loadedCount === timetables.length) {
            this.calculateTeachingLoads(allEntries);
            this.loading = false;
          }
        }
      });
    });
  }

  calculateTeachingLoads(entries: any[]) {
    // Count periods per subject
    const subjectPeriodCount: { [key: string]: { subject: any; periods: number; classes: Set<string> } } = {};

    // Initialize with all subjects - prioritize saved teachingPeriods
    this.subjects.forEach((subject: any) => {
      // Use saved teachingPeriods if available, otherwise calculate from entries
      const savedPeriods = subject.teachingPeriods !== null && subject.teachingPeriods !== undefined 
        ? subject.teachingPeriods 
        : null;
      
      subjectPeriodCount[subject.id] = {
        subject: subject,
        periods: savedPeriods !== null ? savedPeriods : 0, // Use saved value if exists
        classes: new Set<string>()
      };
    });

    // Count periods from timetable entries only if no saved periods exist
    entries.forEach((entry: any) => {
      if (entry.subjectId && subjectPeriodCount[entry.subjectId]) {
        // Only count from entries if no saved periods exist for this subject
        if (subjectPeriodCount[entry.subjectId].subject.teachingPeriods === null || 
            subjectPeriodCount[entry.subjectId].subject.teachingPeriods === undefined) {
          subjectPeriodCount[entry.subjectId].periods++;
        }
        if (entry.classId) {
          subjectPeriodCount[entry.subjectId].classes.add(entry.classId);
        }
      }
    });

    // Load class names for display
    this.classService.getClasses().subscribe({
      next: (classesData: any) => {
        const classesArray = Array.isArray(classesData) ? classesData : (classesData?.classes || []);
        const classMap = new Map<string, any>();
        classesArray.forEach((c: any) => {
          classMap.set(c.id, c);
        });

        // Build teaching load array
        this.teachingLoads = Object.values(subjectPeriodCount).map((item: any) => {
          const classNames = Array.from(item.classes as Set<string>)
            .map((classId: string) => classMap.get(classId)?.name || 'Unknown')
            .filter((name: string) => name !== 'Unknown')
            .sort();

          // Always use the periods value (which is either saved or calculated)
          // The periods value is already set correctly in calculateTeachingLoads
          const displayPeriods = item.periods;

          return {
            subject: item.subject,
            periods: displayPeriods,
            originalPeriods: item.periods, // This is the current value (saved or calculated)
            storedPeriods: item.subject.teachingPeriods, // Keep reference to stored value
            classes: classNames,
            displayText: `${item.subject.name} ${displayPeriods}`,
            isEditable: this.isAdmin || this.isSuperAdmin
          };
        }).sort((a: any, b: any) => {
          // Sort by subject name
          return a.subject.name.localeCompare(b.subject.name);
        });

        this.applyFilters();
      },
      error: (err) => {
        console.error('Error loading classes:', err);
        // Still show teaching loads without class names
        this.teachingLoads = Object.values(subjectPeriodCount).map((item: any) => {
          // Use the periods value which is already set correctly (saved or calculated)
          const displayPeriods = item.periods;
          
          return {
            subject: item.subject,
            periods: displayPeriods,
            originalPeriods: item.periods,
            storedPeriods: item.subject.teachingPeriods,
            classes: [],
            displayText: `${item.subject.name} ${displayPeriods}`,
            isEditable: this.isAdmin || this.isSuperAdmin
          };
        }).sort((a: any, b: any) => a.subject.name.localeCompare(b.subject.name));
        
        this.applyFilters();
      }
    });
  }

  applyFilters() {
    if (!this.searchQuery.trim()) {
      this.filteredTeachingLoads = [...this.teachingLoads];
      return;
    }

    const query = this.searchQuery.toLowerCase().trim();
    this.filteredTeachingLoads = this.teachingLoads.filter((item: any) =>
      item.subject.name.toLowerCase().includes(query) ||
      item.subject.code?.toLowerCase().includes(query) ||
      item.displayText.toLowerCase().includes(query)
    );
  }

  clearSearch() {
    this.searchQuery = '';
    this.applyFilters();
  }

  increasePeriods(item: any) {
    if (!item.isEditable) return;
    item.periods = (item.periods || 0) + 1;
    item.displayText = `${item.subject.name} ${item.periods}`;
    this.hasUnsavedChanges = true;
  }

  decreasePeriods(item: any) {
    if (!item.isEditable) return;
    if (item.periods > 0) {
      item.periods = item.periods - 1;
      item.displayText = `${item.subject.name} ${item.periods}`;
      this.hasUnsavedChanges = true;
    }
  }

  saveTeachingLoads() {
    if (!this.hasUnsavedChanges) {
      this.error = 'No changes to save';
      setTimeout(() => {
        this.error = '';
      }, 3000);
      return;
    }

    this.saving = true;
    this.error = '';
    this.success = '';

    // Prepare updates - only include subjects where periods have changed
    const updates = this.teachingLoads
      .filter((item: any) => {
        // Check if periods have changed from stored value
        const currentStored = item.storedPeriods !== null && item.storedPeriods !== undefined 
          ? item.storedPeriods 
          : null;
        // If no stored value exists, compare with original calculated value
        if (currentStored === null) {
          return item.periods !== item.originalPeriods;
        }
        return item.periods !== currentStored;
      })
      .map((item: any) => ({
        id: item.subject.id,
        teachingPeriods: item.periods
      }));

    if (updates.length === 0) {
      this.saving = false;
      this.error = 'No changes to save';
      setTimeout(() => {
        this.error = '';
      }, 3000);
      return;
    }

    // Save each subject
    let savedCount = 0;
    let errorCount = 0;

    updates.forEach((update: any) => {
      this.subjectService.updateSubject(update.id, { teachingPeriods: update.teachingPeriods }).subscribe({
        next: () => {
          savedCount++;
          if (savedCount + errorCount === updates.length) {
            this.saving = false;
            if (errorCount === 0) {
              this.success = `Teaching loads saved successfully for ${savedCount} subject(s)`;
              this.hasUnsavedChanges = false;
              
              // Update stored periods in the current data without full reload
              // This ensures the values persist and don't disappear
              updates.forEach((update: any) => {
                const item = this.teachingLoads.find((tl: any) => tl.subject.id === update.id);
                if (item) {
                  // Update the subject's teachingPeriods property
                  item.subject.teachingPeriods = update.teachingPeriods;
                  // Update the stored reference
                  item.storedPeriods = update.teachingPeriods;
                  // Update the original periods to match (so it won't be recalculated)
                  item.originalPeriods = update.teachingPeriods;
                  // Update the display periods
                  item.periods = update.teachingPeriods;
                  // Update the display text
                  item.displayText = `${item.subject.name} ${update.teachingPeriods}`;
                }
              });
              
              // Update filtered list as well
              this.applyFilters();
              
              setTimeout(() => {
                this.success = '';
              }, 3000);
            } else {
              this.error = `Saved ${savedCount} subjects, but ${errorCount} failed`;
            }
          }
        },
        error: (err) => {
          console.error(`Error saving subject ${update.id}:`, err);
          errorCount++;
          if (savedCount + errorCount === updates.length) {
            this.saving = false;
            if (savedCount === 0) {
              this.error = 'Failed to save teaching loads';
            } else {
              this.error = `Saved ${savedCount} subjects, but ${errorCount} failed`;
            }
          }
        }
      });
    });
  }
}


import { Component, OnInit } from '@angular/core';
import { TimetableService } from '../../services/timetable.service';
import { SettingsService } from '../../services/settings.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-timetable-config',
  templateUrl: './timetable-config.component.html',
  styleUrls: ['./timetable-config.component.css']
})
export class TimetableConfigComponent implements OnInit {
  config: any = {
    periodsPerDay: 14,
    schoolStartTime: '07:30:00',
    schoolEndTime: '16:10:00',
    periodDuration: 35, // Default - should be set by admin in config page
    daysOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    breakPeriods: [
      { name: 'Tea Break', startTime: '10:00', endTime: '10:20', periodAfter: 4 },
      { name: 'Lunch Break', startTime: '12:00', endTime: '13:00', periodAfter: 8 }
    ],
    preferences: {
      allowDoublePeriods: false,
      maxConsecutivePeriods: 3,
      preferredSubjectDistribution: 'balanced'
    }
  };

  loading = false;
  saving = false;
  error = '';
  success = '';

  isAdmin = false;
  isSuperAdmin = false;

  availableDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  schoolSettings: any = null;

  constructor(
    private timetableService: TimetableService,
    private settingsService: SettingsService,
    private authService: AuthService
  ) {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user ? (user.role === 'admin') : false;
    this.isSuperAdmin = user ? (user.role === 'superadmin') : false;
  }

  ngOnInit() {
    this.loadSchoolSettings();
    this.loadConfig();
    this.ensureTwoBreaks();
  }

  loadSchoolSettings() {
    this.settingsService.getSettings().subscribe({
      next: (data: any) => {
        this.schoolSettings = data;
        // Update config defaults from settings if available
        if (data.schoolStartTime) {
          this.config.schoolStartTime = data.schoolStartTime;
        }
        if (data.schoolEndTime) {
          this.config.schoolEndTime = data.schoolEndTime;
        }
        if (data.breakTimes && Array.isArray(data.breakTimes) && data.breakTimes.length > 0) {
          // Map breakTimes from settings to breakPeriods format
          this.config.breakPeriods = data.breakTimes.map((breakTime: any, index: number) => ({
            name: breakTime.name || (index === 0 ? 'Tea Break' : 'Lunch Break'),
            startTime: breakTime.startTime || (index === 0 ? '10:00' : '12:00'),
            endTime: breakTime.endTime || (index === 0 ? '10:20' : '13:00'),
            periodAfter: index === 0 ? 4 : 8 // Default periodAfter values (4 periods before break 1, 4 after break 1, 4 after break 2)
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
        }
      },
      error: (err) => {
        console.error('Error loading school settings:', err);
      }
    });
  }

  loadConfig() {
    this.loading = true;
    this.error = '';
    this.timetableService.getTimetableConfig().subscribe({
      next: (data: any) => {
        if (data) {
          // Ensure exactly 2 breaks
          let breakPeriods = data.breakPeriods || [];
          if (breakPeriods.length === 0) {
            breakPeriods = [
              { name: 'Tea Break', startTime: '10:00', endTime: '10:20', periodAfter: 4 },
              { name: 'Lunch Break', startTime: '12:00', endTime: '13:00', periodAfter: 8 }
            ];
          } else if (breakPeriods.length === 1) {
            breakPeriods.push({ name: 'Lunch Break', startTime: '12:00', endTime: '13:00', periodAfter: 8 });
          } else if (breakPeriods.length > 2) {
            breakPeriods = breakPeriods.slice(0, 2);
          }
          
          // If periodDuration is 40, update to 35 (old default)
          let periodDuration = data.periodDuration !== undefined ? data.periodDuration : (this.config.periodDuration || 35);
          if (periodDuration === 40) {
            console.warn('Period duration is 40 minutes (old default). Updating to 35 minutes.');
            periodDuration = 35;
          }
          
          this.config = {
            ...this.config,
            ...data,
            periodDuration: periodDuration, // Always use config value (35 minutes)
            breakPeriods: breakPeriods,
            preferences: data.preferences || this.config.preferences
          };
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading config:', err);
        this.error = err.error?.message || 'Failed to load configuration';
        this.loading = false;
      }
    });
  }

  // Ensure exactly 2 breaks are always present
  ensureTwoBreaks() {
    if (!this.config) {
      this.config = {};
    }
    if (!this.config.breakPeriods) {
      this.config.breakPeriods = [];
    }
    
    // Ensure exactly 2 breaks
    while (this.config.breakPeriods.length < 2) {
      if (this.config.breakPeriods.length === 0) {
        this.config.breakPeriods.push({
          name: 'Tea Break',
          startTime: '10:00',
          endTime: '10:20',
          periodAfter: 4
        });
      } else {
        this.config.breakPeriods.push({
          name: 'Lunch Break',
          startTime: '12:00',
          endTime: '13:00',
          periodAfter: 8
        });
      }
    }
    
    // Limit to 2 breaks
    if (this.config.breakPeriods.length > 2) {
      this.config.breakPeriods = this.config.breakPeriods.slice(0, 2);
    }
    
    // Ensure both breaks have required fields
    this.config.breakPeriods.forEach((breakPeriod: any, index: number) => {
      if (!breakPeriod.name) {
        breakPeriod.name = index === 0 ? 'Tea Break' : 'Lunch Break';
      }
      if (!breakPeriod.startTime) {
        breakPeriod.startTime = index === 0 ? '10:00' : '12:00';
      }
      if (!breakPeriod.endTime) {
        breakPeriod.endTime = index === 0 ? '10:20' : '13:00';
      }
      if (!breakPeriod.periodAfter) {
        breakPeriod.periodAfter = index === 0 ? 4 : 8;
      }
    });
  }

  addBreakPeriod() {
    // Not used - we always have exactly 2 breaks
    this.ensureTwoBreaks();
  }

  removeBreakPeriod(index: number) {
    // Don't allow removing - always keep 2 breaks
    // Instead, reset to default
    if (index === 0) {
      this.config.breakPeriods[0] = {
        name: 'Tea Break',
        startTime: '10:00',
        endTime: '10:20',
        periodAfter: 4
      };
    } else {
      this.config.breakPeriods[1] = {
        name: 'Lunch Break',
        startTime: '12:00',
        endTime: '13:00',
        periodAfter: 8
      };
    }
  }

  toggleDay(day: string) {
    const index = this.config.daysOfWeek.indexOf(day);
    if (index > -1) {
      this.config.daysOfWeek.splice(index, 1);
    } else {
      this.config.daysOfWeek.push(day);
      this.config.daysOfWeek.sort((a: string, b: string) => {
        const order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        return order.indexOf(a) - order.indexOf(b);
      });
    }
  }

  saveConfig() {
    // Ensure exactly 2 breaks before saving
    this.ensureTwoBreaks();
    if (!this.isAdmin && !this.isSuperAdmin) {
      this.error = 'You do not have permission to save configuration';
      return;
    }

    this.saving = true;
    this.error = '';
    this.success = '';

    // Also save times to settings
    const settingsUpdate: any = {
      schoolStartTime: this.config.schoolStartTime,
      schoolEndTime: this.config.schoolEndTime,
      breakTimes: this.config.breakPeriods.map((bp: any) => ({
        name: bp.name,
        startTime: bp.startTime,
        endTime: bp.endTime
      }))
    };

    // Save to settings first, then to timetable config
    this.settingsService.updateSettings(settingsUpdate).subscribe({
      next: () => {
        // Now save timetable config
        this.timetableService.saveTimetableConfig(this.config).subscribe({
          next: (data: any) => {
            this.success = '✅ Timetable configuration saved successfully! Your settings have been updated and will be used for future timetable generation.';
            this.saving = false;
            this.error = '';
            // Reload settings to reflect changes
            this.loadSchoolSettings();
            // Clear success message after 5 seconds
            setTimeout(() => this.success = '', 5000);
          },
          error: (err) => {
            console.error('Error saving config:', err);
            this.error = err.error?.message || 'Failed to save configuration. Please try again.';
            this.success = '';
            this.saving = false;
          }
        });
      },
      error: (settingsErr) => {
        console.error('Error saving settings:', settingsErr);
        // Still try to save timetable config even if settings save fails
        this.timetableService.saveTimetableConfig(this.config).subscribe({
          next: (data: any) => {
            this.success = '✅ Timetable configuration saved successfully! (Note: Settings update had an issue)';
            this.saving = false;
            this.error = '';
            setTimeout(() => this.success = '', 5000);
          },
          error: (err) => {
            console.error('Error saving config:', err);
            this.error = err.error?.message || 'Failed to save configuration. Please try again.';
            this.success = '';
            this.saving = false;
          }
        });
      }
    });
  }

  calculatePeriodTimes() {
    const start = this.parseTime(this.config.schoolStartTime);
    // Always use periodDuration from config - no fallback
    const duration = this.config.periodDuration || 35;
    const periods: any[] = [];

    // Ensure breaks are present before calculating
    this.ensureTwoBreaks();

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
      // Convert periodAfter to number for comparison
      const breakAfter = breakPeriods.find((b: any) => {
        const periodAfter = typeof b.periodAfter === 'string' ? parseInt(b.periodAfter) : b.periodAfter;
        return periodAfter === i;
      });
      
      // Calculate period times strictly (not counting breaks in period numbering)
      const periodStart = new Date(currentTime);
      const periodEnd = new Date(periodStart);
      periodEnd.setMinutes(periodEnd.getMinutes() + duration);

      periods.push({
        number: periodNumber,
        startTime: this.formatTime(periodStart),
        endTime: this.formatTime(periodEnd),
        isBreak: false
      });

      periodNumber++;
      currentTime = new Date(periodEnd);

      // Add break if needed (using strict times from config)
      if (breakAfter) {
        const breakStart = this.parseTime(breakAfter.startTime);
        const breakEnd = this.parseTime(breakAfter.endTime);

        periods.push({
          number: breakAfter.name || 'Break',
          startTime: this.formatTime(breakStart),
          endTime: this.formatTime(breakEnd),
          isBreak: true,
          breakLabel: breakAfter.name
        });

        // Update current time to after break (strict time from config)
        currentTime = new Date(breakEnd);
      }
    }

    return periods;
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
}


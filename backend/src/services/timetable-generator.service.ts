import { AppDataSource } from '../config/database';
import { Timetable } from '../entities/Timetable';
import { TimetableEntry } from '../entities/TimetableEntry';
import { TimetableConfig } from '../entities/TimetableConfig';
import { Teacher } from '../entities/Teacher';
import { Class } from '../entities/Class';
import { Subject } from '../entities/Subject';
import { TeacherClass } from '../entities/TeacherClass';

interface Assignment {
  teacherId: string;
  classId: string;
  subjectId: string;
  periodsPerWeek: number;
}

interface Conflict {
  type: 'teacher' | 'class';
  entityId: string;
  entityName: string;
  day: string;
  period: string;
  conflictingEntries: Array<{
    classId?: string;
    subjectId?: string;
    teacherId?: string;
  }>;
}

export class TimetableGeneratorService {
  /**
   * Generate a timetable based on teacher-class-subject assignments
   */
  async generateTimetable(
    timetableId: string,
    configId: string,
    assignments: Assignment[]
  ): Promise<{ entries: TimetableEntry[]; conflicts: Conflict[] }> {
    let config: any;
    
    // Always try to load config from database - prioritize active config
    try {
      const configRepository = AppDataSource.getRepository(TimetableConfig);
      
      // If configId provided and not 'default', try to load that specific config
      if (configId && configId !== 'default') {
        config = await configRepository.findOne({
          where: { id: configId }
        });
      }
      
      // If no config found, try to get active config
      if (!config) {
        config = await configRepository.findOne({
          where: { isActive: true }
        });
      }
    } catch (error: any) {
      console.warn('Could not load config from database, using defaults:', error.message);
    }

    // Use default config only as last resort (should not happen if config is saved)
    if (!config) {
      console.warn('No timetable config found! Using default values. Please configure timetable settings.');
      config = {
        id: 'default',
        periodsPerDay: 14,
        schoolStartTime: '07:30:00',
        schoolEndTime: '16:10:00',
        periodDuration: 35, // Default to 35 minutes
        daysOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        breakPeriods: [],
        preferences: {
          allowDoublePeriods: false,
          maxConsecutivePeriods: 3,
          preferredSubjectDistribution: 'balanced'
        }
      };
    }
    
    // Ensure periodDuration is set (should always come from config)
    if (!config.periodDuration || config.periodDuration <= 0) {
      console.warn('Period duration not set in config, defaulting to 35 minutes');
      config.periodDuration = 35;
    }

    const timetable = await AppDataSource.getRepository(Timetable).findOne({
      where: { id: timetableId }
    });

    if (!timetable) {
      throw new Error('Timetable not found');
    }

    // Load all teachers, classes, and subjects
    const teachers = await AppDataSource.getRepository(Teacher).find({
      where: { isActive: true }
    });
    const classes = await AppDataSource.getRepository(Class).find({
      where: { isActive: true }
    });
    const subjects = await AppDataSource.getRepository(Subject).find({
      where: { isActive: true }
    });

    // Create teacher and class maps
    const teacherMap = new Map(teachers.map(t => [t.id, t]));
    const classMap = new Map(classes.map(c => [c.id, c]));
    const subjectMap = new Map(subjects.map(s => [s.id, s]));

    // Build assignment map with periods needed
    const assignmentMap = new Map<string, Assignment>();
    assignments.forEach(assignment => {
      const key = `${assignment.teacherId}-${assignment.classId}-${assignment.subjectId}`;
      assignmentMap.set(key, assignment);
    });

    // Initialize grid: [day][period] -> Set of occupied slots
    const teacherSlots = new Map<string, Set<string>>(); // teacherId -> Set of "day-period"
    const classSlots = new Map<string, Set<string>>(); // classId -> Set of "day-period"

    // Load existing locked entries and mark their slots as occupied
    const entryRepository = AppDataSource.getRepository(TimetableEntry);
    const existingLockedEntries = await entryRepository.find({
      where: { timetableId, isLocked: true }
    });

    const entries: TimetableEntry[] = [];
    const conflicts: Conflict[] = []; // Only for manual placement conflicts, not auto-generation

    // Mark locked entries' slots as occupied
    for (const lockedEntry of existingLockedEntries) {
      const periodKey = `${lockedEntry.day}-${lockedEntry.period}`;
      
      if (lockedEntry.teacherId) {
        if (!teacherSlots.has(lockedEntry.teacherId)) {
          teacherSlots.set(lockedEntry.teacherId, new Set());
        }
        teacherSlots.get(lockedEntry.teacherId)!.add(periodKey);
      }
      
      if (lockedEntry.classId) {
        if (!classSlots.has(lockedEntry.classId)) {
          classSlots.set(lockedEntry.classId, new Set());
        }
        classSlots.get(lockedEntry.classId)!.add(periodKey);
      }

      // Keep locked entries in the final result
      entries.push(lockedEntry);
    }

    // Sort assignments by priority (more periods first, then by subject teaching periods)
    const sortedAssignments = [...assignments].sort((a, b) => {
      const aSubject = subjectMap.get(a.subjectId);
      const bSubject = subjectMap.get(b.subjectId);
      const aPeriods = aSubject?.teachingPeriods || a.periodsPerWeek;
      const bPeriods = bSubject?.teachingPeriods || b.periodsPerWeek;
      return bPeriods - aPeriods;
    });

    // Helper function to get all available slots
    const getAllAvailableSlots = (): Array<{ day: string; period: number }> => {
      const slots: Array<{ day: string; period: number }> = [];
      for (const day of config.daysOfWeek) {
        for (let periodNum = 1; periodNum <= config.periodsPerDay; periodNum++) {
          slots.push({ day, period: periodNum });
        }
      }
      return slots;
    };

    // Helper function to shuffle array (Fisher-Yates)
    const shuffleArray = <T>(array: T[]): T[] => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    // Helper function to get available slots for a specific assignment
    const getAvailableSlotsForAssignment = (
      teacherId: string,
      classId: string
    ): Array<{ day: string; period: number }> => {
      const allSlots = getAllAvailableSlots();
      const distributionPreference = config.preferences?.preferredSubjectDistribution || 'balanced';
      
      // Filter out occupied slots
      const availableSlots = allSlots.filter(slot => {
        const periodKey = `${slot.day}-${slot.period}`;
        const teacherOccupied = teacherSlots.has(teacherId) && 
          teacherSlots.get(teacherId)!.has(periodKey);
        const classOccupied = classSlots.has(classId) && 
          classSlots.get(classId)!.has(periodKey);
        return !teacherOccupied && !classOccupied;
      });

      // Shuffle for balanced distribution (subjects can appear at different times)
      if (distributionPreference === 'balanced' && availableSlots.length > 0) {
        return shuffleArray(availableSlots);
      }

      return availableSlots;
    };

    // Generate entries for each assignment
    for (const assignment of sortedAssignments) {
      const teacher = teacherMap.get(assignment.teacherId);
      const classEntity = classMap.get(assignment.classId);
      const subject = subjectMap.get(assignment.subjectId);

      if (!teacher || !classEntity || !subject) {
        continue;
      }

      const periodsNeeded = assignment.periodsPerWeek || subject.teachingPeriods || 1;
      let periodsPlaced = 0;

      // Try to place all periods for this assignment
      for (let p = 0; p < periodsNeeded && periodsPlaced < periodsNeeded; p++) {
        let placed = false;

        // Get fresh available slots for this assignment
        // This is refreshed each iteration to account for newly occupied slots
        let availableSlots = getAvailableSlotsForAssignment(assignment.teacherId, assignment.classId);

        // Try all available slots until we find one that works
        while (!placed && availableSlots.length > 0) {
          // Try each available slot
          for (let i = 0; i < availableSlots.length && !placed; i++) {
            const slot = availableSlots[i];
            const periodKey = `${slot.day}-${slot.period}`;

            // Double-check availability (slots may have been taken by previous assignments in this loop)
            const teacherOccupied = teacherSlots.has(assignment.teacherId) && 
              teacherSlots.get(assignment.teacherId)!.has(periodKey);
            const classOccupied = classSlots.has(assignment.classId) && 
              classSlots.get(assignment.classId)!.has(periodKey);

            if (teacherOccupied || classOccupied) {
              continue; // Try next slot
            }

            // Found an available slot - place the entry
            const entry = new TimetableEntry();
            entry.timetableId = timetableId;
            entry.day = slot.day;
            entry.period = slot.period.toString();
            entry.teacherId = assignment.teacherId;
            entry.classId = assignment.classId;
            entry.subjectId = assignment.subjectId;

            entries.push(entry);

            // Mark slots as occupied immediately
            if (!teacherSlots.has(assignment.teacherId)) {
              teacherSlots.set(assignment.teacherId, new Set());
            }
            teacherSlots.get(assignment.teacherId)!.add(periodKey);

            if (!classSlots.has(assignment.classId)) {
              classSlots.set(assignment.classId, new Set());
            }
            classSlots.get(assignment.classId)!.add(periodKey);

            placed = true;
            periodsPlaced++;
          }

          // If still not placed, refresh available slots and try again
          // This handles cases where slots were taken between getting the list and trying to place
          if (!placed) {
            availableSlots = getAvailableSlotsForAssignment(assignment.teacherId, assignment.classId);
            // If we've exhausted all slots, break
            if (availableSlots.length === 0) {
              break;
            }
          }
        }

        // If still couldn't place after trying all available slots, skip it
        // Don't report conflicts during auto-generation - only report when admin manually places
        // The system will try to place it in the next generation cycle
        if (!placed) {
          console.warn(`Could not place ${subject.name} for ${teacher.firstName} ${teacher.lastName} - ${classEntity.name}. Will be skipped.`);
          // Note: We don't add to conflicts here - conflicts are only for manual placement
        }
      }
    }

    return { entries, conflicts };
  }

  /**
   * Detect conflicts in existing timetable entries
   */
  async detectConflicts(timetableId: string): Promise<Conflict[]> {
    const entryRepository = AppDataSource.getRepository(TimetableEntry);
    const entries = await entryRepository.find({
      where: { timetableId },
      relations: ['teacher', 'class', 'subject']
    });

    const conflicts: Conflict[] = [];
    const teacherSlots = new Map<string, Map<string, TimetableEntry[]>>(); // teacherId -> day -> entries
    const classSlots = new Map<string, Map<string, TimetableEntry[]>>(); // classId -> day -> entries

    // Build slot maps
    for (const entry of entries) {
      if (entry.teacherId) {
        if (!teacherSlots.has(entry.teacherId)) {
          teacherSlots.set(entry.teacherId, new Map());
        }
        const teacherDayMap = teacherSlots.get(entry.teacherId)!;
        const slotKey = `${entry.day}-${entry.period}`;
        if (!teacherDayMap.has(slotKey)) {
          teacherDayMap.set(slotKey, []);
        }
        teacherDayMap.get(slotKey)!.push(entry);
      }

      if (entry.classId) {
        if (!classSlots.has(entry.classId)) {
          classSlots.set(entry.classId, new Map());
        }
        const classDayMap = classSlots.get(entry.classId)!;
        const slotKey = `${entry.day}-${entry.period}`;
        if (!classDayMap.has(slotKey)) {
          classDayMap.set(slotKey, []);
        }
        classDayMap.get(slotKey)!.push(entry);
      }
    }

    // Detect teacher conflicts
    for (const [teacherId, dayMap] of teacherSlots.entries()) {
      for (const [slotKey, slotEntries] of dayMap.entries()) {
        if (slotEntries.length > 1) {
          const [day, period] = slotKey.split('-');
          const teacher = slotEntries[0].teacher;
          conflicts.push({
            type: 'teacher',
            entityId: teacherId,
            entityName: teacher ? `${teacher.firstName} ${teacher.lastName}` : teacherId,
            day,
            period,
            conflictingEntries: slotEntries.map(e => ({
              classId: e.classId,
              subjectId: e.subjectId,
              teacherId: e.teacherId
            }))
          });
        }
      }
    }

    // Detect class conflicts
    for (const [classId, dayMap] of classSlots.entries()) {
      for (const [slotKey, slotEntries] of dayMap.entries()) {
        if (slotEntries.length > 1) {
          const [day, period] = slotKey.split('-');
          const classEntity = slotEntries[0].class;
          conflicts.push({
            type: 'class',
            entityId: classId,
            entityName: classEntity ? classEntity.name : classId,
            day,
            period,
            conflictingEntries: slotEntries.map(e => ({
              classId: e.classId,
              subjectId: e.subjectId,
              teacherId: e.teacherId
            }))
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Get teacher-class-subject assignments from database
   */
  async getAssignments(): Promise<Assignment[]> {
    const teacherClassRepo = AppDataSource.getRepository(TeacherClass);
    const teacherRepo = AppDataSource.getRepository(Teacher);
    const subjectRepo = AppDataSource.getRepository(Subject);

    // Get all teacher-class relationships
    const teacherClasses = await teacherClassRepo.find({
      relations: ['teacher', 'class']
    });

    const assignments: Assignment[] = [];

    for (const tc of teacherClasses) {
      // Get subjects for this teacher
      const teacher = await teacherRepo.findOne({
        where: { id: tc.teacherId },
        relations: ['subjects']
      });

      if (!teacher || !teacher.subjects) continue;

      // Get subjects for this class
      const classEntity = await AppDataSource.getRepository(Class).findOne({
        where: { id: tc.classId },
        relations: ['subjects']
      });

      if (!classEntity || !classEntity.subjects) continue;

      // Find common subjects (teacher teaches this subject AND class has this subject)
      for (const subject of teacher.subjects) {
        if (classEntity.subjects.some(s => s.id === subject.id)) {
          assignments.push({
            teacherId: tc.teacherId,
            classId: tc.classId,
            subjectId: subject.id,
            periodsPerWeek: subject.teachingPeriods || 0
          });
        }
      }
    }

    return assignments;
  }
}


import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Timetable } from '../entities/Timetable';
import { TimetableEntry } from '../entities/TimetableEntry';
import { TimetableConfig } from '../entities/TimetableConfig';
import { TimetableVersion } from '../entities/TimetableVersion';
import { TimetableChangeLog } from '../entities/TimetableChangeLog';
import { AuthRequest } from '../middleware/auth';
import { buildPaginationResponse, resolvePaginationParams } from '../utils/pagination';
import { TimetableGeneratorService } from '../services/timetable-generator.service';

export const getTimetables = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const timetableRepository = AppDataSource.getRepository(Timetable);
    const { page: pageParam, limit: limitParam } = req.query;
    const { page, limit, skip } = resolvePaginationParams(
      pageParam as string,
      limitParam as string
    );

    let timetables: Timetable[] = [];
    let total = 0;

    try {
      // Try to load with all relations first
      [timetables, total] = await timetableRepository.findAndCount({
        relations: ['entries', 'entries.class', 'entries.teacher', 'entries.subject'],
        order: { createdAt: 'DESC' },
        skip,
        take: limit
      });
    } catch (relationError: any) {
      console.error('[getTimetables] Error loading with relations:', relationError.message);
      
      // Check if it's a table/relation error
      const isTableError = relationError.message?.includes('does not exist') || 
                          relationError.message?.includes('relation') ||
                          relationError.message?.includes('column') ||
                          relationError.code === '42P01' || // PostgreSQL: relation does not exist
                          relationError.code === '42703';   // PostgreSQL: undefined column
      
      if (isTableError) {
        console.log('[getTimetables] Table/relation error detected, trying without relations');
        // Fallback: load without relations
        try {
          const fallbackResults = await timetableRepository.find({
            order: { createdAt: 'DESC' },
            skip,
            take: limit
          });
          total = fallbackResults.length;
          timetables = fallbackResults.map((t: any) => ({
            ...t,
            entries: t.entries || []
          }));
          console.log('[getTimetables] Successfully loaded timetables without relations');
        } catch (fallbackError: any) {
          console.error('[getTimetables] Fallback failed:', fallbackError.message);
          // If even the basic query fails, tables don't exist - return empty array
          timetables = [];
          total = 0;
        }
      } else {
        // Re-throw if it's not a table error
        throw relationError;
      }
    }

    const response = buildPaginationResponse(timetables, total, page, limit);
    res.json(response);
  } catch (error: any) {
    console.error('Error fetching timetables:', error);
    // Return empty result instead of error if tables don't exist
    if (error.message?.includes('does not exist') || error.code === '42P01') {
      const response = buildPaginationResponse([], 0, 1, 10);
      return res.json(response);
    }
    res.status(500).json({ message: 'Failed to fetch timetables', error: error.message });
  }
};

export const getTimetableById = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const timetableRepository = AppDataSource.getRepository(Timetable);
    const { id } = req.params;

    let timetable: Timetable | null = null;

    try {
      timetable = await timetableRepository.findOne({
        where: { id },
        relations: ['entries', 'entries.class', 'entries.teacher', 'entries.subject']
      });
    } catch (relationError: any) {
      console.error('[getTimetableById] Error loading with relations:', relationError.message);
      
      // Fallback: load without relations
      try {
        timetable = await timetableRepository.findOne({
          where: { id }
        });
        if (timetable) {
          (timetable as any).entries = [];
        }
      } catch (fallbackError: any) {
        console.error('[getTimetableById] Fallback failed:', fallbackError.message);
        if (fallbackError.message?.includes('does not exist') || fallbackError.code === '42P01') {
          return res.status(404).json({ message: 'Timetable not found' });
        }
        throw fallbackError;
      }
    }

    if (!timetable) {
      return res.status(404).json({ message: 'Timetable not found' });
    }

    res.json(timetable);
  } catch (error: any) {
    console.error('Error fetching timetable:', error);
    res.status(500).json({ message: 'Failed to fetch timetable', error: error.message });
  }
};

export const createTimetable = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const timetableRepository = AppDataSource.getRepository(Timetable);
    const entryRepository = AppDataSource.getRepository(TimetableEntry);
    const { name, term, academicYear, startDate, endDate, entries } = req.body;

    if (!name || !term || !academicYear) {
      return res.status(400).json({ message: 'Name, term, and academic year are required' });
    }

    // Create timetable
    const timetable = timetableRepository.create({
      name,
      term,
      academicYear,
      startDate: startDate || null,
      endDate: endDate || null,
      isActive: true
    });

    const savedTimetable = await timetableRepository.save(timetable);

    // Create entries if provided
    if (entries && Array.isArray(entries) && entries.length > 0) {
      const timetableEntries = entries.map((entry: any) => {
        return entryRepository.create({
          timetableId: savedTimetable.id,
          day: entry.day,
          period: entry.period,
          room: entry.room || null,
          classId: entry.classId || null,
          teacherId: entry.teacherId || null,
          subjectId: entry.subjectId || null
        });
      });

      await entryRepository.save(timetableEntries);
    }

    // Reload with relations
    const result = await timetableRepository.findOne({
      where: { id: savedTimetable.id },
      relations: ['entries', 'entries.class', 'entries.teacher', 'entries.subject']
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error('Error creating timetable:', error);
    res.status(500).json({ message: 'Failed to create timetable', error: error.message });
  }
};

export const updateTimetable = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const timetableRepository = AppDataSource.getRepository(Timetable);
    const entryRepository = AppDataSource.getRepository(TimetableEntry);
    const { id } = req.params;
    const { name, term, academicYear, startDate, endDate, entries } = req.body;

    const timetable = await timetableRepository.findOne({ where: { id } });
    if (!timetable) {
      return res.status(404).json({ message: 'Timetable not found' });
    }

    // Update timetable fields
    if (name) timetable.name = name;
    if (term) timetable.term = term;
    if (academicYear) timetable.academicYear = academicYear;
    if (startDate !== undefined) timetable.startDate = startDate;
    if (endDate !== undefined) timetable.endDate = endDate;

    await timetableRepository.save(timetable);

    // Update entries if provided
    if (entries && Array.isArray(entries)) {
      // Delete existing entries
      await entryRepository.delete({ timetableId: id });

      // Create new entries
      if (entries.length > 0) {
        const timetableEntries = entries.map((entry: any) => {
          return entryRepository.create({
            timetableId: id,
            day: entry.day,
            period: entry.period,
            room: entry.room || null,
            classId: entry.classId || null,
            teacherId: entry.teacherId || null,
            subjectId: entry.subjectId || null
          });
        });

        await entryRepository.save(timetableEntries);
      }
    }

    // Reload with relations
    const result = await timetableRepository.findOne({
      where: { id },
      relations: ['entries', 'entries.class', 'entries.teacher', 'entries.subject']
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error updating timetable:', error);
    res.status(500).json({ message: 'Failed to update timetable', error: error.message });
  }
};

export const deleteTimetable = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const timetableRepository = AppDataSource.getRepository(Timetable);
    const { id } = req.params;

    const timetable = await timetableRepository.findOne({ where: { id } });
    if (!timetable) {
      return res.status(404).json({ message: 'Timetable not found' });
    }

    // Entries will be deleted automatically due to CASCADE
    await timetableRepository.remove(timetable);

    res.json({ message: 'Timetable deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting timetable:', error);
    res.status(500).json({ message: 'Failed to delete timetable', error: error.message });
  }
};

// Configuration endpoints
export const getTimetableConfig = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // Return default config if table doesn't exist or query fails
    const defaultConfig = {
      id: null,
      isActive: true,
      periodsPerDay: 14,
      schoolStartTime: '07:30:00',
      schoolEndTime: '16:10:00',
        periodDuration: 35, // Default fallback - should always come from saved config
      daysOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      breakPeriods: [],
      preferences: {
        allowDoublePeriods: false,
        maxConsecutivePeriods: 3,
        preferredSubjectDistribution: 'balanced'
      }
    };

    try {
      const configRepository = AppDataSource.getRepository(TimetableConfig);
      const config = await configRepository.findOne({
        where: { isActive: true }
      });

      if (config) {
        // If periodDuration is 40 (old default), update to 35
        if (config.periodDuration === 40) {
          console.warn('Period duration is 40 minutes (old default). Updating to 35 minutes.');
          config.periodDuration = 35;
          // Optionally save the updated value
          try {
            await configRepository.update({ id: config.id }, { periodDuration: 35 });
          } catch (updateError: any) {
            console.warn('Could not update periodDuration in database:', updateError.message);
          }
        }
        return res.json(config);
      }
    } catch (dbError: any) {
      // If table doesn't exist or other DB error, return default config
      console.warn('Timetable config table may not exist yet, returning default config:', dbError.message);
    }

    // Return default config
    return res.json(defaultConfig);
  } catch (error: any) {
    console.error('Error fetching timetable config:', error);
    // Return default config even on error
    const defaultConfig = {
      id: null,
      isActive: true,
      periodsPerDay: 14,
      schoolStartTime: '07:30:00',
      schoolEndTime: '16:10:00',
        periodDuration: 35, // Default fallback - should always come from saved config
      daysOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      breakPeriods: [],
      preferences: {
        allowDoublePeriods: false,
        maxConsecutivePeriods: 3,
        preferredSubjectDistribution: 'balanced'
      }
    };
    return res.json(defaultConfig);
  }
};

export const saveTimetableConfig = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const configRepository = AppDataSource.getRepository(TimetableConfig);
    const { periodsPerDay, schoolStartTime, schoolEndTime, periodDuration, breakPeriods, daysOfWeek, preferences } = req.body;

    try {
      // Try to deactivate all existing configs (may fail if table doesn't exist)
      await configRepository.update({}, { isActive: false });
    } catch (updateError: any) {
      // If update fails (table might not exist), continue anyway
      console.warn('Could not update existing configs (table may not exist):', updateError.message);
    }

    // Ensure periodDuration is 35 (not 40 - old default)
    let finalPeriodDuration = periodDuration || 35;
    if (finalPeriodDuration === 40) {
      console.warn('Period duration is 40 minutes (old default). Updating to 35 minutes.');
      finalPeriodDuration = 35;
    }
    
    // Create new active config
    const config = configRepository.create({
      isActive: true,
      periodsPerDay: periodsPerDay || 14,
      schoolStartTime: schoolStartTime || '07:30:00',
      schoolEndTime: schoolEndTime || '16:10:00',
      periodDuration: finalPeriodDuration, // Always 35 minutes
      breakPeriods: breakPeriods || null,
      daysOfWeek: daysOfWeek || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      preferences: preferences || null
    });

    const saved = await configRepository.save(config);
    res.json(saved);
  } catch (error: any) {
    console.error('Error saving timetable config:', error);
    
    // Check if it's a table doesn't exist error
    if (error.message?.includes('does not exist') || error.code === '42P01') {
      return res.status(500).json({ 
        message: 'Timetable configuration table does not exist. Please run the database migration first.',
        error: error.message,
        requiresMigration: true
      });
    }
    
    res.status(500).json({ message: 'Failed to save config', error: error.message });
  }
};

// Generation endpoints
export const generateTimetable = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { timetableId, configId, assignments } = req.body;

    if (!timetableId) {
      return res.status(400).json({ message: 'Timetable ID is required' });
    }

    const generator = new TimetableGeneratorService();
    let assignmentList = assignments;
    let activeConfigId = configId;

    // If configId not provided, try to get active config
    if (!activeConfigId) {
      try {
        const configRepository = AppDataSource.getRepository(TimetableConfig);
        const activeConfig = await configRepository.findOne({
          where: { isActive: true }
        });
        if (activeConfig) {
          activeConfigId = activeConfig.id;
        }
      } catch (configError: any) {
        console.warn('Could not load config, using defaults:', configError.message);
      }
    }

    // If assignments not provided, get from database
    if (!assignmentList || assignmentList.length === 0) {
      assignmentList = await generator.getAssignments();
    }

    // Use a default config if none exists - but try to get active config first
    if (!activeConfigId) {
      try {
        const configRepository = AppDataSource.getRepository(TimetableConfig);
        const activeConfig = await configRepository.findOne({
          where: { isActive: true }
        });
        if (activeConfig) {
          activeConfigId = activeConfig.id;
        } else {
          // No active config found - use default (should not happen if config is saved)
          console.warn('No active timetable config found. Using default values. Please configure timetable settings.');
          activeConfigId = 'default';
        }
      } catch (configError: any) {
        console.warn('Could not load config, using defaults:', configError.message);
        activeConfigId = 'default';
      }
    }

    const { entries, conflicts } = await generator.generateTimetable(timetableId, activeConfigId, assignmentList);

    // Save entries (locked entries are already included in entries array)
    const entryRepository = AppDataSource.getRepository(TimetableEntry);
    
    // Delete non-locked entries first, then save all entries (including locked ones)
    await entryRepository.delete({ 
      timetableId, 
      isLocked: false 
    });
    
    // Save all entries (newly generated + locked ones)
    await entryRepository.save(entries);

    // Create version
    const versionRepository = AppDataSource.getRepository(TimetableVersion);
    const existingVersions = await versionRepository.find({
      where: { timetableId },
      order: { versionNumber: 'DESC' }
    });

    const nextVersion = existingVersions.length > 0 ? existingVersions[0].versionNumber + 1 : 1;

    const version = versionRepository.create({
      timetableId,
      versionNumber: nextVersion,
      description: `Auto-generated timetable`,
      isActive: true,
      createdBy: req.user?.id || null
    });

    // Deactivate previous versions
    await versionRepository.update({ timetableId }, { isActive: false });
    await versionRepository.save(version);

    res.json({
      entries,
      conflicts: [], // No conflicts during auto-generation
      version: version.versionNumber,
      message: 'Timetable generated successfully'
    });
  } catch (error: any) {
    console.error('Error generating timetable:', error);
    res.status(500).json({ message: 'Failed to generate timetable', error: error.message });
  }
};

export const detectConflicts = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { timetableId } = req.params;
    const generator = new TimetableGeneratorService();
    const conflicts = await generator.detectConflicts(timetableId);

    res.json({ conflicts });
  } catch (error: any) {
    console.error('Error detecting conflicts:', error);
    res.status(500).json({ message: 'Failed to detect conflicts', error: error.message });
  }
};

export const getAssignments = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const generator = new TimetableGeneratorService();
    const assignments = await generator.getAssignments();

    res.json({ assignments });
  } catch (error: any) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ message: 'Failed to fetch assignments', error: error.message });
  }
};

// Version endpoints
export const getTimetableVersions = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { timetableId } = req.params;
    const versionRepository = AppDataSource.getRepository(TimetableVersion);
    const versions = await versionRepository.find({
      where: { timetableId },
      relations: ['changeLogs'],
      order: { versionNumber: 'DESC' }
    });

    res.json({ versions });
  } catch (error: any) {
    console.error('Error fetching versions:', error);
    res.status(500).json({ message: 'Failed to fetch versions', error: error.message });
  }
};

export const createTimetableVersion = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { timetableId } = req.params;
    const { description } = req.body;

    const versionRepository = AppDataSource.getRepository(TimetableVersion);
    const existingVersions = await versionRepository.find({
      where: { timetableId },
      order: { versionNumber: 'DESC' }
    });

    const nextVersion = existingVersions.length > 0 ? existingVersions[0].versionNumber + 1 : 1;

    // Deactivate previous versions
    await versionRepository.update({ timetableId }, { isActive: false });

    const version = versionRepository.create({
      timetableId,
      versionNumber: nextVersion,
      description: description || `Manual version ${nextVersion}`,
      isActive: true,
      createdBy: req.user?.id || null
    });

    const saved = await versionRepository.save(version);
    res.json(saved);
  } catch (error: any) {
    console.error('Error creating version:', error);
    res.status(500).json({ message: 'Failed to create version', error: error.message });
  }
};

export const logTimetableChange = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { versionId } = req.params;
    const { action, oldValue, newValue, reason } = req.body;

    const changeLogRepository = AppDataSource.getRepository(TimetableChangeLog);
    const changeLog = changeLogRepository.create({
      versionId,
      action,
      oldValue,
      newValue,
      changedBy: req.user?.id || '',
      reason: reason || null
    });

    const saved = await changeLogRepository.save(changeLog);
    res.json(saved);
  } catch (error: any) {
    console.error('Error logging change:', error);
    res.status(500).json({ message: 'Failed to log change', error: error.message });
  }
};

// Manual entry placement with conflict checking
export const createTimetableEntryManual = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { timetableId, day, period, teacherId, classId, subjectId, room, isLocked } = req.body;

    if (!timetableId || !day || !period) {
      return res.status(400).json({ message: 'Timetable ID, day, and period are required' });
    }

    const entryRepository = AppDataSource.getRepository(TimetableEntry);
    const generator = new TimetableGeneratorService();

    // Check for conflicts before creating
    const periodKey = `${day}-${period}`;
    const existingEntries = await entryRepository.find({
      where: { timetableId, day, period }
    });

    const conflicts: any[] = [];

    // Check teacher conflict
    if (teacherId) {
      const teacherConflict = existingEntries.find(e => e.teacherId === teacherId);
      if (teacherConflict) {
        conflicts.push({
          type: 'teacher',
          entityId: teacherId,
          entityName: 'Teacher',
          day,
          period,
          message: 'Teacher is already assigned to this time slot'
        });
      }
    }

    // Check class conflict
    if (classId) {
      const classConflict = existingEntries.find(e => e.classId === classId);
      if (classConflict) {
        conflicts.push({
          type: 'class',
          entityId: classId,
          entityName: 'Class',
          day,
          period,
          message: 'Class is already assigned to this time slot'
        });
      }
    }

    // If conflicts exist, return them
    if (conflicts.length > 0) {
      return res.status(409).json({
        message: 'Conflicts detected',
        conflicts
      });
    }

    // Create the entry
    const entry = entryRepository.create({
      timetableId,
      day,
      period: period.toString(),
      teacherId: teacherId || null,
      classId: classId || null,
      subjectId: subjectId || null,
      room: room || null,
      isLocked: isLocked || false
    });

    const saved = await entryRepository.save(entry);
    res.json({ entry: saved, conflicts: [] });
  } catch (error: any) {
    console.error('Error creating manual entry:', error);
    res.status(500).json({ message: 'Failed to create entry', error: error.message });
  }
};

// Update entry manually (with conflict checking)
export const updateTimetableEntryManual = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const { day, period, teacherId, classId, subjectId, room, isLocked } = req.body;

    const entryRepository = AppDataSource.getRepository(TimetableEntry);
    const entry = await entryRepository.findOne({ where: { id } });

    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    // Check for conflicts if day/period/teacher/class changed
    if (day || period || teacherId || classId) {
      const newDay = day || entry.day;
      const newPeriod = period || entry.period;
      const newTeacherId = teacherId !== undefined ? teacherId : entry.teacherId;
      const newClassId = classId !== undefined ? classId : entry.classId;

      const existingEntries = await entryRepository.find({
        where: { timetableId: entry.timetableId, day: newDay, period: newPeriod.toString() }
      });

      const conflicts: any[] = [];

      // Check teacher conflict (excluding current entry)
      if (newTeacherId) {
        const teacherConflict = existingEntries.find(e => e.id !== id && e.teacherId === newTeacherId);
        if (teacherConflict) {
          conflicts.push({
            type: 'teacher',
            entityId: newTeacherId,
            entityName: 'Teacher',
            day: newDay,
            period: newPeriod,
            message: 'Teacher is already assigned to this time slot'
          });
        }
      }

      // Check class conflict (excluding current entry)
      if (newClassId) {
        const classConflict = existingEntries.find(e => e.id !== id && e.classId === newClassId);
        if (classConflict) {
          conflicts.push({
            type: 'class',
            entityId: newClassId,
            entityName: 'Class',
            day: newDay,
            period: newPeriod,
            message: 'Class is already assigned to this time slot'
          });
        }
      }

      // If conflicts exist, return them
      if (conflicts.length > 0) {
        return res.status(409).json({
          message: 'Conflicts detected',
          conflicts
        });
      }
    }

    // Update the entry
    if (day !== undefined) entry.day = day;
    if (period !== undefined) entry.period = period.toString();
    if (teacherId !== undefined) entry.teacherId = teacherId;
    if (classId !== undefined) entry.classId = classId;
    if (subjectId !== undefined) entry.subjectId = subjectId;
    if (room !== undefined) entry.room = room;
    if (isLocked !== undefined) entry.isLocked = isLocked;

    const saved = await entryRepository.save(entry);
    res.json({ entry: saved, conflicts: [] });
  } catch (error: any) {
    console.error('Error updating manual entry:', error);
    res.status(500).json({ message: 'Failed to update entry', error: error.message });
  }
};

// Lock/unlock entry
export const toggleEntryLock = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const { isLocked } = req.body;

    const entryRepository = AppDataSource.getRepository(TimetableEntry);
    const entry = await entryRepository.findOne({ where: { id } });

    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    entry.isLocked = isLocked !== undefined ? isLocked : !entry.isLocked;
    const saved = await entryRepository.save(entry);

    res.json({ entry: saved, message: `Entry ${saved.isLocked ? 'locked' : 'unlocked'}` });
  } catch (error: any) {
    console.error('Error toggling entry lock:', error);
    res.status(500).json({ message: 'Failed to toggle lock', error: error.message });
  }
};


import { Response } from 'express';
import { In, IsNull } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Exam, ExamType, ExamStatus } from '../entities/Exam';
import { Marks } from '../entities/Marks';
import { Student } from '../entities/Student';
import { Subject } from '../entities/Subject';
import { Class } from '../entities/Class';
import { Teacher } from '../entities/Teacher';
import { Settings } from '../entities/Settings';
import { ReportCardRemarks } from '../entities/ReportCardRemarks';
import { Parent } from '../entities/Parent';
import { Invoice } from '../entities/Invoice';
import { Attendance, AttendanceStatus } from '../entities/Attendance';
import { AuthRequest } from '../middleware/auth';
import { createReportCardPDF } from '../utils/pdfGenerator';
import { createMarkSheetPDF } from '../utils/markSheetPdfGenerator';

// Helper function to normalize examType to match enum values (e.g., "Mid-Term" -> "mid_term")
function normalizeExamType(type: string): ExamType {
  if (!type) {
    throw new Error('Exam type is required');
  }
  
  const normalized = type.toLowerCase().replace(/-/g, '_').trim();
  console.log('[normalizeExamType] Input:', type, 'Normalized:', normalized);
  
  // Map common variations to enum values
  if (normalized === 'mid_term' || normalized === 'midterm') {
    return ExamType.MID_TERM;
  } else if (normalized === 'end_term' || normalized === 'endterm') {
    return ExamType.END_TERM;
  } else if (normalized === 'assignment') {
    return ExamType.ASSIGNMENT;
  } else if (normalized === 'quiz') {
    return ExamType.QUIZ;
  }
  
  // If it's already a valid enum value, return it
  const validValues = Object.values(ExamType);
  if (validValues.includes(type as ExamType)) {
    return type as ExamType;
  }
  
  // If normalized matches a valid enum value
  if (validValues.includes(normalized as ExamType)) {
    return normalized as ExamType;
  }
  
  // If we can't match, throw an error with helpful message
  throw new Error(`Invalid exam type: "${type}". Valid types are: ${validValues.join(', ')}`);
}

// Helper function to assign positions with proper tie handling
// Students with the same score (average or percentage) get the same position, and positions are skipped after ties
function assignPositionsWithTies<T extends { studentId: string } & ({ average?: number; percentage?: number })>(
  rankings: T[]
): Array<T & { position: number }> {
  if (rankings.length === 0) return [];
  
  const result: Array<T & { position: number }> = [];
  let currentPosition = 1;
  
  for (let i = 0; i < rankings.length; i++) {
    // Get the score value (either average or percentage)
    const currentScore = (rankings[i] as any).average !== undefined 
      ? (rankings[i] as any).average 
      : (rankings[i] as any).percentage;
    const previousScore = i > 0 
      ? ((rankings[i - 1] as any).average !== undefined 
          ? (rankings[i - 1] as any).average 
          : (rankings[i - 1] as any).percentage)
      : null;
    
    // If this is the first item or the score is different from the previous, assign new position
    if (i === 0 || previousScore === null || Math.abs(currentScore - previousScore) > 0.001) {
      currentPosition = i + 1;
    }
    
    result.push({
      ...rankings[i],
      position: currentPosition
    } as T & { position: number });
  }
  
  return result;
}

export const createExam = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { name, type, examDate, description, term, classId, subjectIds } = req.body;
    
    // Log received data for debugging
    console.log('Received exam data:', {
      name,
      type,
      examDate,
      description,
      classId,
      subjectIds,
      classIdType: typeof classId,
      classIdLength: classId?.length
    });
    
    // Validate required fields
    if (!name || (typeof name === 'string' && name.trim() === '')) {
      console.error('Validation failed: Exam name is missing or empty');
      return res.status(400).json({ message: 'Exam name is required' });
    }

    if (!type || (typeof type === 'string' && type.trim() === '')) {
      console.error('Validation failed: Exam type is missing or empty');
      return res.status(400).json({ message: 'Exam type is required' });
    }

    if (!examDate || (typeof examDate === 'string' && examDate.trim() === '')) {
      console.error('Validation failed: Exam date is missing or empty');
      return res.status(400).json({ message: 'Exam date is required' });
    }

    if (!classId || (typeof classId === 'string' && classId.trim() === '') || classId === 'null' || classId === 'undefined') {
      console.error('Validation failed: Class ID is missing, empty, or invalid. Received:', classId);
      return res.status(400).json({ message: 'Class ID is required. Please select a class.' });
    }

    // Validate exam type
    const validTypes = Object.values(ExamType);
    if (!validTypes.includes(type as ExamType)) {
      return res.status(400).json({ 
        message: `Invalid exam type. Must be one of: ${validTypes.join(', ')}` 
      });
    }

    const examRepository = AppDataSource.getRepository(Exam);
    const classRepository = AppDataSource.getRepository(Class);
    const subjectRepository = AppDataSource.getRepository(Subject);

    // Validate classId format (should be UUID)
    const trimmedClassId = String(classId).trim();
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(trimmedClassId)) {
      return res.status(400).json({ 
        message: 'Invalid class ID format. Please select a valid class.' 
      });
    }

    // Verify class exists
    const classEntity = await classRepository.findOne({ where: { id: trimmedClassId } });
    if (!classEntity) {
      console.error(`Class not found with ID: ${trimmedClassId}`);
      return res.status(404).json({ 
        message: `Class not found. Please ensure the class exists and try again.` 
      });
    }

    // Parse examDate if it's a string
    let parsedExamDate: Date;
    if (typeof examDate === 'string') {
      // Handle HTML date input format (YYYY-MM-DD)
      if (examDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Create date in local timezone to avoid timezone issues
        const [year, month, day] = examDate.split('-').map(Number);
        parsedExamDate = new Date(year, month - 1, day);
      } else {
        parsedExamDate = new Date(examDate);
      }
      
      if (isNaN(parsedExamDate.getTime())) {
        return res.status(400).json({ message: `Invalid exam date format: ${examDate}` });
      }
    } else if (examDate instanceof Date) {
      parsedExamDate = examDate;
    } else {
      return res.status(400).json({ message: 'Exam date must be a valid date' });
    }

    // Create exam
    const examData: Partial<Exam> = {
      name: String(name).trim(),
      type: type as ExamType,
      examDate: parsedExamDate,
      classId: trimmedClassId,
      term: term ? String(term).trim() : null
    };
    
    // Only include description if it's provided and not empty
    const trimmedDescription = description ? String(description).trim() : '';
    if (trimmedDescription !== '') {
      examData.description = trimmedDescription;
    }

    const exam = examRepository.create(examData) as Exam;

    // Load subjects if provided (subjects are optional)
    let subjectsToAssign: Subject[] = [];
    if (subjectIds !== undefined && subjectIds !== null) {
      if (!Array.isArray(subjectIds)) {
        return res.status(400).json({ 
          message: 'Subject IDs must be an array' 
        });
      }
      
      if (subjectIds.length > 0) {
        // Filter out any empty, null, or undefined values
        const validSubjectIds = subjectIds.filter(id => {
          if (!id) return false;
          const idStr = String(id).trim();
          return idStr !== '' && idStr !== 'null' && idStr !== 'undefined';
        });
        
        if (validSubjectIds.length > 0) {
          try {
            // Ensure we have valid UUIDs
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const invalidUuids = validSubjectIds.filter(id => !uuidPattern.test(String(id)));
            
            if (invalidUuids.length > 0) {
              return res.status(400).json({ 
                message: `Invalid subject ID format: ${invalidUuids.join(', ')}` 
              });
            }
            
            const subjects = await subjectRepository.find({ where: { id: In(validSubjectIds) } });
            
            // Check if all subjects were found
            const foundIds = subjects.map(s => s.id);
            const missingIds = validSubjectIds.filter(id => !foundIds.includes(String(id)));
            
            if (missingIds.length > 0) {
              return res.status(400).json({ 
                message: `One or more subjects not found. Invalid subject IDs: ${missingIds.join(', ')}` 
              });
            }
            
            subjectsToAssign = subjects;
          } catch (subjectError: any) {
            console.error('Error loading subjects:', subjectError);
            return res.status(400).json({ 
              message: 'Error validating subjects. Please ensure all selected subjects exist.' 
            });
          }
        }
      }
    }

    let savedExam: Exam;
    try {
      console.log('Saving exam with data:', {
        name: exam.name,
        type: exam.type,
        examDate: exam.examDate,
        classId: exam.classId,
        subjectCount: subjectsToAssign.length
      });
      
      // Save the exam first (this will generate the ID)
      savedExam = await examRepository.save(exam);
      
      console.log('Exam saved successfully with ID:', savedExam.id);
      
      // If subjects were assigned, update the ManyToMany relationship
      if (subjectsToAssign.length > 0) {
        console.log('Assigning subjects to exam');
        savedExam.subjects = subjectsToAssign;
        savedExam = await examRepository.save(savedExam);
        console.log('Subjects assigned successfully');
      }
    } catch (saveError: any) {
      console.error('Save error details:', {
        code: saveError.code,
        detail: saveError.detail,
        message: saveError.message,
        constraint: saveError.constraint,
        table: saveError.table,
        stack: saveError.stack
      });
      
      // More specific error handling for save errors
      if (saveError.code === '23503') {
        // Foreign key constraint violation
        if (saveError.detail && (saveError.detail.includes('classId') || saveError.detail.includes('class'))) {
          return res.status(400).json({ 
            message: 'Invalid class reference. The selected class does not exist in the database.',
            detail: saveError.detail 
          });
        }
        if (saveError.detail && (saveError.detail.includes('subject') || saveError.detail.includes('Subject'))) {
          return res.status(400).json({ 
            message: 'Invalid subject reference. One or more selected subjects do not exist in the database.',
            detail: saveError.detail 
          });
        }
        return res.status(400).json({ 
          message: 'Invalid reference. Please check that the class and subjects exist.',
          detail: saveError.detail || saveError.message
        });
      }
      throw saveError; // Re-throw if it's not a known error
    }
    
    // Load the exam with relations
    const finalExam = await examRepository.findOne({
      where: { id: savedExam.id },
      relations: ['classEntity', 'subjects']
    });

    if (!finalExam) {
      console.error('Failed to load saved exam');
      return res.status(500).json({ message: 'Exam created but failed to load. Please refresh the exam list.' });
    }

    res.status(201).json({ 
      message: 'Exam created successfully', 
      exam: finalExam 
    });
  } catch (error: any) {
    console.error('Error creating exam:', error);
    console.error('Error details:', {
      code: error.code,
      detail: error.detail,
      message: error.message,
      constraint: error.constraint
    });
    
    // Handle specific database errors
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Exam with this name already exists' });
    }
    
    if (error.code === '23503') {
      // Foreign key constraint violation - provide more details
      if (error.detail) {
        if (error.detail.includes('classId') || error.detail.includes('class')) {
          return res.status(400).json({ message: 'Invalid class reference. The selected class does not exist in the database.' });
        }
        if (error.detail.includes('subject') || error.detail.includes('Subject')) {
          return res.status(400).json({ message: 'Invalid subject reference. One or more selected subjects do not exist.' });
        }
      }
      return res.status(400).json({ message: 'Invalid reference. Please verify that the class and all selected subjects exist.' });
    }

    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getExams = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const examRepository = AppDataSource.getRepository(Exam);
    const { classId } = req.query;

    const where: any = {};
    if (classId) {
      where.classId = classId;
    }

    const exams = await examRepository.find({
      where,
      relations: ['classEntity', 'subjects']
    });

    res.json(exams);
  } catch (error: any) {
    console.error('Error fetching exams:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const getExamById = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const examRepository = AppDataSource.getRepository(Exam);
    const { id } = req.params;

    const exam = await examRepository.findOne({
      where: { id },
      relations: ['classEntity', 'subjects']
    });

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    res.json(exam);
  } catch (error: any) {
    console.error('Error fetching exam:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const deleteExam = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const examRepository = AppDataSource.getRepository(Exam);
    const marksRepository = AppDataSource.getRepository(Marks);
    const { id } = req.params;

    console.log('Attempting to delete exam with ID:', id);

    const exam = await examRepository.findOne({
      where: { id },
      relations: ['subjects']
    });

    if (!exam) {
      console.log('Exam not found with ID:', id);
      return res.status(404).json({ message: 'Exam not found' });
    }

    console.log('Found exam:', exam.name);

    // Delete all marks associated with this exam
    const marks = await marksRepository.find({
      where: { examId: id }
    });
    
    if (marks.length > 0) {
      console.log(`Deleting ${marks.length} marks associated with exam`);
      await marksRepository.remove(marks);
    }

    // Remove subject associations (ManyToMany)
    if (exam.subjects && exam.subjects.length > 0) {
      console.log('Removing subject associations');
      exam.subjects = [];
      await examRepository.save(exam);
    }

    // Delete the exam
    console.log('Deleting exam:', exam.name);
    await examRepository.remove(exam);
    console.log('Exam deleted successfully');

    res.json({ message: 'Exam deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting exam:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const deleteAllExams = async (req: AuthRequest, res: Response) => {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const examRepository = AppDataSource.getRepository(Exam);
    const marksRepository = AppDataSource.getRepository(Marks);

    console.log('Attempting to delete all exams');

    // Get all exams
    const exams = await examRepository.find({
      relations: ['subjects']
    });

    console.log(`Found ${exams.length} exams to delete`);

    if (exams.length === 0) {
      return res.json({ message: 'No exams found to delete', deletedCount: 0 });
    }

    // Get all exam IDs
    const examIds = exams.map(exam => exam.id);

    // Delete all marks associated with these exams
    const marks = await marksRepository.find({
      where: { examId: In(examIds) }
    });

    if (marks.length > 0) {
      console.log(`Deleting ${marks.length} marks associated with exams`);
      await marksRepository.remove(marks);
    }

    // Remove subject associations for all exams
    for (const exam of exams) {
      if (exam.subjects && exam.subjects.length > 0) {
        exam.subjects = [];
        await examRepository.save(exam);
      }
    }

    // Delete all exams
    console.log('Deleting all exams');
    await examRepository.remove(exams);
    console.log(`Successfully deleted ${exams.length} exams`);

    res.json({ 
      message: `Successfully deleted ${exams.length} exam(s)`, 
      deletedCount: exams.length 
    });
  } catch (error: any) {
    console.error('Error deleting all exams:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const publishExam = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const examRepository = AppDataSource.getRepository(Exam);
    const { examId } = req.body;

    if (!examId) {
      return res.status(400).json({ message: 'Exam ID is required' });
    }

    const exam = await examRepository.findOne({
      where: { id: examId },
      relations: ['classEntity', 'subjects']
    });

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    // Publish this exam and all related exams (same class, term, and type)
    // This ensures all students' results for this exam period are published together
    const whereCondition: any = {
      classId: exam.classId,
      type: exam.type
    };
    
    // Handle term condition - use IsNull() for null values
    if (exam.term !== null && exam.term !== undefined) {
      whereCondition.term = exam.term;
    } else {
      whereCondition.term = IsNull();
    }
    
    const relatedExams = await examRepository.find({
      where: whereCondition
    });

    // Update all related exams to published status
    for (const relatedExam of relatedExams) {
      relatedExam.status = ExamStatus.PUBLISHED;
      await examRepository.save(relatedExam);
    }

    res.json({ 
      message: `Exam results published successfully. Results for all students in ${relatedExams.length} exam(s) are now visible to all users.`,
      exam: exam,
      publishedCount: relatedExams.length
    });
  } catch (error: any) {
    console.error('Error publishing exam:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const publishExamByType = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const examRepository = AppDataSource.getRepository(Exam);
    const { examType, term } = req.body;

    if (!examType) {
      return res.status(400).json({ message: 'Exam type is required' });
    }

    if (!term) {
      return res.status(400).json({ message: 'Term is required' });
    }

    // Find all exams of the specified type and term (across all classes)
    const whereCondition: any = {
      type: examType as ExamType,
      term: term
    };
    
    const exams = await examRepository.find({
      where: whereCondition,
      relations: ['classEntity', 'subjects']
    });

    if (exams.length === 0) {
      return res.status(404).json({ 
        message: `No exams found for ${examType} in ${term}` 
      });
    }

    // Update all exams to published status
    let publishedCount = 0;
    for (const exam of exams) {
      if (exam.status !== ExamStatus.PUBLISHED) {
        exam.status = ExamStatus.PUBLISHED;
        await examRepository.save(exam);
        publishedCount++;
      }
    }

    res.json({ 
      message: `Exam results published successfully. ${publishedCount} exam(s) published across all classes. Results are now visible to all users.`,
      publishedCount: publishedCount,
      totalExams: exams.length
    });
  } catch (error: any) {
    console.error('Error publishing exams by type:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const unpublishExamByType = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const examRepository = AppDataSource.getRepository(Exam);
    const { examType, term } = req.body;

    if (!examType) {
      return res.status(400).json({ message: 'Exam type is required' });
    }

    if (!term) {
      return res.status(400).json({ message: 'Term is required' });
    }

    // Find all exams of the specified type and term (across all classes)
    const whereCondition: any = {
      type: examType as ExamType,
      term: term
    };
    
    const exams = await examRepository.find({
      where: whereCondition,
      relations: ['classEntity', 'subjects']
    });

    if (exams.length === 0) {
      return res.status(404).json({ 
        message: `No exams found for ${examType} in ${term}` 
      });
    }

    // Update all exams back to draft status
    let unpublishedCount = 0;
    for (const exam of exams) {
      if (exam.status === ExamStatus.PUBLISHED) {
        exam.status = ExamStatus.DRAFT;
        await examRepository.save(exam);
        unpublishedCount++;
      }
    }

    if (unpublishedCount === 0) {
      return res.status(400).json({ 
        message: `No published exams found for ${examType} in ${term}. All exams are already in draft status.`
      });
    }

    res.json({ 
      message: `Exam results unpublished successfully. ${unpublishedCount} exam(s) unpublished across all classes. Results are no longer visible to students, parents, and teachers. Marks and comments can now be edited.`,
      unpublishedCount: unpublishedCount,
      totalExams: exams.length
    });
  } catch (error: any) {
    console.error('Error unpublishing exams by type:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const captureMarks = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { examId, marksData } = req.body; // marksData: [{studentId, subjectId, score, maxScore, comments}]
    
    // Validate examId
    if (!examId) {
      console.error('Error: examId is missing from request body');
      return res.status(400).json({ message: 'Exam ID is required' });
    }
    
    // Check if exam is published - prevent editing
    const examRepository = AppDataSource.getRepository(Exam);
    const exam = await examRepository.findOne({ where: { id: examId } });
    
    if (exam && exam.status === ExamStatus.PUBLISHED) {
      return res.status(403).json({ 
        message: 'Cannot edit marks. Exam results have been published and are now read-only.' 
      });
    }
    
    console.log('Capturing marks for examId:', examId);
    console.log('Marks data received:', JSON.stringify(marksData, null, 2));
    
    const marksRepository = AppDataSource.getRepository(Marks);
    const subjectRepository = AppDataSource.getRepository(Subject);
    const studentRepository = AppDataSource.getRepository(Student);

    // Check for existing marks and update or create
    const marksToSave: Marks[] = [];
    
    for (const mark of marksData) {
      // Ensure student belongs to current school
      const student = await studentRepository.findOne({
        where: { id: String(mark.studentId) }
      });
      if (!student) {
        console.warn('Skipping mark entry for invalid student or mismatched school', mark.studentId);
        continue;
      }

      // Ensure subject belongs to current school
      const subject = await subjectRepository.findOne({
        where: { id: String(mark.subjectId) }
      });
      if (!subject) {
        console.warn('Skipping mark entry for invalid subject or mismatched school', mark.subjectId);
        continue;
      }

      // Check if mark already exists
      const existing = await marksRepository.findOne({
        where: {
          examId,
          studentId: mark.studentId,
          subjectId: mark.subjectId,
        }
      });

      if (existing) {
        // Update existing mark
        existing.score = mark.score ? Math.round(parseFloat(String(mark.score))) : 0;
        existing.maxScore = mark.maxScore ? Math.round(parseFloat(String(mark.maxScore))) : 100;
        existing.comments = mark.comments || existing.comments;
        marksToSave.push(existing);
      } else {
        // Create new mark
        const newMark = marksRepository.create({
          examId: String(examId), // Ensure examId is a string
          studentId: String(mark.studentId),
          subjectId: String(mark.subjectId),
          score: mark.score ? Math.round(parseFloat(String(mark.score))) : 0,
          maxScore: mark.maxScore ? Math.round(parseFloat(String(mark.maxScore))) : 100,
          comments: mark.comments || null,
        });
        console.log('Creating new mark:', {
          examId: newMark.examId,
          studentId: newMark.studentId,
          subjectId: newMark.subjectId,
          score: newMark.score,
          maxScore: newMark.maxScore
        });
        marksToSave.push(newMark);
      }
    }

    await marksRepository.save(marksToSave);
    
    res.json({ 
      message: 'Marks saved successfully. Report cards are now available for all students.',
      examId,
      savedCount: marksToSave.length
    });
  } catch (error: any) {
    console.error('Error capturing marks:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

export const getMarks = async (req: AuthRequest, res: Response) => {
  try {
    const marksRepository = AppDataSource.getRepository(Marks);
    const examRepository = AppDataSource.getRepository(Exam);
    const { examId, studentId, classId } = req.query;
    const user = req.user;

    const where: any = { };
    if (examId) where.examId = examId;
    if (studentId) where.studentId = studentId;

    let marks = await marksRepository.find({
      where,
      relations: ['student', 'exam', 'subject']
    });

    // Filter by class if provided
    if (classId) {
      marks = marks.filter(mark => mark.student.classId === classId);
    }

    // Filter by exam status: non-admin users can only see published exams
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
    if (!isAdmin) {
      // Get all exam IDs from marks
      const examIds = [...new Set(marks.map(m => m.examId))];
      const exams = await examRepository.find({
        where: { id: In(examIds) }
      });
      const publishedExamIds = new Set(
        exams.filter(e => e.status === ExamStatus.PUBLISHED).map(e => e.id)
      );
      // Only return marks from published exams
      marks = marks.filter(mark => publishedExamIds.has(mark.examId));
    }

    // Round all scores to integers
    const roundedMarks = marks.map(mark => ({
      ...mark,
      score: Math.round(parseFloat(String(mark.score)) || 0),
      maxScore: Math.round(parseFloat(String(mark.maxScore)) || 100)
    }));

    res.json(roundedMarks);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const getStudentRankings = async (req: AuthRequest, res: Response) => {
  try {
    const { examId, classId } = req.query;
    const marksRepository = AppDataSource.getRepository(Marks);

    // Get all marks for the exam
    const marks = await marksRepository.find({
      where: { examId: examId as string },
      relations: ['student', 'subject', 'exam']
    });

    // Filter by class if provided
    let filteredMarks = marks;
    if (classId) {
      filteredMarks = marks.filter(m => m.student.classId === classId);
    }

    // Calculate averages per student
    const studentAverages: { [key: string]: { total: number; count: number; student: Student } } = {};

    filteredMarks.forEach(mark => {
      const studentId = mark.studentId;
      if (!studentAverages[studentId]) {
        studentAverages[studentId] = {
          total: 0,
          count: 0,
          student: mark.student
        };
      }
      studentAverages[studentId].total += (mark.score / mark.maxScore) * 100;
      studentAverages[studentId].count += 1;
    });

    // Calculate final averages and create rankings
    const rankings = Object.values(studentAverages).map(avg => ({
      studentId: avg.student.id,
      studentName: `${avg.student.firstName} ${avg.student.lastName}`,
      average: avg.count > 0 ? avg.total / avg.count : 0
    }));

    // Sort by average descending
    rankings.sort((a, b) => b.average - a.average);

    // Add positions with proper tie handling
    const rankingsWithTies = assignPositionsWithTies(rankings);
    const rankingsWithPositions = rankingsWithTies.map(rank => ({
      ...rank,
      classPosition: rank.position
    }));

    res.json(rankingsWithPositions);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const getSubjectRankings = async (req: AuthRequest, res: Response) => {
  try {
    const { examId, subjectId, classId } = req.query;
    const marksRepository = AppDataSource.getRepository(Marks);

    const where: any = { examId: examId as string, subjectId: subjectId as string };
    let marks = await marksRepository.find({
      where,
      relations: ['student', 'subject']
    });

    if (classId) {
      marks = marks.filter(m => m.student.classId === classId);
    }

    // Calculate percentage and sort
    const subjectRankings = marks
      .map(mark => {
        const roundedScore = Math.round(parseFloat(String(mark.score)) || 0);
        const roundedMaxScore = Math.round(parseFloat(String(mark.maxScore)) || 100);
        return {
          studentId: mark.student.id,
          studentName: `${mark.student.firstName} ${mark.student.lastName}`,
          score: roundedScore,
          maxScore: roundedMaxScore,
          percentage: roundedMaxScore > 0 ? (roundedScore / roundedMaxScore) * 100 : 0
        };
      })
      .sort((a, b) => b.percentage - a.percentage);
    
    // Assign positions with proper tie handling
    const rankingsWithTies = assignPositionsWithTies(subjectRankings);
    const subjectRankingsWithPositions = rankingsWithTies.map(rank => ({
      ...rank,
      subjectPosition: rank.position
    }));

    res.json(subjectRankingsWithPositions);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const getClassRankingsByType = async (req: AuthRequest, res: Response) => {
  try {
    const { examType, classId } = req.query;
    
    if (!examType || !classId) {
      return res.status(400).json({ message: 'Exam type and class ID are required' });
    }

    const marksRepository = AppDataSource.getRepository(Marks);
    const examRepository = AppDataSource.getRepository(Exam);

    // Get all exams of the specified type for this class
    const exams = await examRepository.find({
      where: {
        classId: classId as string,
        type: examType as ExamType,
      }
    });

    if (exams.length === 0) {
      return res.status(404).json({ message: `No exams found for class with exam type: ${examType}` });
    }

    const examIds = exams.map(e => e.id);

    // Get all marks for these exams
    const marks = await marksRepository.find({
      where: { examId: In(examIds) },
      relations: ['student', 'subject', 'exam']
    });

    // Filter by class
    const filteredMarks = marks.filter(m => m.student.classId === classId);

    // Calculate averages per student across all exams
    const studentAverages: { [key: string]: { total: number; count: number; student: Student } } = {};

    filteredMarks.forEach(mark => {
      const studentId = mark.studentId;
      if (!studentAverages[studentId]) {
        studentAverages[studentId] = {
          total: 0,
          count: 0,
          student: mark.student
        };
      }
      studentAverages[studentId].total += (mark.score / mark.maxScore) * 100;
      studentAverages[studentId].count += 1;
    });

    // Calculate final averages and create rankings
    const rankings = Object.values(studentAverages).map(avg => ({
      studentId: avg.student.id,
      studentName: `${avg.student.firstName} ${avg.student.lastName}`,
      average: avg.count > 0 ? avg.total / avg.count : 0
    }));

    // Sort by average descending
    rankings.sort((a, b) => b.average - a.average);

    // Add positions with proper tie handling
    const rankingsWithTies = assignPositionsWithTies(rankings);
    const rankingsWithPositions = rankingsWithTies.map(rank => ({
      ...rank,
      classPosition: rank.position
    }));

    res.json(rankingsWithPositions);
  } catch (error: any) {
    console.error('Error getting class rankings by type:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getSubjectRankingsByType = async (req: AuthRequest, res: Response) => {
  try {
    const { examType, subjectId } = req.query;
    
    if (!examType || !subjectId) {
      return res.status(400).json({ message: 'Exam type and subject ID are required' });
    }

    const marksRepository = AppDataSource.getRepository(Marks);
    const examRepository = AppDataSource.getRepository(Exam);

    // Get all exams of the specified type
    const exams = await examRepository.find({
      where: {
        type: examType as ExamType,
      }
    });

    if (exams.length === 0) {
      return res.status(404).json({ message: `No exams found with exam type: ${examType}` });
    }

    const examIds = exams.map(e => e.id);

    // Get all marks for these exams and the specified subject
    const marks = await marksRepository.find({
      where: { 
        examId: In(examIds),
        subjectId: subjectId as string,
      },
      relations: ['student', 'subject']
    });

    // Calculate percentage and aggregate by student (average across all exams)
    const studentMarks: { [key: string]: { scores: number[]; maxScores: number[]; student: Student } } = {};

    marks.forEach(mark => {
      const studentId = mark.studentId;
      if (!studentMarks[studentId]) {
        studentMarks[studentId] = {
          scores: [],
          maxScores: [],
          student: mark.student
        };
      }
      studentMarks[studentId].scores.push(Math.round(parseFloat(String(mark.score)) || 0));
      studentMarks[studentId].maxScores.push(Math.round(parseFloat(String(mark.maxScore)) || 100));
    });

    // Calculate average percentage per student
    const subjectRankings = Object.values(studentMarks)
      .map(studentData => {
        const totalScore = studentData.scores.reduce((a, b) => a + b, 0);
        const totalMaxScore = studentData.maxScores.reduce((a, b) => a + b, 0);
        return {
          studentId: studentData.student.id,
          studentName: `${studentData.student.firstName} ${studentData.student.lastName}`,
          score: totalScore,
          maxScore: totalMaxScore,
          percentage: totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0
        };
      })
      .sort((a, b) => b.percentage - a.percentage);
    
    // Assign positions with proper tie handling
    const rankingsWithTies = assignPositionsWithTies(subjectRankings);
    const subjectRankingsWithPositions = rankingsWithTies.map(rank => ({
      ...rank,
      subjectPosition: rank.position
    }));

    res.json(subjectRankingsWithPositions);
  } catch (error: any) {
    console.error('Error getting subject rankings by type:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getFormRankings = async (req: AuthRequest, res: Response) => {
  try {
    const { examId, form } = req.query;
    const marksRepository = AppDataSource.getRepository(Marks);
    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);

    // Get all classes for the form
    const classes = await classRepository.find({ where: { form: form as string } });
    const classIds = classes.map(c => c.id);

    // Get all students in these classes
    const students = await studentRepository.find({
      where: { classId: In(classIds) }
    });

    const studentIds = students.map(s => s.id);

    // Get all marks for these students
    const marks = await marksRepository.find({
      where: { examId: examId as string },
      relations: ['student', 'subject']
    });

    const filteredMarks = marks.filter(m => studentIds.includes(m.studentId));

    // Calculate averages
    const studentAverages: { [key: string]: { total: number; count: number; student: Student } } = {};

    filteredMarks.forEach(mark => {
      const studentId = mark.studentId;
      if (!studentAverages[studentId]) {
        studentAverages[studentId] = {
          total: 0,
          count: 0,
          student: mark.student
        };
      }
      studentAverages[studentId].total += (mark.score / mark.maxScore) * 100;
      studentAverages[studentId].count += 1;
    });

    const rankings = Object.values(studentAverages)
      .map(avg => ({
        studentId: avg.student.id,
        studentName: `${avg.student.firstName} ${avg.student.lastName}`,
        average: avg.count > 0 ? avg.total / avg.count : 0
      }))
      .sort((a, b) => b.average - a.average);
    
    // Assign positions with proper tie handling
    const rankingsWithTies = assignPositionsWithTies(rankings);
    const rankingsWithPositions = rankingsWithTies.map(rank => ({
      ...rank,
      formPosition: rank.position
    }));

    res.json(rankingsWithPositions);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const getOverallPerformanceRankings = async (req: AuthRequest, res: Response) => {
  try {
    const { form, examType } = req.query;
    
    if (!form || !examType) {
      return res.status(400).json({ message: 'Form and exam type are required' });
    }

    const marksRepository = AppDataSource.getRepository(Marks);
    const studentRepository = AppDataSource.getRepository(Student);
    const classRepository = AppDataSource.getRepository(Class);
    const examRepository = AppDataSource.getRepository(Exam);

    // Get all classes for the form/stream
    const classes = await classRepository.find({ where: { form: form as string } });
    if (classes.length === 0) {
      return res.status(404).json({ message: `No classes found for form: ${form}` });
    }

    const classIds = classes.map(c => c.id);

    // Get all students in these classes with class relation loaded
    const students = await studentRepository.find({
      where: { classId: In(classIds) },
      relations: ['classEntity']
    });
    
    // Create a map of student IDs to class names for quick lookup
    const studentClassMap = new Map<string, string>();
    students.forEach(student => {
      if (student.classEntity) {
        studentClassMap.set(student.id, student.classEntity.name);
      }
    });

    if (students.length === 0) {
      return res.status(404).json({ message: `No students found in form: ${form}` });
    }

    const studentIds = students.map(s => s.id);

    // Get all exams of the specified type for these classes
    const exams = await examRepository.find({
      where: {
        classId: In(classIds),
        type: examType as ExamType,
      }
    });

    if (exams.length === 0) {
      return res.status(404).json({ message: `No exams found for form ${form} with exam type: ${examType}` });
    }

    const examIds = exams.map(e => e.id);

    // Get all marks for these students across all exams of this type
    const marks = await marksRepository.find({
      where: { examId: In(examIds) },
      relations: ['student', 'subject', 'exam']
    });

    const filteredMarks = marks.filter(m => studentIds.includes(m.studentId));

    // Calculate overall averages across all exams
    const studentAverages: { [key: string]: { total: number; count: number; studentId: string; firstName: string; lastName: string } } = {};

    filteredMarks.forEach(mark => {
      const studentId = mark.studentId;
      if (!studentAverages[studentId]) {
        studentAverages[studentId] = {
          total: 0,
          count: 0,
          studentId: mark.student.id,
          firstName: mark.student.firstName,
          lastName: mark.student.lastName
        };
      }
      studentAverages[studentId].total += (mark.score / mark.maxScore) * 100;
      studentAverages[studentId].count += 1;
    });

    // Create rankings with overall performance, using the class map
    const rankings = Object.values(studentAverages)
      .map(avg => ({
        studentId: avg.studentId,
        studentName: `${avg.firstName} ${avg.lastName}`,
        average: avg.count > 0 ? avg.total / avg.count : 0,
        class: studentClassMap.get(avg.studentId) || 'N/A'
      }))
      .sort((a, b) => b.average - a.average);
    
    // Assign positions with proper tie handling
    const rankingsWithTies = assignPositionsWithTies(rankings);
    const rankingsWithPositions = rankingsWithTies.map(rank => ({
      ...rank,
      overallPosition: rank.position
    }));

    res.json(rankingsWithPositions);
  } catch (error: any) {
    console.error('Error getting overall performance rankings:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getReportCard = async (req: AuthRequest, res: Response) => {
  try {
    console.log('[getReportCard] Route handler called');
    console.log('[getReportCard] Request path:', req.path);
    console.log('[getReportCard] Request method:', req.method);
    console.log('[getReportCard] Request query:', req.query);
    
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { classId, examType, studentId, term, subjectId } = req.query;
    const user = req.user;
    const isParent = user?.role === 'parent';
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
    const isTeacher = user?.role === 'teacher';
    const isStudent = user?.role === 'student';
    const termValue = term ? String(term).trim() : '';
    
    console.log('[getReportCard] Report card request received:', { classId, examType, term: termValue, studentId, subjectId, isParent, isTeacher, isAdmin, isStudent, query: req.query, path: req.path });
    
    if (!classId || !examType || !termValue) {
      console.log('[getReportCard] Missing required parameters');
      return res.status(400).json({ message: 'Class ID, term, and exam type are required' });
    }

    // For students, verify they can only access their own report card
    if (isStudent) {
      console.log('[getReportCard] Student access detected');
      
      // Load student data if not available in user object
      let loggedInStudent = user?.student;
      if (!loggedInStudent && user?.id) {
        console.log('[getReportCard] Student data not in user object, querying...');
        const studentRepository = AppDataSource.getRepository(Student);
        loggedInStudent = await studentRepository.findOne({
          where: { userId: user.id },
          relations: ['classEntity']
        });
        
        if (!loggedInStudent) {
          console.log('[getReportCard] Student not found for user:', user.id);
          return res.status(403).json({ message: 'Student information not found. Please log in again.' });
        }
        
        // Attach to user object for later use
        if (user) {
          user.student = loggedInStudent;
        }
      }
      
      if (!loggedInStudent?.id) {
        console.log('[getReportCard] Student user missing student data');
        return res.status(403).json({ message: 'Student information not found. Please log in again.' });
      }
      
      // Verify the studentId in the request matches the logged-in student's ID
      if (studentId && studentId !== loggedInStudent.id) {
        console.log('[getReportCard] Student trying to access another student\'s report card');
        return res.status(403).json({ message: 'You can only access your own report card' });
      }
      
      // Ensure studentId is set to the logged-in student's ID
      if (!studentId) {
        console.log('[getReportCard] Student request missing studentId, using logged-in student ID');
        // Verify classId matches student's class
        if (classId && classId !== loggedInStudent.classId && classId !== loggedInStudent.classEntity?.id) {
          console.log('[getReportCard] Student class mismatch');
          return res.status(403).json({ message: 'You can only access report cards for your own class' });
        }
      } else {
        // Verify the requested studentId matches the logged-in student
        if (studentId !== loggedInStudent.id) {
          return res.status(403).json({ message: 'You can only access your own report card' });
        }
      }
    }

    // For parents, check balance before allowing access
    if (isParent && studentId) {
      const parentRepository = AppDataSource.getRepository(Parent);
      const invoiceRepository = AppDataSource.getRepository(Invoice);
      const settingsRepository = AppDataSource.getRepository(Settings);
      const studentRepository = AppDataSource.getRepository(Student);

      // Get parent
      const parent = await parentRepository.findOne({
        where: { userId: user.id },
        relations: ['students']
      });

      if (!parent) {
        return res.status(404).json({ message: 'Parent profile not found' });
      }

      // Verify student is linked to this parent
      const student = await studentRepository.findOne({
        where: { id: studentId as string, parentId: parent.id }
      });

      if (!student) {
        return res.status(403).json({ message: 'Student not found or not linked to your account' });
      }

      // Get settings for next term fees
      const settingsList = await settingsRepository.find({
        order: { createdAt: 'DESC' },
        take: 1
      });
      const settings = settingsList.length > 0 ? settingsList[0] : null;

      // Get latest invoice for balance calculation
      const latestInvoice = await invoiceRepository.findOne({
        where: { studentId: student.id },
        order: { createdAt: 'DESC' }
      });

      // Calculate term balance for access check
      let termBalance = 0;
      if (latestInvoice) {
        termBalance = parseFloat(String(latestInvoice.balance || 0));
      }

      // Check if term balance allows access (term balance must be zero)
      if (termBalance > 0) {
        const currencySymbol = settings?.currencySymbol || 'KES';
        return res.status(403).json({ 
          message: `Report card access is restricted. Please clear the outstanding term balance of ${currencySymbol} ${termBalance.toFixed(2)} to view the report card.`,
          balance: termBalance
        });
      }
    }

    const marksRepository = AppDataSource.getRepository(Marks);
    const studentRepository = AppDataSource.getRepository(Student);
    const examRepository = AppDataSource.getRepository(Exam);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const classRepository = AppDataSource.getRepository(Class);
    const teacherRepository = AppDataSource.getRepository(Teacher);

    // Verify class exists
    const classEntity = await classRepository.findOne({
      where: { id: classId as string },
      relations: ['subjects']
    });

    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // For teachers, verify assignment to class and subject
    if (isTeacher && user?.teacher?.id) {
      const teacher = await teacherRepository.findOne({
        where: { id: user.teacher.id },
        relations: ['classes', 'subjects']
      });

      if (!teacher) {
        return res.status(404).json({ message: 'Teacher not found' });
      }

      // Verify teacher is assigned to this class
      const isAssignedToClass = teacher.classes?.some(c => c.id === classId);
      if (!isAssignedToClass) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
      }

      // Verify teacher teaches this subject
      if (subjectId) {
        const teachesSubject = teacher.subjects?.some(s => s.id === subjectId);
        if (!teachesSubject) {
          return res.status(403).json({ message: 'You are not assigned to teach this subject' });
        }
      }
    }

    // Get all students enrolled in the class (including inactive students for report cards)
    console.log('Looking for students with classId:', classId);
    let students: Student[] = [];
    let parentStudentRecord: Student | null = null;
    let studentRecord: Student | null = null;
    
    // For students, fetch only their own record first
    if (isStudent && user?.student?.id) {
      console.log('[getReportCard] Student access - fetching own record');
      studentRecord = await studentRepository.findOne({
        where: { id: user.student.id, classId: classId as string },
        relations: ['classEntity']
      });

      if (!studentRecord) {
        return res.status(404).json({ message: 'Student not found in this class' });
      }
      
      // Verify classId matches
      if (studentRecord.classId !== classId && studentRecord.classEntity?.id !== classId) {
        return res.status(403).json({ message: 'You can only access report cards for your own class' });
      }
    }
    
    if (isParent && studentId) {
      // Parent access - first verify their linked student exists in this class
      parentStudentRecord = await studentRepository.findOne({
        where: { id: studentId as string, classId: classId as string },
        relations: ['classEntity']
      });

      if (!parentStudentRecord) {
        return res.status(404).json({ message: 'Student not found in this class' });
      }
    }

    // Always fetch full class roster for accurate rankings/positions
    // For students, we still need all students for ranking calculations, but we'll filter the results later
    if (isStudent && studentRecord) {
      // For students, we still need all students for class rankings, but we'll only return their own report card
      students = await studentRepository.find({
        where: { classId: classId as string },
        relations: ['classEntity'],
        order: { firstName: 'ASC', lastName: 'ASC' } // Sort alphabetically for sequential display
      });
    } else {
      // For other roles, fetch all students normally
      students = await studentRepository.find({
        where: { classId: classId as string },
        relations: ['classEntity'],
        order: { firstName: 'ASC', lastName: 'ASC' } // Sort alphabetically for sequential display
      });
    }

    // Ensure parent's student is included even if not returned above (e.g., data inconsistencies)
    if (isParent && parentStudentRecord && !students.find(s => s.id === parentStudentRecord!.id)) {
      students.push(parentStudentRecord);
    }
    console.log('Found students with direct query:', students.length);

    // If no students found, try alternative method (similar to getStudents)
    if (students.length === 0) {
      console.log('No students found with direct query, trying alternative method...');
      
      if (classEntity) {
        students = await studentRepository
          .createQueryBuilder('student')
          .leftJoinAndSelect('student.classEntity', 'classEntity')
          .where('(student.classId = :classId OR classEntity.id = :classId OR classEntity.name = :className)', {
            classId: classId as string,
            className: classEntity.name
          })
          .orderBy('student.firstName', 'ASC')
          .addOrderBy('student.lastName', 'ASC')
          .getMany();
        console.log('Found students with query builder:', students.length);
      }
    }

    if (students.length === 0) {
      return res.status(404).json({ message: 'No students found in this class' });
    }
    
    console.log('Processing', students.length, 'students');

    // Normalize examType to match enum values
    let normalizedExamType: ExamType;
    try {
      normalizedExamType = normalizeExamType(examType as string);
      console.log('[getReportCard] Looking for exams with classId:', classId, 'term:', termValue, 'examType (original):', examType, 'examType (normalized):', normalizedExamType);
    } catch (error: any) {
      console.error('[getReportCard] Error normalizing examType:', error.message);
      return res.status(400).json({ 
        message: error.message || 'Invalid exam type',
        requestedType: examType
      });
    }
    
    let exams = await examRepository.find({
      where: { classId: classId as string, type: normalizedExamType, term: termValue },
      relations: ['subjects']
    });
    
    // Filter by exam status: non-admin users can only see published exams
    if (!isAdmin) {
      exams = exams.filter(exam => exam.status === ExamStatus.PUBLISHED);
    }
    
    console.log('Found exams:', exams.length, exams.map(e => ({ id: e.id, name: e.name, type: e.type, classId: e.classId, status: e.status })));

    // Get all subjects for this class (to ensure all subjects appear on report card)
    const classWithSubjects = await classRepository.findOne({
      where: { id: classId as string },
      relations: ['subjects']
    });
    let allClassSubjects = classWithSubjects?.subjects || [];
    console.log('All subjects for class:', allClassSubjects.length, allClassSubjects.map(s => s.name));
    
    // If subjectId is provided, filter to that subject only
    if (subjectId) {
      const selectedSubject = allClassSubjects.find(s => s.id === subjectId);
      if (!selectedSubject) {
        // Try to get from exams if not in class subjects
        if (exams.length > 0) {
          const examSubjectsSet = new Set<string>();
          const examSubjectsMap = new Map<string, Subject>();
          
          exams.forEach(exam => {
            if (exam.subjects && exam.subjects.length > 0) {
              exam.subjects.forEach((subject: Subject) => {
                if (subject.id === subjectId) {
                  examSubjectsSet.add(subject.id);
                  examSubjectsMap.set(subject.id, subject);
                }
              });
            }
          });
          
          const subjectIdStr = String(subjectId);
          if (examSubjectsMap.has(subjectIdStr)) {
            allClassSubjects = [examSubjectsMap.get(subjectIdStr)!];
          } else {
            return res.status(404).json({ message: 'Subject not found in this class' });
          }
        } else {
          return res.status(404).json({ message: 'Subject not found in this class' });
        }
      } else {
        allClassSubjects = [selectedSubject];
      }
      console.log('Filtered to selected subject:', allClassSubjects.map(s => s.name));
    } else if (allClassSubjects.length === 0 && exams.length > 0) {
      // If no subjects are assigned to the class, get subjects from the exams instead
      console.log('No subjects assigned to class, getting subjects from exams...');
      const examSubjectsSet = new Set<string>();
      const examSubjectsMap = new Map<string, Subject>();
      
      exams.forEach(exam => {
        if (exam.subjects && exam.subjects.length > 0) {
          exam.subjects.forEach((subject: Subject) => {
            if (!examSubjectsSet.has(subject.id)) {
              examSubjectsSet.add(subject.id);
              examSubjectsMap.set(subject.id, subject);
            }
          });
        }
      });
      
      allClassSubjects = Array.from(examSubjectsMap.values());
      console.log('Found subjects from exams:', allClassSubjects.length, allClassSubjects.map(s => s.name));
    }

    if (exams.length === 0) {
      // Check if there are any exams for this class at all
      const allClassExams = await examRepository.find({
        where: { classId: classId as string, term: termValue },
        relations: ['subjects']
      });
      console.log('[getReportCard] Total exams for this class and term:', allClassExams.length);
      console.log('[getReportCard] Available exam types:', allClassExams.map(e => ({ name: e.name, type: e.type, status: e.status })));
      console.log('[getReportCard] Requested examType (original):', examType, 'normalized:', normalizedExamType);
      console.log('[getReportCard] Filtered exams (after status filter):', exams.length);
      
      // Provide more helpful error message
      const availableTypes = [...new Set(allClassExams.map(e => e.type))];
      
      // Convert enum values to user-friendly names
      const typeNameMap: { [key: string]: string } = {
        'mid_term': 'Mid-Term',
        'end_term': 'End-Term',
        'assignment': 'Assignment',
        'quiz': 'Quiz'
      };
      const availableTypeNames = availableTypes.map(t => typeNameMap[t] || t);
      
      const message = availableTypeNames.length > 0
        ? `No ${examType} exams found for ${termValue}. Available exam types: ${availableTypeNames.join(', ')}`
        : `No exams found for ${termValue} in this class.`;
      
      return res.status(404).json({ 
        message,
        requestedType: examType,
        normalizedType: normalizedExamType,
        availableTypes: availableTypeNames, // Return user-friendly names
        term: termValue
      });
    }

    // Get settings for grade thresholds
      const settingsList = await settingsRepository.find({
        order: { createdAt: 'DESC' },
        take: 1
      });
      const settings = settingsList.length > 0 ? settingsList[0] : null;

    const thresholds = settings?.gradeThresholds || {
      excellent: 90,
      veryGood: 80,
      good: 60,
      satisfactory: 40,
      needsImprovement: 20,
      basic: 1
    };

    const gradeLabels = settings?.gradeLabels || {
      excellent: 'OUTSTANDING',
      veryGood: 'VERY HIGH',
      good: 'HIGH',
      satisfactory: 'GOOD',
      needsImprovement: 'ASPIRING',
      basic: 'BASIC',
      fail: 'UNCLASSIFIED'
    };

    function getGrade(percentage: number): string {
      if (percentage === 0) return gradeLabels.fail || 'UNCLASSIFIED';
      if (percentage >= (thresholds.excellent || 90)) return gradeLabels.excellent || 'OUTSTANDING';
      if (percentage >= (thresholds.veryGood || 80)) return gradeLabels.veryGood || 'VERY HIGH';
      if (percentage >= (thresholds.good || 60)) return gradeLabels.good || 'HIGH';
      if (percentage >= (thresholds.satisfactory || 40)) return gradeLabels.satisfactory || 'GOOD';
      if (percentage >= (thresholds.needsImprovement || 20)) return gradeLabels.needsImprovement || 'ASPIRING';
      if (percentage >= (thresholds.basic || 1)) return gradeLabels.basic || 'BASIC';
      return gradeLabels.fail || 'UNCLASSIFIED';
    }

    // Get all marks for all students and exams, filtered by subject if provided
    const examIds = exams.map(e => e.id);
    console.log('Looking for marks with examIds:', examIds, 'subjectId:', subjectId);
    
    if (examIds.length === 0) {
      return res.status(404).json({ message: 'No exam IDs found' });
    }
    
    const marksWhere: any = { examId: In(examIds) };
    if (subjectId) {
      marksWhere.subjectId = subjectId as string;
    }
    
    const allMarks = await marksRepository.find({
      where: marksWhere,
      relations: ['subject', 'exam', 'student']
    });
    console.log('Found marks:', allMarks.length, subjectId ? `(filtered by subject ${subjectId})` : '(all subjects)');

    // VALIDATION: Check if all subjects have exams and all students have marks
    // Only validate if not filtering by a single subject (for teachers)
    if (!subjectId && allClassSubjects.length > 0) {
      console.log('[Validation] Checking if all subjects have complete marks...');
      
      const validationErrors: string[] = [];
      const subjectsWithoutExams: string[] = [];
      const subjectsWithMissingMarks: { subject: string; missingStudents: string[] }[] = [];
      
      // Get all exam subject IDs
      const examSubjectIds = new Set<string>();
      exams.forEach(exam => {
        if (exam.subjects && exam.subjects.length > 0) {
          exam.subjects.forEach((subject: Subject) => {
            examSubjectIds.add(subject.id);
          });
        }
      });
      
      // Check each subject assigned to the class
      for (const classSubject of allClassSubjects) {
        // Check if subject has an exam created
        if (!examSubjectIds.has(classSubject.id)) {
          subjectsWithoutExams.push(classSubject.name);
          continue;
        }
        
        // Check if all students have marks for this subject
        const subjectMarks = allMarks.filter(m => m.subjectId === classSubject.id);
        const studentsWithMarks = new Set(subjectMarks.map(m => m.studentId));
        const missingStudents: string[] = [];
        
        for (const student of students) {
          if (!studentsWithMarks.has(student.id)) {
            missingStudents.push(`${student.firstName} ${student.lastName} (${student.studentNumber})`);
          }
        }
        
        if (missingStudents.length > 0) {
          subjectsWithMissingMarks.push({
            subject: classSubject.name,
            missingStudents: missingStudents
          });
        }
      }
      
      // Build error message if validation fails
      if (subjectsWithoutExams.length > 0 || subjectsWithMissingMarks.length > 0) {
        let errorMessage = 'Cannot generate report cards. ';
        const errorDetails: string[] = [];
        
        if (subjectsWithoutExams.length > 0) {
          errorDetails.push(`The following subjects do not have exams created: ${subjectsWithoutExams.join(', ')}`);
        }
        
        if (subjectsWithMissingMarks.length > 0) {
          const missingDetails = subjectsWithMissingMarks.map(item => {
            return `${item.subject} - Missing marks for: ${item.missingStudents.slice(0, 3).join(', ')}${item.missingStudents.length > 3 ? ` and ${item.missingStudents.length - 3} more` : ''}`;
          });
          errorDetails.push(`The following subjects have missing marks: ${missingDetails.join('; ')}`);
        }
        
        errorMessage += errorDetails.join('. ');
        errorMessage += '. Please ensure all subjects have exams created and all students have marks entered before generating report cards.';
        
        console.log('[Validation] Validation failed:', errorMessage);
        return res.status(400).json({
          message: errorMessage,
          subjectsWithoutExams,
          subjectsWithMissingMarks,
          totalSubjects: allClassSubjects.length,
          subjectsWithExams: allClassSubjects.length - subjectsWithoutExams.length,
          subjectsComplete: allClassSubjects.length - subjectsWithoutExams.length - subjectsWithMissingMarks.length
        });
      }
      
      console.log('[Validation] All subjects have exams and all students have marks. Proceeding with report card generation.');
    }

    // Calculate class averages for each subject
    // Class Average = Total marks scored by all students in a subject / number of students who wrote the exam
    const classAverages: { [key: string]: number } = {};
    
    // Group marks by subject
    const marksBySubject: { [key: string]: any[] } = {};
    allMarks.forEach(mark => {
      if (!mark.subject || !mark.score || mark.maxScore === 0) {
        return;
      }
      const subjectName = mark.subject.name;
      if (!marksBySubject[subjectName]) {
        marksBySubject[subjectName] = [];
      }
      marksBySubject[subjectName].push(mark);
    });

    // Calculate class average for each subject (as percentage)
    Object.keys(marksBySubject).forEach(subjectName => {
      const subjectMarks = marksBySubject[subjectName];
      
      // Group marks by student to calculate each student's percentage
      const studentMarksMap: { [key: string]: { scores: number[]; maxScores: number[] } } = {};
      
      subjectMarks.forEach(mark => {
        if (mark.studentId && mark.score && mark.maxScore) {
          if (!studentMarksMap[mark.studentId]) {
            studentMarksMap[mark.studentId] = { scores: [], maxScores: [] };
          }
          studentMarksMap[mark.studentId].scores.push(parseFloat(String(mark.score || 0)));
          studentMarksMap[mark.studentId].maxScores.push(parseFloat(String(mark.maxScore || 0)));
        }
      });
      
      // Calculate percentage for each student, then average those percentages
      const studentPercentages: number[] = [];
      Object.keys(studentMarksMap).forEach(studentId => {
        const studentData = studentMarksMap[studentId];
        const totalScore = studentData.scores.reduce((a, b) => a + b, 0);
        const totalMaxScore = studentData.maxScores.reduce((a, b) => a + b, 0);
        if (totalMaxScore > 0) {
          const percentage = (totalScore / totalMaxScore) * 100;
          studentPercentages.push(percentage);
        }
      });
      
      // Calculate class average as average of all student percentages
      if (studentPercentages.length > 0) {
        const sumPercentages = studentPercentages.reduce((sum, p) => sum + p, 0);
        classAverages[subjectName] = Math.round(sumPercentages / studentPercentages.length);
      } else {
        classAverages[subjectName] = 0;
      }
    });

    // Group marks by student and calculate report cards
    const reportCards: any[] = [];
    
    // Get student IDs for the current class only
    const classStudentIds = new Set(students.map(s => s.id));
    
    // Filter marks to only include students from the current class for class ranking
    const classMarks = allMarks.filter(mark => classStudentIds.has(mark.studentId));
    
    // Calculate class rankings (only for students in the current class)
    const classStudentAverages: { [key: string]: { total: number; count: number } } = {};
    classMarks.forEach(mark => {
      // Skip marks with missing data
      if (!mark.studentId || !mark.score || !mark.maxScore || mark.maxScore === 0) {
        return;
      }
      
      const sid = mark.studentId;
      if (!classStudentAverages[sid]) {
        classStudentAverages[sid] = { total: 0, count: 0 };
      }
      const percentage = (mark.score / mark.maxScore) * 100;
      classStudentAverages[sid].total += percentage;
      classStudentAverages[sid].count += 1;
    });

    const classRankingsUnsorted = Object.entries(classStudentAverages)
      .map(([sid, avg]) => ({
        studentId: sid,
        average: avg.count > 0 ? avg.total / avg.count : 0
      }))
      .sort((a, b) => b.average - a.average);
    
    // Assign positions with proper tie handling
    const classRankings: Array<{ studentId: string; average: number; position: number }> = assignPositionsWithTies(classRankingsUnsorted).map(r => ({
      studentId: r.studentId,
      average: r.average,
      position: r.position
    }));

    // Calculate grade rankings for all students in the same grade/form (stream) across ALL classes
    // e.g., all Grade 7A, Grade 7B, Grade 7C students together
    // Get unique forms from current students
    const forms = Array.from(new Set(students.map(s => s.classEntity?.form).filter(Boolean) as string[]));
    
    // Initialize form rankings map
    const formRankingsMap = new Map<string, Array<{ studentId: string; average: number; position: number }>>();
    
    if (forms.length > 0) {
      // Get all classes with the same forms
      const allClassesWithSameForms = await classRepository.find({
        where: { form: In(forms) }
      });
      const allClassIdsWithSameForms = allClassesWithSameForms.map(c => c.id);
      
      // Get all students from classes with the same forms
      const allFormStudentsList = await studentRepository.find({
        where: { classId: In(allClassIdsWithSameForms) },
        relations: ['classEntity']
      });
      
      // Get all exams of the specified type and term from ALL classes with the same form
      // This is critical - we need exams from all classes, not just the current class
      const allFormExams = await examRepository.find({
        where: { 
          classId: In(allClassIdsWithSameForms),
          type: normalizedExamType, // Use normalized exam type, not the original
          term: termValue,
        },
        relations: ['subjects']
      });
      const allFormExamIds = allFormExams.map(e => e.id);
      console.log('Found exams for form ranking:', allFormExamIds.length, 'across', allClassIdsWithSameForms.length, 'classes');
      
      // Get all marks for form ranking (across all classes with same form, using all form exams)
      const formStudentIds = allFormStudentsList.map(s => s.id);
      const formMarks = formStudentIds.length > 0 && allFormExamIds.length > 0 ? await marksRepository.find({
        where: { 
          examId: In(allFormExamIds),
          studentId: In(formStudentIds),
        },
        relations: ['subject', 'exam', 'student']
      }) : [];
      
      // Calculate form rankings (across all classes with same form)
      forms.forEach(form => {
        const formStudents = allFormStudentsList.filter(s => s.classEntity?.form === form);
        const formStudentIdsSet = new Set(formStudents.map(s => s.id));
        const formStudentMarks = formMarks.filter(m => formStudentIdsSet.has(m.studentId));
        
        const formStudentAverages: { [key: string]: { total: number; count: number } } = {};
        formStudentMarks.forEach(mark => {
          if (!mark.studentId || !mark.score || !mark.maxScore || mark.maxScore === 0) {
            return;
          }
          const sid = mark.studentId;
          if (!formStudentAverages[sid]) {
            formStudentAverages[sid] = { total: 0, count: 0 };
          }
          const percentage = (mark.score / mark.maxScore) * 100;
          formStudentAverages[sid].total += percentage;
          formStudentAverages[sid].count += 1;
        });
        
        const formRanksUnsorted = Object.entries(formStudentAverages)
          .map(([sid, avg]) => ({
            studentId: sid,
            average: avg.count > 0 ? avg.total / avg.count : 0
          }))
          .sort((a, b) => b.average - a.average);
        
        // Assign positions with proper tie handling
        const formRanks = assignPositionsWithTies(formRanksUnsorted).map(r => ({
          studentId: r.studentId,
          average: r.average,
          position: r.position
        }));
        
        formRankingsMap.set(form, formRanks);
      });
    }

    // Second pass: generate report cards for each student
    for (const student of students) {
      // Filter for parent access
      if (isParent && studentId && student.id !== studentId) {
        continue;
      }
      
      // Filter for student access - students can only see their own report card
      if (isStudent) {
        const loggedInStudentId = user?.student?.id;
        if (!loggedInStudentId || student.id !== loggedInStudentId) {
          continue;
        }
      }
      // Get all marks for this student across all exams of this type
      const studentMarks = allMarks.filter(m => m.studentId === student.id);
      console.log(`[getReportCard] Student ${student.studentNumber} (${student.id}): Found ${studentMarks.length} marks across ${exams.length} exams`);

      // Group marks by subject (across all exams)
      const subjectMarksMap: { [key: string]: { scores: number[]; maxScores: number[]; comments: string[] } } = {};

      studentMarks.forEach(mark => {
        // Skip marks with missing relations
        if (!mark.subject || !mark.score || !mark.maxScore) {
          console.warn('Skipping mark with missing data:', { markId: mark.id, hasSubject: !!mark.subject, hasScore: !!mark.score, hasMaxScore: !!mark.maxScore });
          return;
        }
        
        const subjectName = mark.subject.name;
        if (!subjectMarksMap[subjectName]) {
          subjectMarksMap[subjectName] = { scores: [], maxScores: [], comments: [] };
        }
        // Round scores to integers
        subjectMarksMap[subjectName].scores.push(Math.round(parseFloat(String(mark.score)) || 0));
        subjectMarksMap[subjectName].maxScores.push(Math.round(parseFloat(String(mark.maxScore)) || 100));
        if (mark.comments) {
          subjectMarksMap[subjectName].comments.push(mark.comments);
        }
      });

      // Create a map of all class subjects
      const allSubjectsMap = new Map(allClassSubjects.map(s => [s.name, s]));

      // Calculate subject data - include ALL subjects from the class
      const subjectData = allClassSubjects.map(classSubject => {
        const subjectName = classSubject.name;
        const subjectCode = classSubject.code || '';
        const marksData = subjectMarksMap[subjectName];
        const classAverage = classAverages[subjectName] || 0;
        
        if (marksData && marksData.scores.length > 0) {
          // Student has marks for this subject
          const totalScore = marksData.scores.reduce((a, b) => a + b, 0);
          const totalMaxScore = marksData.maxScores.reduce((a, b) => a + b, 0);
          const percentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
          return {
            subject: subjectName,
            subjectCode: subjectCode,
            score: Math.round(totalScore),
            maxScore: Math.round(totalMaxScore),
            percentage: Math.round(percentage).toString(),
            classAverage: classAverage,
            comments: marksData.comments.join('; ') || undefined,
            grade: getGrade(percentage)
          };
        } else {
          // Student has no marks for this subject - show as N/A
          return {
            subject: subjectName,
            subjectCode: subjectCode,
            score: 0,
            maxScore: 0,
            percentage: '0',
            classAverage: classAverage,
            comments: 'Not taken',
            grade: 'N/A'
          };
        }
      });

      // Calculate overall average (only for subjects with marks, not N/A)
      const subjectsWithMarks = subjectData.filter((sub: any) => sub.grade !== 'N/A');
      const totalPercentage = subjectsWithMarks.reduce((sum: number, sub: any) => sum + parseFloat(sub.percentage), 0);
      const overallAverage = subjectsWithMarks.length > 0 ? Math.round(totalPercentage / subjectsWithMarks.length) : 0;

      // Find class position (only within the current class) - using position from tie-handled rankings
      const classRankEntry = classRankings.find(r => r.studentId === student.id);
      const classPosition = classRankEntry?.position || 0;
      
      // Find grade position (across all classes with the same grade/form, e.g., Grade 7A, 7B, 7C)
      let formPosition = 0;
      let totalStudentsPerStream = 0;
      if (student.classEntity?.form) {
        const formRanks = formRankingsMap.get(student.classEntity.form);
        if (formRanks && formRanks.length > 0) {
          const formRankEntry = formRanks.find(r => r.studentId === student.id);
          if (formRankEntry) {
            formPosition = formRankEntry.position; // Position with tie handling
          }
          totalStudentsPerStream = formRanks.length; // Total students with marks in the grade/stream
        }
      }
      
      // Get remarks for this student's report card
      // Try both normalized and original exam type formats (in case remarks were saved with original format)
      const remarksRepository = AppDataSource.getRepository(ReportCardRemarks);
      let remarks = await remarksRepository.findOne({
        where: {
          studentId: student.id,
          classId: classId as string,
          examType: normalizedExamType, // Try normalized exam type first
        }
      });
      
      // If not found with normalized type, try original format (for backward compatibility)
      if (!remarks && examType !== normalizedExamType) {
        console.log('[getReportCard] Remarks not found with normalized type, trying original format...');
        remarks = await remarksRepository.findOne({
          where: {
            studentId: student.id,
            classId: classId as string,
            examType: examType as string, // Try original format
          }
        });
      }
      
      console.log('[getReportCard] Remarks query:', {
        studentId: student.id,
        classId: classId as string,
        examType: normalizedExamType,
        originalExamType: examType,
        found: !!remarks
      });
      
      if (remarks) {
        console.log('[getReportCard] Remarks found:', {
          id: remarks.id,
          examType: remarks.examType,
          hasClassTeacherRemarks: !!remarks.classTeacherRemarks,
          hasHeadmasterRemarks: !!remarks.headmasterRemarks,
          classTeacherRemarks: remarks.classTeacherRemarks?.substring(0, 50) + '...',
          headmasterRemarks: remarks.headmasterRemarks?.substring(0, 50) + '...'
        });
      } else {
        console.log('[getReportCard] No remarks found for this student/exam type combination');
      }

      // Get total attendance for this student for the term
      const attendanceRepository = AppDataSource.getRepository(Attendance);
      const attendanceRecords = await attendanceRepository.find({
        where: {
          studentId: student.id,
          term: termValue,
        }
      });
      const totalAttendance = attendanceRecords.length;
      const presentAttendance = attendanceRecords.filter(a => 
        a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.EXCUSED
      ).length;

      reportCards.push({
        student: {
          id: student.id,
          name: `${student.firstName} ${student.lastName}`,
          studentNumber: student.studentNumber,
          class: student.classEntity?.name
        },
        class: student.classEntity?.name || classEntity.name, // Add class at report card level for easy access
        examType: examType,
        exams: (() => {
          // Remove duplicate exams by name to avoid showing the same exam multiple times
          const uniqueExams = new Map<string, { id: string; name: string; examDate: Date }>();
          exams.forEach(e => {
            if (!uniqueExams.has(e.name)) {
              uniqueExams.set(e.name, { id: e.id, name: e.name, examDate: e.examDate });
            }
          });
          return Array.from(uniqueExams.values());
        })(),
        subjects: subjectData,
        overallAverage: overallAverage.toString(),
        overallGrade: getGrade(overallAverage),
        classPosition: classPosition || 0,
        formPosition: formPosition || 0,
        totalStudents: classRankings.length, // Add total number of students with marks for ranking
        totalStudentsPerStream: totalStudentsPerStream || 0, // Add total number of students per stream
        totalAttendance: totalAttendance, // Total attendance days for the term
        presentAttendance: presentAttendance, // Present/excused attendance days
        remarks: {
          id: remarks?.id || null,
          classTeacherRemarks: remarks?.classTeacherRemarks || null,
          headmasterRemarks: remarks?.headmasterRemarks || null
        },
        generatedAt: new Date(),
        settings: {
          schoolName: settings?.schoolName,
          schoolAddress: settings?.schoolAddress,
          schoolPhone: settings?.schoolPhone,
          academicYear: settings?.academicYear
        }
      });
    }

    // Note: We now include all students, even if they have no marks (subjects will show as N/A)
    // Only skip if there are no students at all
    if (reportCards.length === 0) {
      return res.status(404).json({ message: 'No report cards generated. No students found in this class.' });
    }

    // Filter report cards if studentId is provided (for single student view)
    let filteredReportCards = reportCards;
    if (studentId && !isAdmin) {
      filteredReportCards = reportCards.filter(rc => rc.student.id === studentId);
      if (filteredReportCards.length === 0) {
        return res.status(404).json({ message: 'No report card found for the specified student.' });
      }
    }

    res.json({ reportCards: filteredReportCards, class: classEntity.name, examType, term: termValue });
  } catch (error: any) {
    console.error('Error generating report cards:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const generateReportCardPDF = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { studentId, examId, classId, examType, term } = req.query;
    const user = req.user;
    const isParent = user?.role === 'parent';
    const isStudent = user?.role === 'student';
    const termValue = term ? String(term).trim() : null;
    
    console.log('[generateReportCardPDF] PDF generation request:', { studentId, examId, classId, examType, term: termValue, isParent, isStudent, query: req.query });

    if (!examId && (!classId || !examType || !termValue)) {
      return res.status(400).json({ message: 'Class ID, term, and exam type are required when exam ID is not provided' });
    }

    // For students, verify they can only access their own report card PDF
    if (isStudent) {
      console.log('[generateReportCardPDF] Student access detected');
      
      // Load student data if not available in user object
      let loggedInStudent = user?.student;
      if (!loggedInStudent && user?.id) {
        console.log('[generateReportCardPDF] Student data not in user object, querying...');
        const studentRepository = AppDataSource.getRepository(Student);
        loggedInStudent = await studentRepository.findOne({
          where: { userId: user.id },
          relations: ['classEntity']
        });
        
        if (!loggedInStudent) {
          console.log('[generateReportCardPDF] Student not found for user:', user.id);
          return res.status(403).json({ message: 'Student information not found. Please log in again.' });
        }
        
        // Attach to user object for later use
        if (user) {
          user.student = loggedInStudent;
        }
      }
      
      if (!loggedInStudent?.id) {
        console.log('[generateReportCardPDF] Student user missing student data');
        return res.status(403).json({ message: 'Student information not found. Please log in again.' });
      }
      
      // Verify the studentId in the request matches the logged-in student's ID
      if (studentId && studentId !== loggedInStudent.id) {
        console.log('[generateReportCardPDF] Student trying to access another student\'s report card PDF');
        return res.status(403).json({ message: 'You can only access your own report card' });
      }
      
      // Ensure studentId is set to the logged-in student's ID
      if (!studentId) {
        console.log('[generateReportCardPDF] Student request missing studentId, using logged-in student ID');
        // We'll use loggedInStudent.id later, but we need to ensure it's in the query
        const studentIdToUse = loggedInStudent.id;
        // Verify classId matches student's class
        if (classId && classId !== loggedInStudent.classId && classId !== loggedInStudent.classEntity?.id) {
          console.log('[generateReportCardPDF] Student class mismatch');
          return res.status(403).json({ message: 'You can only access report cards for your own class' });
        }
      } else {
        // Verify the requested studentId matches the logged-in student
        if (studentId !== loggedInStudent.id) {
          return res.status(403).json({ message: 'You can only access your own report card' });
        }
      }
    }

    // For parents, check balance before allowing PDF generation
    if (isParent && studentId) {
      const parentRepository = AppDataSource.getRepository(Parent);
      const invoiceRepository = AppDataSource.getRepository(Invoice);
      const settingsRepository = AppDataSource.getRepository(Settings);
      const studentRepository = AppDataSource.getRepository(Student);

      // Get parent
      const parent = await parentRepository.findOne({
        where: { userId: user.id }
      });

      if (!parent) {
        return res.status(404).json({ message: 'Parent profile not found' });
      }

      // Verify student is linked to this parent
      const student = await studentRepository.findOne({
        where: { id: studentId as string, parentId: parent.id }
      });

      if (!student) {
        return res.status(403).json({ message: 'Student not found or not linked to your account' });
      }

      // Get settings for next term fees
      const settingsList = await settingsRepository.find({
        order: { createdAt: 'DESC' },
        take: 1
      });
      const settings = settingsList.length > 0 ? settingsList[0] : null;

      // Get latest invoice for balance calculation
      const latestInvoice = await invoiceRepository.findOne({
        where: { studentId: student.id },
        order: { createdAt: 'DESC' }
      });

      // Calculate term balance for access check
      let termBalance = 0;
      if (latestInvoice) {
        termBalance = parseFloat(String(latestInvoice.balance || 0));
      }

      // Check if term balance allows access (term balance must be zero)
      if (termBalance > 0) {
        const currencySymbol = settings?.currencySymbol || 'KES';
        return res.status(403).json({ 
          message: `Report card access is restricted. Please clear the outstanding term balance of ${currencySymbol} ${termBalance.toFixed(2)} to view the report card.`,
          balance: termBalance
        });
      }
    }
    
    const marksRepository = AppDataSource.getRepository(Marks);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const examRepository = AppDataSource.getRepository(Exam);
    const classRepository = AppDataSource.getRepository(Class);

    // Support both old format (studentId + examId) and new format (classId + examType + studentId)
    let reportCardData: any;

    if (classId && examType && studentId) {
      if (!termValue) {
        return res.status(400).json({ message: 'Term is required to generate report card PDF when using class and exam type' });
      }
      console.log('Using new format: classId + examType + studentId');
      // New format: generate from aggregated report card data
      const student = await studentRepository.findOne({
        where: { id: studentId as string },
        relations: ['classEntity']
      });

      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }

      // Normalize examType to match enum values
      let normalizedExamType: ExamType;
      try {
        normalizedExamType = normalizeExamType(examType as string);
        console.log('[generateReportCardPDF] Normalized examType:', examType, '->', normalizedExamType);
      } catch (error: any) {
        console.error('[generateReportCardPDF] Error normalizing examType:', error.message);
        return res.status(400).json({ 
          message: error.message || 'Invalid exam type',
          requestedType: examType
        });
      }
      
      // Get all exams of the specified type for this class
      const exams = await examRepository.find({
        where: { classId: classId as string, type: normalizedExamType, term: termValue as string },
        relations: ['subjects']
      });

      if (exams.length === 0) {
        return res.status(404).json({ message: `No ${examType} exams found for this class` });
      }

      // Get all subjects for this class (to ensure all subjects appear on report card)
      const classWithSubjects = await classRepository.findOne({
        where: { id: classId as string },
        relations: ['subjects']
      });
      let allClassSubjects = classWithSubjects?.subjects || [];
      
      // If no subjects are assigned to the class, get subjects from the exams instead
      if (allClassSubjects.length === 0 && exams.length > 0) {
        console.log('No subjects assigned to class, getting subjects from exams...');
        const examSubjectsSet = new Set<string>();
        const examSubjectsMap = new Map<string, Subject>();
        
        exams.forEach(exam => {
          if (exam.subjects && exam.subjects.length > 0) {
            exam.subjects.forEach((subject: Subject) => {
              if (!examSubjectsSet.has(subject.id)) {
                examSubjectsSet.add(subject.id);
                examSubjectsMap.set(subject.id, subject);
              }
            });
          }
        });
        
        allClassSubjects = Array.from(examSubjectsMap.values());
        console.log('Found subjects from exams:', allClassSubjects.length, allClassSubjects.map(s => s.name));
      }

      // Get all marks for this student across all exams of this type
      const examIds = exams.map(e => e.id);
      const allMarks = await marksRepository.find({
        where: { examId: In(examIds), studentId: studentId as string },
        relations: ['subject', 'exam', 'student']
      });
      
      // Get all marks for all students in the class to calculate class averages
      const allClassMarksForAverage = await marksRepository.find({
        where: { examId: In(examIds) },
        relations: ['subject', 'exam', 'student']
      });
      
      // Calculate class averages for each subject
      const classAverages: { [key: string]: number } = {};
      const marksBySubject: { [key: string]: any[] } = {};
      
      allClassMarksForAverage.forEach(mark => {
        if (!mark.subject || !mark.score || mark.maxScore === 0) {
          return;
        }
        const subjectName = mark.subject.name;
        if (!marksBySubject[subjectName]) {
          marksBySubject[subjectName] = [];
        }
        marksBySubject[subjectName].push(mark);
      });

      // Calculate class average for each subject (as percentage)
      Object.keys(marksBySubject).forEach(subjectName => {
        const subjectMarks = marksBySubject[subjectName];
        
        // Group marks by student to calculate each student's percentage
        const studentMarksMap: { [key: string]: { scores: number[]; maxScores: number[] } } = {};
        
        subjectMarks.forEach(mark => {
          if (mark.studentId && mark.score && mark.maxScore) {
            if (!studentMarksMap[mark.studentId]) {
              studentMarksMap[mark.studentId] = { scores: [], maxScores: [] };
            }
            studentMarksMap[mark.studentId].scores.push(parseFloat(String(mark.score || 0)));
            studentMarksMap[mark.studentId].maxScores.push(parseFloat(String(mark.maxScore || 0)));
          }
        });
        
        // Calculate percentage for each student, then average those percentages
        const studentPercentages: number[] = [];
        Object.keys(studentMarksMap).forEach(studentId => {
          const studentData = studentMarksMap[studentId];
          const totalScore = studentData.scores.reduce((a, b) => a + b, 0);
          const totalMaxScore = studentData.maxScores.reduce((a, b) => a + b, 0);
          if (totalMaxScore > 0) {
            const percentage = (totalScore / totalMaxScore) * 100;
            studentPercentages.push(percentage);
          }
        });
        
        // Calculate class average as average of all student percentages
        if (studentPercentages.length > 0) {
          const sumPercentages = studentPercentages.reduce((sum, p) => sum + p, 0);
          classAverages[subjectName] = Math.round(sumPercentages / studentPercentages.length);
        } else {
          classAverages[subjectName] = 0;
        }
      });
      
      // Note: We now include all subjects from the class, even if student has no marks

      // Get settings
      const settingsList = await settingsRepository.find({
        order: { createdAt: 'DESC' },
        take: 1
      });
      const settings = settingsList.length > 0 ? settingsList[0] : null;

      const thresholds = settings?.gradeThresholds || {
        excellent: 90,
        veryGood: 80,
        good: 70,
        satisfactory: 60,
        needsImprovement: 50
      };

      const gradeLabels = settings?.gradeLabels || {
        excellent: 'Excellent',
        veryGood: 'Very Good',
        good: 'Good',
        satisfactory: 'Satisfactory',
        needsImprovement: 'Needs Improvement',
        fail: 'Fail'
      };

      function getGrade(percentage: number): string {
        if (percentage >= (thresholds.excellent || 90)) return gradeLabels.excellent || 'Excellent';
        if (percentage >= (thresholds.veryGood || 80)) return gradeLabels.veryGood || 'Very Good';
        if (percentage >= (thresholds.good || 70)) return gradeLabels.good || 'Good';
        if (percentage >= (thresholds.satisfactory || 60)) return gradeLabels.satisfactory || 'Satisfactory';
        if (percentage >= (thresholds.needsImprovement || 50)) return gradeLabels.needsImprovement || 'Needs Improvement';
        return gradeLabels.fail || 'Fail';
      }

      // Group marks by subject
      const subjectMarksMap: { [key: string]: { scores: number[]; maxScores: number[]; comments: string[] } } = {};

      allMarks.forEach(mark => {
        if (!mark.subject || !mark.score || !mark.maxScore) {
          return;
        }
        const subjectName = mark.subject.name;
        if (!subjectMarksMap[subjectName]) {
          subjectMarksMap[subjectName] = { scores: [], maxScores: [], comments: [] };
        }
        // Round scores to integers
        subjectMarksMap[subjectName].scores.push(Math.round(parseFloat(String(mark.score)) || 0));
        subjectMarksMap[subjectName].maxScores.push(Math.round(parseFloat(String(mark.maxScore)) || 100));
        if (mark.comments) {
          subjectMarksMap[subjectName].comments.push(mark.comments);
        }
      });

      // Calculate subject data - include ALL subjects from the class
      const subjectData = allClassSubjects.map(classSubject => {
        const subjectName = classSubject.name;
        const subjectCode = classSubject.code || '';
        const marksData = subjectMarksMap[subjectName];
        const classAverage = classAverages[subjectName] || 0;
        
        if (marksData && marksData.scores.length > 0) {
          // Student has marks for this subject
          const totalScore = marksData.scores.reduce((a, b) => a + b, 0);
          const totalMaxScore = marksData.maxScores.reduce((a, b) => a + b, 0);
          const percentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
          return {
            subject: subjectName,
            subjectCode: subjectCode,
            score: Math.round(totalScore),
            maxScore: Math.round(totalMaxScore),
            percentage: Math.round(percentage).toString(),
            classAverage: classAverage,
            comments: marksData.comments.join('; ') || undefined,
            grade: getGrade(percentage)
          };
        } else {
          // Student has no marks for this subject - show as N/A
          return {
            subject: subjectName,
            subjectCode: subjectCode,
            score: 0,
            maxScore: 0,
            percentage: '0',
            classAverage: classAverage,
            comments: 'Not taken',
            grade: 'N/A'
          };
        }
      });

      // Calculate overall average (only for subjects with marks, not N/A)
      const subjectsWithMarks = subjectData.filter(sub => sub.grade !== 'N/A');
      const totalPercentage = subjectsWithMarks.reduce((sum, sub) => sum + parseFloat(sub.percentage), 0);
      const overallAverage = subjectsWithMarks.length > 0 ? totalPercentage / subjectsWithMarks.length : 0;

      // Calculate class position
      const allClassMarks = await marksRepository.find({
        where: { examId: In(examIds) },
        relations: ['student', 'subject']
      });

      const classMarks = allClassMarks.filter(m => m.student.classId === student.classId);
      const studentAverages: { [key: string]: { total: number; count: number } } = {};

      classMarks.forEach(mark => {
        const sid = mark.studentId;
        if (!studentAverages[sid]) {
          studentAverages[sid] = { total: 0, count: 0 };
        }
        studentAverages[sid].total += (mark.score / mark.maxScore) * 100;
        studentAverages[sid].count += 1;
      });

      const rankingsUnsorted = Object.entries(studentAverages)
        .map(([sid, avg]) => ({
          studentId: sid,
          average: avg.count > 0 ? avg.total / avg.count : 0
        }))
        .sort((a, b) => b.average - a.average);
      
      // Assign positions with proper tie handling
      const rankings = assignPositionsWithTies(rankingsUnsorted);
      const classRankEntry = rankings.find(r => r.studentId === studentId);
      const classPosition = classRankEntry?.position || 0;

      // Calculate grade position (across all classes with the same grade/form) - get all students in the same form
      let formPosition = 0;
      let totalStudentsPerStream = 0;
      if (student.classEntity?.form) {
        const classRepository = AppDataSource.getRepository(Class);
        const formClasses = await classRepository.find({ where: { form: student.classEntity.form } });
        const formClassIds = formClasses.map(c => c.id);
        const formStudents = await studentRepository.find({
          where: { classId: In(formClassIds) },
          relations: ['classEntity']
        });
        
        // Get all exams of the specified type and term from ALL classes with the same form
        // This is critical - we need exams from all classes, not just the current class
        const allFormExams = await examRepository.find({
          where: { 
            classId: In(formClassIds),
            type: normalizedExamType, // Use normalized exam type, not the original
            term: termValue,
          },
          relations: ['subjects']
        });
        const allFormExamIds = allFormExams.map(e => e.id);
        console.log('PDF: Found exams for form ranking:', allFormExamIds.length, 'across', formClassIds.length, 'classes');
        
        // Get all marks for form students (using all form exams, not just current class exams)
        const formMarks = allFormExamIds.length > 0 ? await marksRepository.find({
          where: { examId: In(allFormExamIds), studentId: In(formStudents.map(s => s.id)) },
          relations: ['student', 'subject']
        }) : [];
        
        // Calculate form rankings
        const formStudentAverages: { [key: string]: { total: number; count: number } } = {};
        formMarks.forEach(mark => {
          const sid = mark.studentId;
          if (!formStudentAverages[sid]) {
            formStudentAverages[sid] = { total: 0, count: 0 };
          }
          formStudentAverages[sid].total += (mark.score / mark.maxScore) * 100;
          formStudentAverages[sid].count += 1;
        });
        
        const formRankingsUnsorted = Object.entries(formStudentAverages)
          .map(([sid, avg]) => ({
            studentId: sid,
            average: avg.count > 0 ? avg.total / avg.count : 0
          }))
          .sort((a, b) => b.average - a.average);
        
        // Assign positions with proper tie handling
        const formRankings = assignPositionsWithTies(formRankingsUnsorted);
        
        // Get total students per stream with marks (for ranking) - must be set before finding position
        totalStudentsPerStream = formRankings.length;
        
        // Find grade position with tie handling
        const formRankEntry = formRankings.find(r => r.studentId === studentId);
        if (formRankEntry) {
          formPosition = formRankEntry.position;
        }
      }

      // Get remarks for PDF
      const remarksRepository = AppDataSource.getRepository(ReportCardRemarks);
      let remarks = await remarksRepository.findOne({
        where: {
          studentId: studentId as string,
          classId: classId as string,
          examType: normalizedExamType, // Use normalized exam type
        }
      });

      // Fallback for remarks saved with old (unnormalized) examType
      if (!remarks) {
        console.log(`[generateReportCardPDF] No remarks found with normalized examType "${normalizedExamType}", trying original "${examType}"`);
        remarks = await remarksRepository.findOne({
          where: {
            studentId: studentId as string,
            classId: classId as string,
            examType: examType as string, // Try original type
          }
        });
      }
      console.log('[generateReportCardPDF] Fetched remarks for PDF:', remarks);

      // Get total attendance for this student for the term
      const attendanceRepository = AppDataSource.getRepository(Attendance);
      const attendanceRecords = await attendanceRepository.find({
        where: {
          studentId: studentId as string,
          term: termValue,
        }
      });
      const totalAttendance = attendanceRecords.length;
      const presentAttendance = attendanceRecords.filter(a => 
        a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.EXCUSED
      ).length;

      // Get total number of students in the class with marks (for ranking)
      const totalStudents = rankings.length;

      reportCardData = {
        student: {
          id: student.id,
          name: `${student.firstName} ${student.lastName}`,
          studentNumber: student.studentNumber,
          class: student.classEntity?.name || ''
        },
        examType: examType,
        exams: (() => {
          // Remove duplicate exams by name to avoid showing the same exam multiple times
          const uniqueExams = new Map<string, { id: string; name: string; examDate: Date }>();
          exams.forEach(e => {
            if (!uniqueExams.has(e.name)) {
              uniqueExams.set(e.name, { id: e.id, name: e.name, examDate: e.examDate });
            }
          });
          return Array.from(uniqueExams.values());
        })(),
        subjects: subjectData,
        overallAverage: overallAverage.toString(),
        overallGrade: getGrade(overallAverage),
        classPosition: classPosition || 0,
        formPosition: formPosition || 0,
        totalStudents: totalStudents, // Add total number of students
        totalStudentsPerStream: totalStudentsPerStream || 0, // Add total number of students per stream
        totalAttendance: totalAttendance, // Total attendance days for the term
        presentAttendance: presentAttendance, // Present/excused attendance days
        remarks: {
          classTeacherRemarks: remarks?.classTeacherRemarks || null,
          headmasterRemarks: remarks?.headmasterRemarks || null
        },
        generatedAt: new Date()
      };
    } else if (studentId && examId) {
      // Old format: single exam
      const student = await studentRepository.findOne({
        where: { id: studentId as string },
        relations: ['classEntity']
      });

      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }

      const marks = await marksRepository.find({
        where: { studentId: studentId as string, examId: examId as string },
        relations: ['subject', 'exam']
      });

      if (marks.length === 0) {
        return res.status(404).json({ message: 'No marks found for this student and exam' });
      }

      // Get settings
      const settingsList = await settingsRepository.find({
        order: { createdAt: 'DESC' },
        take: 1
      });
      const settings = settingsList.length > 0 ? settingsList[0] : null;

      // Calculate report card data
      let totalPercentage = 0;
      const subjectData = marks.map(mark => {
        const roundedScore = Math.round(parseFloat(String(mark.score)) || 0);
        const roundedMaxScore = Math.round(parseFloat(String(mark.maxScore)) || 100);
        const percentage = roundedMaxScore > 0 ? (roundedScore / roundedMaxScore) * 100 : 0;
        totalPercentage += percentage;
        return {
          subject: mark.subject.name,
          score: roundedScore,
          maxScore: roundedMaxScore,
          percentage: Math.round(percentage).toString(),
          comments: mark.comments
        };
      });

      const overallAverage = marks.length > 0 ? totalPercentage / marks.length : 0;

      // Calculate class position
      const allClassMarks = await marksRepository.find({
        where: { examId: examId as string },
        relations: ['student', 'subject']
      });

      const classMarks = allClassMarks.filter(m => m.student.classId === student.classId);
      const studentAverages: { [key: string]: { total: number; count: number } } = {};

      classMarks.forEach(mark => {
        const sid = mark.studentId;
        if (!studentAverages[sid]) {
          studentAverages[sid] = { total: 0, count: 0 };
        }
        studentAverages[sid].total += (mark.score / mark.maxScore) * 100;
        studentAverages[sid].count += 1;
      });

      const rankingsUnsorted = Object.entries(studentAverages)
        .map(([sid, avg]) => ({
          studentId: sid,
          average: avg.count > 0 ? avg.total / avg.count : 0
        }))
        .sort((a, b) => b.average - a.average);
      
      // Assign positions with proper tie handling
      const rankings = assignPositionsWithTies(rankingsUnsorted);
      const classRankEntry = rankings.find(r => r.studentId === studentId);
      const classPosition = classRankEntry?.position || 0;

      // Calculate grade position (across all classes with the same grade/form) - get all students in the same form
      let formPosition = 0;
      let totalStudentsPerStream = 0;
      if (student.classEntity?.form) {
        const classRepository = AppDataSource.getRepository(Class);
        const formClasses = await classRepository.find({ where: { form: student.classEntity.form } });
        const formClassIds = formClasses.map(c => c.id);
        const formStudents = await studentRepository.find({
          where: { classId: In(formClassIds) },
          relations: ['classEntity']
        });
        
        // For old format (single examId), we need to get the exam type and term from the exam
        // Then get all exams of that type and term from all classes with the same form
        const singleExam = await examRepository.findOne({
          where: { id: examId as string },
          relations: ['subjects']
        });
        
        let allFormExamIds: string[] = [];
        if (singleExam) {
          // Get all exams of the same type and term from all classes with the same form
          const whereClause: any = { 
            classId: In(formClassIds),
            type: singleExam.type
          };
          // Only include term if it's not null
          if (singleExam.term) {
            whereClause.term = singleExam.term;
          }
          const allFormExams = await examRepository.find({
            where: whereClause,
            relations: ['subjects']
          });
          allFormExamIds = allFormExams.map(e => e.id);
          console.log('PDF (old format): Found exams for form ranking:', allFormExamIds.length, 'across', formClassIds.length, 'classes');
        }
        
        // Get all marks for form students (using all form exams, not just the single exam)
        const formMarks = allFormExamIds.length > 0 ? await marksRepository.find({
          where: { examId: In(allFormExamIds), studentId: In(formStudents.map(s => s.id)) },
          relations: ['student', 'subject']
        }) : [];
        
        // Calculate form rankings
        const formStudentAverages: { [key: string]: { total: number; count: number } } = {};
        formMarks.forEach(mark => {
          const sid = mark.studentId;
          if (!formStudentAverages[sid]) {
            formStudentAverages[sid] = { total: 0, count: 0 };
          }
          formStudentAverages[sid].total += (mark.score / mark.maxScore) * 100;
          formStudentAverages[sid].count += 1;
        });
        
        const formRankingsUnsorted = Object.entries(formStudentAverages)
          .map(([sid, avg]) => ({
            studentId: sid,
            average: avg.count > 0 ? avg.total / avg.count : 0
          }))
          .sort((a, b) => b.average - a.average);
        
        // Assign positions with proper tie handling
        const formRankings = assignPositionsWithTies(formRankingsUnsorted);
        
        // Get total students per stream with marks (for ranking) - must be set before finding position
        totalStudentsPerStream = formRankings.length;
        
        // Find grade position with tie handling
        const formRankEntry = formRankings.find(r => r.studentId === studentId);
        if (formRankEntry) {
          formPosition = formRankEntry.position;
        }
      }

      // Get total number of students in the class with marks (for ranking)
      const totalStudents = rankings.length;

      // Get remarks for PDF (old format)
      const remarksRepository = AppDataSource.getRepository(ReportCardRemarks);
      const exam = marks[0]?.exam;
      let remarks = null;
      if (exam) {
        // Try with the exam type from database (should already be normalized)
        remarks = await remarksRepository.findOne({
          where: {
            studentId: studentId as string,
            classId: student.classId || '',
            examType: exam.type,
          }
        });
        
        // If not found, try normalizing the exam type (fallback for edge cases)
        if (!remarks && exam.type) {
          try {
            const normalizedType = normalizeExamType(exam.type);
            remarks = await remarksRepository.findOne({
              where: {
                studentId: studentId as string,
                classId: student.classId || '',
                examType: normalizedType,
              }
            });
          } catch (error) {
            // If normalization fails, use original type (already tried above)
            console.log('[generateReportCardPDF] Could not normalize exam type for remarks lookup:', exam.type);
          }
        }
      }
      console.log('[generateReportCardPDF] Fetched remarks for PDF (old format):', remarks);

      reportCardData = {
        student: {
          id: student.id,
          name: `${student.firstName} ${student.lastName}`,
          studentNumber: student.studentNumber,
          class: student.classEntity?.name || ''
        },
        exam: exam,
        subjects: subjectData,
        overallAverage: overallAverage.toString(),
        classPosition: classPosition || 0,
        formPosition: formPosition || 0,
        totalStudents: totalStudents, // Add total number of students
        totalStudentsPerStream: totalStudentsPerStream || 0, // Add total number of students per stream
        remarks: {
          classTeacherRemarks: remarks?.classTeacherRemarks || null,
          headmasterRemarks: remarks?.headmasterRemarks || null
        },
        generatedAt: new Date()
      };
    } else {
      return res.status(400).json({ message: 'Invalid parameters. Provide either (studentId + examId) or (classId + examType + studentId)' });
    }

    // Get settings for PDF generation
    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    // Generate PDF
    console.log('Generating PDF with data:', {
      student: reportCardData.student.name,
      examType: reportCardData.examType,
      subjectsCount: reportCardData.subjects.length,
      hasRemarks: !!(reportCardData.remarks?.classTeacherRemarks || reportCardData.remarks?.headmasterRemarks),
      hasSettings: !!settings,
      schoolName: settings?.schoolName,
      schoolAddress: settings?.schoolAddress ? 'Present' : 'Missing',
      schoolLogo: settings?.schoolLogo ? 'Present' : 'Missing',
      academicYear: settings?.academicYear
    });
    
    const pdfBuffer = await createReportCardPDF(reportCardData, settings);
    console.log('PDF generated, buffer size:', pdfBuffer.length);

    // Use student's full name for filename (sanitize for filesystem)
    const studentName = reportCardData.student.name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');
    const filename = reportCardData.examType 
      ? `${studentName}-${reportCardData.examType}.pdf`
      : `${studentName}-${examId}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(pdfBuffer);
    console.log('PDF sent to client');
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const generateMarkSheet = async (req: AuthRequest, res: Response) => {
  try {
    const { classId, examType, term, subjectId } = req.query;
    const user = req.user;
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
    const isTeacher = user?.role === 'teacher';

    if (!classId || !examType) {
      return res.status(400).json({ message: 'Class ID and exam type are required' });
    }

    // For teachers, subjectId is required
    if (isTeacher && !subjectId) {
      return res.status(400).json({ message: 'Subject ID is required for teachers' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const examRepository = AppDataSource.getRepository(Exam);
    const marksRepository = AppDataSource.getRepository(Marks);
    const classRepository = AppDataSource.getRepository(Class);
    const subjectRepository = AppDataSource.getRepository(Subject);
    const teacherRepository = AppDataSource.getRepository(Teacher);

    // Get class information
    const classEntity = await classRepository.findOne({
      where: { id: classId as string },
      relations: ['subjects']
    });

    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // For teachers, verify assignment to class and subject
    if (isTeacher && user?.teacher?.id) {
      const teacher = await teacherRepository.findOne({
        where: { id: user.teacher.id },
        relations: ['classes', 'subjects']
      });

      if (!teacher) {
        return res.status(404).json({ message: 'Teacher not found' });
      }

      // Verify teacher is assigned to this class
      const isAssignedToClass = teacher.classes?.some(c => c.id === classId);
      if (!isAssignedToClass) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
      }

      // Verify teacher teaches this subject
      if (subjectId) {
        const teachesSubject = teacher.subjects?.some(s => s.id === subjectId);
        if (!teachesSubject) {
          return res.status(403).json({ message: 'You are not assigned to teach this subject' });
        }
      }
    }

    // Get all students in the class
    const students = await studentRepository.find({
      where: { classId: classId as string, isActive: true },
      order: { firstName: 'ASC', lastName: 'ASC' }
    });

    if (students.length === 0) {
      return res.status(404).json({ message: 'No students found in this class' });
    }

    // Get all exams of the specified type for this class
    const exams = await examRepository.find({
      where: {
        classId: classId as string,
        type: examType as ExamType,
      },
      relations: ['subjects'],
      order: { examDate: 'DESC' }
    });

    if (exams.length === 0) {
      return res.status(404).json({ message: `No ${examType} exams found for this class` });
    }

    // Get all subjects for this class
    const subjects = classEntity.subjects || [];
    if (subjects.length === 0) {
      return res.status(404).json({ message: 'No subjects found for this class' });
    }

    // Get all marks for these exams
    const examIds = exams.map(exam => exam.id);
    const allMarks = await marksRepository.find({
      where: {
        examId: In(examIds),
        studentId: In(students.map(s => s.id)),
      },
      relations: ['student', 'exam', 'subject']
    });

    // Organize marks by student and subject
    const markSheetData: any[] = [];

    for (const student of students) {
      const studentRow: any = {
        studentId: student.id,
        studentNumber: student.studentNumber,
        studentName: `${student.firstName} ${student.lastName}`,
        subjects: {} as any,
        totalScore: 0,
        totalMaxScore: 0,
        average: 0
      };

      // Get marks for this student
      const studentMarks = allMarks.filter(mark => mark.studentId === student.id);

      // For each subject, find the mark (use the latest exam if multiple)
      for (const subject of subjects) {
        const subjectMarks = studentMarks.filter(mark => mark.subjectId === subject.id);
        
        if (subjectMarks.length > 0) {
          // Use the most recent mark (latest exam)
          const latestMark = subjectMarks.sort((a, b) => 
            new Date(b.exam.examDate).getTime() - new Date(a.exam.examDate).getTime()
          )[0];

          studentRow.subjects[subject.id] = {
            subjectName: subject.name,
            score: Math.round(parseFloat(String(latestMark.score)) || 0),
            maxScore: Math.round(parseFloat(String(latestMark.maxScore)) || 100),
            percentage: Math.round(((parseFloat(String(latestMark.score)) || 0) / (parseFloat(String(latestMark.maxScore)) || 100)) * 100)
          };

          studentRow.totalScore += parseFloat(String(latestMark.score)) || 0;
          studentRow.totalMaxScore += parseFloat(String(latestMark.maxScore)) || 100;
        } else {
          studentRow.subjects[subject.id] = {
            subjectName: subject.name,
            score: 0,
            maxScore: 100,
            percentage: 0
          };
          studentRow.totalMaxScore += 100;
        }
      }

      // Calculate average
      if (studentRow.totalMaxScore > 0) {
        studentRow.average = Math.round((studentRow.totalScore / studentRow.totalMaxScore) * 100);
      }

      markSheetData.push(studentRow);
    }

    // Sort by average (descending)
    markSheetData.sort((a, b) => b.average - a.average);

    // Add positions
    markSheetData.forEach((row, index) => {
      row.position = index + 1;
    });

    res.json({
      class: {
        id: classEntity.id,
        name: classEntity.name,
        form: classEntity.form
      },
      examType,
      term: term || exams[0]?.term || null,
      subject: subjectId ? subjects.find(s => s.id === subjectId) : null,
      subjects: subjects.map(s => ({ id: s.id, name: s.name })),
      exams: exams.map(e => ({
        id: e.id,
        name: e.name,
        examDate: e.examDate,
        term: e.term
      })),
      markSheet: markSheetData,
      generatedAt: new Date()
    });
  } catch (error: any) {
    console.error('Error generating mark sheet:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const generateMarkSheetPDF = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { classId, examType, term, subjectId } = req.query;
    const user = req.user;
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
    const isTeacher = user?.role === 'teacher';

    if (!classId || !examType) {
      return res.status(400).json({ message: 'Class ID and exam type are required' });
    }

    // For teachers, subjectId is required
    if (isTeacher && !subjectId) {
      return res.status(400).json({ message: 'Subject ID is required for teachers' });
    }

    const studentRepository = AppDataSource.getRepository(Student);
    const examRepository = AppDataSource.getRepository(Exam);
    const marksRepository = AppDataSource.getRepository(Marks);
    const classRepository = AppDataSource.getRepository(Class);
    const subjectRepository = AppDataSource.getRepository(Subject);
    const settingsRepository = AppDataSource.getRepository(Settings);
    const teacherRepository = AppDataSource.getRepository(Teacher);

    // Get class information
    const classEntity = await classRepository.findOne({
      where: { id: classId as string },
      relations: ['subjects']
    });

    if (!classEntity) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // For teachers, verify assignment to class and subject
    if (isTeacher && user?.teacher?.id) {
      const teacher = await teacherRepository.findOne({
        where: { id: user.teacher.id },
        relations: ['classes', 'subjects']
      });

      if (!teacher) {
        return res.status(404).json({ message: 'Teacher not found' });
      }

      // Verify teacher is assigned to this class
      const isAssignedToClass = teacher.classes?.some(c => c.id === classId);
      if (!isAssignedToClass) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
      }

      // Verify teacher teaches this subject
      if (subjectId) {
        const teachesSubject = teacher.subjects?.some(s => s.id === subjectId);
        if (!teachesSubject) {
          return res.status(403).json({ message: 'You are not assigned to teach this subject' });
        }
      }
    }

    // Get all students in the class
    const students = await studentRepository.find({
      where: { classId: classId as string, isActive: true },
      order: { firstName: 'ASC', lastName: 'ASC' }
    });

    if (students.length === 0) {
      return res.status(404).json({ message: 'No students found in this class' });
    }

    // Build exam query with optional term filter
    const examWhere: any = {
      classId: classId as string,
      type: examType as ExamType,
    };
    if (term) {
      examWhere.term = term as string;
    }

    // Get exams of the specified type for this class (and term if provided)
    const exams = await examRepository.find({
      where: examWhere,
      relations: ['subjects'],
      order: { examDate: 'DESC' }
    });

    if (exams.length === 0) {
      return res.status(404).json({ message: `No ${examType} exams found for this class${term ? ` in ${term}` : ''}` });
    }

    // If subjectId is provided, filter to that subject only
    let subjects = classEntity.subjects || [];
    if (subjectId) {
      const selectedSubject = subjects.find(s => s.id === subjectId);
      if (!selectedSubject) {
        return res.status(404).json({ message: 'Subject not found in this class' });
      }
      subjects = [selectedSubject];
    }

    if (subjects.length === 0) {
      return res.status(404).json({ message: 'No subjects found for this class' });
    }

    // Get all marks for these exams, filtered by subject if provided
    const examIds = exams.map(exam => exam.id);
    const marksWhere: any = {
      examId: In(examIds),
      studentId: In(students.map(s => s.id)),
    };
    if (subjectId) {
      marksWhere.subjectId = subjectId as string;
    }

    const allMarks = await marksRepository.find({
      where: marksWhere,
      relations: ['student', 'exam', 'subject']
    });

    // Organize marks by student and subject
    const markSheetData: any[] = [];

    for (const student of students) {
      const studentRow: any = {
        studentId: student.id,
        studentNumber: student.studentNumber,
        studentName: `${student.firstName} ${student.lastName}`,
        subjects: {} as any,
        totalScore: 0,
        totalMaxScore: 0,
        average: 0
      };

      // Get marks for this student
      const studentMarks = allMarks.filter(mark => mark.studentId === student.id);

      // For each subject, find the mark (use the latest exam if multiple)
      for (const subject of subjects) {
        const subjectMarks = studentMarks.filter(mark => mark.subjectId === subject.id);
        
        if (subjectMarks.length > 0) {
          // Use the most recent mark (latest exam)
          const latestMark = subjectMarks.sort((a, b) => 
            new Date(b.exam.examDate).getTime() - new Date(a.exam.examDate).getTime()
          )[0];

          studentRow.subjects[subject.id] = {
            subjectName: subject.name,
            score: Math.round(parseFloat(String(latestMark.score)) || 0),
            maxScore: Math.round(parseFloat(String(latestMark.maxScore)) || 100),
            percentage: Math.round(((parseFloat(String(latestMark.score)) || 0) / (parseFloat(String(latestMark.maxScore)) || 100)) * 100)
          };

          studentRow.totalScore += parseFloat(String(latestMark.score)) || 0;
          studentRow.totalMaxScore += parseFloat(String(latestMark.maxScore)) || 100;
        } else {
          studentRow.subjects[subject.id] = {
            subjectName: subject.name,
            score: 0,
            maxScore: 100,
            percentage: 0
          };
          studentRow.totalMaxScore += 100;
        }
      }

      // Calculate average
      if (studentRow.totalMaxScore > 0) {
        studentRow.average = Math.round((studentRow.totalScore / studentRow.totalMaxScore) * 100);
      }

      markSheetData.push(studentRow);
    }

    // Sort by average (descending)
    markSheetData.sort((a, b) => b.average - a.average);

    // Add positions
    markSheetData.forEach((row, index) => {
      row.position = index + 1;
    });

    // Get settings for PDF
    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    // Prepare data for PDF
    const pdfData = {
      class: {
        id: classEntity.id,
        name: classEntity.name,
        form: classEntity.form
      },
      examType: examType as string,
      subjects: subjects.map(s => ({ id: s.id, name: s.name })),
      exams: exams.map(e => ({
        id: e.id,
        name: e.name,
        examDate: e.examDate,
        term: e.term
      })),
      markSheet: markSheetData,
      generatedAt: new Date()
    };

    // Generate PDF
    const pdfBuffer = await createMarkSheetPDF(pdfData, settings);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="mark-sheet-${classEntity.name}-${examType}-${new Date().toISOString().split('T')[0]}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating mark sheet PDF:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const saveReportCardRemarks = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { studentId, classId, examType, classTeacherRemarks, headmasterRemarks } = req.body;
    const user = req.user;

    if (!studentId || !classId || !examType) {
      return res.status(400).json({ message: 'Student ID, Class ID, and Exam Type are required' });
    }

    // Normalize examType to match enum values (for consistency with how it's stored)
    let normalizedExamType: string;
    try {
      normalizedExamType = normalizeExamType(examType as string);
      console.log('[saveReportCardRemarks] Normalized examType:', examType, '->', normalizedExamType);
    } catch (error: any) {
      console.error('[saveReportCardRemarks] Error normalizing examType:', error.message);
      // If normalization fails, use original (for backward compatibility)
      normalizedExamType = examType as string;
    }

    const remarksRepository = AppDataSource.getRepository(ReportCardRemarks);
    const examRepository = AppDataSource.getRepository(Exam);
    
    // Check if user is admin (headmaster) or teacher
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
    const isTeacher = user?.role === 'teacher';

    if (!isAdmin && !isTeacher) {
      return res.status(403).json({ message: 'Only teachers and administrators can add remarks' });
    }

    // Check if exam is published - prevent editing remarks
    // Use normalized exam type for query
    const exams = await examRepository.find({
      where: { classId: classId as string, type: normalizedExamType as any }
    });

    if (exams.length > 0 && exams.some(exam => exam.status === ExamStatus.PUBLISHED)) {
      return res.status(403).json({ 
        message: 'Cannot edit remarks. Exam results have been published and are now read-only.' 
      });
    }

    // Find existing remarks - try both normalized and original formats
    let remarks = await remarksRepository.findOne({
      where: {
        studentId: studentId as string,
        classId: classId as string,
        examType: normalizedExamType, // Try normalized first
      }
    });

    // If not found, try original format (for backward compatibility)
    if (!remarks && examType !== normalizedExamType) {
      remarks = await remarksRepository.findOne({
        where: {
          studentId: studentId as string,
          classId: classId as string,
          examType: examType as string, // Try original format
        }
      });
    }

    if (!remarks) {
      remarks = remarksRepository.create({
        studentId: studentId as string,
        classId: classId as string,
        examType: normalizedExamType, // Save with normalized format for consistency
      });
    } else {
      // If found with original format, update to normalized format for consistency
      if (remarks.examType !== normalizedExamType) {
        console.log('[saveReportCardRemarks] Updating remarks examType from', remarks.examType, 'to', normalizedExamType);
        remarks.examType = normalizedExamType;
      }
    }

    // Update remarks based on user role
    if (isAdmin) {
      // Admin can add headmaster remarks
      remarks.headmasterRemarks = headmasterRemarks || null;
      remarks.headmasterId = user.id;
    }

    if (isTeacher || isAdmin) {
      // Teachers and admins can add class teacher remarks
      remarks.classTeacherRemarks = classTeacherRemarks || null;
      remarks.classTeacherId = user.id;
    }

    const savedRemarks = await remarksRepository.save(remarks);
    res.json({ message: 'Remarks saved successfully', remarks: savedRemarks });
  } catch (error: any) {
    console.error('Error saving report card remarks:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};


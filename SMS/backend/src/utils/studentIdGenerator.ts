import { AppDataSource } from '../config/database';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';

/**
 * Generates a unique student ID with structure:
 * AAA###YYYY
 * - AAA  : first three letters (prefix from settings, sanitized to letters)
 * - ###  : random three-digit number
 * - YYYY : current year (registration year)
 */
export async function generateStudentId(): Promise<string> {
  // Ensure database is initialized
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const studentRepository = AppDataSource.getRepository(Student);
  const settingsRepository = AppDataSource.getRepository(Settings);
  
  // Get prefix from settings, default to 'SCH' if not found
  let prefix = 'SCH';
  try {
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });
    if (settings && settings.studentIdPrefix) {
      prefix = settings.studentIdPrefix.trim();
    }
  } catch (error) {
    console.warn('Could not load settings for student ID prefix, using default:', error);
  }

  // Sanitize prefix to letters only and ensure 3 characters
  prefix = prefix.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (!prefix) {
    prefix = 'SCH';
  }
  if (prefix.length < 3) {
    prefix = (prefix + 'XXX').slice(0, 3);
  } else if (prefix.length > 3) {
    prefix = prefix.slice(0, 3);
  }

  const currentYear = new Date().getFullYear().toString();
  
  // Generate random digits and check uniqueness
  let attempts = 0;
  let studentId: string;
  let existing: Student | null;
  
  do {
    const randomNumber = Math.floor(Math.random() * 1000); // 0 - 999
    const formattedNumber = randomNumber.toString().padStart(3, '0');
    studentId = `${prefix}${formattedNumber}${currentYear}`;
    
    // Check if this ID already exists
    existing = await studentRepository.findOne({ 
      where: { studentNumber: studentId }
    });
    
    attempts++;
    
    // Safety check to prevent infinite loop
    if (attempts > 100) {
      throw new Error('Unable to generate unique student ID after multiple attempts');
    }
  } while (existing);

  return studentId;
}


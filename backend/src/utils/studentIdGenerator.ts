import { AppDataSource } from '../config/database';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';

/**
 * Generates a unique 7-digit random student ID with prefix from settings
 * Format: {PREFIX}1234567, {PREFIX}9876543, etc. (random 7-digit numbers)
 */
export async function generateStudentId(): Promise<string> {
  // Ensure database is initialized
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const studentRepository = AppDataSource.getRepository(Student);
  const settingsRepository = AppDataSource.getRepository(Settings);
  
  // Get prefix from settings, default to 'JPS' if not found
  let prefix = 'JPS';
  try {
    const settings = await settingsRepository.findOne({
      order: { createdAt: 'DESC' }
    });
    if (settings && settings.studentIdPrefix) {
      prefix = settings.studentIdPrefix.trim();
    }
  } catch (error) {
    console.warn('Could not load settings for student ID prefix, using default:', error);
  }
  
  // Generate random 7-digit number and check uniqueness
  let attempts = 0;
  let studentId: string;
  let existing: Student | null;
  
  do {
    // Generate random 7-digit number (1000000 to 9999999)
    const randomNumber = Math.floor(Math.random() * 9000000) + 1000000;
    const formattedNumber = randomNumber.toString().padStart(7, '0');
    studentId = `${prefix}${formattedNumber}`;
    
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


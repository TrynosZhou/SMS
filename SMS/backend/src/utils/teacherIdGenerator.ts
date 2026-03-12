import { AppDataSource } from '../config/database';
import { Teacher } from '../entities/Teacher';

/**
 * Generates a unique 7-digit random teacher ID with prefix "JPST"
 * Format: JPST1234567, JPST9876543, etc. (random 7-digit numbers)
 */
export async function generateTeacherId(): Promise<string> {
  // Ensure database is initialized
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const teacherRepository = AppDataSource.getRepository(Teacher);
  
  // Generate random 7-digit number and check uniqueness
  let attempts = 0;
  let teacherId: string;
  let existing: Teacher | null;
  
  do {
    // Generate random 7-digit number (1000000 to 9999999)
    const randomNumber = Math.floor(Math.random() * 9000000) + 1000000;
    const formattedNumber = randomNumber.toString().padStart(7, '0');
    teacherId = `JPST${formattedNumber}`;
    
    // Check if this teacher ID already exists
    existing = await teacherRepository.findOne({ 
      where: { teacherId } 
    });
    
    attempts++;
    
    // Safety check to prevent infinite loop
    if (attempts > 100) {
      throw new Error('Unable to generate unique teacher ID after multiple attempts');
    }
  } while (existing);

  return teacherId;
}


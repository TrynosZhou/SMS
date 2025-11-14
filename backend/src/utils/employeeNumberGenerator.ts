import { AppDataSource } from '../config/database';
import { Teacher } from '../entities/Teacher';

/**
 * Generates a unique 7-digit random employee number with prefix "JPST"
 * Format: JPST1234567, JPST9876543, etc. (random 7-digit numbers)
 */
export async function generateEmployeeNumber(): Promise<string> {
  // Ensure database is initialized
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const teacherRepository = AppDataSource.getRepository(Teacher);
  
  // Generate random 7-digit number and check uniqueness
  let attempts = 0;
  let employeeNumber: string;
  let existing: Teacher | null;
  
  do {
    // Generate random 7-digit number (1000000 to 9999999)
    const randomNumber = Math.floor(Math.random() * 9000000) + 1000000;
    const formattedNumber = randomNumber.toString().padStart(7, '0');
    employeeNumber = `JPST${formattedNumber}`;
    
    // Check if this employee number already exists
    existing = await teacherRepository.findOne({ 
      where: { employeeNumber } 
    });
    
    attempts++;
    
    // Safety check to prevent infinite loop
    if (attempts > 100) {
      throw new Error('Unable to generate unique employee number after multiple attempts');
    }
  } while (existing);

  return employeeNumber;
}


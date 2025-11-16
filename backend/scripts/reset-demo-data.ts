/**
 * Script to reset demo data to a clean initial state
 * This script should be run nightly via a cron job
 * Usage: 
 *   ts-node scripts/reset-demo-data.ts
 *   or
 *   npm run reset-demo-data
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { AppDataSource } from '../src/config/database';
import { User, UserRole } from '../src/entities/User';
import { Student } from '../src/entities/Student';
import { Teacher } from '../src/entities/Teacher';
import { Parent } from '../src/entities/Parent';
import { Class } from '../src/entities/Class';
import { Subject } from '../src/entities/Subject';
import { Exam } from '../src/entities/Exam';
import { Marks } from '../src/entities/Marks';
import { Invoice } from '../src/entities/Invoice';
import { Settings } from '../src/entities/Settings';
import bcrypt from 'bcryptjs';

dotenv.config();

async function resetDemoData() {
  try {
    // Initialize database connection
    await AppDataSource.initialize();
    console.log('Database connected successfully');

    const demoEmail = 'demo@school.com';

    // Get repositories
    const userRepository = AppDataSource.getRepository(User);
    const studentRepository = AppDataSource.getRepository(Student);
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const parentRepository = AppDataSource.getRepository(Parent);
    const classRepository = AppDataSource.getRepository(Class);
    const subjectRepository = AppDataSource.getRepository(Subject);
    const examRepository = AppDataSource.getRepository(Exam);
    const marksRepository = AppDataSource.getRepository(Marks);
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const settingsRepository = AppDataSource.getRepository(Settings);

    // Find demo user
    const demoUser = await userRepository.findOne({
      where: { email: demoEmail, isDemo: true }
    });

    if (!demoUser) {
      console.error('❌ Demo user not found. Please run create-demo script first.');
      await AppDataSource.destroy();
      process.exit(1);
    }

    console.log('🔄 Starting demo data reset...');

    // Step 1: Delete all invoices
    await invoiceRepository.delete({});
    console.log('✓ Deleted all invoices');

    // Step 2: Delete all marks
    await marksRepository.delete({});
    console.log('✓ Deleted all marks');

    // Step 3: Delete all exams
    await examRepository.delete({});
    console.log('✓ Deleted all exams');

    // Step 4: Delete all students (and their associated users if not demo)
    const students = await studentRepository.find({ relations: ['user'] });
    for (const student of students) {
      if (student.user && !student.user.isDemo) {
        await userRepository.remove(student.user);
      }
      await studentRepository.remove(student);
    }
    console.log('✓ Deleted all students');

    // Step 5: Delete all teachers (and their associated users if not demo)
    const teachers = await teacherRepository.find({ relations: ['user'] });
    for (const teacher of teachers) {
      if (teacher.user && !teacher.user.isDemo) {
        await userRepository.remove(teacher.user);
      }
      await teacherRepository.remove(teacher);
    }
    console.log('✓ Deleted all teachers');

    // Step 6: Delete all parents (and their associated users if not demo)
    const parents = await parentRepository.find({ relations: ['user'] });
    for (const parent of parents) {
      if (parent.user && !parent.user.isDemo) {
        await userRepository.remove(parent.user);
      }
      await parentRepository.remove(parent);
    }
    console.log('✓ Deleted all parents');

    // Step 7: Delete all non-demo users (except demo user)
    await userRepository.delete({ isDemo: false });
    console.log('✓ Deleted all non-demo users');

    // Step 8: Delete all classes
    await classRepository.delete({});
    console.log('✓ Deleted all classes');

    // Step 9: Delete all subjects
    await subjectRepository.delete({});
    console.log('✓ Deleted all subjects');

    // Step 10: Reset settings to default (but keep school name as "Demo School")
    const existingSettings = await settingsRepository.findOne({ where: {} });
    if (existingSettings) {
      existingSettings.schoolName = 'Demo School';
      existingSettings.schoolAddress = null;
      existingSettings.schoolPhone = null;
      existingSettings.schoolEmail = null;
      existingSettings.headmasterName = null;
      existingSettings.schoolLogo = null;
      existingSettings.schoolLogo2 = null;
      await settingsRepository.save(existingSettings);
    } else {
      const defaultSettings = settingsRepository.create({
        studentIdPrefix: 'DEMO',
        feesSettings: {
          dayScholarTuitionFee: 0,
          boarderTuitionFee: 0,
          registrationFee: 0,
          deskFee: 0,
          libraryFee: 0,
          sportsFee: 0,
          transportCost: 0,
          diningHallCost: 0,
          otherFees: []
        },
        gradeThresholds: {
          excellent: 90,
          veryGood: 80,
          good: 70,
          satisfactory: 60,
          needsImprovement: 50
        },
        schoolName: 'Demo School',
        academicYear: new Date().getFullYear().toString(),
        currentTerm: `Term 1 ${new Date().getFullYear()}`,
        currencySymbol: 'KES'
      });
      await settingsRepository.save(defaultSettings);
    }
    console.log('✓ Reset settings to default');

    // Step 11: Ensure demo user password is correct
    const hashedPassword = await bcrypt.hash('Demo@123', 10);
    demoUser.password = hashedPassword;
    demoUser.isActive = true;
    demoUser.mustChangePassword = false;
    demoUser.isTemporaryAccount = false;
    await userRepository.save(demoUser);
    console.log('✓ Reset demo user credentials');

    console.log('\n✅ Demo data reset completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Demo account is ready for use:');
    console.log('  Email/Username: demo@school.com');
    console.log('  Password: Demo@123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error resetting demo data:', error.message);
    console.error(error);
    await AppDataSource.destroy();
    process.exit(1);
  }
}

resetDemoData();


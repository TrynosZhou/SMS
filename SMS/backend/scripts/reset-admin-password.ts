/**
 * Reset password for an existing user (e.g. admin).
 * Usage: npm run reset-admin-password <username> <new-password>
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { AppDataSource } from '../src/config/database';
import { User } from '../src/entities/User';
import bcrypt from 'bcryptjs';

dotenv.config();

async function resetPassword() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: npm run reset-admin-password <username> <new-password>');
    console.log('Example: npm run reset-admin-password admin Admin@123!');
    process.exit(1);
  }

  const [username, newPassword] = args;

  if (newPassword.length < 8) {
    console.error('❌ Password must be at least 8 characters long');
    process.exit(1);
  }

  try {
    await AppDataSource.initialize();
    console.log('Database connected successfully');

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { username } });

    if (!user) {
      console.error(`❌ User "${username}" not found`);
      process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.mustChangePassword = false;
    await userRepository.save(user);

    console.log('\n✅ Password reset successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Username:', username);
    console.log('New password:', newPassword);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nYou can now login with the new password.\n');

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error resetting password:', error.message);
    process.exit(1);
  }
}

resetPassword();

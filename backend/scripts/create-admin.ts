/**
 * Script to create an administrator or superadmin account
 * Usage:
 *   ts-node scripts/create-admin.ts <username> <password> <email> [role]
 *   or
 *   npm run create-admin <username> <password> <email> [role]
 *
 * Role is optional and defaults to 'admin'. Valid values: 'admin', 'superadmin'
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { AppDataSource } from '../src/config/database';
import { User, UserRole } from '../src/entities/User';
import bcrypt from 'bcryptjs';

dotenv.config();

async function createAdmin() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('Usage: ts-node scripts/create-admin.ts <username> <password> <email> [role]');
    console.log('Example: ts-node scripts/create-admin.ts admin admin123 admin@school.com admin');
    console.log('Example: ts-node scripts/create-admin.ts superadmin super123 superadmin@school.com superadmin');
    console.log('\nRole is optional and defaults to "admin". Valid values: admin, superadmin');
    process.exit(1);
  }

  const [username, password, email, roleArg] = args;
  const roleLower = (roleArg || 'admin').toLowerCase();

  // Validate role
  const validRoles = ['admin', 'superadmin'];
  if (!validRoles.includes(roleLower)) {
    console.error(`❌ Invalid role "${roleArg}". Valid values: ${validRoles.join(', ')}`);
    process.exit(1);
  }

  const userRole = roleLower === 'superadmin' ? UserRole.SUPERADMIN : UserRole.ADMIN;

  try {
    // Initialize database connection
    await AppDataSource.initialize();
    console.log('Database connected successfully');

    const userRepository = AppDataSource.getRepository(User);

    // Check if user already exists
    const existingUser = await userRepository.findOne({
      where: [
        { username },
        { email }
      ]
    });

    if (existingUser) {
      if (existingUser.username === username) {
        console.error(`❌ Username "${username}" already exists`);
      }
      if (existingUser.email === email) {
        console.error(`❌ Email "${email}" already exists`);
      }
      process.exit(1);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = userRepository.create({
      username,
      email,
      password: hashedPassword,
      role: userRole,
      isActive: true
    });

    await userRepository.save(user);

    const roleDisplay = roleLower === 'superadmin' ? 'Super Administrator' : 'Administrator';
    console.log(`\n✅ ${roleDisplay} account created successfully!`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Username:', username);
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Role:', roleDisplay);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nYou can now login with:');
    console.log(`  Username: ${username}`);
    console.log(`  Password: ${password}`);
    console.log(`  OR Email: ${email}`);
    console.log(`  Password: ${password}\n`);

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error creating account:', error.message);
    if (error.code === '23505') {
      console.error('   Duplicate username or email');
    }
    process.exit(1);
  }
}

createAdmin();

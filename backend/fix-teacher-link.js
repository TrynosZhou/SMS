const { AppDataSource } = require('./dist/config/database.js');
const { User } = require('./dist/entities/User.js');
const { Teacher } = require('./dist/entities/Teacher.js');

async function fixTeacherLink() {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const userRepository = AppDataSource.getRepository(User);
    const teacherRepository = AppDataSource.getRepository(Teacher);

    console.log('🔧 Fixing teacher link for user jpst3699880...');

    // Find the user
    const user = await userRepository.findOne({ 
      where: { username: 'jpst3699880' } 
    });

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('✅ Found user:', user.id);

    // Find all teachers with this teacherId
    const teachers = await teacherRepository.find({ 
      where: { teacherId: 'jpst3699880' } 
    });

    console.log(`📋 Found ${teachers.length} teachers with teacherId jpst3699880:`);
    teachers.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.firstName} ${t.lastName} (ID: ${t.id}, userId: ${t.userId})`);
    });

    // Find Tami Sauka specifically
    const tamiSauka = teachers.find(t => t.firstName === 'Tami' && t.lastName === 'Sauka');
    const teacherAccount = teachers.find(t => t.firstName === 'Teacher' && t.lastName === 'Account');

    if (tamiSauka) {
      console.log('✅ Found Tami Sauka, linking user to this teacher...');
      
      // Unlink Teacher Account if linked
      if (teacherAccount && teacherAccount.userId === user.id) {
        teacherAccount.userId = null;
        await teacherRepository.save(teacherAccount);
        console.log('🔓 Unlinked Teacher Account');
      }

      // Link to Tami Sauka
      tamiSauka.userId = user.id;
      await teacherRepository.save(tamiSauka);
      console.log('🔗 Linked user to Tami Sauka');
      
      console.log('✅ Fix completed successfully!');
    } else {
      console.log('❌ Tami Sauka not found in database');
    }

  } catch (error) {
    console.error('❌ Error fixing teacher link:', error);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

fixTeacherLink();

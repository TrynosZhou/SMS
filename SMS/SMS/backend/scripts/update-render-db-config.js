/**
 * Helper script to update .env file with Render database connection
 * Usage: node scripts/update-render-db-config.js <password>
 * Or: node scripts/update-render-db-config.js <full-database-url>
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const envPath = path.join(__dirname, '..', '.env');

// Render database configuration (from render.yaml)
const renderConfig = {
  hostname: 'dpg-d4bhs42dbo4c738qs4t0-a.oregon-postgres.render.com',
  port: 5432,
  username: 'school_db_primary_user',
  database: 'sms_db'
};

function updateEnvFile(passwordOrUrl) {
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found!');
    process.exit(1);
  }

  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Check if it's a full DATABASE_URL or just a password
  let databaseUrl;
  let dbPassword;
  
  if (passwordOrUrl.startsWith('postgresql://') || passwordOrUrl.startsWith('postgres://')) {
    // It's a full DATABASE_URL
    databaseUrl = passwordOrUrl;
    try {
      const url = new URL(databaseUrl);
      dbPassword = url.password;
    } catch (error) {
      console.error('❌ Invalid DATABASE_URL format:', error.message);
      process.exit(1);
    }
  } else {
    // It's just a password, construct the DATABASE_URL
    dbPassword = passwordOrUrl;
    databaseUrl = `postgresql://${renderConfig.username}:${dbPassword}@${renderConfig.hostname}:${renderConfig.port}/${renderConfig.database}`;
  }

  // Validate the hostname in the URL
  try {
    const url = new URL(databaseUrl);
    if (url.hostname.startsWith('dpg-') && !url.hostname.includes('.')) {
      console.error('❌ ERROR: Hostname in DATABASE_URL is incomplete!');
      console.error('   Hostname:', url.hostname);
      console.error('   Expected format: dpg-xxxxx-a.oregon-postgres.render.com');
      process.exit(1);
    }
    console.log('✅ Hostname looks correct:', url.hostname);
  } catch (error) {
    console.error('❌ Error parsing DATABASE_URL:', error.message);
    process.exit(1);
  }

  // Update or add DATABASE_URL
  if (envContent.includes('DATABASE_URL=')) {
    // Replace existing DATABASE_URL
    envContent = envContent.replace(/DATABASE_URL=.*/g, `DATABASE_URL=${databaseUrl}`);
  } else {
    // Add DATABASE_URL after Database Configuration comment
    const dbConfigIndex = envContent.indexOf('# Database Configuration');
    if (dbConfigIndex !== -1) {
      const insertIndex = envContent.indexOf('\n', dbConfigIndex) + 1;
      envContent = envContent.slice(0, insertIndex) + `DATABASE_URL=${databaseUrl}\n` + envContent.slice(insertIndex);
    } else {
      // Add at the beginning
      envContent = `DATABASE_URL=${databaseUrl}\n\n${envContent}`;
    }
  }

  // Also update individual DB_* variables for Render
  const renderDbConfig = `
# Render Database Configuration (uncomment to use)
# DB_HOST=${renderConfig.hostname}
# DB_PORT=${renderConfig.port}
# DB_USERNAME=${renderConfig.username}
# DB_PASSWORD=${dbPassword}
# DB_NAME=${renderConfig.database}
`;

  // Check if Render config comment exists, if not add it
  if (!envContent.includes('# Render Database Configuration')) {
    // Add after DATABASE_URL or at the end of database config section
    const dbConfigEnd = envContent.indexOf('DB_NAME=');
    if (dbConfigEnd !== -1) {
      const lineEnd = envContent.indexOf('\n', dbConfigEnd);
      envContent = envContent.slice(0, lineEnd + 1) + renderDbConfig + envContent.slice(lineEnd + 1);
    }
  }

  // Write updated content
  fs.writeFileSync(envPath, envContent, 'utf8');
  
  console.log('\n✅ .env file updated successfully!');
  console.log('\n📋 Updated configuration:');
  console.log(`   DATABASE_URL=${databaseUrl.replace(/:[^:@]+@/, ':****@')}`);
  console.log('\n💡 To use the Render database:');
  console.log('   1. Make sure DATABASE_URL is uncommented (it should be now)');
  console.log('   2. Or uncomment the Render Database Configuration section');
  console.log('   3. Restart your server');
}

// Main execution
if (process.argv.length < 3) {
  console.log('📚 Usage:');
  console.log('   node scripts/update-render-db-config.js <password>');
  console.log('   node scripts/update-render-db-config.js <full-database-url>');
  console.log('\n💡 To get your database password:');
  console.log('   1. Go to Render dashboard');
  console.log('   2. Click on your PostgreSQL database (school_db)');
  console.log('   3. Go to "Connections" tab');
  console.log('   4. Copy the "Internal Database URL" or just the password');
  console.log('\n📝 Example:');
  console.log('   node scripts/update-render-db-config.js your_password_here');
  console.log('   node scripts/update-render-db-config.js postgresql://user:pass@host:port/db');
  process.exit(1);
}

const input = process.argv[2];
updateEnvFile(input);


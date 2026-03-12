/**
 * Script to fix incomplete Render.com database hostname
 * This script helps identify and fix the DATABASE_URL or DB_HOST issue
 */

require('dotenv').config();

console.log('🔍 Checking database configuration...\n');

// Check for DATABASE_URL
if (process.env.DATABASE_URL) {
  console.log('📋 Found DATABASE_URL environment variable');
  try {
    const url = new URL(process.env.DATABASE_URL);
    const hostname = url.hostname;
    console.log('   Current hostname:', hostname);
    
    if (hostname.startsWith('dpg-') && !hostname.includes('.')) {
      console.log('\n❌ ERROR: Hostname is incomplete!');
      console.log('   Missing domain suffix');
      
      // Try to construct the full hostname
      // Based on render.yaml, region is "oregon"
      const fullHostname = `${hostname}.oregon-postgres.render.com`;
      console.log('\n💡 Suggested fix:');
      console.log(`   Full hostname should be: ${fullHostname}`);
      
      // Construct new DATABASE_URL
      const newUrl = new URL(process.env.DATABASE_URL);
      newUrl.hostname = fullHostname;
      const newDatabaseUrl = newUrl.toString();
      
      console.log('\n📝 Add this to your .env file:');
      console.log(`DATABASE_URL=${newDatabaseUrl}`);
      console.log('\n⚠️  Note: If your Render database is in a different region,');
      console.log('   you may need to adjust the domain (e.g., .singapore-postgres.render.com)');
      console.log('   Check your Render dashboard for the correct Internal Database URL');
    } else {
      console.log('✅ Hostname looks complete');
    }
  } catch (error) {
    console.error('❌ Error parsing DATABASE_URL:', error.message);
  }
} else {
  console.log('📋 DATABASE_URL not found, checking individual DB_* variables...');
  
  const dbHost = process.env.DB_HOST;
  if (dbHost) {
    console.log('   DB_HOST:', dbHost);
    
    if (dbHost.startsWith('dpg-') && !dbHost.includes('.')) {
      console.log('\n❌ ERROR: DB_HOST is incomplete!');
      console.log('   Missing domain suffix');
      
      // Try to construct the full hostname
      const fullHostname = `${dbHost}.oregon-postgres.render.com`;
      console.log('\n💡 Suggested fix:');
      console.log(`   Update DB_HOST in .env file to: ${fullHostname}`);
      console.log('\n📝 Update your .env file:');
      console.log(`DB_HOST=${fullHostname}`);
      console.log('\n⚠️  Note: If your Render database is in a different region,');
      console.log('   you may need to adjust the domain');
      console.log('   Check your Render dashboard for the correct hostname');
    } else if (dbHost === 'localhost') {
      console.log('\nℹ️  DB_HOST is set to localhost');
      console.log('   If you\'re trying to connect to Render, you need to set the Render hostname');
    } else {
      console.log('✅ DB_HOST looks complete');
    }
  } else {
    console.log('   DB_HOST not set');
  }
}

console.log('\n📚 How to get the correct hostname from Render:');
console.log('   1. Go to your Render dashboard');
console.log('   2. Click on your PostgreSQL database');
console.log('   3. Go to "Connections" tab');
console.log('   4. Copy the "Internal Database URL"');
console.log('   5. Use that as your DATABASE_URL in .env file');


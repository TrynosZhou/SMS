/**
 * Diagnostic script to identify database connection issues
 * This will help find where the incomplete hostname is coming from
 */

require('dotenv').config();

console.log('🔍 Database Connection Diagnostic Tool\n');
console.log('=' .repeat(60));

// Check environment variables
console.log('\n📋 Environment Variables:');
console.log('   DATABASE_URL:', process.env.DATABASE_URL ? 'SET (hidden)' : 'NOT SET');
console.log('   DB_HOST:', process.env.DB_HOST || 'NOT SET');
console.log('   DB_PORT:', process.env.DB_PORT || 'NOT SET');
console.log('   DB_USERNAME:', process.env.DB_USERNAME || 'NOT SET');
console.log('   DB_NAME:', process.env.DB_NAME || 'NOT SET');
console.log('   DB_PASSWORD:', process.env.DB_PASSWORD ? 'SET (hidden)' : 'NOT SET');

// Parse DATABASE_URL if set
if (process.env.DATABASE_URL) {
  console.log('\n🔗 Parsing DATABASE_URL...');
  try {
    const url = new URL(process.env.DATABASE_URL);
    console.log('   Protocol:', url.protocol);
    console.log('   Hostname:', url.hostname);
    console.log('   Port:', url.port || '5432 (default)');
    console.log('   Username:', url.username);
    console.log('   Database:', url.pathname.slice(1));
    
    if (url.hostname.startsWith('dpg-') && !url.hostname.includes('.')) {
      console.log('\n❌ PROBLEM FOUND: Hostname in DATABASE_URL is incomplete!');
      console.log('   Current:', url.hostname);
      console.log('   Expected:', `${url.hostname}.oregon-postgres.render.com`);
      console.log('\n💡 Fix: Update DATABASE_URL with the full hostname');
    } else if (url.hostname.includes('.')) {
      console.log('✅ Hostname looks complete');
    }
  } catch (error) {
    console.error('❌ Error parsing DATABASE_URL:', error.message);
  }
}

// Check DB_HOST
if (process.env.DB_HOST) {
  console.log('\n🏠 Checking DB_HOST...');
  const hostname = process.env.DB_HOST;
  console.log('   Value:', hostname);
  
  if (hostname.startsWith('dpg-') && !hostname.includes('.')) {
    console.log('\n❌ PROBLEM FOUND: DB_HOST is incomplete!');
    console.log('   Current:', hostname);
    console.log('   Expected:', `${hostname}.oregon-postgres.render.com`);
    console.log('\n💡 Fix: Update DB_HOST in .env file or environment variables');
  } else if (hostname.includes('.') || hostname === 'localhost' || hostname.startsWith('127.')) {
    console.log('✅ DB_HOST looks valid');
  } else {
    console.log('⚠️  DB_HOST format is unusual');
  }
}

// Check system environment (Windows)
console.log('\n🖥️  System Environment (if accessible):');
try {
  // Try to check if there are system-level env vars overriding
  const { execSync } = require('child_process');
  try {
    const sysDbHost = execSync('echo %DB_HOST%', { shell: 'cmd', encoding: 'utf8' }).trim();
    if (sysDbHost && sysDbHost !== '%DB_HOST%') {
      console.log('   System DB_HOST:', sysDbHost);
      if (sysDbHost.startsWith('dpg-') && !sysDbHost.includes('.')) {
        console.log('   ❌ System DB_HOST is incomplete!');
      }
    }
  } catch (e) {
    // Ignore if not accessible
  }
} catch (e) {
  // Ignore
}

// Summary and recommendations
console.log('\n' + '='.repeat(60));
console.log('\n📝 Summary & Recommendations:\n');

const issues = [];
if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    if (url.hostname.startsWith('dpg-') && !url.hostname.includes('.')) {
      issues.push('DATABASE_URL has incomplete hostname');
    }
  } catch (e) {}
}

if (process.env.DB_HOST && process.env.DB_HOST.startsWith('dpg-') && !process.env.DB_HOST.includes('.')) {
  issues.push('DB_HOST has incomplete hostname');
}

if (issues.length === 0) {
  console.log('✅ No obvious issues found in environment variables');
  console.log('   If you\'re still getting connection errors, check:');
  console.log('   1. Database is running and accessible');
  console.log('   2. Network/firewall settings');
  console.log('   3. Credentials are correct');
} else {
  console.log('❌ Issues found:');
  issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));
  console.log('\n💡 Next steps:');
  console.log('   1. Get your database password from Render dashboard');
  console.log('   2. Run: node scripts/update-render-db-config.js <password>');
  console.log('   3. Or manually update .env file with full hostname');
  console.log('   4. See FIX-DATABASE-CONNECTION.md for detailed instructions');
}

console.log('\n');


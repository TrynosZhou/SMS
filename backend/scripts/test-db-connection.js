/**
 * Test database connection script
 * This will try to connect and show the exact error
 */

require('dotenv').config();
const { Client } = require('pg');

async function testConnection() {
  console.log('🔍 Testing Database Connection...\n');
  
  let connectionUrl = process.env.DATABASE_URL;
  if (!connectionUrl) {
    console.error('❌ DATABASE_URL not set in environment variables');
    process.exit(1);
  }

  // Parse and display connection info (hide password)
  try {
    const url = new URL(connectionUrl);
    console.log('📋 Connection Details:');
    console.log('   Host:', url.hostname);
    console.log('   Port:', url.port || '5432');
    console.log('   Username:', url.username);
    console.log('   Database:', url.pathname.slice(1));
    console.log('   SSL: Required (auto-detected for hosted DB)\n');
  } catch (e) {
    console.error('❌ Error parsing DATABASE_URL:', e.message);
    process.exit(1);
  }

  // Test with SSL enabled (required for Render.com)
  const client = new Client({
    connectionString: connectionUrl,
    ssl: {
      rejectUnauthorized: false, // Render.com requires SSL but uses self-signed certs
    },
    connectionTimeoutMillis: 10000, // 10 second timeout
  });

  console.log('⏳ Attempting to connect...');
  
  try {
    await client.connect();
    console.log('✅ Connection successful!\n');
    
    // Test a simple query
    console.log('⏳ Testing query...');
    const result = await client.query('SELECT NOW(), version()');
    console.log('✅ Query successful!');
    console.log('   Server time:', result.rows[0].now);
    console.log('   PostgreSQL version:', result.rows[0].version.split(',')[0]);
    
    await client.end();
    console.log('\n✅ All tests passed! Database is accessible.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Connection failed!');
    console.error('   Error code:', error.code);
    console.error('   Error message:', error.message);
    
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      console.error('\n💡 Possible causes:');
      console.error('   1. Database is paused (Render free tier databases pause after inactivity)');
      console.error('      → Go to Render dashboard and wake up the database');
      console.error('   2. Using Internal Database URL from local machine');
      console.error('      → Use External Database URL for local connections');
      console.error('   3. Firewall/network blocking the connection');
      console.error('   4. Database host is unreachable');
    } else if (error.code === '28P01') {
      console.error('\n💡 Authentication failed - check your username and password');
      console.error('   → Verify credentials in Render dashboard');
    } else if (error.code === '3D000') {
      console.error('\n💡 Database does not exist');
      console.error('   → Check database name in DATABASE_URL');
    } else if (error.message?.includes('SSL')) {
      console.error('\n💡 SSL connection issue');
      console.error('   → Render.com requires SSL connections');
    }
    
    process.exit(1);
  }
}

testConnection();


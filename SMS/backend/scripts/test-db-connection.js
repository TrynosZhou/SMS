const { exec } = require('child_process');
const dns = require('dns');

console.log('🔍 Testing Database Connection...\n');

// Test DNS resolution
const hostname = 'dpg-d5evptur433s7391emu0-a.oregon-postgres.render.com';
console.log(`1. Testing DNS resolution for: ${hostname}`);

dns.lookup(hostname, (err, address, family) => {
  if (err) {
    console.log('   ❌ DNS Resolution FAILED');
    console.log(`   Error: ${err.message}`);
    console.log('\n💡 Possible Solutions:');
    console.log('   - The Render database might be paused (free tier)');
    console.log('   - Check your Render dashboard and wake up the database');
    console.log('   - Verify the hostname is correct in your .env file');
    console.log('   - The database might have been deleted or moved');
    console.log('\n📋 To fix:');
    console.log('   1. Go to https://dashboard.render.com');
    console.log('   2. Find your PostgreSQL database');
    console.log('   3. Click "Resume" if it\'s paused');
    console.log('   4. Copy the new Internal Database URL');
    console.log('   5. Update DATABASE_URL in your .env file');
  } else {
    console.log(`   ✅ DNS Resolution SUCCESS`);
    console.log(`   IP Address: ${address}`);
    console.log(`   Family: IPv${family}`);
    console.log('\n2. Testing TCP connection...');
    
    // Try to connect using net module
    const net = require('net');
    const socket = new net.Socket();
    
    socket.setTimeout(5000);
    
    socket.on('connect', () => {
      console.log('   ✅ TCP Connection SUCCESS');
      console.log('   The database host is reachable');
      socket.destroy();
    });
    
    socket.on('timeout', () => {
      console.log('   ⚠️  Connection TIMEOUT');
      console.log('   The host might be unreachable or firewall is blocking');
      socket.destroy();
    });
    
    socket.on('error', (err) => {
      console.log('   ❌ TCP Connection FAILED');
      console.log(`   Error: ${err.message}`);
    });
    
    socket.connect(5432, hostname);
  }
});

// Test ping (if available)
console.log('\n3. Testing network connectivity...');
exec(`ping -n 1 ${hostname}`, (error, stdout, stderr) => {
  if (error) {
    console.log('   ⚠️  Ping test unavailable or failed');
  } else {
    console.log('   ✅ Network connectivity test completed');
  }
});

console.log('\n📝 Current Configuration:');
console.log('   Hostname:', hostname);
console.log('   Port: 5432');
console.log('   Database: school_db_primary_loib');
console.log('   Username: school_db_primary_loib_user');

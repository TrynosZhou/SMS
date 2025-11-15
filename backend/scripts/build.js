const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Find TypeScript compiler
const tscPath = path.join(__dirname, '..', 'node_modules', 'typescript', 'bin', 'tsc');

// Check if TypeScript is installed
if (!fs.existsSync(tscPath)) {
  console.error('❌ TypeScript not found at:', tscPath);
  console.error('Please run: npm install');
  process.exit(1);
}

try {
  console.log('🔨 Building TypeScript...');
  execSync(`node "${tscPath}"`, { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  console.log('✅ Build completed successfully!');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}


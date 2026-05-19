const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

/**
 * Usage (PowerShell):
 *   $env:PARENT_URL="https://sms-apua.vercel.app/"
 *   $env:PARENT_USERNAME="parent@example.com"
 *   $env:PARENT_PASSWORD="secret"
 *   npm run screenshots:parent
 *
 * Screenshots will be saved to docs/branding as:
 *  - screenshot-signin.png
 *  - screenshot-signup.png (if link exists)
 *  - screenshot-link-student.png (if menu exists)
 *  - screenshot-report-card.png (if menu exists)
 *  - screenshot-statement.png (if menu exists)
 *  - screenshot-messages.png (if menu exists)
 */

function outPath(name) {
  const dir = path.join(process.cwd(), 'docs', 'branding');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}

const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function safeClick(page, text) {
  const found = await page.evaluate((needle) => {
    const t = String(needle).toLowerCase();
    const els = Array.from(document.querySelectorAll('a,button,[role="button"]'));
    const el = els.find(e => (e.textContent || '').toLowerCase().includes(t));
    if (el) {
      el.click();
      return true;
    }
    return false;
  }, text);
  return !!found;
}

async function typeIfExists(page, selectors, value) {
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) {
      await el.click({ clickCount: 3 }).catch(() => {});
      await el.type(value, { delay: 20 });
      return true;
    }
  }
  return false;
}

async function run() {
  const URL = process.env.PARENT_URL || 'http://localhost:4200/';
  const USERNAME = process.env.PARENT_USERNAME || '';
  const PASSWORD = process.env.PARENT_PASSWORD || '';
  if (!USERNAME || !PASSWORD) {
    console.error('Missing PARENT_USERNAME or PARENT_PASSWORD environment variables.');
    process.exit(1);
  }

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    // Visit landing/signin
    await page.goto(URL, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: outPath('screenshot-signin.png'), fullPage: true });

    // Try to capture Sign Up view if link exists
    const signUpClicked = await safeClick(page, 'sign up') || await safeClick(page, 'create account') || await safeClick(page, 'register');
    if (signUpClicked) {
      await delay(1500);
      await page.screenshot({ path: outPath('screenshot-signup.png'), fullPage: true }).catch(() => {});
      // Go back to sign-in
      await page.goBack({ waitUntil: 'networkidle2' }).catch(() => {});
    }

    // Attempt generic login
    await typeIfExists(page, [
      'input[name="username"]',
      'input[name="email"]',
      'input[placeholder*="Email" i]',
      'input[placeholder*="Username" i]',
      'input[type="text"]'
    ], USERNAME);
    await typeIfExists(page, [
      'input[name="password"]',
      'input[placeholder*="Password" i]',
      'input[type="password"]'
    ], PASSWORD);
    // Click login button
    const clickedLogin = await safeClick(page, 'sign in') || await safeClick(page, 'login') || await safeClick(page, 'log in');
    if (!clickedLogin) {
      // Try pressing Enter on password
      const pwd = await page.$('input[type="password"]');
      if (pwd) {
        await pwd.press('Enter');
      }
    }
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await delay(1500);
    await page.screenshot({ path: outPath('screenshot-dashboard.png'), fullPage: true }).catch(() => {});

    // Try to navigate to Link Student
    if (await safeClick(page, 'link student') || await safeClick(page, 'link learners') || await safeClick(page, 'link child')) {
      await delay(1500);
      await page.screenshot({ path: outPath('screenshot-link-student.png'), fullPage: true }).catch(() => {});
    } else {
      // Try direct routes commonly used (safe concatenation)
      const tryRoutes = ['parent/link-student', 'link-student'];
      for (const r of tryRoutes) {
        const base = URL.endsWith('/') ? URL : URL + '/';
        await page.goto(base + r, { waitUntil: 'networkidle2' }).catch(() => {});
        await delay(800);
        await page.screenshot({ path: outPath('screenshot-link-student.png'), fullPage: true }).catch(() => {});
        break;
      }
    }

    // Report Card
    if (await safeClick(page, 'report card') || await safeClick(page, 'results')) {
      await delay(1500);
      await page.screenshot({ path: outPath('screenshot-report-card.png'), fullPage: true }).catch(() => {});
    }

    // Statements / Invoices
    if (await safeClick(page, 'statement') || await safeClick(page, 'invoice')) {
      await delay(1500);
      await page.screenshot({ path: outPath('screenshot-statement.png'), fullPage: true }).catch(() => {});
    }

    // Messages
    if (await safeClick(page, 'messages') || await safeClick(page, 'inbox')) {
      await delay(1500);
      await page.screenshot({ path: outPath('screenshot-messages.png'), fullPage: true }).catch(() => {});
    }

    console.log('Screenshots saved to docs/branding');
  } catch (err) {
    console.error('Failed to capture screenshots:', err.message || err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();

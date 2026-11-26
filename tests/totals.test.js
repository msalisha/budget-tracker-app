/* Checks that the figures at the top of the Budget tab (Bills, Spending, Still to pay, Left over)
   match the lines listed underneath, on later months, after a bill is added from an earlier month.
   Made-up data only.

   Run from the repository folder:  node tests/totals.test.js
   Needs Python 3 (to serve the folder) and Playwright (require('playwright') must work). */
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const ROOT = path.join(__dirname, '..'), PORT = 8000 + Math.floor(Math.random() * 900);
const nextKey = k => { let [y, m] = k.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return y + '-' + String(m).padStart(2, '0'); };
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const labelOf = k => MON[Number(k.slice(5)) - 1] + ' ' + k.slice(0, 4);

// Twelve made-up months. Amounts with cents, one bill whose amount changes part-way, a ticked line,
// and one month that already has a bill with the name being added.
const KEYS = []; for (let k = '2026-11'; KEYS.length < 12; k = nextKey(k)) KEYS.push(k);
const months = {};
KEYS.forEach((k, n) => {
  const items = [
    { id: 'b1', name: 'Rent', amount: 1450, section: 'bills', paid: false },
    { id: 'b2', name: 'Phone plan', amount: 41.13, section: 'bills', paid: false },
    { id: 'b3', name: 'Streaming', amount: 5.99, section: 'bills', paid: false },
    { id: 'b4', name: 'Insurance', amount: n < 3 ? 86.35 : 95, section: 'bills', paid: false },
    { id: 'b5', name: 'Loan', amount: 283.45, section: 'bills', paid: n === 0 },
    { id: 's1', name: 'Groceries', amount: 600, section: 'spending', paid: false },
    { id: 's2', name: 'Pet food', amount: 37.46, section: 'spending', paid: false },
  ];
  if (k === '2027-04') items.splice(5, 0, { id: 'bx', name: 'gym', amount: 40, section: 'bills', paid: false });
  months[k] = { label: labelOf(k), income: 4200, items };
});
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-test-')), backup = path.join(dir, 'backup.json');
fs.writeFileSync(backup, JSON.stringify({ app: 'budget-tracker', version: 1, months, debts: {}, archive: {}, assets: {} }));

let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failed++; };
const cents = s => { const n = Math.round(Number(String(s).replace(/[^0-9.]/g, '')) * 100); return /[−-]/.test(s) ? -n : n; };

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  const browser = await chromium.launch();
  try {
    await new Promise(r => setTimeout(r, 800));
    const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const page = await ctx.newPage(), errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));

    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForSelector('#welcomeImport');
    await page.setInputFiles('#importFile', backup);
    await page.waitForSelector('#budgetView:not([hidden])');
    await page.selectOption('#month', KEYS[0]);

    // Compare the top of the screen with the lines on screen (unticked lines only)
    const summary = async (when, expectGym) => {
      const r = await page.evaluate(() => {
        const sum = sel => [...document.querySelectorAll(sel + ' li.item:not(.paid) .amt')].map(i => i.value);
        return { month: document.getElementById('month').value, income: document.getElementById('income').value,
          bills: sum('#lBills'), spend: sum('#lSpend'), names: [...document.querySelectorAll('#lBills .name')].map(i => i.value),
          sBills: document.getElementById('sBills').textContent, sSpend: document.getElementById('sSpend').textContent,
          sTodo: document.getElementById('sTodo').textContent, left: document.getElementById('left').textContent };
      });
      const b = r.bills.reduce((t, v) => t + cents(v), 0), s = r.spend.reduce((t, v) => t + cents(v), 0);
      const inc = cents(r.income), gym = r.names.filter(n => n.toLowerCase() === 'gym').length;
      check(cents(r.sBills) === b, `${when}, ${r.month}: Bills at top ${r.sBills} = lines ${(b / 100).toFixed(2)}`);
      check(cents(r.sSpend) === s, `${when}, ${r.month}: Spending at top ${r.sSpend} = lines ${(s / 100).toFixed(2)}`);
      check(cents(r.sTodo) === b + s, `${when}, ${r.month}: Still to pay ${r.sTodo} = ${((b + s) / 100).toFixed(2)}`);
      check(cents(r.left) === inc - b - s, `${when}, ${r.month}: Left over ${r.left} = ${((inc - b - s) / 100).toFixed(2)}`);
      if (expectGym !== undefined) check(gym === 1 && r.names.includes(expectGym), `${when}, ${r.month}: exactly one gym bill listed`);
      return b;
    };

    const before = {};
    for (const k of [KEYS[1], KEYS[4], KEYS[10]]) { await page.selectOption('#month', k); before[k] = await summary('before adding'); }
    await page.selectOption('#month', KEYS[0]);

    // Add a bill from the first month, the way the form is used: focus stays in the name box
    await page.fill('#addName', 'Gym'); await page.fill('#addAmt', '8.65'); await page.selectOption('#addSec', 'bills');
    await page.press('#addAmt', 'Enter');
    await page.waitForFunction(() => !document.getElementById('toast').hidden && /^Added Gym/.test(document.getElementById('toast').textContent));
    check(await page.evaluate(() => document.activeElement.id) === 'addName', 'focus is back in the name box after adding');
    await summary('straight after adding', 'Gym');

    // Straight on to later months with the › arrow, then with the month picker
    await page.click('#next');
    const b1 = await summary('› arrow', 'Gym');
    check(b1 === before[KEYS[1]] + 865, `${KEYS[1]}: Bills went up by exactly $8.65`);
    await page.click('#next'); await summary('› arrow', 'Gym');
    await page.focus('#addName');
    await page.selectOption('#month', KEYS[4]);
    check(await summary('month picker', 'Gym') === before[KEYS[4]] + 865, `${KEYS[4]}: Bills went up by exactly $8.65`);
    await page.selectOption('#month', '2027-04'); await summary('month picker', 'gym');   // already had one: skipped
    await page.selectOption('#month', KEYS[10]); await summary('month picker', 'Gym');

    // After a reload, opening later months straight away
    await page.reload(); await page.waitForSelector('#budgetView:not([hidden])');
    await summary('after reload', 'Gym');
    for (const k of [KEYS[1], KEYS[4], KEYS[10], KEYS[11]]) { await page.selectOption('#month', k); const b = await summary('after reload', 'Gym');
      if (before[k] !== undefined) check(b === before[k] + 865, `${k}: Bills still up by exactly $8.65 after reload`); }

    check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  } finally {
    await browser.close(); server.kill(); fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

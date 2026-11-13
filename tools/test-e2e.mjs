// End-to-end test: several browsers share a room through a local mock relay.
//   npm test            (needs Playwright with Chromium available)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { serve } from './serve.mjs';
import { mockRelay } from './mock-relay.mjs';

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { ({ chromium } = createRequire('/')('playwright')); }

const WEB = 8931;
const RELAY = 8932;
const url = `http://localhost:${WEB}/?relays=ws://localhost:${RELAY}#e2e-room`;
const server = await serve(WEB);
let relay = mockRelay(RELAY);
const browser = await chromium.launch();
const problems = [];

async function open(name) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${name}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_CONNECTION/.test(m.text())) problems.push(`[${name}] ${m.text()}`); });
  await page.goto(url);
  return page;
}

async function join(page, name, password = 'correct horse') {
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Join room' }).click();
}

async function step(title, fn) {
  const t = Date.now();
  await fn();
  console.log(`ok  ${title} (${Date.now() - t} ms)`);
}

const notes = (page) => page.getByLabel(/^Notes for/);
const tab = (page, name) => page.getByRole('button', { name, exact: false }).first();

let a = await open('A');
let b;

await step('create a password-protected room with the default scenario tabs', async () => {
  await join(a, 'Alice');
  await a.waitForSelector('.app');
  await assert.doesNotReject(a.waitForFunction(() => document.querySelectorAll('.tab:not(.add)').length === 8));
  assert.match(await a.locator('.chip.room').innerText(), /e2e-room$/);
  assert.equal(await a.locator('.chip.room .lock').count(), 1);
});

await step('a second player joins and gets questions, answers and presence', async () => {
  await tab(a, '4 Zero Chill').click();
  await a.getByLabel('Add questions').fill('1-3');
  await a.getByLabel('Add questions').press('Enter');
  await a.getByLabel('Question 1', { exact: true }).fill('Hostname of the workstation?');
  await a.getByLabel('Answer 1', { exact: true }).fill('WKS-FROTH-07');
  await a.getByLabel('Answer 1', { exact: true }).press('Enter');
  b = await open('B');
  await join(b, 'Bob');
  await b.waitForSelector('.app');
  await tab(b, '4 Zero Chill').click();
  await b.waitForFunction(() => document.querySelectorAll('.q-row').length === 3);
  assert.equal(await b.getByLabel('Answer 1', { exact: true }).inputValue(), 'WKS-FROTH-07');
  await a.waitForSelector('.people .avatar[title="Bob"]');
  await b.waitForSelector('.people .avatar[title="Alice"]');
  await a.waitForSelector('.tab.on .pip');
});

await step('taking a question shows the owner and a running timer to the team', async () => {
  await a.locator('.q-row').nth(1).getByRole('button', { name: 'Take' }).click();
  await b.waitForSelector('.q-row:nth-child(2).is-working .avatar[title^="Alice"]');
  await b.waitForSelector('.q-row:nth-child(2) .q-time');
  await a.locator('.q-row').nth(1).getByRole('button', { name: 'Done' }).click();
  await b.waitForSelector('.q-row:nth-child(2).is-done');
  await b.waitForFunction(() => document.querySelector('.tab.on .tab-count').textContent === '1/3');
});

await step('indicators are typed, de-duplicated and shared', async () => {
  await b.getByLabel('Add indicators').fill('10.0.2.15 scanner\nWKS-FROTH-07\nevil-ads[.]example\n44d88612fea8a8f36de82e1278abb02f\nu: mkraeusen\nd:\\temp\\loot.zip');
  await b.getByLabel('Add indicators').press('Enter');
  await a.waitForFunction(() => document.querySelectorAll('.ioc-row').length === 6);
  const rows = await a.locator('.ioc-row').evaluateAll((els) => els.map((el) => [el.querySelector('.ioc-type').value, el.querySelector('.ioc-value').textContent]));
  const types = Object.fromEntries(rows.map(([t, v]) => [v, t]));
  assert.deepEqual(types, {
    '10.0.2.15': 'ip', 'WKS-FROTH-07': 'host', 'evil-ads.example': 'domain',
    '44d88612fea8a8f36de82e1278abb02f': 'hash', mkraeusen: 'user', 'd:\\temp\\loot.zip': 'file',
  });
  await a.getByLabel('Add indicators').fill('10.0.2.15');
  await a.getByLabel('Add indicators').press('Enter');
  await a.waitForTimeout(400);
  assert.equal(await a.locator('.ioc-row').count(), 6);
  await a.locator('.ioc-row', { hasText: '10.0.2.15' }).getByRole('button', { name: 'SPL' }).click();
  const spl = await a.evaluate(() => navigator.clipboard.readText());
  assert.match(spl, /^index IN \(main, frothxly\) "10\.0\.2\.15"\n\| stats count min\(_time\)/);
});

await step('two people typing in the same notes at once converge', async () => {
  await notes(a).click();
  await notes(b).click();
  await Promise.all([
    a.keyboard.type('alpha one two three. ', { delay: 25 }),
    b.keyboard.type('bravo four five six. ', { delay: 25 }),
  ]);
  await a.waitForFunction(() => /alpha one two three\. /.test(document.querySelector('.notes textarea').value) && /bravo four five six\. /.test(document.querySelector('.notes textarea').value));
  await b.waitForFunction((v) => document.querySelector('.notes textarea').value === v, await notes(a).inputValue());
  await notes(a).press('End');
  await a.keyboard.type('\nsecond line from Alice');
  await b.waitForFunction(() => document.querySelector('.notes textarea').value.endsWith('second line from Alice'));
});

await step('a wrong password is refused', async () => {
  const c = await open('C');
  await join(c, 'Carol', 'wrong');
  await c.waitForSelector('.join-error');
  assert.match(await c.locator('.join-error').innerText(), /Wrong password/);
  assert.equal(await c.locator('.app').count(), 0);
  await c.context().close();
});

await step('the cheat sheet opens, jumps to a hunt and fills in the scenario indexes', async () => {
  await a.locator('body').click({ position: { x: 4, y: 500 } });
  await a.keyboard.press('c');
  await a.waitForSelector('.sheet:not([hidden]) .sheet-body h3');
  await a.locator('.hunt', { hasText: 'H19' }).click();
  await a.waitForFunction(() => {
    const h = [...document.querySelectorAll('.sheet-body h3')].find((x) => x.textContent.startsWith('H19.'));
    const box = h && h.getBoundingClientRect();
    return box && box.top > 0 && box.top < 400;
  });
  const h0 = await a.locator('.sheet-body section', { hasText: 'H0. Orientation' }).locator('pre code').first().innerText();
  assert.match(h0, /where index IN \(main, frothxly\) by index sourcetype/);
  await a.getByLabel('Search the cheat sheet').fill('kerberos');
  await a.waitForFunction(() => document.querySelectorAll('.sheet-body > section:not([hidden])').length === 0);
  await a.getByLabel('Search the cheat sheet').fill('lsass');
  await a.waitForFunction(() => { const n = document.querySelectorAll('.sheet-body > section:not([hidden])').length; return n >= 1 && n < 5; });
  await a.locator('.sheet-body > section:not([hidden]) .copy-btn').first().click();
  assert.match(await a.evaluate(() => navigator.clipboard.readText()), /index IN \(main, frothxly\)/);
  await a.getByLabel('Search the cheat sheet').press('Escape');
  await a.keyboard.press('c');
  await a.waitForSelector('.sheet', { state: 'hidden' });
});

await step('the game clock is shared', async () => {
  await a.locator('.timer summary').click();
  await a.locator('.timer-panel').getByRole('button', { name: 'Start' }).click();
  await b.waitForFunction(() => /^3:59:\d\d$/.test((document.querySelector('.timer-num') || {}).textContent || ''));
});

await step('edits made while the relay is down sync after it returns, deletions included', async () => {
  await relay.close();
  await a.waitForSelector('.chip.is-off');
  await a.locator('.ioc-row', { hasText: 'mkraeusen' }).getByTitle('Delete indicator').click();
  await a.getByLabel('Add questions').fill('7 asked while offline');
  await a.getByLabel('Add questions').press('Enter');
  await b.getByLabel('Add indicators').fill('offline.example');
  await b.getByLabel('Add indicators').press('Enter');
  relay = mockRelay(RELAY);
  await a.waitForSelector('.chip.is-live', { timeout: 30000 });
  await b.waitForSelector('.chip.is-live', { timeout: 30000 });
  await b.waitForFunction(() => document.querySelectorAll('.q-row').length === 4, null, { timeout: 30000 });
  await a.waitForFunction(() => [...document.querySelectorAll('.ioc-value')].some((x) => x.textContent === 'offline.example'), null, { timeout: 30000 });
  await b.waitForFunction(() => ![...document.querySelectorAll('.ioc-value')].some((x) => x.textContent === 'mkraeusen'), null, { timeout: 40000 });
});

await step('a deletion on its own, made while offline, still reaches the team', async () => {
  await relay.close();
  await a.waitForSelector('.chip.is-off');
  await a.locator('.ioc-row', { hasText: 'offline.example' }).getByTitle('Delete indicator').click();
  relay = mockRelay(RELAY);
  await b.waitForFunction(() => ![...document.querySelectorAll('.ioc-value')].some((x) => x.textContent === 'offline.example'), null, { timeout: 60000 });
});

await step('a field that was only focused does not overwrite a teammate', async () => {
  await a.getByLabel('Answer 3', { exact: true }).focus();
  await b.getByLabel('Answer 3', { exact: true }).fill('from-bob');
  await b.getByLabel('Answer 3', { exact: true }).press('Enter');
  await a.waitForTimeout(900);
  await a.getByLabel('Add questions').focus();
  await a.waitForFunction(() => document.querySelector('[aria-label="Answer 3"]').value === 'from-bob');
  await b.waitForTimeout(700);
  assert.equal(await b.getByLabel('Answer 3', { exact: true }).inputValue(), 'from-bob');
});

await step('a reload returns to the room without asking for the password', async () => {
  await a.reload();
  await a.waitForSelector('.app');
  await a.waitForFunction(() => document.querySelectorAll('.q-row').length === 4);
  assert.equal(await a.locator('.tab.on .tab-name').innerText(), '4 Zero Chill');
  assert.match(await notes(a).inputValue(), /second line from Alice$/);
});

await step('the Markdown export contains answers, indicators and notes', async () => {
  await a.locator('summary', { hasText: 'Menu' }).click();
  const [dl] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: 'Export notes as Markdown' }).click()]);
  const md = await readFile(await dl.path(), 'utf8');
  assert.match(md, /\| 1 \| Hostname of the workstation\? \| `WKS-FROTH-07` \| Open \|/);
  assert.match(md, /\| ip \| `10\.0\.2\.15` \|/);
  assert.match(md, /second line from Alice/);
});

await step('someone who joins after everyone left still gets the notes', async () => {
  await a.locator('summary', { hasText: 'Menu' }).click();
  await a.getByRole('button', { name: 'Leave room', exact: true }).click();
  await a.waitForSelector('.join-card');
  await b.locator('summary', { hasText: 'Menu' }).click();
  await b.getByRole('button', { name: 'Leave room', exact: true }).click();
  await b.waitForTimeout(1500);
  const d = await open('D');
  await join(d, 'Dana');
  await d.waitForSelector('.app');
  await tab(d, '4 Zero Chill').click();
  await d.waitForFunction(() => document.querySelectorAll('.q-row').length === 4);
  assert.match(await notes(d).inputValue(), /alpha one two three\./);
  assert.equal(await d.locator('.people .alone').count(), 1);
});

await browser.close();
server.close();
await relay.close();
if (problems.length) {
  console.error('Browser errors:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('all passed');

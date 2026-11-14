// End-to-end test: several browsers share a room through a local mock relay.
//   npm test            (needs Playwright with Chromium available)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { serve } from './serve.mjs';
import { mockRelay } from './mock-relay.mjs';
import * as Y from 'yjs';

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { ({ chromium } = createRequire('/')('playwright')); }

const WEB = 8931;
const RELAY = 8932;
const url = `http://localhost:${WEB}/?relays=ws://localhost:${RELAY}#e2e-room`;
const server = await serve(WEB);
let relay = mockRelay(RELAY);
const browser = await chromium.launch();
const problems = [];

async function open(name, target = url) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${name}] ${e.message}`));
  // The 404 is the deliberately broken image in the sanitizer test.
  page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_CONNECTION|status of 404/.test(m.text())) problems.push(`[${name}] ${m.text()}`); });
  await page.goto(target);
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

await step('time on questions is logged per person and kept after they are answered', async () => {
  // Question 2 was taken and finished by Alice in the previous step.
  await b.waitForSelector('.q-row:nth-child(2) .q-time.spent');
  // Bob works on question 3 and gets stuck; Alice picks it up, then releases it.
  await b.locator('.q-row').nth(2).getByRole('button', { name: 'Take' }).click();
  await b.waitForTimeout(1200);
  await b.getByLabel('Status of question 3').selectOption('stuck');
  await a.waitForSelector('.q-row:nth-child(3).is-stuck');
  await a.locator('.q-row').nth(2).getByRole('button', { name: 'Take' }).click();
  await a.waitForTimeout(1200);
  await a.getByLabel('Status of question 3').selectOption('open');
  await a.waitForFunction(() => /^0:0[2-9]$/.test((document.querySelector('.q-row:nth-child(3) .q-time.spent') || {}).textContent || ''));

  await b.locator('summary', { hasText: 'Menu' }).click();
  await b.getByRole('button', { name: 'Time log' }).click();
  await b.waitForSelector('dialog.timelog[open]');
  // The dialog is live: wait until Alice's release has arrived here.
  await b.waitForFunction(() => { const rows = document.querySelectorAll('.tl-table tbody tr'); return rows.length === 3 && rows[2].cells[6].textContent.trim() === 'Released'; });
  const rows = await b.locator('.tl-table tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((td) => td.textContent.trim())));
  assert.deepEqual(rows.map((r) => [r[1], r[2], r[4], r[6]]), [
    ['4 Zero Chill', '2', 'Alice', 'Done'], ['4 Zero Chill', '3', 'Bob', 'Stuck'], ['4 Zero Chill', '3', 'Alice', 'Released'],
  ]);
  assert.ok(rows.every((r) => /^0:0\d$/.test(r[5])), JSON.stringify(rows));
  assert.deepEqual(await b.locator('.tl-groups').first().locator('.tl-chip span:nth-child(2)').allInnerTexts(), ['Alice', 'Bob']);
  const [dl] = await Promise.all([b.waitForEvent('download'), b.getByRole('button', { name: 'Download CSV' }).click()]);
  const csv = (await readFile(await dl.path(), 'utf8')).trim().split('\r\n');
  assert.equal(csv[0], 'scenario,question,title,who,started,ended,seconds,result,estimated');
  assert.match(csv[2], /^"4 Zero Chill","3","","Bob","20\d\d-[^"]+Z","20\d\d-[^"]+Z","[1-9]","Stuck",""$/);
  await b.keyboard.press('Escape');
  await b.waitForSelector('dialog.timelog', { state: 'detached' });
});

await step('questions answered before the log existed get an estimate, marked as such', async () => {
  // An old room: answered questions only kept the time they were taken.
  const old = new Y.Doc();
  const t0 = Date.now() - 3 * 3600000;
  [[1, 0, 'done'], [2, 12, 'done'], [3, 20, 'done']].forEach(([n, minute, status]) => {
    const q = new Y.Map();
    old.getMap('questions').set('legacy' + n, q);
    q.set('s', 's5'); q.set('n', n); q.set('title', 'Old question ' + n); q.set('answer', 'x');
    q.set('status', status); q.set('owner', 'Alice'); q.set('started', t0 + minute * 60000);
  });
  const backup = JSON.stringify({ app: 'bots-notepad', update: Buffer.from(Y.encodeStateAsUpdate(old)).toString('base64') });
  await a.locator('input[type="file"][accept*="json"]').setInputFiles({ name: 'old.backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await tab(a, '5 Threat Intel').click();
  await a.waitForFunction(() => document.querySelectorAll('.q-row').length === 3);
  assert.deepEqual(await a.locator('.q-row').evaluateAll((els) => els.map((el) => (el.querySelector('.q-time') || {}).textContent || '')), ['≈12:00', '≈8:00', '']);
  await a.locator('.questions .panel-head').getByRole('button', { name: /tracked$/ }).click();
  await a.waitForSelector('dialog.timelog[open]');
  const times = await a.locator('.tl-table tbody tr').evaluateAll((trs) => trs.map((tr) => tr.cells[5].textContent.trim()));
  assert.deepEqual(times.slice(0, 3), ['≈12:00', '≈8:00', '—']);
  assert.match(await a.locator('dialog.timelog .fine').innerText(), /estimate/);
  await a.getByRole('button', { name: 'Close the time log' }).click();
  await tab(a, '4 Zero Chill').click();
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

await step('a wrong password is refused even seconds after a room is created', async () => {
  const fresh = url.replace('#e2e-room', '#e2e-fresh-room');
  const x = await open('X', fresh);
  await join(x, 'Xena', 'right');
  await x.waitForSelector('.app');
  const y = await open('Y', fresh);
  await join(y, 'Yann', 'wrong');
  await y.waitForSelector('.join-error');
  assert.equal(await y.locator('.app').count(), 0);
  const z = await open('Z', fresh);
  await join(z, 'Zoe', 'right');
  await z.waitForSelector('.app');
  await z.waitForSelector('.people .avatar[title="Xena"]');
  for (const page of [x, y, z]) await page.context().close();
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
  await a.getByLabel('Search the cheat sheet').fill('');
  await a.getByLabel('Search the cheat sheet').press('Escape');
  await a.keyboard.press('c');
  await a.waitForSelector('.sheet', { state: 'hidden' });
});

await step('cheat sheets are written, edited live, sanitized, copied, imported, hidden and deleted in the room', async () => {
  const manage = async (page, item) => {
    await page.locator('.sheet summary', { hasText: 'Manage' }).click();
    await page.locator('.sheet .menu-list').getByRole('button', { name: item }).click();
  };
  const titles = (page) => page.evaluate(() => [...document.querySelectorAll('.sheet-doc option')].map((o) => o.textContent));
  await a.getByRole('button', { name: 'Cheat sheet', exact: true }).click();
  await b.getByRole('button', { name: 'Cheat sheet', exact: true }).click();
  await a.waitForSelector('.sheet:not([hidden])');

  // Write a new sheet, with hostile HTML in it.
  await manage(a, 'New cheat sheet');
  await a.getByLabel('Cheat sheet title').fill('Team playbook');
  await a.getByLabel('Cheat sheet title').press('Enter');
  const editor = a.getByLabel('Cheat sheet Markdown');
  await editor.fill('# Team playbook\n\n## H99. Team hunt\n\n```\nindex=* sourcetype=team:log\n```\n\n<img src="x" onerror="window.__xss=1"><script>window.__xss=1</script><a href="javascript:window.__xss=1">bad</a>\n');
  await a.waitForFunction(() => [...document.querySelectorAll('.sheet-body h2')].some((x) => x.textContent === 'H99. Team hunt'));

  // The teammate sees it rendered, with indexes filled in and nothing executable.
  await b.waitForFunction(() => [...document.querySelectorAll('.sheet-doc option')].some((o) => o.textContent === 'Team playbook'));
  await b.locator('.sheet-doc').selectOption({ label: 'Team playbook' });
  await b.waitForFunction(() => /index IN \(main, frothxly\) sourcetype=team:log/.test((document.querySelector('.sheet-body pre code') || {}).textContent || ''));
  for (const page of [a, b]) {
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await page.locator('.sheet-body [onerror], .sheet-body script, .sheet-body a[href^="javascript"]').count(), 0);
  }

  // Edits show up in the teammate's rendered view while typing.
  await editor.press('Control+End');
  await a.keyboard.type('\n## Added live\n');
  await b.waitForFunction(() => [...document.querySelectorAll('.sheet-body h2')].some((x) => x.textContent === 'Added live'));
  await a.locator('.sheet-head').getByRole('button', { name: 'Done' }).click();
  assert.equal(await editor.count(), 0);

  // A hunt chip finds its section in a room sheet.
  await a.locator('.sheet-doc').selectOption({ label: 'BOTS v10 hunting cheat sheet' });
  await a.locator('.scenario-head').getByRole('button', { name: 'Edit' }).click();
  await a.locator('.scenario-head .s-field input').fill('H19 H99');
  await a.locator('.scenario-head').getByRole('button', { name: 'Done' }).click();
  await a.locator('.hunt', { hasText: 'H99' }).click();
  await a.waitForFunction(() => document.querySelector('.sheet-doc').selectedOptions[0].textContent === 'Team playbook');

  // Copy the built-in sheet to edit it, then delete the copy.
  await a.locator('.sheet-doc').selectOption({ label: 'BOTS v10 hunting cheat sheet' });
  await a.locator('.sheet-head').getByRole('button', { name: 'Edit a copy' }).click();
  await a.waitForSelector('.sheet.editing');
  assert.match(await editor.inputValue(), /^# BOTS v10 Hunting Cheat Sheet/);
  await b.waitForFunction(() => document.querySelectorAll('.sheet-doc optgroup[label="This room"] option').length === 2);
  a.once('dialog', (d) => d.accept());
  await manage(a, 'Delete this sheet');
  await b.waitForFunction(() => document.querySelectorAll('.sheet-doc optgroup[label="This room"] option').length === 1);
  assert.equal(await a.locator('.sheet.editing').count(), 0);

  // Import a file.
  await a.locator('.sheet input[type="file"]').setInputFiles({ name: 'osint.md', mimeType: 'text/markdown', buffer: Buffer.from('# OSINT kit\n\n## Tabs\n\n- VirusTotal\n') });
  await b.waitForFunction(() => [...document.querySelectorAll('.sheet-doc option')].some((o) => o.textContent === 'OSINT kit'));
  await a.waitForFunction(() => (document.querySelector('.sheet-body h1') || {}).textContent === 'OSINT kit');

  // Hide and restore the built-in sheet for the room.
  await a.locator('.sheet-doc').selectOption({ label: 'BOTS v10 hunting cheat sheet' });
  await manage(a, 'Hide this built-in sheet');
  await b.waitForFunction(() => !document.querySelector('.sheet-doc optgroup[label="Built in"]'));
  await manage(b, /Show hidden built-in sheets/);
  await a.waitForFunction(() => !!document.querySelector('.sheet-doc optgroup[label="Built in"]'));
  assert.deepEqual(await titles(a), ['Team playbook', 'OSINT kit', 'BOTS v10 hunting cheat sheet']);

  for (const page of [a, b]) {
    await page.getByRole('button', { name: 'Close the cheat sheet' }).click();
    await page.waitForSelector('.sheet', { state: 'hidden' });
  }
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

await step('the dark mode toggle switches the theme and survives a reload', async () => {
  const bg = () => a.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const before = await bg();
  await a.getByRole('button', { name: /^Switch to (light|dark) mode$/ }).click();
  const after = await bg();
  assert.notEqual(after, before);
  const chosen = await a.evaluate(() => document.documentElement.dataset.theme);
  assert.match(chosen, /^(light|dark)$/);
  await a.reload();
  await a.waitForSelector('.app');
  assert.equal(await a.evaluate(() => document.documentElement.dataset.theme), chosen);
  assert.equal(await bg(), after);
  await a.getByRole('button', { name: /^Switch to (light|dark) mode$/ }).click();
  assert.equal(await bg(), before);
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

await step('a new room starts from the chosen template, and a room can be saved as one', async () => {
  const t = await open('T', url.replace('#e2e-room', '#e2e-ctf'));
  await t.getByLabel('Template').selectOption({ label: 'Jeopardy CTF' });
  await join(t, 'Tess', 'pw');
  await t.waitForSelector('.app');
  assert.deepEqual(await t.locator('.tab-name').allInnerTexts(), ['General', 'Web', 'Pwn', 'Reversing', 'Crypto', 'Forensics', 'OSINT', 'Misc']);

  // A non-Splunk template: no index field, no SPL button, no built-in sheet.
  assert.equal(await t.locator('.scenario-head .s-field').count(), 0);
  await t.getByLabel('Add indicators').fill('10.9.8.7');
  await t.getByLabel('Add indicators').press('Enter');
  await t.waitForSelector('.ioc-row');
  assert.equal(await t.locator('.ioc-row').getByRole('button', { name: 'SPL' }).count(), 0);
  await t.getByRole('button', { name: 'Cheat sheet', exact: true }).click();
  await t.waitForSelector('.sheet:not([hidden])');
  assert.equal(await t.locator('.sheet-doc option').count(), 0);

  // Give the room a sheet, questions and an answer, then save it as a template.
  await t.locator('.sheet summary', { hasText: 'Manage' }).click();
  await t.locator('.sheet .menu-list').getByRole('button', { name: 'New cheat sheet' }).click();
  await t.getByLabel('Cheat sheet title').fill('Web tricks');
  await t.getByLabel('Cheat sheet title').press('Enter');
  await t.locator('.sheet-head').getByRole('button', { name: 'Done' }).click();
  await t.getByRole('button', { name: 'Close the cheat sheet' }).click();
  await tab(t, 'Web').click();
  await t.getByLabel('Add questions').fill('1-2');
  await t.getByLabel('Add questions').press('Enter');
  await t.getByLabel('Question 1', { exact: true }).fill('Login bypass');
  await t.getByLabel('Answer 1', { exact: true }).fill('flag{secret}');
  await t.getByLabel('Answer 1', { exact: true }).press('Enter');
  await t.locator('summary', { hasText: 'Menu' }).click();
  await t.getByRole('button', { name: 'Save as template…' }).click();
  const dialog = t.locator('dialog.save-template');
  await dialog.getByLabel('Template name').fill('Team CTF');
  await dialog.getByLabel(/^Question list/).check();
  const [dl] = await Promise.all([t.waitForEvent('download'), dialog.getByRole('button', { name: 'Download as a file' }).click()]);
  const file = await readFile(await dl.path(), 'utf8');
  const saved = JSON.parse(file);
  assert.equal(saved.name, 'Team CTF');
  assert.equal(saved.splunk, false);
  assert.deepEqual(saved.tabs.map((x) => x.name), ['General', 'Web', 'Pwn', 'Reversing', 'Crypto', 'Forensics', 'OSINT', 'Misc']);
  assert.deepEqual(saved.tabs[1].questions, [{ n: 1, title: 'Login bypass' }, { n: 2, title: '' }]);
  assert.deepEqual(saved.sheets.map((x) => x.title), ['Web tricks']);
  assert.ok(!file.includes('flag{secret}') && !file.includes('10.9.8.7'), 'answers and indicators must stay out of a template');
  await dialog.getByRole('button', { name: 'Save in this browser' }).click();
  await t.waitForSelector('dialog.save-template', { state: 'detached' });

  // Start another room from the saved template.
  await t.locator('summary', { hasText: 'Menu' }).click();
  await t.getByRole('button', { name: 'Leave room', exact: true }).click();
  await t.waitForSelector('.join-card');
  await t.getByLabel('Room', { exact: true }).fill('e2e-ctf-two');
  await t.getByLabel('Template').selectOption({ label: 'Team CTF' });
  await join(t, 'Tess', 'pw');
  await t.waitForSelector('.app');
  await tab(t, 'Web').click();
  await t.waitForFunction(() => document.querySelectorAll('.q-row').length === 2);
  assert.equal(await t.getByLabel('Question 1', { exact: true }).inputValue(), 'Login bypass');
  assert.equal(await t.getByLabel('Answer 1', { exact: true }).inputValue(), '');
  assert.equal(await t.locator('.ioc-row').count(), 0);
  await t.getByRole('button', { name: 'Cheat sheet', exact: true }).click();
  await t.waitForFunction(() => [...document.querySelectorAll('.sheet-doc option')].map((o) => o.textContent).join() === 'Web tricks');

  // A teammate imports the file on the join screen.
  const u = await open('U', url.replace('#e2e-room', '#e2e-ctf-three'));
  await u.locator('.join-card input[type="file"]').setInputFiles({ name: 'team-ctf.template.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  await u.waitForFunction(() => document.querySelector('select[aria-label="Template"]').selectedOptions[0].textContent === 'Team CTF');
  await join(u, 'Uma', 'pw');
  await u.waitForSelector('.app');
  assert.equal(await u.locator('.tab-name').count(), 8);
  assert.equal(await u.locator('.tab-name').nth(1).innerText(), 'Web');
  for (const page of [t, u]) await page.context().close();
});

await step('someone who joins after everyone left still gets the notes', async () => {
  await a.locator('summary', { hasText: 'Menu' }).click();
  await a.getByRole('button', { name: 'Leave room', exact: true }).click();
  await a.waitForSelector('.join-card');
  await b.locator('summary', { hasText: 'Menu' }).click();
  await b.getByRole('button', { name: 'Leave room', exact: true }).click();
  await b.waitForTimeout(1500);
  const d = await open('D');
  // The room exists, so the template picked here must be ignored.
  await d.getByLabel('Template').selectOption({ label: 'Blank' });
  await join(d, 'Dana');
  await d.waitForSelector('.app');
  await tab(d, '4 Zero Chill').click();
  await d.waitForFunction(() => document.querySelectorAll('.q-row').length === 4);
  assert.match(await notes(d).inputValue(), /alpha one two three\./);
  assert.equal(await d.locator('.people .alone').count(), 1);
  assert.equal(await d.locator('.tab-name').count(), 8);
});

await browser.close();
server.close();
await relay.close();
if (problems.length) {
  console.error('Browser errors:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('all passed');

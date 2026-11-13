import { Y, h, render, useState, useEffect, useLayoutEffect, useRef, htm, marked } from '../vendor/vendor.js';
import { CONFIG } from './config.js';
import { Room, deriveKeys, keysFromBits, normRoom, forgetRoom, b64, unb64 } from './sync.js';
import { TYPES, parseIndicators, parseQuestions, indexClause, pivotSpl } from './indicators.js';

const html = htm.bind(h);
const uid = () => Math.random().toString(36).slice(2, 12);

// ---------------------------------------------------------------- small helpers

const PALETTE = ['#6aa9ff', '#4cc38a', '#f0b429', '#f27a9b', '#b58cff', '#3cc6c6', '#ff9d5c', '#a6c34c'];

function colorFor(name) {
  let n = 0;
  for (const ch of name || '?') n = (n * 31 + ch.codePointAt(0)) >>> 0;
  return PALETTE[n % PALETTE.length];
}

const initials = (name) => (name || '?').trim().split(/\s+/).map((w) => [...w][0]).join('').slice(0, 2).toUpperCase();

function store(area, key, value) {
  try {
    if (value === undefined) return area.getItem(key);
    if (value === null) area.removeItem(key); else area.setItem(key, value);
  } catch { /* storage blocked: the app still works for this tab */ }
  return null;
}

let toastTimer;
function toast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

async function copy(text, what = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(what);
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  const hrs = Math.floor(s / 3600);
  return hrs ? `${hrs}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

function useTick(ms, on = true) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms, on]);
}

// Re-render when the shared document, the peer list or the connection changes.
function useRoom(room) {
  const [, set] = useState(0);
  useEffect(() => {
    let queued = false;
    const bump = () => {
      if (queued) return;
      queued = true;
      setTimeout(() => { queued = false; set((n) => n + 1); }, 30);
    };
    room.doc.on('update', bump);
    const off = [room.on('peers', bump), room.on('status', bump)];
    return () => { room.doc.off('update', bump); off.forEach((f) => f()); };
  }, [room]);
}

// Closes a <details> menu when clicking elsewhere or pressing Escape.
function useDismiss(ref) {
  useEffect(() => {
    const close = (e) => {
      const el = ref.current;
      if (el && el.open && (e.type === 'keydown' ? e.key === 'Escape' : !el.contains(e.target))) el.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, []);
}

// ---------------------------------------------------------------- inputs

// A text input over a shared value. Typing is local until a short pause, so
// remote edits to other fields never move the caret.
function Field({ value, onCommit, inputRef, ...rest }) {
  const [draft, setDraft] = useState(null);
  const timer = useRef(0);
  const shown = draft === null ? (value || '') : draft;
  return html`<input ...${rest} ref=${inputRef} value=${shown}
    onInput=${(e) => {
      const v = e.target.value;
      setDraft(v);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => onCommit(v), 350);
    }}
    onBlur=${() => {
      clearTimeout(timer.current);
      // Only what was typed is written back; a field that was merely focused
      // must not overwrite a teammate's newer value.
      if (draft !== null && draft !== (value || '')) onCommit(draft);
      setDraft(null);
    }}
    onKeyDown=${(e) => { if (e.key === 'Enter' && !e.isComposing) e.target.blur(); }} />`;
}

const ICONS = {
  copy: 'M5.5 5.5v-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2m-8-5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z',
  close: 'M4 4l8 8M12 4l-8 8',
  expand: 'M6 3H3v3M10 13h3v-3M3 3l4 4M13 13l-4-4',
  dock: 'M7 4v3H4M9 12V9h3M7 7L3 3M9 9l4 4',
  sun: 'M8 5.2a2.8 2.8 0 1 0 0 5.6a2.8 2.8 0 0 0 0-5.6zM8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1',
  moon: 'M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z',
};

function Icon({ name }) {
  return html`<svg class="ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d=${ICONS[name]} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
}

// Binds a <textarea> to a Y.Text: local edits become minimal insert/delete
// operations, remote edits are applied without losing the caret.
function bindTextarea(el, ytext) {
  let last = ytext.toString();
  let composing = false;
  let missed = false;
  el.value = last;

  const pushLocal = () => {
    const now = el.value;
    if (now === last) return;
    let start = 0;
    const max = Math.min(last.length, now.length);
    while (start < max && last[start] === now[start]) start++;
    let endOld = last.length;
    let endNew = now.length;
    while (endOld > start && endNew > start && last[endOld - 1] === now[endNew - 1]) { endOld--; endNew--; }
    last = now;
    ytext.doc.transact(() => {
      if (endOld > start) ytext.delete(start, endOld - start);
      if (endNew > start) ytext.insert(start, now.slice(start, endNew));
    }, el);
  };

  const pullRemote = (delta) => {
    let a = el.selectionStart;
    let b = el.selectionEnd;
    let i = 0;
    for (const op of delta || []) {
      if (op.retain) i += op.retain;
      else if (op.insert) {
        const n = op.insert.length;
        if (i < a) a += n;
        if (i < b) b += n;
        i += n;
      } else if (op.delete) {
        a -= Math.min(op.delete, Math.max(0, a - i));
        b -= Math.min(op.delete, Math.max(0, b - i));
      }
    }
    const top = el.scrollTop;
    last = ytext.toString();
    el.value = last;
    if (document.activeElement === el) el.setSelectionRange(a, b);
    el.scrollTop = top;
  };

  const observer = (event, tx) => {
    if (tx.origin === el) return;
    // Rewriting the value would cancel an IME composition (Japanese input),
    // so remote edits wait until it ends.
    if (composing) { missed = true; return; }
    pullRemote(event.delta);
  };

  const onInput = () => { if (!composing) pushLocal(); };
  const onStart = () => { composing = true; };
  const onEnd = () => {
    composing = false;
    if (!missed) { pushLocal(); return; }
    // The shared text moved while composing: replay what was typed onto it.
    missed = false;
    const now = el.value;
    let start = 0;
    const max = Math.min(last.length, now.length);
    while (start < max && last[start] === now[start]) start++;
    let endOld = last.length;
    let endNew = now.length;
    while (endOld > start && endNew > start && last[endOld - 1] === now[endNew - 1]) { endOld--; endNew--; }
    const typed = now.slice(start, endNew);
    const current = ytext.toString();
    // Anchor on the text that followed the caret, falling back to the offset.
    const tail = last.slice(endOld, endOld + 24);
    let at = tail ? current.indexOf(tail, Math.max(0, start - 200)) : -1;
    if (at < 0) at = Math.min(start, current.length);
    ytext.doc.transact(() => { if (typed) ytext.insert(at, typed); }, el);
    last = ytext.toString();
    el.value = last;
    el.setSelectionRange(at + typed.length, at + typed.length);
  };

  ytext.observe(observer);
  el.addEventListener('input', onInput);
  el.addEventListener('compositionstart', onStart);
  el.addEventListener('compositionend', onEnd);
  return () => {
    ytext.unobserve(observer);
    el.removeEventListener('input', onInput);
    el.removeEventListener('compositionstart', onStart);
    el.removeEventListener('compositionend', onEnd);
  };
}

function SharedText({ ytext, inputRef, ...rest }) {
  const own = useRef();
  const ref = inputRef || own;
  // Layout effect: the text is in place before the first paint.
  useLayoutEffect(() => bindTextarea(ref.current, ytext), [ytext]);
  return html`<textarea ...${rest} ref=${ref} spellcheck=${false}></textarea>`;
}

// ---------------------------------------------------------------- theme

const lightQuery = matchMedia('(prefers-color-scheme: light)');
const activeTheme = () => document.documentElement.dataset.theme || (lightQuery.matches ? 'light' : 'dark');

// Starts on the system setting; a click pins the other theme for this browser.
function ThemeToggle() {
  const [theme, setTheme] = useState(activeTheme);
  useEffect(() => {
    const onSystem = () => setTheme(activeTheme());
    lightQuery.addEventListener('change', onSystem);
    return () => lightQuery.removeEventListener('change', onSystem);
  }, []);
  const next = theme === 'dark' ? 'light' : 'dark';
  return html`<button type="button" class="chip theme" title=${`Switch to ${next} mode`} aria-label=${`Switch to ${next} mode`}
    onClick=${() => { document.documentElement.dataset.theme = next; store(localStorage, 'bn.theme', next); setTheme(next); }}>
    <${Icon} name=${next === 'light' ? 'sun' : 'moon'} />
  </button>`;
}

// ---------------------------------------------------------------- join screen

function Join({ initialRoom, busy, error, onJoin, onForget }) {
  const [name, setName] = useState(store(localStorage, 'bn.name') || '');
  const [room, setRoom] = useState(initialRoom || store(localStorage, 'bn.room') || '');
  const [password, setPassword] = useState('');
  const secure = !!(window.crypto && crypto.subtle);
  const form = useRef();
  useEffect(() => {
    const empty = [...form.current.querySelectorAll('input')].find((el) => !el.value);
    if (empty) empty.focus();
  }, []);
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || !room.trim() || busy) return;
    onJoin({ name: name.trim(), room, password });
  };
  return html`
    <main class="join">
      <${ThemeToggle} />
      <form class="join-card" ref=${form} onSubmit=${submit}>
        <h1>${CONFIG.appName}</h1>
        <p class="lede">A shared notepad for a Boss of the SOC team: questions, answers, indicators and notes, in sync for everyone in the room.</p>
        <label>Your name
          <input value=${name} onInput=${(e) => setName(e.target.value)} placeholder="Alice" maxlength="24" autocomplete="nickname" required />
        </label>
        <label>Room
          <input value=${room} onInput=${(e) => setRoom(e.target.value)} placeholder="red-team-tokyo" maxlength="48" autocapitalize="off" spellcheck=${false} required />
        </label>
        <label><span>Password <span class="optional">optional</span></span>
          <input type="password" value=${password} onInput=${(e) => setPassword(e.target.value)} placeholder="Leave empty for an open room" autocomplete="off" />
        </label>
        ${error && html`<div class="join-error" role="alert">
          <p>${error.message}</p>
          ${error.code === 'local-mismatch' && html`<button type="button" class="link" onClick=${() => onForget(room)}>Delete the copy saved in this browser</button>`}
        </div>`}
        ${!secure && html`<div class="join-error" role="alert"><p>This page must be opened over https (or localhost) for encryption to work.</p></div>`}
        <button class="primary" disabled=${busy || !secure}>${busy ? 'Joining…' : 'Join room'}</button>
        <p class="fine">Teammates join with the same room name and password. Notes are encrypted in the browser with a key derived from both, so anyone without the password sees nothing. There is no reset: a forgotten password means a new room.</p>
      </form>
    </main>`;
}

// ---------------------------------------------------------------- top bar

function Avatar({ name, color, title }) {
  return html`<span class="avatar" style=${{ background: color || colorFor(name) }} title=${title || name}>${initials(name)}</span>`;
}

function SyncStatus({ room }) {
  const ref = useRef();
  useDismiss(ref);
  const st = room.status();
  const live = st.open > 0;
  return html`
    <details class="menu sync" ref=${ref}>
      <summary class=${'chip ' + (live ? 'is-live' : 'is-off')} title="Connection details">
        <span class="dot"></span>${live ? 'Live' : 'Offline'}
      </summary>
      <div class="menu-panel sync-panel">
        <p>${live
          ? `Connected to ${st.open} of ${st.total} relays. Edits reach teammates within a second.`
          : 'No relay reachable. Edits are kept in this browser and sync when the connection returns.'}</p>
        ${st.foreign > 0 && html`<p class="warn-text">Someone is using this room name with a different password. You cannot see each other's notes.</p>`}
        <ul class="relay-list">
          ${st.relays.map((r) => html`<li key=${r.url}>
            <span class=${'dot ' + r.state}></span>
            <span class="relay-url">${r.url.replace(/^wss?:\/\//, '')}</span>
            <span class="relay-note">${r.state === 'open' ? (r.rejected ? `${r.rejected} rejected` : 'ok') : r.state}</span>
          </li>`)}
        </ul>
        <p class="fine">${st.persisted ? 'An encrypted copy is saved in this browser.' : 'This browser is not saving a local copy (private window?).'}
          ${' '}${st.stored ? 'A snapshot is stored on the relays for teammates who join later.' : ''}</p>
      </div>
    </details>`;
}

function GameTimer({ meta }) {
  const ref = useRef();
  useDismiss(ref);
  const end = meta.get('timerEnd') || 0;
  useTick(1000, !!end);
  const [minutes, setMinutes] = useState(CONFIG.gameMinutes);
  const left = end - Date.now();
  const cls = !end ? '' : left <= 0 ? 'is-over' : left < 15 * 60000 ? 'is-late' : 'is-running';
  return html`
    <details class="menu timer" ref=${ref}>
      <summary class=${'chip ' + cls} title="Shared game clock">
        ${end ? html`<span class="timer-num">${left > 0 ? clock(left) : 'Time'}</span>` : 'Start clock'}
      </summary>
      <div class="menu-panel timer-panel">
        <p>${end ? 'The clock is shared: everyone in the room sees the same countdown.' : 'Start a countdown that everyone in the room sees.'}</p>
        <label class="inline">Minutes
          <input type="number" min="1" max="1440" value=${minutes} onInput=${(e) => setMinutes(+e.target.value || 0)} />
        </label>
        <div class="row">
          <button class="primary" onClick=${() => { if (minutes > 0) { meta.set('timerEnd', Date.now() + minutes * 60000); ref.current.open = false; } }}>${end ? 'Restart' : 'Start'}</button>
          ${end ? html`<button onClick=${() => { meta.delete('timerEnd'); ref.current.open = false; }}>Clear</button>` : null}
        </div>
      </div>
    </details>`;
}

// ---------------------------------------------------------------- questions

const STATUS = { open: 'Open', working: 'Working', done: 'Done', stuck: 'Stuck' };

function Questions({ room, scenario, me, addRef }) {
  const questions = room.doc.getMap('questions');
  const rows = [];
  for (const [id, q] of questions) if (q.get('s') === scenario.id) rows.push({ id, q, n: q.get('n') || 0 });
  rows.sort((a, b) => a.n - b.n || a.id.localeCompare(b.id));
  useTick(1000, rows.some((r) => r.q.get('status') === 'working'));
  const [flash, setFlash] = useState(null);
  const listRef = useRef();
  const done = rows.filter((r) => r.q.get('status') === 'done').length;

  const add = (text) => {
    const next = rows.reduce((m, r) => Math.max(m, r.n), 0) + 1;
    const parsed = parseQuestions(text, next);
    let dup = null;
    room.doc.transact(() => {
      for (const item of parsed) {
        const existing = rows.find((r) => r.n === item.n);
        if (existing) { dup = existing.id; continue; }
        const q = new Y.Map();
        q.set('s', scenario.id);
        q.set('n', item.n);
        q.set('title', item.title);
        q.set('answer', '');
        q.set('status', 'open');
        questions.set(uid(), q);
      }
    });
    if (dup) { setFlash(dup); setTimeout(() => setFlash(null), 900); }
  };

  const setStatus = (q, status, id) => {
    room.doc.transact(() => {
      q.set('status', status);
      if (status === 'working') { q.set('owner', me.name); q.set('started', Date.now()); }
      if (status === 'open') { q.delete('owner'); q.delete('started'); }
      if (status === 'done' && !q.get('owner')) q.set('owner', me.name);
    });
    if (status === 'working' && id) {
      setTimeout(() => { const el = listRef.current && listRef.current.querySelector(`[data-q="${id}"] .q-answer`); if (el) el.focus(); }, 60);
    }
  };

  return html`
    <section class="panel questions">
      <header class="panel-head">
        <h2>Questions</h2>
        <span class="count">${rows.length ? `${done}/${rows.length} answered` : ''}</span>
        <input class="quick" ref=${addRef} placeholder="Add: 12 · 1-15 · 12 which IP scanned the site?" aria-label="Add questions"
          onKeyDown=${(e) => {
            if (e.key === 'Enter' && !e.isComposing && e.target.value.trim()) { add(e.target.value); e.target.value = ''; }
          }} />
      </header>
      <div class="rows" ref=${listRef}>
        ${rows.length === 0 && html`<p class="empty">No questions yet. Type <kbd>1-15</kbd> above to create a block, then take one so teammates see who is on what.</p>`}
        ${rows.map(({ id, q, n }) => {
          const status = q.get('status') || 'open';
          const owner = q.get('owner');
          const elapsed = status === 'working' && q.get('started') ? Date.now() - q.get('started') : 0;
          const over = elapsed > CONFIG.timeboxMinutes * 60000;
          return html`
            <div key=${id} data-q=${id} class=${`q-row is-${status}${flash === id ? ' flash' : ''}`}>
              <span class="q-num">${n}</span>
              <${Field} class="q-title" value=${q.get('title')} title=${q.get('title') || null} placeholder="Question" aria-label=${`Question ${n}`} onCommit=${(v) => q.set('title', v)} />
              <${Field} class="q-answer mono" value=${q.get('answer')} placeholder="Answer" aria-label=${`Answer ${n}`} onCommit=${(v) => q.set('answer', v)} />
              <button class="icon" title="Copy answer" aria-label=${`Copy answer ${n}`} disabled=${!q.get('answer')} onClick=${() => copy(q.get('answer'), 'Answer copied')}><${Icon} name="copy" /></button>
              <span class="q-who">
                ${owner ? html`<${Avatar} name=${owner} title=${`${owner}${status === 'working' ? ' is on it' : ''}`} />` : null}
                ${status === 'working' ? html`<span class=${'q-time' + (over ? ' over' : '')} title=${over ? `Over the ${CONFIG.timeboxMinutes}-minute time-box: take the hint, swap or move on` : 'Time on this question'}>${clock(elapsed)}</span>` : null}
              </span>
              ${status === 'open' || status === 'stuck'
                ? html`<button class="q-act" onClick=${() => setStatus(q, 'working', id)}>Take</button>`
                : status === 'working'
                  ? html`<button class="q-act good" onClick=${() => setStatus(q, 'done')}>Done</button>`
                  : html`<span class="q-act placeholder"></span>`}
              <select class=${'q-status is-' + status} value=${status} aria-label=${`Status of question ${n}`} onChange=${(e) => setStatus(q, e.target.value, id)}>
                ${Object.entries(STATUS).map(([k, label]) => html`<option value=${k}>${label}</option>`)}
              </select>
              <button class="icon danger" title="Delete question" aria-label=${`Delete question ${n}`} onClick=${() => { if (!q.get('answer') && !q.get('title') || confirm(`Delete question ${n}?`)) questions.delete(id); }}><${Icon} name="close" /></button>
            </div>`;
        })}
      </div>
    </section>`;
}

// ---------------------------------------------------------------- indicators

function Indicators({ room, scenario, scenarios, me, addRef }) {
  const iocs = room.doc.getMap('iocs');
  const [filter, setFilter] = useState('');
  const [scope, setScope] = useState('all');
  const [flash, setFlash] = useState(null);
  const byId = new Map(scenarios.map((s) => [s.id, s]));

  const all = [...iocs.entries()].map(([id, m]) => ({ id, m, at: m.get('at') || 0 })).sort((a, b) => b.at - a.at);
  const needle = filter.trim().toLowerCase();
  const rows = all.filter(({ m }) => {
    if (scope === 'here' && m.get('s') !== scenario.id) return false;
    if (!needle) return true;
    return [m.get('v'), m.get('type'), m.get('note'), m.get('first'), m.get('by')].some((x) => (x || '').toLowerCase().includes(needle));
  });

  const add = (text) => {
    let dup = null;
    room.doc.transact(() => {
      for (const item of parseIndicators(text)) {
        const existing = all.find(({ m }) => (m.get('v') || '').toLowerCase() === item.value.toLowerCase());
        if (existing) { dup = existing.id; continue; }
        const m = new Y.Map();
        m.set('v', item.value);
        m.set('type', item.type);
        m.set('note', item.note);
        m.set('first', '');
        m.set('s', scenario.id);
        m.set('by', me.name);
        m.set('at', Date.now());
        iocs.set(uid(), m);
      }
    });
    if (dup) {
      setFilter('');
      setScope('all');
      setFlash(dup);
      setTimeout(() => setFlash(null), 900);
      toast('Already listed');
    }
  };

  return html`
    <section class="panel indicators">
      <header class="panel-head">
        <h2>Indicators</h2>
        <span class="count">${all.length || ''}</span>
        <span class="seg" role="group" aria-label="Indicator scope">
          <button class=${scope === 'all' ? 'on' : ''} onClick=${() => setScope('all')}>All</button>
          <button class=${scope === 'here' ? 'on' : ''} onClick=${() => setScope('here')}>This scenario</button>
        </span>
        <input class="quick filter" type="search" placeholder="Filter" aria-label="Filter indicators" value=${filter} onInput=${(e) => setFilter(e.target.value)} />
      </header>
      <textarea class="ioc-add mono" ref=${addRef} rows="1" spellcheck=${false} aria-label="Add indicators"
        placeholder="Add IP, host, user, hash, domain, key…" title="One per line. The type is detected; u: name or h: host forces one. Enter adds, Shift+Enter makes a new line."
        onKeyDown=${(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            if (e.target.value.trim()) { add(e.target.value); e.target.value = ''; e.target.rows = 1; }
          }
        }}
        onInput=${(e) => { e.target.rows = Math.min(6, e.target.value.split('\n').length); }}></textarea>
      <div class="rows">
        ${all.length === 0 && html`<p class="empty">Every user, host, IP, domain, hash and access key the team finds goes here, so the cloud case and the endpoint case can meet. The type is detected; <kbd>u: name</kbd> or <kbd>h: host</kbd> forces one.</p>`}
        ${all.length > 0 && rows.length === 0 && html`<p class="empty">Nothing matches.</p>`}
        ${rows.map(({ id, m }) => {
          const tagged = byId.get(m.get('s'));
          const value = m.get('v') || '';
          return html`
            <div key=${id} class=${'ioc-row' + (flash === id ? ' flash' : '')}>
              <div class="ioc-main">
                <select class=${'ioc-type t-' + m.get('type')} value=${m.get('type')} aria-label="Type" onChange=${(e) => m.set('type', e.target.value)}>
                  ${TYPES.map((t) => html`<option value=${t}>${t}</option>`)}
                </select>
                <button class="ioc-value mono" title="Copy" onClick=${() => copy(value)}>${value}</button>
                <button class="mini" title="Copy a search that shows where this value appears and when" onClick=${() => copy(pivotSpl(value, (tagged || scenario).indexes), 'Pivot search copied')}>SPL</button>
                <button class="icon danger" title="Delete indicator" aria-label="Delete indicator" onClick=${() => iocs.delete(id)}><${Icon} name="close" /></button>
              </div>
              <div class="ioc-sub">
                <${Field} class="ioc-first" value=${m.get('first')} placeholder="First seen" aria-label="First seen" onCommit=${(v) => m.set('first', v)} />
                <${Field} class="ioc-note" value=${m.get('note')} placeholder="Note" aria-label="Note" onCommit=${(v) => m.set('note', v)} />
                <span class="ioc-meta">${tagged ? tagged.name : ''}${m.get('by') ? ` · ${m.get('by')}` : ''}</span>
              </div>
            </div>`;
        })}
      </div>
    </section>`;
}

// ---------------------------------------------------------------- cheat sheet

// The Markdown comes from this repository, so its HTML is trusted.
function buildSheet(container, markdown) {
  container.innerHTML = marked.parse(markdown);
  container.querySelectorAll('a[href]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
  container.querySelectorAll('table').forEach((table) => {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    table.replaceWith(wrap);
    wrap.append(table);
  });
  container.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code') || pre;
    pre.dataset.src = code.textContent.replace(/\n$/, '');
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    pre.append(btn);
  });
  const toc = [];
  let section = null;
  for (const node of [...container.childNodes]) {
    if (node.nodeType === 1 && /^H[1-3]$/.test(node.tagName)) {
      section = document.createElement('section');
      section.id = 'sheet-' + toc.length;
      toc.push({ id: section.id, level: +node.tagName[1], text: node.textContent });
      container.append(section);
    }
    if (section) section.append(node);
  }
  return toc;
}

function Sheet({ open, expanded, indexes, jump, searchRef, onClose, onExpand }) {
  const [docs, setDocs] = useState([]);
  const [file, setFile] = useState(store(localStorage, 'bn.sheet') || '');
  const [toc, setToc] = useState([]);
  const [query, setQuery] = useState('');
  const [useIndexes, setUseIndexes] = useState(true);
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState('');
  const body = useRef();
  const clause = indexClause(indexes);

  useEffect(() => {
    fetch('cheatsheets/index.json').then((r) => r.json()).then((list) => {
      setDocs(list);
      setFile((f) => (list.some((d) => d.file === f) ? f : list[0] ? list[0].file : ''));
    }).catch(() => setError('Could not load the cheat sheet list.'));
  }, []);

  useEffect(() => {
    if (!file) return;
    setError('');
    fetch('cheatsheets/' + file).then((r) => { if (!r.ok) throw new Error(); return r.text(); }).then((md) => {
      setToc(buildSheet(body.current, md));
      setQuery('');
      body.current.scrollTop = 0;
    }).catch(() => setError('Could not load ' + file));
  }, [file]);

  // Show each search with the current scenario's indexes filled in.
  useEffect(() => {
    if (!body.current) return;
    body.current.querySelectorAll('pre').forEach((pre) => {
      const code = pre.querySelector('code') || pre;
      const text = useIndexes && clause !== 'index=*' ? pre.dataset.src.replace(/\bindex=\*/g, clause) : pre.dataset.src;
      if (code.textContent !== text) code.textContent = text;
    });
  }, [toc, clause, useIndexes]);

  useEffect(() => {
    if (!body.current) return;
    const q = query.trim().toLowerCase();
    let n = 0;
    body.current.querySelectorAll(':scope > section').forEach((sec) => {
      const hit = !q || sec.textContent.toLowerCase().includes(q);
      sec.hidden = !hit;
      if (hit) n++;
    });
    setMatches(q ? n : null);
  }, [query, toc]);

  const goto = (id) => {
    const el = document.getElementById(id);
    if (el) { el.hidden = false; el.scrollIntoView({ block: 'start' }); }
  };

  // A hunt chip was clicked. If the hunt is not in the open document, find the
  // one that has it and switch; this effect then runs again on the new one.
  const handled = useRef(0);
  useEffect(() => {
    if (!jump || handled.current === jump.n || !toc.length) return undefined;
    const has = (text) => text.startsWith(jump.key + '.') || text.startsWith(jump.key + ' ');
    const target = toc.find((t) => has(t.text));
    if (target) {
      handled.current = jump.n;
      setQuery('');
      setTimeout(() => goto(target.id), 0);
      return undefined;
    }
    let stale = false;
    (async () => {
      for (const d of docs) {
        if (d.file === file) continue;
        const md = await fetch('cheatsheets/' + d.file).then((r) => (r.ok ? r.text() : '')).catch(() => '');
        if (stale) return;
        if (md.split('\n').some((line) => /^#{1,3}\s/.test(line) && has(line.replace(/^#+\s+/, '')))) { setFile(d.file); return; }
      }
      handled.current = jump.n;
      toast(`${jump.key} is not in any cheat sheet`);
    })();
    return () => { stale = true; };
  }, [jump, toc]);

  const onBodyClick = (e) => {
    const btn = e.target.closest('.copy-btn');
    if (btn) {
      const code = btn.parentElement.querySelector('code') || btn.parentElement;
      copy(code.textContent.replace(/\n$/, ''), 'Search copied');
      return;
    }
    const inline = e.target.closest('code');
    if (inline && !inline.closest('pre') && !String(getSelection())) copy(inline.textContent);
  };

  return html`
    <aside class=${'sheet' + (expanded ? ' expanded' : '')} hidden=${!open} aria-label="Cheat sheet">
      <header class="sheet-head">
        <select class="sheet-doc" aria-label="Cheat sheet" value=${file} onChange=${(e) => { setFile(e.target.value); store(localStorage, 'bn.sheet', e.target.value); }}>
          ${docs.map((d) => html`<option value=${d.file}>${d.title}</option>`)}
        </select>
        <select class="sheet-toc" aria-label="Jump to section" value="" onChange=${(e) => { if (e.target.value) { setQuery(''); const id = e.target.value; setTimeout(() => goto(id), 0); } e.target.value = ''; }}>
          <option value="">Jump to section…</option>
          ${toc.filter((t) => t.level > 1).map((t) => html`<option value=${t.id}>${t.level === 3 ? ' ' : ''}${t.text}</option>`)}
        </select>
        <button class="icon" title=${expanded ? 'Dock to the side' : 'Use the full width'} aria-label=${expanded ? 'Dock to the side' : 'Use the full width'} onClick=${onExpand}><${Icon} name=${expanded ? 'dock' : 'expand'} /></button>
        <button class="icon" title="Close (c)" aria-label="Close the cheat sheet" onClick=${onClose}><${Icon} name="close" /></button>
        <div class="sheet-tools">
          <input type="search" ref=${searchRef} placeholder="Search the sheet ( / )" aria-label="Search the cheat sheet" value=${query} onInput=${(e) => setQuery(e.target.value)} />
          ${matches !== null && html`<span class="count">${matches} section${matches === 1 ? '' : 's'}</span>`}
          ${clause !== 'index=*' && html`<label class="check" title="Replace index=* in every search with this scenario's indexes">
            <input type="checkbox" checked=${useIndexes} onChange=${(e) => setUseIndexes(e.target.checked)} />
            <code>${clause}</code>
          </label>`}
        </div>
      </header>
      ${error && html`<p class="empty">${error}</p>`}
      <div class="sheet-body" ref=${body} onClick=${onBodyClick}></div>
    </aside>`;
}

// ---------------------------------------------------------------- export

function exportMarkdown(room, scenarios) {
  const doc = room.doc;
  const cell = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const out = [`# BOTS notes: ${room.keys.room}`, '', `Exported ${new Date().toLocaleString()}`, ''];
  const names = new Map(scenarios.map((s) => [s.id, s.name]));
  const iocs = [...doc.getMap('iocs').values()].sort((a, b) => (a.get('at') || 0) - (b.get('at') || 0));
  if (iocs.length) {
    out.push('## Indicators', '', '| Type | Value | First seen | Scenario | Note | By |', '| --- | --- | --- | --- | --- | --- |');
    for (const m of iocs) out.push(`| ${m.get('type')} | \`${cell(m.get('v'))}\` | ${cell(m.get('first'))} | ${cell(names.get(m.get('s')))} | ${cell(m.get('note'))} | ${cell(m.get('by'))} |`);
    out.push('');
  }
  for (const s of scenarios) {
    const qs = [...doc.getMap('questions').values()].filter((q) => q.get('s') === s.id).sort((a, b) => (a.get('n') || 0) - (b.get('n') || 0));
    const notes = doc.getText('notes/' + s.id).toString().trim();
    if (!qs.length && !notes) continue;
    out.push(`## ${s.name}`, '');
    if (s.indexes) out.push(`Indexes: ${s.indexes}`, '');
    if (qs.length) {
      out.push('| # | Question | Answer | Status | Owner |', '| --- | --- | --- | --- | --- |');
      for (const q of qs) out.push(`| ${q.get('n')} | ${cell(q.get('title'))} | ${q.get('answer') ? '`' + cell(q.get('answer')) + '`' : ''} | ${STATUS[q.get('status')] || ''} | ${cell(q.get('owner'))} |`);
      out.push('');
    }
    if (notes) out.push('```', notes, '```', '');
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- workspace

function Workspace({ room, session, onLeave }) {
  useRoom(room);
  const doc = room.doc;
  const me = room.me;
  const scenMap = doc.getMap('scenarios');
  const meta = doc.getMap('meta');
  const [active, setActive] = useState(store(sessionStorage, 'bn.tab') || CONFIG.scenarios[0].id);
  const [sheet, setSheet] = useState({ open: store(localStorage, 'bn.sheetOpen') === '1', expanded: false });
  const [jump, setJump] = useState(null);
  const [editing, setEditing] = useState(false);
  const menuRef = useRef();
  const fileRef = useRef();
  const qRef = useRef();
  const iocRef = useRef();
  const notesRef = useRef();
  const searchRef = useRef();
  useDismiss(menuRef);

  // A brand-new room starts with the scenario tabs from config.js. The ids are
  // fixed, so two people creating the room at once end up with one set.
  useEffect(() => {
    if (scenMap.size) return;
    doc.transact(() => {
      CONFIG.scenarios.forEach((s, i) => {
        const m = new Y.Map();
        m.set('name', s.name);
        m.set('indexes', s.indexes);
        m.set('hunts', s.hunts);
        m.set('order', i);
        scenMap.set(s.id, m);
      });
    });
  }, []);

  const scenarios = [...scenMap.entries()]
    .map(([id, m]) => ({ id, m, name: m.get('name') || 'Untitled', indexes: m.get('indexes') || '', hunts: m.get('hunts') || '', order: m.get('order') || 0 }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const current = scenarios.find((s) => s.id === active) || scenarios[0];

  const go = (id) => { setActive(id); setEditing(false); store(sessionStorage, 'bn.tab', id); };
  useEffect(() => { if (current) room.setPresence({ at: current.id }); }, [current && current.id]);

  const openSheet = (patch) => setSheet((s) => {
    const next = { ...s, ...patch };
    store(localStorage, 'bn.sheetOpen', next.open ? '1' : '0');
    return next;
  });

  // Single-key shortcuts whenever the caret is not in a field.
  const live = useRef({});
  live.current = { scenarios, sheet };
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing = t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.key === 'Escape' && typing) { t.blur(); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      const focus = (ref) => { e.preventDefault(); if (ref.current) ref.current.focus(); };
      if (e.key === 'c') openSheet({ open: !live.current.sheet.open });
      else if (e.key === '/') { e.preventDefault(); openSheet({ open: true }); setTimeout(() => searchRef.current && searchRef.current.focus(), 30); }
      else if (e.key === 'q') focus(qRef);
      else if (e.key === 'i') focus(iocRef);
      else if (e.key === 'n') focus(notesRef);
      else if (e.key === 'g') go(live.current.scenarios[0].id);
      else if (/^[1-9]$/.test(e.key)) {
        const list = live.current.scenarios;
        const hit = list.find((s) => s.name.startsWith(e.key + ' ')) || list[+e.key];
        if (hit) go(hit.id);
      } else if (e.key === 'Escape' && live.current.sheet.open) openSheet({ open: false });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!current) return html`<main class="join"><p class="lede">Loading the room…</p></main>`;

  const questions = doc.getMap('questions');
  const progress = new Map();
  for (const q of questions.values()) {
    const p = progress.get(q.get('s')) || { done: 0, total: 0 };
    p.total++;
    if (q.get('status') === 'done') p.done++;
    progress.set(q.get('s'), p);
  }
  const peers = [...room.peers.values()].sort((a, b) => a.name.localeCompare(b.name));
  const hunts = current.hunts.split(/[\s,]+/).filter(Boolean);
  const invite = location.origin + location.pathname + '#' + encodeURIComponent(room.keys.room);
  const closeMenu = () => { if (menuRef.current) menuRef.current.open = false; };

  const addScenario = () => {
    const id = uid();
    const m = new Y.Map();
    m.set('name', `${scenarios.length} New scenario`);
    m.set('indexes', '');
    m.set('hunts', '');
    m.set('order', scenarios.reduce((n, s) => Math.max(n, s.order), 0) + 1);
    scenMap.set(id, m);
    go(id);
    setEditing(true);
  };

  const restore = async (file) => {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'bots-notepad' || !data.update) throw new Error();
      Y.applyUpdate(doc, unb64(data.update));
      toast('Backup merged into this room');
    } catch {
      alert('That file is not a BOTS Notepad backup.');
    }
  };

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

  return html`
    <div class=${'app' + (sheet.open ? ' sheet-open' : '') + (sheet.open && sheet.expanded ? ' sheet-expanded' : '')}>
      <header class="top">
        <span class="brand">${CONFIG.appName}</span>
        <button class="chip room" title="Copy the invite link (the password is not in it)" onClick=${() => copy(invite, 'Invite link copied')}>
          ${session.locked ? html`<span class="lock" aria-label="Password protected">🔒</span>` : null}${room.keys.room}
        </button>
        <${SyncStatus} room=${room} />
        <span class="people">
          <${Avatar} name=${me.name} color=${me.color} title=${`${me.name} (you)`} />
          ${peers.map((p) => html`<${Avatar} key=${p.id} name=${p.name} color=${p.color} title=${p.name} />`)}
          ${peers.length === 0 && html`<span class="alone">Only you so far</span>`}
        </span>
        <span class="spacer"></span>
        <${GameTimer} meta=${meta} />
        <${ThemeToggle} />
        <button class=${'chip' + (sheet.open ? ' on' : '')} aria-pressed=${sheet.open} onClick=${() => openSheet({ open: !sheet.open })}>Cheat sheet</button>
        <details class="menu" ref=${menuRef}>
          <summary class="chip" aria-label="Room menu">Menu</summary>
          <div class="menu-panel menu-list">
            <button onClick=${() => { copy(invite, 'Invite link copied'); closeMenu(); }}>Copy invite link</button>
            <button onClick=${() => { download(`bots-notes-${room.keys.room}-${stamp}.md`, exportMarkdown(room, scenarios), 'text/markdown'); closeMenu(); }}>Export notes as Markdown</button>
            <button onClick=${() => { download(`bots-notes-${room.keys.room}-${stamp}.backup.json`, JSON.stringify({ app: 'bots-notepad', room: room.keys.room, exported: new Date().toISOString(), update: b64(Y.encodeStateAsUpdate(doc)) }), 'application/json'); closeMenu(); }}>Download backup</button>
            <button onClick=${() => { fileRef.current.click(); closeMenu(); }}>Restore backup…</button>
            <hr />
            <button onClick=${() => onLeave(false)}>Leave room</button>
            <button class="danger" onClick=${() => { if (confirm('Leave and delete the copy of this room saved in this browser? Teammates keep theirs.')) onLeave(true); }}>Leave and forget on this device</button>
          </div>
        </details>
        <input type="file" accept="application/json,.json" hidden ref=${fileRef} onChange=${(e) => { if (e.target.files[0]) restore(e.target.files[0]); e.target.value = ''; }} />
      </header>

      <nav class="tabs" aria-label="Scenarios">
        ${scenarios.map((s) => {
          const p = progress.get(s.id);
          const here = peers.filter((x) => x.at === s.id);
          return html`
            <button key=${s.id} class=${'tab' + (s.id === current.id ? ' on' : '')} aria-current=${s.id === current.id ? 'page' : null} onClick=${() => go(s.id)}>
              <span class="tab-name">${s.name}</span>
              ${p ? html`<span class=${'tab-count' + (p.done === p.total ? ' all' : '')}>${p.done}/${p.total}</span>` : null}
              ${here.length ? html`<span class="tab-people">${here.map((x) => html`<span key=${x.id} class="pip" style=${{ background: x.color }} title=${`${x.name} is here`}></span>`)}</span>` : null}
            </button>`;
        })}
        <button class="tab add" title="Add a scenario" onClick=${addScenario}>+</button>
      </nav>

      <div class="main">
        <div class="col work">
          <div class="scenario-head">
            ${editing
              ? html`
                <${Field} class="s-name" value=${current.name} aria-label="Scenario name" onCommit=${(v) => current.m.set('name', v.trim() || 'Untitled')} />
                <label class="s-field">Hunts <${Field} class="mono" value=${current.hunts} placeholder="H1 H3 H7" onCommit=${(v) => current.m.set('hunts', v)} /></label>
                <button class="mini danger" disabled=${scenarios.length < 2} onClick=${() => { if (confirm(`Delete the tab "${current.name}"? Its questions and notes disappear for everyone.`)) { scenMap.delete(current.id); setEditing(false); } }}>Delete tab</button>
                <button class="mini" onClick=${() => setEditing(false)}>Done</button>`
              : html`
                <h1>${current.name}</h1>
                <label class="s-field">Indexes <${Field} class="mono" value=${current.indexes} placeholder="main, bots10" title="Used by the SPL buttons and the cheat sheet" onCommit=${(v) => current.m.set('indexes', v)} /></label>
                <span class="hunts">
                  ${hunts.map((k) => html`<button key=${k} class="hunt" title=${`Open ${k} in the cheat sheet`} onClick=${() => { openSheet({ open: true }); setJump({ key: k, n: Date.now() }); }}>${k}</button>`)}
                </span>
                <button class="mini" onClick=${() => setEditing(true)}>Edit</button>`}
          </div>
          <${Questions} key=${'q' + current.id} room=${room} scenario=${current} me=${me} addRef=${qRef} />
          <section class="panel notes">
            <header class="panel-head"><h2>Notes</h2><span class="count">shared, saved as you type</span></header>
            <${SharedText} key=${'n' + current.id} inputRef=${notesRef} class="mono" ytext=${doc.getText('notes/' + current.id)}
              aria-label=${`Notes for ${current.name}`}
              placeholder=${current.id === 'general' ? 'Sourcetype list from H0, time range of the data, who is on which scenario…' : 'Working searches, hosts and accounts involved, dead ends…'} />
          </section>
        </div>
        <div class="col side">
          <${Indicators} room=${room} scenario=${current} scenarios=${scenarios} me=${me} addRef=${iocRef} />
        </div>
        <${Sheet} open=${sheet.open} expanded=${sheet.expanded} indexes=${current.indexes} jump=${jump} searchRef=${searchRef}
          onClose=${() => openSheet({ open: false })} onExpand=${() => openSheet({ expanded: !sheet.expanded })} />
      </div>

      <footer class="foot">
        <span><kbd>c</kbd> cheat sheet</span><span><kbd>/</kbd> search it</span><span><kbd>q</kbd> add question</span>
        <span><kbd>i</kbd> add indicator</span><span><kbd>n</kbd> notes</span><span><kbd>1</kbd>–<kbd>9</kbd> scenario</span><span><kbd>g</kbd> general</span><span><kbd>Esc</kbd> leave field</span>
      </footer>
    </div>`;
}

// ---------------------------------------------------------------- app shell

function relayList() {
  const override = new URLSearchParams(location.search).get('relays');
  return override ? override.split(',').map((s) => s.trim()).filter(Boolean) : CONFIG.relays;
}

function App() {
  const [room, setRoom] = useState(null);
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const roomRef = useRef(null);
  const hashRoom = decodeURIComponent(location.hash.slice(1));

  const enter = async (info, keys) => {
    setBusy(true);
    setError(null);
    try {
      const r = new Room({
        keys,
        me: { id: info.id, name: info.name, color: colorFor(info.name), at: store(sessionStorage, 'bn.tab') || '' },
        relays: relayList(),
      });
      await r.start();
      roomRef.current = r;
      store(sessionStorage, 'bn.session', JSON.stringify({ ...info, room: keys.room, bits: b64(keys.bits) }));
      store(localStorage, 'bn.name', info.name);
      store(localStorage, 'bn.room', keys.room);
      history.replaceState(null, '', location.pathname + location.search + '#' + encodeURIComponent(keys.room));
      document.title = `${keys.room} · ${CONFIG.appName}`;
      setSession(info);
      setRoom(r);
    } catch (err) {
      store(sessionStorage, 'bn.session', null);
      setError({ code: err.code || 'error', message: err.code ? err.message : 'Could not open the room: ' + err.message });
    } finally {
      setBusy(false);
    }
  };

  const join = async ({ name, room: roomName, password }) => {
    setBusy(true);
    const keys = await deriveKeys(roomName, password);
    await enter({ id: uid(), name, locked: !!password }, keys);
  };

  // A reload keeps the tab in its room without asking for the password again.
  useEffect(() => {
    const saved = store(sessionStorage, 'bn.session');
    if (!saved) return;
    try {
      const s = JSON.parse(saved);
      if (hashRoom && normRoom(hashRoom) !== s.room) return;
      setBusy(true);
      keysFromBits(s.room, unb64(s.bits)).then((keys) => enter({ id: s.id, name: s.name, locked: s.locked }, keys));
    } catch { store(sessionStorage, 'bn.session', null); }
  }, []);

  useEffect(() => {
    const bye = () => { if (roomRef.current) roomRef.current.leave(); };
    const back = (e) => { if (e.persisted) location.reload(); };
    window.addEventListener('pagehide', bye);
    window.addEventListener('pageshow', back);
    return () => { window.removeEventListener('pagehide', bye); window.removeEventListener('pageshow', back); };
  }, []);

  const leave = async (forget) => {
    const r = roomRef.current;
    roomRef.current = null;
    store(sessionStorage, 'bn.session', null);
    if (r) {
      if (forget) await r.forgetLocal().catch(() => {});
      r.leave();
    }
    document.title = CONFIG.appName;
    setRoom(null);
    setSession(null);
  };

  if (room) return html`<${Workspace} room=${room} session=${session} onLeave=${leave} />`;
  return html`<${Join} initialRoom=${hashRoom} busy=${busy} error=${error} onJoin=${join}
    onForget=${async (name) => { await forgetRoom(name).catch(() => {}); setError(null); toast('Local copy deleted'); }} />`;
}

render(html`<${App} />`, document.getElementById('app'));

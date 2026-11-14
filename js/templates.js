// Room templates: what a brand-new room starts with. Built-in ones live in
// config.js; a room's layout can also be saved as a template, kept in this
// browser or downloaded as a file to share.
//
// Shape (also the file format):
//   { app: 'bots-notepad-template', name, description, splunk, clockMinutes,
//     timeboxMinutes, hideBuiltInSheets: 'all' | [files],
//     tabs: [{ id, name, indexes, hunts, notes, questions: [{ n, title }] }],
//     sheets: [{ title, markdown }] }

import { Y } from '../vendor/vendor.js';
import { CONFIG } from './config.js';

const KEY = 'bn.templates';
const text = (v, max) => String(v === undefined || v === null ? '' : v).slice(0, max);
const slug = () => Math.random().toString(36).slice(2, 10);

// Checks and tidies a template from a file or from storage. Throws on anything
// that is not a template.
export function normalizeTemplate(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tabs) || raw.tabs.length === 0) throw new Error('not a template');
  const minutes = (v, max) => (Number.isFinite(+v) && +v > 0 ? Math.min(max, Math.round(+v)) : 0);
  const seen = new Set();
  return {
    app: 'bots-notepad-template',
    id: /^[\w-]{1,40}$/.test(raw.id || '') ? raw.id : 'tpl-' + slug(),
    name: text(raw.name, 60).trim() || 'Untitled template',
    description: text(raw.description, 200),
    splunk: raw.splunk !== false,
    clockMinutes: minutes(raw.clockMinutes, 7 * 24 * 60),
    timeboxMinutes: minutes(raw.timeboxMinutes, 600),
    hideBuiltInSheets: raw.hideBuiltInSheets === 'all' ? 'all' : (Array.isArray(raw.hideBuiltInSheets) ? raw.hideBuiltInSheets.map((f) => text(f, 120)).slice(0, 50) : []),
    tabs: raw.tabs.slice(0, 30).map((tab, i) => {
      let id = /^[\w-]{1,24}$/.test((tab && tab.id) || '') ? tab.id : 't' + i;
      while (seen.has(id)) id += 'x';
      seen.add(id);
      const t = tab || {};
      return {
        id,
        name: text(t.name, 60).trim() || `Tab ${i + 1}`,
        indexes: text(t.indexes, 200),
        hunts: text(t.hunts, 200),
        notes: text(t.notes, 200000),
        questions: (Array.isArray(t.questions) ? t.questions : []).slice(0, 300)
          .map((q) => ({ n: Math.max(0, Math.min(999, Math.round(+(q && q.n) || 0))), title: text(q && q.title, 300) })),
      };
    }),
    sheets: (Array.isArray(raw.sheets) ? raw.sheets : []).slice(0, 20)
      .map((s) => ({ title: text(s && s.title, 80).trim() || 'Untitled', markdown: text(s && s.markdown, 1024 * 1024) })),
  };
}

export const builtInTemplates = () => CONFIG.templates.map((t) => ({ ...normalizeTemplate(t), builtIn: true }));

export function savedTemplates() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]').map((t) => { try { return normalizeTemplate(t); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

// Returns false when the browser refuses (storage blocked or full).
export function saveTemplate(template) {
  const list = savedTemplates().filter((t) => t.id !== template.id && t.name !== template.name);
  list.push(template);
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}

export function removeTemplate(id) {
  try { localStorage.setItem(KEY, JSON.stringify(savedTemplates().filter((t) => t.id !== id))); } catch { /* nothing to remove */ }
}

// Fills an empty room from a template. `bundled` is the list of built-in
// cheat sheet files, needed to hide them.
export function applyTemplate(doc, template, { by, bundled = [] }) {
  doc.transact(() => {
    const meta = doc.getMap('meta');
    meta.set('template', template.name);
    meta.set('splunk', template.splunk);
    if (template.clockMinutes) meta.set('clockMinutes', template.clockMinutes);
    if (template.timeboxMinutes) meta.set('timeboxMinutes', template.timeboxMinutes);

    template.tabs.forEach((tab, i) => {
      const m = new Y.Map();
      doc.getMap('scenarios').set(tab.id, m);
      m.set('name', tab.name);
      m.set('indexes', tab.indexes);
      m.set('hunts', tab.hunts);
      m.set('order', i);
      if (tab.notes) doc.getText('notes/' + tab.id).insert(0, tab.notes);
      tab.questions.forEach((q, k) => {
        const qm = new Y.Map();
        doc.getMap('questions').set(`${tab.id}-q${k}`, qm);
        qm.set('s', tab.id);
        qm.set('n', q.n);
        qm.set('title', q.title);
        qm.set('answer', '');
        qm.set('status', 'open');
      });
    });

    const now = Date.now();
    template.sheets.forEach((sheet, i) => {
      const id = 'tpl' + i;
      const m = new Y.Map();
      doc.getMap('sheets').set(id, m);
      m.set('title', sheet.title);
      m.set('by', by);
      m.set('at', now + i);
      doc.getText('sheet/' + id).insert(0, sheet.markdown);
    });

    const hide = template.hideBuiltInSheets === 'all' ? bundled : template.hideBuiltInSheets;
    for (const file of hide) doc.getMap('hiddenSheets').set(file, true);
  });
}

// The reusable part of a room. Answers, statuses, owners, indicators and the
// time log are never included.
export function templateFromRoom(doc, { name, sheets, questions, notes }) {
  const meta = doc.getMap('meta');
  const tabs = [...doc.getMap('scenarios').entries()]
    .map(([id, m]) => ({ id, m }))
    .sort((a, b) => (a.m.get('order') || 0) - (b.m.get('order') || 0) || a.id.localeCompare(b.id));
  return normalizeTemplate({
    id: 'tpl-' + slug(),
    name,
    description: `Saved from a room on ${new Date().toLocaleDateString()}`,
    splunk: meta.get('splunk') !== false,
    clockMinutes: meta.get('clockMinutes') || 0,
    timeboxMinutes: meta.get('timeboxMinutes') || 0,
    hideBuiltInSheets: [...doc.getMap('hiddenSheets').keys()],
    tabs: tabs.map(({ id, m }) => ({
      id,
      name: m.get('name'),
      indexes: m.get('indexes'),
      hunts: m.get('hunts'),
      notes: notes ? doc.getText('notes/' + id).toString() : '',
      questions: !questions ? [] : [...doc.getMap('questions').values()]
        .filter((q) => q.get('s') === id)
        .map((q) => ({ n: q.get('n') || 0, title: q.get('title') || '' }))
        .sort((a, b) => a.n - b.n),
    })),
    sheets: !sheets ? [] : [...doc.getMap('sheets').entries()]
      .sort((a, b) => (a[1].get('at') || 0) - (b[1].get('at') || 0))
      .map(([id, m]) => ({ title: m.get('title'), markdown: doc.getText('sheet/' + id).toString() })),
  });
}

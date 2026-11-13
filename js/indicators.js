// Indicator parsing and the SPL helpers built from scenario indexes.

export const TYPES = ['ip', 'domain', 'url', 'host', 'user', 'hash', 'file', 'key', 'other'];

const ALIASES = { h: 'host', u: 'user', d: 'domain', f: 'file', k: 'key', email: 'user', sha256: 'hash', md5: 'hash', sha1: 'hash' };

const FILE_EXT = /\.(exe|dll|ps1|psm1|bat|cmd|vbs|js|jse|hta|lnk|iso|img|msi|msix|zip|rar|7z|gz|tar|docx?|docm|xlsx?|xlsm|pptx?|pdf|py|sh|txt|log|dat|tmp|jar|scr|sys|php|aspx?|ashx|jsp|json|ya?ml|csv|gguf|pkl|safetensors)$/i;

// 10.0.0[.]5 and hxxp://evil[.]com are pasted from reports all the time.
export function refang(value) {
  return value
    .replace(/\[\.\]|\(\.\)|\[dot\]/gi, '.')
    .replace(/\[:\]/g, ':')
    .replace(/\[@\]|\[at\]/gi, '@')
    .replace(/^hxxp/i, 'http');
}

export function detectType(v) {
  if (/^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?(?::\d{1,5})?$/.test(v)) return 'ip';
  if (/^[0-9a-f:]+$/i.test(v) && (v.match(/:/g) || []).length >= 2) return 'ip';
  if (/^(?:[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64}|[a-f0-9]{128})$/i.test(v)) return 'hash';
  if (/^(?:AKIA|ASIA)[A-Z0-9]{16}$/.test(v)) return 'key';
  if (/^arn:aws[\w-]*:(?:iam|sts):.*(?:user|role)\//.test(v)) return 'user';
  if (/^https?:\/\//i.test(v)) return 'url';
  if (/^[^@\s\\/]+@[^@\s]+\.[a-z]{2,}$/i.test(v)) return 'user';
  if (/^[\w.-]+\\[\w.$-]+$/.test(v)) return 'user'; // DOMAIN\user
  if (/[\\/]/.test(v) || FILE_EXT.test(v)) return 'file';
  if (/^(?:[a-z0-9_](?:[a-z0-9_-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(v)) return 'domain';
  if (/^[A-Z0-9]+(?:-[A-Z0-9]+)+\$?$/.test(v)) return 'host';
  return 'other';
}

// One indicator per line. "u: mallory" forces a type; "10.0.0.5 scanner" keeps
// the rest as a note; a line made only of recognisable values is split.
export function parseIndicators(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    // The second form must not swallow drive letters ("d:\\temp\\x.exe").
    const forced = line.match(/^([a-z0-9]+):\s+(.+)$/i) || line.match(/^(ip|domain|url|host|user|hash|file|key|other|[hudfk]):([^\s\\/:].*)$/i);
    if (forced) {
      const type = ALIASES[forced[1].toLowerCase()] || forced[1].toLowerCase();
      if (TYPES.includes(type)) { out.push({ value: refang(forced[2].trim()), type, note: '' }); continue; }
    }

    const whole = refang(line);
    const wholeType = detectType(whole);
    const tokens = line.split(/[\s,;]+/).filter(Boolean).map(refang);
    if (wholeType !== 'other' || tokens.length === 1) {
      out.push({ value: whole, type: wholeType, note: '' });
    } else if (tokens.every((t) => detectType(t) !== 'other')) {
      for (const t of tokens) out.push({ value: t, type: detectType(t), note: '' });
    } else if (detectType(tokens[0]) !== 'other') {
      out.push({ value: tokens[0], type: detectType(tokens[0]), note: line.slice(line.indexOf(tokens[0]) + tokens[0].length).replace(/^[\s,;#|-]+/, '') });
    } else {
      out.push({ value: whole, type: 'other', note: '' });
    }
  }
  return out;
}

// "main, bots10" -> index IN (main, bots10)
export function indexClause(indexes) {
  const list = (indexes || '').split(/[\s,]+/).filter(Boolean).map((s) => s.toLowerCase());
  if (!list.length) return 'index=*';
  return list.length === 1 ? `index=${list[0]}` : `index IN (${list.join(', ')})`;
}

// The "where does this indicator live, and when" search from the cheat sheet.
export function pivotSpl(value, indexes) {
  const quoted = '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  return `${indexClause(indexes)} ${quoted}\n| stats count min(_time) as first max(_time) as last by index sourcetype host\n| convert ctime(first) ctime(last)`;
}

// "12", "1-15", "3,4,7", "12 what was the C2 domain", or just a title.
export function parseQuestions(text, nextNumber) {
  const line = text.trim();
  if (!line) return [];
  const range = line.match(/^(\d{1,3})\s*-\s*(\d{1,3})$/);
  if (range) {
    const from = +range[1];
    const to = Math.min(+range[2], from + 79);
    return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => ({ n: from + i, title: '' }));
  }
  if (/^\d{1,3}(?:\s*,\s*\d{1,3})+$/.test(line)) return line.split(',').map((s) => ({ n: +s, title: '' }));
  const numbered = line.match(/^[Qq#]?(\d{1,3})[.):]?(?:\s+(.*))?$/);
  if (numbered) return [{ n: +numbered[1], title: numbered[2] || '' }];
  return [{ n: nextNumber, title: line }];
}

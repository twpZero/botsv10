// A minimal in-memory Nostr relay (the NIP-01 subset the app uses) so the
// tests run without touching the public relays.
import { WebSocketServer } from 'ws';

export function mockRelay(port) {
  const stored = new Map(); // addressable events, latest per pubkey:kind:d
  const clients = new Set();
  const wss = new WebSocketServer({ port });

  const matches = (filter, ev) => {
    if (filter.kinds && !filter.kinds.includes(ev.kind)) return false;
    if (filter.authors && !filter.authors.includes(ev.pubkey)) return false;
    for (const [key, wanted] of Object.entries(filter)) {
      if (key[0] !== '#') continue;
      if (!ev.tags.some((t) => t[0] === key.slice(1) && wanted.includes(t[1]))) return false;
    }
    return true;
  };

  wss.on('connection', (ws) => {
    const client = { ws, subs: new Map() };
    clients.add(client);
    ws.on('close', () => clients.delete(client));
    ws.on('message', (data) => {
      let m;
      try { m = JSON.parse(data); } catch { return; }
      if (m[0] === 'REQ') {
        const filters = m.slice(2);
        client.subs.set(m[1], filters);
        for (const ev of stored.values()) {
          if (filters.some((f) => f.limit !== 0 && matches(f, ev))) ws.send(JSON.stringify(['EVENT', m[1], ev]));
        }
        ws.send(JSON.stringify(['EOSE', m[1]]));
      } else if (m[0] === 'CLOSE') {
        client.subs.delete(m[1]);
      } else if (m[0] === 'EVENT') {
        const ev = m[1];
        if (ev.kind >= 30000 && ev.kind < 40000) {
          const d = (ev.tags.find((t) => t[0] === 'd') || [])[1] || '';
          const key = `${ev.pubkey}:${ev.kind}:${d}`;
          const old = stored.get(key);
          if (!old || old.created_at <= ev.created_at) stored.set(key, ev);
        }
        ws.send(JSON.stringify(['OK', ev.id, true, '']));
        for (const c of clients) {
          for (const [sub, filters] of c.subs) {
            if (filters.some((f) => matches(f, ev))) c.ws.send(JSON.stringify(['EVENT', sub, ev]));
          }
        }
      }
    });
  });

  return { stored, close: () => new Promise((ok) => { for (const c of clients) c.ws.terminate(); wss.close(ok); }) };
}

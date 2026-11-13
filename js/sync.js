// Room sync: a Yjs document, encrypted with a key derived from the room name
// and password, relayed through public Nostr relays and cached in IndexedDB.
//
// Relays only ever see ciphertext, labelled with a hash of the room name.
// Anything under that label that does not decrypt means "wrong password".

import { Y, schnorr, sha256, bytesToHex } from '../vendor/vendor.js';

const te = new TextEncoder();
const td = new TextDecoder();

const KIND_LIVE = 25078; // ephemeral: relayed to whoever is connected, never stored
const KIND_SNAP = 30078; // addressable app data: the relay keeps the latest per `d` tag

const MSG_UPDATE = 1;
const MSG_PRESENCE = 2;
const MSG_BYE = 3;
const MSG_SNAP = 4;

const FRAME_BYTES = 30000;      // payload per relay event, before base64
const FLUSH_MS = 250;           // batch local edits before publishing
const HEARTBEAT_MS = 8000;
// Browsers slow a hidden tab's timers to one tick a minute, and the notepad is
// often behind a Splunk tab, so a quiet peer is only dropped after this long.
const PEER_TIMEOUT_MS = 100000;
const SNAPSHOT_MIN_MS = 12000;

// ---------------------------------------------------------------- bytes

export function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function unb64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function pipe(bytes, stream) {
  const w = stream.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}
const deflate = (b) => pipe(b, new CompressionStream('deflate-raw'));
const inflate = (b) => pipe(b, new DecompressionStream('deflate-raw'));

// ---------------------------------------------------------------- keys

export const normRoom = (room) => room.trim().toLowerCase().replace(/\s+/g, '-');

export async function deriveKeys(room, password) {
  const name = normRoom(room);
  const material = await crypto.subtle.importKey('raw', te.encode(password || ''), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: te.encode(`bots-notepad/v1/${name}`), iterations: 300000 },
    material, 512));
  return keysFromBits(name, bits);
}

// `bits` is what a tab keeps in sessionStorage so a reload does not ask again.
export async function keysFromBits(room, bits) {
  const aesKey = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const sk = bits.slice(32, 64);
  return {
    room,
    bits,
    aesKey,
    sk,
    pk: bytesToHex(schnorr.getPublicKey(sk)),
    // Public label for the room name alone, so a wrong password can be told
    // apart from an empty room.
    roomTag: bytesToHex(sha256(te.encode(`bots-notepad/v1/tag/${room}`))).slice(0, 40),
  };
}

async function seal(keys, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keys.aesKey, plain));
  return concat(iv, ct);
}

async function unseal(keys, bytes) {
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.subarray(0, 12) }, keys.aesKey, bytes.subarray(12)));
}

// A message becomes one or more sealed frames:
//   [type][compressed?][message id x8][index][total][data]
async function toFrames(keys, type, body) {
  let flags = 0;
  if (body.length > 400) { body = await deflate(body); flags = 1; }
  const msgId = crypto.getRandomValues(new Uint8Array(8));
  const total = Math.max(1, Math.ceil(body.length / FRAME_BYTES));
  if (total > 255) throw new Error('Message too large to sync');
  const frames = [];
  for (let i = 0; i < total; i++) {
    const head = concat(new Uint8Array([type, flags]), msgId, new Uint8Array([i, total]));
    frames.push(await seal(keys, concat(head, body.subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES))));
  }
  return frames;
}

function signEvent(signer, kind, tags, content) {
  const created_at = Math.floor(Date.now() / 1000);
  const idBytes = sha256(te.encode(JSON.stringify([0, signer.pk, created_at, kind, tags, content])));
  return {
    id: bytesToHex(idBytes),
    pubkey: signer.pk,
    created_at,
    kind,
    tags,
    content,
    sig: bytesToHex(schnorr.sign(idBytes, signer.sk)),
  };
}

// ---------------------------------------------------------------- local cache

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('bots-notepad', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('rooms');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRun(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('rooms', mode);
    const req = fn(tx.objectStore('rooms'));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------- relay

class Relay {
  constructor(url, room) {
    this.url = url;
    this.room = room;
    this.state = 'connecting';
    this.rejected = 0;
    this.note = '';
    this.retry = 0;
    this.closed = false;
    this.connect();
  }

  connect() {
    if (this.closed) return;
    this.state = 'connecting';
    let ws;
    try { ws = new WebSocket(this.url); } catch { return this.down(); }
    this.ws = ws;
    ws.onopen = () => {
      this.state = 'open';
      this.retry = 0;
      const { keys } = this.room;
      this.send(['REQ', 'snap', { kinds: [KIND_SNAP], '#t': [keys.roomTag] }]);
      this.send(['REQ', 'live', { kinds: [KIND_LIVE], '#t': [keys.roomTag], limit: 0 }]);
      this.room.relayChanged(this, true);
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m[0] === 'EVENT' && m[2]) this.room.onEvent(m[2]);
      else if (m[0] === 'EOSE' && m[1] === 'snap') this.room.onSnapshotsListed();
      else if (m[0] === 'OK' && m[2] === false) { this.rejected++; this.note = String(m[3] || ''); this.room.relayChanged(this); }
      else if (m[0] === 'NOTICE') { this.note = String(m[1] || ''); }
    };
    ws.onclose = () => { if (this.ws === ws) this.down(); };
    ws.onerror = () => {};
  }

  down() {
    this.state = 'closed';
    this.room.relayChanged(this);
    if (this.closed) return;
    const wait = Math.min(20000, 1000 * 2 ** this.retry++) * (0.7 + Math.random() * 0.6);
    this.timer = setTimeout(() => this.connect(), wait);
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(msg)); return true; }
    return false;
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    try { this.ws && this.ws.close(); } catch { /* already gone */ }
  }
}

// ---------------------------------------------------------------- room

export class RoomError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export class Room {
  constructor({ keys, me, relays }) {
    this.keys = keys;
    this.me = { id: me.id, name: me.name, color: me.color, at: me.at || '' };
    this.relayUrls = relays;
    // Live traffic is signed with a throwaway key per tab, so relay rate
    // limits apply per person. Stored snapshots use the shared room key so
    // each one replaces the last.
    const sk = crypto.getRandomValues(new Uint8Array(32));
    this.session = { sk, pk: bytesToHex(schnorr.getPublicKey(sk)) };
    this.doc = new Y.Doc();
    this.peers = new Map();
    this.relays = [];
    this.listeners = new Map();
    this.seen = new Set();
    this.partial = new Map();
    this.pending = [];
    this.timers = [];
    this.foreign = 0;
    this.ownSnapshot = false;
    this.snapshotDirty = false;
    this.lastSnapshot = 0;
    this.persisted = false;
    this.started = false;
    this.left = false;
  }

  on(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
    return () => this.listeners.get(name).delete(fn);
  }

  emit(name) {
    for (const fn of this.listeners.get(name) || []) fn();
  }

  // Loads the local copy, connects, and waits briefly for stored snapshots so
  // a wrong password is caught before the notepad opens.
  async start() {
    let hadLocal = false;
    try {
      this.db = await idbOpen();
      const stored = await idbRun(this.db, 'readonly', (s) => s.get(this.keys.roomTag));
      if (stored) {
        let state;
        try { state = await unseal(this.keys, stored); } catch {
          throw new RoomError('local-mismatch', 'That password does not open the copy of this room saved in this browser.');
        }
        Y.applyUpdate(this.doc, state, 'load');
        hadLocal = true;
      }
      this.persisted = true;
    } catch (err) {
      if (err instanceof RoomError) throw err;
      this.db = null; // private window or blocked storage: carry on without a cache
    }

    const listed = new Promise((resolve) => { this.resolveListed = resolve; });
    this.listedCount = 0;
    this.relays = this.relayUrls.map((url) => new Relay(url, this));
    await Promise.race([listed, new Promise((r) => setTimeout(r, 5000))]);
    this.resolveListed = null;
    await this.settled();

    if (this.foreign > 0 && !this.ownSnapshot && !hadLocal && this.peers.size === 0) {
      this.leave();
      throw new RoomError('remote-mismatch', 'Wrong password for this room. If nobody on your team created it, the name is taken: pick another.');
    }

    if (!this.ownSnapshot && !hadLocal) {
      // Looks like a new room, but teammates may have created it seconds ago:
      // say hello and give them a moment to send what they have.
      this.heartbeat();
      await new Promise((r) => setTimeout(r, 1500));
      await this.settled();
    }

    this.byeFrame = (await toFrames(this.keys, MSG_BYE, te.encode(JSON.stringify({ id: this.me.id }))))[0];
    this.started = true;
    this.snapshotDirty = !this.ownSnapshot;
    this.saveSoon();
    this.onVisible = () => { if (!document.hidden) this.heartbeat(); };
    document.addEventListener('visibilitychange', this.onVisible);
    this.doc.on('update', (update, origin) => {
      this.snapshotDirty = true;
      this.saveSoon();
      if (origin === 'remote' || origin === 'load') return;
      this.pending.push(update);
      if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), FLUSH_MS);
    });
    this.timers.push(setInterval(() => this.heartbeat(), HEARTBEAT_MS));
    this.timers.push(setInterval(() => this.maybeSnapshot(), 4000));
    this.heartbeat();
    this.emit('status');
  }

  // Resolves once every event received so far has been decrypted and applied.
  async settled() {
    let last;
    do { last = this.chain; await last; } while (last !== this.chain);
  }

  // ------------------------------------------------------------ outbound

  publish(kind, tags, frame) {
    const event = signEvent(kind === KIND_SNAP ? this.keys : this.session, kind, tags, b64(frame));
    this.seen.add(event.id);
    let sent = 0;
    for (const relay of this.relays) if (relay.send(['EVENT', event])) sent++;
    return sent;
  }

  async send(type, body) {
    const tag = ['t', this.keys.roomTag];
    for (const frame of await toFrames(this.keys, type, body)) this.publish(KIND_LIVE, [tag], frame);
  }

  flush() {
    this.flushTimer = null;
    if (!this.pending.length) return;
    const update = this.pending.length === 1 ? this.pending[0] : Y.mergeUpdates(this.pending);
    this.pending = [];
    this.send(MSG_UPDATE, update);
  }

  presencePayload() {
    return {
      id: this.me.id,
      name: this.me.name,
      color: this.me.color,
      at: this.me.at,
      sv: b64(Y.encodeStateVector(this.doc)),
      ds: this.deleteHash(),
    };
  }

  heartbeat() {
    if (this.left) return;
    this.send(MSG_PRESENCE, te.encode(JSON.stringify(this.presencePayload())));
    const cutoff = Date.now() - PEER_TIMEOUT_MS;
    let dropped = false;
    for (const [id, peer] of this.peers) if (peer.seen < cutoff) { this.peers.delete(id); dropped = true; }
    if (dropped) this.emit('peers');
  }

  setPresence(patch) {
    Object.assign(this.me, patch);
    clearTimeout(this.presenceTimer);
    this.presenceTimer = setTimeout(() => this.heartbeat(), 300);
  }

  // Deletions do not move Yjs state vectors, so compare them separately.
  deleteHash() {
    const ds = Y.createDeleteSetFromStructStore(this.doc.store);
    const parts = [];
    for (const client of [...ds.clients.keys()].sort((a, b) => a - b)) {
      parts.push(client + ':' + ds.clients.get(client).map((d) => d.clock + '+' + d.len).join(','));
    }
    return bytesToHex(sha256(te.encode(parts.join(';')))).slice(0, 12);
  }

  // The lowest id present keeps the stored snapshot fresh, so a teammate who
  // joins after everyone has gone still gets the notes.
  isLeader() {
    for (const id of this.peers.keys()) if (id < this.me.id) return false;
    return true;
  }

  maybeSnapshot(force) {
    if (this.left || !this.started || !this.snapshotDirty) return;
    if (!force && (!this.isLeader() || Date.now() - this.lastSnapshot < SNAPSHOT_MIN_MS)) return;
    if (!this.relays.some((r) => r.state === 'open')) return;
    this.snapshotDirty = false;
    this.lastSnapshot = Date.now();
    // Two alternating slots: a snapshot cut off half-way (a closing tab) can
    // only damage one, and the other still holds the previous complete copy.
    const slot = (this.snapshotSlot = this.snapshotSlot ? 0 : 1);
    return toFrames(this.keys, MSG_SNAP, Y.encodeStateAsUpdate(this.doc)).then((frames) => {
      frames.forEach((frame, i) => {
        this.publish(KIND_SNAP, [['d', `${this.keys.roomTag}:${slot}:${i}`], ['t', this.keys.roomTag]], frame);
      });
      this.ownSnapshot = true;
      this.emit('status');
    });
  }

  // ------------------------------------------------------------ inbound

  onEvent(event) {
    if (this.left || this.seen.has(event.id)) return;
    this.seen.add(event.id);
    if (this.seen.size > 6000) this.seen = new Set([...this.seen].slice(-3000));
    // One at a time, in arrival order.
    this.chain = (this.chain || Promise.resolve()).then(() => this.handle(event)).catch(() => {});
  }

  async handle(event) {
    let plain;
    try { plain = await unseal(this.keys, unb64(event.content)); } catch {
      // Same room name, different password.
      this.foreign++;
      this.emit('status');
      return;
    }
    const type = plain[0];
    const total = plain[11];
    let body = plain.subarray(12);
    if (total > 1) {
      const key = bytesToHex(plain.subarray(2, 10));
      let entry = this.partial.get(key);
      if (!entry) {
        entry = { parts: new Map(), at: Date.now() };
        this.partial.set(key, entry);
        for (const [k, v] of this.partial) if (Date.now() - v.at > 120000) this.partial.delete(k);
      }
      entry.parts.set(plain[10], body);
      if (entry.parts.size < total) return;
      this.partial.delete(key);
      body = concat(...Array.from({ length: total }, (_, i) => entry.parts.get(i)));
    }
    if (plain[1] & 1) body = await inflate(body);

    if (type === MSG_UPDATE) {
      Y.applyUpdate(this.doc, body, 'remote');
    } else if (type === MSG_SNAP) {
      this.ownSnapshot = true;
      Y.applyUpdate(this.doc, body, 'remote');
    } else if (type === MSG_PRESENCE) {
      const p = JSON.parse(td.decode(body));
      if (p.id === this.me.id) return;
      const prev = this.peers.get(p.id);
      this.peers.set(p.id, { ...p, seen: Date.now(), dsMiss: prev ? prev.dsMiss : 0 });
      if (!prev) this.heartbeat(); // introduce ourselves to a newcomer straight away
      if (!prev || prev.name !== p.name || prev.at !== p.at || prev.color !== p.color) this.emit('peers');
      if (this.started) this.heal(p.id);
    } else if (type === MSG_BYE) {
      const p = JSON.parse(td.decode(body));
      if (this.peers.delete(p.id)) this.emit('peers');
    }
  }

  // Anti-entropy: every heartbeat carries the sender's state vector. If we hold
  // something they lack, send exactly that. Covers joins, reconnects and any
  // event a relay dropped.
  heal(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer || peer.healing) return;
    const theirs = Y.decodeStateVector(unb64(peer.sv));
    const mine = Y.decodeStateVector(Y.encodeStateVector(this.doc));
    let ahead = false;
    for (const [client, clock] of mine) if ((theirs.get(client) || 0) < clock) { ahead = true; break; }
    let behind = false;
    for (const [client, clock] of theirs) if ((mine.get(client) || 0) < clock) { behind = true; break; }

    let diff = null;
    if (ahead) {
      diff = () => Y.encodeStateAsUpdate(this.doc, unb64(this.peers.get(peerId).sv));
    } else if (!behind && peer.ds !== this.deleteHash()) {
      // Same inserts, different deletions. Wait one more heartbeat in case the
      // difference is just an update still in flight.
      if (++peer.dsMiss >= 2) diff = () => Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(this.doc));
    } else {
      peer.dsMiss = 0;
    }
    if (!diff) return;
    peer.healing = true;
    const reply = () => {
      const current = this.peers.get(peerId);
      if (!current || this.left) return;
      current.healing = false;
      current.dsMiss = 0;
      this.send(MSG_UPDATE, diff());
    };
    // The pause keeps several peers from answering at once; a hidden tab
    // answers straight away because its timers may not fire for a minute.
    if (document.hidden) reply(); else setTimeout(reply, 150 + Math.random() * 500);
  }

  // A relay finished listing stored snapshots. Open the room once all have,
  // or shortly after the first, whichever comes sooner.
  onSnapshotsListed() {
    const done = this.resolveListed;
    if (!done) return;
    if (++this.listedCount >= this.relays.length) done();
    else if (this.listedCount === 1) setTimeout(done, 1500);
  }

  relayChanged(relay, opened) {
    if (opened && this.started) this.heartbeat();
    this.emit('status');
  }

  status() {
    return {
      relays: this.relays.map((r) => ({ url: r.url, state: r.state, rejected: r.rejected, note: r.note })),
      open: this.relays.filter((r) => r.state === 'open').length,
      total: this.relays.length,
      foreign: this.foreign,
      persisted: this.persisted,
      stored: this.ownSnapshot,
    };
  }

  // ------------------------------------------------------------ local cache

  saveSoon() {
    if (!this.db || this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.save(); }, 400);
  }

  async save() {
    if (!this.db) return;
    try {
      const sealed = await seal(this.keys, Y.encodeStateAsUpdate(this.doc));
      await idbRun(this.db, 'readwrite', (s) => s.put(sealed, this.keys.roomTag));
    } catch {
      this.persisted = false;
      this.emit('status');
    }
  }

  // Call before leave(): stops caching, then removes the saved copy.
  async forgetLocal() {
    const db = this.db;
    this.db = null;
    clearTimeout(this.saveTimer);
    if (db) await idbRun(db, 'readwrite', (s) => s.delete(this.keys.roomTag));
  }

  // ------------------------------------------------------------ leaving

  // Called on tab close too, so everything here is fire-and-forget.
  leave() {
    if (this.left) return;
    if (this.started) {
      // Sealed in advance so it goes out synchronously, even from a closing tab.
      this.publish(KIND_LIVE, [['t', this.keys.roomTag]], this.byeFrame);
      this.flush();
      this.maybeSnapshot(true);
      this.save();
      document.removeEventListener('visibilitychange', this.onVisible);
    }
    this.left = true;
    this.timers.forEach(clearInterval);
    clearTimeout(this.flushTimer);
    clearTimeout(this.presenceTimer);
    // Give the last frames a moment to leave the socket buffers.
    setTimeout(() => this.relays.forEach((r) => r.close()), 800);
  }
}

// Removes a saved room without knowing its password (used from the join form).
export async function forgetRoom(room) {
  const tag = bytesToHex(sha256(te.encode(`bots-notepad/v1/tag/${normRoom(room)}`))).slice(0, 40);
  const db = await idbOpen();
  await idbRun(db, 'readwrite', (s) => s.delete(tag));
}

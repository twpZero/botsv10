# BOTS Notepad

A shared notepad for a Boss of the SOC team of 2 to 4 players. Everyone in a
room sees the same questions, answers, indicators and notes within a second,
with the hunting cheat sheet one key away. It is a static site: no server, no
accounts, no build step.

## What is in it

- **Scenario tabs.** One per BOTS scenario plus General, each showing who is
  on it and how many questions are answered.
- **Questions.** Type `1-15` to create a block. **Take** marks a question as
  yours and starts a timer that turns red after 10 minutes (take the hint, swap
  or move on). Answers have a copy button, because each one is usually the
  search term for the next question.
- **Indicators.** One list for the whole team. Paste IPs, hosts, users, hashes,
  domains or access keys, several lines at once; the type is detected,
  defanged values (`evil[.]example`) are cleaned, duplicates are refused. The
  **SPL** button copies the "where does this value appear, and when" search
  using the scenario's indexes.
- **Notes.** Free text per scenario, edited by several people at once.
- **Cheat sheets.** A side panel with a sheet picker, a section picker and a
  search box. Every search has a Copy button, and `index=*` is replaced by the
  current scenario's indexes. The `H18`-style chips in a scenario header jump
  to that hunt, switching sheet if needed.
- **Cheat sheet editing.** **Manage** creates a sheet, imports a Markdown file,
  downloads, hides a built-in sheet or deletes a room sheet. **Edit** opens a
  Markdown editor with a live preview; teammates see the changes as you type.
  Built-in sheets are read-only, so **Edit a copy** puts an editable copy in
  the room.
- **Shared clock**, a light/dark toggle, Markdown export, and backup/restore
  from the menu.

Keys, when the caret is not in a field: `c` cheat sheet, `/` search it, `q` add
question, `i` add indicator, `n` notes, `1`–`9` scenario, `g` General, `Esc`
leave the field.

## Using it

1. Open the site, enter your name, a room name and (optionally) a password.
2. Send teammates the link (click the room name to copy it) and tell them the
   password some other way. The link never contains it.
3. On the day: run H0, paste the sourcetype list into General, create the
   question blocks, and take questions as you start them.

## Hosting on GitHub Pages

1. Push this repository to GitHub.
2. **Settings → Pages → Build and deployment → Deploy from a branch**, pick the
   branch and `/ (root)`, save.
3. The site appears at `https://<owner>.github.io/<repo>/` after a minute.

Everything in the repository is public once Pages is on, including the files
in `cheatsheets/`. Rooms are not: see below.

## How sync and the password work

- The room name and password are stretched (PBKDF2, 300,000 rounds) into an
  AES-256-GCM key in the browser. Everything that leaves the browser is
  encrypted with it. Without a password the key comes from the room name alone,
  so anyone who knows the name can read the room.
- Encrypted changes travel through public [Nostr](https://nostr.com) relays
  over port 443, which passes most event and office networks. The relays see
  ciphertext labelled with a hash of the room name, nothing else.
- Each browser keeps an encrypted copy in IndexedDB, so a reload or a dropped
  connection loses nothing, and offline edits merge when the connection returns
  (the data is a [Yjs](https://yjs.dev) CRDT).
- One player's browser also stores an encrypted snapshot on the relays, so a
  teammate who joins after everyone else has left still gets the notes.
- A wrong password is refused at the door when the room already exists.
- The password cannot be recovered or changed. To change it, export a backup,
  join a new room and restore the backup there.

**The relays are free public services that this project does not control.**
They were chosen by testing (typing-rate traffic, 30 KB events, stored
snapshots), but any of them can change its rules. The app uses all of them at
once and needs only one. Before an event, open the room, click **Live** and
check the list; replace any relay that fails in `js/config.js`. Take a
**Download backup** from the menu at the end of a session if the notes matter.

## Customising

- `js/config.js`: relay list, default scenario tabs with their indexes and
  hunts, clock length, time-box length. Scenario tabs can also be renamed,
  added and removed inside a room.
- `cheatsheets/`: built-in sheets, public and the same for every room. Add a
  Markdown file and list it in `cheatsheets/index.json`. Headings (`##`,
  `###`) become the section picker; fenced code blocks get a Copy button.
- Sheets written or imported inside a room are stored with the room: encrypted,
  synced to teammates, and not in the repository. Use them for anything the
  team does not want public.

## Development

The site is plain ES modules. `vendor/vendor.js` is a pre-built bundle of Yjs,
Preact, htm, marked, DOMPurify and the noble crypto libraries.

```
cd tools
npm install
npm run serve     # http://localhost:8080
npm run vendor    # rebuild vendor/vendor.js after changing dependencies
npm test          # end-to-end test in Chromium (needs Playwright installed)
```

`npm test` drives several browsers through a local mock relay
(`tools/mock-relay.mjs`): joining, presence, concurrent typing, wrong password,
offline edits, reload, export and joining an empty room late.

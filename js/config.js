// Everything a team is likely to tweak lives here. No build step: edit, commit, push.

export const CONFIG = {
  appName: 'BOTS Notepad',

  // Public Nostr relays used as dumb pipes for end-to-end encrypted sync.
  // All of them listen on port 443, so they pass through most event and
  // corporate networks. Two or more open relays are enough; extras add
  // redundancy. `?relays=wss://a,wss://b` in the URL overrides this list.
  relays: [
    'wss://relay.primal.net',
    'wss://relay.snort.social',
    'wss://purplerelay.com',
    'wss://nostr.data.haus',
    'wss://nostr.sathoarder.com',
    'wss://yabu.me',
  ],

  gameMinutes: 240,    // countdown length when the template does not set one
  timeboxMinutes: 10,  // a question worked on this long gets flagged, likewise

  // What a brand-new room can start from; the first one is the default. Rooms
  // can also be saved as templates from the menu (see js/templates.js for the
  // shape). `hunts` are heading prefixes in a cheat sheet (H18 jumps to
  // "### H18. ..."). `splunk: false` hides the index field and SPL buttons.
  // `hideBuiltInSheets` hides files from cheatsheets/ ('all', or a list).
  templates: [
    {
      id: 'bots-v10',
      name: 'Splunk BOTS v10',
      description: 'The seven v10 scenarios with their indexes and hunts.',
      splunk: true,
      clockMinutes: 240,
      timeboxMinutes: 10,
      tabs: [
        { id: 'general', name: 'General', indexes: '', hunts: 'H0 H12 H13 H14' },
        { id: 's1', name: '1 Cats and Dawgs', indexes: 'main', hunts: 'H18 H6 H14' },
        { id: 's2', name: '2 Hot Dog Heist', indexes: '', hunts: 'H1 H3 H4 H5 H7 H9' },
        { id: 's3', name: '3 Hops of Deception', indexes: '', hunts: 'H15 H5 H11' },
        { id: 's4', name: '4 Zero Chill', indexes: 'main, frothxly', hunts: 'H19 H1 H2 H3 H13' },
        { id: 's5', name: "5 Threat Intel O'LLMa", indexes: 'main, bots10', hunts: 'H16' },
        { id: 's6', name: '6 Rogue Intentions', indexes: 'main, bots10', hunts: 'H17 H9 H7' },
        { id: 's7', name: '7 EGGS 10', indexes: '', hunts: '' },
      ],
    },
    {
      id: 'bots',
      name: 'Splunk BOTS (any version)',
      description: 'General plus seven numbered scenarios to rename.',
      splunk: true,
      clockMinutes: 240,
      timeboxMinutes: 10,
      tabs: [
        { id: 'general', name: 'General', indexes: '', hunts: 'H0 H12 H13 H14' },
        ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: 's' + n, name: `${n} Scenario ${n}`, indexes: '', hunts: '' })),
      ],
    },
    {
      id: 'ctf',
      name: 'Jeopardy CTF',
      description: 'One tab per category. No Splunk fields.',
      splunk: false,
      clockMinutes: 480,
      timeboxMinutes: 30,
      hideBuiltInSheets: 'all',
      tabs: ['General', 'Web', 'Pwn', 'Reversing', 'Crypto', 'Forensics', 'OSINT', 'Misc']
        .map((name) => ({ id: name.toLowerCase(), name })),
    },
    {
      id: 'blank',
      name: 'Blank',
      description: 'A single tab. Add your own.',
      splunk: false,
      hideBuiltInSheets: 'all',
      tabs: [{ id: 'general', name: 'General' }],
    },
  ],
};

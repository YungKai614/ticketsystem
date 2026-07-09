const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Persistente Datenbank ────────────────────────────────────────────────────
// Railway Volume: /data wird persistent gemountet (wenn konfiguriert)
// Fallback: lokales Verzeichnis
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'db.json');

function readDB() {
  // FORCE_RESET=true in Railway Variables setzt alles zurück
  if (process.env.FORCE_RESET === 'true') {
    process.env.FORCE_RESET = 'false'; // nur einmal zurücksetzen
    return initDB();
  }
  if (!fs.existsSync(DB_PATH)) return initDB();
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch(e) { return initDB(); }
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ── Passwort-Hashing (SHA-256, kein bcrypt nötig für dieses Level) ─────────
function hashPass(pass) {
  return crypto.createHash('sha256').update(pass + 'ict-salt-2026').digest('hex');
}

// ── Benutzer-Datenbank (auf Server, nicht mehr im HTML) ──────────────────────
const SERVER_USERS = {
  // Management
  'nils.mueller':      { hash: hashPass('admin123'),      role: 'admin',    name: 'Nils Müller',       dept: 'CIO · Administrator',               color: '#3a4a7a' },
  'calisto.marcello':  { hash: hashPass('admin123'),      role: 'admin',    name: 'Calisto Marcello',  dept: 'CBO · Administrator',               color: '#3a6a4a' },
  // 1st Level
  'levi.frischknecht': { hash: hashPass('supporter123'),  role: 'admin',    name: 'Levi Frischknecht', dept: 'Win/OS Junior Engineer · 1st Level', color: '#4a5a7a' },
  'hans.meier':        { hash: hashPass('supporter123'),  role: 'admin',    name: 'Hans Meier',        dept: 'User & App Junior · 1st Level',     color: '#2a4a6a' },
  'sandra.keller':     { hash: hashPass('supporter123'),  role: 'admin',    name: 'Sandra Keller',     dept: 'User & App Jr. Tech. · 1st Level',  color: '#2a4a6a' },
  'patrick.baumann':   { hash: hashPass('supporter123'),  role: 'admin',    name: 'Patrick Baumann',   dept: 'Network Junior Engineer · 1st Level',color: '#2a4a6a' },
  // 2nd Level
  'thomas.braun':      { hash: hashPass('supporter123'),  role: 'admin',    name: 'Thomas Braun',      dept: 'Network Senior Analyst · 2nd Level', color: '#2a5a3a' },
  'yuki.tanaka':       { hash: hashPass('supporter123'),  role: 'admin',    name: 'Yuki Tanaka',       dept: 'Unix Senior Engineer · 2nd Level',  color: '#2a5a3a' },
  'marco.schaefer':    { hash: hashPass('supporter123'),  role: 'admin',    name: 'Marco Schäfer',     dept: 'Windows Senior Engineer · 2nd Level',color: '#2a5a3a' },
  'lisa.wagner':       { hash: hashPass('supporter123'),  role: 'admin',    name: 'Lisa Wagner',       dept: 'User & App Senior · 2nd Level',     color: '#2a5a3a' },
  // Onsite
  'reto.huber':        { hash: hashPass('supporter123'),  role: 'admin',    name: 'Reto Huber',        dept: 'Onsite Senior Engineer',            color: '#5a4a20' },
  'daniela.frei':      { hash: hashPass('supporter123'),  role: 'admin',    name: 'Daniela Frei',      dept: 'Onsite Junior Engineer',            color: '#5a4a20' },
  // Kunden
  'kunde1':  { hash: hashPass('kunde123'),   role: 'customer', name: 'Müller AG',        dept: 'Silver-Kunde', sla: 'Silver',   color: '#4a5060' },
  'kunde2':  { hash: hashPass('kunde123'),   role: 'customer', name: 'Schmidt GmbH',     dept: 'Gold-Kunde',   sla: 'Gold',     color: '#6a5030' },
  'kunde3':  { hash: hashPass('kunde123'),   role: 'customer', name: 'Weber Holding',    dept: 'Platinum-Kunde',sla: 'Platinum', color: '#4a4070' },
  'extern1': { hash: hashPass('extern123'),  role: 'customer', name: 'Externe Firma AG', dept: 'Extern',       sla: 'Extern',   color: '#4a2a5a' },
};

// ── Session-Tokens (in-memory, läuft bei Serverneustart ab) ─────────────────
const sessions = {}; // { token: { username, role, name, ... , expires } }

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  const user  = SERVER_USERS[username];
  sessions[token] = {
    username, role: user.role, name: user.name,
    dept: user.dept, color: user.color, sla: user.sla,
    expires: Date.now() + 8 * 60 * 60 * 1000 // 8 Stunden
  };
  return token;
}

function getSession(req) {
  const token = req.headers['x-session-token'];
  if (!token || !sessions[token]) return null;
  const s = sessions[token];
  if (Date.now() > s.expires) { delete sessions[token]; return null; }
  return s;
}

function requireAuth(req, res, next) {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Nicht angemeldet' });
  req.session = s;
  next();
}

// Cleanup abgelaufener Sessions alle 30 Min
setInterval(() => {
  const now = Date.now();
  Object.keys(sessions).forEach(t => { if (sessions[t].expires < now) delete sessions[t]; });
}, 30 * 60 * 1000);

// ── Login / Logout ───────────────────────────────────────────────────────────
// Brute-Force-Schutz
const failedAttempts = {};
const LOCK_THRESHOLD = 5;
const LOCK_DURATION  = 15 * 60 * 1000; // 15 Minuten

app.post('/api/auth/login', (req, res) => {
  const { username, password, role: expectedRole } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });

  // Brute-Force prüfen
  const fa = failedAttempts[username] || { count: 0, lockedUntil: 0 };
  if (fa.lockedUntil > Date.now()) {
    const mins = Math.ceil((fa.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({ error: `Konto gesperrt. Bitte warte ${mins} Minuten.` });
  }

  const user = SERVER_USERS[username];
  if (!user || user.hash !== hashPass(password)) {
    fa.count = (fa.count || 0) + 1;
    if (fa.count >= LOCK_THRESHOLD) fa.lockedUntil = Date.now() + LOCK_DURATION;
    failedAttempts[username] = fa;
    return res.status(401).json({
      error: 'Benutzername oder Passwort falsch.',
      attempts: fa.count,
      locked: fa.count >= LOCK_THRESHOLD
    });
  }

  // Rolle prüfen
  if (expectedRole === 'admin' && user.role !== 'admin')
    return res.status(403).json({ error: 'Kein Supporter-Zugang.' });
  if (expectedRole === 'customer' && user.role !== 'customer')
    return res.status(403).json({ error: 'Kein Kunden-Zugang.' });

  // Kunden-Account gesperrt?
  const db = readDB();
  if (user.role === 'customer') {
    const ca = (db.customerAccounts || {})[username];
    if (ca && !ca.active)
      return res.status(403).json({ error: 'Konto deaktiviert. Bitte Support kontaktieren.' });
  }

  // Login OK
  failedAttempts[username] = { count: 0, lockedUntil: 0 };
  const token = createSession(username);

  // Effektives SLA aus Kunden-Konten
  let sla = user.sla;
  if (user.role === 'customer' && db.customerAccounts?.[username]?.sla)
    sla = db.customerAccounts[username].sla;

  res.json({ token, user: { username, role: user.role, name: user.name, dept: user.dept, color: user.color, sla } });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['x-session-token'];
  if (token) delete sessions[token];
  res.json({ ok: true });
});

// Passwort ändern
app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const username = req.session.username;
  const user = SERVER_USERS[username];
  if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  if (user.hash !== hashPass(currentPassword))
    return res.status(401).json({ error: 'Aktuelles Passwort falsch' });
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'Neues Passwort muss mindestens 6 Zeichen haben' });
  SERVER_USERS[username].hash = hashPass(newPassword);
  res.json({ ok: true });
});

// ── DB initialisieren ────────────────────────────────────────────────────────
function initDB() {
  const now = new Date();
  function ts(daysAgo, h, m) {
    const d = new Date(now); d.setDate(d.getDate() - daysAgo);
    d.setHours(h, m, 0, 0); return d.toISOString();
  }
  const data = {
    tickets: [
      { id:'T-0001', title:'E-Mail-Client stürzt ab', category:'User & App', priority:'High', status:'In Bearbeitung', level:'1st', sla:'Gold', assign:'Hans Meier', reporter:'Schmidt GmbH', created:ts(0,8,14), desc:'Outlook friert beim Öffnen von Anhängen ein.', log:[{time:ts(0,8,14),who:'Hans Meier',note:'Ticket eröffnet.',type:'open'},{time:ts(0,9,0),who:'Hans Meier',note:'Office-Update eingespielt.',type:'update'}] },
      { id:'T-0002', title:'VPN-Verbindung bricht ab', category:'Network', priority:'Critical', status:'Offen', level:'2nd', sla:'Platinum', assign:'Thomas Braun', reporter:'Weber Holding', created:ts(0,9,30), desc:'Homeoffice-Mitarbeitende können keine VPN-Verbindung aufbauen.', log:[{time:ts(0,9,30),who:'Sandra Keller',note:'Weitergeleitet an 2nd Level Network.',type:'escalate'}] },
      { id:'T-0003', title:'Drucker 2. OG offline', category:'Hardware', priority:'Medium', status:'Offen', level:'1st', sla:'Silver', assign:'Patrick Baumann', reporter:'Müller AG', created:ts(1,14,22), desc:'Netzwerkdrucker HP LaserJet antwortet nicht.', log:[{time:ts(1,14,22),who:'Patrick Baumann',note:'Ticket eröffnet.',type:'open'}] },
      { id:'T-0004', title:'Linux-Server Speicher voll', category:'Unix', priority:'High', status:'Offen', level:'2nd', sla:'Gold', assign:'Yuki Tanaka', reporter:'Nils Müller', created:ts(1,11,5), desc:'/var/log Partition zu 98% belegt.', log:[{time:ts(1,11,5),who:'Hans Meier',note:'Weitergeleitet an Unix Senior.',type:'escalate'}] },
      { id:'T-0005', title:'Passwort zurücksetzen', category:'User & App', priority:'Low', status:'Gelöst', level:'1st', sla:'Silver', assign:'Levi Frischknecht', reporter:'Müller AG', created:ts(2,10,0), desc:'Benutzer hat Passwort vergessen.', log:[{time:ts(2,10,0),who:'Levi Frischknecht',note:'Passwort zurückgesetzt.',type:'resolve'}] },
      { id:'T-0006', title:'Windows Update schlägt fehl', category:'Windows/OS', priority:'Medium', status:'Gelöst', level:'2nd', sla:'Gold', assign:'Marco Schäfer', reporter:'Schmidt GmbH', created:ts(3,16,0), desc:'Fehler 0x80070002 auf 5 PCs.', log:[{time:ts(3,16,0),who:'Marco Schäfer',note:'WSUS-Cache geleert. Gelöst.',type:'resolve'}] },
    ],
    users: [],
    nextId: 7,
    customerAccounts: {
      'kunde1': { active: true, sla: 'Silver' },
      'kunde2': { active: true, sla: 'Gold'   },
      'kunde3': { active: true, sla: 'Platinum'},
      'extern1':{ active: true, sla: 'Extern'  },
    },
    callLogs: [],
    hotline:  { pikettEntries: [], hotlineQueue: [], hotlineNumber: '' },
  };
  writeDB(data);
  return data;
}

// ── Ticket-Endpunkte ─────────────────────────────────────────────────────────
app.get('/api/tickets', requireAuth, (req, res) => {
  const db = readDB(); let list = db.tickets;
  const { status, level, sla, search, priority } = req.query;
  if (status)   list = list.filter(t => t.status === status);
  if (level)    list = list.filter(t => t.level  === level);
  if (sla)      list = list.filter(t => t.sla    === sla);
  if (priority) list = list.filter(t => t.priority === priority);
  if (search) { const q = search.toLowerCase(); list = list.filter(t => t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q) || t.reporter.toLowerCase().includes(q)); }
  // Kunden sehen nur eigene Tickets
  if (req.session.role === 'customer') list = list.filter(t => t.reporter === req.session.name || t.reporter === req.session.username);
  res.json(list);
});

app.get('/api/tickets/:id', requireAuth, (req, res) => {
  const db = readDB(); const t = db.tickets.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(t);
});

app.post('/api/tickets', requireAuth, (req, res) => {
  const db = readDB();
  const { title, desc, category, priority, sla, level, assign, reporter, guestEmail, guestPhone, guestName } = req.body;
  if (!title) return res.status(400).json({ error: 'Titel erforderlich' });
  const id = 'T-' + String(db.nextId).padStart(4, '0'); db.nextId++;
  const now = new Date().toISOString();
  const ticket = { id, title, desc: desc||'', category: category||'Sonstiges', priority: priority||'Medium', status: 'Offen', level: level||'1st', sla: sla||'Silver', assign: assign||'1st Level – SPOC', reporter: reporter||req.session.name||'Unbekannt', guestEmail: guestEmail||null, guestPhone: guestPhone||null, guestName: guestName||null, created: now, log: [{time:now,who:req.session.name||'System',note:'Ticket eröffnet.',type:'open'}] };
  db.tickets.unshift(ticket); writeDB(db); res.json(ticket);
});

app.patch('/api/tickets/:id', requireAuth, (req, res) => {
  const db = readDB(); const idx = db.tickets.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });
  const t = db.tickets[idx];
  const { status, assign, level, note, who, action, invoice, feedback, reporter: newR, category: newC, priority: newP } = req.body;
  const now = new Date().toISOString();
  if (status) t.status = status; if (assign) t.assign = assign; if (level) t.level = level;
  if (newR) t.reporter = newR; if (newC) t.category = newC; if (newP) t.priority = newP;
  if (invoice)  t.invoice  = invoice;
  if (feedback) t.feedback = feedback;
  let logNote = note||''; let logType = action||'update';
  if (action === 'resolve') { t.status='Gelöst'; logNote=logNote||'Ticket gelöst.'; logType='resolve'; }
  if (action === 'close')   { t.status='Geschlossen'; logNote=logNote||'Ticket geschlossen.'; logType='close'; }
  if (logNote) t.log.push({ time: now, who: who||req.session.name||'System', note: logNote, type: logType });
  db.tickets[idx] = t; writeDB(db); res.json(t);
});

app.delete('/api/tickets/:id', requireAuth, (req, res) => {
  const db = readDB(); const idx = db.tickets.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });
  db.tickets.splice(idx, 1); writeDB(db); res.json({ ok: true });
});

app.get('/api/stats', requireAuth, (req, res) => {
  const db = readDB(); const t = db.tickets;
  res.json({ total: t.length, open: t.filter(x=>x.status==='Offen').length, inProgress: t.filter(x=>x.status==='In Bearbeitung').length, resolved: t.filter(x=>x.status==='Gelöst'||x.status==='Geschlossen').length, critical: t.filter(x=>x.priority==='Critical'&&x.status!=='Geschlossen').length });
});

app.get('/api/users', requireAuth, (req, res) => { const db = readDB(); res.json(db.users); });

// ── Kunden-Konten ────────────────────────────────────────────────────────────
app.get('/api/customer-accounts', requireAuth, (req, res) => {
  const db = readDB(); res.json(db.customerAccounts || {});
});
app.patch('/api/customer-accounts/:username', requireAuth, (req, res) => {
  const db = readDB();
  if (!db.customerAccounts) db.customerAccounts = {};
  db.customerAccounts[req.params.username] = { ...(db.customerAccounts[req.params.username]||{}), ...req.body };
  writeDB(db); res.json({ ok: true });
});

// ── Anruf-Logs ───────────────────────────────────────────────────────────────
app.get('/api/calllogs', requireAuth, (req, res) => { const db = readDB(); res.json(db.callLogs||[]); });
app.post('/api/calllogs', requireAuth, (req, res) => {
  const db = readDB(); if (!db.callLogs) db.callLogs = [];
  const entry = { id:'cl-'+Date.now(), ...req.body, time: Date.now(), by: req.session.name };
  db.callLogs.unshift(entry); if (db.callLogs.length>200) db.callLogs=db.callLogs.slice(0,200);
  writeDB(db); res.json(entry);
});
app.delete('/api/calllogs/:id', requireAuth, (req, res) => {
  const db = readDB(); db.callLogs=(db.callLogs||[]).filter(c=>c.id!==req.params.id);
  writeDB(db); res.json({ ok: true });
});

// ── Hotline-State ────────────────────────────────────────────────────────────
app.get('/api/hotline', requireAuth, (req, res) => { const db = readDB(); res.json(db.hotline||{pikettEntries:[],hotlineQueue:[],hotlineNumber:''}); });
app.post('/api/hotline', requireAuth, (req, res) => { const db = readDB(); db.hotline = req.body; writeDB(db); res.json({ ok: true }); });

// ── E-Mail via Resend (kostenlos bis 3000/Monat) ─────────────────────────────
app.post('/api/email', requireAuth, async (req, res) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.json({ ok: false, reason: 'Kein RESEND_API_KEY konfiguriert' });
  const { to, subject, html } = req.body;
  try {
    const https = require('https');
    const body  = JSON.stringify({ from: 'helpdesk@ict-consulting.ch', to, subject, html });
    const opts  = { hostname:'api.resend.com', path:'/emails', method:'POST', headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} };
    await new Promise((resolve,reject) => {
      const r = https.request(opts, resp => { let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>resolve(d)); });
      r.on('error',reject); r.write(body); r.end();
    });
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, reason: e.message }); }
});

// ── Gastzugang (kein requireAuth) ────────────────────────────────────────────
app.post('/api/tickets/guest', (req, res) => {
  const db = readDB();
  const { title, desc, category, priority, guestEmail, guestPhone, guestName } = req.body;
  if (!title || !guestEmail) return res.status(400).json({ error: 'Titel und E-Mail erforderlich' });
  const id = 'T-' + String(db.nextId).padStart(4, '0'); db.nextId++;
  const now = new Date().toISOString();
  const ticket = { id, title, desc: desc||'', category: category||'Sonstiges', priority: priority||'Medium', status:'Offen', level:'1st', sla:'Extern', assign:'1st Level – SPOC', reporter: guestName||guestEmail, guestEmail, guestPhone: guestPhone||null, guestName: guestName||null, created: now, log:[{time:now,who:'System',note:`Gast-Ticket: ${guestEmail}`,type:'open'}] };
  db.tickets.unshift(ticket); writeDB(db); res.json(ticket);
});

// ── Frontend ─────────────────────────────────────────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ICT Helpdesk läuft auf Port ${PORT}`);
  readDB();
});
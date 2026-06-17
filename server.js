const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_PATH = path.join(__dirname, 'db.json');

function readDB() {
  if (!fs.existsSync(DB_PATH)) return initDB();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function initDB() {
  const now = new Date();
  function ts(daysAgo, h, m) {
    const d = new Date(now); d.setDate(d.getDate() - daysAgo);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }
  const data = {
    tickets: [
      { id: 'T-0001', title: 'E-Mail-Client stürzt ab', category: 'User & App', priority: 'High', status: 'In Bearbeitung', level: '1st', sla: 'Gold', assign: '1st Level – SPOC', reporter: 'Hans Meier', created: ts(0,8,14), desc: 'Outlook friert beim Öffnen von Anhängen ein. Betrifft 3 Mitarbeitende im Sekretariat.', log: [{time:ts(0,8,14),who:'SPOC',note:'Ticket eröffnet. Prüfe Outlook-Version.',type:'open'},{time:ts(0,9,0),who:'SPOC',note:'Office-Update eingespielt, Problem besteht weiter.',type:'update'}] },
      { id: 'T-0002', title: 'VPN-Verbindung bricht ab', category: 'Network', priority: 'Critical', status: 'Offen', level: '2nd', sla: 'Platinum', assign: 'Network Senior', reporter: 'IT-Abteilung', created: ts(0,9,30), desc: 'Mehrere Homeoffice-Mitarbeitende können keine VPN-Verbindung aufbauen. Produktionsausfall.', log: [{time:ts(0,9,30),who:'SPOC',note:'Ticket aufgenommen, sofort an 2nd Level Network weitergeleitet.',type:'escalate'},{time:ts(0,9,35),who:'Network Senior',note:'Analyse gestartet. Firewall-Logs werden geprüft.',type:'update'}] },
      { id: 'T-0003', title: 'Drucker 2. OG offline', category: 'Hardware', priority: 'Medium', status: 'Offen', level: '1st', sla: 'Silver', assign: '1st Level – SPOC', reporter: 'Sandra Keller', created: ts(1,14,22), desc: 'Netzwerkdrucker HP LaserJet antwortet nicht mehr. Neustart brachte keine Abhilfe.', log: [{time:ts(1,14,22),who:'SPOC',note:'Ticket eröffnet. Drucker-IP nicht erreichbar.',type:'open'}] },
      { id: 'T-0004', title: 'Linux-Server Speicher voll', category: 'Unix', priority: 'High', status: 'Offen', level: '2nd', sla: 'Gold', assign: 'Unix Senior', reporter: 'Nils Müller', created: ts(1,11,5), desc: '/var/log Partition zu 98% belegt. Dienste drohen auszufallen.', log: [{time:ts(1,11,5),who:'SPOC',note:'Weitergeleitet an Unix Senior.',type:'escalate'},{time:ts(1,11,20),who:'Unix Senior',note:'Log-Rotation wird geprüft.',type:'update'}] },
      { id: 'T-0005', title: 'Passwort zurücksetzen', category: 'User & App', priority: 'Low', status: 'Gelöst', level: '1st', sla: 'Silver', assign: '1st Level – SPOC', reporter: 'Levi Frischknecht', created: ts(2,10,0), desc: 'Benutzer hat Passwort vergessen.', log: [{time:ts(2,10,0),who:'SPOC',note:'Passwort zurückgesetzt.',type:'update'},{time:ts(2,10,5),who:'SPOC',note:'Ticket gelöst.',type:'resolve'}] },
      { id: 'T-0006', title: 'Windows Update schlägt fehl', category: 'Windows/OS', priority: 'Medium', status: 'Gelöst', level: '2nd', sla: 'Gold', assign: 'Windows Senior', reporter: 'IT-Abteilung', created: ts(3,16,0), desc: 'Windows Update Fehler 0x80070002 auf 5 PCs.', log: [{time:ts(3,16,0),who:'SPOC',note:'Weitergeleitet an Windows Senior.',type:'escalate'},{time:ts(3,17,30),who:'Windows Senior',note:'WSUS-Cache geleert. Updates erfolgreich.',type:'resolve'}] },
      { id: 'T-0007', title: 'SAP-Lizenzdatei abgelaufen', category: 'User & App', priority: 'Critical', status: 'Geschlossen', level: '3rd', sla: 'Platinum', assign: 'Extern beim Hersteller', reporter: 'Calisto Marcello', created: ts(7,8,0), desc: 'SAP-Lizenz lief ab. Hersteller muss neue Lizenz einspielen.', log: [{time:ts(7,8,0),who:'SPOC',note:'Eskalation 3rd Level – SAP AG kontaktiert.',type:'escalate'},{time:ts(5,14,0),who:'SAP AG',note:'Neue Lizenz eingespielt, System läuft.',type:'resolve'}] },
    ],
    users: [
      { id:'u1', name:'Hans Meier', role:'User & App Junior', group:'1st', email:'h.meier@ict-consulting.ch' },
      { id:'u2', name:'Sandra Keller', role:'Network Junior Engineer', group:'1st', email:'s.keller@ict-consulting.ch' },
      { id:'u3', name:'Patrick Baumann', role:'Win/OS Junior Engineer', group:'1st', email:'p.baumann@ict-consulting.ch' },
      { id:'u4', name:'Thomas Braun', role:'Network Senior Analyst', group:'2nd', email:'t.braun@ict-consulting.ch' },
      { id:'u5', name:'Yuki Tanaka', role:'Unix Senior Engineer', group:'2nd', email:'y.tanaka@ict-consulting.ch' },
      { id:'u6', name:'Marco Schäfer', role:'Windows Senior Engineer', group:'2nd', email:'m.schaefer@ict-consulting.ch' },
      { id:'u7', name:'Nils Müller', role:'CIO / Admin', group:'mgmt', email:'n.mueller@ict-consulting.ch' },
    ],
    nextId: 8
  };
  writeDB(data);
  return data;
}

// GET all tickets (with filters)
app.get('/api/tickets', (req, res) => {
  const db = readDB();
  let list = db.tickets;
  const { status, level, sla, search, priority } = req.query;
  if (status) list = list.filter(t => t.status === status);
  if (level) list = list.filter(t => t.level === level);
  if (sla) list = list.filter(t => t.sla === sla);
  if (priority) list = list.filter(t => t.priority === priority);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      t.reporter.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    );
  }
  res.json(list);
});

// GET single ticket
app.get('/api/tickets/:id', (req, res) => {
  const db = readDB();
  const t = db.tickets.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json(t);
});

// POST create ticket
app.post('/api/tickets', (req, res) => {
  const db = readDB();
  const { title, desc, category, priority, sla, level, assign, reporter } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const id = 'T-' + String(db.nextId).padStart(4, '0');
  db.nextId++;
  const now = new Date().toISOString();
  const ticket = { id, title, desc: desc||'', category: category||'User & App', priority: priority||'Medium', status: 'Offen', level: level||'1st', sla: sla||'Silver', assign: assign||'1st Level – SPOC', reporter: reporter||'Unbekannt', created: now, log: [{time:now,who:'System',note:'Ticket eröffnet.',type:'open'}] };
  db.tickets.unshift(ticket);
  writeDB(db);
  res.json(ticket);
});

// PATCH update ticket (status, assign, level, add log entry)
app.patch('/api/tickets/:id', (req, res) => {
  const db = readDB();
  const idx = db.tickets.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const t = db.tickets[idx];
  const { status, assign, level, note, who, action } = req.body;
  const now = new Date().toISOString();

  if (status) t.status = status;
  if (assign) t.assign = assign;
  if (level) t.level = level;

  let logNote = note || '';
  let logType = action || 'update';

  if (action === 'resolve') {
    t.status = 'Gelöst';
    logNote = logNote || 'Ticket als gelöst markiert.';
    logType = 'resolve';
  }
  if (action === 'close') {
    t.status = 'Geschlossen';
    logNote = logNote || 'Ticket geschlossen.';
    logType = 'close';
  }
  if (action === 'escalate') {
    const levels = ['1st','2nd','3rd'];
    const ci = levels.indexOf(t.level);
    if (ci < levels.length - 1) {
      t.level = levels[ci + 1];
      const assignMap = { '1st': 'Network Senior', '2nd': 'Extern beim Hersteller' };
      t.assign = assignMap[levels[ci]] || t.assign;
      logNote = logNote || `Weitergeleitet an ${t.level} Level — ${t.assign}`;
      logType = 'escalate';
    }
  }

  if (logNote) {
    t.log.push({ time: now, who: who || 'System', note: logNote, type: logType });
  }

  db.tickets[idx] = t;
  writeDB(db);
  res.json(t);
});

// DELETE ticket
app.delete('/api/tickets/:id', (req, res) => {
  const db = readDB();
  const idx = db.tickets.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  db.tickets.splice(idx, 1);
  writeDB(db);
  res.json({ ok: true });
});

// GET stats
app.get('/api/stats', (req, res) => {
  const db = readDB();
  const t = db.tickets;
  res.json({
    total: t.length,
    open: t.filter(x => x.status === 'Offen').length,
    inProgress: t.filter(x => x.status === 'In Bearbeitung').length,
    resolved: t.filter(x => x.status === 'Gelöst' || x.status === 'Geschlossen').length,
    critical: t.filter(x => x.priority === 'Critical' && x.status !== 'Geschlossen').length,
    byLevel: {
      '1st': t.filter(x => x.level === '1st').length,
      '2nd': t.filter(x => x.level === '2nd').length,
      '3rd': t.filter(x => x.level === '3rd').length,
    },
    bySla: {
      Silver: t.filter(x => x.sla === 'Silver').length,
      Gold: t.filter(x => x.sla === 'Gold').length,
      Platinum: t.filter(x => x.sla === 'Platinum').length,
    }
  });
});

// GET users
app.get('/api/users', (req, res) => {
  const db = readDB();
  res.json(db.users);
});

// Serve frontend for all other routes
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`ICT Helpdesk Ticketsystem läuft auf http://localhost:${PORT}`);
  readDB(); // initialize DB if not exists
});

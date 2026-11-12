const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = './app.db';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS site_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  config TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  photo_url TEXT,
  balance INTEGER DEFAULT 0,
  inventory TEXT DEFAULT '[]',
  last_free_case INTEGER DEFAULT 0
);
`);

const defaultConfig = {
  siteConfig: {
    logoText: "Him", logoAccent: "Up", accentColor: "#7c3aed",
    rocketImage: "🚀", bannerRocket: "🚀", bannerMines: "💣", splashSticker: "🎁"
  },
  CASES: {
    free: { id: 'free', title: 'Бесплатный', price: 0, isFree: true, mainImg: '🎁', rewards: [{ type: 'sticker', name: 'Стикер', chance: 100, img: '🎨', sellPrice: 5 }] },
    himup: { id: 'himup', title: 'HimUp', price: 150, mainImg: '🔥', rewards: [{ type: 'sticker', name: 'Премиум', chance: 90, img: '👑', sellPrice: 100 }] }
  }
};

const existing = db.prepare('SELECT id FROM site_config WHERE id = 1').get();
if (!existing) {
  db.prepare('INSERT INTO site_config (id, config) VALUES (1, ?)').run(JSON.stringify(defaultConfig));
}

app.get('/api/config', (req, res) => {
  try {
    const row = db.prepare('SELECT config FROM site_config WHERE id = 1').get();
    res.json(JSON.parse(row.config));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config', (req, res) => {
  try {
    db.prepare('UPDATE site_config SET config = ? WHERE id = 1').run(JSON.stringify(req.body));
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/player/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
    if (row) {
      row.inventory = JSON.parse(row.inventory);
      res.json(row);
    } else {
      res.json(null);
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/player/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { username, first_name, photo_url, balance, inventory, last_free_case } = req.body;
    const existing = db.prepare('SELECT id FROM players WHERE id = ?').get(id);
    if (existing) {
      db.prepare('UPDATE players SET balance = ?, inventory = ?, last_free_case = ? WHERE id = ?')
        .run(balance, JSON.stringify(inventory), last_free_case, id);
    } else {
      db.prepare('INSERT INTO players (id, username, first_name, photo_url, balance, inventory, last_free_case) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, username, first_name, photo_url, balance, JSON.stringify(inventory), last_free_case);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/top', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, first_name, username, photo_url, balance FROM players ORDER BY balance DESC LIMIT 10').all();
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/give', (req, res) => {
  try {
    const { id, sum } = req.body;
    const player = db.prepare('SELECT balance FROM players WHERE id = ?').get(id);
    if (!player) return res.json({ success: false, error: 'Player not found' });
    db.prepare('UPDATE players SET balance = balance + ? WHERE id = ?').run(sum, id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`База: ${path.resolve(DB_PATH)}`);
});

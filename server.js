const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = './app.db';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

let db = null;

// ==== ИНИЦИАЛИЗАЦИЯ БАЗЫ ====
async function initDB() {
  const SQL = await initSqlJs();
  
  // Если файл уже есть — загружаем
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  db.run(`
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
  
  // Дефолтный конфиг
  const res = db.exec('SELECT id FROM site_config WHERE id = 1');
  if (!res.length || !res[0].values.length) {
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
    db.run('INSERT INTO site_config (id, config) VALUES (1, ?)', [JSON.stringify(defaultConfig)]);
  }
  
  saveDB();
  console.log("База данных инициализирована");
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ==== API ====

app.get('/api/config', (req, res) => {
  try {
    const res1 = db.exec('SELECT config FROM site_config WHERE id = 1');
    if (!res1.length) return res.json({});
    const config = JSON.parse(res1[0].values[0][0]);
    res.json(config);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config', (req, res) => {
  try {
    db.run('UPDATE site_config SET config = ? WHERE id = 1', [JSON.stringify(req.body)]);
    saveDB();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/player/:id', (req, res) => {
  try {
    const res1 = db.exec('SELECT * FROM players WHERE id = ?', [req.params.id]);
    if (!res1.length || !res1[0].values.length) return res.json(null);
    const cols = res1[0].columns;
    const vals = res1[0].values[0];
    const player = {};
    cols.forEach((c, i) => player[c] = vals[i]);
    player.inventory = JSON.parse(player.inventory || '[]');
    res.json(player);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/player/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { username, first_name, photo_url, balance, inventory, last_free_case } = req.body;
    const res1 = db.exec('SELECT id FROM players WHERE id = ?', [id]);
    if (res1.length && res1[0].values.length) {
      db.run('UPDATE players SET balance = ?, inventory = ?, last_free_case = ? WHERE id = ?',
        [balance, JSON.stringify(inventory), last_free_case, id]);
    } else {
      db.run('INSERT INTO players (id, username, first_name, photo_url, balance, inventory, last_free_case) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, username, first_name, photo_url, balance, JSON.stringify(inventory), last_free_case]);
    }
    saveDB();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/top', (req, res) => {
  try {
    const res1 = db.exec('SELECT id, first_name, username, photo_url, balance FROM players ORDER BY balance DESC LIMIT 10');
    if (!res1.length) return res.json([]);
    const cols = res1[0].columns;
    const players = res1[0].values.map(vals => {
      const p = {};
      cols.forEach((c, i) => p[c] = vals[i]);
      return p;
    });
    res.json(players);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/give', (req, res) => {
  try {
    const { id, sum } = req.body;
    const res1 = db.exec('SELECT balance FROM players WHERE id = ?', [id]);
    if (!res1.length || !res1[0].values.length) return res.json({ success: false, error: 'Player not found' });
    db.run('UPDATE players SET balance = balance + ? WHERE id = ?', [sum, id]);
    saveDB();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error("Ошибка БД:", err);
});

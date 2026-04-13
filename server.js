const express = require('express');
const path = require('path');
const fs = require('fs');
const { execSync, exec } = require('child_process');

const app = express();
const PORT = 3100;
const BACKGROUNDS_DIR = path.join(__dirname, 'backgrounds');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Load/save config (persists Fire TV IP)
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

function getLocalIP() {
  const nets = require('os').networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return 'localhost';
}

const ADB = path.join(__dirname, 'platform-tools', 'adb');

function adb(cmd) {
  const config = loadConfig();
  const tvIP = config.firetvIP;
  if (!tvIP) throw new Error('Fire TV IP not configured. Call /api/firetv/setup?ip=FIRE_TV_IP first');
  return execSync(`${ADB} -s ${tvIP}:5555 ${cmd}`, { encoding: 'utf8', timeout: 10000 });
}

// Supported file types
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov']);
const MEDIA_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS]);

// State — restore last selection from config
const _saved = loadConfig();
let currentFile = _saved.lastFile || null;
let currentMode = _saved.lastMode || 'image';
let currentColor = _saved.lastColor || '#000000';
let transitionDuration = 1.0; // seconds
const sseClients = new Set();

function saveState() {
  const config = loadConfig();
  config.lastFile = currentFile;
  config.lastMode = currentMode;
  config.lastColor = currentColor;
  saveConfig(config);
}

// Ensure backgrounds dir exists
if (!fs.existsSync(BACKGROUNDS_DIR)) {
  fs.mkdirSync(BACKGROUNDS_DIR, { recursive: true });
}

// No-cache headers for all API routes
app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/backgrounds', express.static(BACKGROUNDS_DIR));
app.use(express.json());

// SSE endpoint — Fire TV display page connects here for real-time updates
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Send current state immediately on connect
  res.write(`data: ${JSON.stringify(getState())}\n\n`);

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function getState() {
  return {
    mode: currentMode,
    file: currentFile,
    color: currentColor,
    transition: transitionDuration,
    display: currentFile && isLogo(currentFile) ? 'logo' : 'cover',
  };
}

function isVideo(filename) {
  return VIDEO_EXTS.has(path.extname(filename).toLowerCase());
}

function isLogo(filename) {
  return /[-_]logo\./i.test(filename);
}

function getMediaList() {
  return fs.readdirSync(BACKGROUNDS_DIR)
    .filter(f => MEDIA_EXTS.has(path.extname(f).toLowerCase()))
    .sort();
}

function broadcast() {
  const data = JSON.stringify(getState());
  for (const client of sseClients) {
    client.write(`data: ${data}\n\n`);
  }
  saveState();
}

// List available media files
app.get('/api/images', (req, res) => {
  const files = getMediaList();
  res.json({ images: files, current: currentFile });
});

// Get current state
app.get('/api/current', (req, res) => {
  res.json(getState());
});

// Set background image — this is what Stream Deck buttons call
// POST /api/set  { "image": "filename.jpg" }
// or GET /api/set?image=filename.jpg (for simple curl/Stream Deck URL actions)
app.all('/api/set', (req, res) => {
  const file = req.body?.image || req.query?.image || req.body?.file || req.query?.file;
  if (!file) {
    return res.status(400).json({ error: 'image/file parameter required' });
  }

  const basename = path.basename(file);
  const filePath = path.join(BACKGROUNDS_DIR, basename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `File not found: ${basename}` });
  }

  currentFile = basename;
  currentMode = isVideo(basename) ? 'video' : 'image';
  broadcast();
  res.json({ ok: true, ...getState() });
});

// Set solid colour background
// GET /api/color?hex=0f171f
app.all('/api/color', (req, res) => {
  const hex = req.body?.hex || req.query?.hex;
  if (!hex) {
    return res.status(400).json({ error: 'hex parameter required (e.g. 0f171f)' });
  }

  currentColor = hex.startsWith('#') ? hex : `#${hex}`;
  currentMode = 'color';
  currentFile = null;
  broadcast();
  res.json({ ok: true, ...getState() });
});

// Set transition duration
app.all('/api/transition', (req, res) => {
  const duration = parseFloat(req.body?.duration || req.query?.duration);
  if (isNaN(duration) || duration < 0) {
    return res.status(400).json({ error: 'duration parameter required (seconds)' });
  }
  transitionDuration = duration;
  broadcast();
  res.json({ ok: true, transition: transitionDuration });
});

// Cycle to next media file
app.all('/api/next', (req, res) => {
  const files = getMediaList();
  if (files.length === 0) return res.status(404).json({ error: 'No media in backgrounds/' });

  const idx = files.indexOf(currentFile);
  currentFile = files[(idx + 1) % files.length];
  currentMode = isVideo(currentFile) ? 'video' : 'image';
  broadcast();
  res.json({ ok: true, ...getState() });
});

// Cycle to previous media file
app.all('/api/prev', (req, res) => {
  const files = getMediaList();
  if (files.length === 0) return res.status(404).json({ error: 'No media in backgrounds/' });

  const idx = files.indexOf(currentFile);
  currentFile = files[(idx - 1 + files.length) % files.length];
  currentMode = isVideo(currentFile) ? 'video' : 'image';
  broadcast();
  res.json({ ok: true, ...getState() });
});

// Blank screen (go black)
app.all('/api/blank', (req, res) => {
  currentColor = '#000000';
  currentMode = 'color';
  currentFile = null;
  broadcast();
  res.json({ ok: true, ...getState() });
});

// ── Fire TV ADB control ──

// Save Fire TV IP and connect via ADB
app.all('/api/firetv/setup', (req, res) => {
  const ip = req.body?.ip || req.query?.ip;
  if (!ip) return res.status(400).json({ error: 'ip parameter required' });

  const config = loadConfig();
  config.firetvIP = ip;
  saveConfig(config);

  try {
    const out = execSync(`${ADB} connect ${ip}:5555`, { encoding: 'utf8', timeout: 10000 });
    res.json({ ok: true, ip, adb: out.trim() });
  } catch (err) {
    res.json({ ok: false, ip, error: err.message, hint: 'Enable ADB debugging on Fire TV: Settings > My Fire TV > Developer Options > ADB Debugging' });
  }
});

// Launch Silk browser in fullscreen on Fire TV pointing at the display page
app.all('/api/firetv/launch', (req, res) => {
  try {
    const localIP = getLocalIP();
    const url = `http://${localIP}:${PORT}`;
    // Disable screensaver and set max screen timeout
    adb('shell settings put secure screensaver_enabled 0');
    adb('shell settings put system screen_off_timeout 28800000');
    // Force stop Silk first for a clean launch
    adb('shell am force-stop com.amazon.cloud9');
    // Set immersive mode before launching
    adb('shell settings put global policy_control immersive.full=com.amazon.cloud9');
    // Launch Silk with the URL
    adb(`shell am start -a android.intent.action.VIEW -d "${url}" com.amazon.cloud9`);
    // After Silk loads, re-apply immersive mode to hide URL bar and system UI
    setTimeout(() => {
      try {
        adb('shell settings put global policy_control immersive.full=com.amazon.cloud9');
        adb('shell settings put system pointer_speed -7');
      } catch {}
    }, 3000);
    // Second pass after page fully loads
    setTimeout(() => {
      try {
        adb('shell settings put global policy_control immersive.full=com.amazon.cloud9');
      } catch {}
    }, 6000);
    res.json({ ok: true, url, message: 'Silk launched in fullscreen on Fire TV' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Wake up Fire TV (if screen is off)
app.all('/api/firetv/wake', (req, res) => {
  try {
    adb('shell input keyevent KEYCODE_WAKEUP');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sleep Fire TV
app.all('/api/firetv/sleep', (req, res) => {
  try {
    adb('shell input keyevent KEYCODE_SLEEP');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Logo fetcher ──

const { fetchLogo } = require('./fetch-logo');

app.all('/api/logo', async (req, res) => {
  const company = req.body?.company || req.query?.company;
  const domain = req.body?.domain || req.query?.domain;
  if (!company) return res.status(400).json({ error: 'company parameter required' });

  try {
    const result = await fetchLogo(company, domain || null);
    if (result.ok) {
      // Auto-set as current background
      currentFile = result.filename;
      currentMode = result.filename.endsWith('.mp4') ? 'video' : 'image';
      broadcast();
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Chromecast control ──

const CATT = path.join(process.env.HOME, 'Library/Python/3.9/bin/catt');

function catt(args) {
  const config = loadConfig();
  const device = config.chromecastName;
  const deviceFlag = device ? `-d "${device}"` : '';
  return execSync(`${CATT} ${deviceFlag} ${args}`, {
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, PATH: `${path.dirname(CATT)}:${process.env.PATH}` },
  });
}

// Scan for Chromecasts on the network
app.all('/api/chromecast/scan', (req, res) => {
  try {
    const out = execSync(`${CATT} scan`, {
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, PATH: `${path.dirname(CATT)}:${process.env.PATH}` },
    });
    const devices = out.trim().split('\n').filter(Boolean).map(line => {
      const match = line.match(/^([\d.]+)\s+-\s+(.+?)(?:\s+-\s+(.+))?$/);
      return match ? { ip: match[1], name: match[2].trim(), model: (match[3] || '').trim() } : { raw: line };
    });
    res.json({ ok: true, devices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save Chromecast device name
app.all('/api/chromecast/setup', (req, res) => {
  const name = req.body?.name || req.query?.name;
  if (!name) return res.status(400).json({ error: 'name parameter required (device name from /api/chromecast/scan)' });

  const config = loadConfig();
  config.chromecastName = name;
  saveConfig(config);
  res.json({ ok: true, name });
});

// Cast display page to Chromecast
app.all('/api/chromecast/launch', (req, res) => {
  try {
    const localIP = getLocalIP();
    const url = `http://${localIP}:${PORT}`;
    catt(`cast_site ${url}`);
    res.json({ ok: true, url, message: 'Display page cast to Chromecast' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stop casting
app.all('/api/chromecast/stop', (req, res) => {
  try {
    catt('stop');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  const config = loadConfig();
  res.json({ status: 'ok', uptime: process.uptime(), clients: sseClients.size, firetvIP: config.firetvIP || null });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Fire TV Background Server running on http://0.0.0.0:${PORT}`);
  console.log(`Display URL (open on Fire TV): http://<your-mac-ip>:${PORT}`);
  console.log(`Backgrounds directory: ${BACKGROUNDS_DIR}`);
});

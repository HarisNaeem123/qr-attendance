const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const IS_VERCEL = process.env.VERCEL || process.env.NOW_REGION;
const DEFAULT_DATA_FILE = path.join(__dirname, 'data', 'attendance.json');
const DATA_FILE = IS_VERCEL ? path.join('/tmp', 'attendance.json') : DEFAULT_DATA_FILE;

// JSONBin.io config — set JSONBIN_API_KEY and JSONBIN_BIN_ID in Vercel env vars
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY || '';
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID || '';
const USE_JSONBIN = IS_VERCEL && JSONBIN_API_KEY && JSONBIN_BIN_ID;

let memoryStore = null;

// ─── JSONBin helpers ──────────────────────────────────────────────────────────

function jsonbinRequest(method, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.jsonbin.io',
      path: `/v3/b/${JSONBIN_BIN_ID}`,
      method,
      headers: {
        'X-Master-Key': JSONBIN_API_KEY,
        'Content-Type': 'application/json',
        'X-Bin-Versioning': 'false'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSONBin parse error: ' + data));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function loadFromJsonBin() {
  try {
    const result = await jsonbinRequest('GET');
    if (result && result.record) {
      return result.record;
    }
  } catch (err) {
    console.error('JSONBin read error:', err.message);
  }
  return null;
}

async function saveToJsonBin(data) {
  try {
    await jsonbinRequest('PUT', data);
    return true;
  } catch (err) {
    console.error('JSONBin write error:', err.message);
    return false;
  }
}

// ─── Local file helpers ───────────────────────────────────────────────────────

const DEFAULT_MEETING = {
  projectName: 'Al Rahayel Stormwater Network Extension',
  employer: 'AD Ports Groups',
  consultant: 'KN International Architect and Engineers LLC.',
  contractor: 'Desert Man Transporting & Contracting L.L.C',
  meetingTitle: 'DMTC - CSR Initiative Housekeeping Campaign',
  meetingDate: '21 Sep- 2026',
  meetingTime: '9:00 AM',
  meetingOrganizer: 'DMTC'
};

function loadFromFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } else if (fs.existsSync(DEFAULT_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DEFAULT_DATA_FILE, 'utf8'));
      saveToFile(data);
      return data;
    }
  } catch (err) {
    console.error('File read error:', err);
  }
  return { meeting: { ...DEFAULT_MEETING }, attendees: [] };
}

function saveToFile(data) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('File write error:', err);
    return false;
  }
}

// ─── Unified load / save ──────────────────────────────────────────────────────

async function loadData() {
  if (USE_JSONBIN) {
    // Always read fresh from JSONBin on Vercel (no stale memoryStore)
    const remote = await loadFromJsonBin();
    if (remote) {
      memoryStore = remote;
      return memoryStore;
    }
  }

  // Fallback: memory cache or file
  if (memoryStore) return memoryStore;
  memoryStore = loadFromFile();
  return memoryStore;
}

async function saveData(data) {
  memoryStore = data;
  if (USE_JSONBIN) {
    await saveToJsonBin(data);
  }
  // Always also write to local file (tmp on Vercel, data/ locally)
  saveToFile(data);
}

// ─── Network helpers ──────────────────────────────────────────────────────────

function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const isWifi = /wi-?fi|wlan/i.test(name);
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('192.168.56.') && !net.address.startsWith('169.254.')) {
        if (isWifi) return net.address;
      }
    }
  }
  return 'localhost';
}

function getBaseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (req?.headers?.['x-forwarded-host']) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    return `${proto}://${req.headers['x-forwarded-host']}`;
  }
  if (req?.headers?.host && !req.headers.host.includes('localhost') && !req.headers.host.startsWith('127.0.0.1')) {
    const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    return `${proto}://${req.headers.host}`;
  }
  const lanIp = getLocalNetworkIp();
  return `http://${lanIp}:${PORT}`;
}

// ─── API Routes ───────────────────────────────────────────────────────────────

app.get('/api/server-info', (req, res) => {
  const lanIp = getLocalNetworkIp();
  const baseUrl = getBaseUrl(req);
  res.json({ port: PORT, lanIp, baseUrl, localUrl: `http://localhost:${PORT}`, networkUrl: baseUrl, attendUrl: `${baseUrl}/attend` });
});

app.get('/api/meeting', async (req, res) => {
  const data = await loadData();
  res.json(data.meeting || {});
});

app.post('/api/meeting', async (req, res) => {
  const data = await loadData();
  data.meeting = { ...data.meeting, ...req.body };
  await saveData(data);
  res.json({ success: true, meeting: data.meeting });
});

app.get('/api/attendees', async (req, res) => {
  const data = await loadData();
  res.json(data.attendees || []);
});

app.post('/api/attendees', async (req, res) => {
  const { name, designation, organization, email, phone, signature } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Name is required' });
  }

  const data = await loadData();
  const newAttendee = {
    id: 'att-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    name: name.trim(),
    designation: (designation || '').trim(),
    organization: (organization || '').trim(),
    email: (email || '').trim(),
    phone: (phone || '').trim(),
    signature: signature || '',
    submittedAt: new Date().toISOString()
  };

  data.attendees.push(newAttendee);
  await saveData(data);

  res.status(201).json({ success: true, message: 'Attendance recorded successfully', attendee: newAttendee, totalCount: data.attendees.length });
});

// Sync / restore attendees endpoint
app.post('/api/attendees/sync', async (req, res) => {
  const { attendees } = req.body;
  if (!Array.isArray(attendees)) {
    return res.status(400).json({ error: 'attendees must be an array' });
  }
  const data = await loadData();
  data.attendees = attendees;
  await saveData(data);
  res.json({ success: true, count: data.attendees.length });
});

app.delete('/api/attendees/:id', async (req, res) => {
  const data = await loadData();
  const initialLength = data.attendees.length;
  data.attendees = data.attendees.filter(a => a.id !== req.params.id);

  if (data.attendees.length === initialLength) {
    return res.status(404).json({ error: 'Attendee not found' });
  }

  await saveData(data);
  res.json({ success: true, remaining: data.attendees.length });
});

app.post('/api/reset', async (req, res) => {
  const { mode } = req.body;
  const data = await loadData();

  if (mode === 'clear') {
    data.attendees = [];
  } else if (mode === 'sample') {
    data.attendees = [
      { id: 'att-1', name: 'Hisham Taha', designation: 'RE', organization: 'KN International', email: 'hisham.elmagamr@kn-uae.com', phone: '0556642253', signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M10 25 Q25 5 45 28 T80 20 T110 32' stroke='%23000' stroke-width='2' fill='none'/></svg>", submittedAt: '2026-09-09T08:52:10Z' },
      { id: 'att-2', name: 'Mukhtiar Hussain', designation: 'HSEE', organization: 'KN International', email: 'mukhtiar.hussain@kn-uae.com', phone: '0507505342', signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M15 15 L35 30 L60 10 L85 35 L105 18' stroke='%23000' stroke-width='2' fill='none'/></svg>", submittedAt: '2026-09-09T08:54:22Z' },
      { id: 'att-3', name: 'Mahmoud Ghadban', designation: 'PM', organization: 'DMTC', email: 'mahmoud.ghadban@desertmangt.com', phone: '0503120459', signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M10 20 C30 5, 50 35, 70 15 S110 25, 115 18' stroke='%23000' stroke-width='2' fill='none'/></svg>", submittedAt: '2026-09-09T08:55:01Z' },
      { id: 'att-4', name: 'Rajesh Gopalan', designation: 'CM', organization: 'DMTC', email: 'rajesh@desertmangt.com', phone: '0503148938', signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M12 28 Q40 5 65 25 T110 20' stroke='%23000' stroke-width='2' fill='none'/></svg>", submittedAt: '2026-09-09T08:56:15Z' },
      { id: 'att-5', name: 'Gul Yar', designation: 'Foreman', organization: 'DMTC', email: 'gul.yar@desertmangt.com', phone: '0545869133', signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M10 18 C25 28, 45 8, 70 26 S100 12, 110 30' stroke='%23000' stroke-width='2' fill='none'/></svg>", submittedAt: '2026-09-09T08:57:30Z' },
      { id: 'att-6', name: 'Umair Saeed', designation: 'HSEO', organization: 'DMTC', email: 'Umair.saeed@desertmangt.com', phone: '0566140605', signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M15 30 Q30 5 55 20 T95 15 L110 28' stroke='%23000' stroke-width='2' fill='none'/></svg>", submittedAt: '2026-09-09T08:58:05Z' },
      { id: 'att-7', name: 'Nikil Santosh', designation: 'QA/QC', organization: 'DMTC', email: 'Nikil.santosh@desrtmangt.com', phone: '0545397896', signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M10 15 L40 32 L75 12 L105 25' stroke='%23000' stroke-width='2' fill='none'/></svg>", submittedAt: '2026-09-09T08:59:12Z' },
      { id: 'att-8', name: 'Bilal Asghar', designation: 'QS', organization: 'DMTC', email: 'Bilal.asghar@desertmangt.com', phone: '0503453619', signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M15 22 Q45 8 75 28 T115 15' stroke='%23000' stroke-width='2' fill='none'/></svg>", submittedAt: '2026-09-09T08:59:45Z' },
      { id: 'att-9', name: 'Shankar', designation: 'Gen Foreman', organization: 'DMTC', email: 'Shankar.tulay@desrtmangt.com', phone: '0564112141', signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M12 25 C30 10, 60 30, 85 15 S105 28, 115 20' stroke='%23000' stroke-width='2' fill='none'/></svg>", submittedAt: '2026-09-09T09:00:02Z' },
      { id: 'att-10', name: 'Ahmed Kaud', designation: 'Site Engineer', organization: 'DMTC', email: 'Ahmed.kaud@desertmangt.com', phone: '0502996921', signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M10 30 Q35 10 70 25 T110 18' stroke='%23000' stroke-width='2' fill='none'/></svg>", submittedAt: '2026-09-09T09:01:20Z' },
      { id: 'att-11', name: 'Khider Nezar', designation: 'Site Engineer', organization: 'DMTC', email: 'Khider.nezar@desertmangt.com', phone: '0569833850', signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M15 18 L45 28 L75 14 L110 32' stroke='%23000' stroke-width='2' fill='none'/></svg>", submittedAt: '2026-09-09T09:02:11Z' }
    ];
  }

  await saveData(data);
  res.json({ success: true, count: data.attendees.length });
});

// Dynamic QR Code generation endpoint
app.get('/api/qr', async (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);
    const targetUrl = req.query.url || `${baseUrl}/attend`;
    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      errorCorrectionLevel: 'H', margin: 2, width: 500,
      color: { dark: '#00264D', light: '#FFFFFF' }
    });
    res.json({ targetUrl, qrDataUrl });
  } catch (err) {
    console.error('QR code generation failed:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Download QR code image endpoint
app.get('/api/download-qr', async (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);
    const targetUrl = req.query.url || `${baseUrl}/attend`;
    const filePath = path.join(IS_VERCEL ? '/tmp' : __dirname, 'attendance_qr_code.png');
    await QRCode.toFile(filePath, targetUrl, {
      errorCorrectionLevel: 'H', margin: 2, width: 600,
      color: { dark: '#00264D', light: '#FFFFFF' }
    });
    res.download(filePath, 'attendance_qr_code.png');
  } catch (err) {
    res.status(500).send('Failed to generate image');
  }
});

// CSV Export endpoint
app.get('/api/export-csv', async (req, res) => {
  const data = await loadData();
  const attendees = data.attendees || [];
  let csvContent = 'SN,Name,Designation,Organization,Email,Phone,Submission Time\r\n';
  attendees.forEach((att, index) => {
    const sn = index + 1;
    const name = `"${(att.name || '').replace(/"/g, '""')}"`;
    const des = `"${(att.designation || '').replace(/"/g, '""')}"`;
    const org = `"${(att.organization || '').replace(/"/g, '""')}"`;
    const email = `"${(att.email || '').replace(/"/g, '""')}"`;
    const phone = `"${(att.phone || '').replace(/"/g, '""')}"`;
    const time = `"${att.submittedAt ? new Date(att.submittedAt).toLocaleString() : ''}"`;
    csvContent += `${sn},${name},${des},${org},${email},${phone},${time}\r\n`;
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="Record_of_Attendance_${Date.now()}.csv"`);
  res.send(csvContent);
});

// Friendly route for attendee form
app.get('/attend', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'attend.html'));
});

// Start server when run directly
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    const lanIp = getLocalNetworkIp();
    console.log(`=======================================================`);
    console.log(`🚀 QR Attendance System is live and listening!`);
    console.log(`📋 Admin / Official Sheet: http://localhost:${PORT}`);
    console.log(`📱 Mobile Attendance URL:  http://${lanIp}:${PORT}/attend`);
    console.log(`=======================================================`);
  });
}

module.exports = app;

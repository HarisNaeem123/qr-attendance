const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data', 'attendance.json');

// Helper to get real active Wi-Fi or LAN network IP address
function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();
  
  // First priority: look for Wi-Fi or Ethernet with 192.168.x (excluding virtualbox 192.168.56.x)
  for (const name of Object.keys(interfaces)) {
    const isWifi = /wi-?fi|wlan/i.test(name);
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('192.168.56.') && !net.address.startsWith('169.254.')) {
        if (isWifi) return net.address;
      }
    }
  }

// Helper to get public or LAN URL
function getBaseUrl(req) {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL.replace(/\/$/, '');
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  }
  if (req && req.headers && req.headers['x-forwarded-host']) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    return `${proto}://${req.headers['x-forwarded-host']}`;
  }
  if (req && req.headers && req.headers.host && !req.headers.host.includes('localhost') && !req.headers.host.startsWith('127.0.0.1')) {
    const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    return `${proto}://${req.headers.host}`;
  }
  const lanIp = getLocalNetworkIp();
  return `http://${lanIp}:${PORT}`;
}

// Helper to read and write database
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading data file:', err);
  }
  return {
    meeting: {
      projectName: "Al Rahayel Stormwater Network Extension",
      employer: "AD Ports Groups",
      consultant: "KN International Architect and Engineers LLC.",
      contractor: "Desert Man Transporting & Contracting L.L.C",
      meetingRefNo: "Summer Safety Arrangements and Welfare Audit Opening Meeting",
      meetingTitle: "Summer Safety Arrangements Audit Opening Meeting",
      meetingDate: "09 Sep- 2026",
      meetingTime: "9:00 AM",
      meetingOrganizer: "Mukhtiar Hussain"
    },
    attendees: []
  };
}

function saveData(data) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving data:', err);
    return false;
  }
}

// Server info endpoint
app.get('/api/server-info', (req, res) => {
  const lanIp = getLocalNetworkIp();
  const baseUrl = getBaseUrl(req);
  res.json({
    port: PORT,
    lanIp: lanIp,
    baseUrl: baseUrl,
    localUrl: `http://localhost:${PORT}`,
    networkUrl: baseUrl,
    attendUrl: `${baseUrl}/attend`
  });
});

// Meeting metadata endpoints
app.get('/api/meeting', (req, res) => {
  const data = loadData();
  res.json(data.meeting || {});
});

app.post('/api/meeting', (req, res) => {
  const data = loadData();
  data.meeting = {
    ...data.meeting,
    ...req.body
  };
  saveData(data);
  res.json({ success: true, meeting: data.meeting });
});

// Attendees endpoints
app.get('/api/attendees', (req, res) => {
  const data = loadData();
  res.json(data.attendees || []);
});

app.post('/api/attendees', (req, res) => {
  const { name, designation, organization, email, phone, signature } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Name is required' });
  }

  const data = loadData();
  const now = new Date();

  // Format date and time in readable format
  const submittedAt = now.toISOString();

  const newAttendee = {
    id: 'att-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    name: name.trim(),
    designation: (designation || '').trim(),
    organization: (organization || '').trim(),
    email: (email || '').trim(),
    phone: (phone || '').trim(),
    signature: signature || '',
    submittedAt: submittedAt
  };

  data.attendees.push(newAttendee);
  saveData(data);

  res.status(201).json({
    success: true,
    message: 'Attendance recorded successfully',
    attendee: newAttendee,
    totalCount: data.attendees.length
  });
});

app.delete('/api/attendees/:id', (req, res) => {
  const data = loadData();
  const initialLength = data.attendees.length;
  data.attendees = data.attendees.filter(a => a.id !== req.params.id);

  if (data.attendees.length === initialLength) {
    return res.status(404).json({ error: 'Attendee not found' });
  }

  saveData(data);
  res.json({ success: true, remaining: data.attendees.length });
});

app.post('/api/reset', (req, res) => {
  const { mode } = req.body; // 'clear' or 'sample'
  const data = loadData();

  if (mode === 'clear') {
    data.attendees = [];
  } else if (mode === 'sample') {
    // Restore default 11 attendees from reference document
    data.attendees = [
      {
        id: "att-1",
        name: "Hisham Taha",
        designation: "RE",
        organization: "KN International",
        email: "hisham.elmagamr@kn-uae.com",
        phone: "0556642253",
        signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M10 25 Q25 5 45 28 T80 20 T110 32' stroke='%23000' stroke-width='2' fill='none'/></svg>",
        submittedAt: "2026-09-09T08:52:10Z"
      },
      {
        id: "att-2",
        name: "Mukhtiar Hussain",
        designation: "HSEE",
        organization: "KN International",
        email: "mukhtiar.hussain@kn-uae.com",
        phone: "0507505342",
        signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M15 15 L35 30 L60 10 L85 35 L105 18' stroke='%23000' stroke-width='2' fill='none'/></svg>",
        submittedAt: "2026-09-09T08:54:22Z"
      },
      {
        id: "att-3",
        name: "Mahmoud Ghadban",
        designation: "PM",
        organization: "DMTC",
        email: "mahmoud.ghadban@desertmangt.com",
        phone: "0503120459",
        signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M10 20 C30 5, 50 35, 70 15 S110 25, 115 18' stroke='%23000' stroke-width='2' fill='none'/></svg>",
        submittedAt: "2026-09-09T08:55:01Z"
      },
      {
        id: "att-4",
        name: "Rajesh Gopalan",
        designation: "CM",
        organization: "DMTC",
        email: "rajesh@desertmangt.com",
        phone: "0503148938",
        signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M12 28 Q40 5 65 25 T110 20' stroke='%23000' stroke-width='2' fill='none'/></svg>",
        submittedAt: "2026-09-09T08:56:15Z"
      },
      {
        id: "att-5",
        name: "Gul Yar",
        designation: "HSSE",
        organization: "DMTC",
        email: "gul.yar@desertmangt.com",
        phone: "0545869133",
        signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M10 18 C25 28, 45 8, 70 26 S100 12, 110 30' stroke='%23000' stroke-width='2' fill='none'/></svg>",
        submittedAt: "2026-09-09T08:57:30Z"
      },
      {
        id: "att-6",
        name: "Umair Saeed",
        designation: "HSEO",
        organization: "DMTC",
        email: "Umair.saeed@desertmangt.com",
        phone: "0566140605",
        signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M15 30 Q30 5 55 20 T95 15 L110 28' stroke='%23000' stroke-width='2' fill='none'/></svg>",
        submittedAt: "2026-09-09T08:58:05Z"
      },
      {
        id: "att-7",
        name: "Nikil Santosh",
        designation: "QA/QC",
        organization: "DMTC",
        email: "Nikil.santosh@desrtmangt.com",
        phone: "0545397896",
        signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M10 15 L40 32 L75 12 L105 25' stroke='%23000' stroke-width='2' fill='none'/></svg>",
        submittedAt: "2026-09-09T08:59:12Z"
      },
      {
        id: "att-8",
        name: "Bilal Asghar",
        designation: "QS",
        organization: "DMTC",
        email: "Bilal.asghar@desertmangt.com",
        phone: "0503453619",
        signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M15 22 Q45 8 75 28 T115 15' stroke='%23000' stroke-width='2' fill='none'/></svg>",
        submittedAt: "2026-09-09T08:59:45Z"
      },
      {
        id: "att-9",
        name: "Shankar",
        designation: "Gen Foreman",
        organization: "DMTC",
        email: "Shankar.tulay@desrtmangt.com",
        phone: "0564112141",
        signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M12 25 C30 10, 60 30, 85 15 S105 28, 115 20' stroke='%23000' stroke-width='2' fill='none'/></svg>",
        submittedAt: "2026-09-09T09:00:02Z"
      },
      {
        id: "att-10",
        name: "Ahmed Kaud",
        designation: "Site Engineer",
        organization: "DMTC",
        email: "Ahmed.kaud@desertmangt.com",
        phone: "0502996921",
        signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M10 30 Q35 10 70 25 T110 18' stroke='%23000' stroke-width='2' fill='none'/></svg>",
        submittedAt: "2026-09-09T09:01:20Z"
      },
      {
        id: "att-11",
        name: "Khider Nezar",
        designation: "Site Engineer",
        organization: "DMTC",
        email: "Khider.nezar@desertmangt.com",
        phone: "0569833850",
        signature: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M15 18 L45 28 L75 14 L110 32' stroke='%23000' stroke-width='2' fill='none'/></svg>",
        submittedAt: "2026-09-09T09:02:11Z"
      }
    ];
  }

  saveData(data);
  res.json({ success: true, count: data.attendees.length });
});

// Dynamic QR Code generation endpoint
app.get('/api/qr', async (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);
    const defaultUrl = `${baseUrl}/attend`;
    const targetUrl = req.query.url || defaultUrl;

    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 500,
      color: {
        dark: '#00264D',
        light: '#FFFFFF'
      }
    });

    res.json({
      targetUrl,
      qrDataUrl
    });
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
    const filePath = path.join(__dirname, 'attendance_qr_code.png');

    await QRCode.toFile(filePath, targetUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 600,
      color: {
        dark: '#00264D',
        light: '#FFFFFF'
      }
    });

    res.download(filePath, 'attendance_qr_code.png');
  } catch (err) {
    res.status(500).send('Failed to generate image');
  }
});

// CSV Export endpoint
app.get('/api/export-csv', (req, res) => {
  const data = loadData();
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLocalNetworkIp();
  console.log(`=======================================================`);
  console.log(`🚀 QR Attendance System is live and listening!`);
  console.log(`📋 Admin / Official Sheet: http://localhost:${PORT}`);
  console.log(`📱 Mobile Attendance URL:  http://${lanIp}:${PORT}/attend`);
  console.log(`=======================================================`);
});

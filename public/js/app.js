// Official Record of Attendance - App Logic

let currentAttendees = [];
let currentMeeting = {};
let currentQrUrl = '';
let pollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  await fetchMeetingInfo();
  await fetchAttendees();
  await initQrCode();

  // Start real-time background polling every 3 seconds for instant updates
  pollInterval = setInterval(fetchAttendeesSilently, 3000);

  setupEventListeners();
}

// Fetch Meeting Metadata
async function fetchMeetingInfo() {
  try {
    const res = await fetch('/api/meeting');
    if (!res.ok) throw new Error('Failed to load meeting info');
    currentMeeting = await res.json();
    renderMeetingInfo(currentMeeting);
  } catch (err) {
    console.error('Error fetching meeting info:', err);
    showToast('Failed to load meeting metadata', true);
  }
}

function renderMeetingInfo(meeting) {
  document.getElementById('metaProjectName').textContent = meeting.projectName || '—';
  document.getElementById('metaEmployer').textContent = meeting.employer || '—';
  document.getElementById('metaConsultant').textContent = meeting.consultant || '—';
  document.getElementById('metaContractor').textContent = meeting.contractor || '—';
  document.getElementById('metaMeetingRefNo').textContent = meeting.meetingRefNo || '—';

  document.getElementById('metaMeetingTitle').textContent = meeting.meetingTitle || '—';
  document.getElementById('metaMeetingDate').textContent = meeting.meetingDate || '—';
  document.getElementById('metaMeetingTime').textContent = meeting.meetingTime || '—';
  document.getElementById('metaMeetingOrganizer').textContent = meeting.meetingOrganizer || '—';

  const qrTitle = document.getElementById('qrCardMeetingTitle');
  if (qrTitle) qrTitle.textContent = meeting.meetingTitle || 'Record Attendance';
}

// Fetch Attendees List
async function fetchAttendees() {
  try {
    const res = await fetch('/api/attendees');
    if (!res.ok) throw new Error('Failed to load attendees');
    const attendees = await res.json();
    currentAttendees = attendees;
    renderAttendeesTable(attendees);
  } catch (err) {
    console.error('Error fetching attendees:', err);
  }
}

// Silent polling for background real-time updates
async function fetchAttendeesSilently() {
  try {
    const res = await fetch('/api/attendees');
    if (!res.ok) return;
    const attendees = await res.json();

    // Check if new attendees were added
    if (attendees.length !== currentAttendees.length) {
      const addedCount = attendees.length - currentAttendees.length;
      if (addedCount > 0 && currentAttendees.length > 0) {
        const latest = attendees[attendees.length - 1];
        showToast(`✨ New attendance recorded: ${latest.name}`);
      }
      currentAttendees = attendees;
      renderAttendeesTable(attendees);
    }
  } catch (err) {
    // Silent fail on background poll
  }
}

// Render Table Rows matching the PDF Reference Layout
function renderAttendeesTable(attendees) {
  const tbody = document.getElementById('attendeesTbody');
  tbody.innerHTML = '';

  if (!attendees || attendees.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="7" class="empty-placeholder">
        No attendance records yet. Scan the QR code with a mobile device to submit attendance!
      </td>
    `;
    tbody.appendChild(tr);
    return;
  }

  attendees.forEach((att, index) => {
    const tr = document.createElement('tr');
    tr.id = `row-${att.id}`;

    // Signature rendering (data URL or signature text)
    let sigHtml = '';
    if (att.signature && att.signature.startsWith('data:image')) {
      sigHtml = `<img src="${att.signature}" alt="Signature of ${escapeHtml(att.name)}">`;
    } else if (att.signature) {
      sigHtml = `<span class="text-sig">${escapeHtml(att.signature)}</span>`;
    } else {
      sigHtml = `<span style="color:#94a3b8; font-size: 11px;">(Signed)</span>`;
    }

    tr.innerHTML = `
      <td class="col-sn">${index + 1}</td>
      <td class="col-name">${escapeHtml(att.name)}</td>
      <td class="col-desig">${escapeHtml(att.designation || '—')}</td>
      <td class="col-org">${escapeHtml(att.organization || '—')}</td>
      <td class="col-email">${escapeHtml(att.email || '—')}</td>
      <td class="col-phone">${escapeHtml(att.phone || '—')}</td>
      <td class="col-sig">${sigHtml}</td>
    `;

    tbody.appendChild(tr);
  });
}

// Initialize QR Code
async function initQrCode(overrideUrl = null) {
  try {
    let url = '/api/qr';
    if (overrideUrl) {
      url += `?url=${encodeURIComponent(overrideUrl)}`;
    }
    const res = await fetch(url);
    const data = await res.json();

    currentQrUrl = data.targetUrl;
    document.getElementById('qrImageElement').src = data.qrDataUrl;
    document.getElementById('qrUrlText').textContent = data.targetUrl;
    document.getElementById('customQrUrlInput').value = data.targetUrl;
  } catch (err) {
    console.error('Error fetching QR code:', err);
  }
}

// Event Listeners
function setupEventListeners() {
  // Print / PDF Button
  document.getElementById('btnPrintPdf').addEventListener('click', () => {
    window.print();
  });

  // Export CSV
  document.getElementById('btnExportCsv').addEventListener('click', () => {
    window.location.href = '/api/export-csv';
    showToast('Exporting attendance sheet to CSV...');
  });

  // QR Modal
  const qrModal = document.getElementById('qrModal');
  document.getElementById('btnOpenQrModal').addEventListener('click', () => {
    qrModal.classList.add('active');
  });

  document.getElementById('btnCloseQrModal').addEventListener('click', () => {
    qrModal.classList.remove('active');
  });

  // Copy Attend URL
  document.getElementById('btnCopyAttendUrl').addEventListener('click', () => {
    if (navigator.clipboard && currentQrUrl) {
      navigator.clipboard.writeText(currentQrUrl).then(() => {
        showToast('Attendance link copied to clipboard!');
      });
    } else {
      prompt('Copy attendance link:', currentQrUrl);
    }
  });

  // Open Form in New Tab
  document.getElementById('btnOpenAttendNewTab').addEventListener('click', () => {
    window.open(currentQrUrl || '/attend', '_blank');
  });

  // Print Standee
  document.getElementById('btnPrintStandee').addEventListener('click', () => {
    const standeeCard = document.getElementById('printableQrCard').innerHTML;
    const printWin = window.open('', '', 'width=650,height=750');
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Attendance QR Code Standee</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; text-align: center; padding: 40px; margin: 0; }
          .card { border: 2px solid #003a70; padding: 30px; border-radius: 12px; max-width: 500px; margin: 0 auto; }
          .logos-preview { display: flex; justify-content: center; align-items: center; gap: 20px; margin-bottom: 20px; }
          .logos-preview img { height: 45px; object-fit: contain; }
          h2 { color: #003a70; font-size: 20px; margin: 10px 0; }
          p { color: #475569; font-size: 14px; margin-bottom: 20px; }
          .qr-image-wrapper img { width: 260px; height: 260px; }
          .qr-url-box { font-family: monospace; font-size: 12px; color: #1e293b; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="card">
          ${standeeCard}
        </div>
        <script>
          setTimeout(() => { window.print(); window.close(); }, 500);
        <\/script>
      </body>
      </html>
    `);
    printWin.document.close();
  });

  // Custom QR URL apply
  document.getElementById('btnApplyCustomUrl').addEventListener('click', () => {
    const customUrl = document.getElementById('customQrUrlInput').value.trim();
    if (customUrl) {
      initQrCode(customUrl);
      showToast('QR code updated with custom URL!');
    }
  });

  // Edit Meeting Modal
  const editModal = document.getElementById('editMeetingModal');
  document.getElementById('btnEditMeeting').addEventListener('click', () => {
    // Fill inputs with current values
    document.getElementById('inputProjectName').value = currentMeeting.projectName || '';
    document.getElementById('inputEmployer').value = currentMeeting.employer || '';
    document.getElementById('inputConsultant').value = currentMeeting.consultant || '';
    document.getElementById('inputContractor').value = currentMeeting.contractor || '';
    document.getElementById('inputMeetingRefNo').value = currentMeeting.meetingRefNo || '';

    document.getElementById('inputMeetingTitle').value = currentMeeting.meetingTitle || '';
    document.getElementById('inputMeetingDate').value = currentMeeting.meetingDate || '';
    document.getElementById('inputMeetingTime').value = currentMeeting.meetingTime || '';
    document.getElementById('inputMeetingOrganizer').value = currentMeeting.meetingOrganizer || '';

    editModal.classList.add('active');
  });

  document.getElementById('btnCloseEditModal').addEventListener('click', () => {
    editModal.classList.remove('active');
  });
  document.getElementById('btnCancelEdit').addEventListener('click', () => {
    editModal.classList.remove('active');
  });

  document.getElementById('btnSaveMeeting').addEventListener('click', async (e) => {
    e.preventDefault();
    const updated = {
      projectName: document.getElementById('inputProjectName').value.trim(),
      employer: document.getElementById('inputEmployer').value.trim(),
      consultant: document.getElementById('inputConsultant').value.trim(),
      contractor: document.getElementById('inputContractor').value.trim(),
      meetingRefNo: document.getElementById('inputMeetingRefNo').value.trim(),
      meetingTitle: document.getElementById('inputMeetingTitle').value.trim(),
      meetingDate: document.getElementById('inputMeetingDate').value.trim(),
      meetingTime: document.getElementById('inputMeetingTime').value.trim(),
      meetingOrganizer: document.getElementById('inputMeetingOrganizer').value.trim()
    };

    try {
      const res = await fetch('/api/meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (!res.ok) throw new Error('Save failed');
      const data = await res.json();
      currentMeeting = data.meeting;
      renderMeetingInfo(currentMeeting);
      editModal.classList.remove('active');
      showToast('Meeting details updated successfully!');
    } catch (err) {
      alert('Failed to save meeting details');
    }
  });

  // Reset Modal
  const resetModal = document.getElementById('resetModal');
  document.getElementById('btnResetMeeting').addEventListener('click', () => {
    resetModal.classList.add('active');
  });
  document.getElementById('btnCloseResetModal').addEventListener('click', () => {
    resetModal.classList.remove('active');
  });
  document.getElementById('btnCancelReset').addEventListener('click', () => {
    resetModal.classList.remove('active');
  });

  // Restore Reference Sample Data
  document.getElementById('btnRestoreSample').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'sample' })
      });
      if (res.ok) {
        await fetchAttendees();
        resetModal.classList.remove('active');
        showToast('PDF reference attendees restored!');
      }
    } catch (err) {
      alert('Failed to restore sample data');
    }
  });

  // Clear Attendees
  document.getElementById('btnClearAttendees').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear all attendees for a fresh session?')) return;
    try {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'clear' })
      });
      if (res.ok) {
        await fetchAttendees();
        resetModal.classList.remove('active');
        showToast('All attendee records cleared for fresh session.');
      }
    } catch (err) {
      alert('Failed to clear records');
    }
  });

  // Close modals on backdrop click
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('active');
    }
  });
}

// Toast notification helper
function showToast(message, isError = false) {
  const toast = document.getElementById('toastNotice');
  const msgEl = document.getElementById('toastMessage');
  msgEl.textContent = message;

  if (isError) {
    toast.style.borderLeftColor = '#ef4444';
  } else {
    toast.style.borderLeftColor = '#10b981';
  }

  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

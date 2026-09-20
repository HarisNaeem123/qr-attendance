// Mobile Attendee Check-In Form Logic

let canvas, ctx;
let isDrawing = false;
let hasDrawnSignature = false;
let currentMeeting = {};

document.addEventListener('DOMContentLoaded', () => {
  initForm();
});

async function initForm() {
  await loadMeetingInfo();
  initSignaturePad();
  setupFormControls();
}

// Load current meeting name and project from server
async function loadMeetingInfo() {
  try {
    const res = await fetch('/api/meeting');
    if (res.ok) {
      currentMeeting = await res.json();
      if (currentMeeting.meetingTitle) {
        document.getElementById('displayMeetingTitle').textContent = currentMeeting.meetingTitle;
      }
      if (currentMeeting.projectName) {
        document.getElementById('displayProjectName').textContent = currentMeeting.projectName;
      }
    }
  } catch (err) {
    console.warn('Could not load meeting details:', err);
  }
}

// Setup smooth canvas signature drawing
function initSignaturePad() {
  canvas = document.getElementById('signatureCanvas');
  ctx = canvas.getContext('2d');

  // Handle high-DPI displays
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Mouse events
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', stopDrawing);

  // Touch events for mobile phones / tablets
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  window.addEventListener('touchend', stopDrawing);

  // Clear button
  document.getElementById('btnClearSignature').addEventListener('click', clearSignature);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;

  // Preserve image if already drawn
  let tempImage = null;
  if (hasDrawnSignature) {
    tempImage = canvas.toDataURL();
  }

  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  ctx.scale(ratio, ratio);

  // Styling for line
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#00264d';

  if (tempImage) {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
    };
    img.src = tempImage;
  }
}

function getCoordinates(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

function startDrawing(e) {
  isDrawing = true;
  hasDrawnSignature = true;
  const coords = getCoordinates(e);
  ctx.beginPath();
  ctx.moveTo(coords.x, coords.y);
}

function draw(e) {
  if (!isDrawing) return;
  const coords = getCoordinates(e);
  ctx.lineTo(coords.x, coords.y);
  ctx.stroke();
}

function handleTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    isDrawing = true;
    hasDrawnSignature = true;
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
  }
}

function handleTouchMove(e) {
  e.preventDefault();
  if (!isDrawing) return;
  if (e.touches.length === 1) {
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
    ctx.stroke();
  }
}

function stopDrawing() {
  if (isDrawing) {
    ctx.closePath();
    isDrawing = false;
  }
}

function clearSignature() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hasDrawnSignature = false;
}

// Setup form select triggers and submit handler
function setupFormControls() {
  const desigSelect = document.getElementById('designationSelect');
  const customDesig = document.getElementById('customDesignation');
  desigSelect.addEventListener('change', () => {
    if (desigSelect.value === 'Other') {
      customDesig.style.display = 'block';
      customDesig.required = true;
      customDesig.focus();
    } else {
      customDesig.style.display = 'none';
      customDesig.required = false;
    }
  });

  const orgSelect = document.getElementById('orgSelect');
  const customOrg = document.getElementById('customOrg');
  orgSelect.addEventListener('change', () => {
    if (orgSelect.value === 'Other') {
      customOrg.style.display = 'block';
      customOrg.required = true;
      customOrg.focus();
    } else {
      customOrg.style.display = 'none';
      customOrg.required = false;
    }
  });

  // Submit Handler
  const form = document.getElementById('attendanceForm');
  const submitBtn = document.getElementById('btnSubmitAttendance');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('fullName').value.trim();
    let designation = desigSelect.value;
    if (designation === 'Other') {
      designation = customDesig.value.trim();
    }

    let organization = orgSelect.value;
    if (organization === 'Other') {
      organization = customOrg.value.trim();
    }

    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();

    if (!name) {
      alert('Please enter your full name.');
      return;
    }

    if (!hasDrawnSignature) {
      alert('Please draw your digital signature before submitting.');
      return;
    }

    // Capture signature as PNG data URL
    const signatureDataUrl = canvas.toDataURL('image/png');

    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <svg class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path></svg>
      Recording Attendance...
    `;

    try {
      const res = await fetch('/api/attendees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          designation,
          organization,
          email,
          phone,
          signature: signatureDataUrl
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to record attendance');
      }

      const result = await res.json();
      showSuccessScreen(result.attendee);
    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Submit Attendance';
    }
  });

  // Submit Another Attendee Button
  document.getElementById('btnSubmitAnother').addEventListener('click', () => {
    form.reset();
    clearSignature();
    customDesig.style.display = 'none';
    customDesig.required = false;
    customOrg.style.display = 'none';
    customOrg.required = false;

    submitBtn.disabled = false;
    submitBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
      Submit Attendance
    `;

    document.getElementById('successScreen').classList.remove('active');
    form.style.display = 'block';
  });
}

function showSuccessScreen(attendee) {
  document.getElementById('attendanceForm').style.display = 'none';

  document.getElementById('receiptName').textContent = attendee.name;
  document.getElementById('receiptDesignation').textContent = attendee.designation || '—';
  document.getElementById('receiptOrg').textContent = attendee.organization || '—';

  const dateObj = attendee.submittedAt ? new Date(attendee.submittedAt) : new Date();
  document.getElementById('receiptTimestamp').textContent = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.getElementById('receiptMeeting').textContent = currentMeeting.meetingTitle || 'Meeting';

  document.getElementById('successScreen').classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

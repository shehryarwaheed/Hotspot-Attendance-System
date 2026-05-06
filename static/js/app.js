let currentTab = 'register';
let scanInterval = null;
let attendanceInterval = null;
let timerInterval = null;
let currentLectureId = null;

// Tab Switching
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
    
    document.getElementById(`section-${tab}`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    if (tab === 'attendance') {
        loadSections();
        checkRegisteredStudents();
    }
    
    if (tab === 'history') {
        loadSessions();
    }

    if (tab === 'fetched') {
        loadFetchedStudents();
    }
}

// REGISTER STUDENTS LOGIC
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('student-file');

// Drag and drop events
['dragover', 'dragenter'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#a855f7';
        dropZone.style.background = 'rgba(255, 255, 255, 0.4)';
    });
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#6366f1';
        dropZone.style.background = 'rgba(255, 255, 255, 0.2)';
    });
});

dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        fileInput.files = files;
        updateFileDisplay(files[0]);
    }
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        updateFileDisplay(fileInput.files[0]);
    }
});

function updateFileDisplay(file) {
    document.getElementById('upload-content-default').style.display = 'none';
    document.getElementById('upload-content-ready').style.display = 'flex';
    document.getElementById('file-name-display').innerText = file.name;
    document.getElementById('upload-status').innerText = "";
}

document.getElementById('btn-remove-file').addEventListener('click', (e) => {
    e.preventDefault();
    fileInput.value = "";
    document.getElementById('upload-content-default').style.display = 'flex';
    document.getElementById('upload-content-ready').style.display = 'none';
    document.getElementById('upload-status').innerText = "File removed";
});

document.getElementById('btn-upload').addEventListener('click', async () => {
    const section = document.getElementById('reg-section').value;
    const file = document.getElementById('student-file').files[0];
    
    if (!section || !file) {
        alert("Please provide section and select an Excel file.");
        return;
    }
    
    const formData = new FormData();
    formData.append('section', section);
    formData.append('file', file);
    
    const btn = document.getElementById('btn-upload');
    btn.disabled = true;
    document.getElementById('upload-status').innerText = "Uploading...";

    try {
        const response = await fetch('/students/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        document.getElementById('upload-status').innerText = data.message;
        
        if (response.ok) {
            loadStudentPreview(section);
            document.getElementById('reg-preview-card').style.display = 'block';
        }
    } catch (err) {
        document.getElementById('upload-status').innerText = "Upload failed: " + err;
    } finally {
        btn.disabled = false;
    }
});

async function loadStudentPreview(section) {
    const response = await fetch(`/students/list?section=${section}`);
    const students = await response.json();
    
    const tbody = document.getElementById('student-table-body');
    tbody.innerHTML = '';
    
    const selectStudent = document.getElementById('select-student');
    selectStudent.innerHTML = '<option value="">Select Student</option>';
    
    let unregisteredCount = 0;
    
    students.forEach(s => {
        const row = `<tr>
            <td>${s.roll_number}</td>
            <td>${s.name}</td>
            <td>${s.section}</td>
            <td><small>${s.device_name || '---'}</small><br><code style="font-size: 0.75rem;">${s.device_identifier || '---'}</code></td>
            <td>${s.device_identifier ? '✅ registered' : '🔴 unregistered'}</td>
            <td>
                <button class="btn-unregister" onclick="unregisterStudent('${s.roll_number}')" ${!s.device_identifier ? 'disabled' : ''}>
                    <i class="fas fa-unlink"></i> Unregister
                </button>
            </td>
        </tr>`;
        tbody.innerHTML += row;
        
        if (!s.device_identifier) {
            unregisteredCount++;
            const opt = document.createElement('option');
            opt.value = s.roll_number;
            opt.textContent = `${s.roll_number} - ${s.name}`;
            selectStudent.appendChild(opt);
        }
    });
    
    document.getElementById('reg-progress').innerText = `${students.length - unregisteredCount} / ${students.length} registered`;
}

// BLE Registration Scan
document.getElementById('btn-start-reg').addEventListener('click', () => {
    document.getElementById('btn-start-reg').style.display = 'none';
    document.getElementById('btn-stop-reg').style.display = 'inline-block';
    document.getElementById('assignment-row').style.display = 'grid';
    document.getElementById('pairing-banner').style.display = 'block';
    
    startScanPolling();
});

document.getElementById('btn-stop-reg').addEventListener('click', async () => {
    await fetch('/bluetooth/stop', { method: 'POST' });
    stopScanPolling();
    
    document.getElementById('btn-start-reg').style.display = 'inline-block';
    document.getElementById('btn-stop-reg').style.display = 'none';
    document.getElementById('assignment-row').style.display = 'none';
    document.getElementById('pairing-banner').style.display = 'none';
});

let discoveredDevicesCache = [];

function startScanPolling() {
    if (scanInterval) clearInterval(scanInterval);
    
    const poll = async () => {
        try {
            const response = await fetch('/bluetooth/scan');
            const data = await response.json();
            
            if (data.error) {
                console.error("Bluetooth Error:", data.error);
                return;
            }

            discoveredDevicesCache = data.devices || [];
            renderDeviceDropdown();
        } catch (err) { console.error(err); }
    };
    
    poll();
    scanInterval = setInterval(poll, 3000);
}

function renderDeviceDropdown() {
    const selectDevice = document.getElementById('select-device');
    const currentVal = selectDevice.value;
    selectDevice.innerHTML = '<option value="">Select Device</option>';
    
    let pairedCount = 0;
    discoveredDevicesCache.forEach(d => {
        if (d.paired) pairedCount++;
        const opt = document.createElement('option');
        opt.value = d.address;
        opt.dataset.name = d.name;
        
        // 🔵 for paired devices, else 📶
        const icon = d.paired ? "🔵" : "📶";
        const status = d.paired ? "Paired" : d.source.toUpperCase();
        
        opt.textContent = `${icon} ${d.name} — ${d.address} — ${d.rssi} dBm [${status}]`;
        selectDevice.appendChild(opt);
    });

    document.getElementById('device-count').innerText = `${pairedCount} paired devices found`;
    selectDevice.value = currentVal;
}

// Refresh button logic
document.getElementById('btn-refresh-devices').addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh-devices');
    btn.classList.add('fa-spin');
    // We just restart the scan to trigger a fresh PowerShell run
    await fetch('/bluetooth/stop', { method: 'POST' });
    await fetch('/bluetooth/scan'); // This will start it again
    setTimeout(() => btn.classList.remove('fa-spin'), 1000);
});

function stopScanPolling() {
    if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
    }
}

document.getElementById('btn-assign').addEventListener('click', async () => {
    const roll = document.getElementById('select-student').value;
    const selectDevice = document.getElementById('select-device');
    const mac = selectDevice.value;
    let deviceName = selectDevice.options[selectDevice.selectedIndex].dataset.name || "";
    
    if (!roll || !mac) {
        alert("Select both a student and a device.");
        return;
    }
    
    // Safeguard: Check if this MAC is already assigned to someone else in the current table
    const existingRows = document.querySelectorAll('#student-table-body tr');
    let duplicateStudentName = null;
    existingRows.forEach(row => {
        const rowMacCode = row.querySelector('code');
        if (rowMacCode && rowMacCode.innerText.trim() === mac.trim()) {
            duplicateStudentName = row.cells[1].innerText;
        }
    });

    if (duplicateStudentName) {
        if (!confirm(`This device is already assigned to ${duplicateStudentName}. Are you sure you want to reassign it?`)) {
            return;
        }
    }
    
    const response = await fetch('/bluetooth/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roll_number: roll, device_identifier: mac, device_name: deviceName })
    });
    
    if (response.ok) {
        loadStudentPreview(document.getElementById('reg-section').value);
    }
});

// ATTENDANCE LOGIC
async function loadSections() {
    try {
        const response = await fetch('/students/sections');
        const sections = await response.json();
        const dropdown = document.getElementById('att-section-dropdown');
        if (!dropdown) return;
        dropdown.innerHTML = '';
        sections.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            dropdown.appendChild(opt);
        });
    } catch (err) { console.error("Failed to load sections", err); }
}

async function checkRegisteredStudents() {
    try {
        const response = await fetch('/students/list');
        const students = await response.json();
        const msg = document.getElementById('att-guard-msg');
        const btn = document.getElementById('btn-att-next');
        
        if (!msg || !btn) return;

        if (students.length === 0) {
            msg.innerText = "No students found in the database. Please upload an Excel sheet first.";
            btn.disabled = true;
        } else {
            msg.innerText = "";
            btn.disabled = false;
        }
    } catch (err) { console.error("Failed to check students", err); }
}

document.getElementById('btn-att-next').addEventListener('click', async () => {
    const title = document.getElementById('att-title').value;
    const date = document.getElementById('att-date').value;
    const section = document.getElementById('att-section-dropdown').value;
    
    if (!title || !date || !section) {
        alert("Please fill all fields.");
        return;
    }
    
    const response = await fetch('/attendance/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, date, section })
    });
    
    if (response.ok) {
        const data = await response.json();
        currentLectureId = data.lecture_id;
        document.getElementById('attendance-setup').style.display = 'none';
        document.getElementById('attendance-active').style.display = 'block';
        document.getElementById('active-lecture-title').innerText = `${title} - ${section}`;
        
        // Block history tab during session
        document.getElementById('tab-history').classList.add('tab-blocked');
        
        startAttendanceSession();
    } else {
        const err = await response.json();
        alert(err.detail);
    }
});

function startAttendanceSession() {
    let timeLeft = 120;
    const timerEl = document.getElementById('attendance-timer');
    
    timerInterval = setInterval(() => {
        timeLeft--;
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        if (timerEl) {
            timerEl.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        
        if (timeLeft <= 0) {
            endSession();
        }
    }, 1000);
    
    attendanceInterval = setInterval(fetchLiveAttendance, 3000);
    fetchLiveAttendance();
}

async function fetchLiveAttendance() {
    const response = await fetch(`/attendance/live/${currentLectureId}`);
    const data = await response.json();
    
    const tbodyAbsent = document.querySelector('#table-absent-students tbody');
    const tbodyPresent = document.querySelector('#table-present-students tbody');
    
    if (!tbodyAbsent || !tbodyPresent) return;
    
    tbodyAbsent.innerHTML = '';
    tbodyPresent.innerHTML = '';
    
    let presentCount = 0;
    
    data.forEach(a => {
        const row = `<tr>
            <td>${a.roll_number}</td>
            <td>${a.name}</td>
        </tr>`;

        if (a.status === 'present') {
            presentCount++;
            tbodyPresent.innerHTML += row;
        } else {
            tbodyAbsent.innerHTML += row;
        }
    });
    
    const total = data.length;
    const absentCount = total - presentCount;
    const statsEl = document.getElementById('session-stats');
    if (statsEl) {
        statsEl.innerText = `${presentCount} present, ${absentCount} absent out of ${total} students`;
    }
}

async function endSession() {
    clearInterval(timerInterval);
    clearInterval(attendanceInterval);
    
    await fetch(`/attendance/stop?lecture_id=${currentLectureId}`, { method: 'POST' });
    
    document.getElementById('attendance-active').style.display = 'none';
    document.getElementById('session-complete').style.display = 'block';
    
    // Unblock history tab
    document.getElementById('tab-history').classList.remove('tab-blocked');
}

if (document.getElementById('btn-end-early')) {
    document.getElementById('btn-end-early').addEventListener('click', endSession);
}

if (document.getElementById('btn-abort')) {
    document.getElementById('btn-abort').addEventListener('click', abortSession);
}

async function abortSession() {
    if (!confirm("Are you sure you want to ABORT? This will stop the session and NOT save any attendance data.")) {
        return;
    }
    
    clearInterval(timerInterval);
    clearInterval(attendanceInterval);
    
    try {
        await fetch(`/attendance/abort/${currentLectureId}`, { method: 'DELETE' });
        await fetch('/bluetooth/stop', { method: 'POST' }); // Ensure scanning stops
    } catch (err) { console.error(err); }
    
    // Unblock history tab
    document.getElementById('tab-history').classList.remove('tab-blocked');
    
    // Reset UI to setup state
    document.getElementById('attendance-active').style.display = 'none';
    document.getElementById('attendance-setup').style.display = 'block';
    
    // Reset timer display
    document.getElementById('attendance-timer').innerText = "02:00";
}

document.getElementById('btn-export-yes').addEventListener('click', () => {
    // Create a hidden link to trigger download
    const downloadUrl = `/attendance/export/${currentLectureId}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = ''; 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Delay reload to ensure download starts
    setTimeout(() => {
        location.reload();
    }, 1500);
});

document.getElementById('btn-export-no').addEventListener('click', () => {
    location.reload();
});

// Set default date to today
document.getElementById('att-date').valueAsDate = new Date();

// SEMESTER ATTENDANCES (HISTORY) LOGIC
async function loadSessions() {
    const listEl = document.getElementById('history-sessions-list');
    const detailEl = document.getElementById('history-session-detail');
    const backBtn = document.getElementById('btn-back-to-sessions');
    
    listEl.style.display = 'grid';
    detailEl.style.display = 'none';
    backBtn.style.display = 'none';
    
    try {
        const response = await fetch('/attendance/sessions');
        const sessions = await response.json();
        
        listEl.innerHTML = '';
        if (sessions.length === 0) {
            listEl.innerHTML = '<div class="card" style="grid-column: 1/-1; text-align: center;">No sessions found.</div>';
            return;
        }

        sessions.forEach(s => {
            const card = document.createElement('div');
            card.className = 'history-card';
            card.innerHTML = `
                <div class="date-badge">${s.date}</div>
                <h4>${s.title}</h4>
                <p><i class="fas fa-users"></i> ${s.section}</p>
                <div style="margin-top: 1rem; font-size: 0.8rem; color: #6366f1; font-weight: 600;">CLICK TO VIEW & EDIT &rarr;</div>
                <button class="btn-delete-session" onclick="event.stopPropagation(); deleteSession(${s.id})" title="Delete Session">
                    <i class="fas fa-trash-alt"></i>
                </button>
            `;
            card.onclick = () => loadSessionDetail(s.id, `${s.title} - ${s.section} (${s.date})`);
            listEl.appendChild(card);
        });
    } catch (err) { console.error(err); }
}

let historyRecords = []; // Local cache for editing

async function loadSessionDetail(lectureId, titleDisplay) {
    const listEl = document.getElementById('history-sessions-list');
    const detailEl = document.getElementById('history-session-detail');
    const backBtn = document.getElementById('btn-back-to-sessions');
    
    listEl.style.display = 'none';
    detailEl.style.display = 'block';
    backBtn.style.display = 'block';
    
    document.getElementById('history-detail-title').innerText = titleDisplay;
    currentLectureId = lectureId; // For export
    
    try {
        const response = await fetch(`/attendance/details/${lectureId}`);
        historyRecords = await response.json();
        renderHistoryTable();
    } catch (err) { console.error(err); }
}

function renderHistoryTable() {
    const tbody = document.querySelector('#history-attendance-table tbody');
    tbody.innerHTML = '';
    
    historyRecords.forEach((r, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${r.roll_number}</td>
            <td>${r.name}</td>
            <td>
                <span class="${r.status === 'present' ? 'status-present' : 'status-absent'}">
                    ${r.status.toUpperCase()}
                </span>
            </td>
            <td>${r.marked_at}</td>
            <td>
                <div class="status-toggle">
                    <button class="status-btn present ${r.status === 'present' ? 'active' : ''}" onclick="toggleHistoryStatus(${index}, 'present')">P</button>
                    <button class="status-btn absent ${r.status === 'absent' ? 'active' : ''}" onclick="toggleHistoryStatus(${index}, 'absent')">A</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function toggleHistoryStatus(index, newStatus) {
    historyRecords[index].status = newStatus;
    // We update local UI immediately
    renderHistoryTable();
}

document.getElementById('btn-save-history').addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-history');
    btn.disabled = true;
    btn.innerText = "SAVING...";
    
    try {
        // We save each record sequentially (or we could make a bulk endpoint, but sequential is safer for now)
        for (const r of historyRecords) {
            await fetch('/attendance/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attendance_id: r.attendance_id, status: r.status })
            });
        }
        alert("Changes saved to database successfully.");
    } catch (err) {
        alert("Error saving changes.");
    } finally {
        btn.disabled = false;
        btn.innerText = "SAVE CHANGES";
        loadSessionDetail(currentLectureId, document.getElementById('history-detail-title').innerText);
    }
});

document.getElementById('btn-back-to-sessions').addEventListener('click', loadSessions);

document.getElementById('btn-export-history').addEventListener('click', () => {
    window.location.href = `/attendance/export/${currentLectureId}`;
});

async function deleteSession(lectureId) {
    if (!confirm("Are you sure you want to delete this session and all its records? This cannot be undone.")) {
        return;
    }
    
    try {
        const response = await fetch(`/attendance/session/${lectureId}`, { method: 'DELETE' });
        if (response.ok) {
            loadSessions();
        } else {
            alert("Failed to delete session.");
        }
    } catch (err) {
        console.error(err);
        alert("Error deleting session.");
    }
}

async function loadFetchedStudents() {
    const listEl = document.getElementById('fetched-sections-list');
    const detailEl = document.getElementById('fetched-section-detail');
    const backBtn = document.getElementById('btn-back-to-sections-fetched');
    
    if (!listEl || !detailEl || !backBtn) return;

    listEl.style.display = 'grid';
    detailEl.style.display = 'none';
    backBtn.style.display = 'none';
    
    listEl.innerHTML = '<div class="card" style="grid-column: 1/-1; text-align: center;">Loading sections...</div>';
    
    try {
        const response = await fetch('/students/sections');
        const sections = await response.json();
        
        listEl.innerHTML = '';
        if (sections.length === 0) {
            listEl.innerHTML = '<div class="card" style="grid-column: 1/-1; text-align: center;">No student data found. Please upload students first.</div>';
            return;
        }

        sections.forEach(s => {
            const card = document.createElement('div');
            card.className = 'history-card';
            card.innerHTML = `
                <div class="date-badge">SECTION</div>
                <h4><i class="fas fa-users"></i> ${s}</h4>
                <p>View all registered students in this section.</p>
                <div style="margin-top: 1rem; font-size: 0.8rem; color: #6366f1; font-weight: 600;">CLICK TO VIEW STUDENTS &rarr;</div>
            `;
            card.onclick = () => loadSectionStudents(s);
            listEl.appendChild(card);
        });
    } catch (err) { 
        console.error(err); 
        listEl.innerHTML = '<div class="card" style="grid-column: 1/-1; text-align: center; color: #ef4444;">Error loading sections.</div>';
    }
}

async function loadSectionStudents(section) {
    const listEl = document.getElementById('fetched-sections-list');
    const detailEl = document.getElementById('fetched-section-detail');
    const backBtn = document.getElementById('btn-back-to-sections-fetched');
    
    listEl.style.display = 'none';
    detailEl.style.display = 'block';
    backBtn.style.display = 'block';
    
    document.getElementById('fetched-detail-title').innerText = `Students in Section: ${section}`;
    
    const tbody = document.querySelector('#table-fetched-students tbody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading students...</td></tr>';
    
    try {
        const response = await fetch(`/students/list?section=${section}`);
        const students = await response.json();
        
        tbody.innerHTML = '';
        if (students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No students found in this section.</td></tr>';
            return;
        }

        students.forEach(s => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${s.roll_number}</td>
                <td>${s.name}</td>
                <td>
                    <span class="badge ${s.device_identifier ? 'badge-indigo' : 'status-absent'}">
                        ${s.device_identifier ? 'Registered' : 'Unregistered'}
                    </span>
                </td>
                <td>${s.device_name || '---'}</td>
                <td><code style="font-size: 0.8rem;">${s.device_identifier || '---'}</code></td>
                <td>
                    <button class="btn-unregister" onclick="unregisterStudent('${s.roll_number}', '${section}')" ${!s.device_identifier ? 'disabled' : ''}>
                        <i class="fas fa-unlink"></i> Unregister
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (err) { 
        console.error(err); 
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: #ef4444;">Error loading students.</td></tr>';
    }
}

// Event Listeners for Fetched Students
if (document.getElementById('btn-refresh-students')) {
    document.getElementById('btn-refresh-students').addEventListener('click', loadFetchedStudents);
}
if (document.getElementById('btn-back-to-sections-fetched')) {
    document.getElementById('btn-back-to-sections-fetched').addEventListener('click', loadFetchedStudents);
}

async function unregisterStudent(rollNumber, sectionContext = null) {
    if (!confirm(`Are you sure you want to unregister student ${rollNumber}?`)) {
        return;
    }
    
    try {
        const response = await fetch('/bluetooth/unregister', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roll_number: rollNumber })
        });
        
        if (response.ok) {
            // Refresh the relevant view
            if (sectionContext) {
                loadSectionStudents(sectionContext);
            } else {
                // Try to find the section from the preview card if we're in the register tab
                const regSection = document.getElementById('reg-section').value;
                if (regSection) loadStudentPreview(regSection);
                else location.reload();
            }
        } else {
            const err = await response.json();
            alert(err.detail || "Failed to unregister student.");
        }
    } catch (err) {
        console.error(err);
        alert("Error unregistering student.");
    }
}

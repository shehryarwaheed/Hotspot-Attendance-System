let currentTab = 'register';
let scanInterval = null;
let attendanceInterval = null;
let timerInterval = null;
let currentLectureId = null;
let wifiAttendanceInterval = null;
let wifiTimerInterval = null;
let wifiTimeRemaining = 0; // Local timer state
let wifiCurrentSectionStudents = [];

// Hierarchical History State
let allHistorySessions = [];
let currentHistoryView = 'sections'; // 'sections', 'titles', 'dates', 'detail'
let selectedHistorySection = null;
let selectedHistoryTitle = null;

// Tab Switching
function switchTab(tab) {
    localStorage.setItem('activeTab', tab);
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

    if (tab === 'wifi-registration') {
        startWifiStatusPolling();
        if (wifiLoadedSection) loadWifiSectionData(wifiLoadedSection);
    }

    if (tab === 'wifi-attendance') {
        startWifiStatusPolling();
        loadWifiLectures();
    }
}

function loadWifiLectures() {
    loadWifiAttendanceSections();
    checkWifiAttendanceStatus();
}

async function checkWifiAttendanceStatus() {
    try {
        const res = await fetch('/wifi-attendance/status');
        const data = await res.json();
        if (data.session_active && data.lecture_id) {
            currentLectureId = data.lecture_id;
            document.getElementById('wifi-att-setup').style.display = 'none';
            document.getElementById('wifi-att-active').style.display = 'block';
            
            // Sync local time with server authoritative time
            wifiTimeRemaining = data.time_remaining;
            
            if (!wifiTimerInterval) {
                startWifiLocalTimer();
            }
            if (!wifiAttendanceInterval) {
                wifiAttendanceInterval = setInterval(checkWifiAttendanceStatus, 5000);
            }
            
            updateWifiAttendanceUI(data);
        } else {
            stopWifiAttendanceUI();
        }
    } catch(e) { console.error(e); }
}

// REGISTER STUDENTS LOGIC
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('student-file');

// Drag and drop events
['dragover', 'dragenter'].forEach(eventName => {
    if(dropZone) dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#a855f7';
        dropZone.style.background = 'rgba(255, 255, 255, 0.4)';
    });
});

['dragleave', 'drop'].forEach(eventName => {
    if(dropZone) dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#6366f1';
        dropZone.style.background = 'rgba(255, 255, 255, 0.2)';
    });
});

if(dropZone) dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        fileInput.files = files;
        updateFileDisplay(files[0]);
    }
});

if(fileInput) fileInput.addEventListener('change', () => {
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

const btnRemoveFile = document.getElementById('btn-remove-file');
if(btnRemoveFile) btnRemoveFile.addEventListener('click', (e) => {
    e.preventDefault();
    fileInput.value = "";
    document.getElementById('upload-content-default').style.display = 'flex';
    document.getElementById('upload-content-ready').style.display = 'none';
    document.getElementById('upload-status').innerText = "File removed";
});

const btnUpload = document.getElementById('btn-upload');
if(btnUpload) btnUpload.addEventListener('click', async () => {
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
const btnStartReg = document.getElementById('btn-start-reg');
if(btnStartReg) btnStartReg.addEventListener('click', () => {
    document.getElementById('btn-start-reg').style.display = 'none';
    document.getElementById('btn-stop-reg').style.display = 'inline-block';
    document.getElementById('assignment-row').style.display = 'grid';
    document.getElementById('pairing-banner').style.display = 'block';
    
    startScanPolling();
});

const btnStopReg = document.getElementById('btn-stop-reg');
if(btnStopReg) btnStopReg.addEventListener('click', async () => {
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

const btnRefreshDevices = document.getElementById('btn-refresh-devices');
if(btnRefreshDevices) btnRefreshDevices.addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh-devices');
    btn.classList.add('fa-spin');
    await fetch('/bluetooth/stop', { method: 'POST' });
    await fetch('/bluetooth/scan'); 
    setTimeout(() => btn.classList.remove('fa-spin'), 1000);
});

function stopScanPolling() {
    if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
    }
}

const btnAssign = document.getElementById('btn-assign');
if(btnAssign) btnAssign.addEventListener('click', async () => {
    const roll = document.getElementById('select-student').value;
    const selectDevice = document.getElementById('select-device');
    const mac = selectDevice.value;
    let deviceName = selectDevice.options[selectDevice.selectedIndex].dataset.name || "";
    
    if (!roll || !mac) {
        alert("Select both a student and a device.");
        return;
    }
    
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

const btnAttNext = document.getElementById('btn-att-next');
if(btnAttNext) btnAttNext.addEventListener('click', async () => {
    const title = document.getElementById('att-title').value;
    const date = document.getElementById('att-date').value;
    const section = document.getElementById('att-section-dropdown').value;
    const duration = document.getElementById('att-duration').value;
    
    if (!title || !date || !section) {
        alert("Please fill all fields.");
        return;
    }
    
    const response = await fetch('/attendance/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, date, section, duration: parseInt(duration) })
    });
    
    if (response.ok) {
        const data = await response.json();
        currentLectureId = data.lecture_id;
        document.getElementById('attendance-setup').style.display = 'none';
        document.getElementById('attendance-active').style.display = 'block';
        document.getElementById('active-lecture-title').innerText = `${title} - ${section}`;
        
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
    
    document.getElementById('tab-history').classList.remove('tab-blocked');
}

const btnEndEarly = document.getElementById('btn-end-early');
if (btnEndEarly) btnEndEarly.addEventListener('click', endSession);

const btnAbort = document.getElementById('btn-abort');
if (btnAbort) btnAbort.addEventListener('click', abortSession);

async function abortSession() {
    if (!confirm("Are you sure you want to ABORT? This will stop the session and NOT save any attendance data.")) {
        return;
    }
    
    clearInterval(timerInterval);
    clearInterval(attendanceInterval);
    
    try {
        await fetch(`/attendance/abort/${currentLectureId}`, { method: 'DELETE' });
        await fetch('/bluetooth/stop', { method: 'POST' }); 
    } catch (err) { console.error(err); }
    
    document.getElementById('tab-history').classList.remove('tab-blocked');
    
    document.getElementById('attendance-active').style.display = 'none';
    document.getElementById('attendance-setup').style.display = 'block';
    
    document.getElementById('attendance-timer').innerText = "02:00";
}

const btnExportYes = document.getElementById('btn-export-yes');
if(btnExportYes) btnExportYes.addEventListener('click', () => {
    const downloadUrl = `/attendance/export/${currentLectureId}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = ''; 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => {
        location.reload();
    }, 1500);
});

const btnExportNo = document.getElementById('btn-export-no');
if(btnExportNo) btnExportNo.addEventListener('click', () => {
    location.reload();
});

const attDateInput = document.getElementById('att-date');
if(attDateInput) attDateInput.valueAsDate = new Date();

// SEMESTER ATTENDANCES (HISTORY) LOGIC
async function loadSessions() {
    const listEl = document.getElementById('history-sessions-list');
    const detailEl = document.getElementById('history-session-detail');
    const backBtn = document.getElementById('btn-back-to-sessions');
    const mainTitle = document.querySelector('#section-history h1');
    
    listEl.style.display = 'grid';
    detailEl.style.display = 'none';
    backBtn.style.display = 'none';
    mainTitle.innerText = "Semester Attendances";
    currentHistoryView = 'sections';
    
    try {
        const response = await fetch('/attendance/sessions');
        allHistorySessions = await response.json();
        renderHistorySections();
    } catch (err) { console.error(err); }
}

function renderHistorySections() {
    const listEl = document.getElementById('history-sessions-list');
    const mainTitle = document.querySelector('#section-history h1');
    const backBtn = document.getElementById('btn-back-to-sessions');
    
    listEl.innerHTML = '';
    mainTitle.innerText = "Select Section";
    backBtn.style.display = 'none';
    currentHistoryView = 'sections';

    if (allHistorySessions.length === 0) {
        listEl.innerHTML = '<div class="card" style="grid-column: 1/-1; text-align: center;">No sessions found.</div>';
        return;
    }

    // Group by section
    const sections = [...new Set(allHistorySessions.map(s => s.section))].sort();
    
    sections.forEach(sec => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.style.borderTop = '4px solid #6366f1';
        card.innerHTML = `
            <div class="date-badge" style="background:#6366f1;">SECTION</div>
            <h4 style="margin-top:0.5rem;"><i class="fas fa-users"></i> ${sec}</h4>
            <p>View all lectures and attendance history for this section.</p>
            <div style="margin-top: 1rem; font-size: 0.8rem; color: #6366f1; font-weight: 700;">CLICK TO VIEW &rarr;</div>
        `;
        card.onclick = () => showTitlesBySection(sec);
        listEl.appendChild(card);
    });
}

function showTitlesBySection(section) {
    selectedHistorySection = section;
    currentHistoryView = 'titles';
    const listEl = document.getElementById('history-sessions-list');
    const mainTitle = document.querySelector('#section-history h1');
    const backBtn = document.getElementById('btn-back-to-sessions');
    
    listEl.innerHTML = '';
    mainTitle.innerText = `Lectures in ${section}`;
    backBtn.style.display = 'block';
    backBtn.onclick = renderHistorySections;
    backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Back to Sections';

    // Group by title within section
    const sectionLectures = allHistorySessions.filter(s => s.section === section);
    const titlesMap = {};
    sectionLectures.forEach(l => {
        if (!titlesMap[l.title]) titlesMap[l.title] = 0;
        titlesMap[l.title]++;
    });

    Object.keys(titlesMap).sort().forEach(title => {
        const count = titlesMap[title];
        const card = document.createElement('div');
        card.className = 'history-card';
        card.style.borderTop = '4px solid #3b82f6';
        card.innerHTML = `
            <div class="date-badge" style="background:#3b82f6;">LECTURE</div>
            <h4 style="margin-top:0.5rem;">${title}</h4>
            <p><i class="fas fa-calendar-alt"></i> ${count} sessions recorded</p>
            <div class="action-row" style="margin-top: 1rem; justify-content: space-between;">
                <span style="font-size: 0.8rem; color: #3b82f6; font-weight: 700;">VIEW SESSIONS &rarr;</span>
                <button class="btn-success-glass" onclick="event.stopPropagation(); exportFullLecture('${section}', '${title}')" title="Export Full Semester for this Subject">
                    <i class="fas fa-file-excel"></i> Export All
                </button>
            </div>
        `;
        card.onclick = () => showDatesByTitle(section, title);
        listEl.appendChild(card);
    });
}

async function exportFullLecture(section, title) {
    const url = `/attendance/export-lecture?section=${encodeURIComponent(section)}&title=${encodeURIComponent(title)}`;
    window.location.href = url;
}

function showDatesByTitle(section, title) {
    selectedHistoryTitle = title;
    currentHistoryView = 'dates';
    const listEl = document.getElementById('history-sessions-list');
    const mainTitle = document.querySelector('#section-history h1');
    const backBtn = document.getElementById('btn-back-to-sessions');
    
    listEl.innerHTML = '';
    mainTitle.innerText = `${title} (${section})`;
    backBtn.style.display = 'block';
    backBtn.onclick = () => showTitlesBySection(section);
    backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Back to Lectures';

    const sessions = allHistorySessions.filter(s => s.section === section && s.title === title);
    
    sessions.forEach(s => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="date-badge">${s.date}</div>
            <h4 style="margin-top:0.5rem;">Session: ${s.date}</h4>
            <p><i class="fas fa-clock"></i> Recorded on ${new Date(s.created_at).toLocaleTimeString()}</p>
            <div style="margin-top: 1rem; font-size: 0.8rem; color: #6366f1; font-weight: 600;">VIEW & EDIT DETAILS &rarr;</div>
            <button class="btn-delete-session" onclick="event.stopPropagation(); deleteSession(${s.id})" title="Delete Session">
                <i class="fas fa-trash-alt"></i>
            </button>
        `;
        card.onclick = () => loadSessionDetail(s.id, `${s.title} - ${s.section} (${s.date})`);
        listEl.appendChild(card);
    });
}

let historyRecords = []; 

async function loadSessionDetail(lectureId, titleDisplay) {
    const listEl = document.getElementById('history-sessions-list');
    const detailEl = document.getElementById('history-session-detail');
    const backBtn = document.getElementById('btn-back-to-sessions');
    const mainTitle = document.querySelector('#section-history h1');
    
    listEl.style.display = 'none';
    detailEl.style.display = 'block';
    backBtn.style.display = 'block';
    backBtn.onclick = () => {
        detailEl.style.display = 'none';
        listEl.style.display = 'grid';
        showDatesByTitle(selectedHistorySection, selectedHistoryTitle);
    };
    backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Back to Dates';
    
    mainTitle.innerText = "Attendance Detail";
    document.getElementById('history-detail-title').innerText = titleDisplay;
    currentLectureId = lectureId; 
    
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
    renderHistoryTable();
}

const btnSaveHistory = document.getElementById('btn-save-history');
if(btnSaveHistory) btnSaveHistory.addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-history');
    btn.disabled = true;
    btn.innerText = "SAVING...";
    
    try {
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

const btnBackToSessions = document.getElementById('btn-back-to-sessions');
if(btnBackToSessions) btnBackToSessions.addEventListener('click', () => {
    // This is the global back behavior handled by dynamic onclicks, 
    // but we can provide a fallback if needed.
});

const btnExportHistory = document.getElementById('btn-export-history');
if(btnExportHistory) btnExportHistory.addEventListener('click', () => {
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

let allFetchedStudents = [];

async function loadFetchedStudents() {
    backToFetchedLanding();
    try {
        const res = await fetch('/students/list');
        allFetchedStudents = await res.json();

        const sections = {};
        allFetchedStudents.forEach(s => {
            if (!sections[s.section]) sections[s.section] = [];
            sections[s.section].push(s);
        });

        const sectionNames = Object.keys(sections).sort();
        
        renderBleDashboard(sections, sectionNames);
        renderHotspotDashboard(sections, sectionNames);
    } catch (err) {
        console.error("Error loading fetched students:", err);
    }
}

function renderBleDashboard(sections, sectionNames) {
    const container = document.getElementById('ble-sections-container');
    if (!container) return;

    if (sectionNames.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); text-align:center;">No student data found.</p>';
        return;
    }

    container.innerHTML = '';
    sectionNames.forEach(section => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.style.marginBottom = '1rem';
        card.innerHTML = `
            <div class="date-badge" style="background:#6366f1; border-bottom-left-radius: 12px; padding: 0.3rem 1.2rem;">SECTION</div>
            <h4 style="margin-top:0.5rem;"><i class="fas fa-users" style="color:#6366f1; margin-right:0.5rem;"></i> ${section}</h4>
            <p style="margin-bottom:1rem; font-size:0.85rem;">View all registered students in this section.</p>
            <div style="color:#6366f1; font-weight:700; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">CLICK TO VIEW STUDENTS &rarr;</div>
        `;
        card.onclick = () => showBleSectionDetails(section);
        container.appendChild(card);
    });
}

function renderHotspotDashboard(sections, sectionNames) {
    const container = document.getElementById('hotspot-sections-container');
    if (!container) return;

    if (sectionNames.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); text-align:center;">No student data found.</p>';
        return;
    }

    container.innerHTML = '';
    sectionNames.forEach(section => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.style.marginBottom = '1rem';
        card.innerHTML = `
            <div class="date-badge" style="background:#3b82f6; border-bottom-left-radius: 12px; padding: 0.3rem 1.2rem;">SECTION</div>
            <h4 style="margin-top:0.5rem;"><i class="fas fa-users" style="color:#3b82f6; margin-right:0.5rem;"></i> ${section}</h4>
            <p style="margin-bottom:1rem; font-size:0.85rem;">View all registered students in this section.</p>
            <div style="color:#3b82f6; font-weight:700; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">CLICK TO VIEW STUDENTS &rarr;</div>
        `;
        card.onclick = () => showHotspotSectionDetails(section);
        container.appendChild(card);
    });
}

function backToFetchedLanding() {
    const landing = document.getElementById('fetched-landing-view');
    const detail = document.getElementById('fetched-detail-view');
    if (landing) landing.style.display = 'grid';
    if (detail) detail.style.display = 'none';
}

function showBleSectionDetails(section) {
    const landingView = document.getElementById('fetched-landing-view');
    const detailView = document.getElementById('fetched-detail-view');
    const thead = document.getElementById('fetched-detail-thead');
    const tbody = document.getElementById('fetched-detail-tbody');
    const title = document.getElementById('fetched-detail-header-title');

    landingView.style.display = 'none';
    detailView.style.display = 'block';
    
    title.innerText = `BLE Registrations: ${section}`;
    thead.innerHTML = '<tr><th>Roll Number</th><th>Name</th><th>Section</th><th>MAC/UUID</th><th>Status</th><th>Action</th></tr>';
    
    const students = allFetchedStudents.filter(s => s.section === section);
    tbody.innerHTML = students.map(s => `
        <tr>
            <td>${s.roll_number}</td>
            <td>${s.name}</td>
            <td>${s.section}</td>
            <td><code style="font-size:0.75rem;">${s.device_identifier || '---'}</code></td>
            <td>
                <span class="${s.device_identifier ? 'status-present' : 'status-absent'}" style="background:${s.device_identifier ? 'rgba(99,102,241,0.1)' : 'rgba(239,68,68,0.1)'}; color:${s.device_identifier ? '#6366f1' : '#ef4444'}">
                    ${s.device_identifier ? '✅ registered' : '🔴 unregistered'}
                </span>
            </td>
            <td>
                <button class="btn-unregister" onclick="unregisterStudent('${s.roll_number}', '${section}')" ${!s.device_identifier ? 'disabled' : ''}>
                    <i class="fas fa-unlink"></i> Unregister
                </button>
            </td>
        </tr>
    `).join('');
}

function showHotspotSectionDetails(section) {
    const landingView = document.getElementById('fetched-landing-view');
    const detailView = document.getElementById('fetched-detail-view');
    const thead = document.getElementById('fetched-detail-thead');
    const tbody = document.getElementById('fetched-detail-tbody');
    const title = document.getElementById('fetched-detail-header-title');

    landingView.style.display = 'none';
    detailView.style.display = 'block';

    title.innerText = `Hotspot Registrations: ${section}`;
    thead.innerHTML = '<tr><th>Roll Number</th><th>Name</th><th>Section</th><th>Wi-Fi MAC</th><th>Status</th><th>Action</th></tr>';

    const students = allFetchedStudents.filter(s => s.section === section);
    tbody.innerHTML = students.map(s => `
        <tr>
            <td>${s.roll_number}</td>
            <td>${s.name}</td>
            <td>${s.section}</td>
            <td><code style="font-size:0.75rem;">${s.wifi_mac || '---'}</code></td>
            <td>
                <span class="${s.wifi_mac ? 'status-present' : 'status-absent'}" style="background:${s.wifi_mac ? 'rgba(59,130,246,0.1)' : 'rgba(239,68,68,0.1)'}; color:${s.wifi_mac ? '#3b82f6' : '#ef4444'}">
                    ${s.wifi_mac ? '✅ registered' : '🔴 unregistered'}
                </span>
            </td>
            <td>
                <button class="btn-unregister" onclick="unassignWifiMac(${s.id}, '${section}')" ${!s.wifi_mac ? 'disabled' : ''}>
                    <i class="fas fa-trash"></i> Unassign
                </button>
            </td>
        </tr>
    `).join('');
}

async function unregisterStudent(rollNumber, sectionContext = null) {
    if (!confirm(`Are you sure you want to unregister student ${rollNumber}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/students/unregister/${rollNumber}`, { method: 'DELETE' });
        if (response.ok) {
            if (sectionContext) {
                await loadFetchedStudents(); 
                showBleSectionDetails(sectionContext);
            } else {
                const section = document.getElementById('reg-section').value;
                if (section) loadStudentPreview(section);
            }
        }
    } catch (err) { console.error(err); }
}

async function unassignWifiMac(studentId, sectionContext = null) {
    if (!confirm(`Are you sure you want to unassign Wi-Fi MAC for this student?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/wifi/unassign/${studentId}`, { method: 'DELETE' });
        if (response.ok) {
            if (sectionContext) {
                await loadFetchedStudents();
                showHotspotSectionDetails(sectionContext);
            } else {
                if (wifiLoadedSection) loadWifiSectionData(wifiLoadedSection);
            }
        }
    } catch (err) { console.error(err); }
}

// WI-FI REGISTRATION LOGIC
const wifiDropZone = document.getElementById('wifi-drop-zone');
const wifiFileInput = document.getElementById('wifi-student-file');

// Drag and drop events for Wi-Fi
['dragover', 'dragenter'].forEach(eventName => {
    if(wifiDropZone) wifiDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        wifiDropZone.style.borderColor = '#a855f7';
        wifiDropZone.style.background = 'rgba(255, 255, 255, 0.4)';
    });
});

['dragleave', 'drop'].forEach(eventName => {
    if(wifiDropZone) wifiDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        wifiDropZone.style.borderColor = '#6366f1';
        wifiDropZone.style.background = 'rgba(255, 255, 255, 0.2)';
    });
});

if(wifiDropZone) wifiDropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        wifiFileInput.files = files;
        updateWifiFileDisplay(files[0]);
    }
});

if(wifiFileInput) wifiFileInput.addEventListener('change', () => {
    if (wifiFileInput.files.length > 0) {
        updateWifiFileDisplay(wifiFileInput.files[0]);
    }
});

function updateWifiFileDisplay(file) {
    const def = document.getElementById('wifi-upload-content-default');
    const ready = document.getElementById('wifi-upload-content-ready');
    const nameDisp = document.getElementById('wifi-file-name-display');
    const status = document.getElementById('wifi-upload-status');
    
    if(def) def.style.display = 'none';
    if(ready) ready.style.display = 'flex';
    if(nameDisp) nameDisp.innerText = file.name;
    if(status) status.innerText = "";
}

// Handle remove button
document.addEventListener('click', (e) => {
    if(e.target && e.target.id === 'wifi-btn-remove-file') {
        e.preventDefault();
        const wifiInput = document.getElementById('wifi-student-file');
        if(wifiInput) wifiInput.value = "";
        const def = document.getElementById('wifi-upload-content-default');
        const ready = document.getElementById('wifi-upload-content-ready');
        const status = document.getElementById('wifi-upload-status');
        if(def) def.style.display = 'flex';
        if(ready) ready.style.display = 'none';
        if(status) status.innerText = "File removed";
    }
});

const btnWifiUpload = document.getElementById('btn-wifi-upload');
if(btnWifiUpload) btnWifiUpload.addEventListener('click', async () => {
    const section = document.getElementById('wifi-reg-section').value;
    const fileInput = document.getElementById('wifi-student-file');
    const file = fileInput ? fileInput.files[0] : null;
    
    if (!section || !file) {
        alert("Please provide section and select an Excel file.");
        return;
    }
    
    const formData = new FormData();
    formData.append('section', section);
    formData.append('file', file);
    
    btnWifiUpload.disabled = true;
    const status = document.getElementById('wifi-upload-status');
    if(status) status.innerText = "Uploading...";

    try {
        const response = await fetch('/students/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if(status) status.innerText = data.message;
        
        if (response.ok) {
            document.getElementById('wifi-reg-upload-state').style.display = 'none';
            document.getElementById('wifi-reg-scan-state').style.display = 'block';
            document.getElementById('wifi-reg-list-card').style.display = 'block';
            const loadedSectionSpan = document.getElementById('wifi-reg-loaded-section');
            if(loadedSectionSpan) loadedSectionSpan.innerText = section;
            loadWifiSectionData(section);
        }
    } catch (err) {
        if(status) status.innerText = "Upload failed: " + err;
    } finally {
        btnWifiUpload.disabled = false;
    }
});

let wifiLoadedSection = null;
async function loadWifiSectionData(section) {
    wifiLoadedSection = section;
    const response = await fetch(`/students/list?section=${section}`);
    const students = await response.json();
    
    const tbody = document.getElementById('wifi-registered-table-body');
    tbody.innerHTML = '';
    
    // Store only for dropdown usage (unregistered students)
    wifiCurrentSectionStudents = students;
    
    // Show only registered students in the list card
    students.filter(s => s.wifi_mac).forEach(s => {
        const row = `<tr>
            <td>${s.roll_number}</td>
            <td>${s.name}</td>
            <td><code style="font-size:0.75rem;">${s.wifi_mac}</code></td>
            <td>
                <button class="btn-unregister" onclick="unassignWifiMac(${s.id})" title="Unassign MAC">
                    <i class="fas fa-trash"></i> Unassign
                </button>
            </td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

const btnWifiRegScan = document.getElementById('btn-wifi-scan');
if(btnWifiRegScan) btnWifiRegScan.addEventListener('click', async () => {
    const btn = document.getElementById('btn-wifi-scan');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
    
    try {
        const res = await fetch('/wifi/scan-devices');
        const data = await res.json();
        renderWifiScanTable(data.devices || []);
    } catch (err) { console.error(err); }
    finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-search"></i> Scan Connected Devices';
    }
});

function renderWifiScanTable(devices) {
    const tbody = document.getElementById('wifi-devices-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    if (devices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem;">No new devices detected. Ensure students are connected to your hotspot.</td></tr>';
        return;
    }

    // Build options string once
    const options = '<option value="">Select Student</option>' + 
        wifiCurrentSectionStudents.filter(s => !s.wifi_mac).map(s => 
            `<option value="${s.id}">${s.roll_number} - ${s.name}</option>`
        ).join('');

    devices.forEach((d, i) => {
        const selectId = `wifi-select-student-${i}`;
        const row = `<tr>
            <td><small>${d.name || d.ip}</small></td>
            <td><code style="font-size:0.85rem;">${d.mac}</code></td>
            <td>
                <select id="${selectId}" class="form-control" style="padding: 0.4rem; width: 100%; border-radius: 8px; border: 1px solid #e5e7eb;">
                    ${options}
                </select>
            </td>
            <td>
                <button class="btn-primary" onclick="assignWifiMac('${d.mac}', '${selectId}', this)">
                    <i class="fas fa-link"></i> Assign
                </button>
            </td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

async function assignWifiMac(mac, selectId, btn) {
    const studentId = document.getElementById(selectId).value;
    if (!studentId) {
        alert("Please select a student first.");
        return;
    }
    
    try {
        const res = await fetch('/wifi/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: parseInt(studentId), mac: mac })
        });
        
        if (res.ok) {
            const row = btn.closest('tr');
            if (row) row.remove();
            await loadWifiSectionData(wifiLoadedSection);
        } else {
            const data = await res.json();
            alert(data.detail || "Error assigning MAC.");
        }
    } catch (err) {
        console.error(err);
        alert("Error assigning MAC.");
    }
}

// WI-FI ATTENDANCE LOGIC
async function loadWifiAttendanceSections() {
    try {
        const response = await fetch('/students/sections');
        const sections = await response.json();
        const dropdown = document.getElementById('wifi-att-section-dropdown');
        if (!dropdown) return;
        dropdown.innerHTML = '';
        sections.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            dropdown.appendChild(opt);
        });
    } catch (err) { console.error(err); }
}

async function checkWifiAttendanceStatus() {
    try {
        const res = await fetch('/wifi-attendance/status');
        const data = await res.json();
        
        if (data.session_active && data.lecture_id) {
            currentLectureId = data.lecture_id;
            
            if (document.getElementById('wifi-att-active').style.display !== 'block') {
                document.getElementById('wifi-att-setup').style.display = 'none';
                document.getElementById('wifi-att-active').style.display = 'block';
                
                if (!wifiTimerInterval) {
                    startWifiLocalTimer();
                }
                if (!wifiAttendanceInterval) {
                    wifiAttendanceInterval = setInterval(checkWifiAttendanceStatus, 5000);
                }
            }

            // Sync local time with server authoritative time only if drift is significant (> 10s)
            if (Math.abs(wifiTimeRemaining - data.time_remaining) > 10) {
                wifiTimeRemaining = data.time_remaining;
            }

            updateWifiAttendanceUI(data);

            if (data.time_remaining <= 0) {
                stopWifiAttendanceUI(true);
            }
        } else if (!data.session_active && currentLectureId) {
            stopWifiAttendanceUI();
            document.getElementById('wifi-att-active').style.display = 'none';
            document.getElementById('wifi-att-setup').style.display = 'none';
            document.getElementById('wifi-session-complete').style.display = 'block';
        }
    } catch(e) { console.error("Poll Error:", e); }
}

// BUG FIX 2: Local 1s timer for smooth countdown
function startWifiLocalTimer() {
    if (wifiTimerInterval) clearInterval(wifiTimerInterval);
    wifiTimerInterval = setInterval(() => {
        if (wifiTimeRemaining > 0) {
            wifiTimeRemaining--;
            renderWifiTimer();
        } else {
            stopWifiAttendanceUI(true);
        }
    }, 1000);
}

function renderWifiTimer() {
    const timerDisplay = document.getElementById('wifi-attendance-timer');
    if (timerDisplay) {
        const mins = Math.floor(wifiTimeRemaining / 60);
        const secs = wifiTimeRemaining % 60;
        timerDisplay.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

function updateWifiAttendanceUI(data) {
    const tbodyAbsent = document.querySelector('#wifi-table-absent tbody');
    const tbodyPresent = document.querySelector('#wifi-table-present tbody');
    if (tbodyAbsent && tbodyPresent) {
        tbodyAbsent.innerHTML = (data.absent || []).map(s => `<tr><td>${s.roll_number}</td><td>${s.name}</td></tr>`).join('');
        tbodyPresent.innerHTML = (data.present || []).map(s => `<tr><td>${s.roll_number}</td><td>${s.name}</td></tr>`).join('');
    }

    const total = (data.present?.length || 0) + (data.absent?.length || 0);
    const statsEl = document.getElementById('wifi-session-stats');
    if(statsEl) {
        statsEl.innerText = `${data.present?.length || 0} present, ${data.absent?.length || 0} absent out of ${total} students`;
    }
}

function stopWifiAttendanceUI(fromTimer = false) {
    if (wifiAttendanceInterval) clearInterval(wifiAttendanceInterval);
    wifiAttendanceInterval = null;
    if (wifiTimerInterval) clearInterval(wifiTimerInterval);
    wifiTimerInterval = null;
    
    if (fromTimer) {
        fetch('/wifi-attendance/stop', { method: 'POST' }).catch(e => console.error(e));
        document.getElementById('wifi-att-active').style.display = 'none';
        document.getElementById('wifi-att-setup').style.display = 'none';
        document.getElementById('wifi-session-complete').style.display = 'block';
    }
}

const btnWifiAttNext = document.getElementById('btn-wifi-att-next');
if(btnWifiAttNext) btnWifiAttNext.addEventListener('click', async () => {
    const title = document.getElementById('wifi-att-title').value;
    const date = document.getElementById('wifi-att-date').value;
    const section = document.getElementById('wifi-att-section-dropdown').value;
    const duration = document.getElementById('wifi-att-duration').value;
    
    if (!title || !date || !section) {
        alert("Please fill all fields.");
        return;
    }
    
    const response = await fetch('/wifi-attendance/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, date, section, duration: parseInt(duration) })
    });
    
    if (response.ok) {
        const data = await response.json();
        currentLectureId = data.lecture_id;
        document.getElementById('wifi-att-setup').style.display = 'none';
        document.getElementById('wifi-att-active').style.display = 'block';
        document.getElementById('wifi-active-lecture-title').innerText = `${title} - ${section}`;
        
        wifiTimeRemaining = parseInt(duration) * 60; 
        startWifiLocalTimer();
        if (wifiAttendanceInterval) clearInterval(wifiAttendanceInterval);
        wifiAttendanceInterval = setInterval(checkWifiAttendanceStatus, 5000);    } else {
        const err = await response.json();
        alert(err.detail);
    }
});

const btnWifiAttStop = document.getElementById('btn-wifi-att-stop');
if(btnWifiAttStop) btnWifiAttStop.addEventListener('click', async () => {
    stopWifiAttendanceUI();
    try {
        await fetch('/wifi-attendance/stop', { method: 'POST' });
    } catch(e) { console.error(e); }
    
    document.getElementById('wifi-att-active').style.display = 'none';
    document.getElementById('wifi-att-setup').style.display = 'none';
    document.getElementById('wifi-session-complete').style.display = 'block';
});

const btnWifiExportYes = document.getElementById('btn-wifi-export-yes');
if(btnWifiExportYes) btnWifiExportYes.addEventListener('click', () => {
    window.location.href = `/attendance/export/${currentLectureId}`;
    setTimeout(() => location.reload(), 1500);
});

const btnWifiExportNo = document.getElementById('btn-wifi-export-no');
if(btnWifiExportNo) btnWifiExportNo.addEventListener('click', () => {
    location.reload();
});

let wifiStatusInterval = null;
function startWifiStatusPolling() {
    if (wifiStatusInterval) clearInterval(wifiStatusInterval);
    const checkStatus = async () => {
        try {
            const response = await fetch('/wifi/hotspot-status');
            const data = await response.json();
            ['wifi-reg-hotspot-status'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                if (data.active) {
                    el.className = 'hotspot-status-bar green';
                    el.innerHTML = `<i class="fas fa-check-circle"></i> Hotspot Active — Students can connect (Gateway: ${data.ip})`;
                } else {
                    el.className = 'hotspot-status-bar red';
                    el.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Hotspot Not Active — Please enable Windows Mobile Hotspot`;
                }
            });
        } catch (err) {}
    };
    checkStatus();
    wifiStatusInterval = setInterval(checkStatus, 3000);
}

const savedTab = localStorage.getItem('activeTab');
if (savedTab) {
    switchTab(savedTab);
} else {
    switchTab('register');
}

const wifiAttDateInput = document.getElementById('wifi-att-date');
if(wifiAttDateInput) wifiAttDateInput.valueAsDate = new Date();
if(currentTab === 'wifi-attendance') loadWifiAttendanceSections();

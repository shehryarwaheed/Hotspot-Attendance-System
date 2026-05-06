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
    
    startScanPolling();
});

document.getElementById('btn-stop-reg').addEventListener('click', async () => {
    await fetch('/bluetooth/stop', { method: 'POST' });
    stopScanPolling();
    
    document.getElementById('btn-start-reg').style.display = 'inline-block';
    document.getElementById('btn-stop-reg').style.display = 'none';
    document.getElementById('assignment-row').style.display = 'none';
});

function startScanPolling() {
    if (scanInterval) clearInterval(scanInterval);
    
    const poll = async () => {
        try {
            const response = await fetch('/bluetooth/scan');
            const data = await response.json();
            const devices = data.devices;
            
            // Warning banner for Classic BT
            const banner = document.getElementById('classic-warning');
            if (banner) {
                banner.style.display = data.classic_available ? 'none' : 'block';
            }
            
            const selectDevice = document.getElementById('select-device');
            const currentVal = selectDevice.value;
            selectDevice.innerHTML = '<option value="">Select Device</option>';
            
            devices.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.address;
                opt.dataset.name = d.name;
                
                // Signal strength color code
                let signalText = "Weak";
                let signalColor = "#ef4444"; // red
                if (d.rssi_estimated) {
                    signalText = "~Estimated";
                    signalColor = "#94a3b8"; // grey
                } else if (d.rssi >= -65) {
                    signalText = "Strong";
                    signalColor = "#22c55e"; // green
                } else if (d.rssi >= -85) {
                    signalText = "Medium";
                    signalColor = "#f59e0b"; // orange
                } else {
                    signalText = "Weak";
                    signalColor = "#ef4444"; // red
                }

                // Display format: {name} — {address} — 📶 {rssi} dBm [{source}]
                opt.textContent = `${d.name} — ${d.address} — 📶 ${d.rssi} dBm [${d.source}]`;
                opt.style.color = signalColor;
                
                selectDevice.appendChild(opt);
            });
            selectDevice.value = currentVal;
        } catch (err) { console.error(err); }
    };
    
    poll();
    scanInterval = setInterval(poll, 3000);
}

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
    
    // Problem 5: Clean up "Unknown" names
    if (deviceName.startsWith("Unknown")) {
        deviceName = "";
    }
    
    if (!roll || !mac) {
        alert("Select both a student and a device.");
        return;
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
        const registered = students.filter(s => s.device_identifier);
        const msg = document.getElementById('att-guard-msg');
        const btn = document.getElementById('btn-att-next');
        
        if (!msg || !btn) return;

        if (registered.length === 0) {
            msg.innerText = "No registered students found. Please register students first.";
            btn.disabled = true;
        } else {
            msg.innerText = "";
            btn.disabled = false;
        }
    } catch (err) { console.error("Failed to check registered students", err); }
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
    
    const tbody = document.querySelector('#live-attendance-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    let presentCount = 0;
    data.forEach(a => {
        if (a.status === 'present') presentCount++;
        
        let statusBadge = `<span class="status-absent">ABSENT</span>`;
        if (a.status === 'present') {
            const source = a.match_method ? a.match_method.split('_')[1] : 'unknown';
            statusBadge = `<span class="badge ${source === 'classic' ? 'badge-indigo' : 'badge-blue'}">PRESENT [${source}]</span>`;
        }

        const row = `<tr>
            <td>${a.roll_number}</td>
            <td>${a.name}</td>
            <td>${statusBadge}</td>
        </tr>`;
        tbody.innerHTML += row;
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
}

if (document.getElementById('btn-end-early')) {
    document.getElementById('btn-end-early').addEventListener('click', endSession);
}

document.getElementById('btn-export-yes').addEventListener('click', () => {
    window.location.href = `/attendance/export/${currentLectureId}`;
    location.reload(); // Refresh to reset state
});

document.getElementById('btn-export-no').addEventListener('click', () => {
    location.reload();
});

// Set default date to today
document.getElementById('att-date').valueAsDate = new Date();

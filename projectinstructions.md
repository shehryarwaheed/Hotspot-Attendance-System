# BLE Attendance System — Complete Project Instructions

> **Version:** 1.1 (includes early session termination + manual stop)  
> **Stack:** Python · FastAPI · PostgreSQL · Bleak (BLE) · Vanilla HTML/CSS/JS  
> **Platform:** Cross-platform localhost (Windows, macOS, Linux; accessible from iOS/Android on same LAN)

---

## PROJECT OVERVIEW

Build a full-stack desktop web application that runs on **localhost** for a teacher to register students and take automated Bluetooth (BLE) attendance. The system has **no student-side portal** — only the teacher uses it. It must be cross-platform (Windows, macOS, Linux, and accessible from iOS/Android browsers on the same local network).

---

## TECH STACK

| Layer | Technology |
|---|---|
| Backend | Python (FastAPI) |
| Frontend | HTML + CSS + Vanilla JS (served by FastAPI) |
| Database | PostgreSQL |
| BLE Scanning | Python `bleak` library (async BLE scanner) |
| Excel Parsing | `openpyxl` or `pandas` |
| Excel Export | `openpyxl` |
| Cross-platform server | `uvicorn` |

---

## DATABASE SCHEMA

### Table: `students`
```sql
id            SERIAL PRIMARY KEY
roll_number   VARCHAR(50) UNIQUE NOT NULL
name          VARCHAR(100) NOT NULL
section       VARCHAR(50) NOT NULL
mac_address   VARCHAR(17) DEFAULT NULL  -- NULL until registered; stores UUID on macOS
created_at    TIMESTAMP DEFAULT NOW()
```

### Table: `lectures`
```sql
id            SERIAL PRIMARY KEY
title         VARCHAR(200) NOT NULL
section       VARCHAR(50) NOT NULL
date          DATE NOT NULL
created_at    TIMESTAMP DEFAULT NOW()
```

### Table: `attendance`
```sql
id            SERIAL PRIMARY KEY
lecture_id    INTEGER REFERENCES lectures(id)
student_id    INTEGER REFERENCES students(id)
status        VARCHAR(10) DEFAULT 'absent'  -- 'present' or 'absent'
marked_at     TIMESTAMP DEFAULT NULL
```

---

## APPLICATION STRUCTURE

```
project/
├── main.py                  # FastAPI app entry point
├── database.py              # PostgreSQL connection + ORM
├── models.py                # SQLAlchemy models
├── routers/
│   ├── students.py          # Student registration endpoints
│   ├── attendance.py        # Attendance session endpoints
│   └── bluetooth.py         # BLE scan endpoints
├── services/
│   ├── ble_service.py       # bleak BLE scanner logic
│   └── excel_service.py     # Excel parse + export logic
├── static/
│   ├── css/style.css
│   └── js/app.js
└── templates/
    └── index.html           # Single page app with 2 sidebar tabs
```

---

## UI LAYOUT & DESIGN

### General Layout
- **Left sidebar** (fixed, ~220px wide) with two navigation tabs:
  - 📋 Register Students
  - ✅ Take Attendance
- **Main content area** (right side) renders based on active tab
- Clean, modern UI — dark sidebar, white content area
- Responsive enough to work on tablet/mobile browser (same LAN)

---

## TAB 1 — REGISTER STUDENTS

### Step 1: Upload Excel File
- Show a file upload box: **"Upload Student Excel File (.xlsx)"**
- Excel format: **Column A = Roll Number, Column B = Name**
- A visible input field for **Section Name** (text input) must be filled before upload
- On upload, backend:
  - Parses the Excel using `pandas` or `openpyxl`
  - Inserts each student into `students` table with `section` from input, `mac_address = NULL`
  - If roll number already exists in DB, **skip** (no duplicates)
- Show a **parsed preview table** on screen: Roll Number | Name | Section | MAC Status
- Show success message: `"X students loaded from Excel"`

### Step 2: Start Registration Session
- After upload, show button: **"START REGISTRATION SESSION"**
- On click:
  - Backend calls `bleak` to **start async BLE scan** (continuous, not timed)
  - Returns list of discovered devices: `[{ name, mac_address }]`
  - Frontend polls `/bluetooth/scan` every **3 seconds** and updates a live device list table
- UI shows two dropdowns side by side:
  - **Dropdown 1:** Roll Number (populated from uploaded students with `mac_address = NULL`)
  - **Dropdown 2:** Detected BLE Device (Name + MAC/UUID from live scan)
- Button: **"ASSIGN MAC ADDRESS"**
  - On click: saves selected MAC/UUID to that student's record in DB
  - Updates the preview table — that student row shows MAC ✅
  - Removes that roll number from Dropdown 1
- Button: **"STOP REGISTRATION SESSION"** — stops BLE scan
- Show progress: `"X / Y students registered"`

---

## TAB 2 — TAKE ATTENDANCE

### Guard Check
- On tab load, query DB for students with `mac_address IS NOT NULL`
- If **none found:** show message — `"No registered students found. Please register students first."` — disable everything
- If students exist: show the session setup form

### Step 1: Session Setup Form
Fields:
- **Lecture Title** — text input
- **Date** — date picker (default: today)
- **Section** — dropdown populated from **distinct sections** present in `students` table

Button: **"NEXT →"**

### Step 2: Attendance Session
- On NEXT:
  - Create a new `lectures` record in DB
  - Load all students from DB where `section = selected_section` AND `mac_address IS NOT NULL`
  - Insert one `attendance` row per student with `status = 'absent'` for this lecture
  - Show a **live attendance table:** Roll Number | Name | Status (🔴 Absent by default)
  - Start a **2-minute countdown timer** displayed prominently on screen (e.g. `01:47 remaining`)
  - Backend starts BLE scan via `bleak` — continuously scanning
  - Show button: **"END SESSION EARLY"** (visible at all times during scan — see below)

### Step 3: Real-time MAC Matching
- Backend scans BLE devices every **3 seconds**
- For each discovered device MAC/UUID address:
  - Query `students` table: does any student have this identifier?
  - If YES and that student belongs to the current section and lecture:
    - Update `attendance` record: `status = 'present'`, `marked_at = NOW()`
    - Frontend live table updates that student row to ✅ Present (green)
- Frontend polls `/attendance/live/{lecture_id}` every 3 seconds to refresh table

### Step 4: Session End

**Two ways to end the session:**

#### A) Timer Ends (after 2 minutes — automatic)
- Timer hits 0 → BLE scan stops automatically

#### B) Teacher Ends Early (manual)
- Teacher clicks **"END SESSION EARLY"** button at any time during the 2-minute window
- This is useful when all students are already marked present — no need to wait
- Backend stops BLE scan immediately
- Timer is cancelled

**In both cases, after the session ends:**
- All remaining `absent` records are finalized in DB (**attendance is ALWAYS saved to DB regardless of export choice**)
- Show **final summary:** `"X present, Y absent out of Z students"`
- Show modal/dialog: **"Export attendance to Excel?"**
  - **YES** → generate and download `.xlsx` file:
    - Columns: Roll Number | Name | Status (Present/Absent)
    - Filename: `Attendance_{Section}_{Date}_{LectureTitle}.xlsx`
  - **NO / CLOSE** → dismiss — data is already safely stored in DB

---

## BACKEND API ENDPOINTS

```
POST   /students/upload            # Parse Excel + insert students
GET    /students/list              # Get all students (optional filters)
GET    /students/sections          # Get distinct sections

GET    /bluetooth/scan             # Trigger BLE scan, return devices list
POST   /bluetooth/stop             # Stop ongoing BLE scan
POST   /bluetooth/assign           # { roll_number, mac_address } → update student

POST   /attendance/start           # { title, date, section } → create lecture + attendance rows
GET    /attendance/live/{id}       # Return current attendance status for lecture
POST   /attendance/stop            # Stop BLE scan, finalize session (used for both auto + early end)
GET    /attendance/export/{id}     # Return Excel file download for lecture
```

---

## BLE SERVICE LOGIC (`ble_service.py`)

```python
# Use bleak BleakScanner
# Run continuous scan in asyncio background task
# Store discovered devices in a shared in-memory dict: { mac_address: device_name }
# Expose get_discovered_devices() → list of { mac, name }
# stop_scan() → cancel background task
#
# On macOS: bleak returns UUID instead of MAC — handle this edge case gracefully
#   by storing the UUID as the identifier and matching against stored UUIDs
# Note for macOS: Apple randomizes/hides real MACs — during registration,
#   teacher must register using the UUID shown by bleak on macOS
#
# Label the identifier field "Device Identifier (MAC or UUID)" in the UI
# to be accurate on all platforms
```

---

## CROSS-PLATFORM NOTES

- Run with: `uvicorn main:app --host 0.0.0.0 --port 8000`
- Teacher opens `http://localhost:8000` on their laptop
- Students on same WiFi can optionally view (no portal, just FYI)
- `bleak` supports Windows (WinRT), macOS (CoreBluetooth), Linux (BlueZ)
- On **macOS**, BLE devices show **UUID not MAC** — the app must:
  - Label the field "Device Identifier (MAC or UUID)" accordingly
  - Store and match using whatever identifier `bleak` returns on that OS
- Provide a `requirements.txt` and a `README.md` with setup instructions including PostgreSQL setup, `pip install`, and run command

---

## requirements.txt

```
fastapi
uvicorn
bleak
pandas
openpyxl
psycopg2-binary
sqlalchemy
python-multipart
python-dotenv
```

---

## IMPORTANT IMPLEMENTATION RULES

1. **Never block the event loop** — all BLE operations must use `asyncio` / background tasks
2. **BLE scan is shared state** — one global scanner instance, not a new one per request
3. **Attendance ALWAYS saves to DB** — data is persisted immediately after session ends, whether or not the teacher exports Excel; DB save must never depend on export action
4. **Graceful BLE errors** — if Bluetooth is off or unavailable, show a clear UI error: `"Bluetooth unavailable — please enable Bluetooth on this device"`
5. **No authentication required** — this is a local-only teacher tool
6. **PostgreSQL credentials** — read from a `.env` file using `python-dotenv`
7. All API responses return **JSON**
8. Frontend is a **single HTML page** with JS handling tab switching — no frameworks, no React, pure HTML/CSS/JS
9. **Early session end** — `POST /attendance/stop` must work both when called by the timer AND when called manually by the teacher; behavior is identical in both cases

---

## MAC ADDRESS RELIABILITY NOTES (for developer awareness)

### Windows & Linux
- Real hardware MAC addresses are returned by `bleak` — these are **stable and permanent** per device NIC. Safe to use as a long-term identifier.

### macOS
- Apple's CoreBluetooth does **not** expose real MAC addresses. Instead, `bleak` returns a **UUID** generated by the OS per device per Mac. This UUID is stable as long as the student uses the same laptop's Bluetooth with the same teacher's Mac. Acceptable for classroom use.

### Android
- Real MAC addresses are returned in most cases. Some Android 10+ devices use **randomized MAC addresses** by default for Wi-Fi but Bluetooth MACs are generally stable. Risk is low but possible on newer Android versions.

### iOS
- Similar to macOS — iOS does **not** expose real MACs. `bleak` returns a UUID. Stable per pairing with the same scanning device.

### Recommendation
- The approach works reliably for **Windows and Linux laptops** (most common in classrooms).
- For **iOS/Android students**, the UUID approach works if the teacher's laptop is consistent (same machine every class).
- Document this limitation clearly in the README.

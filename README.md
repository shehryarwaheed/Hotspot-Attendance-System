# 📶 Hotspot Attendance System

An automated **Wi-Fi Hotspot based attendance system** for university classrooms.  
The teacher creates a hotspot — students connect — attendance is marked **automatically**. No manual roll calls.

> Developed by: Muhammad Shehryar Waheed · FAST NUCES Lahore

---

## 🚀 How It Works

```
Teacher uploads student Excel sheet
        ↓
Students connect to teacher's laptop hotspot (ONE TIME SETUP)
        ↓
Teacher assigns each device to a student's Roll Number (ONE TIME SETUP)
        ↓
Every class → Teacher turns on hotspot
        ↓
Students connect → System detects their device → Marked PRESENT ✅
```

---

## ✨ Features

- 📋 **Excel Upload** — Import student roll numbers and names via `.xlsx`
- 📶 **Wi-Fi Hotspot Detection** — Detects students connected to teacher's laptop hotspot
- 🔗 **One-Time Device Assignment** — Assign each student's device to their Roll Number once
- ✅ **Auto Attendance** — Students marked present automatically when their device connects
- ✏️ **Manual Correction** — Teacher can manually override any attendance record
- 📊 **Export to Excel** — Export attendance per session or full semester matrix report
- 🗂️ **Session History** — View and manage all past attendance sessions

---

## 🛠️ Prerequisites

Before running the system, make sure you have:

- **Python 3.10+** → [Download](https://www.python.org/downloads/)
- **PostgreSQL** → [Download](https://www.postgresql.org/download/) (must be running)
- **Windows OS** (hotspot detection uses Windows APIs)
- Laptop must support **Mobile Hotspot** (Windows built-in)

---

## ⚙️ Setup & Installation

### Step 1 — Clone the Repository

```bash
git clone https://github.com/shehryarwaheed/Hotspot-Attendance-System.git
cd Hotspot-Attendance-System
```

### Step 2 — Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 3 — Setup PostgreSQL Database

1. Open **pgAdmin** or **psql**
2. Create a new database:
```sql
CREATE DATABASE attendance_db;
```

### Step 4 — Configure Environment Variables

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/attendance_db
```

> ⚠️ Replace `YOUR_PASSWORD` with your actual PostgreSQL password.  
> ⚠️ Never share or push your `.env` file to GitHub.

### Step 5 — Run the Application
1. Go to the `dist/` folder
2. Place your `.env` file in the **same folder** as `main.exe`
3. Double-click **`main.exe`** to launch

A browser window will open at `http://localhost:8000` 🎉

---

## 📖 Usage Guide

### 🔷 First-Time Setup (Do this ONCE per semester)

**1. Upload Student List:**
- Go to **Register Students** tab
- Enter the section name (e.g. `BCS-4A`)
- Upload your `AttendanceSheet.xlsx`
  - Column A: Roll Number
  - Column B: Student Name
- Click **Upload**

**2. Assign Devices to Students:**
- Turn on your laptop's **Mobile Hotspot**
  - Hotspot Name: `TEACHER LAPTOP`
  - Password: `12345678` *(or set your own)*
- Ask each student to connect to the hotspot
- In the system, go to **Register Students → Start Registration Session**
- Click 🔄 **Refresh Devices** — connected student phones appear by name
- Select the student's Roll Number + their device → click **Assign Device**
- Repeat for all students

> ✅ This is a **one-time process** per student. Once assigned, the system remembers their device forever.

---

### 🔷 Taking Attendance (Every Class)

1. Turn on your laptop's **Mobile Hotspot**
2. Ask students to connect to `TEACHER LAPTOP` hotspot
3. Open the system → go to **Take Attendance** tab
4. Set **Title**, **Date**, and **Section**
5. Click **Start Session** — the system scans for 2 minutes
6. Students whose devices connect are automatically marked ✅ **Present**
7. Manually correct any records if needed
8. Click **Export** to download the Excel report

---

## 📁 Project Structure

```
Hotspot-Attendance-System/
├── main.py                  # App entry point
├── database.py              # Database connection
├── requirements.txt         # Python dependencies
├── .env                     # Your DB credentials (not pushed to GitHub)
├── routers/
│   ├── attendance.py        # Attendance session routes
│   ├── students.py          # Student management routes
│   ├── wifi_attendance.py   # Wi-Fi attendance scanning
│   └── wifi_registration.py # Device registration routes
├── services/
│   ├── wifi_service.py      # Hotspot detection logic
│   └── excel_service.py     # Excel import/export
└── static/
    └── app.js               # Frontend logic
```

---

## 🔧 Troubleshooting

| Problem | Solution |
|---|---|
| Browser doesn't open | Manually go to `http://localhost:8000` |
| Database connection error | Check your `DATABASE_URL` in `.env` and ensure PostgreSQL is running |
| No devices showing up | Make sure hotspot is ON and students are connected |
| Student not marked present | Re-check device assignment, ensure hotspot is active during session |
| Excel upload fails | Ensure Roll Number is in Column A and Name is in Column B |

---

## 📄 License

This project is for **educational purposes only**. All rights reserved by the original author.

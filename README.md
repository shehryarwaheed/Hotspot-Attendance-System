# BLE Attendance System

A full-stack desktop application for automated Bluetooth (BLE) attendance.

## Prerequisites

1. **PostgreSQL**: Install and ensure it's running.
2. **Database**: Create a database named `attendance_db`.
3. **Bluetooth**: Ensure your laptop's Bluetooth is turned on.

## Setup

1. Copy the `main.exe` from `dist/` to your desired location.
2. Copy the `.env` file to the same location as `main.exe`.
3. Edit `.env` to match your PostgreSQL credentials:
   ```env
   DATABASE_URL=postgresql://postgres:password@localhost:5432/attendance_db
   ```

## Usage

1. Run `main.exe`.
2. A browser window will automatically open at `http://localhost:8000`.
3. **Register Students**:
   - Enter a section name.
   - Upload your `AttendanceSheet.xlsx` (Column A: Roll No, Column B: Name).
   - Click "Start Registration Session" to scan for student devices and assign them.
4. **Take Attendance**:
   - Go to the "Take Attendance" tab.
   - Set up the session (Title, Date, Section).
   - Click "Next" to start the 2-minute scan.
   - Students with registered devices will automatically be marked present.
   - Export to Excel once the session ends.

- **Excel Error**: Ensure the file format matches (Roll Number in col A, Name in col B).

## Classic Bluetooth Support (Windows)
pip install PyBluez==0.23

PyBluez on Windows requires:
1. A Bluetooth adapter that supports Classic Bluetooth
2. Microsoft Bluetooth drivers (not third-party)
3. Run the app as Administrator if PyBluez cannot find the Bluetooth adapter

On Linux: `sudo apt-get install libbluetooth-dev`
On macOS: Classic BT is restricted — BLE only mode will activate

## Troubleshooting
- **Bluetooth Error**: Ensure Bluetooth is enabled in Windows settings.
- **Database Connection**: Verify your `DATABASE_URL` in `.env`.
- **Excel Error**: Ensure the file format matches (Roll Number in col A, Name in col B).
- **Classic BT**: If PyBluez fails to install, the app will automatically fall back to BLE mode.

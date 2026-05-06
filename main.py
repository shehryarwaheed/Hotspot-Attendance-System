import os
import sys
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
import models
from database import engine
from routers import students, bluetooth, attendance
import uvicorn
import webbrowser
from threading import Timer

# Handle paths for PyInstaller
if getattr(sys, 'frozen', False):
    base_path = sys._MEIPASS
else:
    base_path = os.path.dirname(os.path.abspath(__file__))

# Create tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="BLE Attendance System")

app.mount("/static", StaticFiles(directory=os.path.join(base_path, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(base_path, "templates"))

# Include routers
app.include_router(students.router)
app.include_router(bluetooth.router)
app.include_router(attendance.router)

@app.get("/ble/devices")
async def get_ble_devices():
    return await ble_service.get_discovered_devices()

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={})

def open_browser():
    webbrowser.open("http://localhost:8000")

if __name__ == "__main__":
    # Open browser after a short delay to ensure server is up
    Timer(1.5, open_browser).start()
    uvicorn.run(app, host="0.0.0.0", port=8000)

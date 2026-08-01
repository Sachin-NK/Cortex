@echo off
cd /d "c:\Users\sachi\Downloads\New Folder\cortex"

echo.
echo  =========================================================
echo   Cortex - Multi-Model AI Agent Harness
echo  =========================================================
echo   Backend API : http://localhost:8000
echo   API Docs    : http://localhost:8000/docs
echo   Dashboard   : http://localhost:8000/dashboard
echo   Health      : http://localhost:8000/health
echo   Press Ctrl+C to stop
echo  =========================================================
echo.

C:\Users\sachi\AppData\Local\Programs\Python\Python38\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

@echo off
title 5 SIG BN - Unit Management System
cd /d "%~dp0"
echo.
echo  5 SIGNAL BATTALION - UNIT MANAGEMENT SYSTEM
echo  ------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is not installed. Download the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo  First run: installing packages. This takes a few minutes...
  call npm install --no-audit --no-fund
)
echo  Starting... the browser will open at http://localhost:3000
echo  Keep this window open while you use the system. Close it to stop.
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3000"
call npm run dev
pause

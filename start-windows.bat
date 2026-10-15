@echo off
title Smart Chat Agent
cd /d "%~dp0server"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed. Download the LTS version from https://nodejs.org
  echo  then run this file again.
  start https://nodejs.org
  pause
  exit /b
)

if not exist .env copy .env.example .env >nul
if not exist node_modules (
  echo  Installing packages for the first time, please wait...
  call npm install --omit=dev --no-audit --no-fund
)

echo.
echo  ===============================================
echo   Smart Chat Agent is running
echo   Dashboard: http://localhost:3000/admin/
echo   Close this window to stop the server
echo  ===============================================
start "" http://localhost:3000/admin/
node src/start.js
pause

@echo off
title 5 SIG BN - Unit Systems (keep this window open)
cd /d "%~dp0"
where node >nul 2>nul || (echo. & echo  Node.js is not installed. Install Node.js 20 LTS first ^(nodejs.org or from the USB^). & pause & exit /b)
node portal\serve.mjs
pause

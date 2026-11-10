@echo off
title 5 SIG BN - Rebuild and start
cd /d "%~dp0"
echo  Rebuilding both systems (use this after copying in a new version)...
node portal\serve.mjs --rebuild
pause

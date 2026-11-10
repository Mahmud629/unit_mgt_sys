@echo off
title 5 SIG BN - Inventory backup
cd /d "%~dp0inventory"
call npm run backup
echo.
echo  Backup saved in the Inventory_Backup folder.
pause

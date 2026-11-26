@echo off
chcp 65001 >nul
cd /d "%~dp0"
node scripts/panel.mjs --open
pause

@echo off
cd /d "%~dp0"
echo Scrap League will open at http://127.0.0.1:4390
echo Keep this terminal running while you play. Press Ctrl+C to stop.
start "" http://127.0.0.1:4390
node tools\serve.mjs
pause

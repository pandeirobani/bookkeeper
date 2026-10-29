@echo off
rem Start BookKeeper and open it in the browser. See start.ps1 for details.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 pause

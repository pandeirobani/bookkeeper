@echo off
rem Stop BookKeeper. See stop.ps1 for details.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1"
if errorlevel 1 pause

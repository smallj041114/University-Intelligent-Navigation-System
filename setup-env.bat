@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-env.ps1"
if errorlevel 1 (
  echo Setup failed.
  pause
  exit /b 1
)
echo.
pause
exit /b 0

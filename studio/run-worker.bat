@echo off
REM ===================================================================
REM  EduChess Video Studio - render worker
REM
REM  Double-click this file to start the studio. Leave the black window
REM  open while you are making videos; closing it stops the studio and
REM  any queued videos simply wait until it is started again.
REM
REM  To have it start with Windows: press Win+R, type shell:startup,
REM  press Enter, and drop a shortcut to this file into that folder.
REM ===================================================================

title EduChess Video Studio
cd /d "%~dp0.."

echo.
echo   EduChess Video Studio
echo   ---------------------
echo   Checking this computer...
echo.

python studio\worker.py --check
if errorlevel 1 (
  echo.
  echo   Something above needs fixing before videos can be made.
  echo   Fix it, then run this file again.
  echo.
  pause
  exit /b 1
)

echo.
echo   Starting. Keep this window open while you make videos.
echo   Press Ctrl+C to stop.
echo.

python studio\worker.py
pause

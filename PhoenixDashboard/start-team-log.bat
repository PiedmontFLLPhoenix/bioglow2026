@echo off
title Phoenix team log
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed on this computer.
  echo   Ask your coach to install it from https://nodejs.org
  echo.
  pause
  exit /b
)

where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Git is not installed on this computer.
  echo   Ask your coach to install it from https://git-scm.com
  echo.
  pause
  exit /b
)

node server.js
pause

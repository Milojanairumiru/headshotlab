@echo off
title HeadshotLab Local Server
echo ========================================================
echo   Starting HeadshotLab Local Website...
echo   Website:        http://localhost:8080
echo   Client Portal:  http://localhost:8080/portal
echo   Admin Console:  http://localhost:8080/admin
echo   Database:       .\data\headshotlab.db
echo   Press Ctrl+C to stop the server
echo ========================================================
if "%ADMIN_PASSCODE%"=="" set /p ADMIN_PASSCODE=Enter admin passcode for this session: 
start http://localhost:8080
node serve.js
pause

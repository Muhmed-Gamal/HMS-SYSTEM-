@echo off
chcp 65001 >nul
title HMS Industrial System - Database Connection Diagnostic
color 0B

echo ===================================================================
echo   HMS Industrial System - Database Connection Diagnostic
echo ===================================================================
echo.

cd /d "%~dp0"

node "%~dp0test_db_connection.js"

echo.
pause

@echo off
chcp 65001 >nul
title HMS Industrial System - Database Connection Diagnostic
color 0B

echo ===================================================================
echo   HMS Industrial System - الفحص والتشخيص الآلي لقاعدة البيانات
echo ===================================================================
echo.

node "%~dp0test_db_connection.js"

pause

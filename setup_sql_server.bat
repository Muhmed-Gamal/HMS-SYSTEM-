@echo off
chcp 65001 >nul
title HMS Industrial System - Client Database Setup
color 0B

echo ===================================================================
echo   HMS Industrial Barcode System - تهيئة قاعدة بيانات جهاز العميل
echo ===================================================================
echo.

:: ─── فحص صلاحيات Administrator ──────────────────────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [تنبيه] يتطلب هذا الملف صلاحيات مسؤول (Run as Administrator).
    echo جاري طلب الصلاحيات تلقائياً...
    powershell -Command "Start-Process '%~0' -Verb RunAs"
    exit /b
)

:: ─── فتح منافذ جدار الحماية ──────────────────────────────────────────────
echo [1/3] فتح المنافذ المطلوبة في جدار الحماية (Firewall)...
netsh advfirewall firewall delete rule name="HMS Barcode Web Port 3000" >nul 2>&1
netsh advfirewall firewall add rule name="HMS Barcode Web Port 3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
netsh advfirewall firewall delete rule name="HMS SQL Server Port 1433" >nul 2>&1
netsh advfirewall firewall add rule name="HMS SQL Server Port 1433" dir=in action=allow protocol=TCP localport=1433 >nul 2>&1
echo       OK تم فتح المنافذ 3000 و 1433 بنجاح.
echo.

:: ─── حذف علامة الإعداد السابق (لإجبار إعادة الإعداد) ────────────────────
echo [2/3] إعادة تعيين إعدادات قاعدة البيانات للجهاز الجديد...
node -e "const fs=require('fs'),p='.env'; if(fs.existsSync(p)){let c=fs.readFileSync(p,'utf8'); c=c.replace(/^SETUP_DONE=.*$/m,'SETUP_DONE=false'); fs.writeFileSync(p,c);}" >nul 2>&1
echo       OK تم إعادة التعيين.
echo.

:: ─── تشغيل إعداد قاعدة البيانات الذكي ──────────────────────────────────
echo [3/3] جاري تشغيل برنامج الإعداد الآلي لقاعدة البيانات...
echo.
node "%~dp0first_run_setup.js"

if %errorlevel% equ 0 (
    echo.
    echo ===================================================================
    echo.
    echo  يمكنك الآن تشغيل النظام مباشرة بالضغط على [start_system.bat]
    echo.
    echo ===================================================================
) else (
    echo.
    echo ===================================================================
    echo  تعذر الإعداد التلقائي. يرجى اتباع الخطوات التالية:
    echo  1. افتح SSMS على هذا الجهاز.
    echo  2. افتح الملف: CREATE_USER_AND_DB.sql
    echo  3. اضغط F5 لتنفيذه.
    echo  4. ثم شغّل start_system.bat مباشرة.
    echo ===================================================================
)

echo.
pause

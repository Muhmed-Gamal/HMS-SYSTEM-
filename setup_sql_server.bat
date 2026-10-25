@echo off
chcp 65001 >nul
title HMS Industrial System - Client Database Setup
color 0B

echo ===================================================================
echo   HMS Industrial Barcode System - تهيئة قاعدة بيانات جهاز العميل
echo ===================================================================
echo.

:: فحص صلاحيات Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [تنبيه] يتطلب فتح هذا السكربت صلاحيات مسؤول (Run as Administrator).
    echo جاري طلب الصلاحيات تلقائياً...
    powershell -Command "Start-Process '%~0' -Verb RunAs"
    exit /b
)

echo [1/3] فحص منافذ جدار حماية الويندوز (Windows Firewall)...
netsh advfirewall firewall delete rule name="HMS Barcode Web Port 3000" >nul 2>&1
netsh advfirewall firewall add rule name="HMS Barcode Web Port 3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1

netsh advfirewall firewall delete rule name="HMS SQL Server Port 1433" >nul 2>&1
netsh advfirewall firewall add rule name="HMS SQL Server Port 1433" dir=in action=allow protocol=TCP localport=1433 >nul 2>&1
echo       ✅ تم فتح المنافذ 3000 و 1433 لربط أجهزة وشاشات المصنع بالشبكة.
echo.

echo [2/3] جاري محاولة إنشاء المستخدم وقاعدة البيانات تلقائياً عبر Windows Auth...
sqlcmd -S . -E -i "%~dp0CREATE_USER_AND_DB.sql" >nul 2>&1
if %errorlevel% equ 0 goto VERIFY_SUCCESS

sqlcmd -S 127.0.0.1 -E -i "%~dp0CREATE_USER_AND_DB.sql" >nul 2>&1
if %errorlevel% equ 0 goto VERIFY_SUCCESS

sqlcmd -S .\SQLEXPRESS -E -i "%~dp0CREATE_USER_AND_DB.sql" >nul 2>&1
if %errorlevel% equ 0 goto VERIFY_SUCCESS

echo.
echo ⚠️  تعذر الاتصال عبر Windows Auth المباشر.
echo    إذا كان لديك مستخدم sa في SQL Server على جهاز العميل:
set /p SAPASS="👉 اكتب كلمة مرور sa (أو اضغط Enter لتخطي): "
if not "%SAPASS%"=="" (
    sqlcmd -S . -U sa -P "%SAPASS%" -i "%~dp0CREATE_USER_AND_DB.sql" >nul 2>&1
    if %errorlevel% equ 0 goto VERIFY_SUCCESS
    sqlcmd -S .\SQLEXPRESS -U sa -P "%SAPASS%" -i "%~dp0CREATE_USER_AND_DB.sql" >nul 2>&1
    if %errorlevel% equ 0 goto VERIFY_SUCCESS
)

echo.
echo ===================================================================
echo 💡 البديل السهل جداً:
echo    1. افتح برنامج SQL Server Management Studio (SSMS) على جهاز العميل.
echo    2. افتح الملف: [%~dp0CREATE_USER_AND_DB.sql]
echo    3. اضغط زر [Execute] أو مفتاح F5 من الكيبورد.
echo ===================================================================
echo.
pause
exit /b

:VERIFY_SUCCESS
echo.
echo [3/3] فحص الاتصال النهائي بحساب المستخدم الجديد...
sqlcmd -S 127.0.0.1 -U freedom_user -P Gs654321 -d freedomBarcodeDB -Q "SELECT 1" >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo ===================================================================
    echo 🎉 تم تهيئة قاعدة البيانات وإنشاء المستخدم freedom_user بنجاح 100%!
    echo 🚀 يمكنك الآن تشغيل النظام مباشرة بالضغط على [start_system.bat].
    echo ===================================================================
) else (
    echo.
    echo ✅ تم تنفيذ السكربت. يرجى إعادة تشغيل خدمة SQL Server ثم تجربة [start_system.bat].
)
echo.
pause

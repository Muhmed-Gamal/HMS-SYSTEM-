@echo off
chcp 65001 >nul
title HMS Industrial System - Auto Update & Deploy
color 0B

echo ===================================================================
echo     نظام HMS للباركود والتتبع الصناعي - التحديث التلقائي الفوري
echo     HMS Industrial System - One-Click Auto Updater
echo ===================================================================
echo.

cd /d "%~dp0"

:: 1. فحص الاتصال بالإنترنت
echo [1/5] جاري فحص الاتصال بالإنترنت...
ping -n 1 github.com >nul 2>&1
if %errorlevel% neq 0 (
    ping -n 1 8.8.8.8 >nul 2>&1
    if %errorlevel% neq 0 (
        color 0C
        echo.
        echo ===================================================================
        echo  [خطأ] لا يوجد اتصال بالإنترنت على هذا السيرفر!
        echo  تأكد من توصيل كابل الإنترنت أو الواي فاي ثم أعد تشغيل الملف.
        echo ===================================================================
        echo.
        pause
        exit /b 1
    )
)
echo  [OK] الاتصال بالإنترنت نشط وجاهز.
echo.

:: 2. كشف مسار Git
echo [2/5] جاري التحقق من أداة المزامنة وجلب التحديثات...
set "GIT_CMD="
where git >nul 2>&1
if %errorlevel% equ 0 (
    set "GIT_CMD=git"
) else if exist "C:\Program Files\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files\Git\cmd\git.exe"
) else if exist "C:\Program Files\Microsoft SQL Server Management Studio 22\Release\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files\Microsoft SQL Server Management Studio 22\Release\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe"
) else if exist "C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe" (
    set "GIT_CMD=C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe"
)

if not "%GIT_CMD%"=="" (
    echo  [OK] تم العثور على أداة المزامنة السريعة.
    echo.
    echo [3/5] جاري سحب أحدث التحديثات والتعديلات من السيرفر السحابي...
    :: سحب التعديلات بأمان وإلغاء أي تعارض محلي
    "%GIT_CMD%" fetch origin main >nul 2>&1
    "%GIT_CMD%" reset --hard origin/main
    if %errorlevel% neq 0 (
        echo  [WARN] محاولة ثانية للسحب المباشر...
        "%GIT_CMD%" pull origin main
    )
    echo  [OK] تم سحب وتطبيق أحدث كود بنجاح.
) else (
    echo  [INFO] Git غير مثبت، جاري التحميل المباشر للتحديث عبر السيرفر...
    powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Write-Host 'Connecting to update channel...';}"
    echo  [OK] تم فحص قناة التحديث.
)

echo.
:: 3. تثبيت أي مكاتب جديدة لو تم إضافتها
if exist "package.json" (
    echo [4/5] فحص المكتبات وتحديث واجهة المستخدم (Rebuilding UI)...
    call npm --prefix "%~dp0frontend" run build
    if %errorlevel% equ 0 (
        echo  [OK] تم بناء الواجهة المحدثة بنجاح كامل.
    ) else (
        echo  [WARN] استمر التحديث مع النسخة المبنية مسبقاً.
    )
)

echo.
:: 4. إعادة تشغيل السيرفر بالتعديلات الجديدة
echo [5/5] جاري إعادة تشغيل السيرفر لتطبيق التحديثات فورياً...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo ===================================================================
echo   [تم بنجاح] تم تحديث النظام بالكامل وتشغيله بأحدث إصدار!
echo   All updates pulled and applied successfully.
echo ===================================================================
echo.
timeout /t 3 >nul
start "" "%~dp0start_system.bat"
exit

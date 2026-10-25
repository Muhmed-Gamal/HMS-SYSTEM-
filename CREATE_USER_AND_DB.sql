-- ===================================================================
-- HMS Industrial Barcode Tracking System
-- سكربت إنشاء مستخدم النظام وقاعدة البيانات — النسخة اليدوية
-- ===================================================================
-- الاستخدام:
--   1. افتح هذا الملف داخل SQL Server Management Studio (SSMS)
--   2. تأكد من الاتصال بـ Windows Auth أو حساب sa
--   3. بدّل اسم قاعدة البيانات أسفله إن أردت، ثم اضغط F5
-- ===================================================================
-- [اختياري] بدّل الاسم هنا ليناسب اسم مصنعك:
DECLARE @dbName NVARCHAR(128) = N'HMS_Factory_DB';
DECLARE @hmsUser NVARCHAR(64) = N'hms_user';
DECLARE @hmsPass NVARCHAR(64) = N'HMS@2024!Secure';
GO

USE [master];
GO

-- 1. تفعيل نمط المصادقة المشترك (Mixed Mode Authentication)
EXEC xp_instance_regwrite
    N'HKEY_LOCAL_MACHINE',
    N'Software\Microsoft\MSSQLServer\MSSQLServer',
    N'LoginMode', REG_DWORD, 2;
GO

-- 2. إنشاء مستخدم hms_user أو تحديثه إذا كان موجوداً
IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = 'hms_user')
BEGIN
    CREATE LOGIN [hms_user]
    WITH PASSWORD = 'HMS@2024!Secure',
    CHECK_POLICY = OFF,
    CHECK_EXPIRATION = OFF;
    PRINT N'✅ تم إنشاء مستخدم النظام hms_user بنجاح.';
END
ELSE
BEGIN
    ALTER LOGIN [hms_user]
    WITH PASSWORD = 'HMS@2024!Secure',
    CHECK_POLICY = OFF,
    CHECK_EXPIRATION = OFF;
    ALTER LOGIN [hms_user] ENABLE;
    PRINT N'✅ تم تحديث وتفعيل مستخدم النظام hms_user.';
END
GO

-- 3. منح صلاحيات النظام الكاملة
IF IS_SRVROLEMEMBER('sysadmin', 'hms_user') = 0
    ALTER SERVER ROLE [sysadmin] ADD MEMBER [hms_user];
ALTER SERVER ROLE [dbcreator] ADD MEMBER [hms_user];
PRINT N'✅ تم منح الصلاحيات الكاملة لـ hms_user.';
GO

-- 4. إنشاء قاعدة بيانات المصنع
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'HMS_Factory_DB')
BEGIN
    CREATE DATABASE [HMS_Factory_DB];
    PRINT N'✅ تم إنشاء قاعدة البيانات HMS_Factory_DB بنجاح.';
END
ELSE
BEGIN
    PRINT N'ℹ️ قاعدة البيانات HMS_Factory_DB موجودة بالفعل.';
END
GO

-- 5. ضبط إعدادات الأداء
ALTER DATABASE [HMS_Factory_DB] SET RECOVERY SIMPLE;
ALTER DATABASE [HMS_Factory_DB] SET AUTO_UPDATE_STATISTICS_ASYNC ON;
GO

-- 6. تحديث ملف .env يدوياً بعد تنفيذ هذا السكربت:
--    DB_USER=hms_user
--    DB_PASSWORD=HMS@2024!Secure
--    DB_NAME=HMS_Factory_DB
--    SETUP_DONE=true

PRINT N'===================================================================';
PRINT N'🎉 تم الإعداد اليدوي بنجاح! حدّث ملف .env ثم شغّل start_system.bat';
PRINT N'===================================================================';
GO

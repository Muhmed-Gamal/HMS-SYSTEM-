-- ===================================================================
-- HMS Industrial Barcode Tracking System
-- سكربت إعداد مستخدم النظام وقاعدة البيانات للمصنع (Enterprise DB Setup)
-- ===================================================================
-- الغرض:
--   1. إنشاء وضبط مستخدم النظام المعتمد (hms_user)
--   2. تفعيل نمط المصادقة المختلط (SQL Server and Windows Authentication)
--   3. إنشاء قاعدة بيانات المصنع وضبط خصائص الأداء العالي (RCSI + Simple Recovery + Async Stats)
--   4. منح الصلاحيات الكاملة لمستخدم hms_user على مستوى السيرفر وقاعدة البيانات
--
-- طريقة الاستخدام:
--   1. افتح هذا الملف داخل SQL Server Management Studio (SSMS)
--   2. تأكد من الاتصال بـ Windows Authentication أو حساب sa
--   3. حدد اسم قاعدة البيانات المرغوب أدناه (الافتراضي: freedomBarcodeDB أو اسم مصنعك)
--   4. اضغط Execute (أو مفتاح F5)
-- ===================================================================

USE [master];
GO

-- 1. تفعيل نمط المصادقة المختلط (Mixed Mode: Windows & SQL Server Authentication)
BEGIN TRY
    EXEC xp_instance_regwrite
        N'HKEY_LOCAL_MACHINE',
        N'Software\Microsoft\MSSQLServer\MSSQLServer',
        N'LoginMode', REG_DWORD, 2;
    PRINT N'✅ تم تفعيل نمط المصادقة المشترك (Mixed Mode Authentication).';
END TRY
BEGIN CATCH
    PRINT N'⚠️ تنبيه: تعذر كتابة مفتاح الريجستري (قد يتطلب تشغيل SSMS كمسؤول). تابع التنفيذ.';
END CATCH
GO

-- 2. إنشاء مستخدم hms_user أو تحديثه وتفعيله
IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = N'hms_user')
BEGIN
    CREATE LOGIN [hms_user]
    WITH PASSWORD = N'HMS@2024!Secure',
    CHECK_POLICY = OFF,
    CHECK_EXPIRATION = OFF,
    DEFAULT_DATABASE = [master];
    PRINT N'✅ تم إنشاء مستخدم النظام hms_user بنجاح.';
END
ELSE
BEGIN
    ALTER LOGIN [hms_user]
    WITH PASSWORD = N'HMS@2024!Secure',
    CHECK_POLICY = OFF,
    CHECK_EXPIRATION = OFF;
    ALTER LOGIN [hms_user] ENABLE;
    PRINT N'✅ تم تحديث وتفعيل مستخدم النظام hms_user.';
END
GO

-- 3. منح صلاحيات السيرفر الكاملة لـ hms_user
IF IS_SRVROLEMEMBER(N'sysadmin', N'hms_user') = 0
    ALTER SERVER ROLE [sysadmin] ADD MEMBER [hms_user];

IF IS_SRVROLEMEMBER(N'dbcreator', N'hms_user') = 0
    ALTER SERVER ROLE [dbcreator] ADD MEMBER [hms_user];

PRINT N'✅ تم منح صلاحيات الإدارة العليا (sysadmin + dbcreator) للمستخدم hms_user.';
GO

-- 4. إعداد وإنشاء قاعدة البيانات وضبط خصائص الأداء المتقدمة ديناميكياً
DECLARE @TargetDB NVARCHAR(128) = N'freedomBarcodeDB'; -- يمكنك تغيير اسم قاعدة البيانات هنا إن أردت
DECLARE @Sql NVARCHAR(MAX);

-- إنشاء قاعدة البيانات إذا لم تكن موجودة
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = @TargetDB)
BEGIN
    SET @Sql = N'CREATE DATABASE [' + @TargetDB + N'];';
    EXEC sp_executesql @Sql;
    PRINT N'✅ تم إنشاء قاعدة البيانات [' + @TargetDB + N'] بنجاح.';
END
ELSE
BEGIN
    PRINT N'ℹ️ قاعدة البيانات [' + @TargetDB + N'] موجودة بالفعل.';
END

-- ضبط نمط الاسترجاع السريع لتقليل استهلاك مساحة القرص (Recovery: SIMPLE)
SET @Sql = N'ALTER DATABASE [' + @TargetDB + N'] SET RECOVERY SIMPLE WITH NO_WAIT;';
EXEC sp_executesql @Sql;

-- تفعيل تحديث الإحصائيات غير المتزامن لسرعة الاستعلامات اللحظية (Async Statistics)
SET @Sql = N'ALTER DATABASE [' + @TargetDB + N'] SET AUTO_UPDATE_STATISTICS_ASYNC ON WITH NO_WAIT;';
EXEC sp_executesql @Sql;

-- تفعيل القراءة اللحظية غير الحاجبة (Read Committed Snapshot Isolation - RCSI)
-- لمنع أي تضارب أو قفل للجداول أثناء ضغط المسح الليزري السريع
IF EXISTS (SELECT * FROM sys.databases WHERE name = @TargetDB AND is_read_committed_snapshot_on = 0)
BEGIN
    SET @Sql = N'ALTER DATABASE [' + @TargetDB + N'] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;';
    EXEC sp_executesql @Sql;
    PRINT N'✅ تم تفعيل خاصية Snapshot Isolation (RCSI) لأقصى سرعة مسح بدون انتظار.';
END
ELSE
BEGIN
    PRINT N'✅ خاصية Snapshot Isolation (RCSI) مفعلة بالفعل.';
END

-- تفعيل مستخدم hms_user داخل قاعدة البيانات ومنحه صلاحية db_owner
SET @Sql = N'
USE [' + @TargetDB + N'];
IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = N''hms_user'')
BEGIN
    CREATE USER [hms_user] FOR LOGIN [hms_user];
    ALTER ROLE [db_owner] ADD MEMBER [hms_user];
END
ELSE
BEGIN
    ALTER ROLE [db_owner] ADD MEMBER [hms_user];
END;';
EXEC sp_executesql @Sql;

PRINT N'✅ تم ربط المستخدم hms_user بقاعدة البيانات [' + @TargetDB + N'] كمالك لقاعدة البيانات (db_owner).';
GO

PRINT N'===================================================================';
PRINT N'🎉 تم إعداد قاعدة البيانات والمستخدم بنجاح تام!';
PRINT N'📌 بيانات الاتصال المعتمدة لملف .env:';
PRINT N'   DB_SERVER=127.0.0.1';
PRINT N'   DB_PORT=1433';
PRINT N'   DB_USER=hms_user';
PRINT N'   DB_PASSWORD=HMS@2024!Secure';
PRINT N'   DB_NAME=freedomBarcodeDB (أو اسم قاعدة البيانات الذي اخترته)';
PRINT N'   SETUP_DONE=true';
PRINT N'🚀 يمكنك الآن تشغيل النظام مباشرة عبر: start_system.bat';
PRINT N'===================================================================';
GO

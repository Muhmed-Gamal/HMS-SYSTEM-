-- ===================================================================
-- HMS Industrial Barcode Tracking System
-- سكربت تهيئة قاعدة البيانات والمستخدم لجهاز العميل الجديد
-- ===================================================================
-- التعليمات:
-- 1. افتح هذا الملف داخل SQL Server Management Studio (SSMS) على جهاز العميل
-- 2. تأكد من أنك متصل كـ Windows Authentication أو حساب sa
-- 3. اضغط على زر [Execute] أو اضغط F5 من لوحة المفاتيح
-- ===================================================================

USE [master];
GO

-- 1. تفعيل نمط المصادقة المشترك (Mixed Mode Authentication)
EXEC xp_instance_regwrite N'HKEY_LOCAL_MACHINE', N'Software\Microsoft\MSSQLServer\MSSQLServer', N'LoginMode', REG_DWORD, 2;
GO

-- 2. إنشاء مستخدم freedom_user إذا لم يكن موجوداً، أو تحديث كلمة المرور وتفعيله
IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = 'freedom_user')
BEGIN
    CREATE LOGIN [freedom_user] 
    WITH PASSWORD = 'Gs654321', 
    CHECK_POLICY = OFF, 
    CHECK_EXPIRATION = OFF;
    PRINT N'✅ تم إنشاء المستخدم freedom_user بنجاح.';
END
ELSE
BEGIN
    ALTER LOGIN [freedom_user] 
    WITH PASSWORD = 'Gs654321', 
    CHECK_POLICY = OFF, 
    CHECK_EXPIRATION = OFF;
    ALTER LOGIN [freedom_user] ENABLE;
    PRINT N'✅ تم تحديث وتفعيل المستخدم freedom_user بنجاح.';
END
GO

-- 3. منح المستخدم صلاحيات إدارة قواعد البيانات (sysadmin & dbcreator)
ALTER SERVER ROLE [sysadmin] ADD MEMBER [freedom_user];
ALTER SERVER ROLE [dbcreator] ADD MEMBER [freedom_user];
PRINT N'✅ تم منح المستخدم freedom_user صلاحيات المدير بنجاح.';
GO

-- 4. إنشاء قاعدة بيانات freedomBarcodeDB إذا لم تكن موجودة
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'freedomBarcodeDB')
BEGIN
    CREATE DATABASE [freedomBarcodeDB];
    PRINT N'✅ تم إنشاء قاعدة البيانات freedomBarcodeDB بنجاح.';
END
ELSE
BEGIN
    PRINT N'ℹ️ قاعدة البيانات freedomBarcodeDB موجودة بالفعل.';
END
GO

-- 5. ضبط قاعدة البيانات لتكون مملوكة للمستخدم وتفعيل الأداء العالي
ALTER DATABASE [freedomBarcodeDB] SET OWNER TO [freedom_user];
ALTER DATABASE [freedomBarcodeDB] SET RECOVERY SIMPLE;
ALTER DATABASE [freedomBarcodeDB] SET AUTO_UPDATE_STATISTICS_ASYNC ON;
GO

PRINT N'===================================================================';
PRINT N'🎉 تم إعداد قاعدة بيانات العميل بنجاح 100%! يمكنك الآن تشغيل السيرفر.';
PRINT N'===================================================================';
GO

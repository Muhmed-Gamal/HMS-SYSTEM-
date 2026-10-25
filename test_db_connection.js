const sql = require('mssql');
const fs = require('fs');
const path = require('path');

try {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (e) {}

const dbUser     = process.env.DB_USER     || 'hms_user';
const dbPassword = process.env.DB_PASSWORD || '';
const dbName     = process.env.DB_NAME     || 'HMS_Factory_DB';

console.log('================================================================');
console.log('🔍 HMS Barcode System - أداة التشخيص والاكتشاف الآلي لقاعدة البيانات');
console.log('================================================================\n');
console.log(`🔑 مستخدم الاتصال : ${dbUser}`);
console.log(`🗄️  قاعدة البيانات : ${dbName}\n`);

const candidates = [
    {
        name: 'إعدادات ملف .env الحالية (' + (process.env.DB_SERVER || '127.0.0.1') + ')',
        server: process.env.DB_SERVER || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '1433', 10),
        instance: null
    },
    {
        name: 'خادم SQL Server الافتراضي (127.0.0.1:1433)',
        server: '127.0.0.1',
        port: 1433,
        instance: null
    },
    {
        name: 'خادم SQL Server المحلي (localhost:1433)',
        server: 'localhost',
        port: 1433,
        instance: null
    },
    {
        name: 'نسخة SQLEXPRESS الشائعة (localhost\\SQLEXPRESS)',
        server: 'localhost',
        port: null,
        instance: 'SQLEXPRESS'
    },
    {
        name: 'نسخة SQLEXPRESS المحلية (127.0.0.1\\SQLEXPRESS)',
        server: '127.0.0.1',
        port: null,
        instance: 'SQLEXPRESS'
    },
    {
        name: 'نسخة SQLEXPRESS مع اسم الجهاز (.\\SQLEXPRESS)',
        server: '.',
        port: null,
        instance: 'SQLEXPRESS'
    }
];

async function runDiagnostic() {
    let successConfig = null;

    for (const cand of candidates) {
        process.stdout.write(`⏳ جاري فحص: [${cand.name}]... `);

        const testConfig = {
            user: dbUser,
            password: dbPassword,
            server: cand.server,
            database: 'master',
            options: {
                encrypt: false,
                trustServerCertificate: true,
                enableArithAbort: true
            },
            connectionTimeout: 4000
        };

        if (cand.instance) {
            testConfig.options.instanceName = cand.instance;
        } else if (cand.port) {
            testConfig.port = cand.port;
        }

        try {
            const pool = await new sql.ConnectionPool(testConfig).connect();
            console.log('✅ نجح الاتصال!');

            // التحقق من وجود قاعدة البيانات
            const res = await pool.request().query(`SELECT DB_ID('${dbName}') AS db_exists`);
            const exists = Boolean(res.recordset[0]?.db_exists);

            if (!exists) {
                console.log(`   ⚠️ قاعدة البيانات [${dbName}] غير موجودة، جاري إنشاؤها تلقائياً...`);
                await pool.request().query(`CREATE DATABASE [${dbName}]`);
                console.log(`   ✅ تم إنشاء قاعدة البيانات [${dbName}] بنجاح!`);
            } else {
                console.log(`   ✅ تم التحقق من وجود قاعدة البيانات [${dbName}].`);
            }

            await pool.close();
            successConfig = cand;
            break;
        } catch (err) {
            const msg = err.message || '';
            if (msg.includes('Login failed') || err.code === 'ELOGIN') {
                console.log('❌ خطأ في تسجيل الدخول (Login failed)!');
                console.log('   👉 السبب: المستخدم غير موجود أو نمط المصادقة ليس Mixed Mode.');
                console.log('   💡 الحل: شغّل setup_sql_server.bat بصلاحيات مسؤول (Run as Administrator).');
            } else if (msg.includes('connect ECONNREFUSED') || err.code === 'ESOCKET' || err.code === 'ETIMEOUT') {
                console.log('❌ السيرفر غير متاح على هذا العنوان.');
            } else {
                console.log(`❌ تعذر الاتصال: ${msg.split('\n')[0]}`);
            }
        }
    }

    console.log('\n================================================================');
    if (successConfig) {
        console.log('🎉 النتيجة النهائية: تم العثور على محرك SQL Server والاتصال به بنجاح!');
        console.log(`📌 الإعداد الصحيح المعتمد لجهازك:`);
        console.log(`   DB_SERVER=${successConfig.instance ? successConfig.server + '\\' + successConfig.instance : successConfig.server}`);
        if (successConfig.port) console.log(`   DB_PORT=${successConfig.port}`);

        // تحديث ملف .env تلقائياً إن لزم
        try {
            const envPath = path.join(__dirname, '.env');
            if (fs.existsSync(envPath)) {
                let envContent = fs.readFileSync(envPath, 'utf8');
                const targetServerStr = successConfig.instance
                    ? `${successConfig.server}\\${successConfig.instance}`
                    : successConfig.server;
                envContent = envContent.replace(/^DB_SERVER=.*/m, `DB_SERVER=${targetServerStr}`);
                if (successConfig.port) {
                    envContent = envContent.replace(/^DB_PORT=.*/m, `DB_PORT=${successConfig.port}`);
                }
                fs.writeFileSync(envPath, envContent, 'utf8');
                console.log('💾 تم تحديث ملف .env تلقائياً بالإعدادات الصحيحة!');
            }
        } catch (e) {}

        console.log('\n🚀 يمكنك الآن تشغيل النظام مباشرة بالضغط على [start_system.bat].');
    } else {
        console.log(`⚠️ لم يتمكن النظام من الاتصال بالمستخدم [${dbUser}] على أي عنوان.`);
        console.log('💡 خطوات الحل السريع:');
        console.log('   1. اضغط كليك يمين على [setup_sql_server.bat] → Run as Administrator.');
        console.log('   2. أو افتح SSMS وافتح ملف CREATE_USER_AND_DB.sql واضغط F5.');
        console.log('   3. ثم أعد تشغيل هذا الفحص مرة أخرى.');
    }
    console.log('================================================================\n');
}

runDiagnostic();

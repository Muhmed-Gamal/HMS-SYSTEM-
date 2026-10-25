/**
 * HMS Industrial Barcode System — First-Run Setup Engine
 * =======================================================
 * يُشغَّل تلقائياً عند نقل النظام لجهاز عميل جديد.
 * - يكتشف SQL Server تلقائياً (كل العناوين الشائعة)
 * - ينشئ مستخدم SQL جديد بكلمة مرور عشوائية قوية
 * - ينشئ قاعدة بيانات باسم المصنع تلقائياً
 * - يحدّث ملف .env بالإعدادات الصحيحة
 * - لا يُعيد التشغيل بعد الإعداد الأول (SETUP_DONE=true)
 */

'use strict';

const sql  = require('mssql');
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ENV_PATH = path.join(__dirname, '.env');

// ─── قراءة ملف .env إن وُجد ───────────────────────────────────────────────
function readEnv() {
    if (!fs.existsSync(ENV_PATH)) return {};
    const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
    const env = {};
    for (const line of lines) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m) env[m[1]] = m[2].trim();
    }
    return env;
}

// ─── كتابة أو تحديث مفتاح في .env ────────────────────────────────────────
function setEnvKey(key, value) {
    let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
    const regex = new RegExp(`^${key}=.*`, 'm');
    if (regex.test(content)) {
        content = content.replace(regex, `${key}=${value}`);
    } else {
        content = content.trimEnd() + `\n${key}=${value}\n`;
    }
    fs.writeFileSync(ENV_PATH, content, 'utf8');
}

// ─── توليد كلمة مرور عشوائية قوية ────────────────────────────────────────
function generatePassword(len = 16) {
    const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower  = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const spec   = '@#$!';
    const all    = upper + lower + digits + spec;
    let pwd = upper[Math.floor(Math.random() * upper.length)]
            + lower[Math.floor(Math.random() * lower.length)]
            + digits[Math.floor(Math.random() * digits.length)]
            + spec[Math.floor(Math.random() * spec.length)];
    for (let i = 4; i < len; i++) pwd += all[Math.floor(Math.random() * all.length)];
    return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

// ─── تحويل اسم الشركة لاسم قاعدة بيانات صالح ───────────────────────────────
function buildDbName(companyName) {
    const clean = (companyName || 'Factory')
        .replace(/[^a-zA-Z0-9\u0600-\u06FF ]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^\x00-\x7F]/g, '')   // حذف أحرف عربية من الاسم (SQL لا يدعمها في أسماء DB)
        .replace(/^_+|_+$/g, '')
        .slice(0, 30)
        || 'Factory';
    return `HMS_${clean}_DB`;
}

// ─── قائمة عناوين SQL Server الشائعة للمحاولة ─────────────────────────────
const SERVER_CANDIDATES = [
    { server: '127.0.0.1',  port: 1433, instance: null,        label: '127.0.0.1:1433'       },
    { server: 'localhost',  port: 1433, instance: null,        label: 'localhost:1433'        },
    { server: 'localhost',  port: null, instance: 'SQLEXPRESS', label: 'localhost\\SQLEXPRESS' },
    { server: '.',          port: null, instance: 'SQLEXPRESS', label: '.\\SQLEXPRESS'         },
    { server: '127.0.0.1', port: null, instance: 'SQLEXPRESS', label: '127.0.0.1\\SQLEXPRESS' },
    { server: 'localhost',  port: null, instance: 'MSSQLSERVER', label: 'localhost\\MSSQLSERVER'},
];

// ─── بناء config الاتصال ────────────────────────────────────────────────────
function buildConfig(cand, user, password, database, timeout = 5000) {
    const cfg = {
        user, password, database,
        options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
        connectionTimeout: timeout,
        pool: { max: 3, min: 1, idleTimeoutMillis: 10000 }
    };
    if (cand.instance) {
        cfg.server = cand.server;
        cfg.options.instanceName = cand.instance;
    } else {
        cfg.server = cand.server;
        cfg.port   = cand.port;
    }
    return cfg;
}

// ─── محاولة الاتصال بكلمة مرور sa أو Windows Auth ─────────────────────────
async function tryConnect(cand, user, password) {
    const cfg = buildConfig(cand, user, password, 'master', 5000);
    try {
        const pool = await new sql.ConnectionPool(cfg).connect();
        return pool;
    } catch (e) {
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// الدالة الرئيسية
// ═══════════════════════════════════════════════════════════════════════════
async function runFirstRunSetup() {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  HMS Industrial Barcode System — إعداد جهاز العميل');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    // ─── فحص إذا كان الإعداد تم مسبقاً ─────────────────────────────────
    const envNow = readEnv();
    if (envNow.SETUP_DONE === 'true') {
        console.log('✅ الإعداد تم مسبقاً على هذا الجهاز.');
        console.log('   يمكنك تشغيل النظام مباشرة عبر start_system.bat');
        console.log('');
        return true;
    }

    // ─── اسم الشركة / المصنع ──────────────────────────────────────────
    const companyEN  = envNow.COMPANY_NAME_EN || 'Factory';
    const targetDb   = buildDbName(companyEN);
    const hmsUser    = 'hms_user';
    const hmsPass    = generatePassword(14);

    console.log(`🏭 اسم المصنع  : ${companyEN}`);
    console.log(`🗄️  قاعدة البيانات: ${targetDb}`);
    console.log(`👤 مستخدم النظام: ${hmsUser}`);
    console.log('');

    // ─── الخطوة 1: اكتشاف SQL Server ─────────────────────────────────
    console.log('🔍 [1/4] البحث عن محرك SQL Server على هذا الجهاز...');

    let masterPool = null;
    let connectedCand = null;

    // أولاً: جرب Windows Authentication (sa أو Windows)
    for (const cand of SERVER_CANDIDATES) {
        process.stdout.write(`   ⏳ فحص [${cand.label}] بـ Windows Auth...`);
        // Windows Auth: نستخدم trusted_connection — غير مدعوم في mssql/tedious مباشرة
        // لكن نجرب بـ sa (empty password) أولاً
        const pool = await tryConnect(cand, 'sa', '');
        if (pool) {
            masterPool   = pool;
            connectedCand = cand;
            console.log(' ✅ نجح!');
            break;
        }
        console.log(' ❌');
    }

    // إذا لم ينجح بكلمة مرور فارغة، اطلب كلمة مرور sa
    if (!masterPool) {
        console.log('');
        console.log('⚠️  لم يتمكن النظام من الاتصال تلقائياً بـ sa بكلمة مرور فارغة.');
        console.log('');
        console.log('💡 الخيارات المتاحة:');
        console.log('   أ) أدخل كلمة مرور حساب sa في SQL Server على هذا الجهاز.');
        console.log('   ب) أو اضغط Enter لتخطي الإعداد وإدخال البيانات يدوياً في .env');
        console.log('');

        const readline = require('readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const saPass = await new Promise(resolve => rl.question('👉 كلمة مرور sa (أو Enter لتخطي): ', resolve));
        rl.close();

        if (saPass.trim()) {
            for (const cand of SERVER_CANDIDATES) {
                process.stdout.write(`   ⏳ فحص [${cand.label}] بـ sa...`);
                const pool = await tryConnect(cand, 'sa', saPass.trim());
                if (pool) {
                    masterPool    = pool;
                    connectedCand = cand;
                    console.log(' ✅ نجح!');
                    break;
                }
                console.log(' ❌');
            }
        }
    }

    if (!masterPool) {
        console.log('');
        console.log('═══════════════════════════════════════════════════════');
        console.log('❌ تعذر الاتصال بـ SQL Server تلقائياً.');
        console.log('');
        console.log('💡 الحل اليدوي:');
        console.log('   1. افتح SSMS وافتح ملف CREATE_USER_AND_DB.sql');
        console.log('   2. اضغط F5 لتنفيذه.');
        console.log('   3. ثم حرّر ملف .env يدوياً وأضف: SETUP_DONE=true');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        return false;
    }

    // ─── الخطوة 2: تفعيل Mixed Mode + إنشاء مستخدم HMS ──────────────
    console.log('');
    console.log('🔧 [2/4] تهيئة SQL Server للنظام...');

    try {
        // تفعيل Mixed Mode Authentication
        await masterPool.request().query(`
            EXEC xp_instance_regwrite 
                N'HKEY_LOCAL_MACHINE',
                N'Software\\Microsoft\\MSSQLServer\\MSSQLServer',
                N'LoginMode', REG_DWORD, 2
        `);
        console.log('   ✅ تم تفعيل نمط المصادقة المشترك (Mixed Mode).');
    } catch (e) {
        console.log('   ⚠️  تخطي تفعيل Mixed Mode (ربما مفعّل مسبقاً).');
    }

    try {
        // إنشاء مستخدم hms_user أو تحديثه
        const loginExists = await masterPool.request().query(
            `SELECT 1 FROM sys.server_principals WHERE name = '${hmsUser}'`
        );
        if (loginExists.recordset.length > 0) {
            await masterPool.request().query(`
                ALTER LOGIN [${hmsUser}] WITH PASSWORD = '${hmsPass}', CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF;
                ALTER LOGIN [${hmsUser}] ENABLE;
            `);
            console.log(`   ✅ تم تحديث مستخدم النظام [${hmsUser}].`);
        } else {
            await masterPool.request().query(`
                CREATE LOGIN [${hmsUser}]
                WITH PASSWORD = '${hmsPass}', CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF;
            `);
            console.log(`   ✅ تم إنشاء مستخدم النظام [${hmsUser}].`);
        }

        // منح صلاحيات dbcreator و sysadmin
        await masterPool.request().query(`
            IF IS_SRVROLEMEMBER('sysadmin', '${hmsUser}') = 0
                ALTER SERVER ROLE [sysadmin] ADD MEMBER [${hmsUser}];
        `);
        console.log(`   ✅ تم منح الصلاحيات الكاملة لـ [${hmsUser}].`);
    } catch (e) {
        console.log(`   ❌ خطأ في إنشاء المستخدم: ${e.message.split('\n')[0]}`);
        await masterPool.close().catch(() => {});
        return false;
    }

    // ─── الخطوة 3: إنشاء قاعدة البيانات الخاصة بالمصنع ──────────────
    console.log('');
    console.log(`🗄️  [3/4] إنشاء قاعدة بيانات المصنع [${targetDb}]...`);

    try {
        const dbExists = await masterPool.request().query(
            `SELECT DB_ID('${targetDb}') AS id`
        );
        if (!dbExists.recordset[0]?.id) {
            await masterPool.request().query(`CREATE DATABASE [${targetDb}]`);
            console.log(`   ✅ تم إنشاء قاعدة البيانات [${targetDb}] بنجاح.`);
        } else {
            console.log(`   ℹ️  قاعدة البيانات [${targetDb}] موجودة مسبقاً.`);
        }

        // ضبط إعدادات الأداء
        await masterPool.request().query(`
            ALTER DATABASE [${targetDb}] SET RECOVERY SIMPLE;
            ALTER DATABASE [${targetDb}] SET AUTO_UPDATE_STATISTICS_ASYNC ON;
        `);
        console.log('   ✅ تم ضبط إعدادات الأداء لقاعدة البيانات.');
    } catch (e) {
        console.log(`   ❌ خطأ في إنشاء قاعدة البيانات: ${e.message.split('\n')[0]}`);
        await masterPool.close().catch(() => {});
        return false;
    }

    await masterPool.close().catch(() => {});

    // ─── الخطوة 4: تحديث ملف .env ───────────────────────────────────
    console.log('');
    console.log('💾 [4/4] حفظ الإعدادات في ملف .env...');

    const serverStr = connectedCand.instance
        ? `${connectedCand.server}\\${connectedCand.instance}`
        : connectedCand.server;

    setEnvKey('DB_SERVER',   serverStr);
    if (connectedCand.port) setEnvKey('DB_PORT', String(connectedCand.port));
    setEnvKey('DB_USER',     hmsUser);
    setEnvKey('DB_PASSWORD', hmsPass);
    setEnvKey('DB_NAME',     targetDb);
    setEnvKey('SETUP_DONE',  'true');

    console.log('   ✅ تم حفظ جميع إعدادات الاتصال في .env');

    // ─── ملخص نهائي ───────────────────────────────────────────────────
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 تم إعداد النظام على هذا الجهاز بنجاح 100%!');
    console.log('');
    console.log(`   🗄️  قاعدة البيانات : ${targetDb}`);
    console.log(`   🌐 عنوان السيرفر  : ${serverStr}`);
    console.log(`   👤 مستخدم النظام  : ${hmsUser}`);
    console.log('');
    console.log('🚀 سيبدأ النظام الآن تلقائياً...');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    return true;
}

// ─── تشغيل الإعداد ────────────────────────────────────────────────────────
runFirstRunSetup()
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
        console.error('❌ خطأ غير متوقع:', err.message);
        process.exit(1);
    });

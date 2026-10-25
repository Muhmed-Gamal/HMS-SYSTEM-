/**
 * HMS Industrial Barcode System — Smart Auto Setup Engine
 * =======================================================
 * يُشغَّل تلقائياً وبشكل صامت عند نقل النظام لأي جهاز عميل جديد.
 * - يكتشف محرك SQL Server تلقائياً (IP، Localhost، SQLEXPRESS)
 * - ينشئ مستخدم النظام hms_user بصلاحيات المدير
 * - ينشئ قاعدة بيانات مستقلة تماماً خاصة بمصنع العميل
 * - يحدّث ملف .env بالكامل وبشكل فوري
 * - بدون أي تدخل يدوي وبدون طلب أي بيانات
 */

'use strict';

const sql  = require('mssql');
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ENV_PATH = path.join(__dirname, '.env');
const HMS_USER = 'hms_user';
const HMS_PASS = 'HMS@2024!Secure';

// ─── قراءة ملف .env ────────────────────────────────────────────────────────
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

// ─── تحديث أو كتابة إعدادات .env ──────────────────────────────────────────
function updateEnv(updates) {
    let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
    for (const [key, val] of Object.entries(updates)) {
        if (val === undefined || val === null) continue;
        const regex = new RegExp(`^${key}=.*`, 'm');
        if (regex.test(content)) {
            content = content.replace(regex, `${key}=${val}`);
        } else {
            content = content.trimEnd() + `\n${key}=${val}\n`;
        }
    }
    fs.writeFileSync(ENV_PATH, content, 'utf8');
}

// ─── بناء اسم قاعدة البيانات المناسب للمصنع ──────────────────────────────
function getCleanDbName(companyName) {
    if (!companyName || companyName === 'HMS Group') {
        return 'HMS_Factory_DB';
    }
    const clean = companyName
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 30);
    return clean ? `HMS_${clean}_DB` : 'HMS_Factory_DB';
}

// ─── اكتشاف أداة sqlcmd في الويندوز ────────────────────────────────────────
function findSqlCmd() {
    try {
        const out = execSync('where sqlcmd', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\r?\n/)[0];
        if (out && fs.existsSync(out)) return out;
    } catch (e) {}

    const knownPaths = [
        'C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\170\\Tools\\Binn\\sqlcmd.exe',
        'C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\180\\Tools\\Binn\\sqlcmd.exe',
        'C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\130\\Tools\\Binn\\sqlcmd.exe',
        'C:\\Program Files\\Microsoft SQL Server\\160\\Tools\\Binn\\sqlcmd.exe',
        'C:\\Program Files\\Microsoft SQL Server\\150\\Tools\\Binn\\sqlcmd.exe',
        'C:\\Program Files\\Microsoft SQL Server\\140\\Tools\\Binn\\sqlcmd.exe'
    ];
    for (const p of knownPaths) {
        if (fs.existsSync(p)) return p;
    }
    return 'sqlcmd';
}

const SERVER_CANDIDATES = [
    { server: '127.0.0.1',  port: 1433, instance: null,        label: '127.0.0.1:1433' },
    { server: 'localhost',  port: 1433, instance: null,        label: 'localhost:1433' },
    { server: 'localhost',  port: null, instance: 'SQLEXPRESS', label: 'localhost\\SQLEXPRESS' },
    { server: '.',          port: null, instance: 'SQLEXPRESS', label: '.\\SQLEXPRESS' },
    { server: '127.0.0.1', port: null, instance: 'SQLEXPRESS', label: '127.0.0.1\\SQLEXPRESS' }
];

const CRED_CANDIDATES = [
    { user: 'hms_user',     password: HMS_PASS },
    { user: 'freedom_user', password: 'Gs654321' },
    { user: 'sa',           password: HMS_PASS },
    { user: 'sa',           password: '123456' },
    { user: 'sa',           password: 'sa' },
    { user: 'sa',           password: '' }
];

async function autoSetup() {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  ⚡ HMS Industrial System - التهيئة الذكية التلقائية');
    console.log('═══════════════════════════════════════════════════════\n');

    const env = readEnv();
    const targetDbName = env.DB_NAME && env.DB_NAME !== 'freedomBarcodeDB'
        ? env.DB_NAME
        : getCleanDbName(env.COMPANY_NAME_EN);

    console.log(`🏭 مصنع العميل : ${env.COMPANY_NAME_EN || 'Client Factory'}`);
    console.log(`🗄️  قاعدة البيانات: ${targetDbName}`);
    console.log(`👤 مستخدم النظام: ${HMS_USER}\n`);

    // 1. محاولة إنشاء المستخدم عبر Windows Auth أولاً (sqlcmd -E)
    const sqlCmdExe = findSqlCmd();
    console.log('🔍 [1/3] فحص صلاحيات Windows Authentication...');
    const initSql = `
        IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = '${HMS_USER}')
            CREATE LOGIN [${HMS_USER}] WITH PASSWORD = '${HMS_PASS}', CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF;
        ELSE
            ALTER LOGIN [${HMS_USER}] WITH PASSWORD = '${HMS_PASS}', CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF;
        ALTER SERVER ROLE [sysadmin] ADD MEMBER [${HMS_USER}];
        IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = '${targetDbName}')
        BEGIN
            CREATE DATABASE [${targetDbName}];
            ALTER DATABASE [${targetDbName}] SET RECOVERY SIMPLE;
            ALTER DATABASE [${targetDbName}] SET AUTO_UPDATE_STATISTICS_ASYNC ON;
        END
    `.replace(/\r?\n/g, ' ');

    for (const cand of ['.', '127.0.0.1', '.\\SQLEXPRESS', 'localhost']) {
        try {
            execSync(`"${sqlCmdExe}" -S ${cand} -E -Q "${initSql}"`, { stdio: 'pipe', timeout: 4000 });
            console.log(`   ✅ تم تجهيز المستخدم وقاعدة البيانات تلقائياً عبر [${cand}]!`);
            break;
        } catch (e) {}
    }

    // 2. التحقق من الاتصال عبر Node.js mssql وتأكيد العمل 100%
    console.log('\n🔍 [2/3] فحص واختبار الاتصال الفعلي بمحرك البيانات...');
    let connectedPool = null;
    let workingServer = null;
    let workingCred   = null;

    searchLoop:
    for (const cand of SERVER_CANDIDATES) {
        for (const cred of CRED_CANDIDATES) {
            const cfg = {
                user: cred.user,
                password: cred.password,
                server: cand.server,
                database: 'master',
                options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
                connectionTimeout: 3500
            };
            if (cand.instance) cfg.options.instanceName = cand.instance;
            else if (cand.port) cfg.port = cand.port;

            try {
                const pool = await new sql.ConnectionPool(cfg).connect();
                connectedPool = pool;
                workingServer = cand;
                workingCred   = cred;
                console.log(`   ✅ نجح الاتصال بالسيرفر [${cand.label}] بحساب [${cred.user}]!`);
                break searchLoop;
            } catch (e) {}
        }
    }

    if (!connectedPool) {
        console.log('\n❌ تعذر الوصول لمحرك SQL Server تلقائياً.');
        console.log('يرجى التأكد من تشغيل خدمة SQL Server على هذا الجهاز.');
        return false;
    }

    // 3. إنشاء المستخدم وقاعدة البيانات عبر الـ Pool المتصل
    try {
        await connectedPool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = '${HMS_USER}')
                CREATE LOGIN [${HMS_USER}] WITH PASSWORD = '${HMS_PASS}', CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF;
            ELSE
                ALTER LOGIN [${HMS_USER}] WITH PASSWORD = '${HMS_PASS}';
            ALTER SERVER ROLE [sysadmin] ADD MEMBER [${HMS_USER}];

            IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = '${targetDbName}')
            BEGIN
                CREATE DATABASE [${targetDbName}];
                ALTER DATABASE [${targetDbName}] SET RECOVERY SIMPLE;
                ALTER DATABASE [${targetDbName}] SET AUTO_UPDATE_STATISTICS_ASYNC ON;
            END
        `);
        console.log(`   ✅ تم التأكد من وجود قاعدة بيانات العميل [${targetDbName}] بنجاح.`);
        await connectedPool.close();
    } catch (e) {
        console.log(`   ⚠️ ملاحظة أثناء تجهيز الجداول: ${e.message.split('\n')[0]}`);
    }

    // 4. كتابة وتحديث ملف .env تلقائياً
    console.log('\n💾 [3/3] حفظ الإعدادات في ملف .env تلقائياً...');
    const serverStr = workingServer.instance
        ? `${workingServer.server}\\${workingServer.instance}`
        : workingServer.server;

    updateEnv({
        DB_SERVER: serverStr,
        DB_PORT: workingServer.port || 1433,
        DB_USER: HMS_USER,
        DB_PASSWORD: HMS_PASS,
        DB_NAME: targetDbName,
        SETUP_DONE: 'true'
    });

    console.log('   ✅ تم كتابة جميع الإعدادات في ملف .env بنجاح 100%!');
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🎉 اكتملت التهيئة بنجاح! السيرفر جاهز للعمل فوراً.');
    console.log('═══════════════════════════════════════════════════════\n');
    return true;
}

autoSetup()
    .then(ok => process.exit(ok ? 0 : 1))
    .catch(err => {
        console.error('خطأ غير متوقع:', err.message);
        process.exit(1);
    });

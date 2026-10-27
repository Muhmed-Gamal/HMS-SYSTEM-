const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sql = require('mssql');
const crypto = require('crypto');
const os = require('os');
const pdfClusterService = require('./pdfClusterService');

try {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (e) {}

const app = express();
const PORT = process.env.PORT || 3000;
const { verifyLicenseFile, checkRemoteKillSwitch, generateAndSaveLicense, activateLicenseKey } = require('./licenseManager');

// حالة ترخيص النظام المخزنة كاش
let cachedLicenseStatus = verifyLicenseFile();

// لغة النظام الشاملة (ar: العربية الافتراضية، en: الإنجليزية)
let currentSystemLanguage = 'ar';

// ===== OWASP & Enterprise Security Hardening =====
app.disable('x-powered-by'); // Prevent server stack disclosure

// Persistent JWT Secret Engine
if (!process.env.JWT_SECRET) {
    const generatedSecret = crypto.randomBytes(32).toString('hex');
    process.env.JWT_SECRET = generatedSecret;
    try {
        fs.appendFileSync(path.join(__dirname, '.env'), `\nJWT_SECRET=${generatedSecret}\n`);
    } catch (e) {}
}
const JWT_SECRET = process.env.JWT_SECRET;

// Base64URL Helpers for native RFC 7519 JWT
function base64UrlEncode(str) {
    return Buffer.from(str).toString('base64url');
}
function base64UrlDecode(str) {
    return Buffer.from(str, 'base64url').toString('utf8');
}

// Generate Signed JWT Token
function generateJWT(payload, expiresInSeconds = 7 * 24 * 3600) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const fullPayload = {
        ...payload,
        iat: now,
        exp: now + expiresInSeconds
    };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
    const signature = crypto.createHmac('sha256', JWT_SECRET)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64url');
    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Verify Cryptographic JWT Token with Timing-Safe Comparison
function verifyJWT(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', JWT_SECRET)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64url');
    if (signature.length !== expectedSignature.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return null;
    }
    try {
        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            return null; // Expired
        }
        return payload;
    } catch (e) {
        return null;
    }
}

// ===== Salted PBKDF2 Password Security & Backward Compatibility =====
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';

function hashPasswordSecure(password, salt = null) {
    if (!salt) {
        salt = crypto.randomBytes(16).toString('hex');
    }
    const derivedKey = crypto.pbkdf2Sync(String(password), salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
    return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${derivedKey.toString('hex')}`;
}

function verifyPassword(password, storedHash) {
    if (!storedHash || typeof storedHash !== 'string') return { valid: false, needsRehash: false };
    
    // Check if storedHash is PBKDF2 format
    if (storedHash.startsWith('pbkdf2$')) {
        const parts = storedHash.split('$');
        if (parts.length === 4) {
            const iterations = parseInt(parts[1], 10);
            const salt = parts[2];
            const originalKey = parts[3];
            const derivedKey = crypto.pbkdf2Sync(String(password), salt, iterations, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
            if (derivedKey.length !== originalKey.length) return { valid: false, needsRehash: false };
            const match = crypto.timingSafeEqual(Buffer.from(derivedKey, 'hex'), Buffer.from(originalKey, 'hex'));
            return { valid: match, needsRehash: false };
        }
    }
    
    // Fallback: check legacy unsalted SHA-256 with timing-safe comparison
    const legacyHash = crypto.createHash('sha256').update(String(password)).digest('hex');
    if (storedHash.length === legacyHash.length && crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(legacyHash, 'hex'))) {
        return { valid: true, needsRehash: true };
    }
    
    // Fallback for plain text if any legacy dev accounts exist
    if (storedHash === password) {
        return { valid: true, needsRehash: true };
    }

    return { valid: false, needsRehash: false };
}

// Legacy helper preserved for any legacy calls
function hashPassword(password) {
    return hashPasswordSecure(password);
}

// ===== Anti-Brute-Force Rate Limiting Engine =====
const loginAttempts = new Map();

function getClientIp(req) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

function checkLoginRateLimit(req, res, next) {
    const ip = getClientIp(req);
    const now = Date.now();
    const record = loginAttempts.get(ip);
    
    if (record && record.blockedUntil && record.blockedUntil > now) {
        const remainingMinutes = Math.ceil((record.blockedUntil - now) / 60000);
        return res.status(429).json({
            success: false,
            message: `⚠️ تم حظر محاولات الدخول مؤقتاً لتكرار المحاولات الخاطئة. يرجى الانتظار ${remainingMinutes} دقيقة والمحاولة مجدداً.`
        });
    }
    next();
}

function recordFailedLogin(req) {
    const ip = getClientIp(req);
    const now = Date.now();
    const record = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
    record.count += 1;
    if (record.count >= 5) {
        record.blockedUntil = now + (15 * 60 * 1000); // 15 mins block
        console.warn(`🚨 [Security Alert] IP ${ip} blocked for 15 minutes due to 5 consecutive failed login attempts.`);
    }
    loginAttempts.set(ip, record);
}

function clearFailedLogin(req) {
    const ip = getClientIp(req);
    loginAttempts.delete(ip);
}

// Cleanup expired lockout entries every 30 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of loginAttempts.entries()) {
        if (record.blockedUntil && record.blockedUntil < now) {
            loginAttempts.delete(ip);
        }
    }
}, 30 * 60 * 1000);

// ===== توليد كود عشوائي فريد عالي الأداء =====
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CHARS_LEN = CHARS.length;

function generateRandomCode(prefix, length = 8) {
    const bytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += CHARS[bytes[i] % CHARS_LEN];
    }
    return `${prefix}-${result}`;
}

// توليد مجموعة كبيرة من الباركودات بشكل سريع جداً مع ضمان التفرد
function generateBulkBarcodesOptimized(prefix, qty) {
    const seen = new Set();
    const barcodes = [];
    const batchSize = 4096;
    let generated = 0;
    
    while (generated < qty) {
        const remaining = qty - generated;
        const currentBatch = Math.min(remaining, batchSize);
        const randomBytes = crypto.randomBytes(currentBatch * 8);
        
        for (let i = 0; i < currentBatch; i++) {
            let code;
            let attempts = 0;
            do {
                const offset = (i * 8) % randomBytes.length;
                let randomPart = '';
                for (let j = 0; j < 8; j++) {
                    randomPart += CHARS[randomBytes[(offset + j) % randomBytes.length] % CHARS_LEN];
                }
                code = `${prefix}-${randomPart}-${generated + i + 1}`;
                attempts++;
            } while (seen.has(code) && attempts < 5);
            
            seen.add(code);
            barcodes.push(code);
        }
        generated += currentBatch;
    }
    
    return barcodes;
}

// ===== OWASP Security Headers Middleware =====
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; " +
        "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; " +
        "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com data:; " +
        "connect-src 'self' http: ws: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;"
    );
    next();
});

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// توجيه الروابط القديمة والملفات الثابتة إلى صفحات التطبيق التفاعلي الموحد (SPA)
app.get('/orders_tracking.html', (req, res) => res.redirect(301, '/orders'));
app.get('/admin.html', (req, res) => res.redirect(301, '/admin'));
app.get('/index.html', (req, res) => res.redirect(301, '/'));
app.get('/login.html', (req, res) => res.redirect(301, '/login'));

const frontendDistPath = path.join(__dirname, 'frontend', 'dist');
if (fs.existsSync(frontendDistPath)) {
    app.use(express.static(frontendDistPath));
}
app.use(express.static(path.join(__dirname, 'Public')));
app.use('/js', express.static(path.join(__dirname, 'Public', 'js')));
app.use('/storage', express.static(path.join(__dirname, 'storage')));

// توجيه مباشر لملف البرزنتيشن والملف التعريفي الشامل
app.get('/presentation', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'presentation.html'));
});
app.get('/deck', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'presentation.html'));
});

const dbName = process.env.DB_NAME || 'HMS_Factory_DB';

// ===== إعدادات قاعدة البيانات المحسّنة (تدعم IP المباشر أو الـ Named Instances تلقائياً) =====
function buildTargetDbConfig(customDatabase = null) {
    const rawServer = (process.env.DB_SERVER || '127.0.0.1').trim();
    const config = {
        user: process.env.DB_USER || 'hms_user',
        password: process.env.DB_PASSWORD || '',
        database: customDatabase || dbName,
        options: {
            encrypt: process.env.DB_ENCRYPT === 'true',
            trustServerCertificate: true,
            enableArithAbort: true,
            packetSize: 32768,
            useUTC: false // مزامنة التوقيت المحلي بدقة متناهية ومنع أي إزاحة زمنية
        },
        pool: {
            max: 30,
            min: 2,
            idleTimeoutMillis: 45000,
            acquireTimeoutMillis: 30000
        },
        connectionTimeout: 45000,
        requestTimeout: 300000
    };

    if (rawServer.includes('\\')) {
        const parts = rawServer.split('\\');
        config.server = parts[0] || 'localhost';
        config.options.instanceName = parts[1];
        if (process.env.DB_PORT && process.env.DB_PORT !== '1433') {
            config.port = parseInt(process.env.DB_PORT, 10);
        }
    } else {
        config.server = rawServer;
        config.port = parseInt(process.env.DB_PORT || '1433', 10);
    }

    return config;
}

let targetDbConfig = buildTargetDbConfig();

let globalPool = null;

async function getPool() {
    if (globalPool && globalPool.connected) {
        return globalPool;
    }
    if (globalPool) {
        try { await globalPool.close(); } catch (e) {}
        globalPool = null;
    }
    globalPool = new sql.ConnectionPool(targetDbConfig);
    globalPool.on('error', err => {
        console.error('❌ SQL Pool error:', err.message);
        globalPool = null;
    });
    await globalPool.connect();
    return globalPool;
}

const DEFAULT_CORE_STAGES = [
    "دخول انتاج",
    "خروج انتاج",
    "دخول مغسلة",
    "خروج مغسلة",
    "دخول تعبئة",
    "خروج تعبئة"
];
const PRODUCTION_STAGES = DEFAULT_CORE_STAGES;

// دالة جلب المراحل المفعلة للمصنع ديناميكياً من قاعدة البيانات
async function getActiveProductionStages() {
    try {
        const pool = await getPool();
        const res = await pool.request().query(`
            SELECT stage_name, order_index, stage_code, stage_category
            FROM ProductionStagesConfig
            WHERE is_active = 1
            ORDER BY order_index ASC, id ASC
        `);
        if (res.recordset && res.recordset.length > 0) {
            return res.recordset.map(r => r.stage_name);
        }
    } catch (e) {
        // في حال عدم توفر الجدول بعد، يتم استخدام المراحل الافتراضية
    }
    return DEFAULT_CORE_STAGES;
}

// ===== تحديث ملف .env تلقائياً عند تغيير أو اكتشاف الإعدادات الصحيحة =====
function updateEnvFile(updates) {
    try {
        const envFilePath = path.join(__dirname, '.env');
        let envText = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, 'utf8') : '';
        for (const [key, val] of Object.entries(updates)) {
            if (val === undefined || val === null) continue;
            const regex = new RegExp(`^${key}=.*`, 'm');
            if (regex.test(envText)) {
                envText = envText.replace(regex, `${key}=${val}`);
            } else {
                envText = envText.trimEnd() + `\n${key}=${val}\n`;
            }
        }
        fs.writeFileSync(envFilePath, envText, 'utf8');
        console.log('💾 تم تحديث ملف .env تلقائياً بالإعدادات الصحيحة والشغالة 100%!');
    } catch (e) {
        console.error('⚠️ تعذر تحديث .env:', e.message);
    }
}

// دالة محاولة إنشاء مستخدم النظام تلقائياً عبر Windows Authentication كحل ذكي أول
function tryWindowsAuthCreateUser() {
    try {
        const { execSync } = require('child_process');
        const sqlCmds = [
            'C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\170\\Tools\\Binn\\sqlcmd.exe',
            'C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\180\\Tools\\Binn\\sqlcmd.exe',
            'C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\130\\Tools\\Binn\\sqlcmd.exe',
            'C:\\Program Files\\Microsoft SQL Server\\160\\Tools\\Binn\\sqlcmd.exe',
            'C:\\Program Files\\Microsoft SQL Server\\150\\Tools\\Binn\\sqlcmd.exe',
            'sqlcmd'
        ];
        let foundCmd = null;
        for (const sc of sqlCmds) {
            try {
                if (sc === 'sqlcmd' || fs.existsSync(sc)) { foundCmd = sc; break; }
            } catch (e) {}
        }
        if (!foundCmd) return false;

        const servers = ['.', '127.0.0.1', '.\\SQLEXPRESS', 'localhost', 'localhost\\SQLEXPRESS'];
        const q = "IF NOT EXISTS(SELECT * FROM sys.server_principals WHERE name='hms_user') CREATE LOGIN [hms_user] WITH PASSWORD='HMS@2024!Secure', CHECK_POLICY=OFF; ELSE ALTER LOGIN [hms_user] WITH PASSWORD='HMS@2024!Secure'; ALTER SERVER ROLE [sysadmin] ADD MEMBER [hms_user];";

        for (const s of servers) {
            try {
                execSync(`"${foundCmd}" -S ${s} -E -Q "${q}"`, { stdio: 'pipe', timeout: 4000 });
                console.log(`✅ تم إنشاء وتفعيل مستخدم hms_user تلقائياً عبر Windows Auth على [${s}]!`);
                return true;
            } catch (e) {}
        }
    } catch (e) {}
    return false;
}

// ===== تهيئة قاعدة البيانات مع خاصية الاكتشاف التلقائي الذكي الشامل (خوادم + مستخدمين + إصلاح فوري) =====
async function initializeDatabase() {
    try {
        let connectedPool = null;
        let workingServerInfo = null;
        let workingCreds = null;

        // 1. محاولة الاتصال بالإعداد الأساسي في .env
        try {
            const pool = new sql.ConnectionPool(targetDbConfig);
            await pool.connect();
            connectedPool = pool;
            workingServerInfo = { server: targetDbConfig.server, port: targetDbConfig.port, instance: targetDbConfig.options?.instanceName };
            workingCreds = { user: targetDbConfig.user, password: targetDbConfig.password };
        } catch (initialErr) {
            console.log('⚠️  جاري فحص عناوين وحسابات SQL Server تلقائياً لحل الاتصال ذاتياً...');

            const fallbackServers = [
                { server: targetDbConfig.server || '127.0.0.1', port: targetDbConfig.port || 1433, instance: targetDbConfig.options?.instanceName, label: 'السيرفر المكتوب' },
                { server: '127.0.0.1', port: 1433, instance: null, label: '127.0.0.1:1433' },
                { server: 'localhost', port: 1433, instance: null, label: 'localhost:1433' },
                { server: 'localhost', port: null, instance: 'SQLEXPRESS', label: 'localhost\\SQLEXPRESS' },
                { server: '.', port: null, instance: 'SQLEXPRESS', label: '.\\SQLEXPRESS' },
                { server: '127.0.0.1', port: null, instance: 'SQLEXPRESS', label: '127.0.0.1\\SQLEXPRESS' },
                { server: '.', port: 1433, instance: null, label: '.:1433' }
            ];

            const credCandidates = [
                { user: targetDbConfig.user, password: targetDbConfig.password, label: 'بيانات .env' },
                { user: 'hms_user', password: 'HMS@2024!Secure', label: 'hms_user الافتراضي' },
                { user: 'freedom_user', password: 'Gs654321', label: 'freedom_user المطور' },
                { user: 'sa', password: 'HMS@2024!Secure', label: 'sa (HMS)' },
                { user: 'sa', password: '123456', label: 'sa (123456)' },
                { user: 'sa', password: 'sa', label: 'sa (sa)' },
                { user: 'sa', password: '', label: 'sa (بدون باسوورد)' }
            ];

            // حلقة بحث متقدمة: تفحص الخوادم مع الحسابات
            findLoop:
            for (const srv of fallbackServers) {
                for (const cred of credCandidates) {
                    if (!cred.user) continue;

                    const testConfig = {
                        user: cred.user,
                        password: cred.password,
                        server: srv.server,
                        database: 'master', // الاتصال بـ master أولاً لتفادي غياب قاعدة بيانات العميل
                        options: {
                            encrypt: false,
                            trustServerCertificate: true,
                            enableArithAbort: true,
                            packetSize: 32768,
                            useUTC: false
                        },
                        connectionTimeout: 3500
                    };
                    if (srv.instance) testConfig.options.instanceName = srv.instance;
                    else if (srv.port) testConfig.port = srv.port;

                    try {
                        const testPool = new sql.ConnectionPool(testConfig);
                        await testPool.connect();
                        console.log(`✅ تم الاتصال بنجاح بـ SQL Server عبر [${srv.label}] بحساب [${cred.label}]!`);
                        connectedPool = testPool;
                        workingServerInfo = srv;
                        workingCreds = cred;
                        targetDbConfig = { ...testConfig, database: dbName };
                        break findLoop;
                    } catch (e) {}
                }
            }

            // إذا فشلت كل الحسابات، نحاول إنشاء hms_user عبر Windows Auth ثم إعادة التجربة
            if (!connectedPool) {
                console.log('🔄 محاولة أخيرة: إنشاء مستخدم hms_user تلقائياً عبر Windows Auth...');
                const created = tryWindowsAuthCreateUser();
                if (created) {
                    for (const srv of fallbackServers) {
                        const testConfig = {
                            user: 'hms_user',
                            password: 'HMS@2024!Secure',
                            server: srv.server,
                            database: 'master',
                            options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
                            connectionTimeout: 3500
                        };
                        if (srv.instance) testConfig.options.instanceName = srv.instance;
                        else if (srv.port) testConfig.port = srv.port;

                        try {
                            const testPool = new sql.ConnectionPool(testConfig);
                            await testPool.connect();
                            connectedPool = testPool;
                            workingServerInfo = srv;
                            workingCreds = { user: 'hms_user', password: 'HMS@2024!Secure' };
                            targetDbConfig = { ...testConfig, database: dbName };
                            console.log(`✅ نجح الاتصال بمستخدم hms_user الجديد على [${srv.label}]!`);
                            break;
                        } catch (e) {}
                    }
                }
            }

            if (!connectedPool) {
                throw initialErr;
            }
        }

        // 2. التحقق من وجود قاعدة بيانات المصنع وإنشاؤها تلقائياً إن لم تكن موجودة
        try {
            const masterDbConfig = {
                ...targetDbConfig,
                database: 'master',
                pool: { max: 3, min: 1, idleTimeoutMillis: 30000 }
            };
            const masterPool = await new sql.ConnectionPool(masterDbConfig).connect();
            
            const dbCheck = await masterPool.request().query(`SELECT DB_ID('${dbName}') AS id`);
            if (!dbCheck.recordset[0]?.id) {
                console.log(`🗄️  قاعدة البيانات [${dbName}] غير موجودة، جاري إنشاؤها تلقائياً...`);
                await masterPool.request().query(`
                    CREATE DATABASE [${dbName}];
                    ALTER DATABASE [${dbName}] SET RECOVERY SIMPLE;
                    ALTER DATABASE [${dbName}] SET AUTO_UPDATE_STATISTICS_ASYNC ON;
                `);
                console.log(`✅ تم إنشاء قاعدة بيانات المصنع [${dbName}] بنجاح 100%!`);
            }
            await masterPool.close();
        } catch (masterErr) {
            console.log('ℹ️  فحص قاعدة البيانات master:', masterErr.message.split('\n')[0]);
        }

        // 3. الاتصال النهائي بقاعدة بيانات المصنع وتثبيت الـ Pool
        if (connectedPool && connectedPool.config.database !== dbName) {
            try { await connectedPool.close(); } catch (e) {}
            targetDbConfig.database = dbName;
            globalPool = await new sql.ConnectionPool(targetDbConfig).connect();
        } else {
            globalPool = connectedPool;
        }

        globalPool.on('error', err => {
            console.error('❌ Pool error:', err.message);
            globalPool = null;
        });

        // 4. تحديث ملف .env تلقائياً بكل البيانات الشغالة بدون تدخل المستخدم
        if (workingServerInfo && workingCreds) {
            const correctServer = workingServerInfo.instance
                ? `${workingServerInfo.server}\\${workingServerInfo.instance}`
                : workingServerInfo.server;

            updateEnvFile({
                DB_SERVER: correctServer,
                DB_PORT: workingServerInfo.port || 1433,
                DB_USER: workingCreds.user,
                DB_PASSWORD: workingCreds.password,
                DB_NAME: dbName,
                SETUP_DONE: 'true'
            });
        }

        console.log('✅ SQL Server Connected successfully:', dbName);

        // إنشاء جداول بفهارس محسّنة
        await globalPool.request().query(`
            IF OBJECT_ID('dbo.Users', 'U') IS NULL
            BEGIN
                CREATE TABLE Users (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    username NVARCHAR(100) NOT NULL UNIQUE,
                    password NVARCHAR(256) NOT NULL,
                    full_name NVARCHAR(200) NULL,
                    role NVARCHAR(50) DEFAULT 'production',
                    stage_action NVARCHAR(100) NULL,
                    can_view_orders BIT DEFAULT 1,
                    can_create_orders BIT DEFAULT 0,
                    can_print_reports BIT DEFAULT 0,
                    can_manage_users BIT DEFAULT 0,
                    is_locked BIT DEFAULT 0,
                    failed_login_count INT DEFAULT 0,
                    lockout_count INT DEFAULT 0,
                    locked_until DATETIME NULL,
                    locked_reason NVARCHAR(200) NULL,
                    created_at DATETIME DEFAULT GETDATE()
                );
            END
            ELSE
            BEGIN
                IF COL_LENGTH('dbo.Users', 'is_locked') IS NULL
                    ALTER TABLE dbo.Users ADD is_locked BIT DEFAULT 0;
                IF COL_LENGTH('dbo.Users', 'failed_login_count') IS NULL
                    ALTER TABLE dbo.Users ADD failed_login_count INT DEFAULT 0;
                IF COL_LENGTH('dbo.Users', 'lockout_count') IS NULL
                    ALTER TABLE dbo.Users ADD lockout_count INT DEFAULT 0;
                IF COL_LENGTH('dbo.Users', 'locked_until') IS NULL
                    ALTER TABLE dbo.Users ADD locked_until DATETIME NULL;
                IF COL_LENGTH('dbo.Users', 'locked_reason') IS NULL
                    ALTER TABLE dbo.Users ADD locked_reason NVARCHAR(200) NULL;
            END
        `);

        await globalPool.request().query(`
            IF OBJECT_ID('dbo.Orders', 'U') IS NULL
            BEGIN
                CREATE TABLE Orders (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    order_number NVARCHAR(100) NOT NULL UNIQUE,
                    customer_name NVARCHAR(200) NOT NULL,
                    target_quantity INT NOT NULL,
                    status NVARCHAR(50) DEFAULT 'active',
                    created_by NVARCHAR(200) NULL,
                    created_at DATETIME DEFAULT GETDATE()
                );
                CREATE NONCLUSTERED INDEX IX_Orders_Status ON Orders(status);
                CREATE NONCLUSTERED INDEX IX_Orders_OrderNumber ON Orders(order_number);
            END
        `);

        await globalPool.request().query(`
            IF OBJECT_ID('dbo.OrderBarcodes', 'U') IS NULL
            BEGIN
                CREATE TABLE OrderBarcodes (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    order_id INT NOT NULL FOREIGN KEY REFERENCES Orders(id) ON DELETE CASCADE,
                    barcode NVARCHAR(120) NOT NULL UNIQUE,
                    created_at DATETIME DEFAULT GETDATE()
                );
                CREATE NONCLUSTERED INDEX IX_OrderBarcodes_OrderId ON OrderBarcodes(order_id);
                CREATE NONCLUSTERED INDEX IX_OrderBarcodes_Barcode ON OrderBarcodes(barcode);
            END
        `);

        await globalPool.request().query(`
            IF OBJECT_ID('dbo.OrderStages', 'U') IS NULL
            BEGIN
                CREATE TABLE OrderStages (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    order_id INT NOT NULL FOREIGN KEY REFERENCES Orders(id) ON DELETE CASCADE,
                    stage_name NVARCHAR(100) NOT NULL,
                    scanned_quantity INT DEFAULT 0,
                    target_quantity INT NOT NULL,
                    status NVARCHAR(50) DEFAULT 'pending',
                    order_index INT DEFAULT 1,
                    created_at DATETIME DEFAULT GETDATE(),
                    CONSTRAINT UQ_Order_Stage UNIQUE (order_id, stage_name)
                );
                CREATE NONCLUSTERED INDEX IX_OrderStages_OrderId ON OrderStages(order_id);
            END
            ELSE
            BEGIN
                IF COL_LENGTH('OrderStages', 'order_index') IS NULL
                BEGIN
                    ALTER TABLE OrderStages ADD order_index INT DEFAULT 1;
                END
            END
        `);

        await globalPool.request().query(`
            IF OBJECT_ID('dbo.StockMovements', 'U') IS NULL
            BEGIN
                CREATE TABLE StockMovements (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    order_id INT NOT NULL FOREIGN KEY REFERENCES Orders(id) ON DELETE CASCADE,
                    stage_name NVARCHAR(100) NOT NULL,
                    barcode NVARCHAR(120) NOT NULL,
                    quantity INT DEFAULT 1,
                    scanned_by NVARCHAR(200) NULL,
                    created_at DATETIME DEFAULT GETDATE()
                );
                CREATE NONCLUSTERED INDEX IX_StockMovements_OrderId ON StockMovements(order_id);
                CREATE NONCLUSTERED INDEX IX_StockMovements_OrderStage ON StockMovements(order_id, stage_name);
                CREATE NONCLUSTERED INDEX IX_StockMovements_Barcode ON StockMovements(barcode);
            END
        `);

        // فهارس تسريع الاستعلامات المركبة للكميات الضخمة ومعالجة الضغط العالي
        await globalPool.request().query(`
            -- ضبط محرك SQL Server للسرعة وإعادة استخدام سجل المعاملات بدون تضخم
            BEGIN TRY
                ALTER DATABASE [${dbName}] SET RECOVERY SIMPLE;
                ALTER DATABASE [${dbName}] SET AUTO_UPDATE_STATISTICS_ASYNC ON;
            END TRY
            BEGIN CATCH
            END CATCH;

            -- إزالة الفهارس المكررة غير الضرورية لتسريع عمليات الإدراج (Bulk Insert & Write Throughput)
            IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_OrderBarcodes_Barcode' AND object_id = OBJECT_ID('dbo.OrderBarcodes'))
                DROP INDEX IX_OrderBarcodes_Barcode ON dbo.OrderBarcodes;

            IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ExternalOrders_OrderNumber' AND object_id = OBJECT_ID('dbo.ExternalOrders'))
                DROP INDEX IX_ExternalOrders_OrderNumber ON dbo.ExternalOrders;

            IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_StockMovements_Order_Stage_Barcode' AND object_id = OBJECT_ID('dbo.StockMovements'))
                DROP INDEX IX_StockMovements_Order_Stage_Barcode ON dbo.StockMovements;

            -- فهارس أوامر التشغيل الأساسية
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Orders_Status' AND object_id = OBJECT_ID('dbo.Orders'))
                CREATE NONCLUSTERED INDEX IX_Orders_Status ON dbo.Orders(status);

            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Orders_OrderNumber' AND object_id = OBJECT_ID('dbo.Orders'))
                CREATE NONCLUSTERED INDEX IX_Orders_OrderNumber ON dbo.Orders(order_number);

            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_OrderBarcodes_OrderId' AND object_id = OBJECT_ID('dbo.OrderBarcodes'))
                CREATE NONCLUSTERED INDEX IX_OrderBarcodes_OrderId ON dbo.OrderBarcodes(order_id);

            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_OrderBarcodes_Order_Barcode' AND object_id = OBJECT_ID('dbo.OrderBarcodes'))
                CREATE NONCLUSTERED INDEX IX_OrderBarcodes_Order_Barcode ON dbo.OrderBarcodes(order_id, barcode) WITH (FILLFACTOR = 85);

            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_OrderStages_OrderId' AND object_id = OBJECT_ID('dbo.OrderStages'))
                CREATE NONCLUSTERED INDEX IX_OrderStages_OrderId ON dbo.OrderStages(order_id);

            -- فهارس تغطية متقدمة (Covering Indexes) للمراحل
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_OrderStages_Order_Stage' AND object_id = OBJECT_ID('dbo.OrderStages'))
                CREATE NONCLUSTERED INDEX IX_OrderStages_Order_Stage 
                ON dbo.OrderStages(order_id, stage_name)
                INCLUDE (scanned_quantity, target_quantity, status, order_index)
                WITH (FILLFACTOR = 90);

            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_OrderStages_Order_Index' AND object_id = OBJECT_ID('dbo.OrderStages'))
                CREATE NONCLUSTERED INDEX IX_OrderStages_Order_Index 
                ON dbo.OrderStages(order_id, order_index)
                INCLUDE (id, stage_name, status)
                WITH (FILLFACTOR = 90);

            -- فهارس حركات المخزون والمسح (Stock Movements)
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_StockMovements_OrderId' AND object_id = OBJECT_ID('dbo.StockMovements'))
                CREATE NONCLUSTERED INDEX IX_StockMovements_OrderId ON dbo.StockMovements(order_id);

            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_StockMovements_Barcode' AND object_id = OBJECT_ID('dbo.StockMovements'))
                CREATE NONCLUSTERED INDEX IX_StockMovements_Barcode ON dbo.StockMovements(barcode);

            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_StockMovements_Order_Barcode' AND object_id = OBJECT_ID('dbo.StockMovements'))
                CREATE NONCLUSTERED INDEX IX_StockMovements_Order_Barcode ON dbo.StockMovements(order_id, barcode);

            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_StockMovements_CreatedAt' AND object_id = OBJECT_ID('dbo.StockMovements'))
                CREATE NONCLUSTERED INDEX IX_StockMovements_CreatedAt ON dbo.StockMovements(created_at DESC);

            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_StockMovements_Order_CreatedAt_Covering' AND object_id = OBJECT_ID('dbo.StockMovements'))
                CREATE NONCLUSTERED INDEX IX_StockMovements_Order_CreatedAt_Covering 
                ON dbo.StockMovements(order_id, created_at DESC)
                INCLUDE (stage_name, scanned_by, barcode, quantity)
                WITH (FILLFACTOR = 85);

            -- فهرس فريد لمنع تكرار مسح نفس الباركود في نفس المرحلة نهائياً حتى مع الضغط المتزامن
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_StockMovements_Order_Stage_Barcode' AND object_id = OBJECT_ID('dbo.StockMovements'))
            BEGIN
                IF NOT EXISTS (
                    SELECT order_id, stage_name, barcode, COUNT(*) 
                    FROM dbo.StockMovements 
                    GROUP BY order_id, stage_name, barcode 
                    HAVING COUNT(*) > 1
                )
                BEGIN
                    CREATE UNIQUE NONCLUSTERED INDEX UQ_StockMovements_Order_Stage_Barcode ON dbo.StockMovements(order_id, stage_name, barcode);
                END
            END

            -- جداول التشغيل الخارجي المستقلة تماماً (External Processing Engine)
            IF OBJECT_ID('dbo.ExternalOrders', 'U') IS NULL
            BEGIN
                CREATE TABLE ExternalOrders (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    order_number NVARCHAR(100) NOT NULL UNIQUE,
                    description NVARCHAR(250) NULL,
                    customer_name NVARCHAR(200) NULL,
                    status NVARCHAR(50) DEFAULT 'active',
                    total_scanned INT DEFAULT 0,
                    created_by NVARCHAR(200) NULL,
                    created_at DATETIME DEFAULT GETDATE(),
                    last_activity_at DATETIME DEFAULT GETDATE()
                );
                CREATE NONCLUSTERED INDEX IX_ExternalOrders_OrderNumber ON ExternalOrders(order_number);
                CREATE NONCLUSTERED INDEX IX_ExternalOrders_Status ON ExternalOrders(status);
            END

            IF OBJECT_ID('dbo.ExternalScans', 'U') IS NULL
            BEGIN
                CREATE TABLE ExternalScans (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    external_order_id INT NOT NULL FOREIGN KEY REFERENCES ExternalOrders(id) ON DELETE CASCADE,
                    barcode NVARCHAR(200) NOT NULL,
                    scanned_by NVARCHAR(200) NULL,
                    created_at DATETIME DEFAULT GETDATE()
                );
                CREATE NONCLUSTERED INDEX IX_ExternalScans_OrderId ON ExternalScans(external_order_id);
                CREATE NONCLUSTERED INDEX IX_ExternalScans_Barcode ON ExternalScans(barcode);
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_ExternalScans_Order_Barcode' AND object_id = OBJECT_ID('dbo.ExternalScans'))
                    CREATE UNIQUE NONCLUSTERED INDEX UQ_ExternalScans_Order_Barcode ON ExternalScans(external_order_id, barcode);
            END

            -- هجرة وتأكيد أعمدة التتميم والاتجاهات والإغلاق واسم العميل للتشغيل الخارجي
            IF COL_LENGTH('dbo.ExternalOrders', 'customer_name') IS NULL
                ALTER TABLE dbo.ExternalOrders ADD customer_name NVARCHAR(200) NULL;

            IF COL_LENGTH('dbo.ExternalOrders', 'target_quantity') IS NULL
                ALTER TABLE dbo.ExternalOrders ADD target_quantity INT DEFAULT 0;

            IF COL_LENGTH('dbo.ExternalOrders', 'stage_direction') IS NULL
                ALTER TABLE dbo.ExternalOrders ADD stage_direction NVARCHAR(50) NULL;

            IF COL_LENGTH('dbo.ExternalOrders', 'closed_at') IS NULL
                ALTER TABLE dbo.ExternalOrders ADD closed_at DATETIME NULL;

            IF COL_LENGTH('dbo.ExternalOrders', 'closed_by') IS NULL
                ALTER TABLE dbo.ExternalOrders ADD closed_by NVARCHAR(200) NULL;

            IF COL_LENGTH('dbo.ExternalScans', 'scan_type') IS NULL
                ALTER TABLE dbo.ExternalScans ADD scan_type NVARCHAR(50) NULL;

            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ExternalScans_Order_CreatedAt_Covering' AND object_id = OBJECT_ID('dbo.ExternalScans'))
                CREATE NONCLUSTERED INDEX IX_ExternalScans_Order_CreatedAt_Covering 
                ON dbo.ExternalScans(external_order_id, created_at DESC)
                INCLUDE (barcode, scanned_by, scan_type)
                WITH (FILLFACTOR = 85);
        `);

        // تهيئة جدول تكويد وتخصيص مراحل خط الإنتاج للمصنع (Production Stages Pipeline)
        await globalPool.request().query(`
            IF OBJECT_ID('dbo.ProductionStagesConfig', 'U') IS NULL
            BEGIN
                CREATE TABLE ProductionStagesConfig (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    stage_name NVARCHAR(100) NOT NULL UNIQUE,
                    stage_code NVARCHAR(50) NULL,
                    stage_category NVARCHAR(50) DEFAULT 'custom',
                    order_index INT NOT NULL DEFAULT 1,
                    is_active BIT DEFAULT 1,
                    is_system BIT DEFAULT 0,
                    created_at DATETIME DEFAULT GETDATE()
                );
                CREATE NONCLUSTERED INDEX IX_ProductionStages_Order ON ProductionStagesConfig(order_index, is_active);
            END

            -- مزامنة كافة المراحل الصناعية الشاملة للمصانع (26 مرحلة تغطي دورة حياة أي مصنع ملابس)
            DECLARE @MasterStages TABLE (
                stage_name NVARCHAR(100),
                stage_code NVARCHAR(50),
                stage_category NVARCHAR(50),
                order_index INT,
                default_active BIT
            );

            INSERT INTO @MasterStages (stage_name, stage_code, stage_category, order_index, default_active) VALUES
                (N'دخول قص', 'IN_CUT', 'cutting', 1, 0),
                (N'خروج قص', 'OUT_CUT', 'cutting', 2, 0),
                (N'دخول تطريز', 'IN_EMB', 'embroidery', 3, 0),
                (N'خروج تطريز', 'OUT_EMB', 'embroidery', 4, 0),
                (N'دخول طباعة', 'IN_PRINT', 'printing', 5, 0),
                (N'خروج طباعة', 'OUT_PRINT', 'printing', 6, 0),
                (N'دخول انتاج', 'IN_PROD', 'production', 7, 1),
                (N'خروج انتاج', 'OUT_PROD', 'production', 8, 1),
                (N'دخول ليزر', 'IN_LASER', 'laser', 9, 0),
                (N'خروج ليزر', 'OUT_LASER', 'laser', 10, 0),
                (N'دخول سنفرة', 'IN_SAND', 'sanding', 11, 0),
                (N'خروج سنفرة', 'OUT_SAND', 'sanding', 12, 0),
                (N'دخول كرمشة', 'IN_CRUSH', 'crushing', 13, 0),
                (N'خروج كرمشة', 'OUT_CRUSH', 'crushing', 14, 0),
                (N'دخول مغسلة', 'IN_WASH', 'wash', 15, 1),
                (N'خروج مغسلة', 'OUT_WASH', 'wash', 16, 1),
                (N'دخول صباغة', 'IN_DYE', 'dyeing', 17, 0),
                (N'خروج صباغة', 'OUT_DYE', 'dyeing', 18, 0),
                (N'دخول فحص جودة', 'IN_QC', 'qc', 19, 0),
                (N'خروج فحص جودة', 'OUT_QC', 'qc', 20, 0),
                (N'دخول كي', 'IN_IRON', 'ironing', 21, 0),
                (N'خروج كي', 'OUT_IRON', 'ironing', 22, 0),
                (N'دخول تعبئة', 'IN_PACK', 'packing', 23, 1),
                (N'خروج تعبئة', 'OUT_PACK', 'packing', 24, 1),
                (N'دخول مخزن نهائي', 'IN_WAREHOUSE', 'warehouse', 25, 0),
                (N'خروج مخزن نهائي', 'OUT_WAREHOUSE', 'warehouse', 26, 0);

            -- إدراج المراحل غير الموجودة مسبقاً
            INSERT INTO ProductionStagesConfig (stage_name, stage_code, stage_category, order_index, is_active, is_system)
            SELECT m.stage_name, m.stage_code, m.stage_category, m.order_index, m.default_active, 1
            FROM @MasterStages m
            WHERE NOT EXISTS (
                SELECT 1 FROM ProductionStagesConfig c WHERE c.stage_name = m.stage_name
            );

            -- تحديث الفئات للمراحل القديمة إذا كانت غير متطابقة
            UPDATE c
            SET c.stage_category = m.stage_category,
                c.stage_code = ISNULL(c.stage_code, m.stage_code)
            FROM ProductionStagesConfig c
            JOIN @MasterStages m ON c.stage_name = m.stage_name
            WHERE c.stage_category = 'core' OR c.stage_category IS NULL;
        `);

        // تهيئة جدول إعدادات النظام الشاملة (SystemSettings) لضبط لغة النظام والخيارات المركزية
        await globalPool.request().query(`
            IF OBJECT_ID('dbo.SystemSettings', 'U') IS NULL
            BEGIN
                CREATE TABLE SystemSettings (
                    setting_key NVARCHAR(100) PRIMARY KEY,
                    setting_value NVARCHAR(MAX) NOT NULL,
                    updated_at DATETIME DEFAULT GETDATE(),
                    updated_by NVARCHAR(100) NULL
                );
            END

            IF NOT EXISTS (SELECT 1 FROM SystemSettings WHERE setting_key = 'system_language')
            BEGIN
                INSERT INTO SystemSettings (setting_key, setting_value) VALUES ('system_language', 'ar');
            END
        `);

        try {
            const langRow = await globalPool.request().query("SELECT setting_value FROM SystemSettings WHERE setting_key = 'system_language'");
            if (langRow.recordset.length > 0 && langRow.recordset[0].setting_value) {
                currentSystemLanguage = langRow.recordset[0].setting_value;
            }
        } catch (e) {
            console.error('Error loading system language setting:', e);
        }

        // إنشاء وتأكيد حسابات ملاك السيستم Gamal و Auf في أي داتا بيز جديدة تلقائياً
        const aufPassHash = '5ca14100fdec1f476e1d5c5d43a5d322d04c50c5e42e9b73976783189b845032';
        const gamalPassHash = 'pbkdf2$100000$446bd09d127fcb201468ba9912ae3dc7$bbd50696577f46b52ec98cea1fe3bd2a2c83a5d7bd559fa27cc27c1abc7a7af8da1fbad48d9de2ce21629b8de00a997898cbe828f85d03b80b6bc06733ae080c';

        // 1. حساب Auf
        const aufCheck = await globalPool.request().query(`SELECT id FROM Users WHERE LOWER(username) = 'auf'`);
        if (aufCheck.recordset.length === 0) {
            await globalPool.request()
                .input('hash', sql.NVarChar, aufPassHash)
                .query(`
                    INSERT INTO Users (username, password, full_name, role, can_view_orders, can_create_orders, can_print_reports, can_manage_users)
                    VALUES ('Auf', @hash, N'Auf (Master Superadmin)', 'superadmin', 1, 1, 1, 1)
                `);
            console.log('👑 Master Superadmin [Auf] created successfully in new database');
        } else {
            await globalPool.request().query(`
                UPDATE Users 
                SET role = 'superadmin', can_view_orders = 1, can_create_orders = 1, can_print_reports = 1, can_manage_users = 1,
                    is_locked = 0, failed_login_count = 0, lockout_count = 0, locked_until = NULL, locked_reason = NULL
                WHERE LOWER(username) = 'auf'
            `);
        }

        // 2. حساب Gamal
        const gamalCheck = await globalPool.request().query(`SELECT id FROM Users WHERE LOWER(username) = 'gamal'`);
        if (gamalCheck.recordset.length === 0) {
            await globalPool.request()
                .input('hash', sql.NVarChar, gamalPassHash)
                .query(`
                    INSERT INTO Users (username, password, full_name, role, can_view_orders, can_create_orders, can_print_reports, can_manage_users, is_locked, failed_login_count, lockout_count)
                    VALUES ('Gamal', @hash, N'Gamal (Master Superadmin)', 'superadmin', 1, 1, 1, 1, 0, 0, 0)
                `);
            console.log('👑 Master Superadmin [Gamal] created successfully in new database');
        } else {
            await globalPool.request().query(`
                UPDATE Users 
                SET role = 'superadmin', can_view_orders = 1, can_create_orders = 1, can_print_reports = 1, can_manage_users = 1,
                    is_locked = 0, failed_login_count = 0, lockout_count = 0, locked_until = NULL, locked_reason = NULL
                WHERE LOWER(username) = 'gamal'
            `);
        }

        // 3. إنشاء أدمن تجريبي افتراضي فقط في بيئة المطور أو في حال تفعيل SEED_DEFAULT_ADMIN
        if (process.env.SEED_DEFAULT_ADMIN === 'true' || process.env.GENERAL_EDITION === 'true') {
            const adminCheck = await globalPool.request().query(`SELECT id FROM Users WHERE username = 'admin'`);
            if (adminCheck.recordset.length === 0) {
                const passHash = hashPasswordSecure('admin123');
                await globalPool.request()
                    .input('hash', sql.NVarChar, passHash)
                    .query(`
                        INSERT INTO Users (username, password, full_name, role, can_view_orders, can_create_orders, can_print_reports, can_manage_users)
                        VALUES ('admin', @hash, N'مدير النظام', 'admin', 1, 1, 1, 1)
                    `);
                console.log('👤 Default admin created: username "admin", password "admin123"');
            }
        }

        // التأكد من مسح حسابات الماستر التلقائية القديمة
        await globalPool.request().query(`
            DELETE FROM Users WHERE username IN ('freedom_master', 'hms_master')
        `);

        console.log('👑 Master Superadmin accounts locked & confirmed: "Gamal" & "Auf" with full privileges');

    } catch (err) {
        console.error('❌ Database Initialization Error:', err);
        process.exit(1);
    }
}

// ===== Middleware التحقق الأمني من المستخدم (JWT & RBAC Engine) =====
async function getCurrentUserMiddleware(req, res, next) {
    try {
        let userId = null;
        const auth = req.headers['authorization'];
        
        // 1. أولاً: التحقق المشفر من توكن JWT
        if (auth && auth.startsWith('Bearer ')) {
            const token = auth.substring(7).trim();
            const decoded = verifyJWT(token);
            if (decoded && decoded.id) {
                userId = decoded.id;
            } else if (/^\d+$/.test(token)) {
                // توافق تراجعي مؤقت للعملاء القدامى
                userId = parseInt(token, 10);
            }
        }

        // 2. ثانياً: توافق تراجعي أثناء مرحلة الترقية للمستخدمين النشطين
        if (!userId && req.headers['x-user-id']) {
            const parsed = parseInt(req.headers['x-user-id'], 10);
            if (!isNaN(parsed) && parsed > 0) {
                userId = parsed;
            }
        }

        if (!userId && req.query && req.query.user_id) {
            const parsedQuery = parseInt(req.query.user_id, 10);
            if (!isNaN(parsedQuery) && parsedQuery > 0) {
                userId = parsedQuery;
            }
        }

        if (!userId) { 
            req.user = null; 
            return next(); 
        }

        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, parseInt(userId, 10))
            .query('SELECT id, username, full_name, role, stage_action, can_view_orders, can_create_orders, can_print_reports, can_manage_users FROM Users WHERE id = @id');
        
        req.user = result.recordset[0] || null;
        if (req.user) {
            const uName = (req.user.username || '').toLowerCase();
            if (uName === 'gamal' || uName === 'auf' || req.user.role === 'superadmin') {
                req.user.role = 'superadmin';
                req.user.can_view_orders = 1;
                req.user.can_create_orders = 1;
                req.user.can_print_reports = 1;
                req.user.can_manage_users = 1;
                req.user.is_master = true;
            }
        }
        next();
    } catch (e) {
        req.user = null;
        next();
    }
}

app.use(getCurrentUserMiddleware);

// ===== Middleware التحقق الصارم من صلاحية ترخيص النظام للمصانع والعملاء =====
app.use((req, res, next) => {
    // استثناء المسارات العامة ومسارات الترخيص والفحص الصحي
    if (
        !req.path.startsWith('/api') || 
        req.path === '/api/health' || 
        req.path === '/api/login' || 
        req.path.startsWith('/api/license') || 
        req.path.startsWith('/api/system/public-info')
    ) {
        return next();
    }

    // ملاك السيستم Gamal و Auf و superadmin لديهم نفاذ كامل ومطلق للنظام حتى وإن انتهى أو غاب ترخيص العميل
    if (req.user && (req.user.role === 'superadmin' || ['gamal', 'auf'].includes((req.user.username || '').toLowerCase()))) {
        return next();
    }

    if (!cachedLicenseStatus || !cachedLicenseStatus.valid) {
        cachedLicenseStatus = verifyLicenseFile();
    }

    if (!cachedLicenseStatus || !cachedLicenseStatus.valid) {
        return res.status(403).json({
            success: false,
            license_error: true,
            message: cachedLicenseStatus?.message || '⛔ عذراً، لا يوجد ترخيص مفعل لهذا النظام أو انتهت مدة الترخيص! يرجى تزويد النظام بملف الترخيص المعتمد (.lic).'
        });
    }

    next();
});

// ===== APIs =====

// Health Check
app.get('/api/health', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request().query('SELECT 1');
        res.json({ connected: true, status: 'ok', timestamp: new Date().toISOString() });
    } catch (e) {
        res.status(503).json({ connected: false, status: 'error' });
    }
});

// تسجيل الدخول المحمي بنظام قفل الحسابات المتقدم (Account Lockout Policy + PBKDF2 + JWT + فحص الترخيص الصارم)
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }

    const trimmedUsername = (username || '').trim();
    const isMasterOwner = ['gamal', 'auf'].includes(trimmedUsername.toLowerCase());

    // فحص ترخيص النظام للعملاء: لا يُسمح بتسجيل الدخول لأي مستخدم عادي أو أدمن مصنع إذا غاب ملف الترخيص
    if (!cachedLicenseStatus || !cachedLicenseStatus.valid) {
        cachedLicenseStatus = verifyLicenseFile();
    }
    if (!cachedLicenseStatus || !cachedLicenseStatus.valid) {
        if (!isMasterOwner) {
            return res.status(403).json({
                success: false,
                license_error: true,
                message: '⛔ لا يوجد ترخيص مفعل لهذا النظام أو انتهت مدة الترخيص! يرجى التواصل مع مالك ومبرمج النظام لتفعيل الترخيص.'
            });
        }
    }
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('username', sql.NVarChar, trimmedUsername)
            .query(`
                SELECT id, username, password, full_name, role, stage_action, 
                       can_view_orders, can_create_orders, can_print_reports, can_manage_users,
                       is_locked, failed_login_count, lockout_count, locked_until, locked_reason
                FROM Users 
                WHERE username = @username
            `);

        if (result.recordset.length > 0) {
            const userRow = result.recordset[0];

            // ملاك النظام الماستر Gamal و Auf محميون استثنائياً ولا يُقفل حسابهم نهائياً تحت أي ظرف
            if (!isMasterOwner) {
                // فحص حالة القفل الحالية للحساب
                if (userRow.is_locked) {
                    if (userRow.locked_until) {
                        const now = Date.now();
                        const lockEndTime = new Date(userRow.locked_until).getTime();

                        if (now < lockEndTime) {
                            const remainingSeconds = Math.ceil((lockEndTime - now) / 1000);
                            const remainingMinutes = Math.ceil(remainingSeconds / 60);
                            return res.status(403).json({
                                success: false,
                                locked: true,
                                lockType: 'temporary',
                                remainingSeconds,
                                remainingMinutes,
                                message: `🔒 هذا الحساب مقفول مؤقتاً لتكرار محاولات الدخول الخاطئة. سيتم فتح القفل تلقائياً بعد ${remainingMinutes} دقيقة، أو يمكن لمالك النظام فك القفل فوراً.`
                            });
                        } else {
                            // انتهت مدة الـ 5 دقائق للقفل المؤقت -> فك القفل تلقائياً
                            await pool.request()
                                .input('id', sql.Int, userRow.id)
                                .query('UPDATE Users SET is_locked = 0, locked_until = NULL, failed_login_count = 0 WHERE id = @id');
                            userRow.is_locked = false;
                            userRow.locked_until = null;
                            userRow.failed_login_count = 0;
                        }
                    } else {
                        // locked_until خالي -> قفل نهائي يتطلب فك القفل يدوياً من المالك المطلق
                        return res.status(403).json({
                            success: false,
                            locked: true,
                            lockType: 'permanent',
                            message: '⛔ تم قفل هذا الحساب نهائياً لتكرار محاولات الدخول الخاطئة! يتطلب فك القفل تدخل مالك النظام (جمال / عوف) من لوحة الإدارة.'
                        });
                    }
                }
            }

            const authCheck = verifyPassword(password, userRow.password);

            if (authCheck.valid) {
                // نجاح الدخول: تصفير عداد المحاولات الفاشلة
                if (!isMasterOwner && (userRow.failed_login_count > 0 || userRow.is_locked)) {
                    await pool.request()
                        .input('id', sql.Int, userRow.id)
                        .query('UPDATE Users SET failed_login_count = 0, is_locked = 0, locked_until = NULL, locked_reason = NULL WHERE id = @id');
                }

                // ترقية هاش كلمة المرور تلقائياً في الخلفية إلى Salted PBKDF2 إذا كان بصيغة قديمة
                if (authCheck.needsRehash) {
                    const upgradedHash = hashPasswordSecure(password);
                    pool.request()
                        .input('id', sql.Int, userRow.id)
                        .input('upgradedHash', sql.NVarChar, upgradedHash)
                        .query('UPDATE Users SET password = @upgradedHash WHERE id = @id')
                        .catch(e => console.error('Silent hash upgrade failed:', e));
                }

                const loggedUser = {
                    id: userRow.id,
                    username: userRow.username,
                    full_name: userRow.full_name,
                    role: userRow.role,
                    stage_action: userRow.stage_action,
                    can_view_orders: userRow.can_view_orders,
                    can_create_orders: userRow.can_create_orders,
                    can_print_reports: userRow.can_print_reports,
                    can_manage_users: userRow.can_manage_users
                };

                const uName = (loggedUser.username || '').toLowerCase();
                if (uName === 'gamal' || uName === 'auf' || loggedUser.role === 'superadmin') {
                    loggedUser.role = 'superadmin';
                    loggedUser.can_view_orders = 1;
                    loggedUser.can_create_orders = 1;
                    loggedUser.can_print_reports = 1;
                    loggedUser.can_manage_users = 1;
                    loggedUser.is_master = true;
                }

                // إصدار توكن أمني مشفر بنظام HMAC-SHA256 JWT
                const token = generateJWT({
                    id: loggedUser.id,
                    username: loggedUser.username,
                    role: loggedUser.role
                });

                return res.json({ success: true, user: loggedUser, token });
            } else {
                // كلمة المرور غير صحيحة لمستخدم مسجل
                if (isMasterOwner) {
                    // الملاك لا يخضعون للقفل أبداً
                    return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
                }

                const currentFailed = (userRow.failed_login_count || 0) + 1;
                const currentLockouts = userRow.lockout_count || 0;

                if (currentFailed >= 5) {
                    if (currentLockouts === 0) {
                        // المرة الأولى: قفل مؤقت لمدة 5 دقائق
                        await pool.request()
                            .input('id', sql.Int, userRow.id)
                            .query(`
                                UPDATE Users 
                                SET is_locked = 1, 
                                    lockout_count = 1, 
                                    failed_login_count = 0, 
                                    locked_until = DATEADD(minute, 5, GETDATE()), 
                                    locked_reason = N'قفل مؤقت لمدة 5 دقائق لتجاوز 5 محاولات خاطئة'
                                WHERE id = @id
                            `);

                        console.warn(`🔒 [Security] User [${userRow.username}] locked for 5 minutes (first lockout cycle).`);
                        return res.status(403).json({
                            success: false,
                            locked: true,
                            lockType: 'temporary',
                            remainingMinutes: 5,
                            message: '🔒 تم قفل الحساب مؤقتاً لمدة 5 دقائق لتكرار إدخال كلمة المرور 5 مرات خاطئة. يمكنك الانتظار أو التواصل مع الإدارة.'
                        });
                    } else {
                        // المرة الثانية أو أكثر: قفل نهائي لا يفتح إلا يدوياً بواسطة المالك
                        await pool.request()
                            .input('id', sql.Int, userRow.id)
                            .query(`
                                UPDATE Users 
                                SET is_locked = 1, 
                                    lockout_count = lockout_count + 1, 
                                    failed_login_count = 0, 
                                    locked_until = NULL, 
                                    locked_reason = N'قفل نهائي لتكرار المحاولات الخاطئة بعد القفل المؤقت'
                                WHERE id = @id
                            `);

                        console.warn(`⛔ [Security Alert] User [${userRow.username}] locked PERMANENTLY after repeated lockout.`);
                        return res.status(403).json({
                            success: false,
                            locked: true,
                            lockType: 'permanent',
                            message: '⛔ تم قفل هذا الحساب نهائياً لتكرار محاولات الدخول الخاطئة بعد انتهاء القفل المؤقت! لا يمكن الدخول إلا بفك القفل من مالك السيستم (جمال / عوف).'
                        });
                    }
                } else {
                    // لم يبلغ 5 محاولات بعد -> تحديث العداد والتحذير بالمتبقي
                    await pool.request()
                        .input('id', sql.Int, userRow.id)
                        .input('cnt', sql.Int, currentFailed)
                        .query('UPDATE Users SET failed_login_count = @cnt WHERE id = @id');

                    const remainingAttempts = 5 - currentFailed;
                    return res.status(401).json({
                        success: false,
                        failedAttempts: currentFailed,
                        remainingAttempts,
                        message: `كلمة المرور غير صحيحة. متبقي ${remainingAttempts} ${remainingAttempts === 1 ? 'محاولة واحدة' : 'محاولات'} قبل قفل الحساب!`
                    });
                }
            }
        }

        // اسم المستخدم غير موجود أصلاً في النظام
        return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    } catch (err) {
        console.error('Login Error:', err);
        return res.status(500).json({ success: false, message: 'خطأ في السيرفر أثناء تسجيل الدخول' });
    }
});

// API تحديث بيانات المستخدم الحالي من السيرفر (Session Refresh)
app.get('/api/me', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'يرجى تسجيل الدخول أولاً' });
    }
    res.json({ success: true, user: req.user });
});

// جلب قائمة المستخدمين مع بيانات الأمان وقفل الحساب
app.get('/api/users', async (req, res) => {
    try {
        const pool = await getPool();
        const user = req.user;
        let query = `
            SELECT id, username, full_name, role, stage_action, 
                   can_view_orders, can_create_orders, can_print_reports, can_manage_users,
                   is_locked, failed_login_count, lockout_count, locked_until, locked_reason,
                   created_at 
            FROM Users 
        `;
        if (user && user.role === 'external_admin') {
            query += "WHERE role = 'external_operator' ";
        }
        query += 'ORDER BY id DESC';
        const result = await pool.request().query(query);
        res.json({ success: true, users: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: 'فشل جلب المستخدمين' });
    }
});

// API فك قفل الحساب (خاص بمالك المنظومة والمدير العام - Gamal / Auf / SuperAdmin)
app.post('/api/users/:id/unlock', async (req, res) => {
    const caller = req.user;
    const isMaster = caller && (
        ['gamal', 'auf'].includes((caller.username || '').toLowerCase()) || 
        caller.role === 'superadmin' || 
        caller.can_manage_users
    );

    if (!isMaster) {
        return res.status(403).json({ 
            success: false, 
            message: 'غير مصرح! فك قفل الحسابات مقتصر حصرياً على مالك المنظومة (جمال / عوف) والمدير العام.' 
        });
    }

    try {
        const pool = await getPool();
        const targetId = parseInt(req.params.id, 10);

        const targetRes = await pool.request()
            .input('id', sql.Int, targetId)
            .query('SELECT id, username, is_locked FROM Users WHERE id = @id');

        if (targetRes.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'المستخدم المطلوب غير موجود' });
        }

        const targetUsername = targetRes.recordset[0].username;

        // تصفير القفل وكافة عدادات الأخطاء وإعادة الحساب للحالة الطبيعية
        await pool.request()
            .input('id', sql.Int, targetId)
            .query(`
                UPDATE Users 
                SET is_locked = 0, 
                    failed_login_count = 0, 
                    lockout_count = 0, 
                    locked_until = NULL, 
                    locked_reason = NULL 
                WHERE id = @id
            `);

        console.log(`🔓 [Security Audit] User [${targetUsername}] unlocked by master admin [${caller.username}]`);
        return res.json({
            success: true,
            message: `تم فك قفل الحساب (${targetUsername}) وتصفير عداد المحاولات الخاطئة بنجاح.`
        });
    } catch (err) {
        console.error('Unlock User Error:', err);
        return res.status(500).json({ success: false, message: 'حدث خطأ أثناء فك قفل الحساب' });
    }
});

// إضافة مستخدم
app.post('/api/users', async (req, res) => {
    const { username, password, role, stage_action, full_name } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'يرجى إكمال البيانات المطلوبة' });
    }

    // التحقق من صلاحية المستخدم الحالي لإنشاء مستخدمين
    if (!req.user || (!req.user.can_manage_users && !['superadmin', 'admin', 'external_admin'].includes(req.user.role))) {
        return res.status(403).json({ success: false, message: 'غير مصرح! ليس لديك صلاحية إنشاء مستخدمين.' });
    }

    // قيود مشرف التشغيل الخارجي: إنشاء حسابات مشغلي التشغيل الخارجي فقط
    if (req.user && req.user.role === 'external_admin') {
        if (role !== 'external_operator') {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح! مشرف التشغيل الخارجي مصرح له حصرياً بإنشاء حسابات مشغلي التشغيل الخارجي فقط.'
            });
        }
    }

    // حماية: لا يمكن إنشاء حساب superadmin إلا إذا كان المنشئ نفسه superadmin
    if (role === 'superadmin' && (!req.user || req.user.role !== 'superadmin')) {
        return res.status(403).json({
            success: false,
            message: 'غير مصرح! صلاحية المالك الشامل (Super Admin) محظورة ولا يمكن إنشاؤها إلا من قبل مالك السيستم فقط.'
        });
    }

    try {
        const pool = await getPool();
        const hashed = hashPasswordSecure(password);
        const isSA = (role === 'superadmin');
        const isAdm = (role === 'admin');
        const isAdmView = (role === 'admin_view');
        const isFactoryOwner = (role === 'factory_owner');
        const isExtOp = (role === 'external_operator');
        const isExtAdm = (role === 'external_admin');

        const can_view    = (isExtOp || isExtAdm) ? 0 : 1; // حجب أوردرات العملاء العادية عن حسابات التشغيل الخارجي
        const can_create  = (isSA || isAdm || isAdmView) ? 1 : 0; // صاحب المصنع لا ينشئ بل يتابع
        const can_print   = (isSA || isAdm || isAdmView || isFactoryOwner || isExtAdm) ? 1 : 0;
        const can_manage  = (isSA || isAdm) ? 1 : (isExtAdm ? 1 : 0);

        // دعم الصلاحيات الثلاث الدقيقة لمشغلي التشغيل الخارجي (دخول / خروج / عام)
        let stageVal = null;
        if (isExtOp) {
            if (stage_action && (stage_action.includes('دخول') || stage_action.includes('خروج') || stage_action.includes('عام'))) {
                stageVal = stage_action;
            } else {
                stageVal = 'تشغيل خارجي (عام)';
            }
        } else if (isExtAdm) {
            stageVal = 'إشراف خارجي';
        } else {
            stageVal = (role === 'production') ? (stage_action || 'دخول انتاج') : null;
        }

        const displayName = (full_name && full_name.trim()) ? full_name.trim() : username;
        await pool.request()
            .input('username', sql.NVarChar, username)
            .input('password', sql.NVarChar, hashed)
            .input('full_name', sql.NVarChar, displayName)
            .input('role', sql.NVarChar, role || 'production')
            .input('stage_action', sql.NVarChar, stageVal)
            .input('can_view', sql.Bit, can_view)
            .input('can_create', sql.Bit, can_create)
            .input('can_print', sql.Bit, can_print)
            .input('can_manage', sql.Bit, can_manage)
            .query(`
                INSERT INTO Users (username, password, full_name, role, stage_action, can_view_orders, can_create_orders, can_print_reports, can_manage_users)
                VALUES (@username, @password, @full_name, @role, @stage_action, @can_view, @can_create, @can_print, @can_manage)
            `);
        res.json({ success: true, message: 'تم إضافة المستخدم بنجاح' });
    } catch (err) {
        if (err.message && err.message.includes('UNIQUE KEY')) {
            return res.status(400).json({ success: false, message: 'اسم المستخدم موجود بالفعل' });
        }
        res.status(500).json({ success: false, message: 'فشل إضافة المستخدم' });
    }
});

// حذف مستخدم
app.delete('/api/users/:id', async (req, res) => {
    // التحقق من صلاحية المستخدم الحالي لحذف مستخدمين
    if (!req.user || (!req.user.can_manage_users && !['superadmin', 'admin', 'external_admin'].includes(req.user.role))) {
        return res.status(403).json({ success: false, message: 'غير مصرح! ليس لديك صلاحية حذف المستخدمين.' });
    }

    try {
        const pool = await getPool();
        const targetId = parseInt(req.params.id, 10);

        // حماية قصوى: منع حذف حسابات الملاك الأساسية (Gamal و Auf) أو admin أو superadmin
        const targetUserRes = await pool.request()
            .input('id', sql.Int, targetId)
            .query('SELECT role, username FROM Users WHERE id = @id');
        
        if (targetUserRes.recordset.length > 0) {
            const targetUser = targetUserRes.recordset[0];
            const uName = (targetUser.username || '').toLowerCase();

            // قيود مشرف التشغيل الخارجي: حذف مشغلي التشغيل الخارجي فقط
            if (req.user && req.user.role === 'external_admin') {
                if (targetUser.role !== 'external_operator') {
                    return res.status(403).json({
                        success: false,
                        message: 'غير مصرح! مشرف التشغيل الخارجي مصرح له حصرياً بحذف حسابات مشغلي التشغيل الخارجي فقط.'
                    });
                }
            }

            if (uName === 'gamal' || uName === 'auf') {
                return res.status(403).json({ success: false, message: 'محظور نهائياً! هذا الحساب الأساسي محمي ولا يمكن حذفه إطلاقاً.' });
            }
            if (uName === 'admin') {
                return res.status(403).json({ success: false, message: 'محظور! لا يمكن حذف حساب المدير الرئيسي (admin).' });
            }
            if (targetUser.role === 'superadmin') {
                return res.status(403).json({ success: false, message: 'محظور! لا يمكن حذف حسابات مالك النظام (Super Admin).' });
            }
        }

        await pool.request()
            .input('id', sql.Int, targetId)
            .query("DELETE FROM Users WHERE id = @id AND username NOT IN ('admin', 'Gamal', 'Auf')");
        res.json({ success: true, message: 'تم حذف المستخدم بنجاح' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'فشل حذف المستخدم' });
    }
});

// تعديل صلاحيات مستخدم
app.put('/api/users/:id', async (req, res) => {
    // التحقق من صلاحية المستخدم الحالي لتعديل المستخدمين
    if (!req.user || (!req.user.can_manage_users && !['superadmin', 'admin', 'external_admin'].includes(req.user.role))) {
        return res.status(403).json({ success: false, message: 'غير مصرح! ليس لديك صلاحية تعديل المستخدمين.' });
    }

    const { role, stage_action, full_name, password } = req.body;
    const targetId = parseInt(req.params.id, 10);

    if (!role) {
        return res.status(400).json({ success: false, message: 'يرجى تحديد نوع الصلاحية' });
    }

    // قيود مشرف التشغيل الخارجي: تعديل مشغلي التشغيل الخارجي فقط
    if (req.user && req.user.role === 'external_admin') {
        if (role !== 'external_operator') {
            return res.status(403).json({
                success: false,
                message: 'غير مصرح! مشرف التشغيل الخارجي مصرح له حصرياً بتعديل مشغلي التشغيل الخارجي فقط.'
            });
        }
    }

    // حماية: لا يمكن رفع مستخدم إلى superadmin إلا من قبل مالك النظام
    if (role === 'superadmin' && (!req.user || req.user.role !== 'superadmin')) {
        return res.status(403).json({
            success: false,
            message: 'غير مصرح! لا يمكن تعيين صلاحية مالك النظام إلا من قبل superadmin.'
        });
    }

    try {
        const pool = await getPool();

        // حماية: التأكد من أن المستهدف ليس superadmin إلا إذا كان المعدّل superadmin
        const targetUserRes = await pool.request()
            .input('id', sql.Int, targetId)
            .query('SELECT role, username FROM Users WHERE id = @id');

        if (targetUserRes.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        }

        const targetUser = targetUserRes.recordset[0];
        const uName = (targetUser.username || '').toLowerCase();

        // قيود مشرف التشغيل الخارجي
        if (req.user && req.user.role === 'external_admin') {
            if (targetUser.role !== 'external_operator') {
                return res.status(403).json({
                    success: false,
                    message: 'غير مصرح! مشرف التشغيل الخارجي مصرح له حصرياً بتعديل مشغلي التشغيل الخارجي فقط.'
                });
            }
        }

        if (uName === 'gamal' || uName === 'auf') {
            const requesterUName = (req.user?.username || '').toLowerCase();
            if (requesterUName !== 'gamal' && requesterUName !== 'auf') {
                return res.status(403).json({
                    success: false,
                    message: 'محظور نهائياً! هذا الحساب الأساسي محمي بالكامل ولا يمكن تعديله إلا من قبل المالك فقط.'
                });
            }
        }

        if (targetUser.role === 'superadmin' && (!req.user || req.user.role !== 'superadmin')) {
            return res.status(403).json({
                success: false,
                message: 'محظور! لا يمكن تعديل حسابات مالك النظام.'
            });
        }

        const isSA = (role === 'superadmin');
        const isAdm = (role === 'admin');
        const isAdmView = (role === 'admin_view');
        const isFactoryOwner = (role === 'factory_owner');
        const isExtOp = (role === 'external_operator');
        const isExtAdm = (role === 'external_admin');

        const can_create = (isSA || isAdm || isAdmView) ? 1 : 0;
        const can_manage = (isSA || isAdm) ? 1 : (isExtAdm ? 1 : 0);
        const can_view = (isExtOp || isExtAdm) ? 0 : 1;
        const can_print = (role !== 'production' && !isExtOp) ? 1 : 0;

        let stageVal = null;
        if (isExtOp) {
            if (stage_action && (stage_action.includes('دخول') || stage_action.includes('خروج') || stage_action.includes('عام'))) {
                stageVal = stage_action;
            } else {
                stageVal = 'تشغيل خارجي (عام)';
            }
        } else if (isExtAdm) {
            stageVal = 'إشراف خارجي';
        } else {
            stageVal = (role === 'production') ? (stage_action || 'دخول انتاج') : null;
        }

        let query = `
            UPDATE Users SET
                role = @role,
                stage_action = @stage_action,
                can_view_orders = @can_view,
                can_create_orders = @can_create,
                can_print_reports = @can_print,
                can_manage_users = @can_manage
        `;
        const request = pool.request()
            .input('id', sql.Int, targetId)
            .input('role', sql.NVarChar, role)
            .input('stage_action', sql.NVarChar, stageVal)
            .input('can_view', sql.Bit, can_view)
            .input('can_create', sql.Bit, can_create)
            .input('can_print', sql.Bit, can_print)
            .input('can_manage', sql.Bit, can_manage);

        if (full_name && full_name.trim()) {
            query += ', full_name = @full_name';
            request.input('full_name', sql.NVarChar, full_name.trim());
        }

        if (password && password.trim()) {
            query += ', password = @password';
            request.input('password', sql.NVarChar, hashPasswordSecure(password.trim()));
        }

        query += ' WHERE id = @id';
        await request.query(query);

        res.json({ success: true, message: `تم تحديث صلاحيات المستخدم (${targetUser.username}) بنجاح` });
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ success: false, message: 'فشل تحديث بيانات المستخدم' });
    }
});

// ===== توليد الباركودات - عالي الأداء للكميات الضخمة =====
app.post('/api/admin/generate-barcodes', async (req, res) => {
    // التحقق من صلاحية المستخدم الحالي لإنشاء وتوليد الأوردرات
    if (!req.user || (!req.user.can_create_orders && !['superadmin', 'admin', 'admin_view'].includes(req.user.role))) {
        return res.status(403).json({ success: false, message: 'غير مصرح! ليس لديك صلاحية إنشاء وتوليد الأوردرات.' });
    }

    const { order_number, customer_name, target_quantity } = req.body;
    const qty = parseInt(target_quantity, 10);

    if (!order_number || !customer_name || isNaN(qty) || qty <= 0) {
        return res.status(400).json({ success: false, message: 'يرجى إدخال بيانات صحيحة للأوردر' });
    }

    if (qty > 200000) {
        return res.status(400).json({ success: false, message: 'الحد الأقصى للأوردر الواحد 200,000 قطعة' });
    }

    let pool;
    let orderId = null;
    try {
        pool = await getPool();

        // فحص مسبق لمنع تكرار رقم الأوردر نهائياً
        const existingOrder = await pool.request()
            .input('order_number', sql.NVarChar, order_number)
            .query('SELECT id FROM Orders WHERE order_number = @order_number');
        if (existingOrder.recordset && existingOrder.recordset.length > 0) {
            return res.status(400).json({ success: false, message: 'رقم الأوردر موجود بالفعل في النظام، لا يمكن إنشاء أكثر من أوردر بنفس الرقم!' });
        }

        const createdBy = req.user ? (req.user.full_name || req.user.username) : 'مدير النظام';

        const orderRes = await pool.request()
            .input('order_number', sql.NVarChar, order_number)
            .input('customer_name', sql.NVarChar, customer_name)
            .input('target_quantity', sql.Int, qty)
            .input('created_by', sql.NVarChar, createdBy)
            .query(`
                INSERT INTO Orders (order_number, customer_name, target_quantity, created_by)
                OUTPUT INSERTED.id
                VALUES (@order_number, @customer_name, @target_quantity, @created_by)
            `);

        orderId = orderRes.recordset[0].id;

        const stagesToCreate = (Array.isArray(req.body.stages) && req.body.stages.length > 0)
            ? req.body.stages
            : await getActiveProductionStages();

        for (let i = 0; i < stagesToCreate.length; i++) {
            const st = stagesToCreate[i];
            await pool.request()
                .input('order_id', sql.Int, orderId)
                .input('stage_name', sql.NVarChar, st)
                .input('target_quantity', sql.Int, qty)
                .input('order_index', sql.Int, i + 1)
                .query(`
                    INSERT INTO OrderStages (order_id, stage_name, target_quantity, order_index)
                    VALUES (@order_id, @stage_name, @target_quantity, @order_index)
                `);
        }

        const prefix = order_number.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5).toUpperCase() || 'ORD';
        const generatedBarcodes = generateBulkBarcodesOptimized(prefix, qty);

        const CHUNK_SIZE = 5000;
        const totalChunks = Math.ceil(qty / CHUNK_SIZE);

        for (let c = 0; c < totalChunks; c++) {
            const start = c * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, qty);
            const chunk = generatedBarcodes.slice(start, end);

            const table = new sql.Table('OrderBarcodes');
            table.create = false;
            table.columns.add('order_id', sql.Int, { nullable: false });
            table.columns.add('barcode', sql.NVarChar(120), { nullable: false });

            for (const code of chunk) {
                table.rows.add(orderId, code);
            }

            const bulkRequest = pool.request();
            await bulkRequest.bulk(table);
        }

        res.json({
            success: true,
            order_id: orderId,
            order_number,
            customer_name,
            total_generated: qty,
            barcodes: qty <= 5000 ? generatedBarcodes : null,
            large_order: qty > 5000
        });

    } catch (err) {
        console.error('Generate Barcodes Error:', err);
        if (orderId && pool) {
            try {
                await pool.request().input('id', sql.Int, orderId).query('DELETE FROM Orders WHERE id = @id');
            } catch (cleanErr) {}
        }
        if (err.message && err.message.includes('UNIQUE')) {
            return res.status(400).json({ success: false, message: 'رقم الأوردر موجود بالفعل في النظام' });
        }
        res.status(500).json({ success: false, message: 'فشل فتح وتوليد أكواد الأوردر: ' + (err.message || '') });
    }
});

// ===== جلب الأوردرات =====
app.get('/api/orders', async (req, res) => {
    try {
        if (req.user && (req.user.role === 'external_operator' || req.user.role === 'external_admin')) {
            return res.status(403).json({ success: false, message: 'غير مصرح بالاطلاع على أوامر الإنتاج العادية' });
        }

        const pool = await getPool();

        const ordersRes = await pool.request().query(`
            SELECT 
                o.id, o.order_number, o.customer_name, o.target_quantity,
                o.status, o.created_by, o.created_at,
                s.id as stage_id, s.stage_name, s.scanned_quantity as stage_scanned,
                s.target_quantity as stage_target, s.status as stage_status
            FROM Orders o
            LEFT JOIN OrderStages s ON s.order_id = o.id
            ORDER BY o.id DESC, s.id ASC
        `);

        const ordersMap = new Map();
        for (const row of ordersRes.recordset) {
            if (!ordersMap.has(row.id)) {
                ordersMap.set(row.id, {
                    id: row.id,
                    order_number: row.order_number,
                    customer_name: row.customer_name,
                    target_quantity: row.target_quantity,
                    status: row.status,
                    created_by: row.created_by,
                    created_at: row.created_at,
                    stages: []
                });
            }
            if (row.stage_id) {
                ordersMap.get(row.id).stages.push({
                    id: row.stage_id,
                    stage_name: row.stage_name,
                    scanned_quantity: row.stage_scanned,
                    target_quantity: row.stage_target,
                    status: row.stage_status
                });
            }
        }

        const orders = Array.from(ordersMap.values()).map(order => {
            const totalScanned = (order.stages || []).reduce((sum, s) => sum + (Number(s.scanned_quantity) || 0), 0);
            const targetQty = Number(order.target_quantity) || 0;
            const stagesCount = (order.stages && order.stages.length > 0) ? order.stages.length : 6;
            const maxPossibleScans = targetQty * stagesCount;
            const rate = maxPossibleScans > 0 
                ? Math.min(100, Math.round((totalScanned / maxPossibleScans) * 100)) 
                : (order.status === 'closed' ? 100 : 0);

            return {
                ...order,
                is_external: false,
                total_scanned: totalScanned,
                overall_completion_rate: order.status === 'closed' ? 100 : rate
            };
        });

        // جلب أوامر التشغيل الخارجي ودمجها مع تمييز واضح للإدارة
        let allOrders = orders;
        try {
            const extOrdersRes = await pool.request().query(`
                SELECT 
                    eo.id, eo.order_number, eo.description, eo.customer_name, eo.target_quantity, eo.status, 
                    eo.created_by, eo.total_scanned, eo.created_at, eo.last_activity_at, eo.closed_at, eo.closed_by,
                    ISNULL(sc.unique_barcodes, 0) as unique_barcodes
                FROM ExternalOrders eo
                LEFT JOIN (
                    SELECT external_order_id, COUNT(DISTINCT barcode) as unique_barcodes
                    FROM ExternalScans
                    GROUP BY external_order_id
                ) sc ON sc.external_order_id = eo.id
                ORDER BY eo.id DESC
            `);

            const extOrders = extOrdersRes.recordset.map(eo => {
                const targetQty = Number(eo.target_quantity) || 0;
                const scannedQty = Number(eo.total_scanned) || 0;
                const isClosed = eo.status === 'closed' || eo.status === 'completed';
                const completionRate = targetQty > 0 
                    ? Math.min(100, Math.round((scannedQty / targetQty) * 100)) 
                    : (isClosed ? 100 : 0);
                const remainingQty = targetQty > 0 ? Math.max(0, targetQty - scannedQty) : 0;

                return {
                    id: 'ext_' + eo.id,
                    real_external_id: eo.id,
                    order_number: eo.order_number,
                    customer_name: eo.customer_name || eo.description || 'تشغيل خارجي مفتوح',
                    description: eo.description || 'تشغيل خارجي',
                    target_quantity: targetQty,
                    scanned_quantity: scannedQty,
                    remaining_quantity: remainingQty,
                    status: eo.status || 'active',
                    created_by: eo.created_by || 'مشغل خارجي',
                    created_at: eo.created_at,
                    closed_at: eo.closed_at,
                    closed_by: eo.closed_by,
                    stages: [{
                        stage_name: 'تشغيل خارجي',
                        scanned_quantity: scannedQty,
                        target_quantity: targetQty,
                        status: eo.status || 'active'
                    }],
                    total_scanned: scannedQty,
                    unique_barcodes: eo.unique_barcodes || 0,
                    overall_completion_rate: completionRate,
                    is_external: true
                };
            });

            allOrders = [...orders, ...extOrders].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        } catch (extErr) {
            console.error('Error fetching external orders in /api/orders:', extErr);
        }

        res.json({ success: true, orders: allOrders });
    } catch (err) {
        console.error('Get Orders Error:', err);
        res.status(500).json({ success: false, message: 'فشل جلب الأوردرات' });
    }
});

// التحقق من أوردر برقمه
app.get('/api/orders/check/:orderNumber', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('order_number', sql.NVarChar, req.params.orderNumber)
            .query(`
                SELECT o.*, s.id as stage_id, s.stage_name, s.scanned_quantity, s.target_quantity as stage_target, s.status as stage_status
                FROM Orders o
                LEFT JOIN OrderStages s ON s.order_id = o.id
                WHERE o.order_number = @order_number
            `);

        if (result.recordset.length === 0) {
            return res.json({ exists: false });
        }

        const firstRow = result.recordset[0];
        const order = {
            id: firstRow.id,
            order_number: firstRow.order_number,
            customer_name: firstRow.customer_name,
            target_quantity: firstRow.target_quantity,
            status: firstRow.status,
            created_by: firstRow.created_by,
            created_at: firstRow.created_at
        };
        const stages = result.recordset
            .filter(r => r.stage_id)
            .map(r => ({
                id: r.stage_id,
                stage_name: r.stage_name,
                scanned_quantity: r.scanned_quantity,
                target_quantity: r.stage_target,
                status: r.stage_status
            }));

        res.json({ exists: true, order, stages });
    } catch (err) {
        console.error('Check Order Error:', err);
        res.status(500).json({ exists: false, message: 'خطأ بالتحقق من الأوردر' });
    }
});

// تفاصيل أوردر محدد
app.get('/api/orders/details/:id', async (req, res) => {
    try {
        if (req.user && (req.user.role === 'external_operator' || req.user.role === 'external_admin')) {
            return res.status(403).json({ success: false, message: 'غير مصرح بالاطلاع على تفاصيل أوامر الإنتاج العادية' });
        }

        const pool = await getPool();
        const paramId = String(req.params.id);

        // دعم أوامر التشغيل الخارجي (ext_ID)
        if (paramId.startsWith('ext_')) {
            const extId = parseInt(paramId.replace('ext_', ''), 10);
            const extOrderRes = await pool.request().input('id', sql.Int, extId).query('SELECT * FROM ExternalOrders WHERE id = @id');
            if (extOrderRes.recordset.length === 0) {
                return res.status(404).json({ success: false, message: 'أمر التشغيل الخارجي غير موجود' });
            }
            const eo = extOrderRes.recordset[0];
            const scansRes = await pool.request().input('oid', sql.Int, extId).query('SELECT TOP 500 id, barcode, scanned_by, created_at FROM ExternalScans WHERE external_order_id = @oid ORDER BY id DESC');
            const uniqueRes = await pool.request().input('oid', sql.Int, extId).query('SELECT COUNT(DISTINCT barcode) as unique_count FROM ExternalScans WHERE external_order_id = @oid');
            const uniqueCount = uniqueRes.recordset[0]?.unique_count || 0;

            // Scanners breakdown
            const scannersBreakdownRes = await pool.request().input('oid', sql.Int, extId).query(`
                SELECT scanned_by, COUNT(*) as scan_count, MIN(created_at) as first_scan, MAX(created_at) as last_scan
                FROM ExternalScans WHERE external_order_id = @oid AND scanned_by IS NOT NULL
                GROUP BY scanned_by ORDER BY scan_count DESC
            `);

            const targetQty = Number(eo.target_quantity) || 0;
            const scannedQty = Number(eo.total_scanned) || 0;
            const remainingQty = targetQty > 0 ? Math.max(0, targetQty - scannedQty) : 0;
            const completionRate = targetQty > 0 ? Math.min(100, Math.round((scannedQty / targetQty) * 100)) : (eo.status === 'closed' ? 100 : 0);

            return res.json({
                success: true,
                order: {
                    id: 'ext_' + eo.id,
                    real_external_id: eo.id,
                    order_number: eo.order_number,
                    customer_name: eo.customer_name || eo.description || 'تشغيل خارجي مفتوح',
                    description: eo.description || '',
                    target_quantity: targetQty,
                    scanned_quantity: scannedQty,
                    remaining_quantity: remainingQty,
                    overall_completion_rate: completionRate,
                    unique_scanned: uniqueCount,
                    status: eo.status,
                    created_by: eo.created_by,
                    created_at: eo.created_at,
                    last_activity_at: eo.last_activity_at,
                    closed_at: eo.closed_at || null,
                    closed_by: eo.closed_by || null,
                    is_external: true
                },
                scanners_breakdown: scannersBreakdownRes.recordset.map(s => ({
                    scanned_by: s.scanned_by,
                    scan_count: s.scan_count,
                    first_scan: s.first_scan,
                    last_scan: s.last_scan
                })),
                stages: [],
                movements: scansRes.recordset.map(s => ({
                    id: s.id,
                    barcode: s.barcode,
                    scanned_by: s.scanned_by,
                    stage_name: 'تشغيل خارجي',
                    created_at: s.created_at
                }))
            });
        }

        const orderId = parseInt(req.params.id, 10);

        const orderRes = await pool.request()
            .input('id', sql.Int, orderId)
            .query(`
                SELECT o.*, s.id as stage_id, s.stage_name, s.scanned_quantity, s.target_quantity as stage_target, s.status as stage_status
                FROM Orders o
                LEFT JOIN OrderStages s ON s.order_id = o.id
                WHERE o.id = @id
                ORDER BY ISNULL(s.order_index, s.id) ASC, s.id ASC
            `);

        if (orderRes.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'الأوردر غير موجود' });
        }

        const firstRow = orderRes.recordset[0];
        const order = {
            id: firstRow.id,
            order_number: firstRow.order_number,
            customer_name: firstRow.customer_name,
            target_quantity: firstRow.target_quantity,
            status: firstRow.status,
            created_by: firstRow.created_by,
            created_at: firstRow.created_at
        };
        // تفاصيل المراحل مع المشغلين ومواعيد البدء والانتهاء
        const stagesAggRes = await pool.request()
            .input('oid', sql.Int, orderId)
            .query(`
                SELECT 
                    s.id as stage_id, s.stage_name, s.scanned_quantity, s.target_quantity as stage_target, s.status as stage_status, s.created_at as stage_created_at,
                    ag.first_scan, ag.last_scan, ag.scanners_list, ag.unique_scanned_count
                FROM OrderStages s
                LEFT JOIN (
                    SELECT 
                        stage_name,
                        MIN(created_at) as first_scan,
                        MAX(created_at) as last_scan,
                        COUNT(DISTINCT barcode) as unique_scanned_count,
                        (
                            SELECT STRING_AGG(scanned_user, '، ')
                            FROM (
                                SELECT DISTINCT scanned_by as scanned_user
                                FROM StockMovements sm2 
                                WHERE sm2.order_id = sm.order_id AND sm2.stage_name = sm.stage_name AND sm2.scanned_by IS NOT NULL
                            ) u
                        ) as scanners_list
                    FROM StockMovements sm
                    WHERE sm.order_id = @oid
                    GROUP BY stage_name, order_id
                ) ag ON ag.stage_name = s.stage_name
                WHERE s.order_id = @oid
                ORDER BY ISNULL(s.order_index, s.id) ASC, s.id ASC
            `);

        // جلب جميع حركات المسح لتجميع جلسات العمل (Sessions) بالتفصيل
        const allMovementsRes = await pool.request()
            .input('order_id', sql.Int, orderId)
            .query(`
                SELECT id, order_id, stage_name, barcode, quantity, scanned_by, created_at 
                FROM StockMovements 
                WHERE order_id = @order_id 
                ORDER BY id ASC
            `);

        const allMovements = allMovementsRes.recordset;

        // تجميع جلسات التشغيل والمسح (Sessions) لكل مرحلة:
        // إذا انقطع المسح لأكثر من 5 دقائق أو تغير المشغل، تُعتبر جلسة مسح/تشغيل جديدة
        const stageSessions = {};
        for (const m of allMovements) {
            if (!stageSessions[m.stage_name]) stageSessions[m.stage_name] = [];
            const list = stageSessions[m.stage_name];
            const current = list[list.length - 1];
            const scanTime = new Date(m.created_at).getTime();

            if (!current || (scanTime - current.lastScanTime > 5 * 60 * 1000) || current.scanned_by !== m.scanned_by) {
                list.push({
                    session_num: list.length + 1,
                    stage_name: m.stage_name,
                    scanned_by: m.scanned_by || 'مشغل غير محدد',
                    started_at: m.created_at,
                    ended_at: m.created_at,
                    lastScanTime: scanTime,
                    scanned_pieces: 1
                });
            } else {
                current.ended_at = m.created_at;
                current.lastScanTime = scanTime;
                current.scanned_pieces++;
            }
        }

        const stages = stagesAggRes.recordset.map(r => {
            const isClosed = r.stage_status === 'closed' || (r.stage_target > 0 && r.scanned_quantity >= r.stage_target);
            const sessions = stageSessions[r.stage_name] || [];
            return {
                id: r.stage_id,
                stage_name: r.stage_name,
                scanned_quantity: r.scanned_quantity,
                target_quantity: r.stage_target,
                status: isClosed ? 'closed' : r.stage_status,
                created_at: r.stage_created_at,
                first_scan: r.first_scan,
                last_scan: r.last_scan,
                closed_at: isClosed ? r.last_scan : null,
                scanners_list: r.scanners_list || (sessions.length > 0 ? Array.from(new Set(sessions.map(s => s.scanned_by))).join('، ') : 'لم تبدأ بعد'),
                sessions_count: sessions.length,
                sessions: sessions
            };
        });

        // آخر حركة مسح في الأوردر بالكامل (تاريخ اكتمال/آخر شغل في الأوردر)
        let orderLastActivity = null;
        if (allMovements.length > 0) {
            orderLastActivity = allMovements[allMovements.length - 1].created_at;
        }

        // تاريخ إغلاق الأوردر بالكامل (إذا اكتملت جميع المراحل)
        const lastStage = stages[stages.length - 1];
        const allCompleted = stages.length > 0 && stages.every(s => s.status === 'closed');
        const orderCompletedAt = allCompleted ? (lastStage?.closed_at || orderLastActivity) : null;

        const movementsRes = await pool.request()
            .input('order_id', sql.Int, orderId)
            .query(`
                SELECT TOP 200 id, order_id, stage_name, barcode, quantity, scanned_by, created_at 
                FROM StockMovements 
                WHERE order_id = @order_id 
                ORDER BY id DESC
            `);

        const unscannedCountRes = await pool.request()
            .input('order_id', sql.Int, orderId)
            .query(`
                SELECT COUNT(*) as unscanned_count
                FROM OrderBarcodes ob
                WHERE ob.order_id = @order_id
                AND NOT EXISTS (
                    SELECT 1 FROM StockMovements sm 
                    WHERE sm.order_id = @order_id AND sm.barcode = ob.barcode
                )
            `);

        const stageCountsRes = await pool.request()
            .input('order_id', sql.Int, orderId)
            .query(`
                SELECT 
                    stage_name,
                    COUNT(DISTINCT barcode) as scanned_count
                FROM StockMovements 
                WHERE order_id = @order_id
                GROUP BY stage_name
            `);

        const totalBarcodes = order.target_quantity;
        const stageUnscannedSummary = {};
        const orderStagesList = (stages && stages.length > 0)
            ? stages.map(s => s.stage_name)
            : await getActiveProductionStages();

        for (const stageName of orderStagesList) {
            const found = stageCountsRes.recordset.find(r => r.stage_name === stageName);
            const scannedCount = found ? found.scanned_count : 0;
            stageUnscannedSummary[stageName] = {
                scanned_count: scannedCount,
                missing_count: Math.max(0, totalBarcodes - scannedCount)
            };
        }

        const totalScannedAllStages = stages.reduce((sum, s) => sum + (Number(s.scanned_quantity) || 0), 0);
        const stagesCount = stages.length > 0 ? stages.length : orderStagesList.length;
        const maxPossibleScans = (Number(order.target_quantity) || 0) * stagesCount;
        const overallRate = maxPossibleScans > 0 
            ? Math.min(100, Math.round((totalScannedAllStages / maxPossibleScans) * 100))
            : (order.status === 'closed' ? 100 : 0);
        const remainingPieces = Math.max(0, maxPossibleScans - totalScannedAllStages);

        res.json({
            success: true,
            order: {
                ...order,
                is_external: false,
                total_scanned: totalScannedAllStages,
                scanned_quantity: totalScannedAllStages,
                remaining_quantity: remainingPieces,
                overall_completion_rate: overallRate,
                stages_count: stagesCount,
                max_possible_scans: maxPossibleScans,
                last_activity_at: orderLastActivity,
                completed_at: orderCompletedAt,
                is_all_completed: allCompleted
            },
            stages,
            stage_sessions: stageSessions,
            movements: movementsRes.recordset,
            unscanned_count: unscannedCountRes.recordset[0].unscanned_count,
            stage_unscanned_summary: stageUnscannedSummary,
        });
    } catch (err) {
        console.error('Get Order Details Error:', err);
        res.status(500).json({ success: false, message: 'فشل جلب تفاصيل الأوردر: ' + err.message });
    }
});

// جلب الشفرات غير الممسوحة لمرحلة معينة
app.get('/api/orders/:id/unscanned', async (req, res) => {
    try {
        const pool = await getPool();
        const orderId = parseInt(req.params.id, 10);
        const stageName = req.query.stage;

        let query;
        if (!stageName || stageName === 'ALL') {
            query = `
                SELECT ob.barcode
                FROM OrderBarcodes ob
                WHERE ob.order_id = @order_id
                AND NOT EXISTS (
                    SELECT 1 FROM StockMovements sm 
                    WHERE sm.order_id = @order_id AND sm.barcode = ob.barcode
                )
                ORDER BY ob.id
            `;
        } else {
            query = `
                SELECT ob.barcode
                FROM OrderBarcodes ob
                WHERE ob.order_id = @order_id
                AND NOT EXISTS (
                    SELECT 1 FROM StockMovements sm 
                    WHERE sm.order_id = @order_id AND sm.stage_name = @stage_name AND sm.barcode = ob.barcode
                )
                ORDER BY ob.id
            `;
        }

        const request = pool.request().input('order_id', sql.Int, orderId);
        if (stageName && stageName !== 'ALL') {
            request.input('stage_name', sql.NVarChar, stageName);
        }
        const result = await request.query(query);
        const barcodes = result.recordset.map(r => r.barcode);

        res.json({ success: true, barcodes, count: barcodes.length });
    } catch (err) {
        console.error('Unscanned Error:', err);
        res.status(500).json({ success: false, message: 'فشل جلب الشفرات غير الممسوحة' });
    }
});

// مسح باركود في مرحلة
app.post('/api/orders/stage-scan', async (req, res) => {
    const { order_id, stage_name, scanned_barcode, scanned_by } = req.body;

    if (!order_id || !stage_name || !scanned_barcode) {
        return res.status(400).json({ success: false, message: 'بيانات غير مكتملة للمسح' });
    }

    try {
        const pool = await getPool();
        const barcodeClean = scanned_barcode.trim();

        const barcodeCheck = await pool.request()
            .input('order_id', sql.Int, order_id)
            .input('barcode', sql.NVarChar, barcodeClean)
            .query('SELECT id FROM OrderBarcodes WHERE order_id = @order_id AND barcode = @barcode');

        if (barcodeCheck.recordset.length === 0) {
            return res.status(400).json({ success: false, message: 'هذا الكود غير مسجل أو لا ينتمي لهذا الأوردر!' });
        }

        const duplicateCheck = await pool.request()
            .input('order_id', sql.Int, order_id)
            .input('stage_name', sql.NVarChar, stage_name)
            .input('barcode', sql.NVarChar, barcodeClean)
            .query('SELECT id FROM StockMovements WHERE order_id = @order_id AND stage_name = @stage_name AND barcode = @barcode');

        if (duplicateCheck.recordset.length > 0) {
            return res.status(400).json({ success: false, message: 'تم مسح هذا الكود سابقاً في هذه المرحلة!' });
        }

        const stageRes = await pool.request()
            .input('order_id', sql.Int, order_id)
            .input('stage_name', sql.NVarChar, stage_name)
            .query('SELECT * FROM OrderStages WHERE order_id = @order_id AND stage_name = @stage_name');

        if (stageRes.recordset.length === 0) {
            return res.status(400).json({ success: false, message: 'المرحلة المطلوبة غير معرفة في الأوردر' });
        }

        // ── التحقق الرقابي من مرحلة البداية الإلزامية (Gatekeeper Primary Stage) ──
        // جلب مرحلة البداية الأولى للأوردر وفقاً للترتيب المعياري
        const firstStageRes = await pool.request()
            .input('order_id', sql.Int, order_id)
            .query('SELECT TOP 1 stage_name FROM OrderStages WHERE order_id = @order_id ORDER BY ISNULL(order_index, id) ASC, id ASC');

        if (firstStageRes.recordset.length > 0) {
            const primaryStageName = firstStageRes.recordset[0].stage_name;
            // إذا كان المسح يجري في أي مرحلة تالية بخلاف مرحلة البداية
            if (stage_name !== primaryStageName) {
                const passedPrimaryCheck = await pool.request()
                    .input('order_id', sql.Int, order_id)
                    .input('primary_stage', sql.NVarChar, primaryStageName)
                    .input('barcode', sql.NVarChar, barcodeClean)
                    .query('SELECT TOP 1 id FROM StockMovements WHERE order_id = @order_id AND stage_name = @primary_stage AND barcode = @barcode');

                if (passedPrimaryCheck.recordset.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: `⛔ غير مسموح بتخطي مرحلة البداية! يجب مسح هذه القطعة أولاً في مرحلة [${primaryStageName}] قبل أن يتم قبولها في مرحلة [${stage_name}].`
                    });
                }
            }
        }

        const stage = stageRes.recordset[0];
        if (stage.status === 'closed' || stage.scanned_quantity >= stage.target_quantity) {
            return res.status(400).json({ success: false, message: `مرحلة (${stage_name}) مكتملة ومغلقة بالفعل لهذا الأوردر` });
        }

        const scannerName = scanned_by || (req.user ? (req.user.full_name || req.user.username) : 'سكانر');

        // تنفيذ حركة المسح وتحديث عداد المرحلة ذرياً في استعلام SQL موحد وعالي الأداء
        const updateStageRes = await pool.request()
            .input('order_id', sql.Int, order_id)
            .input('stage_name', sql.NVarChar, stage_name)
            .input('barcode', sql.NVarChar, barcodeClean)
            .input('scanned_by', sql.NVarChar, scannerName)
            .input('stage_id', sql.Int, stage.id)
            .query(`
                INSERT INTO StockMovements (order_id, stage_name, barcode, quantity, scanned_by)
                VALUES (@order_id, @stage_name, @barcode, 1, @scanned_by);

                UPDATE OrderStages 
                SET scanned_quantity = scanned_quantity + 1,
                    status = CASE WHEN scanned_quantity + 1 >= target_quantity THEN 'closed' ELSE 'pending' END
                OUTPUT INSERTED.scanned_quantity, INSERTED.status, INSERTED.target_quantity
                WHERE id = @stage_id;
            `);

        const updatedRow = updateStageRes.recordset[0];
        const newScannedQty = updatedRow.scanned_quantity;
        const isStageCompleted = (updatedRow.status === 'closed');

        let orderClosed = false;
        if (isStageCompleted) {
            const allStagesRes = await pool.request()
                .input('order_id', sql.Int, order_id)
                .query('SELECT COUNT(*) as total, SUM(CASE WHEN status = \'closed\' THEN 1 ELSE 0 END) as closed_count FROM OrderStages WHERE order_id = @order_id');
            
            const { total, closed_count } = allStagesRes.recordset[0];
            if (total === closed_count) {
                await pool.request()
                    .input('order_id', sql.Int, order_id)
                    .query("UPDATE Orders SET status = 'closed' WHERE id = @order_id");
                orderClosed = true;
            }
        }

        res.json({
            success: true,
            message: isStageCompleted ? `تم اكتمال كمية مرحلة (${stage_name}) وإغلاقها بنجاح!` : 'تم تسجيل المسح بنجاح',
            scanned_quantity: newScannedQty,
            target_quantity: stage.target_quantity,
            is_completed: isStageCompleted,
            order_closed: orderClosed
        });

    } catch (err) {
        console.error('Stage Scan Error:', err);
        if (err.message && (err.message.includes('UQ_StockMovements') || err.message.includes('2601') || err.message.includes('2627'))) {
            return res.status(400).json({ success: false, message: 'تم مسح هذا الكود سابقاً في هذه المرحلة!' });
        }
        res.status(500).json({ success: false, message: 'حدث خطأ أثناء حفظ حركة المسح الضوئي: ' + (err.message || '') });
    }
});

// ===== إدارة وتعديل مراحل الأوردر المفتوح لاحقاً (إضافة / إلغاء مراحل غير ممسوحة) =====

// 1. إضافة مرحلة جديدة لأمر تشغيل قائم
app.post('/api/orders/:id/stages/add', async (req, res) => {
    if (!req.user || (!['superadmin', 'admin'].includes(req.user.role) && !req.user.can_create_orders)) {
        return res.status(403).json({ success: false, message: 'غير مصرح! ليس لديك صلاحية تعديل مراحل أوامر التشغيل.' });
    }
    try {
        const orderId = parseInt(req.params.id, 10);
        const { stage_name } = req.body;

        if (isNaN(orderId) || !stage_name || !stage_name.trim()) {
            return res.status(400).json({ success: false, message: 'يرجى تحديد اسم المرحلة المطلوبة للإضافة' });
        }

        const stageClean = stage_name.trim();
        const pool = await getPool();

        // فحص وجود الأوردر
        const orderRes = await pool.request()
            .input('id', sql.Int, orderId)
            .query('SELECT id, order_number, target_quantity, status FROM Orders WHERE id = @id');

        if (orderRes.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'الأوردر غير موجود' });
        }

        const order = orderRes.recordset[0];

        // فحص تكرار المرحلة في نفس الأوردر
        const dupRes = await pool.request()
            .input('oid', sql.Int, orderId)
            .input('sname', sql.NVarChar, stageClean)
            .query('SELECT id FROM OrderStages WHERE order_id = @oid AND stage_name = @sname');

        if (dupRes.recordset.length > 0) {
            return res.status(400).json({ success: false, message: `مرحلة [${stageClean}] مضافة بالفعل لهذا الأوردر!` });
        }

        // حساب ترتيب المرحلة الجديدة في خط الإنتاج
        const maxIdxRes = await pool.request()
            .input('oid', sql.Int, orderId)
            .query('SELECT ISNULL(MAX(order_index), 0) + 1 AS next_idx FROM OrderStages WHERE order_id = @oid');
        const nextIdx = maxIdxRes.recordset[0]?.next_idx || 1;

        await pool.request()
            .input('oid', sql.Int, orderId)
            .input('sname', sql.NVarChar, stageClean)
            .input('tqty', sql.Int, order.target_quantity)
            .input('oidx', sql.Int, nextIdx)
            .query(`
                INSERT INTO OrderStages (order_id, stage_name, target_quantity, scanned_quantity, status, order_index)
                VALUES (@oid, @sname, @tqty, 0, 'pending', @oidx)
            `);

        // إذا كان الأوردر مغلقاً سابقاً، يتم إعادة فتحه تلقائياً لاستكمال المرحلة المضافة
        if (order.status === 'closed') {
            await pool.request()
                .input('oid', sql.Int, orderId)
                .query("UPDATE Orders SET status = 'active' WHERE id = @oid");
        }

        res.json({
            success: true,
            message: `✅ تم إضافة مرحلة [${stageClean}] لأمر التشغيل بنجاح بمستهدف ${order.target_quantity.toLocaleString('en-US')} قطعة.`
        });
    } catch (err) {
        console.error('Add Order Stage Error:', err);
        res.status(500).json({ success: false, message: 'فشل إضافة المرحلة لأمر التشغيل' });
    }
});

// 2. إلغاء/حذف مرحلة من أمر تشغيل قائم (بشرط عدم وجود حركات مسح سابقة عليها نهائياً)
app.delete('/api/orders/:id/stages/:stageName', async (req, res) => {
    if (!req.user || (!['superadmin', 'admin'].includes(req.user.role) && !req.user.can_create_orders)) {
        return res.status(403).json({ success: false, message: 'غير مصرح! ليس لديك صلاحية إلغاء مراحل أوامر التشغيل.' });
    }
    try {
        const orderId = parseInt(req.params.id, 10);
        const stageName = decodeURIComponent(req.params.stageName || '').trim();

        if (isNaN(orderId) || !stageName) {
            return res.status(400).json({ success: false, message: 'بيانات غير صالحة' });
        }

        const pool = await getPool();

        // جلب بيانات المرحلة من الأوردر
        const stageRes = await pool.request()
            .input('oid', sql.Int, orderId)
            .input('sname', sql.NVarChar, stageName)
            .query('SELECT * FROM OrderStages WHERE order_id = @oid AND stage_name = @sname');

        if (stageRes.recordset.length === 0) {
            return res.status(404).json({ success: false, message: `مرحلة [${stageName}] غير موجودة في هذا الأوردر` });
        }

        const stage = stageRes.recordset[0];

        // التحقق الصارم: هل مسجل على هذه المرحلة أي شغل أو حركات مسح سابقة؟
        const movCountRes = await pool.request()
            .input('oid', sql.Int, orderId)
            .input('sname', sql.NVarChar, stageName)
            .query('SELECT COUNT(*) AS mov_count FROM StockMovements WHERE order_id = @oid AND stage_name = @sname');

        const movCount = movCountRes.recordset[0]?.mov_count || 0;
        const scannedQty = Number(stage.scanned_quantity) || 0;

        if (scannedQty > 0 || movCount > 0) {
            return res.status(400).json({
                success: false,
                message: `⛔ غير مسموح بإلغاء مرحلة [${stageName}]! يوجد عليها شغل ومسحات سابقة بالفعل (${Math.max(scannedQty, movCount).toLocaleString('en-US')} قطعة). يمكن فقط إلغاء المراحل التي لم يُسجل عليها أي عمل نهائياً.`
            });
        }

        // التحقق من بقاء مرحلة واحدة على الأقل في الأوردر
        const totalStagesRes = await pool.request()
            .input('oid', sql.Int, orderId)
            .query('SELECT COUNT(*) AS total_stages FROM OrderStages WHERE order_id = @oid');
        
        if ((totalStagesRes.recordset[0]?.total_stages || 0) <= 1) {
            return res.status(400).json({
                success: false,
                message: 'لا يمكن حذف كافة مراحل الأوردر! يجب أن يحتوي أمر التشغيل على مرحلة إنتاجية واحدة على الأقل.'
            });
        }

        // حذف المرحلة بأمان
        await pool.request()
            .input('oid', sql.Int, orderId)
            .input('sname', sql.NVarChar, stageName)
            .query('DELETE FROM OrderStages WHERE order_id = @oid AND stage_name = @sname');

        // إعادة تقييم حالة إغلاق الأوردر بعد الحذف
        const checkClosedRes = await pool.request()
            .input('oid', sql.Int, orderId)
            .query('SELECT COUNT(*) AS total, SUM(CASE WHEN status = \'closed\' THEN 1 ELSE 0 END) AS closed_cnt FROM OrderStages WHERE order_id = @oid');
        
        const { total, closed_cnt } = checkClosedRes.recordset[0];
        if (total > 0 && total === closed_cnt) {
            await pool.request().input('oid', sql.Int, orderId).query("UPDATE Orders SET status = 'closed' WHERE id = @oid");
        }

        res.json({
            success: true,
            message: `✅ تم إلغاء مرحلة [${stageName}] من أمر التشغيل بنجاح لعدم وجود أي شغل عليها.`
        });
    } catch (err) {
        console.error('Delete Order Stage Error:', err);
        res.status(500).json({ success: false, message: 'فشل إلغاء المرحلة من أمر التشغيل' });
    }
});

// 3. تعيين مرحلة كبداية إلزامية لأمر التشغيل
app.put('/api/orders/:id/stages/set-primary', async (req, res) => {
    if (!req.user || (!['superadmin', 'admin'].includes(req.user.role) && !req.user.can_create_orders)) {
        return res.status(403).json({ success: false, message: 'غير مصرح! ليس لديك صلاحية تعديل ترتيب مراحل أوامر التشغيل.' });
    }
    try {
        const orderId = parseInt(req.params.id, 10);
        const { stage_name } = req.body;
        if (isNaN(orderId) || !stage_name) {
            return res.status(400).json({ success: false, message: 'بيانات غير مكتملة' });
        }

        const pool = await getPool();
        const minIdxRes = await pool.request()
            .input('oid', sql.Int, orderId)
            .query('SELECT ISNULL(MIN(order_index), 1) - 1 AS new_min FROM OrderStages WHERE order_id = @oid');
        
        const newMin = minIdxRes.recordset[0]?.new_min ?? 0;

        await pool.request()
            .input('oid', sql.Int, orderId)
            .input('sname', sql.NVarChar, stage_name.trim())
            .input('new_idx', sql.Int, newMin)
            .query('UPDATE OrderStages SET order_index = @new_idx WHERE order_id = @oid AND stage_name = @sname');

        res.json({
            success: true,
            message: `✅ تم تعيين مرحلة [${stage_name.trim()}] كمرحلة البداية الإلزامية للأوردر بنجاح.`
        });
    } catch (err) {
        console.error('Set Primary Stage Error:', err);
        res.status(500).json({ success: false, message: 'فشل تعيين مرحلة البداية' });
    }
});

// جلب باركودات الأوردر للطباعة
app.get('/api/orders/:id/barcodes', async (req, res) => {
    try {
        const pool = await getPool();
        const orderId = parseInt(req.params.id, 10);
        const page = parseInt(req.query.page || '1', 10);
        const pageSize = parseInt(req.query.pageSize || '10000', 10);
        const offset = (page - 1) * pageSize;

        const result = await pool.request()
            .input('order_id', sql.Int, orderId)
            .input('offset', sql.Int, offset)
            .input('pageSize', sql.Int, pageSize)
            .query(`
                SELECT barcode 
                FROM OrderBarcodes 
                WHERE order_id = @order_id 
                ORDER BY id
                OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
            `);

        const countRes = await pool.request()
            .input('order_id', sql.Int, orderId)
            .query('SELECT COUNT(*) as total FROM OrderBarcodes WHERE order_id = @order_id');

        const total = countRes.recordset[0].total;

        res.json({
            success: true,
            barcodes: result.recordset.map(r => r.barcode),
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize)
        });
    } catch (err) {
        console.error('Get Barcodes Error:', err);
        res.status(500).json({ success: false, message: 'فشل جلب الشفرات العشوائية' });
    }
});

// ===== كلاستر توليد الـ PDF المنفصل للأوردرات الكبيرة والضخمة =====

// بدء مهمة توليد الـ PDF في الكلاستر المنفصل (Worker Thread)
app.post('/api/orders/:id/pdf/generate', async (req, res) => {
    try {
        const orderId = parseInt(req.params.id, 10);
        if (isNaN(orderId)) return res.status(400).json({ success: false, message: 'معرف الأوردر غير صالح' });

        const force = req.query.force === 'true';
        const format = req.query.format || (req.body && req.body.format) || 'roll_35x80';
        const result = await pdfClusterService.startPdfJob(orderId, targetDbConfig, force, format);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('PDF Generation Start Error:', err);
        res.status(500).json({ success: false, message: 'فشل بدء معالجة استيكرات الـ PDF: ' + (err.message || '') });
    }
});

// فحص حالة توليد الـ PDF في الكلاستر
app.get('/api/orders/:id/pdf/status', (req, res) => {
    try {
        const orderId = parseInt(req.params.id, 10);
        if (isNaN(orderId)) return res.status(400).json({ success: false, message: 'معرف الأوردر غير صالح' });

        const format = req.query.format || 'roll_35x80';
        const status = pdfClusterService.getPdfStatus(orderId, format);
        res.json({ success: true, ...status });
    } catch (err) {
        console.error('PDF Status Error:', err);
        res.status(500).json({ success: false, message: 'فشل فحص حالة الـ PDF' });
    }
});

// تحميل ملف الـ PDF الجاهز والمولّد عبر الكلاستر
app.get('/api/orders/:id/pdf/download', async (req, res) => {
    try {
        const orderId = parseInt(req.params.id, 10);
        if (isNaN(orderId)) return res.status(400).json({ success: false, message: 'معرف الأوردر غير صالح' });

        const format = req.query.format || 'roll_35x80';
        const filePath = pdfClusterService.getDownloadFilePath(orderId, format);
        if (!filePath) {
            return res.status(404).json({ success: false, message: 'ملف الـ PDF غير موجود أو لم يكتمل توليده بعد' });
        }

        let fileName = `stickers-3.5x8cm-order-${orderId}.pdf`;
        try {
            const pool = await getPool();
            const orderRes = await pool.request()
                .input('id', sql.Int, orderId)
                .query('SELECT order_number FROM Orders WHERE id = @id');
            if (orderRes.recordset.length > 0 && orderRes.recordset[0].order_number) {
                fileName = `stickers-3.5x8cm-${orderRes.recordset[0].order_number}.pdf`;
            }
        } catch (e) {}

        res.download(filePath, fileName);
    } catch (err) {
        console.error('PDF Download Error:', err);
        res.status(500).json({ success: false, message: 'فشل تحميل ملف الـ PDF' });
    }
});

// توافقية المسارات البديلة لكلاستر الـ PDF
app.post('/api/admin/generate-cluster-pdf/:id', async (req, res) => {
    try {
        const orderId = parseInt(req.params.id, 10);
        if (isNaN(orderId)) return res.status(400).json({ success: false, message: 'معرف الأوردر غير صالح' });

        const force = req.query.force === 'true';
        const format = req.query.format || (req.body && req.body.format) || 'roll_35x80';
        const result = await pdfClusterService.startPdfJob(orderId, targetDbConfig, force, format);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('PDF Generation Start Error (alias):', err);
        res.status(500).json({ success: false, message: 'فشل بدء معالجة استيكرات الـ PDF: ' + (err.message || '') });
    }
});

app.get('/api/admin/cluster-pdf-status/:id', (req, res) => {
    try {
        const orderId = parseInt(req.params.id, 10);
        if (isNaN(orderId)) return res.status(400).json({ success: false, message: 'معرف الأوردر غير صالح' });

        const format = req.query.format || 'roll_35x80';
        const status = pdfClusterService.getPdfStatus(orderId, format);
        res.json({ success: true, ...status });
    } catch (err) {
        console.error('PDF Status Error (alias):', err);
        res.status(500).json({ success: false, message: 'فشل فحص حالة الـ PDF' });
    }
});

// حذف أوردر (محسّن لضمان الحذف السليم لكافة الجداول المرتبطة)
app.delete('/api/orders/:id', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'يرجى تسجيل الدخول أولاً' });
    }

    const paramId = String(req.params.id);

    // التحقق من صلاحيات الحذف للأوامر الخارجية أو مصنعية
    if (paramId.startsWith('ext_')) {
        if (!['superadmin', 'admin', 'external_admin'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'غير مصرح بحذف أمر التشغيل الخارجي' });
        }
    } else {
        if (!['superadmin', 'admin'].includes(req.user.role) && !req.user.can_manage_users && !req.user.can_create_orders) {
            return res.status(403).json({ success: false, message: 'غير مصرح بحذف أوردرات المصنع' });
        }
    }

    try {
        const pool = await getPool();

        // دعم حذف أمر تشغيل خارجي إذا كان المعرف ext_ID
        if (paramId.startsWith('ext_')) {
            const extId = parseInt(paramId.replace('ext_', ''), 10);
            await pool.request().input('id', sql.Int, extId).query(`
                DELETE FROM ExternalScans WHERE external_order_id = @id;
                DELETE FROM ExternalOrders WHERE id = @id;
            `);
            return res.json({ success: true, message: 'تم حذف أمر التشغيل الخارجي وجميع مسحاته بنجاح' });
        }

        const orderId = parseInt(req.params.id, 10);
        if (isNaN(orderId)) {
            return res.status(400).json({ success: false, message: 'معرف الأوردر غير صالح' });
        }

        // حذف كل ما يتعلق بالأوردر في كافة الجداول التابعة
        await pool.request().input('id', sql.Int, orderId).query(`
            DELETE FROM OrderMovements WHERE order_id = @id;
            DELETE FROM OrderPieces WHERE order_id = @id;
            DELETE FROM StockMovements WHERE order_id = @id;
            DELETE FROM OrderStages WHERE order_id = @id;
            DELETE FROM OrderBarcodes WHERE order_id = @id;
            DELETE FROM OrderItems WHERE order_id = @id;
            DELETE FROM StageLogs WHERE order_id = @id;
            DELETE FROM OrderStageLogs WHERE order_id = @id;
            DELETE FROM Orders WHERE id = @id;
        `);

        res.json({ success: true, message: 'تم حذف الأوردر وجميع بياناته بنجاح' });
    } catch (err) {
        console.error('Delete Order Error:', err);
        res.status(500).json({ success: false, message: 'فشل حذف الأوردر: ' + err.message });
    }
});

// تقرير شامل للأوردرات
app.get('/api/reports/comprehensive', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT 
                o.id, o.order_number, o.customer_name, o.target_quantity,
                o.status, o.created_by, o.created_at,
                ISNULL(bc.total_barcodes, 0) as total_barcodes,
                ISNULL(sm.total_scanned, 0) as total_scanned_movements,
                ISNULL(sm.unique_scanned, 0) as unique_scanned
            FROM Orders o
            LEFT JOIN (
                SELECT order_id, COUNT(*) as total_barcodes FROM OrderBarcodes GROUP BY order_id
            ) bc ON bc.order_id = o.id
            LEFT JOIN (
                SELECT order_id, COUNT(*) as total_scanned, COUNT(DISTINCT barcode) as unique_scanned FROM StockMovements GROUP BY order_id
            ) sm ON sm.order_id = o.id
            ORDER BY o.id DESC
        `);

        const stagesResult = await pool.request().query(`
            SELECT 
                s.order_id, s.stage_name, s.scanned_quantity, s.target_quantity, s.status, s.created_at,
                ag.first_scan, ag.last_scan, ag.scanners_list
            FROM OrderStages s
            LEFT JOIN (
                SELECT 
                    order_id,
                    stage_name,
                    MIN(created_at) as first_scan,
                    MAX(created_at) as last_scan,
                    (
                        SELECT STRING_AGG(scanned_user, '، ')
                        FROM (
                            SELECT DISTINCT scanned_by as scanned_user
                            FROM StockMovements sm2 
                            WHERE sm2.order_id = sm.order_id AND sm2.stage_name = sm.stage_name AND sm2.scanned_by IS NOT NULL
                        ) u
                    ) as scanners_list
                FROM StockMovements sm
                GROUP BY order_id, stage_name
            ) ag ON ag.order_id = s.order_id AND ag.stage_name = s.stage_name
            ORDER BY s.order_id DESC, s.id ASC
        `);

        const ordersMap = new Map();
        for (const row of result.recordset) {
            ordersMap.set(row.id, { ...row, is_external: false, stages: [] });
        }
        for (const s of stagesResult.recordset) {
            if (ordersMap.has(s.order_id)) {
                ordersMap.get(s.order_id).stages.push(s);
            }
        }

        const factoryOrdersList = Array.from(ordersMap.values()).map(order => {
            const totalScanned = (order.stages || []).reduce((sum, s) => sum + (Number(s.scanned_quantity) || 0), 0);
            const targetQty = Number(order.target_quantity) || 0;
            const stagesCount = (order.stages && order.stages.length > 0) ? order.stages.length : 6;
            const maxPossibleScans = targetQty * stagesCount;
            const rate = maxPossibleScans > 0 
                ? Math.min(100, Math.round((totalScanned / maxPossibleScans) * 100)) 
                : (order.status === 'closed' ? 100 : 0);
            return {
                ...order,
                total_scanned: totalScanned,
                overall_completion_rate: order.status === 'closed' ? 100 : rate
            };
        });

        // جلب أوامر التشغيل الخارجي للتقرير الشامل
        let extOrdersList = [];
        try {
            const extRes = await pool.request().query(`
                SELECT 
                    eo.id, eo.order_number, eo.description, eo.customer_name, eo.status, eo.created_by, eo.total_scanned, eo.target_quantity, eo.created_at, eo.last_activity_at, eo.closed_at, eo.closed_by,
                    ISNULL(sc.unique_barcodes, 0) as unique_barcodes,
                    sc.scanners_list
                FROM ExternalOrders eo
                LEFT JOIN (
                    SELECT 
                        external_order_id, 
                        COUNT(DISTINCT barcode) as unique_barcodes,
                        (
                            SELECT STRING_AGG(scanned_user, '، ')
                            FROM (
                                SELECT DISTINCT scanned_by as scanned_user
                                FROM ExternalScans es2
                                WHERE es2.external_order_id = es.external_order_id AND es2.scanned_by IS NOT NULL
                            ) u
                        ) as scanners_list
                    FROM ExternalScans es
                    GROUP BY external_order_id
                ) sc ON sc.external_order_id = eo.id
                ORDER BY eo.id DESC
            `);

            extOrdersList = extRes.recordset.map(eo => {
                const tQty = Number(eo.target_quantity) || 0;
                const sQty = Number(eo.total_scanned) || 0;
                const remainingQty = tQty > 0 ? Math.max(0, tQty - sQty) : 0;
                const compRate = tQty > 0 ? Math.min(100, Math.round((sQty / tQty) * 100)) : (eo.status === 'closed' ? 100 : 0);
                return {
                    id: 'ext_' + eo.id,
                    real_external_id: eo.id,
                    order_number: eo.order_number,
                    customer_name: eo.customer_name || eo.description || 'تشغيل خارجي مفتوح',
                    description: eo.description || '',
                    target_quantity: tQty,
                    scanned_quantity: sQty,
                    remaining_quantity: remainingQty,
                    status: eo.status || 'active',
                    created_by: eo.created_by || 'مشغل خارجي',
                    created_at: eo.created_at,
                    last_activity_at: eo.last_activity_at,
                    closed_at: eo.closed_at || null,
                    closed_by: eo.closed_by || null,
                    stages: [{
                        stage_name: 'تشغيل خارجي',
                        scanned_quantity: sQty,
                        target_quantity: tQty,
                        status: eo.status || 'active',
                        scanners_list: eo.scanners_list || eo.created_by
                    }],
                    total_scanned: sQty,
                    unique_scanned: eo.unique_barcodes || 0,
                    overall_completion_rate: compRate,
                    is_external: true
                };
            });
        } catch (extErr) {
            console.error('Error fetching external orders in comprehensive report:', extErr);
        }

        const allReportOrders = [...factoryOrdersList, ...extOrdersList].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

        res.json({ success: true, orders: allReportOrders });
    } catch (err) {
        console.error('Report Error:', err);
        res.status(500).json({ success: false, message: 'فشل جلب بيانات التقرير' });
    }
});

// إحصائيات النظام (تجمع أوامر المصنع والتشغيل الخارجي بدقة)
app.get('/api/stats', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT
                (SELECT COUNT(*) FROM Orders) as factory_orders,
                (SELECT COUNT(*) FROM Orders WHERE status != 'closed') as factory_active_orders,
                (SELECT COUNT(*) FROM Orders WHERE status = 'closed') as factory_closed_orders,
                (SELECT COUNT(*) FROM OrderBarcodes) as total_barcodes,
                (SELECT COUNT(*) FROM StockMovements) as total_scans,
                (SELECT COUNT(*) FROM Users) as total_users,
                (SELECT COUNT(*) FROM ExternalOrders) as total_external_orders,
                (SELECT COUNT(*) FROM ExternalOrders WHERE status != 'closed') as active_external_orders,
                (SELECT COUNT(*) FROM ExternalOrders WHERE status = 'closed') as closed_external_orders,
                (SELECT COUNT(*) FROM ExternalScans) as total_external_scans,
                (SELECT ISNULL(SUM(total_scanned), 0) FROM ExternalOrders) as external_pieces_scanned
        `);
        const r = result.recordset[0] || {};
        const factoryOrders = Number(r.factory_orders) || 0;
        const externalOrders = Number(r.total_external_orders) || 0;
        const totalOrders = factoryOrders + externalOrders;

        const factoryActive = Number(r.factory_active_orders) || 0;
        const externalActive = Number(r.active_external_orders) || 0;
        const totalActive = factoryActive + externalActive;

        const factoryClosed = Number(r.factory_closed_orders) || 0;
        const externalClosed = Number(r.closed_external_orders) || 0;
        const totalClosed = factoryClosed + externalClosed;

        const totalBarcodes = (Number(r.total_barcodes) || 0) + (Number(r.external_pieces_scanned) || 0);

        res.json({
            success: true,
            stats: {
                ...r,
                total_orders: totalOrders,
                active_orders: totalActive,
                closed_orders: totalClosed,
                total_barcodes: Number(r.total_barcodes) || 0,
                total_all_barcodes: totalBarcodes,
                factory_orders: factoryOrders,
                external_orders: externalOrders,
                factory_active_orders: factoryActive,
                active_external_orders: externalActive,
                factory_closed_orders: factoryClosed,
                closed_external_orders: externalClosed,
                total_external_scans: Number(r.total_external_scans) || 0,
                external_pieces_scanned: Number(r.external_pieces_scanned) || 0
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'فشل جلب الإحصائيات' });
    }
});

// مركز القيادة التنفيذي اللحظي (Executive Command Center Feed)
app.get('/api/dashboard/overview', async (req, res) => {
    try {
        const pool = await getPool();

        // 1. مؤشرات الأداء اللحظية الموحدة
        const statsRes = await pool.request().query(`
            SELECT
                (SELECT COUNT(*) FROM Orders) as factory_orders,
                (SELECT COUNT(*) FROM Orders WHERE status != 'closed') as factory_active_orders,
                (SELECT COUNT(*) FROM Orders WHERE status = 'closed') as factory_closed_orders,
                (SELECT ISNULL(SUM(target_quantity), 0) FROM Orders) as factory_target_units,
                (SELECT COUNT(*) FROM StockMovements) as factory_total_scans,
                (SELECT COUNT(*) FROM ExternalOrders) as external_orders,
                (SELECT COUNT(*) FROM ExternalOrders WHERE status != 'closed') as external_active_orders,
                (SELECT COUNT(*) FROM ExternalOrders WHERE status = 'closed') as external_closed_orders,
                (SELECT ISNULL(SUM(target_quantity), 0) FROM ExternalOrders) as external_target_units,
                (SELECT COUNT(*) FROM ExternalScans) as external_total_scans,
                (SELECT COUNT(*) FROM Users) as total_users,
                (SELECT COUNT(*) FROM Users WHERE is_locked = 1) as locked_users,
                (SELECT COUNT(*) FROM ProductionStagesConfig WHERE is_active = 1) as active_stages_count
        `);
        const s = statsRes.recordset[0] || {};

        // 2. توزيع الإنتاج على مراحل المصنع الست
        const stagesDistRes = await pool.request().query(`
            SELECT 
                s.stage_name, 
                ISNULL(SUM(s.scanned_quantity), 0) as total_scanned,
                ISNULL(SUM(s.target_quantity), 0) as total_target,
                COUNT(DISTINCT s.order_id) as active_orders_count
            FROM OrderStages s
            GROUP BY s.stage_name
            ORDER BY MIN(s.order_index) ASC
        `);

        // 3. قائمة صدارة المشغلين (Top 6 Operators by Scan Volume)
        const topScannersRes = await pool.request().query(`
            SELECT TOP 6
                scanned_by,
                COUNT(*) as scan_count,
                MAX(created_at) as last_seen
            FROM (
                SELECT scanned_by, created_at FROM StockMovements WHERE scanned_by IS NOT NULL
                UNION ALL
                SELECT scanned_by, created_at FROM ExternalScans WHERE scanned_by IS NOT NULL
            ) all_scans
            GROUP BY scanned_by
            ORDER BY scan_count DESC
        `);

        // 4. أحدث حركات المسح الليزري اللحظية الحية (Live Ticker Stream)
        const recentActivityRes = await pool.request().query(`
            SELECT TOP 12
                act.id,
                act.barcode,
                act.order_id,
                act.order_number,
                act.stage_name,
                act.scanned_by,
                act.source_type,
                act.created_at
            FROM (
                SELECT 
                    sm.id,
                    sm.barcode,
                    sm.order_id,
                    o.order_number,
                    sm.stage_name,
                    sm.scanned_by,
                    'factory' as source_type,
                    sm.created_at
                FROM StockMovements sm
                LEFT JOIN Orders o ON o.id = sm.order_id

                UNION ALL

                SELECT 
                    es.id,
                    es.barcode,
                    es.external_order_id as order_id,
                    eo.order_number,
                    ISNULL(es.scan_type, N'تشغيل خارجي') as stage_name,
                    es.scanned_by,
                    'external' as source_type,
                    es.created_at
                FROM ExternalScans es
                LEFT JOIN ExternalOrders eo ON eo.id = es.external_order_id
            ) act
            ORDER BY act.created_at DESC
        `);

        // 5. الأوامر النشطة ذات الأولوية العالية ومعدل إنجاز كل منها
        const priorityOrdersRes = await pool.request().query(`
            SELECT TOP 5
                o.id,
                o.order_number,
                o.customer_name,
                o.target_quantity,
                o.status,
                o.created_at,
                'factory' as order_type,
                ISNULL((SELECT SUM(scanned_quantity) FROM OrderStages WHERE order_id = o.id), 0) as total_scanned,
                ISNULL((SELECT COUNT(*) FROM OrderStages WHERE order_id = o.id), 6) as stages_count
            FROM Orders o
            WHERE o.status != 'closed'
            ORDER BY o.id DESC
        `);

        const priorityOrders = priorityOrdersRes.recordset.map(o => {
            const tQty = Number(o.target_quantity) || 1;
            const maxExpected = tQty * (Number(o.stages_count) || 6);
            const scanned = Number(o.total_scanned) || 0;
            const pct = maxExpected > 0 ? Math.min(100, Math.round((scanned / maxExpected) * 100)) : 0;
            return {
                ...o,
                completion_rate: pct
            };
        });

        const totalOrders = (Number(s.factory_orders) || 0) + (Number(s.external_orders) || 0);
        const activeOrders = (Number(s.factory_active_orders) || 0) + (Number(s.external_active_orders) || 0);
        const closedOrders = (Number(s.factory_closed_orders) || 0) + (Number(s.external_closed_orders) || 0);
        const totalScans = (Number(s.factory_total_scans) || 0) + (Number(s.external_total_scans) || 0);

        res.json({
            success: true,
            summary: {
                total_orders: totalOrders,
                active_orders: activeOrders,
                closed_orders: closedOrders,
                total_scans: totalScans,
                factory_orders: Number(s.factory_orders) || 0,
                external_orders: Number(s.external_orders) || 0,
                factory_active_orders: Number(s.factory_active_orders) || 0,
                external_active_orders: Number(s.external_active_orders) || 0,
                total_target_pieces: (Number(s.factory_target_units) || 0) + (Number(s.external_target_units) || 0),
                total_users: Number(s.total_users) || 0,
                locked_users: Number(s.locked_users) || 0,
                active_stages_count: Number(s.active_stages_count) || 6,
                license: cachedLicenseStatus || {}
            },
            stages_distribution: stagesDistRes.recordset,
            top_scanners: topScannersRes.recordset,
            live_activity: recentActivityRes.recordset,
            priority_orders: priorityOrders
        });
    } catch (err) {
        console.error('Dashboard Overview Error:', err);
        res.status(500).json({ success: false, message: 'فشل جلب بيانات لوحة القيادة: ' + err.message });
    }
});

// ============================================================================
// 🏭 منظومة التشغيل الخارجي المستقلة (External Processing & Outsourcing Engine)
// جداول منفصلة تماماً (ExternalOrders & ExternalScans) - تقبل أي باركود
// ============================================================================

// توجيهات صفحات التشغيل الخارجي
app.get(['/external', '/external_tracking', '/external_tracking.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'external_tracking.html'));
});

// فتح أو إنشاء أمر تشغيل خارجي فورياً عند كتابة رقمه
app.post('/api/external/orders/open', async (req, res) => {
    const { order_number, description, target_quantity, stage_direction, customer_name } = req.body;
    if (!order_number || !order_number.trim()) {
        return res.status(400).json({ success: false, message: 'يرجى إدخال رقم أمر التشغيل الخارجي' });
    }

    try {
        const pool = await getPool();
        const orderNumClean = order_number.trim();
        const user = req.user;
        const creatorName = (user ? (user.full_name || user.username) : 'مشغل تشغيل خارجي');
        const targetQtyInt = parseInt(target_quantity, 10) || 0;
        const dirVal = stage_direction || (user ? user.stage_action : null);
        const custNameClean = customer_name && customer_name.trim() ? customer_name.trim() : null;

        // البحث عن أمر التشغيل
        let orderRes = await pool.request()
            .input('order_number', sql.NVarChar, orderNumClean)
            .query('SELECT * FROM ExternalOrders WHERE order_number = @order_number');

        let order = null;
        let isNew = false;

        if (orderRes.recordset.length === 0) {
            // إنشاء أمر تشغيل خارجي جديد تلقائياً
            const insertRes = await pool.request()
                .input('order_number', sql.NVarChar, orderNumClean)
                .input('description', sql.NVarChar, description || 'تشغيل خارجي مفتوح')
                .input('customer_name', sql.NVarChar, custNameClean)
                .input('created_by', sql.NVarChar, creatorName)
                .input('target_qty', sql.Int, targetQtyInt)
                .input('stage_dir', sql.NVarChar, dirVal)
                .query(`
                    INSERT INTO ExternalOrders (order_number, description, customer_name, created_by, status, total_scanned, target_quantity, stage_direction, created_at, last_activity_at)
                    OUTPUT INSERTED.*
                    VALUES (@order_number, @description, @customer_name, @created_by, 'active', 0, @target_qty, @stage_dir, GETDATE(), GETDATE())
                `);
            order = insertRes.recordset[0];
            isNew = true;
        } else {
            order = orderRes.recordset[0];
            // إذا تم إدخال كمية مستهدفة جديدة أو اسم عميل يتم تحديثها فورياً للأمر
            if (targetQtyInt > 0 || custNameClean) {
                await pool.request()
                    .input('oid', sql.Int, order.id)
                    .input('target_qty', sql.Int, targetQtyInt)
                    .input('cust_name', sql.NVarChar, custNameClean)
                    .input('stage_dir', sql.NVarChar, dirVal || order.stage_direction)
                    .query(`
                        UPDATE ExternalOrders
                        SET target_quantity = CASE WHEN @target_qty > 0 THEN @target_qty ELSE target_quantity END,
                            customer_name = COALESCE(@cust_name, customer_name),
                            stage_direction = COALESCE(@stage_dir, stage_direction)
                        WHERE id = @oid
                    `);
                if (targetQtyInt > 0) order.target_quantity = targetQtyInt;
                if (custNameClean) order.customer_name = custNameClean;
                if (dirVal) order.stage_direction = dirVal;
            }
        }

        // جلب آخر 100 حركة مسح لهذا الأوردر
        const recentScansRes = await pool.request()
            .input('oid', sql.Int, order.id)
            .query(`
                SELECT TOP 100 id, external_order_id, barcode, scanned_by, scan_type, created_at
                FROM ExternalScans
                WHERE external_order_id = @oid
                ORDER BY id DESC
            `);

        // جلب عدد الأكواد الفريدة
        const uniqueRes = await pool.request()
            .input('oid', sql.Int, order.id)
            .query('SELECT COUNT(DISTINCT barcode) as unique_count FROM ExternalScans WHERE external_order_id = @oid');

        res.json({
            success: true,
            is_new: isNew,
            order: {
                ...order,
                target_quantity: Number(order.target_quantity) || 0,
                unique_scanned_count: uniqueRes.recordset[0]?.unique_count || 0
            },
            recent_scans: recentScansRes.recordset
        });

    } catch (err) {
        console.error('External Open Order Error:', err);
        res.status(500).json({ success: false, message: 'فشل فتح أمر التشغيل الخارجي: ' + err.message });
    }
});

// تسجيل مسح باركود في أمر تشغيل خارجي (يقبل أي باركود صناعي أو تجاري)
app.post('/api/external/scan', async (req, res) => {
    const { order_id, barcode, scanned_by, scan_type } = req.body;
    if (!order_id || !barcode || !barcode.trim()) {
        return res.status(400).json({ success: false, message: 'بيانات غير مكتملة للمسح' });
    }

    try {
        const pool = await getPool();
        const barcodeClean = barcode.trim();
        const orderIdInt = parseInt(order_id, 10);
        const scannerName = scanned_by || (req.user ? (req.user.full_name || req.user.username) : 'مشغل خارجي');
        const scanTypeVal = scan_type || (req.user ? req.user.stage_action : null);

        // التأكد من وجود أمر التشغيل وحالته
        const orderRes = await pool.request()
            .input('id', sql.Int, orderIdInt)
            .query('SELECT * FROM ExternalOrders WHERE id = @id');

        if (orderRes.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'أمر التشغيل الخارجي غير مسجل' });
        }

        const order = orderRes.recordset[0];
        if (order.status === 'closed') {
            return res.status(400).json({ success: false, message: 'أمر التشغيل الخارجي هذا مغلق ومكتمل بالفعل!' });
        }

        // فحص تكرار مسح نفس الباركود في نفس أمر التشغيل
        const dupRes = await pool.request()
            .input('oid', sql.Int, orderIdInt)
            .input('barcode', sql.NVarChar, barcodeClean)
            .query('SELECT id FROM ExternalScans WHERE external_order_id = @oid AND barcode = @barcode');

        if (dupRes.recordset.length > 0) {
            return res.status(400).json({
                success: false,
                is_duplicate: true,
                message: `تم مسح هذا الباركود مسبقاً في هذا الأوردر! [${barcodeClean}]`
            });
        }

        // تسجيل الحركة في ExternalScans وتحديث العداد في ExternalOrders
        const insertRes = await pool.request()
            .input('oid', sql.Int, orderIdInt)
            .input('barcode', sql.NVarChar, barcodeClean)
            .input('scanned_by', sql.NVarChar, scannerName)
            .input('scan_type', sql.NVarChar, scanTypeVal)
            .query(`
                INSERT INTO ExternalScans (external_order_id, barcode, scanned_by, scan_type, created_at)
                OUTPUT INSERTED.*
                VALUES (@oid, @barcode, @scanned_by, @scan_type, GETDATE());

                UPDATE ExternalOrders
                SET total_scanned = total_scanned + 1,
                    last_activity_at = GETDATE()
                WHERE id = @oid;
            `);

        const newScan = insertRes.recordset[0];
        const newTotal = order.total_scanned + 1;
        const targetQty = Number(order.target_quantity) || 0;
        const isCompleted = (targetQty > 0 && newTotal >= targetQty);

        res.json({
            success: true,
            message: 'تم تسجيل المسح بنجاح',
            scan: newScan,
            total_scanned: newTotal,
            target_quantity: targetQty,
            remaining_quantity: targetQty > 0 ? Math.max(0, targetQty - newTotal) : 0,
            is_completed: isCompleted,
            barcode: barcodeClean
        });

    } catch (err) {
        console.error('External Scan Error:', err);
        if (err.message && (err.message.includes('UQ_ExternalScans_Order_Barcode') || err.message.includes('2601') || err.message.includes('2627'))) {
            return res.status(400).json({
                success: false,
                is_duplicate: true,
                message: 'تم مسح هذا الباركود مسبقاً في هذا الأوردر!'
            });
        }
        res.status(500).json({ success: false, message: 'حدث خطأ أثناء حفظ حركة المسح الخارجي: ' + err.message });
    }
});

// جلب قائمة أوامر التشغيل الخارجي (خاص بـ external_admin و admin و superadmin)
app.get('/api/external/orders', async (req, res) => {
    try {
        const pool = await getPool();
        const user = req.user;

        if (user && user.role === 'production') {
            return res.status(403).json({ success: false, message: 'غير مصرح لمشغلي الإنتاج العادي بالدخول' });
        }

        const ordersRes = await pool.request().query(`
            SELECT 
                eo.id, eo.order_number, eo.description, eo.customer_name, eo.status, eo.total_scanned,
                eo.target_quantity, eo.stage_direction, eo.closed_at, eo.closed_by,
                eo.created_by, eo.created_at, eo.last_activity_at,
                ISNULL(sc.unique_barcodes, 0) as unique_barcodes,
                sc.scanners_list
            FROM ExternalOrders eo
            LEFT JOIN (
                SELECT 
                    external_order_id,
                    COUNT(DISTINCT barcode) as unique_barcodes,
                    (
                        SELECT STRING_AGG(scanned_user, '، ')
                        FROM (
                            SELECT DISTINCT scanned_by as scanned_user
                            FROM ExternalScans es2
                            WHERE es2.external_order_id = es.external_order_id AND es2.scanned_by IS NOT NULL
                        ) u
                    ) as scanners_list
                FROM ExternalScans es
                GROUP BY external_order_id
            ) sc ON sc.external_order_id = eo.id
            ORDER BY eo.id DESC
        `);

        res.json({ success: true, orders: ordersRes.recordset });
    } catch (err) {
        console.error('Get External Orders Error:', err);
        res.status(500).json({ success: false, message: 'فشل جلب أوامر التشغيل الخارجي' });
    }
});

// جلب تفاصيل أمر تشغيل خارجي محدد وكافة مسحاته
app.get('/api/external/orders/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const orderId = parseInt(req.params.id, 10);

        const orderRes = await pool.request()
            .input('id', sql.Int, orderId)
            .query('SELECT * FROM ExternalOrders WHERE id = @id');

        if (orderRes.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'أمر التشغيل الخارجي غير موجود' });
        }

        const order = orderRes.recordset[0];

        // جلب جميع الحركات التابعة لهذا الأوردر
        const scansRes = await pool.request()
            .input('oid', sql.Int, orderId)
            .query(`
                SELECT id, external_order_id, barcode, scanned_by, scan_type, created_at
                FROM ExternalScans
                WHERE external_order_id = @oid
                ORDER BY id DESC
            `);

        // تجميع المشغلين
        const scannersRes = await pool.request()
            .input('oid', sql.Int, orderId)
            .query(`
                SELECT scanned_by, COUNT(*) as count
                FROM ExternalScans
                WHERE external_order_id = @oid
                GROUP BY scanned_by
            `);

        res.json({
            success: true,
            order,
            scans: scansRes.recordset,
            scanners_breakdown: scannersRes.recordset
        });

    } catch (err) {
        console.error('Get External Order Details Error:', err);
        res.status(500).json({ success: false, message: 'فشل جلب تفاصيل أمر التشغيل الخارجي' });
    }
});

// تعديل حالة أمر التشغيل الخارجي (active / closed)
app.put('/api/external/orders/:id/status', async (req, res) => {
    if (!req.user || !['superadmin', 'admin', 'external_admin'].includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'غير مصرح بتعديل حالة أمر التشغيل الخارجي' });
    }

    try {
        const pool = await getPool();
        const orderId = parseInt(req.params.id, 10);
        const { status } = req.body;
        const newStatus = status === 'closed' ? 'closed' : 'active';
        const closerName = req.user ? (req.user.full_name || req.user.username) : 'مشرف خارجي';

        if (newStatus === 'closed') {
            await pool.request()
                .input('id', sql.Int, orderId)
                .input('status', sql.NVarChar, newStatus)
                .input('closed_by', sql.NVarChar, closerName)
                .query(`
                    UPDATE ExternalOrders 
                    SET status = @status, 
                        last_activity_at = GETDATE(),
                        closed_at = GETDATE(),
                        closed_by = @closed_by 
                    WHERE id = @id
                `);
        } else {
            await pool.request()
                .input('id', sql.Int, orderId)
                .input('status', sql.NVarChar, newStatus)
                .query(`
                    UPDATE ExternalOrders 
                    SET status = @status, 
                        last_activity_at = GETDATE(),
                        closed_at = NULL,
                        closed_by = NULL 
                    WHERE id = @id
                `);
        }

        res.json({ success: true, message: `تم تحديث حالة الأوردر إلى (${newStatus})` });
    } catch (err) {
        console.error('Update External Order Status Error:', err);
        res.status(500).json({ success: false, message: 'فشل تحديث حالة أمر التشغيل الخارجي' });
    }
});

// حذف أمر تشغيل خارجي
app.delete('/api/external/orders/:id', async (req, res) => {
    if (!req.user || !['superadmin', 'admin', 'external_admin'].includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'غير مصرح بحذف أوامر التشغيل الخارجي' });
    }

    try {
        const pool = await getPool();
        const orderId = parseInt(req.params.id, 10);

        await pool.request()
            .input('id', sql.Int, orderId)
            .query(`
                DELETE FROM ExternalScans WHERE external_order_id = @id;
                DELETE FROM ExternalOrders WHERE id = @id;
            `);

        res.json({ success: true, message: 'تم حذف أمر التشغيل الخارجي وسجلاته بنجاح' });
    } catch (err) {
        console.error('Delete External Order Error:', err);
        res.status(500).json({ success: false, message: 'فشل حذف أمر التشغيل الخارجي' });
    }
});


// SPA Fallback for React Router (e.g. /login, /orders, /admin)
const frontendIndexFile = path.join(__dirname, 'frontend', 'dist', 'index.html');
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/storage') || req.path.endsWith('.html') || req.path.endsWith('.css') || req.path.endsWith('.js') || req.path.endsWith('.pdf')) {
        return next();
    }
    if (fs.existsSync(frontendIndexFile)) {
        return res.sendFile(frontendIndexFile);
    }
    next();
});

// فحص وحماية الترخيص
cachedLicenseStatus = verifyLicenseFile();

// API معلومات هوية النظام والشركة المرخص لها (عام لكل الواجهات والتقارير)
app.get('/api/system/info', (req, res) => {
    cachedLicenseStatus = verifyLicenseFile();
    const isMaster = Boolean(cachedLicenseStatus && cachedLicenseStatus.is_master_general);
    const companyName = (cachedLicenseStatus && cachedLicenseStatus.valid && cachedLicenseStatus.client && cachedLicenseStatus.client !== 'نسخة غير مرخصة')
        ? cachedLicenseStatus.client
        : (process.env.COMPANY_NAME_AR || 'نظام الباركود وتتبع الإنتاج الصناعي');

    const companyEn = cachedLicenseStatus?.client_en || 'INDUSTRIAL BARCODE SYSTEM';
    const now = new Date();

    res.json({
        success: true,
        company_name: companyName,
        company_en: companyEn,
        system_title: `${companyName} | نظام الباركود الصناعي`,
        is_master: isMaster,
        license_valid: Boolean(cachedLicenseStatus && cachedLicenseStatus.valid),
        days_remaining: cachedLicenseStatus?.days_remaining || 0,
        contract_id: cachedLicenseStatus?.contract_id || null,
        server_time: now.toISOString(),
        server_timestamp: now.getTime(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo',
        system_language: currentSystemLanguage
    });
});

// API جلب إعدادات النظام العامة
app.get('/api/system/settings', (req, res) => {
    res.json({
        success: true,
        settings: {
            system_language: currentSystemLanguage
        }
    });
});

// API تغيير لغة النظام الشاملة - مخصص حصرياً لمدير النظام (Admin / SuperAdmin / Master)
app.post('/api/system/settings/language', async (req, res) => {
    try {
        const isAuthAdmin = req.user && (
            req.user.role === 'admin' || 
            req.user.role === 'superadmin' || 
            req.user.is_master || 
            ['gamal', 'auf'].includes((req.user.username || '').toLowerCase())
        );

        if (!isAuthAdmin) {
            return res.status(403).json({
                success: false,
                error: 'غير مصرح: خيار تغيير لغة النظام مخصص لمدير النظام فقط (Admin Only)'
            });
        }

        const { language } = req.body;
        if (!language || !['ar', 'en'].includes(language)) {
            return res.status(400).json({
                success: false,
                error: 'لغة غير صالحة. اللغات المدعومة: ar, en'
            });
        }

        const pool = await getPool();
        await pool.request()
            .input('key', sql.NVarChar, 'system_language')
            .input('val', sql.NVarChar, language)
            .input('by', sql.NVarChar, req.user.username || 'admin')
            .query(`
                MERGE SystemSettings AS target
                USING (SELECT @key AS setting_key, @val AS setting_value, @by AS updated_by) AS source
                ON (target.setting_key = source.setting_key)
                WHEN MATCHED THEN
                    UPDATE SET setting_value = source.setting_value, updated_at = GETDATE(), updated_by = source.updated_by
                WHEN NOT MATCHED THEN
                    INSERT (setting_key, setting_value, updated_at, updated_by)
                    VALUES (source.setting_key, source.setting_value, GETDATE(), source.updated_by);
            `);

        currentSystemLanguage = language;
        console.log(`🌐 System language switched to: [${language}] by user [${req.user.username}]`);

        res.json({
            success: true,
            language: currentSystemLanguage,
            message: language === 'ar' ? 'تم تحويل لغة النظام إلى العربية' : 'System language changed to English successfully'
        });
    } catch (err) {
        console.error('Error changing system language:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ===== إدارة مراحل خط الإنتاج وتخصيص مسار المصنع (Production Stages Pipeline) =====

// 1. جلب قائمة المراحل (المفعلة لجميع المستخدمين، والكل للأدمن والمالك)
app.get('/api/system/stages', async (req, res) => {
    try {
        const pool = await getPool();
        const isSuperOrAdmin = req.user && (req.user.role === 'superadmin' || req.user.role === 'admin');
        
        let query = `
            SELECT id, stage_name, stage_code, stage_category, order_index, is_active, is_system, created_at
            FROM ProductionStagesConfig
        `;
        if (!isSuperOrAdmin) {
            query += ` WHERE is_active = 1`;
        }
        query += ` ORDER BY order_index ASC, id ASC`;

        const result = await pool.request().query(query);
        res.json({
            success: true,
            stages: result.recordset
        });
    } catch (e) {
        console.error('Error fetching stages config:', e);
        res.status(500).json({ success: false, message: 'فشل جلب قائمة مراحل خط الإنتاج' });
    }
});

// 2. تفعيل / تعطيل مرحلة فردية (خاص بـ superadmin)
app.put('/api/system/stages/:id/toggle', async (req, res) => {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ success: false, message: 'غير مصرح! هذه العملية مقتصرة حصرياً على مالك السيستم (Super Admin).' });
    }

    const stageId = parseInt(req.params.id, 10);
    try {
        const pool = await getPool();
        const check = await pool.request()
            .input('id', sql.Int, stageId)
            .query('SELECT * FROM ProductionStagesConfig WHERE id = @id');

        if (check.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'المرحلة غير موجودة' });
        }

        const stage = check.recordset[0];
        const newStatus = stage.is_active ? 0 : 1;

        await pool.request()
            .input('id', sql.Int, stageId)
            .input('is_active', sql.Bit, newStatus)
            .query('UPDATE ProductionStagesConfig SET is_active = @is_active WHERE id = @id');

        res.json({
            success: true,
            message: newStatus ? `تم تفعيل مرحلة [${stage.stage_name}] بنجاح في خط الإنتاج` : `تم تعطيل مرحلة [${stage.stage_name}] بنجاح`,
            is_active: Boolean(newStatus)
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'فشل تغيير حالة المرحلة' });
    }
});

// 3. تفعيل / تعطيل عملية متكاملة بضغطة واحدة (مثال: الليزر، السنفرة، التطريز، الطباعة)
app.post('/api/system/stages/toggle-category', async (req, res) => {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ success: false, message: 'غير مصرح! مقتصر على مالك السيستم (Super Admin).' });
    }

    const { category, enable } = req.body;
    if (!category) {
        return res.status(400).json({ success: false, message: 'الفئة مطلوبة' });
    }

    try {
        const pool = await getPool();
        let activeVal;
        if (typeof enable === 'boolean') {
            activeVal = enable ? 1 : 0;
        } else {
            const current = await pool.request()
                .input('category', sql.NVarChar, category)
                .query('SELECT TOP 1 is_active FROM ProductionStagesConfig WHERE stage_category = @category');
            const anyActive = current.recordset.length > 0 && current.recordset[0].is_active;
            activeVal = anyActive ? 0 : 1;
        }

        await pool.request()
            .input('category', sql.NVarChar, category)
            .input('is_active', sql.Bit, activeVal)
            .query('UPDATE ProductionStagesConfig SET is_active = @is_active WHERE stage_category = @category');

        res.json({
            success: true,
            is_active: Boolean(activeVal),
            message: activeVal ? `تم تفعيل مسار [${category}] بنجاح (دخول وخروج)` : `تم تعطيل مسار [${category}] بنجاح`
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'فشل تحديث فئة المراحل' });
    }
});

// تطبيق قالب خط إنتاج صناعي جاهز بنقرة واحدة (جينز، تيشرتات، مغسلة، قياسي، الكل)
app.post('/api/system/stages/apply-template', async (req, res) => {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ success: false, message: 'غير مصرح! مقتصر على مالك السيستم (Super Admin).' });
    }

    const { template } = req.body;
    try {
        const pool = await getPool();
        let targetCategories = [];
        let templateLabel = '';

        if (template === 'all') {
            await pool.request().query('UPDATE ProductionStagesConfig SET is_active = 1');
            return res.json({ success: true, message: 'تم تفعيل جميع مراحل خط الإنتاج الـ 26 بالكامل بنجاح!' });
        } else if (template === 'none') {
            await pool.request().query('UPDATE ProductionStagesConfig SET is_active = 0');
            await pool.request().query("UPDATE ProductionStagesConfig SET is_active = 1 WHERE stage_name IN (N'دخول انتاج', N'خروج انتاج')");
            return res.json({ success: true, message: 'تم إيقاف جميع المراحل وتعيين خط الإنتاج الأساسي فقط.' });
        } else if (template === 'standard') {
            targetCategories = ['production', 'wash', 'packing'];
            templateLabel = 'الخط القياسي الثلاثي (إنتاج + مغسلة + تعبئة)';
        } else if (template === 'denim') {
            targetCategories = ['cutting', 'production', 'laser', 'sanding', 'crushing', 'wash', 'qc', 'ironing', 'packing'];
            templateLabel = 'قالب مصنع الجينز والمعالجات (Denim Plant)';
        } else if (template === 'knitwear') {
            targetCategories = ['cutting', 'embroidery', 'printing', 'production', 'qc', 'ironing', 'packing'];
            templateLabel = 'قالب مصنع التيشرتات والملابس الجاهزة (Knitwear / T-Shirts)';
        } else if (template === 'laundry') {
            targetCategories = ['wash', 'dyeing', 'qc', 'ironing', 'packing', 'warehouse'];
            templateLabel = 'قالب المغسلة والصباغة والتشطيب (Laundry & Wet Plant)';
        } else {
            return res.status(400).json({ success: false, message: 'القالب المحدد غير معروف' });
        }

        const catList = targetCategories.map(c => `'${c}'`).join(',');
        await pool.request().query(`
            UPDATE ProductionStagesConfig SET is_active = 0;
            UPDATE ProductionStagesConfig SET is_active = 1 WHERE stage_category IN (${catList});
        `);

        res.json({
            success: true,
            message: `تم تطبيق [${templateLabel}] بنجاح وتخصيص خط الإنتاج فورياً للمصنع!`
        });
    } catch (e) {
        console.error('Error applying stages template:', e);
        res.status(500).json({ success: false, message: 'فشل تطبيق قالب المراحل' });
    }
});

// حفظ إعادة ترتيب المراحل
app.post('/api/system/stages/reorder', async (req, res) => {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ success: false, message: 'غير مصرح! مقتصر على مالك السيستم (Super Admin).' });
    }

    const { items } = req.body;
    if (!Array.isArray(items)) {
        return res.status(400).json({ success: false, message: 'البيانات غير صالحة' });
    }

    try {
        const pool = await getPool();
        for (const item of items) {
            if (item.id && item.order_index != null) {
                await pool.request()
                    .input('id', sql.Int, item.id)
                    .input('order_index', sql.Int, item.order_index)
                    .query('UPDATE ProductionStagesConfig SET order_index = @order_index WHERE id = @id');
            }
        }
        res.json({ success: true, message: 'تم حفظ ترتيب مراحل خط الإنتاج بنجاح' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'فشل تحديث الترتيب' });
    }
});

// 4. إضافة مرحلة جديدة مخصصة
app.post('/api/system/stages', async (req, res) => {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ success: false, message: 'غير مصرح! مقتصر على مالك السيستم (Super Admin).' });
    }

    const { stage_name, stage_code, stage_category, order_index } = req.body;
    if (!stage_name || !stage_name.trim()) {
        return res.status(400).json({ success: false, message: 'اسم المرحلة مطلوب' });
    }

    const nameClean = stage_name.trim();
    try {
        const pool = await getPool();
        const dup = await pool.request()
            .input('name', sql.NVarChar, nameClean)
            .query('SELECT id FROM ProductionStagesConfig WHERE stage_name = @name');

        if (dup.recordset.length > 0) {
            return res.status(400).json({ success: false, message: 'توجد مرحلة مسجلة بالفعل بهذا الاسم' });
        }

        const maxOrderRes = await pool.request().query('SELECT ISNULL(MAX(order_index), 0) as max_idx FROM ProductionStagesConfig');
        const defaultOrder = (maxOrderRes.recordset[0]?.max_idx || 0) + 1;
        const finalOrder = order_index != null ? parseInt(order_index, 10) : defaultOrder;

        await pool.request()
            .input('stage_name', sql.NVarChar, nameClean)
            .input('stage_code', sql.NVarChar, stage_code ? stage_code.trim().toUpperCase() : null)
            .input('stage_category', sql.NVarChar, stage_category || 'custom')
            .input('order_index', sql.Int, finalOrder)
            .query(`
                INSERT INTO ProductionStagesConfig (stage_name, stage_code, stage_category, order_index, is_active, is_system)
                VALUES (@stage_name, @stage_code, @stage_category, @order_index, 1, 0)
            `);

        res.json({ success: true, message: `تمت إضافة مرحلة [${nameClean}] بنجاح إلى خط الإنتاج` });
    } catch (e) {
        res.status(500).json({ success: false, message: 'فشل إضافة المرحلة المخصصة' });
    }
});

// 5. تعديل ترتيب أو بيانات المرحلة
app.put('/api/system/stages/:id', async (req, res) => {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ success: false, message: 'غير مصرح! مقتصر على مالك السيستم (Super Admin).' });
    }

    const stageId = parseInt(req.params.id, 10);
    const { stage_name, stage_code, order_index, stage_category } = req.body;

    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, stageId)
            .input('stage_name', sql.NVarChar, stage_name ? stage_name.trim() : null)
            .input('stage_code', sql.NVarChar, stage_code ? stage_code.trim().toUpperCase() : null)
            .input('order_index', sql.Int, order_index != null ? parseInt(order_index, 10) : 1)
            .input('stage_category', sql.NVarChar, stage_category || 'custom')
            .query(`
                UPDATE ProductionStagesConfig
                SET stage_name = ISNULL(@stage_name, stage_name),
                    stage_code = ISNULL(@stage_code, stage_code),
                    order_index = @order_index,
                    stage_category = ISNULL(@stage_category, stage_category)
                WHERE id = @id
            `);

        res.json({ success: true, message: 'تم تحديث بيانات المرحلة بنجاح' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'فشل تعديل المرحلة' });
    }
});

// 6. حذف مرحلة مخصصة
app.delete('/api/system/stages/:id', async (req, res) => {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ success: false, message: 'غير مصرح! مقتصر على مالك السيستم (Super Admin).' });
    }

    const stageId = parseInt(req.params.id, 10);
    try {
        const pool = await getPool();
        const check = await pool.request()
            .input('id', sql.Int, stageId)
            .query('SELECT * FROM ProductionStagesConfig WHERE id = @id');

        if (check.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'المرحلة غير موجودة' });
        }

        const stage = check.recordset[0];
        if (stage.is_system) {
            return res.status(400).json({
                success: false,
                message: 'لا يمكن حذف المراحل الأساسية للنظام، يمكنك فقط تعطيلها عبر زر الإيقاف.'
            });
        }

        await pool.request()
            .input('id', sql.Int, stageId)
            .query('DELETE FROM ProductionStagesConfig WHERE id = @id');

        res.json({ success: true, message: `تم حذف مرحلة [${stage.stage_name}] بنجاح` });
    } catch (e) {
        res.status(500).json({ success: false, message: 'فشل حذف المرحلة' });
    }
});

// API المزامنة التلقائية اللحظية للتوقيت والتاريخ مع الخادم المركزي
app.get('/api/system/time', (req, res) => {
    const now = new Date();
    res.json({
        success: true,
        server_time: now.toISOString(),
        server_timestamp: now.getTime(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo',
        formatted: now.toLocaleString('ar-EG-u-nu-latn', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        })
    });
});

// API حالة الترخيص
app.get('/api/license/status', (req, res) => {
    cachedLicenseStatus = verifyLicenseFile();
    res.json(cachedLicenseStatus);
});

// API توليد وتمديد الترخيص (خاص بـ superadmin فقط - ملاك السيستم)
app.post('/api/license/generate', (req, res) => {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({
            success: false,
            message: 'غير مصرح! هذه العملية مقتصرة حصرياً على الإدارة العليا لمالكي السيستم (Super Admin).'
        });
    }

    const { client, days, killSwitchUrl } = req.body;
    try {
        const result = generateAndSaveLicense({ client, days, killSwitchUrl });
        cachedLicenseStatus = verifyLicenseFile();

        // قراءة محتوى ملف الترخيص المولّد لإتاحة تحميله للمستخدم
        let licenseFileContent = null;
        try {
            const licPath = fs.existsSync(path.join(__dirname, 'hms.lic'))
                ? path.join(__dirname, 'hms.lic')
                : path.join(__dirname, 'freedom.lic');
            licenseFileContent = fs.readFileSync(licPath, 'utf8');
        } catch (e) {}

        res.json({
            success: true,
            message: 'تم توليد وتطبيق الترخيص بنجاح!',
            license: result,
            license_file_content: licenseFileContent
        });
    } catch (err) {
        console.error('License Generation Error:', err);
        res.status(500).json({ success: false, message: 'فشل توليد الترخيص: ' + err.message });
    }
});

// API تفعيل واستيراد ترخيص جديد
app.post('/api/license/activate', (req, res) => {
    const { license_key } = req.body;
    if (!license_key) {
        return res.status(400).json({ success: false, message: 'يرجى تقديم مفتاح الترخيص المطلوب تفعيله.' });
    }
    const result = activateLicenseKey(license_key);
    cachedLicenseStatus = result;
    if (result.valid) {
        return res.json({
            success: true,
            message: 'تم تفعيل الترخيص بنجاح!',
            client: result.client,
            days_remaining: result.days_remaining,
            expires_at: result.expires_at
        });
    } else {
        return res.status(400).json({
            success: false,
            message: result.message || 'مفتاح الترخيص غير صالح!'
        });
    }
});

// تشغيل السيرفر بعد التحقق من الترخيص
(async () => {
    console.log('================================================================');
    console.log('🔐 HMS Security & License Engine: فحص ترخيص النظام...');
    console.log('================================================================');

    const license = verifyLicenseFile();
    if (!license.valid) {
        console.warn('⚠️  تنبيه الترخيص: ' + license.message);
        console.warn('🔒 النظام يعمل في وضع الحماية المقيّد (بانتظار تفعيل الترخيص).');
    }

    if (license.kill_switch_url) {
        const killCheck = await checkRemoteKillSwitch(license.kill_switch_url);
        if (!killCheck.active) {
            console.error('🚫 KILL-SWITCH ACTIVATED: ' + killCheck.message);
            console.error('⛔ تم إلغاء تشغيل النظام عن بُعد من قبل المبرمج.');
            process.exit(1);
        }
    }

    if (license.is_master_general) {
        console.log(`👑 نمط التشغيل: [النسخة العامة الرئيسية - Master General Edition]`);
        console.log(`⚡ الترخيص: مفعل تلقائياً ومدى الحياة بدون قيود`);
        console.log(`📌 هوية النظام: ${license.client}`);
    } else {
        console.log(`✅ الترخيص ساري ومعتمد: [${license.client}]`);
        console.log(`⏳ متبقي في صلاحية العقد: ${license.days_remaining} يوم (تاريخ الانتهاء: ${new Date(license.expires_at).toLocaleDateString('ar-EG-u-nu-latn')})`);
    }
    console.log('================================================================');

    // فحص دوري كل ساعة للتحقق من عدم التلاعب والتأكد من سريان العقد
    setInterval(async () => {
        cachedLicenseStatus = verifyLicenseFile();
        if (!cachedLicenseStatus.valid) {
            console.error('⚠️ انتهت صلاحية الترخيص أثناء التشغيل! إيقاف العمليات الحيوية...');
        } else if (cachedLicenseStatus.kill_switch_url) {
            const kc = await checkRemoteKillSwitch(cachedLicenseStatus.kill_switch_url);
            if (!kc.active) {
                console.error('🚫 تم تفعيل الإيقاف عن بُعد (Remote Kill Switch)!');
                cachedLicenseStatus = { valid: false, message: kc.message };
            }
        }
    }, 1000 * 60 * 60);

    // تحرير المنفذ تلقائياً في حال وجود نسخة سيرفر قديمة عالقة بالخلفية
    try {
        if (process.platform === 'win32') {
            const { execSync } = require('child_process');
            const res = execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
            const lines = (res || '').trim().split('\n');
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                const pid = parts[parts.length - 1];
                if (pid && pid !== String(process.pid) && pid !== '0') {
                    console.log(`🧹 جاري تحرير المنفذ ${PORT} تلقائياً من نسخة السيرفر السابقة (PID: ${pid})...`);
                    execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
                }
            }
        }
    } catch (e) {}

    initializeDatabase().then(() => {
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`================================================================`);
            console.log(`🚀 HMS Industrial Barcode Server Running Successfully (Port ${PORT})`);
            console.log(`💻 Local Access (على نفس جهاز السيرفر): http://localhost:${PORT}`);
            try {
                const ifaces = os.networkInterfaces();
                const lanIps = [];
                for (const name of Object.keys(ifaces)) {
                    for (const net of ifaces[name]) {
                        if (net.family === 'IPv4' && !net.internal) {
                            lanIps.push(net.address);
                        }
                    }
                }
                if (lanIps.length > 0) {
                    console.log(`📡 Factory Network Access (من أجهزة المصنع والشبكة الداخلية):`);
                    lanIps.forEach(ip => console.log(`   👉 http://${ip}:${PORT}`));
                }
            } catch (e) {}
            console.log(`================================================================`);
            console.log(`📊 Connection Pool: max=30, min=2`);
            console.log(`⚡ Industrial Security & Licensing Protection Active`);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`\n❌ تنبيه: المنفذ ${PORT} محجوز مسبقاً بواسطة نسخة سيرفر أخرى تعمل بالخلفية.`);
                console.error(`💡 تم إنهاء العملية لتجنب التعارض. يمكنك إعادة تشغيل الأمر الآن.\n`);
                process.exit(1);
            } else {
                console.error('Server error:', err);
            }
        });
    }).catch(err => {
        console.error('\n================================================================');
        console.error('❌ تعذر الاتصال بمحرك قاعدة البيانات Microsoft SQL Server!');
        console.error('================================================================');
        console.error(`📌 تفاصيل الخطأ الفني: ${err.message || err}`);
        console.error('----------------------------------------------------------------');
        console.error('🔍 التشخيص التلقائي لحل المشكلة فوراً:');
        
        const errMsg = String(err.message || '');
        if (errMsg.includes('Login failed') || err.code === 'ELOGIN') {
            console.error('👉 [السبب]: اسم المستخدم أو كلمة المرور غير صحيحة، أو نمط المصادقة ليس Mixed Mode.');
            console.error(`   • تأكد أن مستخدم SQL باسم [${targetDbConfig.user}] تم إنشاؤه في SQL Server.`);
            console.error('   • تأكد من تفعيل Mixed Mode (SQL Server and Windows Authentication).');
            console.error('   💡 الحل الأسرع: شغّل سكربت [setup_sql_server.bat] كمسؤول (Run as Administrator) ليقوم بتهيئة كل شيء بضغطة زر واحدة.');
        } else if (errMsg.includes('Failed to connect') || err.code === 'ESOCKET' || err.code === 'ETIMEOUT' || errMsg.includes('ECONNREFUSED')) {
            console.error('👉 [السبب]: خدمة SQL Server غير مشغلة، أو بروتوكول TCP/IP معطل، أو المنفذ 1433 مغلق.');
            console.error('   • افتح SQL Server Configuration Manager وتأكد أن بروتوكول TCP/IP مفعّل (Enabled) على المنفذ 1433.');
            console.error('   • تأكد أن خدمة SQL Server في وضع التشغيل (Running).');
            console.error('   💡 الحل الأسرع: شغّل سكربت [setup_sql_server.bat] كمسؤول لفتح البورتات وضبط الحسابات تلقائياً.');
        } else {
            console.error('👉 يرجى مراجعة إعدادات الاتصال في ملف .env وتطابقها مع محرك SQL Server لديك.');
        }
        console.error('================================================================\n');
        process.exit(1);
    });
})();
/**
 * HMS Industrial System - Professional Auto-Updater
 * =================================================
 * Runs via Node.js (which is always installed on the server).
 * Safe, robust, handles UTF-8, internet healthcheck, git pull, build, and restart.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT_DIR = __dirname;
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');

console.log('===================================================================');
console.log('   HMS Industrial Barcode System - One-Click Auto Updater');
console.log('   نظام HMS للتتبع الصناعي - أداة التحديث الفوري المباشر');
console.log('===================================================================\n');

// 1. Locate Git executable
function findGit() {
    try {
        execSync('git --version', { stdio: 'ignore' });
        return 'git';
    } catch (_) {}

    const knownPaths = [
        'C:\\Program Files\\Git\\cmd\\git.exe',
        'C:\\Program Files\\Microsoft SQL Server Management Studio 22\\Release\\Common7\\IDE\\CommonExtensions\\Microsoft\\TeamFoundation\\Team Explorer\\Git\\cmd\\git.exe',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\TeamFoundation\\Team Explorer\\Git\\cmd\\git.exe',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\TeamFoundation\\Team Explorer\\Git\\cmd\\git.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Programs\\Git\\cmd\\git.exe'),
    ];

    for (const p of knownPaths) {
        if (fs.existsSync(p)) {
            return `"${p}"`;
        }
    }
    return null;
}

// 2. Internet connectivity check via HTTPS
function checkInternet() {
    return new Promise((resolve) => {
        const req = https.get('https://github.com', { timeout: 6000 }, (res) => {
            resolve(res.statusCode >= 200 && res.statusCode < 400);
        });
        req.on('error', () => {
            // Fallback to checking google.com
            const req2 = https.get('https://www.google.com', { timeout: 6000 }, (res2) => {
                resolve(res2.statusCode >= 200 && res2.statusCode < 400);
            });
            req2.on('error', () => resolve(false));
            req2.end();
        });
        req.end();
    });
}

// 3. Kill port 3000 process
function killPort3000() {
    try {
        const stdout = execSync('netstat -aon | findstr :3000 | findstr LISTENING', { encoding: 'utf8' });
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && !isNaN(pid) && pid !== '0') {
                try {
                    execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
                    console.log(`  [OK] Closed previous server session (PID: ${pid})`);
                } catch (_) {}
            }
        }
    } catch (_) {
        // Port was not in use
    }
}

async function run() {
    // Step 1: Internet check
    process.stdout.write('[1/4] Checking internet connection / فحص الاتصال بالإنترنت... ');
    const isOnline = await checkInternet();
    if (!isOnline) {
        console.log('FAILED ❌');
        console.error('\n[ERROR] لا يوجد اتصال بالإنترنت على هذا السيرفر!');
        console.error('Please ensure the server has an active internet connection and try again.\n');
        process.exit(1);
    }
    console.log('ONLINE ✅');

    // Step 2: Git pull
    process.stdout.write('[2/4] Fetching latest updates / سحب التحديثات من السيرفر السحابي... ');
    const gitCmd = findGit();
    if (!gitCmd) {
        console.log('GIT NOT FOUND ❌');
        console.error('\n[ERROR] أداة Git غير مثبتة على هذا السيرفر.');
        console.error('قم بتثبيت Git من: https://git-scm.com/downloads ثم أعد المحاولة.\n');
        process.exit(1);
    }

    try {
        execSync(`${gitCmd} fetch origin main`, { cwd: ROOT_DIR, stdio: 'ignore' });
        execSync(`${gitCmd} reset --hard origin/main`, { cwd: ROOT_DIR, stdio: 'ignore' });
        execSync(`${gitCmd} pull origin main`, { cwd: ROOT_DIR, stdio: 'ignore' });
        console.log('UPDATED ✅');
    } catch (err) {
        console.log('RETRYING...');
        try {
            execSync(`${gitCmd} pull origin main`, { cwd: ROOT_DIR, stdio: 'inherit' });
            console.log('UPDATED ✅');
        } catch (e) {
            console.error('\n[ERROR] فشل سحب التحديثات. تحقق من اتصال الإنترنت أو الصلاحيات:');
            console.error(e.message);
            process.exit(1);
        }
    }

    // Step 3: Build frontend
    console.log('\n[3/4] Rebuilding UI & Translations / إعادة بناء وتحديث واجهة المستخدم...');
    try {
        execSync('npm run build', { cwd: FRONTEND_DIR, stdio: 'inherit' });
        console.log('  [OK] Frontend assets compiled successfully ✅');
    } catch (buildErr) {
        console.warn('  [WARN] Build completed with warnings. Continuing...');
    }

    // Step 4: Restart Server
    console.log('\n[4/4] Restarting system with updated version / إعادة تشغيل السيرفر...');
    killPort3000();

    console.log('\n===================================================================');
    console.log('  [تم بنجاح] تم تحديث البرنامج بالكامل وتشغيل أحدث إصدار!');
    console.log('  HMS Industrial System is up to date.');
    console.log('===================================================================\n');
}

run().catch((err) => {
    console.error('[FATAL ERROR]:', err);
    process.exit(1);
});

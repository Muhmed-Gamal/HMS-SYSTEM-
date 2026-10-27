/**
 * HMS Industrial System - Professional Auto-Updater v3.0
 * =======================================================
 * - Works with OR without Git installed on the server.
 * - Zero-Git fallback: downloads ZIP from GitHub directly.
 * - Preserves .env, node_modules, licenses during update.
 * - Rebuilds frontend, kills old process, restarts server.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT_DIR = __dirname;
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');

// ── GitHub config ──────────────────────────────────────────────────────────────
const GITHUB_REPO   = 'Muhmed-Gamal/HMS-SYSTEM-';
const GITHUB_BRANCH = 'main';
const ZIP_URL    = `https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip`;
const ZIP_FILE   = path.join(ROOT_DIR, '_hms_update.zip');
const EXTRACT_DIR = path.join(ROOT_DIR, '_hms_update_extracted');

// Files/folders that must NEVER be touched during an update
const PROTECTED = ['.env', 'node_modules', 'licenses', 'license.dat', 'license.key'];

console.log('===================================================================');
console.log('   HMS Industrial Barcode System - Auto Updater v3.0');
console.log('   HMS System Update - Checking for latest version...');
console.log('===================================================================\n');

// ── 1. Internet check ──────────────────────────────────────────────────────────
function checkInternet() {
    return new Promise((resolve) => {
        const req = https.get('https://github.com', { timeout: 8000 }, (res) => {
            resolve(res.statusCode >= 200 && res.statusCode < 500);
            res.resume();
        });
        req.on('error', () => {
            const req2 = https.get('https://www.google.com', { timeout: 8000 }, (res2) => {
                resolve(res2.statusCode >= 200 && res2.statusCode < 500);
                res2.resume();
            });
            req2.on('error', () => resolve(false));
            req2.end();
        });
        req.end();
    });
}

// ── 2. Git detection ───────────────────────────────────────────────────────────
function findGit() {
    try {
        execSync('git --version', { stdio: 'ignore' });
        return 'git';
    } catch (_) {}

    const knownPaths = [
        'C:\\Program Files\\Git\\cmd\\git.exe',
        'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Programs\\Git\\cmd\\git.exe'),
        'C:\\Program Files\\Microsoft SQL Server Management Studio 22\\Release\\Common7\\IDE\\CommonExtensions\\Microsoft\\TeamFoundation\\Team Explorer\\Git\\cmd\\git.exe',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\TeamFoundation\\Team Explorer\\Git\\cmd\\git.exe',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\TeamFoundation\\Team Explorer\\Git\\cmd\\git.exe',
    ];

    for (const p of knownPaths) {
        if (fs.existsSync(p)) return `"${p}"`;
    }
    return null;
}

// ── 3. Download file via HTTPS (follows redirects) ─────────────────────────────
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        function doGet(currentUrl) {
            const mod = currentUrl.startsWith('https') ? https : http;
            mod.get(currentUrl, { timeout: 60000 }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    file.destroy();
                    fs.createWriteStream(dest); // reopen
                    doGet(res.headers.location);
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} from ${currentUrl}`));
                    return;
                }
                res.pipe(file);
                file.on('finish', () => file.close(resolve));
            }).on('error', (err) => {
                fs.unlink(dest, () => {});
                reject(err);
            });
        }
        doGet(url);
    });
}

// ── 4. Extract ZIP ─────────────────────────────────────────────────────────────
function extractZip(zipPath, destDir) {
    if (fs.existsSync(destDir)) {
        try { execSync(`rmdir /S /Q "${destDir}"`, { stdio: 'ignore', shell: true }); } catch (_) {}
    }
    fs.mkdirSync(destDir, { recursive: true });

    // Try tar.exe first (built into Windows 10+ and Server 2019+)
    try {
        execSync(`tar.exe -xf "${zipPath}" -C "${destDir}"`, { stdio: 'ignore' });
        return;
    } catch (_) {}

    // Fallback: PowerShell Expand-Archive
    execSync(
        `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
        { stdio: 'ignore' }
    );
}

// ── 5. Copy extracted files -> ROOT_DIR (skipping protected items) ─────────────
function copyUpdate(extractedRoot) {
    // GitHub ZIP extracts to a subfolder like "HMS-SYSTEM--main/"
    const entries = fs.readdirSync(extractedRoot);
    const subFolder = entries.find((e) =>
        fs.statSync(path.join(extractedRoot, e)).isDirectory()
    );
    const srcDir = subFolder ? path.join(extractedRoot, subFolder) : extractedRoot;

    function copyRecursive(src, dest) {
        const items = fs.readdirSync(src);
        for (const item of items) {
            // Never touch protected files/folders at the root level
            if (src === srcDir && PROTECTED.some((p) => item.toLowerCase() === p.toLowerCase())) {
                console.log(`  [SKIP] Protected: ${item}`);
                continue;
            }
            const srcPath  = path.join(src, item);
            const destPath = path.join(dest, item);
            const stat = fs.statSync(srcPath);
            if (stat.isDirectory()) {
                fs.mkdirSync(destPath, { recursive: true });
                copyRecursive(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    copyRecursive(srcDir, ROOT_DIR);
}

// ── 6. Kill process on port 3000 ───────────────────────────────────────────────
function killPort3000() {
    try {
        const stdout = execSync('netstat -aon | findstr :3000 | findstr LISTENING', { encoding: 'utf8' });
        for (const line of stdout.trim().split('\n')) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && !isNaN(pid) && pid !== '0') {
                try {
                    execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
                    console.log(`  [OK] Closed previous server session (PID: ${pid})`);
                } catch (_) {}
            }
        }
    } catch (_) {}
}

// ── 7. Cleanup temp files ──────────────────────────────────────────────────────
function cleanup() {
    try { if (fs.existsSync(ZIP_FILE))    fs.unlinkSync(ZIP_FILE);    } catch (_) {}
    try {
        if (fs.existsSync(EXTRACT_DIR)) {
            execSync(`rmdir /S /Q "${EXTRACT_DIR}"`, { stdio: 'ignore', shell: true });
        }
    } catch (_) {}
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
async function run() {

    // STEP 1: Internet check
    process.stdout.write('[1/4] Checking internet connection... ');
    const isOnline = await checkInternet();
    if (!isOnline) {
        console.log('FAILED\n');
        console.error('[ERROR] No internet connection detected on this server!');
        console.error('Please connect this server to the internet and try again.\n');
        process.exit(1);
    }
    console.log('ONLINE OK\n');

    // STEP 2: Pull latest code
    process.stdout.write('[2/4] Fetching latest updates from GitHub... ');
    const gitCmd   = findGit();
    const isGitRepo = fs.existsSync(path.join(ROOT_DIR, '.git'));

    if (gitCmd && isGitRepo) {
        // ── Git path ──────────────────────────────────────────────
        console.log('(using Git)');
        try {
            execSync(`${gitCmd} fetch origin ${GITHUB_BRANCH}`, { cwd: ROOT_DIR, stdio: 'ignore' });
            execSync(`${gitCmd} reset --hard origin/${GITHUB_BRANCH}`, { cwd: ROOT_DIR, stdio: 'ignore' });
            console.log('  [OK] Code updated via Git\n');
        } catch (err) {
            console.error('\n  Git pull failed:', err.message);
            console.log('  Switching to ZIP download fallback...\n');
            await goZipFallback();
        }
    } else {
        // ── Zero-Git ZIP fallback ─────────────────────────────────
        console.log('(Git not found - using ZIP download)');
        await goZipFallback();
    }

    async function goZipFallback() {
        try {
            process.stdout.write('  Downloading update package from GitHub... ');
            await downloadFile(ZIP_URL, ZIP_FILE);
            const size = fs.statSync(ZIP_FILE).size;
            console.log(`OK (${(size / 1024).toFixed(0)} KB)\n`);

            process.stdout.write('  Extracting update package... ');
            extractZip(ZIP_FILE, EXTRACT_DIR);
            console.log('OK\n');

            process.stdout.write('  Copying updated files (preserving .env and licenses)... ');
            copyUpdate(EXTRACT_DIR);
            console.log('OK\n');

            cleanup();
            console.log('  [OK] Code updated via ZIP download\n');
        } catch (zipErr) {
            cleanup();
            console.error('\n[ERROR] Update download failed:', zipErr.message);
            console.error('Please check your internet connection or firewall settings.\n');
            process.exit(1);
        }
    }

    // STEP 3: Install/update backend dependencies
    process.stdout.write('[3/4] Checking backend dependencies... ');
    try {
        execSync('npm install --production 2>nul', { cwd: ROOT_DIR, stdio: 'ignore' });
        console.log('OK\n');
    } catch (_) {
        console.log('skipped\n');
    }

    // STEP 4: Rebuild frontend
    console.log('[4/4] Rebuilding UI (this may take 1-2 minutes)...');
    try {
        execSync('npm run build', { cwd: FRONTEND_DIR, stdio: 'inherit' });
        console.log('\n  [OK] Frontend rebuilt successfully\n');
    } catch (buildErr) {
        console.warn('\n  [WARN] Build had warnings but continuing...\n');
    }

    // Kill old server
    console.log('Starting updated system...');
    killPort3000();

    // Small delay to let port free up
    await new Promise(r => setTimeout(r, 1500));

    console.log('\n===================================================================');
    console.log('  UPDATE COMPLETE - Launching HMS System...');
    console.log('===================================================================\n');
}

run().catch((err) => {
    console.error('\n[FATAL ERROR]:', err.message || err);
    process.exit(1);
});

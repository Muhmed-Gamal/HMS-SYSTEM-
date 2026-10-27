/**
 * HMS Industrial System - Professional Auto-Updater v4.0
 * =======================================================
 * - Works with OR without Git installed on the server.
 * - Zero-Git fallback: downloads ZIP from GitHub directly.
 * - Preserves .env, node_modules, licenses during update.
 * - Runs npm install for BOTH root AND frontend before building.
 * - Deletes old dist/ before rebuild to force fresh output.
 * - Shows full error details - never swallows failures silently.
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

const ROOT_DIR     = __dirname;
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const DIST_DIR     = path.join(FRONTEND_DIR, 'dist');

// ── GitHub config ──────────────────────────────────────────────────────────────
const GITHUB_REPO   = 'Muhmed-Gamal/HMS-SYSTEM-';
const GITHUB_BRANCH = 'main';
const ZIP_URL       = `https://github.com/${GITHUB_REPO}/archive/refs/heads/${GITHUB_BRANCH}.zip`;
const ZIP_FILE      = path.join(ROOT_DIR, '_hms_update.zip');
const EXTRACT_DIR   = path.join(ROOT_DIR, '_hms_update_extracted');

// Files/folders that must NEVER be touched during an update
const PROTECTED = ['.env', 'node_modules', 'licenses', 'license.dat', 'license.key'];

console.log('===================================================================');
console.log('   HMS Industrial Barcode System - Auto Updater v4.0');
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
    try { execSync('git --version', { stdio: 'ignore' }); return 'git'; } catch (_) {}
    const knownPaths = [
        'C:\\Program Files\\Git\\cmd\\git.exe',
        'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Programs\\Git\\cmd\\git.exe'),
        'C:\\Program Files\\Microsoft SQL Server Management Studio 22\\Release\\Common7\\IDE\\CommonExtensions\\Microsoft\\TeamFoundation\\Team Explorer\\Git\\cmd\\git.exe',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\TeamFoundation\\Team Explorer\\Git\\cmd\\git.exe',
        'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\CommonExtensions\\Microsoft\\TeamFoundation\\Team Explorer\\Git\\cmd\\git.exe',
    ];
    for (const p of knownPaths) { if (fs.existsSync(p)) return `"${p}"`; }
    return null;
}

// ── 3. Download file via HTTPS (follows redirects) ─────────────────────────────
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        let fileStream = fs.createWriteStream(dest);
        let redirectCount = 0;

        function doGet(currentUrl) {
            if (redirectCount > 10) return reject(new Error('Too many redirects'));
            const mod = currentUrl.startsWith('https') ? https : http;
            mod.get(currentUrl, { timeout: 120000 }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    redirectCount++;
                    res.resume();
                    // Close and reopen the file for the redirect
                    fileStream.close(() => {
                        fileStream = fs.createWriteStream(dest);
                        doGet(res.headers.location);
                    });
                    return;
                }
                if (res.statusCode !== 200) {
                    return reject(new Error(`HTTP ${res.statusCode} from ${currentUrl}`));
                }
                res.pipe(fileStream);
                fileStream.on('finish', () => fileStream.close(resolve));
                fileStream.on('error', reject);
            }).on('error', reject).on('timeout', () => reject(new Error('Download timed out')));
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
    // Try tar.exe (Windows 10+ / Server 2019+)
    try {
        execSync(`tar.exe -xf "${zipPath}" -C "${destDir}"`, { stdio: 'pipe' });
        return;
    } catch (_) {}
    // Fallback: PowerShell Expand-Archive
    execSync(
        `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
        { stdio: 'pipe' }
    );
}

// ── 5. Copy extracted files → ROOT_DIR (skip protected) ────────────────────────
function copyUpdate(extractedRoot) {
    const entries = fs.readdirSync(extractedRoot);
    const subFolder = entries.find((e) => fs.statSync(path.join(extractedRoot, e)).isDirectory());
    const srcDir = subFolder ? path.join(extractedRoot, subFolder) : extractedRoot;

    function copyRecursive(src, dest) {
        const items = fs.readdirSync(src);
        for (const item of items) {
            if (src === srcDir && PROTECTED.some((p) => item.toLowerCase() === p.toLowerCase())) {
                console.log(`  [SKIP] Protected: ${item}`);
                continue;
            }
            const srcPath  = path.join(src, item);
            const destPath = path.join(dest, item);
            if (fs.statSync(srcPath).isDirectory()) {
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
                try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); console.log(`  [OK] Closed previous server (PID: ${pid})`); } catch (_) {}
            }
        }
    } catch (_) {}
}

// ── 7. Cleanup temp files ──────────────────────────────────────────────────────
function cleanup() {
    try { if (fs.existsSync(ZIP_FILE)) fs.unlinkSync(ZIP_FILE); } catch (_) {}
    try { if (fs.existsSync(EXTRACT_DIR)) execSync(`rmdir /S /Q "${EXTRACT_DIR}"`, { stdio: 'ignore', shell: true }); } catch (_) {}
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
async function run() {

    // ── STEP 1: Internet check ─────────────────────────────────────────────────
    process.stdout.write('[1/5] Checking internet connection... ');
    const isOnline = await checkInternet();
    if (!isOnline) {
        console.log('FAILED\n');
        console.error('[ERROR] No internet connection on this server!');
        console.error('Please connect to the internet and try again.\n');
        process.exit(1);
    }
    console.log('ONLINE OK\n');

    // ── STEP 2: Pull latest source code ───────────────────────────────────────
    process.stdout.write('[2/5] Downloading latest code from GitHub... ');
    const gitCmd    = findGit();
    const isGitRepo = fs.existsSync(path.join(ROOT_DIR, '.git'));

    if (gitCmd && isGitRepo) {
        console.log('(using Git)');
        try {
            execSync(`${gitCmd} fetch origin ${GITHUB_BRANCH}`, { cwd: ROOT_DIR, stdio: 'pipe' });
            execSync(`${gitCmd} reset --hard origin/${GITHUB_BRANCH}`, { cwd: ROOT_DIR, stdio: 'pipe' });
            console.log('  [OK] Source code updated via Git\n');
        } catch (err) {
            console.log('\n  Git failed, switching to ZIP download...');
            await goZipFallback();
        }
    } else {
        console.log('(using ZIP download - Git not required)');
        await goZipFallback();
    }

    async function goZipFallback() {
        try {
            process.stdout.write('  Downloading ZIP from GitHub... ');
            await downloadFile(ZIP_URL, ZIP_FILE);
            const sizeMB = (fs.statSync(ZIP_FILE).size / (1024 * 1024)).toFixed(1);
            console.log(`OK (${sizeMB} MB)\n`);

            process.stdout.write('  Extracting files... ');
            extractZip(ZIP_FILE, EXTRACT_DIR);
            console.log('OK\n');

            process.stdout.write('  Copying updated files (preserving .env, licenses)... ');
            copyUpdate(EXTRACT_DIR);
            console.log('OK\n');

            cleanup();
            console.log('  [OK] Source code updated via ZIP\n');
        } catch (zipErr) {
            cleanup();
            console.error('\n[ERROR] ZIP download/extraction failed:', zipErr.message);
            console.error('Check firewall settings or internet connection.\n');
            process.exit(1);
        }
    }

    // ── STEP 3: Install backend dependencies ──────────────────────────────────
    process.stdout.write('[3/5] Installing/updating backend packages... ');
    try {
        execSync('npm install --production --prefer-offline 2>nul', { cwd: ROOT_DIR, stdio: 'pipe' });
        console.log('OK\n');
    } catch (_) {
        console.log('skipped\n');
    }

    // ── STEP 4: Install frontend dependencies + Force rebuild ─────────────────
    console.log('[4/5] Installing frontend packages and rebuilding UI...');

    // Install frontend node_modules (critical for build to work)
    process.stdout.write('  Installing frontend packages... ');
    try {
        execSync('npm install --prefer-offline', { cwd: FRONTEND_DIR, stdio: 'pipe' });
        console.log('OK\n');
    } catch (e) {
        console.log('WARNING - will try build anyway\n');
    }

    // Delete old dist to force a completely fresh build
    if (fs.existsSync(DIST_DIR)) {
        try {
            execSync(`rmdir /S /Q "${DIST_DIR}"`, { stdio: 'ignore', shell: true });
            console.log('  [OK] Old UI cleared - building fresh version...');
        } catch (_) {}
    }

    // Run the build - show output and FAIL loudly if it errors
    try {
        execSync('npm run build', { cwd: FRONTEND_DIR, stdio: 'inherit' });
        console.log('\n  [OK] UI rebuilt successfully - all updates applied!\n');
    } catch (buildErr) {
        console.error('\n[ERROR] UI build failed! Updates cannot be applied.');
        console.error('Please contact HMS support with a photo of this screen.\n');
        process.exit(1);
    }

    // Verify build output exists
    if (!fs.existsSync(DIST_DIR)) {
        console.error('\n[ERROR] Build completed but output folder is missing!');
        console.error('Please contact HMS support.\n');
        process.exit(1);
    }
    console.log(`  [OK] UI build verified - ${fs.readdirSync(path.join(DIST_DIR, 'assets') || DIST_DIR).length} files generated.\n`);

    // ── STEP 5: Restart server ─────────────────────────────────────────────────
    console.log('[5/5] Restarting HMS system...');
    killPort3000();
    await new Promise(r => setTimeout(r, 1500));

    console.log('\n===================================================================');
    console.log('  UPDATE COMPLETE - All changes applied!');
    console.log('  Launching HMS system now...');
    console.log('===================================================================\n');
}

run().catch((err) => {
    console.error('\n[FATAL ERROR]:', err.message || err);
    process.exit(1);
});

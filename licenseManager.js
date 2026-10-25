/**
 * HMS Barcode System - Enterprise License Manager (Core Security Module)
 * ======================================================================
 * إدارة التراخيص المشفرة، كشف التلاعب بالساعة، والتحكم بالهوية.
 * الأولوية القصوى: قراءة ملف hms.lic الفعلي واعتماد اسم المصنع وتاريخ الانتهاء.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENV_PATH = path.join(__dirname, '.env');
try {
    require('dotenv').config({ path: ENV_PATH });
} catch (e) {}

// المفتاح السري المعتمد للتوقيع الرقمي المشفر (HMAC SHA256)
const MASTER_SECRET = 'e1108197b13b4550f647bc81e59c206333965f4e92b95f263e625e657f120d92';
const LICENSE_FILE_NAME = 'hms.lic';
const LICENSE_PATH = path.join(__dirname, LICENSE_FILE_NAME);
const LEGACY_LICENSE_PATH = path.join(__dirname, 'freedom.lic');
const TAMPER_LOG_PATH = path.join(__dirname, '.hms_runtime.dat');

// دالة العثور على ملف الترخيص الفعلي
function getActiveLicensePath() {
    if (fs.existsSync(LICENSE_PATH)) return LICENSE_PATH;
    if (fs.existsSync(LEGACY_LICENSE_PATH)) return LEGACY_LICENSE_PATH;
    return LICENSE_PATH;
}

// دالة تحديث ملف .env تلقائياً عند تغيير اسم الشركة أو الترخيص
function syncEnvCompany(companyName) {
    if (!companyName) return;
    try {
        if (!fs.existsSync(ENV_PATH)) return;
        let envContent = fs.readFileSync(ENV_PATH, 'utf8');
        
        // تحديث COMPANY_NAME_AR
        if (/^COMPANY_NAME_AR=.*/m.test(envContent)) {
            envContent = envContent.replace(/^COMPANY_NAME_AR=.*/m, `COMPANY_NAME_AR=${companyName}`);
        } else {
            envContent = envContent.trimEnd() + `\nCOMPANY_NAME_AR=${companyName}\n`;
        }
        
        // تحديث COMPANY_NAME_EN بحروف إنجليزية أو نظيفة
        const cleanEn = companyName.replace(/[^\x00-\x7F]/g, '').trim() || 'HMS Group';
        if (/^COMPANY_NAME_EN=.*/m.test(envContent)) {
            envContent = envContent.replace(/^COMPANY_NAME_EN=.*/m, `COMPANY_NAME_EN=${cleanEn}`);
        }
        
        fs.writeFileSync(ENV_PATH, envContent, 'utf8');
        process.env.COMPANY_NAME_AR = companyName;
        process.env.COMPANY_NAME_EN = cleanEn;
    } catch (e) {
        console.error('⚠️ تعذر تحديث اسم المصنع في .env:', e.message);
    }
}

/**
 * فحص وتدقيق ترخيص النظام بدقة تامة:
 * 1. إذا وجد ملف ترخيص (hms.lic) يتم فك تشفيره والتحقق من توقيعه، واسم المصنع المكتوب جواه هو المعتمد فوراً!
 * 2. إذا لم يوجد ملف ترخيص:
 *    - إذا كان GENERAL_EDITION=true (وضع المطور الاحتياطي): يعمل كنسخة مفتوحة.
 *    - إذا كان GENERAL_EDITION!=true (وضع العميل): يعتبر الترخيص مفقوداً ويقفل النظام فوراً!
 */
function verifyLicenseFile() {
    const licPath = getActiveLicensePath();
    const hasLicFile = fs.existsSync(licPath);

    // ── الحالة 1: يوجد ملف ترخيص على القرص ──
    if (hasLicFile) {
        try {
            const rawContent = fs.readFileSync(licPath, 'utf8').trim();
            const parts = rawContent.split('.');
            if (parts.length !== 2) {
                return {
                    valid: false,
                    reason: 'MALFORMED_LICENSE',
                    message: 'ملف الترخيص غير صالح أو تالف! يرجى استيراد ملف ترخيص معتمد.'
                };
            }

            const payloadBase64 = parts[0];
            const signature = parts[1];

            // 1. التحقق من التوقيع الرقمي لمنع أي تعديل يدوي
            const expectedSig = crypto.createHmac('sha256', MASTER_SECRET).update(payloadBase64).digest('hex');
            if (signature !== expectedSig) {
                return {
                    valid: false,
                    reason: 'INVALID_SIGNATURE',
                    message: 'تم رصد تلاعب في ملف الترخيص! الترخيص غير معتمد رسمياً.'
                };
            }

            // 2. قراءة بيانات الترخيص
            const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
            const licenseData = JSON.parse(payloadJson);

            const now = new Date();
            const expiryDate = new Date(licenseData.expires_at);

            // 3. التحقق من تلاعب ساعة الجهاز (Anti-Clock Rollback)
            if (fs.existsSync(TAMPER_LOG_PATH)) {
                try {
                    const encLastRun = fs.readFileSync(TAMPER_LOG_PATH, 'utf8').trim();
                    const lastRunMs = parseInt(Buffer.from(encLastRun, 'base64').toString('utf8'), 10);
                    if (!isNaN(lastRunMs) && now.getTime() < (lastRunMs - 1000 * 60 * 30)) {
                        return {
                            valid: false,
                            reason: 'CLOCK_ROLLBACK_DETECTED',
                            client: licenseData.client,
                            message: 'تم رصد ترجيع أو تلاعب في تاريخ ووقت الويندوز! تم إيقاف النظام لحماية البيانات والترخيص.'
                        };
                    }
                } catch (e) {}
            }

            // تسجيل وقت التشغيل مشفراً
            try {
                fs.writeFileSync(TAMPER_LOG_PATH, Buffer.from(String(now.getTime())).toString('base64'), 'utf8');
            } catch (e) {}

            // 4. التحقق من تاريخ انتهاء الصلاحية
            if (now > expiryDate) {
                return {
                    valid: false,
                    reason: 'EXPIRED',
                    client: licenseData.client,
                    client_en: licenseData.client_en || licenseData.client,
                    contract_id: licenseData.contract_id,
                    expires_at: licenseData.expires_at,
                    days_remaining: 0,
                    message: `انتهت مدة صلاحية ترخيص النظام للمصنع بتاريخ (${expiryDate.toLocaleDateString('ar-EG-u-nu-latn')}). يرجى تجديد التعاقد.`
                };
            }

            const daysRemaining = Math.max(0, Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)));

            return {
                valid: true,
                is_master_general: false,
                client: licenseData.client,
                client_en: licenseData.client_en || licenseData.client,
                contract_id: licenseData.contract_id,
                issued_at: licenseData.issued_at,
                expires_at: licenseData.expires_at,
                days_remaining: daysRemaining,
                kill_switch_url: licenseData.kill_switch_url || null,
                message: `الترخيص سارٍ ومعتمد للمصنع: [${licenseData.client}] (متبقي ${daysRemaining} يوم).`
            };
        } catch (err) {
            return {
                valid: false,
                reason: 'PARSE_ERROR',
                message: 'تعذر قراءة بيانات ملف الترخيص: ' + err.message
            };
        }
    }

    // ── الحالة 2: لا يوجد ملف ترخيص على القرص ──
    // إذا كانت النسخة محددة كـ وضع المطور العام (GENERAL_EDITION=true)
    if (process.env.GENERAL_EDITION === 'true') {
        const sysNameAr = process.env.COMPANY_NAME_AR || 'HMS Group';
        const sysNameEn = process.env.COMPANY_NAME_EN || 'HMS Group';
        return {
            valid: true,
            is_master_general: true,
            client: sysNameAr,
            client_en: sysNameEn,
            contract_id: 'MASTER-DEVELOPER-EDITION',
            issued_at: new Date('2026-01-01').toISOString(),
            expires_at: new Date(Date.now() + 40 * 365 * 24 * 60 * 60 * 1000).toISOString(),
            days_remaining: 14600,
            message: 'نسخة المطور العامة (Master Developer Edition) - مفعلة بدون قيود.'
        };
    }

    // نسخة العميل ولا يوجد ملف ترخيص -> قفل النظام فوراً!
    return {
        valid: false,
        reason: 'MISSING_LICENSE',
        client: 'نسخة غير مرخصة',
        message: 'ملف ترخيص النظام (hms.lic) غير موجود! يرجى تفعيل مفتاح الترخيص أو وضع الملف المعتمد لتشغيل النظام.'
    };
}

/**
 * فحص الـ Kill Switch عن بُعد
 */
async function checkRemoteKillSwitch(killSwitchUrl) {
    if (!killSwitchUrl) return { active: true };
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(killSwitchUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
            const data = await res.json();
            if (data.status === 'REVOKED' || data.status === 'SUSPENDED') {
                return {
                    active: false,
                    message: data.reason || 'تم إيقاف صلاحية النظام رسمياً من قبل مالك ومبرمج السيستم.'
                };
            }
        }
    } catch (e) {}
    return { active: true };
}

/**
 * توليد وتوقيع وحفظ ملف ترخيص جديد وتطبيقه فوراً
 */
function generateAndSaveLicense({ client, days, killSwitchUrl }) {
    const clientName = (client || '').trim() || 'مصنع العميل';
    const now = new Date();
    const durationDays = parseInt(days, 10) || 365;
    const expiry = new Date(now.getTime() + (durationDays * 24 * 60 * 60 * 1000));
    const contractId = 'HMS-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    const licensePayload = {
        client: clientName,
        contract_id: contractId,
        issued_at: now.toISOString(),
        expires_at: expiry.toISOString(),
        duration_days: durationDays,
        kill_switch_url: killSwitchUrl || null
    };

    const payloadBase64 = Buffer.from(JSON.stringify(licensePayload), 'utf8').toString('base64');
    const signature = crypto.createHmac('sha256', MASTER_SECRET).update(payloadBase64).digest('hex');
    const signedLicenseKey = `${payloadBase64}.${signature}`;

    // حفظ في hms.lic دائماً
    fs.writeFileSync(LICENSE_PATH, signedLicenseKey, 'utf8');

    // إذا كان هناك freedom.lic قديم، نقوم بتحديثه أو إزالته
    try {
        if (fs.existsSync(LEGACY_LICENSE_PATH)) {
            fs.writeFileSync(LEGACY_LICENSE_PATH, signedLicenseKey, 'utf8');
        }
    } catch (e) {}

    // مزامنة اسم المصنع الجديد في .env
    syncEnvCompany(clientName);

    return {
        success: true,
        license_key: signedLicenseKey,
        client: licensePayload.client,
        contract_id: contractId,
        issued_at: licensePayload.issued_at,
        expires_at: licensePayload.expires_at,
        duration_days: durationDays
    };
}

/**
 * تفعيل واستيراد ترخيص جديد من نص المفتاح (Base64.Signature)
 */
function activateLicenseKey(rawContent) {
    if (!rawContent || typeof rawContent !== 'string') {
        return { valid: false, message: 'محتوى مفتاح الترخيص فارغ أو غير صالح.' };
    }
    const cleanContent = rawContent.trim();
    const parts = cleanContent.split('.');
    if (parts.length !== 2) {
        return { valid: false, message: 'صيغة كود الترخيص غير صحيحة. يجب أن يتكون من مقطعين تفصل بينهما نقطة.' };
    }

    const payloadBase64 = parts[0];
    const signature = parts[1];

    const expectedSig = crypto.createHmac('sha256', MASTER_SECRET).update(payloadBase64).digest('hex');
    if (signature !== expectedSig) {
        return { valid: false, message: 'مفتاح الترخيص غير معتمد رسمياً أو تم التلاعب به!' };
    }

    // قراءة البيانات للتأكد من اسم العميل
    try {
        const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
        const licenseData = JSON.parse(payloadJson);
        
        // كتابة الملف المعتمد
        fs.writeFileSync(LICENSE_PATH, cleanContent, 'utf8');
        
        // مزامنة اسم المصنع في .env
        if (licenseData.client) {
            syncEnvCompany(licenseData.client);
        }
    } catch (e) {
        fs.writeFileSync(LICENSE_PATH, cleanContent, 'utf8');
    }

    return verifyLicenseFile();
}

module.exports = {
    MASTER_SECRET,
    LICENSE_PATH,
    verifyLicenseFile,
    checkRemoteKillSwitch,
    generateAndSaveLicense,
    activateLicenseKey
};

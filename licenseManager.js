/**
 * HMS Barcode System - Enterprise License Manager (Core Security Module)
 * Handles encrypted license verification, tamper prevention, anti-clock-rollback, and remote kill-switch.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
try {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (e) {}

// المفتاح السري الرئيسي المضمن بالتطبيق المجمع (توقيع HMAC SHA256)
const MASTER_SECRET = 'e1108197b13b4550f647bc81e59c206333965f4e92b95f263e625e657f120d92';
const LICENSE_PATH = fs.existsSync(path.join(__dirname, 'hms.lic'))
    ? path.join(__dirname, 'hms.lic')
    : (fs.existsSync(path.join(__dirname, 'freedom.lic')) ? path.join(__dirname, 'freedom.lic') : path.join(__dirname, 'hms.lic'));
const TAMPER_LOG_PATH = path.join(__dirname, '.hms_runtime.dat');

// الاسم العام الافتراضي للنسخة الجنرال (الرئيسية)
const GENERAL_SYSTEM_NAME = process.env.COMPANY_NAME_AR || 'HMS Group';
const GENERAL_COMPANY_EN = process.env.COMPANY_NAME_EN || 'HMS Group';

/**
 * فك تشفير وتدقيق ملف الترخيص hms.lic
 * إذا وُجد ملف ترخيص (.lic) يتم تطبيق اسم الشركة وتاريخ الانتهاء المذكورين فيه.
 * وإذا لم يوجد ملف ترخيص في هذه النسخة (Master General Mode)، تعمل النسخة كنسخة عامة مفعلة مدى الحياة بدون أي قيود!
 */
function verifyLicenseFile() {
    // If running in General Edition (development copy), force perpetual master mode
    if (process.env.GENERAL_EDITION === 'true') {
        return {
            valid: true,
            is_master_general: true,
            client: GENERAL_SYSTEM_NAME,
            client_en: GENERAL_COMPANY_EN,
            contract_id: 'MASTER-PERMANENT-LICENSE',
            issued_at: new Date('2026-01-01').toISOString(),
            expires_at: new Date(Date.now() + 40 * 365 * 24 * 60 * 60 * 1000).toISOString(),
            days_remaining: 26732,
            message: 'نسخة المطور العامة (Master General Edition) - مفعلة مدى الحياة.'
        };
    }
    // إذا لم تكن النسخة العامة (وضع العميل) ولم يوجد ملف ترخيص، يتم طلب الترخيص
    if (!fs.existsSync(LICENSE_PATH)) {
        return {
            valid: false,
            reason: 'MISSING_LICENSE',
            message: 'ملف الترخيص غير موجود! يرجى وضع أو تفعيل ملف الترخيص المعتمد (.lic) لتشغيل النظام.'
        };
    }


    try {
        const rawContent = fs.readFileSync(LICENSE_PATH, 'utf8').trim();
        const parts = rawContent.split('.');
        if (parts.length !== 2) {
            return {
                valid: false,
                reason: 'MALFORMED_LICENSE',
                message: 'ملف الترخيص غير صالح أو تالف! يرجى التواصل مع مالك النظام المعتمد.'
            };
        }

        const payloadBase64 = parts[0];
        const signature = parts[1];

        // 1. التحقق من صحة التوقيع الرقمي لمنع التعديل نهائياً
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

        // 3. التحقق من صلاحية التاريخ (Anti-Clock Rollback)
        if (fs.existsSync(TAMPER_LOG_PATH)) {
            try {
                const encLastRun = fs.readFileSync(TAMPER_LOG_PATH, 'utf8').trim();
                const lastRunMs = parseInt(Buffer.from(encLastRun, 'base64').toString('utf8'), 10);
                if (!isNaN(lastRunMs) && now.getTime() < (lastRunMs - 1000 * 60 * 30)) {
                    return {
                        valid: false,
                        reason: 'CLOCK_ROLLBACK_DETECTED',
                        message: 'تم رصد تغيير أو ترجيع في ساعة وتاريخ الويندوز! تم إيقاف النظام لحماية الترخيص.'
                    };
                }
            } catch (e) {}
        }

        // تسجيل وقت التشغيل الحالي مشفراً لمنع التلاعب بساعة الجهاز
        try {
            fs.writeFileSync(TAMPER_LOG_PATH, Buffer.from(String(now.getTime())).toString('base64'), 'utf8');
        } catch (e) {}

        // 4. التحقق من انتهاء الصلاحية
        if (now > expiryDate) {
            return {
                valid: false,
                reason: 'EXPIRED',
                client: licenseData.client,
                expires_at: licenseData.expires_at,
                message: `انتهت مدة صلاحية ترخيص النظام بتاريخ (${expiryDate.toLocaleDateString('ar-EG')}). يرجى التواصل مع المبرمج لتجديد التعاقد.`
            };
        }

        const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

        return {
            valid: true,
            client: licenseData.client,
            contract_id: licenseData.contract_id,
            issued_at: licenseData.issued_at,
            expires_at: licenseData.expires_at,
            days_remaining: daysRemaining,
            kill_switch_url: licenseData.kill_switch_url || null
        };
    } catch (err) {
        return {
            valid: false,
            reason: 'PARSE_ERROR',
            message: 'تعذر قراءة بيانات الترخيص: ' + err.message
        };
    }
}

/**
 * فحص الـ Kill Switch عن بُعد في حال إدخال رابط تحقق سحابي
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
    } catch (e) {
        // في حال عدم وجود إنترنت يعمل دون إيقاف إلى أن ينتهي تاريخ الترخيص المحلي
    }
    return { active: true };
}

/**
 * توليد وتوقيع وحفظ ملف ترخيص جديد مباشرة
 */
function generateAndSaveLicense({ client, days, killSwitchUrl }) {
    const now = new Date();
    const durationDays = parseInt(days, 10) || 30;
    const expiry = new Date(now.getTime() + (durationDays * 24 * 60 * 60 * 1000));
    const contractId = 'CTR-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const licensePayload = {
        client: client || 'عميل معتمد',
        contract_id: contractId,
        issued_at: now.toISOString(),
        expires_at: expiry.toISOString(),
        duration_days: durationDays,
        kill_switch_url: killSwitchUrl || null
    };

    const payloadBase64 = Buffer.from(JSON.stringify(licensePayload), 'utf8').toString('base64');
    const signature = crypto.createHmac('sha256', MASTER_SECRET).update(payloadBase64).digest('hex');

    const signedLicenseKey = `${payloadBase64}.${signature}`;
    fs.writeFileSync(LICENSE_PATH, signedLicenseKey, 'utf8');

    return {
        success: true,
        client: licensePayload.client,
        contract_id: contractId,
        issued_at: licensePayload.issued_at,
        expires_at: licensePayload.expires_at,
        duration_days: durationDays
    };
}

/**
 * تفعيل واستيراد ملف ترخيص من نص أو ملف مرفوع
 */
function activateLicenseKey(rawContent) {
    if (!rawContent || typeof rawContent !== 'string') {
        return { valid: false, message: 'محتوى مفتاح الترخيص غير صالح أو فارغ.' };
    }
    const cleanContent = rawContent.trim();
    const parts = cleanContent.split('.');
    if (parts.length !== 2) {
        return { valid: false, message: 'صيغة ملف الترخيص غير صحيحة.' };
    }
    const expectedSig = crypto.createHmac('sha256', MASTER_SECRET).update(parts[0]).digest('hex');
    if (parts[1] !== expectedSig) {
        return { valid: false, message: 'مفتاح الترخيص غير معتمد أو تم التلاعب به!' };
    }
    fs.writeFileSync(LICENSE_PATH, cleanContent, 'utf8');
    return verifyLicenseFile();
}

module.exports = {
    MASTER_SECRET,
    verifyLicenseFile,
    checkRemoteKillSwitch,
    generateAndSaveLicense,
    activateLicenseKey
};


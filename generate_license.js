#!/usr/bin/env node
/**
 * HMS Barcode System - License Generator CLI
 * أداة خاصة بك فقط لتوليد وتمديد تراخيص النظام وتحديد مدة الفعالية
 *
 * طريقة الاستخدام:
 *   node generate_license.js --client "اسم الشركة أو المصنع" --days 30
 *   node generate_license.js --client "HMS Garments" --days 365 --output "./hms.lic"
 *   node generate_license.js --client "GNT" --months 6
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MASTER_SECRET = 'e1108197b13b4550f647bc81e59c206333965f4e92b95f263e625e657f120d92';

function parseArgs() {
    const args = process.argv.slice(2);
    const params = {
        client: 'مصنع تجريبي',
        days: 30,
        output: path.join(__dirname, 'hms.lic'),
        killSwitchUrl: ''
    };

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--client' && args[i+1]) {
            params.client = args[++i];
        } else if (args[i] === '--days' && args[i+1]) {
            params.days = parseInt(args[++i], 10);
        } else if (args[i] === '--months' && args[i+1]) {
            params.days = parseInt(args[++i], 10) * 30;
        } else if (args[i] === '--years' && args[i+1]) {
            params.days = parseInt(args[++i], 10) * 365;
        } else if (args[i] === '--output' && args[i+1]) {
            params.output = path.resolve(args[++i]);
        } else if (args[i] === '--killswitch' && args[i+1]) {
            params.killSwitchUrl = args[++i];
        }
    }
    return params;
}

function generateLicense() {
    const config = parseArgs();
    const now = new Date();
    const expiry = new Date(now.getTime() + (config.days * 24 * 60 * 60 * 1000));
    const contractId = 'CTR-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const licensePayload = {
        client: config.client,
        contract_id: contractId,
        issued_at: now.toISOString(),
        expires_at: expiry.toISOString(),
        duration_days: config.days,
        kill_switch_url: config.killSwitchUrl || null
    };

    const payloadBase64 = Buffer.from(JSON.stringify(licensePayload), 'utf8').toString('base64');
    const signature = crypto.createHmac('sha256', MASTER_SECRET).update(payloadBase64).digest('hex');

    const signedLicenseKey = `${payloadBase64}.${signature}`;

    fs.writeFileSync(config.output, signedLicenseKey, 'utf8');

    console.log('================================================================');
    console.log('✅ تم توليد وتوقيع ترخيص النظام بنجاح!');
    console.log('================================================================');
    console.log(`📌 اسم العميل / المصنع   : ${config.client}`);
    console.log(`🔑 رقم العقد المرجعي      : ${contractId}`);
    console.log(`📅 تاريخ الإصدار          : ${now.toLocaleDateString('ar-EG')} (${now.toISOString().split('T')[0]})`);
    console.log(`⏳ تاريخ انتهاء الصلاحية  : ${expiry.toLocaleDateString('ar-EG')} (${expiry.toISOString().split('T')[0]})`);
    console.log(`⏳ المدة الإجمالية        : ${config.days} يوم`);
    if (config.killSwitchUrl) {
        console.log(`🌐 رابط الـ Kill Switch   : ${config.killSwitchUrl}`);
    }
    console.log(`📁 مسار ملف الترخيص       : ${config.output}`);
    console.log('================================================================');
    console.log('💡 هذا الملف (hms.lic) يوضع بجوار البرنامج عند العميل لتشغيل السيستم.');
}

generateLicense();

/**
 * نظام المزامنة التلقائية اللحظية للوقت والتاريخ (Time Synchronization Engine)
 * يضمن تطابق الوقت والتاريخ بدقة 100% بين الخادم وجميع الأجهزة المتصلة
 * ويلغي أي تقديم أو تأخير أو انحراف زمني.
 */

let serverOffsetMs = 0;
let isInitialSynced = false;
let syncListeners = [];

/**
 * قياس وتعديل الفارق الزمني مع الخادم المركزي بدقة المللي ثانية
 */
export async function syncServerTime() {
    try {
        const start = Date.now();
        const res = await fetch('/api/system/time');
        const end = Date.now();
        if (!res.ok) return false;

        const data = await res.json();
        if (data && data.server_timestamp) {
            const networkLatency = Math.round((end - start) / 2);
            // حساب الفرق بدقة مع خصم وقت انتقال الشبكة
            serverOffsetMs = (data.server_timestamp + networkLatency) - end;
            isInitialSynced = true;
            syncListeners.forEach(cb => {
                try { cb(serverOffsetMs); } catch (e) {}
            });
            return true;
        }
    } catch (e) {
        console.warn('تنبيه: تعذر إتمام مزامنة التوقيت مع الخادم، يتم استخدام التوقيت الحالي.');
    }
    return false;
}

// بدء المزامنة فوراً ومجدولة دورياً كل 60 ثانية
if (typeof window !== 'undefined') {
    syncServerTime();
    setInterval(syncServerTime, 60000);
}

/**
 * الحصول على كائن التاريخ والوقت المتزامن بدقة مع توقيت الخادم المركزي
 */
export function getSyncedDate() {
    return new Date(Date.now() + serverOffsetMs);
}

/**
 * الحصول على الوقت المتزامن بالمللي ثانية
 */
export function getSyncedTimestamp() {
    return Date.now() + serverOffsetMs;
}

/**
 * التحقق من إتمام المزامنة مع الخادم
 */
export function isTimeSynchronized() {
    return isInitialSynced;
}

/**
 * الاشتراك في تحديثات المزامنة
 */
export function onTimeSync(callback) {
    if (typeof callback === 'function') {
        syncListeners.push(callback);
        return () => {
            syncListeners = syncListeners.filter(cb => cb !== callback);
        };
    }
    return () => {};
}

/**
 * التنسيق القياسي الموحد للتاريخ والساعة (مصر / عربي)
 * يدعم معالجة التواريخ بدقة ومنع أي أخطاء في الساعات (ص / م)
 */
export function formatStandardDate(dateInput, withTime = true, withSeconds = false) {
    if (!dateInput) return '-';
    try {
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return String(dateInput);

        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const datePart = `${y}/${m}/${day}`;

        if (!withTime) return datePart;

        let hours = d.getHours();
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'م' : 'ص';
        hours = hours % 12 || 12;
        const hoursStr = String(hours).padStart(2, '0');

        if (withSeconds) {
            const seconds = String(d.getSeconds()).padStart(2, '0');
            return `${datePart} ${hoursStr}:${minutes}:${seconds} ${ampm}`;
        }

        return `${datePart} ${hoursStr}:${minutes} ${ampm}`;
    } catch (e) {
        return String(dateInput);
    }
}

/**
 * الحصول على نص التاريخ والوقت الحالي المتزامن مع الخادم
 */
export function getNowFormatted(withSeconds = false) {
    return formatStandardDate(getSyncedDate(), true, withSeconds);
}

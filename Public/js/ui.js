/**
 * HMS Barcode System - Shared UI Utilities (v5.0 Navy & Slate Theme)
 * Unified Toast & Alert/Confirm Modals with balanced contrast
 */

// Universal English / Latin numerals and date formatting helpers (0-9)
window.fmtN = (n, fallback = '0') => (n == null || isNaN(Number(n))) ? fallback : Number(n).toLocaleString('en-US');
window.fmtDate = (d, withTime = false) => {
    if (!d) return '-';
    try {
        const date = new Date(d);
        if (isNaN(date.getTime())) return String(d);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const datePart = `${y}/${m}/${day}`;
        if (!withTime) return datePart;
        let h = date.getHours();
        const min = String(date.getMinutes()).padStart(2, '0');
        const ampm = h >= 12 ? 'م' : 'ص';
        h = h % 12 || 12;
        return `${datePart} ${String(h).padStart(2, '0')}:${min} ${ampm}`;
    } catch (e) {
        return String(d);
    }
};
window.fmtDateTime = (d) => window.fmtDate(d, true);

const FreedomUI = (() => {
    let toastContainer = null;
    let alertModal = null;
    let confirmModal = null;
    let confirmCallback = null;

    let audioCtx = null;
    function getAudioContext() {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) audioCtx = new AudioContextClass();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    function playTone(freq, type, duration, delay = 0) {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;
            setTimeout(() => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
                gain.gain.setValueAtTime(0.12, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + duration);
            }, delay);
        } catch (e) {}
    }

    function playBeepSuccess() {
        playTone(987.77, 'sine', 0.08, 0);
        playTone(1318.51, 'sine', 0.10, 80);
    }

    function playBeepError() {
        playTone(220, 'sawtooth', 0.18, 0);
        playTone(180, 'sawtooth', 0.22, 140);
    }

    function ensureToastContainer() {
        if (toastContainer) return toastContainer;
        toastContainer = document.createElement('div');
        toastContainer.id = 'freedom-toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 9999;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            pointer-events: none;
            width: 100%;
            max-width: 440px;
            padding: 0 16px;
        `;
        document.body.appendChild(toastContainer);
        return toastContainer;
    }

    function ensureModals() {
        if (alertModal) return;

        // Alert Modal
        alertModal = document.createElement('div');
        alertModal.id = 'freedom-alert-modal';
        alertModal.style.cssText = `display:none; position:fixed; inset:0; background:rgba(10,17,32,0.7); backdrop-filter:blur(8px); z-index:9990; align-items:center; justify-content:center; padding:16px;`;
        alertModal.innerHTML = `
            <div class="slate-card p-6 sm:p-7 w-full max-w-[400px] text-center shadow-2xl" style="border-radius:16px;">
                <div id="freedom-alert-icon" class="w-12 h-12 rounded-full mx-auto mb-3.5 flex items-center justify-center text-lg"></div>
                <h3 id="freedom-alert-title" class="text-white text-base font-bold mb-1.5 font-sans"></h3>
                <p id="freedom-alert-msg" class="text-slate-300 text-xs leading-relaxed mb-5 font-sans"></p>
                <div id="freedom-progress-wrap" style="display:none;margin-bottom:16px;">
                    <div class="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700 mb-1.5">
                        <div id="freedom-progress-bar" class="h-2 rounded-full bg-blue-500 transition-all duration-150" style="width:0%;"></div>
                    </div>
                    <div id="freedom-progress-text" class="text-xs font-mono font-bold text-blue-400">0%</div>
                </div>
                <button id="freedom-alert-ok" class="btn-slate btn-slate-primary w-full py-2.5 text-xs font-semibold">موافق</button>
            </div>
        `;
        document.body.appendChild(alertModal);
        document.getElementById('freedom-alert-ok').addEventListener('click', closeAlert);

        // Confirm Modal
        confirmModal = document.createElement('div');
        confirmModal.id = 'freedom-confirm-modal';
        confirmModal.style.cssText = `display:none; position:fixed; inset:0; background:rgba(10,17,32,0.7); backdrop-filter:blur(8px); z-index:9991; align-items:center; justify-content:center; padding:16px;`;
        confirmModal.innerHTML = `
            <div class="slate-card p-6 sm:p-7 w-full max-w-[400px] text-center shadow-2xl" style="border-radius:16px;">
                <div class="w-12 h-12 rounded-full mx-auto mb-3.5 flex items-center justify-center text-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3 id="freedom-confirm-title" class="text-white text-base font-bold mb-1.5 font-sans"></h3>
                <p id="freedom-confirm-msg" class="text-slate-300 text-xs leading-relaxed mb-5 font-sans"></p>
                <div class="flex gap-2.5">
                    <button id="freedom-confirm-yes" class="btn-slate btn-slate-primary flex-1 py-2 text-xs font-semibold">تأكيد</button>
                    <button id="freedom-confirm-no" class="btn-slate btn-slate-secondary flex-1 py-2 text-xs font-semibold">إلغاء</button>
                </div>
            </div>
        `;
        document.body.appendChild(confirmModal);
        document.getElementById('freedom-confirm-yes').addEventListener('click', () => {
            closeConfirm();
            if (confirmCallback) confirmCallback(true);
        });
        document.getElementById('freedom-confirm-no').addEventListener('click', () => {
            closeConfirm();
            if (confirmCallback) confirmCallback(false);
        });
    }

    function closeAlert() {
        if (alertModal) alertModal.style.display = 'none';
    }

    function closeConfirm() {
        if (confirmModal) confirmModal.style.display = 'none';
    }

    return {
        beepSuccess: playBeepSuccess,
        beepError: playBeepError,

        toast(message, type = 'info', duration = 3000) {
            const container = ensureToastContainer();
            const toast = document.createElement('div');

            const styles = {
                success: { bg: '#132338', border: 'rgba(16,185,129,0.3)', text: '#34d399', icon: 'fa-check-circle' },
                error:   { bg: '#231520', border: 'rgba(239,68,68,0.3)', text: '#f87171', icon: 'fa-times-circle' },
                warning: { bg: '#251e15', border: 'rgba(245,158,11,0.3)', text: '#fbbf24', icon: 'fa-exclamation-circle' },
                info:    { bg: '#131f37', border: 'rgba(59,130,246,0.3)', text: '#60a5fa', icon: 'fa-info-circle' }
            };

            const s = styles[type] || styles.info;

            toast.style.cssText = `
                background: ${s.bg};
                border: 1px solid ${s.border};
                color: #f8fafc;
                padding: 10px 16px;
                border-radius: 10px;
                font-size: 13px;
                font-family: var(--font-ar, sans-serif);
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 10px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.4);
                pointer-events: auto;
                cursor: pointer;
                transition: opacity 0.2s ease, transform 0.2s ease;
                direction: rtl;
                width: 100%;
                justify-content: space-between;
            `;

            toast.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;">
                    <i class="fas ${s.icon}" style="color:${s.text};font-size:15px;"></i>
                    <span style="font-size:12.5px;font-weight:600;">${message}</span>
                </div>
                <span style="font-size:14px;color:#94a3b8;margin-right:8px;">&times;</span>
            `;

            toast.onclick = () => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-6px)';
                setTimeout(() => toast.remove(), 200);
            };

            container.appendChild(toast);

            setTimeout(() => {
                if (toast.parentElement) {
                    toast.style.opacity = '0';
                    toast.style.transform = 'translateY(-6px)';
                    setTimeout(() => toast.remove(), 200);
                }
            }, duration);
        },

        alert(title, message, type = 'info') {
            ensureModals();
            const config = {
                success: { bg: 'rgba(16,185,129,0.15)', color: '#34d399', icon: '<i class="fas fa-check"></i>' },
                error:   { bg: 'rgba(239,68,68,0.15)', color: '#f87171', icon: '<i class="fas fa-times"></i>' },
                warning: { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', icon: '<i class="fas fa-exclamation-triangle"></i>' },
                info:    { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', icon: '<i class="fas fa-info"></i>' }
            };
            const c = config[type] || config.info;
            const iconEl = document.getElementById('freedom-alert-icon');
            iconEl.style.background = c.bg;
            iconEl.style.color = c.color;
            iconEl.innerHTML = c.icon;

            document.getElementById('freedom-alert-title').textContent = title;
            document.getElementById('freedom-alert-msg').textContent = message;
            document.getElementById('freedom-progress-wrap').style.display = 'none';
            const okBtn = document.getElementById('freedom-alert-ok');
            if (okBtn) okBtn.style.display = 'block';
            alertModal.style.display = 'flex';
        },

        confirm(title, message, onConfirmOrOptions, yesText, noText) {
            return new Promise((resolve) => {
                ensureModals();
                document.getElementById('freedom-confirm-title').textContent = title;
                document.getElementById('freedom-confirm-msg').textContent = message;

                const yesBtn = document.getElementById('freedom-confirm-yes');
                const noBtn = document.getElementById('freedom-confirm-no');
                if (yesBtn && typeof yesText === 'string') yesBtn.textContent = yesText;
                if (noBtn && typeof noText === 'string') noBtn.textContent = noText;

                confirmCallback = (result) => {
                    if (result && typeof onConfirmOrOptions === 'function') {
                        onConfirmOrOptions();
                    }
                    resolve(result);
                    // Reset button text
                    if (yesBtn) yesBtn.textContent = 'تأكيد';
                    if (noBtn) noBtn.textContent = 'إلغاء';
                };
                confirmModal.style.display = 'flex';
            });
        },

        showProgress(title, message, percent = 0) {
            ensureModals();
            const iconEl = document.getElementById('freedom-alert-icon');
            iconEl.style.background = 'rgba(59,130,246,0.15)';
            iconEl.style.color = '#60a5fa';
            iconEl.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

            document.getElementById('freedom-alert-title').textContent = title;
            document.getElementById('freedom-alert-msg').textContent = message;
            document.getElementById('freedom-progress-wrap').style.display = 'block';
            document.getElementById('freedom-progress-bar').style.width = `${percent}%`;
            document.getElementById('freedom-progress-text').textContent = `${Math.round(percent)}%`;
            alertModal.style.display = 'flex';
        },

        updateProgress(percent, message) {
            if (!alertModal || alertModal.style.display === 'none') return;
            document.getElementById('freedom-progress-bar').style.width = `${percent}%`;
            document.getElementById('freedom-progress-text').textContent = `${Math.round(percent)}%`;
            if (message) document.getElementById('freedom-alert-msg').textContent = message;
        },

        showLoading(title = 'جاري التحميل...', message = 'يرجى الانتظار...') {
            ensureModals();
            const iconEl = document.getElementById('freedom-alert-icon');
            iconEl.style.background = 'rgba(59,130,246,0.15)';
            iconEl.style.color = '#60a5fa';
            iconEl.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

            document.getElementById('freedom-alert-title').textContent = title;
            document.getElementById('freedom-alert-msg').textContent = message;
            document.getElementById('freedom-progress-wrap').style.display = 'none';
            const okBtn = document.getElementById('freedom-alert-ok');
            if (okBtn) okBtn.style.display = 'none';
            alertModal.style.display = 'flex';
        },

        closeAlert() {
            closeAlert();
            const okBtn = document.getElementById('freedom-alert-ok');
            if (okBtn) okBtn.style.display = 'block';
        },

        closeModal() {
            closeAlert();
            closeConfirm();
            const okBtn = document.getElementById('freedom-alert-ok');
            if (okBtn) okBtn.style.display = 'block';
        },

        warning(title, message) {
            return new Promise((resolve) => {
                this.alert(title, message, 'warning');
                const okBtn = document.getElementById('freedom-alert-ok');
                if (okBtn) {
                    okBtn.style.display = 'block';
                    const handler = () => {
                        okBtn.removeEventListener('click', handler);
                        resolve();
                    };
                    okBtn.addEventListener('click', handler);
                } else {
                    resolve();
                }
            });
        },

        error(title, message) {
            return new Promise((resolve) => {
                this.alert(title, message, 'error');
                const okBtn = document.getElementById('freedom-alert-ok');
                if (okBtn) {
                    okBtn.style.display = 'block';
                    const handler = () => {
                        okBtn.removeEventListener('click', handler);
                        resolve();
                    };
                    okBtn.addEventListener('click', handler);
                } else {
                    resolve();
                }
            });
        },

        success(title, message) {
            return new Promise((resolve) => {
                this.alert(title, message, 'success');
                const okBtn = document.getElementById('freedom-alert-ok');
                if (okBtn) {
                    okBtn.style.display = 'block';
                    const handler = () => {
                        okBtn.removeEventListener('click', handler);
                        resolve();
                    };
                    okBtn.addEventListener('click', handler);
                } else {
                    resolve();
                }
            });
        }
    };
})();

function getCurrentUser() {
    try {
        const u = localStorage.getItem('hms_user') || localStorage.getItem('freedom_user');
        return u ? JSON.parse(u) : null;
    } catch (e) {
        return null;
    }
}

const HMSUI = FreedomUI;
window.HMSUI = FreedomUI;
window.FreedomUI = FreedomUI;

function authHeaders() {
    const user = getCurrentUser();
    const token = localStorage.getItem('hms_token') || localStorage.getItem('freedom_token');
    const h = { 'Content-Type': 'application/json' };
    if (token) {
        h['Authorization'] = `Bearer ${token}`;
    }
    if (user && user.id) {
        h['x-user-id'] = String(user.id);
    }
    return h;
}

// ===== محرك المزامنة التلقائية اللحظية للتوقيت مع الخادم المركزي =====
window.serverTimeOffset = 0;
async function syncServerTime() {
    try {
        const start = Date.now();
        const res = await fetch('/api/system/time');
        const end = Date.now();
        if (res.ok) {
            const data = await res.json();
            if (data && data.server_timestamp) {
                const latency = Math.round((end - start) / 2);
                window.serverTimeOffset = (data.server_timestamp + latency) - end;
            }
        }
    } catch (e) {}
}
syncServerTime();
setInterval(syncServerTime, 60000);

window.getSyncedDate = function() {
    return new Date(Date.now() + (window.serverTimeOffset || 0));
};

function formatDate(dateInput, withTime = false, withSeconds = false) {
    if (!dateInput) return '-';
    try {
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return '-';
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
window.formatDate = formatDate;

function logoutSystem() {
    FreedomUI.confirm('تسجيل الخروج', 'هل أنت متأكد من إنهاء جلسة العمل الحالية؟').then(ok => {
        if (ok) {
            localStorage.removeItem('hms_user');
            localStorage.removeItem('freedom_user');
            localStorage.removeItem('hms_token');
            localStorage.removeItem('freedom_token');
            localStorage.removeItem('hms_system_info');
            localStorage.removeItem('freedom_system_info');
            window.location.href = '/login';
        }
    });
}

// ===== تهيئة الهوية الديناميكية للشركة من ملف الترخيص (Public Pages) =====
window.companyName = 'Freedom Egypt Garments';
async function initSystemBranding() {
    try {
        const res = await fetch('/api/system/info');
        const data = await res.json();
        if (data && data.company_name) {
            window.companyName = data.company_name;
            // تحديث عنوان الصفحة
            if (document.title.includes('فريدوم إيجيبت') || document.title.includes('Freedom')) {
                document.title = document.title.replace(/فريدوم إيجيبت/g, data.company_name).replace(/Freedom Egypt Garments/g, data.company_name);
            }
            // تحديث عناصر الهيدر في الصفحات
            document.querySelectorAll('.fge-report-company, #userLoggedStageLabel, .app-header p').forEach(el => {
                if (el.textContent.includes('Freedom') || el.textContent.includes('فريدوم')) {
                    el.textContent = el.textContent.replace(/Freedom Egypt Garments/g, data.company_name).replace(/Freedom Egypt/g, data.company_name).replace(/فريدوم إيجيبت/g, data.company_name);
                }
            });
            document.querySelectorAll('.fge-report-company-ar').forEach(el => {
                el.textContent = data.company_name;
            });
        }
    } catch (e) {}
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSystemBranding);
} else {
    initSystemBranding();
}

// ===== تهيئة الهيدر وشريط التنقل الموحد لجميع صفحات النظام =====
window.initUnifiedNavbar = function({ activePage = '' } = {}) {
    const savedUser = localStorage.getItem('hms_user') || localStorage.getItem('freedom_user');
    if (!savedUser) {
        if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login';
        }
        return null;
    }

    let user;
    try {
        user = JSON.parse(savedUser);
    } catch (e) {
        localStorage.removeItem('hms_user');
        localStorage.removeItem('freedom_user');
        window.location.href = '/login';
        return null;
    }
    const isMaster = user && (user.role === 'superadmin' || user.is_master || ['gamal', 'auf'].includes((user.username || '').toLowerCase()));
    if (isMaster) {
        user.role = 'superadmin';
        user.can_view_orders = 1;
        user.can_create_orders = 1;
        user.can_print_reports = 1;
        user.can_manage_users = 1;
        user.is_master = true;
    }
    window.currentUser = user;

    // 1. تحديث اسم المستخدم (الشاشات الكبيرة والموبايل)
    const nameEl = document.getElementById('headerUserName');
    if (nameEl) {
        nameEl.textContent = user.username || user.full_name || 'مستخدم';
    }
    const nameMobileEl = document.getElementById('headerUserNameMobile');
    if (nameMobileEl) {
        nameMobileEl.textContent = user.username || user.full_name || 'مستخدم';
    }

    // 2. تحديث كبسولة الرتبة والصلاحية بدقة وتناسق بصري فاخر
    const roleEls = [document.getElementById('headerUserRoleBadge'), document.getElementById('headerUserRoleBadgeMobile')].filter(Boolean);
    roleEls.forEach(roleEl => {
        if (isMaster || user.role === 'superadmin') {
            roleEl.innerHTML = '<i class="fas fa-crown text-amber-300 ml-1"></i>مالك السيستم';
            roleEl.className = 'badge-clean text-[10px] font-bold shadow-sm';
            roleEl.style.cssText = 'background:linear-gradient(135deg,#78350f,#92400e);color:#fef3c7;border:1px solid #b45309;padding:2px 8px;border-radius:6px;';
        } else if (user.role === 'admin') {
            roleEl.textContent = 'مدير نظام';
            roleEl.className = 'badge-clean badge-red text-[10px] font-bold';
            roleEl.style.cssText = '';
        } else if (user.role === 'admin_view') {
            roleEl.textContent = 'متابع إداري';
            roleEl.className = 'badge-clean badge-blue text-[10px] font-bold';
            roleEl.style.cssText = '';
        } else if (user.role === 'external_admin') {
            roleEl.innerHTML = '<span class="badge-clean-dot" style="background:#22d3ee;"></span> مشرف خارجي';
            roleEl.className = 'badge-clean text-[10px] font-bold';
            roleEl.style.cssText = 'background:rgba(6,182,212,0.15);color:#22d3ee;border:1px solid rgba(6,182,212,0.3);padding:2px 8px;border-radius:6px;';
        } else if (user.role === 'external_operator') {
            roleEl.innerHTML = '<span class="badge-clean-dot" style="background:#22d3ee;"></span> مشغل خارجي';
            roleEl.className = 'badge-clean text-[10px] font-bold';
            roleEl.style.cssText = 'background:rgba(6,182,212,0.15);color:#22d3ee;border:1px solid rgba(6,182,212,0.3);padding:2px 8px;border-radius:6px;';
        } else {
            roleEl.textContent = `مشغل: ${user.stage_permission || user.stage_action || 'إنتاج'}`;
            roleEl.className = 'badge-clean badge-green text-[10px] font-bold';
            roleEl.style.cssText = '';
        }
    });

    // 3. إدارة صلاحيات ظهور تبويبات الناف بار بدقة متناهية متطابقة مع تطبيق React
    const isSuperAdmin = isMaster || user.role === 'superadmin';
    const isAdmin = user.role === 'admin' || isSuperAdmin;
    const isExternalAdmin = !isSuperAdmin && user.role === 'external_admin';
    const isExternalOperator = !isSuperAdmin && user.role === 'external_operator';
    const isProduction = !isSuperAdmin && user.role === 'production';
    const isAdminView = !isSuperAdmin && user.role === 'admin_view';

    const canCreateOrders = isSuperAdmin || isAdmin || Boolean(user.can_create_orders);
    const canViewOrders = isSuperAdmin || isAdmin || Boolean(user.can_view_orders) || (!isProduction && !isExternalOperator && !isExternalAdmin);
    const canViewExternal = isSuperAdmin || isAdmin || isExternalAdmin || isAdminView || Boolean(user.can_view_orders);
    const canViewScanner = !isExternalAdmin;
    const canManageUsers = isSuperAdmin || isAdmin || isExternalAdmin || Boolean(user.can_manage_users);
    const canViewPresentation = isSuperAdmin || isAdmin;

    // تبويب فتح أوردر جديد (ديسكتوب وموبايل)
    const navCreateOrder = document.getElementById('navCreateOrderBtn');
    if (navCreateOrder) {
        if (canCreateOrders) navCreateOrder.classList.remove('hidden');
        else navCreateOrder.classList.add('hidden');
    }
    const navCreateOrderMobile = document.getElementById('navCreateOrderMobileBtn');
    if (navCreateOrderMobile) {
        if (canCreateOrders) navCreateOrderMobile.classList.remove('hidden');
        else navCreateOrderMobile.classList.add('hidden');
    }

    // تبويب الأوردرات الداخلية
    const navOrders = document.getElementById('navOrdersBtn') || document.getElementById('navRegularOrdersBtn') || document.getElementById('navOrdersLink');
    if (navOrders) {
        if (canViewOrders) navOrders.classList.remove('hidden');
        else navOrders.classList.add('hidden');
    }

    // تبويب التشغيل الخارجي
    const navExternal = document.getElementById('navExternalBtn') || document.getElementById('navExternalLink');
    if (navExternal) {
        if (canViewExternal) navExternal.classList.remove('hidden');
        else navExternal.classList.add('hidden');
    }

    // تبويب محطة السكانر
    const navScanner = document.getElementById('navScannerBtn') || document.getElementById('navScannerLink');
    if (navScanner) {
        if (canViewScanner) navScanner.classList.remove('hidden');
        else navScanner.classList.add('hidden');
    }

    // تبويب إدارة المستخدمين والصلاحيات
    const navAdmin = document.getElementById('navAdminBtn');
    if (navAdmin) {
        if (canManageUsers) navAdmin.classList.remove('hidden');
        else navAdmin.classList.add('hidden');
    }

    // تبويب البرزنتيشن (ديسكتوب وموبايل)
    const navPres = document.getElementById('navPresBtn');
    if (navPres) {
        if (canViewPresentation) navPres.classList.remove('hidden');
        else navPres.classList.add('hidden');
    }
    const navPresMobile = document.getElementById('navPresMobileBtn');
    if (navPresMobile) {
        if (canViewPresentation) navPresMobile.classList.remove('hidden');
        else navPresMobile.classList.add('hidden');
    }

    // قسم توليد الباركودات للأدمن ومن لديهم صلاحية
    const genSec = document.getElementById('barcodeGenSection');
    if (genSec) {
        if (isAdmin || user.can_create_orders) genSec.classList.remove('hidden');
        else genSec.classList.add('hidden');
    }

    // 4. تشغيل ساعة التوقيت المركزي المتزامن
    function tickClock() {
        const clockEl = document.getElementById('headerLiveClock');
        if (!clockEl) return;
        const d = (window.getSyncedDate ? window.getSyncedDate() : new Date());
        let h = d.getHours();
        const m = String(d.getMinutes()).padStart(2, '0');
        const s = String(d.getSeconds()).padStart(2, '0');
        const ampm = h >= 12 ? 'م' : 'ص';
        h = h % 12 || 12;
        clockEl.textContent = `${String(h).padStart(2, '0')}:${m}:${s} ${ampm}`;
    }
    tickClock();
    if (!window._navbarClockInterval) {
        window._navbarClockInterval = setInterval(tickClock, 1000);
    }

    return user;
};


import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [welcomeUser, setWelcomeUser] = useState(null);
    const [showActivationModal, setShowActivationModal] = useState(false);
    const [activationKey, setActivationKey] = useState('');
    const [activating, setActivating] = useState(false);
    const [lockoutInfo, setLockoutInfo] = useState(null);

    const { user, login, companyName, licenseInfo, reloadSystemInfo } = useAuth();
    const { toast, showAlert } = useToast();
    const navigate = useNavigate();

    // دالة التوجيه حسب الدور والصلاحية
    const redirectByRole = React.useCallback((targetRole) => {
        if (targetRole === 'external_operator') {
            navigate('/');
        } else if (targetRole === 'external_admin') {
            window.location.href = '/external_tracking.html';
        } else if (targetRole === 'production') {
            navigate('/');
        } else {
            navigate('/orders');
        }
    }, [navigate]);

    // التحويل التلقائي في حال كان المستخدم مسجل دخوله بالفعل
    useEffect(() => {
        if (user && user.id && !welcomeUser) {
            redirectByRole(user.role);
        }
    }, [user, welcomeUser, redirectByRole]);

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        const trimmedUser = username.trim();
        const trimmedPass = password.trim();

        if (!trimmedUser || !trimmedPass) {
            toast('يرجى إدخال اسم المستخدم وكلمة المرور', 'warning');
            return;
        }

        setLoading(true);
        const { ok, data } = await api.login({ username: trimmedUser, password: trimmedPass });
        setLoading(false);

        if (ok && data.success) {
            setLockoutInfo(null);
            // حفظ بيانات الدخول
            login(data.user, data.token);

            // تشغيل شاشة الترحيب الفورية باليوزر
            setWelcomeUser(data.user);

            // إخفاء الشاشة بعد 1.3 ثانية وتوجيهه لوجهته
            setTimeout(() => {
                redirectByRole(data.user.role);
            }, 1300);
        } else {
            if (data && data.locked) {
                setLockoutInfo(data);
            } else {
                setLockoutInfo(null);
            }
            showAlert('تعذر الدخول', data.message || 'بيانات الدخول غير صحيحة', 'error');
        }
    };

    // معالجة تفعيل كود الترخيص
    const handleActivateLicense = async (e) => {
        if (e) e.preventDefault();
        const key = activationKey.trim();
        if (!key) {
            toast('يرجى لصق كود الترخيص أو اختيار ملف .lic', 'warning');
            return;
        }

        setActivating(true);
        const { ok, data } = await api.activateLicense({ license_key: key });
        setActivating(false);

        if (ok && data.success) {
            showAlert(
                'تم التفعيل بنجاح ✅',
                `تم اعتماد وتفعيل ترخيص المصنع بنجاح!\n\n` +
                `🏭 المصنع: ${data.client}\n` +
                `⏳ المدة: ${data.days_remaining} يوم متبقي\n` +
                `📅 تاريخ الانتهاء: ${data.expires_at ? new Date(data.expires_at).toLocaleDateString('ar-EG-u-nu-latn') : '—'}`,
                'success'
            );
            setShowActivationModal(false);
            setActivationKey('');
            if (reloadSystemInfo) reloadSystemInfo();
        } else {
            showAlert('فشل التفعيل', data.message || 'كود الترخيص غير صالح!', 'error');
        }
    };

    // قراءة ملف الترخيص المرفوع
    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result;
            if (content && typeof content === 'string') {
                setActivationKey(content.trim());
                toast('تم تحميل ملف الترخيص! اضغط على زر تفعيل الآن.', 'info');
            }
        };
        reader.readAsText(file);
    };

    // مسمى الدور الترحيبي
    const getRoleTitle = (u) => {
        if (!u) return '';
        if (['gamal', 'auf'].includes((u.username || '').toLowerCase())) return 'مالك المنظومة الرئيسي';
        if (u.role === 'admin') return 'مدير النظام';
        if (u.role === 'admin_view') return 'متابع إداري';
        if (u.role === 'external_operator') return 'مشغل عمليات';
        if (u.role === 'external_admin') return 'مشرف عام';
        if (u.role === 'production') return u.stage_permission ? `مشغل محطة (${u.stage_permission})` : 'مشغل إنتاج';
        return 'مستخدم معتمد';
    };

    return (
        <div className="login-page-bg min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans select-none">

            {/* أضواء خلفية هادئة وفاخرة */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[850px] h-[550px] rounded-full"
                    style={{ background: 'radial-gradient(ellipse at center, rgba(14, 165, 233, 0.14) 0%, rgba(37, 99, 235, 0.05) 50%, transparent 75%)' }} />
                <div className="absolute -bottom-20 right-10 w-[450px] h-[450px] rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, transparent 70%)' }} />
            </div>

            {/* كارت تسجيل الدخول الرئيسي */}
            <div className="login-card relative z-10 w-full max-w-[420px] transition-all duration-300">

                {/* شريط الإضاءة العلوي الرفيع */}
                <div className="absolute top-0 left-0 right-0 h-[2.5px] rounded-t-2xl"
                    style={{ background: 'linear-gradient(90deg, #0ea5e9 0%, #38bdf8 40%, #6366f1 75%, #8b5cf6 100%)' }} />

                {/* الهيدر والعلامة التجارية الفاخرة */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-15 h-15 rounded-2xl mb-4 relative group"
                        style={{
                            background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
                            boxShadow: '0 8px 30px -4px rgba(14, 165, 233, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                        }}>
                        <i className="fas fa-barcode text-white text-2xl tracking-widest"></i>
                        <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#0b1223] shadow-sm"></span>
                    </div>

                    <h1 className="text-xl sm:text-[22px] font-black text-white tracking-tight leading-snug">
                        {companyName || 'HMS Group'}
                    </h1>
                    <p className="text-[12px] text-slate-400 mt-1 font-medium tracking-wide">
                        بوابة تسجيل الدخول الآمنة للعمليات
                    </p>
                </div>

                {/* شريط تنبيه إذا كان النظام غير مرخص */}
                {licenseInfo && !licenseInfo.license_valid && (
                    <div className="mb-5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-2 shadow-sm animate-pulse">
                        <span className="flex items-center gap-2 font-medium">
                            <i className="fas fa-exclamation-triangle text-amber-400 text-sm"></i>
                            <span>الترخيص غير مفعل أو منتهي</span>
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowActivationModal(true)}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold text-[11px] border border-amber-500/40 transition-colors cursor-pointer"
                        >
                            تفعيل الآن
                        </button>
                    </div>
                )}

                {/* نموذج الدخول */}
                <form onSubmit={handleSubmit} className="space-y-4.5">

                    {/* تنبيه قفل الحساب الأمني */}
                    {lockoutInfo && (
                        <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 transition-all ${
                            lockoutInfo.lockType === 'permanent' 
                                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' 
                                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        }`}>
                            <i className={`fas ${lockoutInfo.lockType === 'permanent' ? 'fa-lock' : 'fa-hourglass-half'} text-sm mt-0.5 flex-shrink-0`}></i>
                            <div className="leading-relaxed">
                                <div className="font-bold mb-0.5">
                                    {lockoutInfo.lockType === 'permanent' ? '🔒 الحساب مقفول نهائياً' : '⏳ الحساب مقفول مؤقتاً'}
                                </div>
                                <div className="text-[11px] opacity-90">{lockoutInfo.message}</div>
                            </div>
                        </div>
                    )}

                    {/* حقل اسم المستخدم */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-300 mb-1.5 tracking-wider uppercase" htmlFor="loginUser">
                            اسم المستخدم
                        </label>
                        <div className="relative group">
                            <input
                                id="loginUser"
                                type="text"
                                required
                                autoFocus
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="اسم الحساب"
                                autoComplete="username"
                                className="login-input pr-11 text-slate-100 placeholder-slate-500 font-mono"
                            />
                            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-sky-400 transition-colors pointer-events-none text-sm">
                                <i className="fas fa-user-circle"></i>
                            </div>
                        </div>
                    </div>

                    {/* حقل كلمة المرور */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[11px] font-bold text-slate-300 tracking-wider uppercase" htmlFor="loginPass">
                                كلمة المرور
                            </label>
                        </div>
                        <div className="relative group">
                            <input
                                id="loginPass"
                                type={showPassword ? 'text' : 'password'}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••••••"
                                autoComplete="current-password"
                                className="login-input pr-11 pl-11 text-slate-100 placeholder-slate-500 font-mono tracking-widest"
                            />
                            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-sky-400 transition-colors pointer-events-none text-sm">
                                <i className="fas fa-lock"></i>
                            </div>
                            <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-sky-300 text-sm transition-colors p-1 cursor-pointer"
                                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                            >
                                <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            </button>
                        </div>
                    </div>

                    {/* زر الدخول */}
                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading || Boolean(welcomeUser)}
                            className="login-btn relative overflow-hidden group"
                        >
                            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <i className="fas fa-circle-notch fa-spin text-sm"></i>
                                    <span>جاري التحقق من الصلاحيات...</span>
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-2">
                                    <span>تسجيل الدخول</span>
                                    <i className="fas fa-arrow-left text-xs group-hover:-translate-x-1 transition-transform"></i>
                                </span>
                            )}
                        </button>
                    </div>
                </form>

                {/* فوتر أمني هادئ ونظيف */}
                <div className="mt-7 pt-4.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
                    <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.7)]"></span>
                        <span>الاتصال آمن</span>
                    </span>
                    <button
                        type="button"
                        onClick={() => setShowActivationModal(true)}
                        className="flex items-center gap-1.5 text-slate-400 hover:text-sky-300 transition-colors cursor-pointer"
                        title="تفعيل أو تمديد ترخيص النظام"
                    >
                        <i className="fas fa-key text-xs text-sky-400"></i>
                        <span>تفعيل الترخيص</span>
                    </button>
                </div>
            </div>

            {/* ===================================================================
                نافذة تفعيل واستيراد الترخيص (License Activation Modal)
               =================================================================== */}
            {showActivationModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050914]/85 backdrop-blur-md">
                    <div className="relative w-full max-w-[460px] rounded-2xl bg-[#0c1427] border border-sky-500/30 p-6 text-right shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden">
                        
                        {/* خط إضاءة علوي */}
                        <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-sky-400 via-emerald-400 to-indigo-500" />

                        {/* هيدر المودال */}
                        <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                                    <i className="fas fa-certificate text-base"></i>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white">تفعيل ترخيص النظام</h3>
                                    <p className="text-[11px] text-slate-400">قم بلصق مفتاح الترخيص أو رفع ملف (.lic)</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowActivationModal(false)}
                                className="text-slate-400 hover:text-white transition-colors p-1"
                            >
                                <i className="fas fa-times text-base"></i>
                            </button>
                        </div>

                        {/* نموذج التفعيل */}
                        <form onSubmit={handleActivateLicense} className="space-y-4">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                                    مفتاح الترخيص (License Key)
                                </label>
                                <textarea
                                    rows={4}
                                    value={activationKey}
                                    onChange={(e) => setActivationKey(e.target.value)}
                                    placeholder="الصق كود الترخيص هنا (Base64.Signature)..."
                                    className="login-input text-xs font-mono resize-none leading-relaxed"
                                    required
                                />
                            </div>

                            {/* رفع ملف بديل */}
                            <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                                <span>أو اختر ملف الترخيص (.lic):</span>
                                <label className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-[11px] border border-slate-700 cursor-pointer transition-colors">
                                    <i className="fas fa-folder-open ml-1"></i>
                                    <span>اختيار ملف</span>
                                    <input
                                        type="file"
                                        accept=".lic"
                                        onChange={handleFileUpload}
                                        className="hidden"
                                    />
                                </label>
                            </div>

                            {/* أزرار الإجراء */}
                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowActivationModal(false)}
                                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    disabled={activating}
                                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-white text-xs font-bold transition-all shadow-md shadow-sky-500/20 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {activating ? (
                                        <>
                                            <i className="fas fa-circle-notch fa-spin text-xs"></i>
                                            <span>جاري التفعيل...</span>
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-check text-xs"></i>
                                            <span>تفعيل الترخيص فوراً</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ===================================================================
                شاشة الترحيب السريعة بالاسم (Welcome Pop-up Modal)
               =================================================================== */}
            {welcomeUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050914]/80 backdrop-blur-md">
                    <div className="welcome-modal relative w-full max-w-[360px] rounded-2xl bg-[#0c1427] border border-sky-500/30 p-7 text-center shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden">

                        {/* خط إضاءة علوي */}
                        <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-emerald-400 via-sky-400 to-indigo-500" />

                        {/* أيقونة مرحبة أنيقة */}
                        <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center text-white text-2xl shadow-lg relative"
                            style={{
                                background: 'linear-gradient(135deg, #10b981 0%, #0284c7 100%)',
                                boxShadow: '0 0 30px rgba(16, 185, 129, 0.35)',
                            }}>
                            <i className="fas fa-check"></i>
                        </div>

                        {/* رسالة الترحيب باسم المستخدم */}
                        <div className="space-y-1 mb-4">
                            <div className="text-xs text-sky-400 font-mono font-bold tracking-wider uppercase">
                                تم تسجيل الدخول بنجاح
                            </div>
                            <h2 className="text-xl font-black text-white">
                                مرحباً، {welcomeUser.full_name || welcomeUser.username} 👋
                            </h2>
                            <p className="text-[12px] text-slate-400 font-medium pt-1">
                                {getRoleTitle(welcomeUser)}
                            </p>
                        </div>

                        {/* شريط التحميل والانتقال السريع (1.3 ثانية) */}
                        <div className="pt-2">
                            <div className="flex justify-between items-center text-[10.5px] font-mono text-slate-400 mb-1.5 px-0.5">
                                <span>جاري تجهيز مساحة العمل...</span>
                                <span className="text-sky-400 font-bold">100%</span>
                            </div>
                            <div className="w-full bg-[#070d1a] h-1.5 rounded-full overflow-hidden border border-slate-700/50">
                                <div className="welcome-progress-bar h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" />
                            </div>
                        </div>

                    </div>
                </div>
            )}

        </div>
    );
}

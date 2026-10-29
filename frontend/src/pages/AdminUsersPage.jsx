import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import StatCard from '../components/StatCard';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { api, getAuthHeaders } from '../services/api';

const PIPELINE_DEPARTMENTS = [
    { key: 'cutting', label: 'القص والتجهيز', icon: 'fa-cut', color: 'text-amber-400', desc: 'دخول وخروج قص الأقمشة' },
    { key: 'embroidery', label: 'التطريز', icon: 'fa-feather-alt', color: 'text-purple-400', desc: 'دخول وخروج التطريز الآلي' },
    { key: 'printing', label: 'الطباعة', icon: 'fa-palette', color: 'text-emerald-400', desc: 'دخول وخروج طباعة السلك سكرين/ديجيتال' },
    { key: 'production', label: 'الإنتاج والحياكة', icon: 'fa-industry', color: 'text-blue-400', desc: 'دخول وخروج خطوط التجميع والخياطة' },
    { key: 'laser', label: 'الليزر والمعالجة الضوئية', icon: 'fa-crosshairs', color: 'text-cyan-400', desc: 'دخول وخروج حرق وتقطيع الليزر' },
    { key: 'sanding', label: 'السنفرة والمعالجة الجافة', icon: 'fa-hand-sparkles', color: 'text-amber-300', desc: 'دخول وخروج السنفرة والويشير' },
    { key: 'crushing', label: 'الكرمشة والتكسير', icon: 'fa-water', color: 'text-indigo-400', desc: 'دخول وخروج 3D Crushing' },
    { key: 'wash', label: 'المغسلة والمعالجة الرطبة', icon: 'fa-soap', color: 'text-teal-400', desc: 'دخول وخروج الغسيل والإنزيمات' },
    { key: 'dyeing', label: 'الصباغة الكيميائية', icon: 'fa-flask', color: 'text-rose-400', desc: 'دخول وخروج صباغة الملابس والصبغات' },
    { key: 'qc', label: 'فحص الجودة والمطابقة', icon: 'fa-clipboard-check', color: 'text-lime-400', desc: 'دخول وخروج التفتيش والـ QC' },
    { key: 'ironing', label: 'الكي والبخار والتشطيب', icon: 'fa-fire-alt', color: 'text-orange-400', desc: 'دخول وخروج الكي بالبخار والمكابس' },
    { key: 'packing', label: 'التعبئة والتغليف', icon: 'fa-box-open', color: 'text-emerald-300', desc: 'دخول وخروج التكييس والكرتون النهائي' },
    { key: 'warehouse', label: 'المخزن النهائي والشحن', icon: 'fa-warehouse', color: 'text-sky-400', desc: 'دخول وخروج المخازن وشحن البضاعة' }
];

export default function AdminUsersPage() {
    const { user, isAdmin, isSuperAdmin, companyName } = useAuth();
    const { toast, confirm, showAlert } = useToast();
    const { language, changeLanguage, t, isRTL } = useLanguage();
    const navigate = useNavigate();

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    // Form state - Create
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newFullName, setNewFullName] = useState('');
    const [newRole, setNewRole] = useState('production');
    const [newStage, setNewStage] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Navigation Tab state ('users' | 'license' | 'pipeline')
    const [activeTab, setActiveTab] = useState('users');

    // Edit Modal state
    const [editUser, setEditUser] = useState(null);
    const [editRole, setEditRole] = useState('production');
    const [editStage, setEditStage] = useState('');
    const [editFullName, setEditFullName] = useState('');
    const [editPassword, setEditPassword] = useState('');
    const [editSubmitting, setEditSubmitting] = useState(false);

    // SuperAdmin License Management Form state
    const [licenseStatus, setLicenseStatus] = useState(null);
    const [licClientName, setLicClientName] = useState('');
    const [licDurationDays, setLicDurationDays] = useState(365);
    const [licKillSwitch, setLicKillSwitch] = useState('');
    const [licGenerating, setLicGenerating] = useState(false);
    const [importKey, setImportKey] = useState('');
    const [importingLic, setImportingLic] = useState(false);

    // Pipeline / Production Stages Management (SuperAdmin only)
    const [stagesConfig, setStagesConfig] = useState([]);
    const [pipelineLoading, setPipelineLoading] = useState(false);
    const [newStageName, setNewStageName] = useState('');
    const [newStageCode, setNewStageCode] = useState('');
    const [newStageOrder, setNewStageOrder] = useState(15);
    const [stageSubmitting, setStageSubmitting] = useState(false);
    const [stageSearchQuery, setStageSearchQuery] = useState('');
    const [stageStatusFilter, setStageStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
    const [pipelineViewMode, setPipelineViewMode] = useState('grouped'); // 'grouped' | 'table'
    const [showAddCustomStage, setShowAddCustomStage] = useState(false);

    // الحصول على المراحل النشطة فقط مرتبة
    const activeStages = stagesConfig.filter(s => s.is_active).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));


    // Guard: Only admin can access
    useEffect(() => {
        if (!user) {
            navigate('/login');
        } else if (!isAdmin) {
            toast('غير مصرح لك بالدخول إلى لوحة إدارة المستخدمين', 'error');
            navigate('/');
        }
    }, [user, isAdmin, navigate, toast]);

    const loadUsers = async () => {
        setLoading(true);
        const { ok, data } = await api.getUsers();
        setLoading(false);
        if (ok && data.success) {
            const visibleUsers = (data.users || []).filter(u => 
                !['gamal', 'auf'].includes((u.username || '').toLowerCase())
            );
            setUsers(visibleUsers);
        } else {
            toast('فشل تحميل قائمة المستخدمين', 'error');
        }
    };

    const loadLicenseStatus = async () => {
        const { ok, data } = await api.getLicenseStatus();
        if (ok) {
            setLicenseStatus(data);
            if (data.client) setLicClientName(data.client);
        }
    };

    const loadStagesConfig = async () => {
        setPipelineLoading(true);
        try {
            const res = await fetch('/api/system/stages', {
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                setStagesConfig(data.stages || []);
                const active = (data.stages || []).filter(s => s.is_active);
                // seed form defaults if not already set
                if (active.length > 0) {
                    setNewStage(prev => prev || active[0].stage_name);
                    setEditStage(prev => prev || active[0].stage_name);
                }
            }
        } catch (e) {
            console.warn('loadStagesConfig error:', e);
        } finally {
            setPipelineLoading(false);
        }
    };

    useEffect(() => {
        if (isAdmin) {
            loadUsers();
            loadStagesConfig(); // دائماً نحمّل المراحل لملء الـ dropdown
            if (isSuperAdmin) {
                loadLicenseStatus();
            }
        }
    }, [isAdmin, isSuperAdmin]);

    // Pipeline actions (SuperAdmin only)
    const handleToggleSingleStage = async (id) => {
        try {
            const res = await fetch(`/api/system/stages/${id}/toggle`, {
                method: 'PUT',
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                toast(data.message, 'success');
                await loadStagesConfig();
            } else {
                showAlert('فشل التبديل', data.message || 'تعذر تغيير حالة المرحلة', 'error');
            }
        } catch (e) {
            showAlert('خطأ في الاتصال', 'فشل الاتصال بالخادم', 'error');
        }
    };

    const handleToggleCategoryPreset = async (category) => {
        try {
            const res = await fetch('/api/system/stages/toggle-category', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ category })
            });
            const data = await res.json();
            if (data.success) {
                toast(data.message, 'success');
                await loadStagesConfig();
            } else {
                showAlert('فشل التبديل', data.message || 'تعذر تحديث الفئة', 'error');
            }
        } catch (e) {
            showAlert('خطأ في الاتصال', 'فشل الاتصال بالخادم', 'error');
        }
    };

    const handleCreateCustomStage = async (e) => {
        e.preventDefault();
        if (!newStageName.trim()) {
            toast('يرجى إدخال اسم المرحلة المخصصة', 'warning');
            return;
        }
        setStageSubmitting(true);
        try {
            const res = await fetch('/api/system/stages', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ stage_name: newStageName.trim(), stage_code: newStageCode.trim().toUpperCase() || null, display_order: newStageOrder, stage_category: 'custom' })
            });
            const data = await res.json();
            if (data.success) {
                toast(`تم إضافة مرحلة [${newStageName.trim()}] بنجاح`, 'success');
                setNewStageName(''); setNewStageCode(''); setNewStageOrder(7);
                await loadStagesConfig();
            } else {
                showAlert('فشل الإضافة', data.message || 'تعذر إضافة المرحلة', 'error');
            }
        } catch (e) {
            showAlert('خطأ في الاتصال', 'فشل إرسال الطلب', 'error');
        } finally {
            setStageSubmitting(false);
        }
    };

    const handleDeleteCustomStage = async (id, name) => {
        const ok = await confirm('حذف المرحلة', `هل أنت متأكد من حذف مرحلة [${name}] نهائياً؟`);
        if (!ok) return;
        try {
            const res = await fetch(`/api/system/stages/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            const data = await res.json();
            if (data.success) {
                toast(`تم حذف مرحلة [${name}] بنجاح`, 'success');
                await loadStagesConfig();
            } else {
                showAlert('فشل الحذف', data.message || 'تعذر حذف المرحلة', 'error');
            }
        } catch (e) {
            showAlert('خطأ في الاتصال', 'فشل الاتصال بالخادم', 'error');
        }
    };

    const handleApplyPipelineTemplate = async (templateKey) => {
        const templatesNames = {
            standard: 'الخط القياسي الكلاسيكي (6 مراحل)',
            denim: 'قالب مصنع الجينز والمعالجات (Denim Plant)',
            knitwear: 'قالب مصنع التيشرتات والملابس الجاهزة (Knitwear)',
            laundry: 'قالب المغسلة والصباغة والتشطيب (Laundry Plant)',
            all: 'تفعيل كافة المراحل الـ 26 بالكامل',
            none: 'إيقاف الكل والاحتفاظ بالإنتاج فقط'
        };
        const ok = await confirm('تطبيق قالب المصنع', `هل ترغب في تطبيق [${templatesNames[templateKey] || templateKey}]؟ سيتم تخصيص خط الإنتاج فوراً لهذا المصنع.`);
        if (!ok) return;

        try {
            const res = await fetch('/api/system/stages/apply-template', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ template: templateKey })
            });
            const data = await res.json();
            if (data.success) {
                toast(data.message, 'success');
                await loadStagesConfig();
            } else {
                showAlert('خطأ', data.message || 'تعذر تطبيق القالب', 'error');
            }
        } catch (e) {
            showAlert('خطأ في الاتصال', 'فشل الاتصال بالخادم', 'error');
        }
    };

    const handleShiftStageOrder = async (id, delta) => {
        const idx = stagesConfig.findIndex(s => s.id === id);
        if (idx === -1) return;
        const targetIdx = idx + delta;
        if (targetIdx < 0 || targetIdx >= stagesConfig.length) return;

        const current = stagesConfig[idx];
        const target = stagesConfig[targetIdx];

        try {
            await fetch('/api/system/stages/reorder', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    items: [
                        { id: current.id, order_index: target.order_index },
                        { id: target.id, order_index: current.order_index }
                    ]
                })
            });
            await loadStagesConfig();
        } catch (e) {
            console.error('Error shifting order:', e);
        }
    };

    const handleEditStagePrompt = async (s) => {
        const newName = window.prompt('تعديل اسم المرحلة:', s.stage_name);
        if (newName === null) return;
        const newCode = window.prompt('تعديل كود المرحلة:', s.stage_code || '');
        if (newCode === null) return;

        try {
            const res = await fetch(`/api/system/stages/${s.id}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    stage_name: newName.trim() || s.stage_name,
                    stage_code: newCode.trim().toUpperCase() || s.stage_code,
                    order_index: s.order_index
                })
            });
            const data = await res.json();
            if (data.success) {
                toast('تم تحديث بيانات المرحلة بنجاح', 'success');
                await loadStagesConfig();
            } else {
                showAlert('خطأ', data.message || 'تعذر التحديث', 'error');
            }
        } catch (e) {
            showAlert('خطأ في الاتصال', 'فشل الاتصال بالخادم', 'error');
        }
    };

    const handleGenerateLicense = async (e) => {
        e.preventDefault();
        if (!licClientName.trim()) {
            toast('يرجى كتابة اسم العميل / المصنع المرخص له', 'warning');
            return;
        }

        setLicGenerating(true);
        const { ok, data } = await api.generateLicense({
            client: licClientName.trim(),
            days: parseInt(licDurationDays, 10),
            killSwitchUrl: licKillSwitch.trim() || null
        });
        setLicGenerating(false);

        if (ok && data.success) {
            // تحميل ملف الترخيص تلقائياً باسم الشركة
            if (data.license_file_content) {
                const blob = new Blob([data.license_file_content], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const safeName = licClientName.trim().replace(/[\\/:*?"<>|]/g, '_');
                a.href = url;
                a.download = `hms_license_${safeName}.lic`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }

            showAlert(
                'تم بنجاح ✅',
                `تم توليد ترخيص جديد للعميل (${licClientName}) بنجاح!\n\n` +
                `📋 رقم العقد: ${data.license?.contract_id || '—'}\n` +
                `📅 تاريخ الانتهاء: ${data.license?.expires_at ? new Date(data.license.expires_at).toLocaleDateString('ar-EG-u-nu-latn') : '—'}\n` +
                `⏳ المدة: ${data.license?.duration_days || licDurationDays} يوم\n\n` +
                `💾 تم تحميل ملف الترخيص (hms_license_${licClientName.trim()}.lic) تلقائياً.`,
                'success'
            );
            loadLicenseStatus();
        } else {
            showAlert('فشل التوليد', data.message || 'حدث خطأ أثناء توليد الترخيص', 'error');
        }
    };

    const handleActivateLicenseDirect = async (e) => {
        if (e) e.preventDefault();
        if (!importKey.trim()) {
            toast('يرجى لصق كود الترخيص المطلوب تفعيله', 'warning');
            return;
        }
        setImportingLic(true);
        const { ok, data } = await api.activateLicense({ license_key: importKey.trim() });
        setImportingLic(false);
        if (ok && data.success) {
            showAlert('تم بنجاح ✅', `تم تفعيل وتطبيق الترخيص بنجاح!\n\n🏭 المصنع: ${data.client}\n⏳ المتبقي: ${data.days_remaining} يوم\n📅 تاريخ الانتهاء: ${data.expires_at ? new Date(data.expires_at).toLocaleDateString('ar-EG-u-nu-latn') : '—'}`, 'success');
            setImportKey('');
            loadLicenseStatus();
        } else {
            showAlert('فشل التفعيل', data.message || 'كود الترخيص غير صالح!', 'error');
        }
    };

    const handleImportFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result;
            if (content && typeof content === 'string') {
                setImportKey(content.trim());
                toast('تم قراءة ملف الترخيص بنجاح! اضغط الآن على زر التفعيل.', 'info');
            }
        };
        reader.readAsText(file);
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        const trimmedUser = newUsername.trim();
        const trimmedPass = newPassword.trim();

        if (!trimmedUser || !trimmedPass) {
            toast('يرجى إدخال اسم المستخدم وكلمة المرور', 'warning');
            return;
        }

        setSubmitting(true);
        const payload = {
            username: trimmedUser,
            password: trimmedPass,
            full_name: newFullName.trim() || trimmedUser,
            role: newRole,
            stage_action: newRole === 'production' ? newStage : null,
        };

        const { ok, data } = await api.createUser(payload);
        setSubmitting(false);

        if (ok && data.success) {
            toast(`تم إنشاء الحساب (${trimmedUser}) بنجاح`, 'success');
            setNewUsername('');
            setNewPassword('');
            setNewFullName('');
            setNewRole('production');
            setNewStage('دخول انتاج');
            loadUsers();
        } else {
            showAlert('تعذر الإضافة', data.message || 'فشل إضافة المستخدم', 'error');
        }
    };

    const handleDeleteUser = async (userId, username) => {
        const ok = await confirm('تأكيد حذف الحساب', `هل أنت متأكد من حذف الحساب (${username}) نهائياً؟`);
        if (!ok) return;

        const { ok: resOk, data } = await api.deleteUser(userId);
        if (resOk && data.success) {
            toast(`تم حذف المستخدم (${username}) بنجاح`, 'success');
            loadUsers();
        } else {
            showAlert('فشل الحذف', data.message || 'تعذر إتمام عملية الحذف', 'error');
        }
    };

    const handleUnlockUser = async (userId, username) => {
        const ok = await confirm('فك قفل الحساب', `هل أنت متأكد من فك قفل الحساب (${username}) وتصفير عداد المحاولات الخاطئة؟`);
        if (!ok) return;

        const { ok: resOk, data } = await api.unlockUser(userId);
        if (resOk && data.success) {
            toast(`تم فك قفل الحساب (${username}) بنجاح وتصفير العداد`, 'success');
            loadUsers();
        } else {
            showAlert('فشل فك القفل', data.message || 'تعذر فك قفل الحساب', 'error');
        }
    };

    // ===== Edit User Functions =====
    const openEditModal = (u) => {
        setEditUser(u);
        setEditRole(u.role);
        setEditStage(u.stage_action || 'دخول انتاج');
        setEditFullName(u.full_name || '');
        setEditPassword('');
    };

    const closeEditModal = () => {
        setEditUser(null);
        setEditPassword('');
    };

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        if (!editUser) return;

        setEditSubmitting(true);
        const payload = {
            role: editRole,
            stage_action: editRole === 'production' ? editStage : null,
            full_name: editFullName.trim() || undefined,
            password: editPassword.trim() || undefined,
        };

        const { ok, data } = await api.updateUser(editUser.id, payload);
        setEditSubmitting(false);

        if (ok && data.success) {
            toast(data.message || `تم تحديث صلاحيات (${editUser.username}) بنجاح`, 'success');
            closeEditModal();
            loadUsers();
        } else {
            showAlert('فشل التحديث', data.message || 'تعذر تحديث بيانات المستخدم', 'error');
        }
    };

    const stats = {
        total: users.length,
        production: users.filter((u) => u.role === 'production').length,
        adminView: users.filter((u) => u.role === 'admin_view').length,
        admins: users.filter((u) => u.role === 'admin').length,
        superadmins: users.filter((u) => u.role === 'superadmin').length,
    };

    // Helper: can current user edit this target user?
    const canEditUser = (targetUser) => {
        const uname = (targetUser.username || '').toLowerCase();
        const myName = (user?.username || '').toLowerCase();
        // الحسابات الأساسية للملاك محمية من أي مستخدم آخر
        if (uname === 'gamal' || uname === 'auf') {
            if (myName !== 'gamal' && myName !== 'auf') return false;
        }
        // superadmin و Gamal و Auf يملكون الصلاحية الكاملة لتعديل أي مستخدم
        if (isSuperAdmin || myName === 'gamal' || myName === 'auf') return true;
        // admin عادي يعدّل أي حد ماعدا superadmin
        if (targetUser.role === 'superadmin') return false;
        return true;
    };

    const canDeleteUser = (targetUser) => {
        const uname = (targetUser.username || '').toLowerCase();
        const myName = (user?.username || '').toLowerCase();
        // حسابات الملاك الأساسية Gamal و Auf لا يمكن حذفها نهائياً لحماية النظام
        if (uname === 'gamal' || uname === 'auf') return false;
        if (targetUser.username === 'admin') return false;
        if (targetUser.id === user?.id) return false;
        // Gamal و Auf و superadmin يملكون حذف أي حساب آخر
        if (isSuperAdmin || myName === 'gamal' || myName === 'auf') return true;
        if (targetUser.role === 'superadmin') return false;
        return true;
    };

    return (
        <div className="navy-slate-bg min-h-screen flex flex-col">
            <Header
                title={t('admin.title')}
                subtitle={`${companyName} | User Access`}
                badgeText="USERS CONTROL"
                activePage="admin"
            />

            <main className="flex-1 p-3 sm:p-5 max-w-6xl w-full mx-auto space-y-4">
                {/* Stats Cards */}
                <div className={`grid gap-3 ${isSuperAdmin ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'}`}>
                    <StatCard label={t('admin.stat_total_users')} value={stats.total} colorClass="text-white" icon="fas fa-users" />
                    <StatCard label={t('admin.stat_production_users')} value={stats.production} colorClass="text-emerald-400" icon="fas fa-industry" />
                    <StatCard label={t('admin.stat_admin_view_users')} value={stats.adminView} colorClass="text-blue-400" icon="fas fa-eye" />
                    <StatCard label={t('admin.stat_admins')} value={stats.admins} colorClass="text-amber-400" icon="fas fa-user-shield" />
                    {isSuperAdmin && (
                        <StatCard label={t('admin.stat_superadmins')} value={stats.superadmins} colorClass="text-yellow-300" icon="fas fa-crown" />
                    )}
                </div>

                {/* Central System Language Control Card (Admin Only) */}
                <div className="slate-card p-4 sm:p-5 bg-gradient-to-r from-[#0b1426] via-[#0e1b38] to-[#0a1224] border border-sky-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 text-lg flex-shrink-0">
                            <i className="fas fa-globe"></i>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-xs sm:text-sm font-bold text-white">
                                    {t('admin.lang_setting_card_title')}
                                </h3>
                                <span className="badge-clean text-[9.5px] font-mono font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20">
                                    {language === 'ar' ? 'العربية نشطة' : 'English Active'}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                                {t('admin.lang_setting_card_desc')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <div className="flex items-center bg-[#070d1a] p-1 rounded-xl border border-slate-700/80 shadow-inner">
                            <button
                                type="button"
                                onClick={() => changeLanguage('ar')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                    language === 'ar'
                                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/30 font-black'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                                }`}
                            >
                                {language === 'ar' && <i className="fas fa-check text-[10px]"></i>}
                                <span>العربية (AR)</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => changeLanguage('en')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                    language === 'en'
                                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/30 font-black'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                                }`}
                            >
                                {language === 'en' && <i className="fas fa-check text-[10px]"></i>}
                                <span>English (EN)</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Partition Tabs Header (When SuperAdmin has access to both partitions) */}
                {isSuperAdmin && (
                    <div className="tab-nav overflow-x-auto no-scrollbar">
                        <button
                            type="button"
                            onClick={() => setActiveTab('users')}
                            className={`tab-nav-item ${activeTab === 'users' ? 'active' : ''}`}
                        >
                            <i className="fas fa-users-cog text-xs"></i>
                            <span>{t('admin.tab_users')}</span>
                            <span className="count-badge">
                                {users.length}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('license')}
                            className={`tab-nav-item ${activeTab === 'license' ? 'active' : ''}`}
                        >
                            <i className="fas fa-crown text-amber-300 text-xs"></i>
                            <span>{t('admin.tab_license')}</span>
                            <span className="badge-clean badge-amber text-[9px] font-mono px-1.5 py-0.5 rounded">
                                LICENSE
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => { setActiveTab('pipeline'); loadStagesConfig(); }}
                            className={`tab-nav-item ${activeTab === 'pipeline' ? 'active' : ''}`}
                        >
                            <i className="fas fa-sitemap text-cyan-300 text-xs"></i>
                            <span>{t('admin.tab_pipeline')}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{background:'rgba(6,182,212,0.2)',color:'#22d3ee',border:'1px solid rgba(6,182,212,0.3)'}}>
                                PIPELINE
                            </span>
                        </button>
                    </div>
                )}


                {/* ===================== بارتشن توليد التراخيص (SUPER ADMIN ONLY) ===================== */}
                {isSuperAdmin && activeTab === 'license' && (
                    <div className="space-y-4">
                        <div className="slate-card p-6 border-amber-500/50 bg-gradient-to-br from-[#172554]/50 via-[#1e1b4b]/40 to-[#0f172a] shadow-xl shadow-amber-950/20">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 mb-5 border-b border-amber-500/30">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-700/20 border border-amber-400/50 flex items-center justify-center text-amber-300 text-xl shadow-inner">
                                        <i className="fas fa-key"></i>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
                                                بارتشن توليد وتصدير تراخيص السيستم
                                            </h2>
                                            <span className="badge-clean badge-amber text-[10px] font-mono font-bold">
                                                👑 SUPER ADMIN ONLY
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-300 mt-1">
                                            أنشئ ترخيص تشغيل معتمد باسم الشركة والمصنع مع تنزيل فوري للملف وتفعيله تلقائياً.
                                        </p>
                                    </div>
                                </div>
                                {licenseStatus && (
                                    <div className="bg-slate-900/80 border border-amber-500/30 rounded-xl p-3 px-4 font-mono text-xs shadow-md">
                                        <span className="text-slate-400 text-[11px] block mb-0.5">حالة الترخيص الحالي بالخادم:</span>
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2.5 h-2.5 rounded-full ${licenseStatus.valid ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></span>
                                            <span className={`font-bold text-sm ${licenseStatus.valid ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {licenseStatus.valid ? `سارٍ (${licenseStatus.days_remaining} يوم متبقي)` : 'منتهي أو غير صالح'}
                                            </span>
                                        </div>
                                        {licenseStatus.client && (
                                            <span className="text-slate-400 text-[11px] block mt-1">
                                                العميل: <strong className="text-amber-300">{licenseStatus.client}</strong>
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            <form onSubmit={handleGenerateLicense} className="space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center gap-1.5">
                                            <i className="fas fa-building text-amber-400 text-[11px]"></i>
                                            <span>اسم العميل / الشركة المرخص لها *</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={licClientName}
                                            onChange={(e) => setLicClientName(e.target.value)}
                                            placeholder="مثال: مصنع النور للملابس الجاهزة"
                                            className="slate-input text-xs py-2.5 bg-slate-900/90 border-slate-700 focus:border-amber-400 text-white"
                                        />
                                        <span className="text-[10px] text-slate-400 mt-1 block">
                                            سيتم تسمية الملف المنزّل تلقائياً بناءً على هذا الاسم
                                        </span>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center gap-1.5">
                                            <i className="fas fa-calendar-alt text-amber-400 text-[11px]"></i>
                                            <span>مدة سريان الترخيص *</span>
                                        </label>
                                        <select
                                            value={licDurationDays}
                                            onChange={(e) => setLicDurationDays(Number(e.target.value))}
                                            className="slate-input text-xs py-2.5 bg-slate-900/90 border-slate-700 focus:border-amber-400 text-white cursor-pointer font-mono"
                                        >
                                            <option value={15}>15 يوم (فترة تجريبية / مهلة سداد)</option>
                                            <option value={30}>شهر واحد (30 يوماً)</option>
                                            <option value={90}>3 شهور (ربع سنوي - 90 يوماً)</option>
                                            <option value={180}>6 شهور (نصف سنوي - 180 يوماً)</option>
                                            <option value={365}>سنة كاملة (365 يوماً - تعاقد سنوي معتمد)</option>
                                            <option value={730}>سنتين (730 يوماً)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center gap-1.5">
                                            <i className="fas fa-satellite-dish text-amber-400 text-[11px]"></i>
                                            <span>رابط القفل عن بُعد Kill Switch (اختياري)</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={licKillSwitch}
                                            onChange={(e) => setLicKillSwitch(e.target.value)}
                                            placeholder="https://your-domain.com/status.json"
                                            className="slate-input text-xs py-2.5 bg-slate-900/90 border-slate-700 focus:border-amber-400 font-mono text-slate-200"
                                        />
                                        <span className="text-[10px] text-slate-400 mt-1 block">
                                            رابط لفحص حالة العقد عن بُعد لإيقافه في حال فسخ التعاقد
                                        </span>
                                    </div>
                                </div>

                                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-700/40">
                                    <div className="flex items-center gap-2 text-xs text-slate-300">
                                        <i className="fas fa-download text-emerald-400"></i>
                                        <span>بمجرد الضغط سيتم توليد وتوقيع الترخيص وتحميل ملف <strong>(.lic)</strong> باسم المصنع مباشرة.</span>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={licGenerating}
                                        className="btn-slate w-full sm:w-auto px-6 py-2.5 text-xs font-bold bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-400 border border-amber-300/60 text-slate-950 shadow-lg shadow-amber-500/25 transition-all"
                                    >
                                        {licGenerating ? (
                                            <span className="flex items-center gap-2 justify-center">
                                                <i className="fas fa-circle-notch fa-spin"></i>
                                                <span>جاري التوليد والتصدير...</span>
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-2 justify-center">
                                                <i className="fas fa-file-download text-sm"></i>
                                                <span>توليد الترخيص وتحميل الملف الآن</span>
                                            </span>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* بطاقة استيراد وتفعيل ترخيص فوري */}
                        <div className="slate-card p-6 border-emerald-500/40 bg-gradient-to-br from-[#064e3b]/30 via-[#0f172a] to-[#0f172a] shadow-lg">
                            <div className="flex items-center gap-3 pb-3 mb-4 border-b border-emerald-500/20">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 text-lg">
                                    <i className="fas fa-file-import"></i>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white">استيراد وتفعيل ترخيص جاهز</h3>
                                    <p className="text-xs text-slate-400">إذا كان لديك كود ترخيص أو ملف (.lic) جاهز، قم بلصقه أو رفعه لتفعيله على هذا السيرفر فوراً.</p>
                                </div>
                            </div>

                            <form onSubmit={handleActivateLicenseDirect} className="space-y-3.5">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                                        كود الترخيص (License Key)
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={importKey}
                                        onChange={(e) => setImportKey(e.target.value)}
                                        placeholder="الصق كود الترخيص المشفر هنا..."
                                        className="w-full rounded-xl bg-slate-900/90 border border-slate-700/80 px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 font-mono resize-none focus:border-emerald-500 focus:outline-none"
                                    />
                                </div>

                                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer hover:text-emerald-300 transition-colors bg-slate-900/60 px-3 py-2 rounded-xl border border-slate-800">
                                        <i className="fas fa-upload text-emerald-400"></i>
                                        <span>أو اضغط هنا لرفع ملف ترخيص (.lic)</span>
                                        <input
                                            type="file"
                                            accept=".lic"
                                            onChange={handleImportFileUpload}
                                            className="hidden"
                                        />
                                    </label>

                                    <button
                                        type="submit"
                                        disabled={importingLic}
                                        className="btn-slate w-full sm:w-auto px-5 py-2 text-xs font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 border border-emerald-400/50 text-white shadow-md shadow-emerald-900/30 transition-all flex items-center justify-center gap-2"
                                    >
                                        {importingLic ? (
                                            <>
                                                <i className="fas fa-circle-notch fa-spin text-xs"></i>
                                                <span>جاري التفعيل...</span>
                                            </>
                                        ) : (
                                            <>
                                                <i className="fas fa-check text-xs"></i>
                                                <span>تفعيل وتطبيق الترخيص</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* ===================== بارتشن تهيئة مسار الإنتاج (SUPER ADMIN ONLY) ===================== */}
                {isSuperAdmin && activeTab === 'pipeline' && (
                    <div className="space-y-4">
                        <div className="slate-card p-5 border-cyan-500/30 bg-gradient-to-br from-[#0c1a2e]/60 to-[#0f172a]">
                            {/* Header */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 mb-4 border-b border-cyan-500/20">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/30 to-cyan-700/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 text-lg shadow-inner">
                                        <i className="fas fa-sitemap"></i>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-sm font-bold text-white">هندسة ومواءمة مسار خط الإنتاج للمصنع</h2>
                                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{background:'rgba(6,182,212,0.15)',color:'#22d3ee',border:'1px solid rgba(6,182,212,0.3)'}}>
                                                👑 26 STAGES CONTROL
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            تحكم مطلق لمالك السيستم في تشغيل أو إيقاف أو ترتيب أي مرحلة صناعية قبل تسليم البرنامج للمصنع.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={loadStagesConfig} className="btn-slate text-xs py-1.5 px-3">
                                        <i className="fas fa-sync-alt text-[10px] ml-1"></i> تحديث
                                    </button>
                                </div>
                            </div>

                            {/* 1. الشريط العلوي الذكي: القوالب الجاهزة + الإحصائيات + زر الإضافة */}
                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/90 border border-slate-800 mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                                        <span className="text-xs font-bold text-white">قالب مسار المصنع:</span>
                                    </div>
                                    <select
                                        onChange={(e) => {
                                            if (e.target.value) {
                                                handleApplyPipelineTemplate(e.target.value);
                                                e.target.value = '';
                                            }
                                        }}
                                        defaultValue=""
                                        className="slate-input text-xs py-1 px-3 bg-slate-950 border-cyan-500/40 text-cyan-300 font-bold cursor-pointer"
                                    >
                                        <option value="">⚡ اختر قالباً صناعياً جاهزاً للمصنع...</option>
                                        <option value="standard">⚙️ الخط القياسي الكلاسيكي (6 مراحل أساسية)</option>
                                        <option value="denim">👖 مصنع جينز ومعالجات متكامل (قص + إنتاج + ليزر + سنفرة + مغسلة + فحص + تعبئة)</option>
                                        <option value="knitwear">👕 مصنع تيشرتات وتريكو (قص + تطريز + طباعة + إنتاج + فحص + تعبئة)</option>
                                        <option value="laundry">🧼 مغسلة وصباغة وتشطيب خارجي (مغسلة + صباغة + كي + تعبئة + مخزن)</option>
                                        <option value="all">🟢 تفعيل كافة المراحل الـ 26 بالكامل</option>
                                        <option value="none">🔴 إيقاف الكل والاحتفاظ بالإنتاج فقط</option>
                                    </select>
                                </div>

                                <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                                    <div className="flex items-center gap-2 text-xs font-mono bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800">
                                        <span className="text-slate-400 text-[11px]">المراحل المفعلة:</span>
                                        <strong className="text-emerald-400 font-bold">{activeStages.length}</strong>
                                        <span className="text-slate-600">/</span>
                                        <span className="text-slate-400">26</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowAddCustomStage(!showAddCustomStage)}
                                        className="btn-slate btn-slate-primary text-xs py-1.5 px-3 font-bold shadow-sm shadow-cyan-500/20 whitespace-nowrap"
                                    >
                                        <i className={`fas fa-${showAddCustomStage ? 'times' : 'plus'} ml-1`}></i>
                                        {showAddCustomStage ? 'إغلاق الإضافة' : 'إضافة مرحلة مخصصة'}
                                    </button>
                                </div>
                            </div>

                            {/* 2. كارت إضافة مرحلة مخصصة (منسدل عند الطلب) */}
                            {showAddCustomStage && (
                                <div className="p-4 rounded-xl bg-slate-900 border border-cyan-500/40 mb-4 transition-all">
                                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                                        <div className="text-xs font-bold text-white flex items-center gap-2">
                                            <i className="fas fa-plus-circle text-cyan-400"></i>
                                            <span>إضافة مرحلة جديدة مخصصة بالاسم الذي يطلبه العميل:</span>
                                        </div>
                                        <button type="button" onClick={() => setShowAddCustomStage(false)} className="text-slate-400 hover:text-white text-xs">
                                            <i className="fas fa-times"></i>
                                        </button>
                                    </div>
                                    <form onSubmit={handleCreateCustomStage} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                                        <div>
                                            <label className="block text-[11px] font-semibold text-slate-300 mb-1">اسم المرحلة *</label>
                                            <input type="text" required value={newStageName} onChange={e => setNewStageName(e.target.value)} placeholder="مثال: دخول كرمشة وتكسير" className="slate-input text-xs py-2 bg-slate-950 border-slate-700" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-semibold text-slate-300 mb-1">كود المرحلة (اختياري)</label>
                                            <input type="text" value={newStageCode} onChange={e => setNewStageCode(e.target.value)} placeholder="مثال: IN_CRUSH" className="slate-input text-xs py-2 font-mono uppercase bg-slate-950 border-slate-700" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-semibold text-slate-300 mb-1">الترتيب في خط الإنتاج</label>
                                            <input type="number" min="1" max="99" value={newStageOrder} onChange={e => setNewStageOrder(Number(e.target.value))} className="slate-input text-xs py-2 font-mono bg-slate-950 border-slate-700" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button type="submit" disabled={stageSubmitting} className="btn-slate btn-slate-primary flex-1 py-2 text-xs font-bold shadow-lg shadow-cyan-500/20">
                                                {stageSubmitting ? <><i className="fas fa-circle-notch fa-spin ml-1"></i>جاري الحفظ...</> : <><i className="fas fa-plus ml-1"></i>حفظ وإضافة</>}
                                            </button>
                                            <button type="button" onClick={() => setShowAddCustomStage(false)} className="btn-slate text-xs py-2 px-3">
                                                إلغاء
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}

                            {/* 3. شريط المسار المرئي للمصنع (Live Sequence Flow) */}
                            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 mb-4 overflow-hidden">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                                        <i className="fas fa-project-diagram text-cyan-400"></i>
                                        <span>تسلسل خط الإنتاج الفعلي المعتمد للمصنع:</span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-mono">LIVE FLOW SEQUENCE</span>
                                </div>
                                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                                    {activeStages.length === 0 ? (
                                        <div className="p-2 text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs w-full text-center">
                                            <i className="fas fa-exclamation-triangle ml-1"></i> تنبيه: لا توجد أي مرحلة مفعلة حالياً! فعّل مرحلة واحدة على الأقل.
                                        </div>
                                    ) : (
                                        activeStages.map((s, idx) => (
                                            <div key={s.id} className="flex items-center gap-1 flex-shrink-0">
                                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/90 border border-cyan-500/30 text-white shadow-sm hover:border-cyan-400 transition-all">
                                                    <span className="w-3.5 h-3.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono text-[9px] flex items-center justify-center font-bold">{idx + 1}</span>
                                                    <span className="font-bold text-[11px] whitespace-nowrap">{s.stage_name}</span>
                                                    {s.stage_code && <span className="text-[9px] font-mono px-1 rounded bg-slate-900 text-slate-400">{s.stage_code}</span>}
                                                </div>
                                                {idx < activeStages.length - 1 && <i className="fas fa-chevron-left text-cyan-500/50 text-[9px] mx-0.5"></i>}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* 4. شريط التبديل بين طريقة العرض والبحث */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 mb-4">
                                <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                                    <button
                                        type="button"
                                        onClick={() => setPipelineViewMode('grouped')}
                                        className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${pipelineViewMode === 'grouped' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        <i className="fas fa-th-large text-xs"></i>
                                        <span>عرض الأقسام المجمعة (13 قسم)</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPipelineViewMode('table')}
                                        className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${pipelineViewMode === 'table' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        <i className="fas fa-list-ul text-xs"></i>
                                        <span>عرض جدول المراحل التفصيلي (26 مرحلة)</span>
                                    </button>
                                </div>

                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <input
                                        type="text"
                                        value={stageSearchQuery}
                                        onChange={e => setStageSearchQuery(e.target.value)}
                                        placeholder="بحث باسم المرحلة أو الكود..."
                                        className="slate-input text-xs py-1.5 px-3 bg-slate-950 border-slate-700 w-full sm:w-56"
                                    />
                                    <select
                                        value={stageStatusFilter}
                                        onChange={e => setStageStatusFilter(e.target.value)}
                                        className="slate-input text-xs py-1.5 px-2 bg-slate-950 border-slate-700 cursor-pointer text-slate-300"
                                    >
                                        <option value="all">كل الحالات</option>
                                        <option value="active">المفعلة فقط</option>
                                        <option value="inactive">المعطلة فقط</option>
                                    </select>
                                </div>
                            </div>

                            {/* 5. عرض الأقسام الصناعية المجمعة (Grouped Pipeline Board - المنظم والمتناسق) */}
                            {pipelineViewMode === 'grouped' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-4">
                                    {PIPELINE_DEPARTMENTS.map((dept, deptIdx) => {
                                        const deptStages = stagesConfig.filter(s => s.stage_category === dept.key);
                                        if (deptStages.length === 0) return null;

                                        // فلترة الحالات والبحث
                                        const visibleStages = deptStages.filter(s => {
                                            if (stageStatusFilter === 'active' && !s.is_active) return false;
                                            if (stageStatusFilter === 'inactive' && s.is_active) return false;
                                            if (stageSearchQuery.trim()) {
                                                const q = stageSearchQuery.toLowerCase();
                                                const matchName = s.stage_name && s.stage_name.toLowerCase().includes(q);
                                                const matchCode = s.stage_code && s.stage_code.toLowerCase().includes(q);
                                                if (!matchName && !matchCode) return false;
                                            }
                                            return true;
                                        });

                                        if (visibleStages.length === 0 && (stageSearchQuery.trim() || stageStatusFilter !== 'all')) {
                                            return null;
                                        }

                                        const activeInDept = deptStages.filter(s => s.is_active);
                                        const allActive = deptStages.length > 0 && activeInDept.length === deptStages.length;
                                        const someActive = activeInDept.length > 0 && !allActive;

                                        return (
                                            <div key={dept.key} className={`p-3.5 rounded-xl bg-slate-900/90 border ${allActive ? 'border-cyan-500/40' : 'border-slate-800'} flex flex-col justify-between shadow-sm hover:border-slate-700 transition-all`}>
                                                <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-800/80">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs ${dept.color}`}>
                                                            <i className={`fas ${dept.icon}`}></i>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-bold text-white flex items-center gap-1.5">
                                                                <span>{deptIdx + 1}. {dept.label}</span>
                                                            </div>
                                                            <div className="text-[10px] text-slate-500">{dept.desc}</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {allActive ? (
                                                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">مفعل ({activeInDept.length}/{deptStages.length})</span>
                                                        ) : someActive ? (
                                                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">جزئي ({activeInDept.length}/{deptStages.length})</span>
                                                        ) : (
                                                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 border border-slate-700">معطل ({activeInDept.length}/{deptStages.length})</span>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggleCategoryPreset(dept.key)}
                                                            className={`btn-slate text-[10px] py-1 px-2.5 font-bold transition-all ${allActive ? 'text-rose-400 hover:bg-rose-500/10 border-rose-500/30' : 'text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/30'}`}
                                                            title="تفعيل أو تعطيل كافة مراحل هذا القسم بنقرة واحدة"
                                                        >
                                                            <i className={`fas fa-${allActive ? 'toggle-off' : 'toggle-on'} ml-1`}></i>
                                                            <span>{allActive ? 'تعطيل' : 'تفعيل القسم'}</span>
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    {(visibleStages.length > 0 ? visibleStages : deptStages).map(s => {
                                                        const isActive = Boolean(s.is_active);
                                                        return (
                                                            <div key={s.id} className={`flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border ${isActive ? 'border-slate-800' : 'border-slate-800/40 opacity-60'} hover:border-cyan-500/40 transition-all`}>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="flex items-center gap-0.5 font-mono text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                                                        <span>#{s.order_index}</span>
                                                                        <div className="flex flex-col text-[8px] leading-tight mr-1">
                                                                            <button type="button" onClick={() => handleShiftStageOrder(s.id, -1)} className="hover:text-cyan-400">▲</button>
                                                                            <button type="button" onClick={() => handleShiftStageOrder(s.id, 1)} className="hover:text-cyan-400">▼</button>
                                                                        </div>
                                                                    </div>
                                                                    <span className="font-bold text-xs text-white">{s.stage_name}</span>
                                                                    {s.stage_code && <span className="text-[9px] font-mono px-1 rounded bg-slate-900 text-cyan-300 font-bold border border-slate-800">{s.stage_code}</span>}
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleToggleSingleStage(s.id)}
                                                                        className={`btn-slate text-[10px] py-1 px-2.5 font-bold transition-all ${isActive ? 'text-rose-400 hover:bg-rose-500/10 border-rose-500/30' : 'text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/30'}`}
                                                                    >
                                                                        <i className={`fas fa-${isActive ? 'toggle-off' : 'toggle-on'} ml-1`}></i>
                                                                        <span>{isActive ? 'إيقاف' : 'تفعيل'}</span>
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleEditStagePrompt(s)}
                                                                        className="text-slate-500 hover:text-cyan-300 text-xs px-1"
                                                                        title="تعديل"
                                                                    >
                                                                        <i className="fas fa-edit"></i>
                                                                    </button>
                                                                    {!s.is_system && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteCustomStage(s.id, s.stage_name)}
                                                                            className="text-rose-500 hover:text-rose-400 text-xs px-1"
                                                                            title="حذف"
                                                                        >
                                                                            <i className="fas fa-trash-alt"></i>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* 6. العرض البديل: جدول المراحل التفصيلي الموحد (Flat Table View) */}
                            {pipelineViewMode === 'table' && (
                                <div className="overflow-x-auto rounded-xl border border-slate-800 mb-4 bg-slate-900/60 p-3">
                                    <table className="slate-table w-full text-xs">
                                        <thead>
                                            <tr className="bg-slate-900/90 text-slate-300">
                                                <th className="w-16 text-center">الترتيب</th>
                                                <th>اسم المرحلة الصناعية</th>
                                                <th className="text-center w-28">الكود المختصر</th>
                                                <th className="text-center w-36">القسم الصناعي</th>
                                                <th className="text-center w-28">الحالة في المصنع</th>
                                                <th className="text-center w-40">التحكم الفوري (المالك)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stagesConfig
                                                .filter(s => {
                                                    if (stageStatusFilter === 'active') return s.is_active;
                                                    if (stageStatusFilter === 'inactive') return !s.is_active;
                                                    return true;
                                                })
                                                .filter(s => {
                                                    if (!stageSearchQuery.trim()) return true;
                                                    const q = stageSearchQuery.toLowerCase();
                                                    return (s.stage_name && s.stage_name.toLowerCase().includes(q)) ||
                                                           (s.stage_code && s.stage_code.toLowerCase().includes(q));
                                                })
                                                .map((s, i) => {
                                                    const dept = PIPELINE_DEPARTMENTS.find(d => d.key === s.stage_category) || { label: s.stage_category || 'مخصص', color: 'text-slate-400' };
                                                    const isActive = Boolean(s.is_active);

                                                    return (
                                                        <tr key={s.id} className={`hover:bg-slate-800/40 transition-all ${isActive ? '' : 'opacity-60'}`}>
                                                            <td className="p-2.5 text-center">
                                                                <div className="flex items-center justify-center gap-1">
                                                                    <span className="font-mono text-xs font-bold text-slate-300">{s.order_index || i + 1}</span>
                                                                    <div className="flex flex-col text-[8px] leading-tight mr-1 text-slate-500">
                                                                        <button type="button" onClick={() => handleShiftStageOrder(s.id, -1)} className="hover:text-cyan-400">▲</button>
                                                                        <button type="button" onClick={() => handleShiftStageOrder(s.id, 1)} className="hover:text-cyan-400">▼</button>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-2.5 font-bold text-white text-xs">
                                                                {s.stage_name}
                                                                {s.is_system ? '' : <span className="text-[9px] font-mono mr-1.5 px-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">مخصصة</span>}
                                                            </td>
                                                            <td className="p-2.5 text-center font-mono text-xs text-cyan-300 font-bold">{s.stage_code || '-'}</td>
                                                            <td className="p-2.5 text-center"><span className={`text-[10px] font-bold px-2 py-0.5 rounded border border-slate-700 bg-slate-900 ${dept.color}`}>{dept.label}</span></td>
                                                            <td className="p-2.5 text-center">
                                                                {isActive ? (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>نشطة</span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-500 border border-slate-700"><span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>معطلة</span>
                                                                )}
                                                            </td>
                                                            <td className="p-2.5 text-center">
                                                                <div className="flex items-center justify-center gap-1">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleToggleSingleStage(s.id)}
                                                                        className={`btn-slate text-[11px] py-1 px-2.5 font-bold transition-all ${isActive ? 'text-rose-400 hover:bg-rose-500/10 border-rose-500/30' : 'text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/30'}`}
                                                                    >
                                                                        <i className={`fas fa-${isActive ? 'toggle-off' : 'toggle-on'} ml-1`}></i>
                                                                        <span>{isActive ? 'إيقاف' : 'تفعيل'}</span>
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleEditStagePrompt(s)}
                                                                        className="btn-slate text-[11px] py-1 px-2 text-slate-400 hover:text-cyan-300"
                                                                        title="تعديل"
                                                                    >
                                                                        <i className="fas fa-edit"></i>
                                                                    </button>
                                                                    {!s.is_system && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteCustomStage(s.id, s.stage_name)}
                                                                            className="btn-slate text-[11px] py-1 px-2 font-bold text-rose-500 hover:bg-rose-500/10 border-rose-500/20"
                                                                            title="حذف"
                                                                        >
                                                                            <i className="fas fa-trash-alt"></i>
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="mt-4 p-3 rounded-lg bg-blue-950/20 border border-blue-500/20 flex items-center gap-2.5 text-xs text-blue-300">
                                <i className="fas fa-info-circle text-blue-400"></i>
                                <span>بصفتك مالك السيستم (Super Admin)، تملك حرية تفعيل أو إيقاف أي مرحلة على الإطلاق بدون قيود، ويطبّق التغيير فوراً على الأوامر الجديدة والمشغلين والتتبع.</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ===================== بارتشن إدارة المستخدمين (افتراضي) ===================== */}
                {(!isSuperAdmin || activeTab === 'users') && (
                    <>

                {/* Add New User */}
                <div className="slate-card p-5">
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-700/60">
                        <div className="flex items-center gap-2">
                            <i className="fas fa-user-plus text-blue-400 text-xs"></i>
                            <h2 className="text-xs sm:text-sm font-bold text-white">{t('admin.sec_add_user')}</h2>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">NEW USER</span>
                    </div>

                    <form onSubmit={handleCreateUser}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 items-end mb-3">
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                    {t('admin.field_username')} *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    placeholder={t('admin.field_username_placeholder')}
                                    className="slate-input font-mono text-xs"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t('admin.field_password')} *</label>
                                <input
                                    type="text"
                                    required
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder={t('admin.field_password_placeholder')}
                                    className="slate-input font-mono text-xs"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t('admin.field_fullname')} ({language === 'ar' ? 'اختياري' : 'optional'})</label>
                                <input
                                    type="text"
                                    value={newFullName}
                                    onChange={(e) => setNewFullName(e.target.value)}
                                    placeholder={t('admin.field_fullname_placeholder')}
                                    className="slate-input text-xs"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 items-end">
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t('admin.field_role')}</label>
                                <select
                                    value={newRole}
                                    onChange={(e) => setNewRole(e.target.value)}
                                    className="slate-input text-xs cursor-pointer"
                                >
                                    <option value="production">{language === 'ar' ? 'يوزر إنتاج (مسح مراحل محددة)' : 'Production Operator (specific stages)'}</option>
                                    <option value="factory_owner">🏢 {language === 'ar' ? 'صاحب المصنع (داشبورد وتتبع شامل فقط)' : 'Factory Owner (Dashboard & Tracking Only)'}</option>
                                    <option value="external_operator">{language === 'ar' ? 'تشغيل خارجي (مسح أي باركود)' : 'External Operator (any barcode)'}</option>
                                    <option value="external_admin">{language === 'ar' ? 'مشرف تشغيل خارجي (متابعة الأوردرات الخارجية فقط)' : 'External Admin (external orders only)'}</option>
                                    <option value="admin_view">{language === 'ar' ? 'متابع إداري (اطلاع فقط)' : 'Admin Viewer (read-only)'}</option>
                                    <option value="admin">{language === 'ar' ? 'مدير مصنع (أدمن عادي)' : 'Factory Manager (Admin)'}</option>
                                    {isSuperAdmin && (
                                        <option value="superadmin">👑 {language === 'ar' ? 'مالك السيستم (Super Admin - صلاحية شاملة)' : 'System Owner (Super Admin - Full Access)'}</option>
                                    )}
                                </select>
                            </div>

                            {newRole === 'production' ? (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                        {t('admin.field_stage_permission')}
                                    </label>
                                    <select
                                        value={newStage}
                                        onChange={(e) => setNewStage(e.target.value)}
                                        className="slate-input text-xs cursor-pointer"
                                    >
                                        {activeStages.length > 0 ? activeStages.map((s) => (
                                            <option key={s.id} value={s.stage_name}>
                                                {s.stage_name}
                                            </option>
                                        )) : (
                                            <option value="">{t('common.loading')}</option>
                                        )}
                                    </select>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                        {t('common.stage')}
                                    </label>
                                    <input
                                        type="text"
                                        disabled
                                        value={language === 'ar' ? 'غير مقيد بمرحلة' : 'Not stage-restricted'}
                                        className="slate-input text-xs bg-[#0a1120] text-slate-500 cursor-not-allowed"
                                    />
                                </div>
                            )}

                            <div>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="btn-slate btn-slate-primary w-full py-2.5 text-xs font-semibold"
                                >
                                    {submitting ? (
                                        <span className="flex items-center justify-center gap-1.5">
                                            <i className="fas fa-circle-notch fa-spin"></i>
                                            <span>{t('admin.btn_creating_user')}</span>
                                        </span>
                                    ) : (
                                        <span className="flex items-center justify-center gap-1.5">
                                            <i className="fas fa-plus text-xs"></i>
                                            <span>{t('admin.btn_create_user')}</span>
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

                {/* Users List Table */}
                <div className="slate-card p-5">
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-700/60">
                        <div className="flex items-center gap-2">
                            <i className="fas fa-users-cog text-blue-400 text-xs"></i>
                            <h2 className="text-xs sm:text-sm font-bold text-white">{t('admin.users_list_title')}</h2>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">{users.length} {language === 'ar' ? 'حساب' : 'accounts'}</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="slate-table w-full">
                            <thead>
                                <tr>
                                    <th className="p-3 text-center w-12 font-bold">#</th>
                                    <th className="p-3 font-bold">{t('admin.col_username')}</th>
                                    <th className="p-3 font-bold">{t('admin.col_fullname')}</th>
                                    <th className="p-3 font-bold">{t('admin.col_role')}</th>
                                    <th className="p-3 font-bold">{t('admin.col_stage')}</th>
                                    <th className="p-3 text-center font-bold">{t('admin.col_status')}</th>
                                    <th className="p-3 text-center font-bold">{t('admin.col_actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="7" className="text-center py-8 text-slate-400 text-xs">
                                            <i className="fas fa-circle-notch fa-spin text-base mb-2 block text-blue-400"></i>
                                            {language === 'ar' ? 'جاري تحميل المستخدمين...' : 'Loading users...'}
                                        </td>
                                    </tr>
                                ) : users.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="py-12">
                                            <div className="empty-state">
                                                <div className="empty-state-icon">
                                                    <i className="fas fa-users-slash"></i>
                                                </div>
                                                <div className="empty-state-title">{language === 'ar' ? 'لا يوجد مستخدمون مسجلون بعد' : 'No users registered yet'}</div>
                                                <div className="empty-state-desc">
                                                    {language === 'ar' ? 'استخدم نموذج الإضافة أعلاه لإنشاء حسابات المشغلين والمشرفين' : 'Use the form above to create operator and supervisor accounts'}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    users.map((u, i) => {
                                        let roleBadge = null;
                                        if (u.role === 'superadmin') {
                                            roleBadge = (
                                                <span className="badge-clean text-[10px]" style={{background:'linear-gradient(135deg,#78350f,#92400e)',color:'#fef3c7',border:'1px solid #b45309'}}>
                                                    <i className="fas fa-crown ml-1"></i> {language === 'ar' ? 'مالك السيستم' : 'System Owner'}
                                                </span>
                                            );
                                        } else if (u.role === 'admin') {
                                            roleBadge = (
                                                <span className="badge-clean badge-amber text-[10px]">
                                                    <span className="badge-clean-dot"></span> {language === 'ar' ? 'مدير نظام' : 'System Admin'}
                                                </span>
                                            );
                                        } else if (u.role === 'factory_owner') {
                                            roleBadge = (
                                                <span className="badge-clean text-[10px]" style={{background:'linear-gradient(135deg, rgba(2,132,199,0.2), rgba(99,102,241,0.2))',color:'#38bdf8',border:'1px solid rgba(56,189,248,0.4)'}}>
                                                    <i className="fas fa-building-user text-[9px] mr-1"></i> {language === 'ar' ? 'صاحب المصنع' : 'Factory Owner'}
                                                </span>
                                            );
                                        } else if (u.role === 'admin_view') {
                                            roleBadge = (
                                                <span className="badge-clean badge-blue text-[10px]">
                                                    <span className="badge-clean-dot"></span> {language === 'ar' ? 'متابع إداري' : 'Admin Viewer'}
                                                </span>
                                            );
                                        } else if (u.role === 'external_operator') {
                                            roleBadge = (
                                                <span className="badge-clean text-[10px]" style={{background:'rgba(6,182,212,0.15)',color:'#22d3ee',border:'1px solid rgba(6,182,212,0.3)'}}>
                                                    <span className="badge-clean-dot" style={{background:'#22d3ee'}}></span> {language === 'ar' ? 'تشغيل خارجي' : 'External Op.'}
                                                </span>
                                            );
                                        } else if (u.role === 'external_admin') {
                                            roleBadge = (
                                                <span className="badge-clean text-[10px]" style={{background:'rgba(6,182,212,0.15)',color:'#22d3ee',border:'1px solid rgba(6,182,212,0.3)'}}>
                                                    <span className="badge-clean-dot" style={{background:'#22d3ee'}}></span> {language === 'ar' ? 'مشرف خارجي' : 'External Admin'}
                                                </span>
                                            );
                                        } else {
                                            roleBadge = (
                                                <span className="badge-clean badge-green text-[10px]">
                                                    <span className="badge-clean-dot"></span> {language === 'ar' ? 'يوزر إنتاج' : 'Production Op.'}
                                                </span>
                                            );
                                        }

                                        const isMaster = (u.username?.toLowerCase() === 'gamal' || u.username?.toLowerCase() === 'auf');

                                        return (
                                            <tr key={u.id} className="hover:bg-slate-800/40 transition">
                                                <td className="p-3 text-slate-500 font-mono text-xs text-center">{i + 1}</td>
                                                <td className="p-3 font-bold text-white font-mono text-xs">{u.username}</td>
                                                <td className="p-3 text-slate-300 text-xs">{u.full_name || u.username}</td>
                                                <td className="p-3">{roleBadge}</td>
                                                <td className="p-3 text-slate-300 text-xs font-mono">
                                                    {u.role === 'production' ? (
                                                        u.stage_action || (language === 'ar' ? 'غير محدد' : 'Unassigned')
                                                    ) : (
                                                        <span className="text-slate-500">—</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {isMaster ? (
                                                        <span className="badge-clean text-[10px]" style={{background:'rgba(245,158,11,0.15)',color:'#fbbf24',border:'1px solid rgba(245,158,11,0.35)'}}>
                                                            <i className="fas fa-shield-alt ml-1"></i> {language === 'ar' ? 'محصن ضد القفل' : 'Lock Protected'}
                                                        </span>
                                                    ) : u.is_locked ? (
                                                        u.locked_until ? (
                                                            <span className="badge-clean text-[10px]" style={{background:'rgba(245,158,11,0.18)',color:'#f59e0b',border:'1px solid rgba(245,158,11,0.4)'}} title={`مقفول مؤقتاً`}>
                                                                <i className="fas fa-clock ml-1"></i> {language === 'ar' ? 'مقفول مؤقتاً (5 د)' : 'Temp Locked (5m)'}
                                                            </span>
                                                        ) : (
                                                            <span className="badge-clean text-[10px]" style={{background:'rgba(239,68,68,0.18)',color:'#ef4444',border:'1px solid rgba(239,68,68,0.4)'}} title="مقفول نهائياً بواسطة نظام الحماية">
                                                                <i className="fas fa-lock ml-1"></i> {language === 'ar' ? 'مقفول نهائياً' : 'Locked'}
                                                            </span>
                                                        )
                                                    ) : (u.failed_login_count > 0) ? (
                                                        <span className="badge-clean text-[10px]" style={{background:'rgba(245,158,11,0.12)',color:'#fbbf24',border:'1px solid rgba(245,158,11,0.25)'}} title={`${u.failed_login_count} محاولات خاطئة`}>
                                                            <i className="fas fa-exclamation-triangle ml-1"></i> {u.failed_login_count}/5 {language === 'ar' ? 'محاولات' : 'attempts'}
                                                        </span>
                                                    ) : (
                                                        <span className="badge-clean badge-green text-[10px]">
                                                            <i className="fas fa-check-circle ml-1"></i> {language === 'ar' ? 'نشط' : 'Active'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        {/* Unlock Button for locked users */}
                                                        {u.is_locked && (isSuperAdmin || isAdmin || ['gamal','auf'].includes(user?.username?.toLowerCase())) && (
                                                            <button
                                                                onClick={() => handleUnlockUser(u.id, u.username)}
                                                                className="btn-slate text-[11px] py-1 px-2.5 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/15 hover:border-emerald-400 transition flex items-center gap-1 font-semibold"
                                                                title="فك قفل الحساب فوراً وتصفير محاولات تسجيل الدخول"
                                                            >
                                                                <i className="fas fa-unlock text-[10px]"></i> {t('admin.btn_unlock')}
                                                            </button>
                                                        )}
                                                        {/* Edit Button */}
                                                        {canEditUser(u) && (
                                                            <button
                                                                onClick={() => openEditModal(u)}
                                                                className="btn-slate text-[11px] py-1 px-2.5 border-blue-500/40 text-blue-400 hover:bg-blue-500/10 hover:border-blue-400/60 transition"
                                                                title="تعديل الصلاحيات"
                                                            >
                                                                <i className="fas fa-edit text-[10px]"></i> {t('admin.btn_edit')}
                                                            </button>
                                                        )}
                                                        {/* Delete Button */}
                                                        {canDeleteUser(u) ? (
                                                            <button
                                                                onClick={() => handleDeleteUser(u.id, u.username)}
                                                                className="btn-slate btn-slate-danger text-[11px] py-1 px-2 transition"
                                                            >
                                                                <i className="fas fa-trash-alt text-[10px]"></i> {t('admin.btn_delete')}
                                                            </button>
                                                        ) : (
                                                            <span className="text-[11px] font-mono" style={{color: (u.username?.toLowerCase() === 'gamal' || u.username?.toLowerCase() === 'auf') ? '#f59e0b' : (u.role === 'superadmin' ? '#d97706' : '#64748b')}}>
                                                                {(u.username?.toLowerCase() === 'gamal' || u.username?.toLowerCase() === 'auf') ? (
                                                                    <><i className="fas fa-crown text-[10px] ml-1"></i>{language === 'ar' ? 'مالك محمي نهائياً' : 'Protected Owner'}</>
                                                                ) : u.role === 'superadmin' ? (
                                                                    <><i className="fas fa-shield-alt text-[10px] ml-1"></i>{language === 'ar' ? 'محمي' : 'Protected'}</>
                                                                ) : u.id === user?.id ? (
                                                                    (language === 'ar' ? 'حسابك' : 'Your account')
                                                                ) : (
                                                                    (language === 'ar' ? 'أساسي' : 'Core')
                                                                )}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                </>
                )}
            </main>

            {/* ===== Edit User Modal ===== */}
            {editUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{backgroundColor:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)'}}>
                    <div
                        className="w-full max-w-lg rounded-2xl border border-slate-700/80 shadow-2xl"
                        style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'}}
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-5 border-b border-slate-700/60">
                            <div className="flex items-center gap-3">
                                <span className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-400 text-sm">
                                    <i className="fas fa-user-edit"></i>
                                </span>
                                <div>
                                    <h3 className="text-sm font-bold text-white">{language === 'ar' ? 'تعديل صلاحيات المستخدم' : 'Edit User Permissions'}</h3>
                                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                        {editUser.username}
                                        {editUser.full_name && editUser.full_name !== editUser.username && (
                                            <span className="text-slate-500 mr-2">({editUser.full_name})</span>
                                        )}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={closeEditModal}
                                className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 flex items-center justify-center transition"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleUpdateUser}>
                            <div className="p-5 space-y-4">
                                {/* Full Name */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                        <i className="fas fa-id-card text-slate-500 ml-1 text-[10px]"></i>
                                        {t('admin.field_fullname')}
                                    </label>
                                    <input
                                        type="text"
                                        value={editFullName}
                                        onChange={(e) => setEditFullName(e.target.value)}
                                        placeholder={t('admin.field_fullname_placeholder')}
                                        className="slate-input text-xs"
                                    />
                                </div>

                                {/* Role */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                        <i className="fas fa-user-tag text-slate-500 ml-1 text-[10px]"></i>
                                        {t('admin.field_role')}
                                    </label>
                                    <select
                                        value={editRole}
                                        onChange={(e) => setEditRole(e.target.value)}
                                        className="slate-input text-xs cursor-pointer"
                                    >
                                        <option value="production">{language === 'ar' ? 'يوزر إنتاج (مسح مراحل محددة)' : 'Production Operator (specific stages)'}</option>
                                        <option value="factory_owner">🏢 {language === 'ar' ? 'صاحب المصنع (داشبورد وتتبع شامل فقط)' : 'Factory Owner (Dashboard & Tracking Only)'}</option>
                                        <option value="external_operator">{language === 'ar' ? 'تشغيل خارجي (مسح أي باركود)' : 'External Operator (any barcode)'}</option>
                                        <option value="external_admin">{language === 'ar' ? 'مشرف تشغيل خارجي (متابعة الأوردرات الخارجية فقط)' : 'External Admin (external orders only)'}</option>
                                        <option value="admin_view">{language === 'ar' ? 'متابع إداري (اطلاع فقط)' : 'Admin Viewer (read-only)'}</option>
                                        <option value="admin">{language === 'ar' ? 'مدير مصنع (أدمن عادي)' : 'Factory Manager (Admin)'}</option>
                                        {isSuperAdmin && (
                                            <option value="superadmin">👑 {language === 'ar' ? 'مالك السيستم (Super Admin - صلاحية شاملة)' : 'System Owner (Super Admin - Full Access)'}</option>
                                        )}
                                    </select>
                                </div>

                                {/* Stage (conditional) */}
                                {editRole === 'production' && (
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                            <i className="fas fa-industry text-slate-500 ml-1 text-[10px]"></i>
                                            {t('admin.field_stage_permission')}
                                        </label>
                                        <select
                                            value={editStage}
                                            onChange={(e) => setEditStage(e.target.value)}
                                            className="slate-input text-xs cursor-pointer"
                                        >
                                            {activeStages.length > 0 ? activeStages.map((s) => (
                                                <option key={s.id} value={s.stage_name}>
                                                    {s.stage_name}
                                                </option>
                                            )) : (
                                                <option value="">{t('common.loading')}</option>
                                            )}
                                        </select>
                                    </div>
                                )}

                                {/* New Password (optional) */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                        <i className="fas fa-lock text-slate-500 ml-1 text-[10px]"></i>
                                        {language === 'ar' ? 'كلمة مرور جديدة' : 'New Password'}
                                        <span className="text-slate-500 font-normal mr-1">{language === 'ar' ? '(اتركه فارغ لو مش عايز تغيّرها)' : '(leave empty to keep current)'}</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={editPassword}
                                        onChange={(e) => setEditPassword(e.target.value)}
                                        placeholder={t('admin.field_password_placeholder')}
                                        className="slate-input font-mono text-xs"
                                    />
                                </div>

                                {/* Role Permissions Preview */}
                                <div className="rounded-xl p-3 border border-slate-700/50" style={{background:'rgba(30,41,59,0.5)'}}>
                                    <p className="text-[10px] text-slate-400 font-bold mb-2">
                                        <i className="fas fa-info-circle ml-1"></i>
                                        {language === 'ar' ? 'الصلاحيات المتاحة لهذا الدور:' : 'Permissions available for this role:'}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {editRole === 'superadmin' && (
                                            <>
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">{language === 'ar' ? 'كل الصلاحيات' : 'All Permissions'}</span>
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">{language === 'ar' ? 'إدارة التراخيص' : 'License Management'}</span>
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">{language === 'ar' ? 'إنشاء حسابات ملاك' : 'Create Owner Accounts'}</span>
                                            </>
                                        )}
                                        {(editRole === 'admin' || editRole === 'superadmin') && (
                                            <>
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">{language === 'ar' ? 'إدارة المستخدمين' : 'User Management'}</span>
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">{language === 'ar' ? 'إنشاء أوردرات' : 'Create Orders'}</span>
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">{language === 'ar' ? 'طباعة التقارير' : 'Print Reports'}</span>
                                            </>
                                        )}
                                        {editRole === 'admin_view' && (
                                            <>
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">{language === 'ar' ? 'عرض الأوردرات' : 'View Orders'}</span>
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">{language === 'ar' ? 'إنشاء أوردرات' : 'Create Orders'}</span>
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">{language === 'ar' ? 'طباعة التقارير' : 'Print Reports'}</span>
                                            </>
                                        )}
                                        {editRole === 'production' && (
                                            <>
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">{language === 'ar' ? 'مسح الباركود' : 'Scan Barcodes'}</span>
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">{language === 'ar' ? 'مرحلة واحدة فقط' : 'Single Stage Only'}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="flex items-center justify-between p-5 border-t border-slate-700/60 gap-3">
                                <button
                                    type="button"
                                    onClick={closeEditModal}
                                    className="btn-slate text-xs py-2 px-5 text-slate-400 hover:text-white transition"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={editSubmitting}
                                    className="btn-slate btn-slate-primary text-xs py-2 px-6 font-bold"
                                >
                                    {editSubmitting ? (
                                        <span className="flex items-center gap-1.5">
                                            <i className="fas fa-circle-notch fa-spin"></i>
                                            {language === 'ar' ? 'جاري الحفظ...' : 'Saving...'}
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1.5">
                                            <i className="fas fa-save"></i>
                                            {language === 'ar' ? 'حفظ التعديلات' : 'Save Changes'}
                                        </span>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

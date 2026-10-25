import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, getAuthHeaders } from '../services/api';
import { printBarcodesWindow } from '../services/print';

// تصنيفات المراحل وأيقوناتها وألوانها
const CATEGORY_META = {
    cutting: { label: 'القص والتجهيز', icon: 'fa-cut', color: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-950/20' },
    embroidery: { label: 'التطريز', icon: 'fa-feather-alt', color: 'text-pink-400', border: 'border-pink-500/30', bg: 'bg-pink-950/20' },
    printing: { label: 'الطباعة', icon: 'fa-palette', color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-950/20' },
    production: { label: 'الإنتاج والخياطة', icon: 'fa-industry', color: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-950/20' },
    laser: { label: 'المعالجة بالليزر', icon: 'fa-bolt', color: 'text-yellow-400', border: 'border-yellow-500/30', bg: 'bg-yellow-950/20' },
    sanding: { label: 'السنفرة والمعالجة السطحية', icon: 'fa-gem', color: 'text-orange-400', border: 'border-orange-500/30', bg: 'bg-orange-950/20' },
    crushing: { label: 'الكرمشة والتكسير', icon: 'fa-wave-square', color: 'text-indigo-400', border: 'border-indigo-500/30', bg: 'bg-indigo-950/20' },
    wash: { label: 'المغسلة والإنهاء الرطب', icon: 'fa-tint', color: 'text-cyan-400', border: 'border-cyan-500/30', bg: 'bg-cyan-950/20' },
    dyeing: { label: 'الصباغة', icon: 'fa-flask', color: 'text-teal-400', border: 'border-teal-500/30', bg: 'bg-teal-950/20' },
    qc: { label: 'فحص الجودة والمطابقة', icon: 'fa-check-double', color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-950/20' },
    ironing: { label: 'الكي والتجهيز النهائي', icon: 'fa-fire', color: 'text-rose-400', border: 'border-rose-500/30', bg: 'bg-rose-950/20' },
    packing: { label: 'التعبئة والتغليف', icon: 'fa-box-open', color: 'text-sky-400', border: 'border-sky-500/30', bg: 'bg-sky-950/20' },
    warehouse: { label: 'المخزن النهائي والشحن', icon: 'fa-warehouse', color: 'text-slate-400', border: 'border-slate-500/30', bg: 'bg-slate-900/40' },
};

const STANDARD_6_STAGES = [
    'دخول انتاج',
    'خروج انتاج',
    'دخول مغسلة',
    'خروج مغسلة',
    'دخول تعبئة',
    'خروج تعبئة'
];

export default function CreateOrderPage() {
    const { user, canCreateOrders } = useAuth();
    const { toast, showAlert, showProgress, updateProgress, closeProgress } = useToast();
    const navigate = useNavigate();

    // Form inputs
    const [orderNumber, setOrderNumber] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [targetQuantity, setTargetQuantity] = useState('');
    const [stickerFormat, setStickerFormat] = useState('roll_35x80');

    // Stages from system config
    const [systemStages, setSystemStages] = useState([]);
    const [selectedStages, setSelectedStages] = useState(STANDARD_6_STAGES);
    const [loadingStages, setLoadingStages] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Created order success modal
    const [createdOrderResult, setCreatedOrderResult] = useState(null);

    // Fetch available stages from system
    useEffect(() => {
        const loadStages = async () => {
            try {
                setLoadingStages(true);
                const { ok, data } = await api.getStages();
                if (ok && data.success && Array.isArray(data.stages)) {
                    setSystemStages(data.stages);
                    // Default selection: active stages or standard 6
                    const activeNames = data.stages.filter(s => s.is_active).map(s => s.stage_name);
                    if (activeNames.length > 0) {
                        setSelectedStages(activeNames);
                    }
                }
            } catch (err) {
                console.error('Failed to load stages config:', err);
            } finally {
                setLoadingStages(false);
            }
        };
        loadStages();
    }, []);

    // Toggle single stage
    const toggleStage = (stageName) => {
        setSelectedStages(prev => 
            prev.includes(stageName)
                ? prev.filter(s => s !== stageName)
                : [...prev, stageName]
        );
    };

    // Toggle entire category
    const toggleCategory = (categoryKey, selectAll) => {
        const catStages = systemStages.filter(s => s.stage_category === categoryKey).map(s => s.stage_name);
        if (selectAll) {
            setSelectedStages(prev => Array.from(new Set([...prev, ...catStages])));
        } else {
            setSelectedStages(prev => prev.filter(s => !catStages.includes(s)));
        }
    };

    // Apply Presets
    const applyStandardPreset = () => {
        setSelectedStages(STANDARD_6_STAGES);
        toast('تم تطبيق المراحل الأساسية الستة (إنتاج + مغسلة + تعبئة)', 'info');
    };

    const applyActivePreset = () => {
        const activeNames = systemStages.filter(s => s.is_active).map(s => s.stage_name);
        setSelectedStages(activeNames.length > 0 ? activeNames : STANDARD_6_STAGES);
        toast('تم اختيار كافة المراحل النشطة المعتمدة في النظام', 'info');
    };

    const applySpecialWorkflowPreset = () => {
        // خط شامل مع ليزر وسنفرة
        const special = [
            'دخول قص', 'خروج قص',
            'دخول تطريز', 'خروج تطريز',
            'دخول انتاج', 'خروج انتاج',
            'دخول ليزر', 'خروج ليزر',
            'دخول سنفرة', 'خروج سنفرة',
            'دخول مغسلة', 'خروج مغسلة',
            'دخول كي', 'خروج كي',
            'دخول تعبئة', 'خروج تعبئة'
        ];
        setSelectedStages(special);
        toast('تم تطبيق مسار العمل الخاص (شامل الليزر والسنفرة والتطريز)', 'info');
    };

    const selectAllStages = () => {
        setSelectedStages(systemStages.map(s => s.stage_name));
        toast('تم تحديد جميع مراحل النظام', 'info');
    };

    const clearAllStages = () => {
        setSelectedStages([]);
        toast('تم إلغاء تحديد كافة المراحل', 'warning');
    };

    // تعيين مرحلة محددة كمرحلة البداية الإلزامية (Primary Stage)
    const setAsPrimaryStage = (stageName) => {
        setSelectedStages(prev => {
            const remaining = prev.filter(s => s !== stageName);
            return [stageName, ...remaining];
        });
        toast(`👑 تم تعيين مرحلة [${stageName}] كمرحلة البداية الإلزامية للأوردر`, 'success');
    };

    // تقديم أو تأخير ترتيب مرحلة في خط الإنتاج
    const moveStage = (idx, direction) => {
        setSelectedStages(prev => {
            const targetIdx = idx + direction;
            if (targetIdx < 0 || targetIdx >= prev.length) return prev;
            const updated = [...prev];
            const temp = updated[idx];
            updated[idx] = updated[targetIdx];
            updated[targetIdx] = temp;
            return updated;
        });
    };

    // Group stages by category
    const groupedStages = systemStages.reduce((acc, stage) => {
        const cat = stage.stage_category || 'other';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(stage);
        return acc;
    }, {});

    // Submit handler
    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!canCreateOrders) {
            showAlert('غير مصرح', 'ليس لديك صلاحية فتح أوردرات جديدة.', 'warning');
            return;
        }

        const qty = parseInt(targetQuantity, 10);
        if (!orderNumber.trim()) {
            showAlert('تنبيه', 'يرجى إدخال رقم أمر الشغل / الأوردر', 'warning');
            return;
        }
        if (!customerName.trim()) {
            showAlert('تنبيه', 'يرجى إدخال اسم العميل أو المصنع', 'warning');
            return;
        }
        if (isNaN(qty) || qty <= 0) {
            showAlert('تنبيه', 'الكمية المطلوبة يجب أن تكون رقماً موجباً أكبر من صفر', 'warning');
            return;
        }
        if (qty > 200000) {
            showAlert('تنبيه', 'الحد الأقصى للكمية في الأوردر الواحد هو 200,000 قطعة', 'warning');
            return;
        }
        if (selectedStages.length === 0) {
            showAlert('تنبيه هام', 'يجب اختيار مرحلة واحدة على الأقل لخط إنتاج هذا الأوردر.', 'warning');
            return;
        }

        setSubmitting(true);
        showProgress('جاري إنشاء الأوردر وتوليد الباركود...', 'يتم تسجيل بيانات الأوردر ومراحله وتوليد الأكواد...');

        try {
            const { ok, data } = await api.generateBarcodes({
                order_number: orderNumber.trim(),
                customer_name: customerName.trim(),
                target_quantity: qty,
                stages: selectedStages
            });

            closeProgress();
            setSubmitting(false);

            if (ok && data.success) {
                toast(`تم إنشاء الأوردر (${orderNumber}) بنجاح وتوليد ${qty.toLocaleString('en-US')} باركود`, 'success');
                setCreatedOrderResult({
                    order_id: data.order_id,
                    order_number: orderNumber.trim(),
                    customer_name: customerName.trim(),
                    target_quantity: qty,
                    stages: selectedStages,
                    barcodes: data.barcodes || [],
                    is_large: data.large_order || qty > 5000
                });
            } else {
                showAlert('فشل إنشاء الأوردر', data.message || 'حدث خطأ أثناء حفظ الأوردر وتوليد الباركود.', 'error');
            }
        } catch (err) {
            closeProgress();
            setSubmitting(false);
            showAlert('خطأ في الاتصال', 'تعذر الاتصال بالخادم لإنشاء الأوردر. يرجى المحاولة لاحقاً.', 'error');
        }
    };

    // Trigger PDF download for cluster barcodes
    const triggerClusterPdfDownload = async (orderId, orderNum, format) => {
        showProgress('جاري تحضير ملف استيكرات الباركود...', 'يتم تجهيز رول الطباعة بدقة متناهية...');
        try {
            const res = await api.requestClusterPdf(orderId, format || stickerFormat);
            const data = res.data;

            if (!data.success) {
                closeProgress();
                showAlert('خطأ في استخراج PDF', data.message || 'فشلت معالجة الـ PDF', 'error');
                return;
            }

            const downloadFile = (url) => {
                const a = document.createElement('a');
                a.href = url;
                a.setAttribute('download', '');
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); }, 2000);
            };

            if (data.status === 'ready') {
                updateProgress(100, 'الملف جاهز لمكن الباركود! جاري التحميل...');
                setTimeout(() => {
                    closeProgress();
                    downloadFile(`/api/orders/${orderId}/pdf/download?format=${encodeURIComponent(format || stickerFormat)}`);
                    toast('تم تحميل ملف استيكرات الباركود بنجاح 🏷️', 'success');
                }, 400);
                return;
            }

            let attempts = 0;
            const timer = setInterval(async () => {
                attempts++;
                try {
                    const stRes = await fetch(`/api/orders/${orderId}/pdf/status?format=${encodeURIComponent(format || stickerFormat)}`, {
                        headers: getAuthHeaders(),
                    });
                    const stData = await stRes.json();
                    if (stData.success) {
                        if (stData.status === 'ready') {
                            clearInterval(timer);
                            updateProgress(100, 'اكتمل استخراج استيكرات الباركود!');
                            setTimeout(() => {
                                closeProgress();
                                downloadFile(`/api/orders/${orderId}/pdf/download?format=${encodeURIComponent(format || stickerFormat)}`);
                                toast('تم تحميل رول استيكرات الباركود بنجاح 🏷️', 'success');
                            }, 400);
                        } else if (stData.status === 'error' || stData.status === 'frozen') {
                            clearInterval(timer);
                            closeProgress();
                            showAlert('خطأ في استخراج PDF', stData.message || 'حدث خطأ أثناء معالجة الملف', 'error');
                        } else if (stData.status === 'processing') {
                            const pct = stData.progress || Math.min(95, Math.round(attempts * 2));
                            updateProgress(pct, stData.message || `جاري التجهيز... ${pct}%`);
                        }
                    }
                } catch (e) {}

                if (attempts >= 600) {
                    clearInterval(timer);
                    closeProgress();
                    showAlert('مهلة المعالجة', 'استغرقت المعالجة وقتاً طويلاً، يمكنك المحاولة لاحقاً من صفحة المتابعة.');
                }
            }, 600);
        } catch (err) {
            closeProgress();
            showAlert('خطأ', 'تعذر الاتصال بخادم الـ PDF', 'error');
        }
    };

    // Print Barcodes Window
    const handlePrintDirect = () => {
        if (!createdOrderResult) return;
        if (createdOrderResult.barcodes && createdOrderResult.barcodes.length > 0) {
            printBarcodesWindow({
                order_number: createdOrderResult.order_number,
                customer_name: createdOrderResult.customer_name,
                barcodes: createdOrderResult.barcodes
            });
        } else {
            triggerClusterPdfDownload(createdOrderResult.order_id, createdOrderResult.order_number, stickerFormat);
        }
    };

    const handleResetForm = () => {
        setCreatedOrderResult(null);
        setOrderNumber('');
        setCustomerName('');
        setTargetQuantity('');
    };

    return (
        <div className="navy-slate-bg min-h-screen flex flex-col font-sans">
            <Header
                title="فتح أوردر وتخصيص المراحل"
                subtitle="إنشاء أمر تشغيل جديد وتحديد مراحل خط الإنتاج المطلوبة بناءً على رغبة العميل"
                activePage="create-order"
                badgeText="ORDER CREATION & PIPELINE"
            />

            <main className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-6 py-5">
                
                {/* Navigation Bar / Quick Links */}
                <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
                    <div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                            <Link to="/orders" className="hover:text-sky-400 transition">الأوردرات والمتابعة</Link>
                            <span>/</span>
                            <span className="text-white font-medium">فتح أوردر جديد</span>
                        </div>
                        <h1 className="text-lg sm:text-xl font-black text-white flex items-center gap-2.5">
                            <span className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center border border-sky-500/30 text-sm">
                                <i className="fas fa-plus"></i>
                            </span>
                            فتح أوردر جديد وتحديد مراحل التشغيل
                        </h1>
                    </div>

                    <div className="flex items-center gap-2">
                        <Link
                            to="/orders"
                            className="btn-slate btn-slate-secondary text-xs py-2 px-3.5 flex items-center gap-2 shadow-sm"
                        >
                            <i className="fas fa-layer-group text-slate-400"></i>
                            <span>الانتقال لمتابعة الأوردرات</span>
                        </Link>
                    </div>
                </div>

                {/* Form and Stages Container */}
                <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    
                    {/* ===== LEFT: Order Core Information Card (4 cols) ===== */}
                    <div className="lg:col-span-5 space-y-5">
                        
                        {/* Order Details Card */}
                        <div className="slate-card p-5 border border-slate-700/80 shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500"></div>
                            
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-700/60">
                                <div className="flex items-center gap-2">
                                    <i className="fas fa-file-invoice text-sky-400 text-sm"></i>
                                    <h2 className="text-sm font-bold text-white">بيانات أمر التشغيل</h2>
                                </div>
                                <span className="text-[10px] text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded font-mono border border-sky-500/20">STEP 1</span>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1.5">
                                        رقم أمر الشغل / الأوردر <span className="text-rose-400">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            required
                                            value={orderNumber}
                                            onChange={(e) => setOrderNumber(e.target.value)}
                                            placeholder="مثال: ORD-2026-001"
                                            className="slate-input font-mono text-xs font-bold tracking-wider pl-8"
                                            dir="ltr"
                                        />
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">#</span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 mt-1 block">رقم فريد غير مكرر للأوردر لتعريفه في المحطات</span>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1.5">
                                        اسم العميل / المصنع <span className="text-rose-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        placeholder="اسم العميل أو الجهة الطالبة..."
                                        className="slate-input text-xs"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1.5">
                                        الكمية المستهدفة (عدد القطع) <span className="text-rose-400">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            required
                                            min="1"
                                            max="200000"
                                            value={targetQuantity}
                                            onChange={(e) => setTargetQuantity(e.target.value)}
                                            placeholder="مثال: 5000"
                                            className="slate-input font-mono text-sm text-amber-400 font-extrabold"
                                        />
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">قطعة</span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 mt-1 block">الحد الأقصى المتاح للتوليد: 200,000 قطعة</span>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-300 mb-1.5">
                                        مقاس استيكر مكن الباركود
                                    </label>
                                    <select
                                        value={stickerFormat}
                                        onChange={(e) => setStickerFormat(e.target.value)}
                                        className="slate-input text-xs font-semibold bg-[#0f172a]"
                                    >
                                        <option value="roll_35x80">🏷️ رول حراري (3.5 × 8 سم) - الأكثر شيوعاً</option>
                                        <option value="roll_40x60">🏷️ رول حراري صغير (4 × 6 سم)</option>
                                        <option value="a4_24">📄 ورق A4 مقسم (24 استيكر بالصفحة)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Dynamic Calculation Summary Box */}
                            <div className="mt-5 p-3.5 rounded-xl bg-[#080e1a] border border-slate-800 space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-400">المراحل المختارة للأوردر:</span>
                                    <strong className="text-sky-400 font-bold font-mono">{selectedStages.length} مرحلة</strong>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-400">إجمالي شفرات الباركود:</span>
                                    <strong className="text-amber-400 font-bold font-mono">{targetQuantity ? parseInt(targetQuantity, 10).toLocaleString('en-US') : 0} كود</strong>
                                </div>
                                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800">
                                    <span className="text-slate-300 font-semibold">إجمالي المسحات المطلوبة:</span>
                                    <strong className="text-emerald-400 font-black font-mono">
                                        {targetQuantity ? (parseInt(targetQuantity, 10) * selectedStages.length).toLocaleString('en-US') : 0} ضربة
                                    </strong>
                                </div>
                            </div>

                            {/* Submit Button */}
                            <div className="mt-5">
                                <button
                                    type="submit"
                                    disabled={submitting || selectedStages.length === 0}
                                    className="w-full btn-slate btn-slate-primary text-xs sm:text-sm py-3 px-4 font-bold flex items-center justify-center gap-2 shadow-lg shadow-sky-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {submitting ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin"></i>
                                            <span>جاري التوليد وحفظ الأوردر...</span>
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-magic text-amber-300"></i>
                                            <span>توليد الأوردر والباركود بالمراحل المحددة</span>
                                        </>
                                    )}
                                </button>
                                {selectedStages.length === 0 && (
                                    <p className="text-[11px] text-rose-400 text-center mt-2 font-medium">
                                        ⚠️ يرجى اختيار مرحلة واحدة على الأقل من القائمة لتفعيل الزر
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Selected Stages Industrial Route Visualizer */}
                        <div className="slate-card p-4 border border-slate-700/70 shadow-md">
                            <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-800">
                                <span className="text-xs font-bold text-white flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-md bg-sky-500/15 text-sky-400 flex items-center justify-center text-[11px] border border-sky-500/25">
                                        <i className="fas fa-route"></i>
                                    </span>
                                    <span>تسلسل خط الإنتاج وتحديد البداية</span>
                                </span>
                                <span className="text-[11px] text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded font-mono font-bold border border-sky-500/20">
                                    {selectedStages.length} محطة
                                </span>
                            </div>

                            {selectedStages.length === 0 ? (
                                <div className="text-center py-6 px-4 rounded-xl bg-[#070c18] border border-dashed border-slate-800 text-slate-500 text-xs">
                                    <i className="fas fa-sliders-h text-slate-600 text-base mb-1.5 block"></i>
                                    لم يتم اختيار أي محطة إنتاج بعد. يرجى اختيار المراحل من القائمة المقابلة.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {/* Primary Stage Gatekeeper Alert */}
                                    <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/30 flex items-start gap-2 text-xs">
                                        <i className="fas fa-crown text-amber-400 mt-0.5 text-xs flex-shrink-0"></i>
                                        <div className="text-[11px] text-amber-200">
                                            <strong>مرحلة البداية الإلزامية: [{selectedStages[0]}]</strong>
                                            <p className="text-slate-400 mt-0.5 leading-relaxed">
                                                لا يُسمح لأي قطعة بتخطي هذه المرحلة؛ يجب تسجيل القطعة أولاً هنا ليتم قبولها في المحطات التالية.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Stages Ordered Sequence List */}
                                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                                        {selectedStages.map((stgName, idx) => {
                                            const isPrimary = idx === 0;
                                            return (
                                                <div 
                                                    key={stgName}
                                                    className={`flex items-center justify-between p-2 rounded-lg text-xs font-bold transition-all border ${
                                                        isPrimary 
                                                            ? 'bg-amber-950/30 border-amber-500/50 text-amber-200 shadow-sm'
                                                            : 'bg-[#0a1120] border-slate-800 text-slate-300 hover:border-slate-700'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-mono font-black ${
                                                            isPrimary 
                                                                ? 'bg-amber-400 text-slate-950'
                                                                : 'bg-slate-700 text-slate-300'
                                                        }`}>
                                                            {idx + 1}
                                                        </span>
                                                        <span className="font-bold text-xs">{stgName}</span>
                                                        {isPrimary && (
                                                            <span className="text-[9.5px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                                البداية الإلزامية 👑
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-1">
                                                        {!isPrimary && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setAsPrimaryStage(stgName)}
                                                                className="text-[10px] text-amber-400 hover:text-amber-300 px-1.5 py-0.5 rounded hover:bg-amber-500/10 border border-amber-500/20 transition"
                                                                title="تعيين هذه المرحلة كمرحلة البداية الإلزامية للأوردر"
                                                            >
                                                                اجعلها البداية
                                                            </button>
                                                        )}
                                                        {idx > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => moveStage(idx, -1)}
                                                                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white rounded hover:bg-slate-800 text-[10px]"
                                                                title="تقديم الترتيب"
                                                            >
                                                                ▲
                                                            </button>
                                                        )}
                                                        {idx < selectedStages.length - 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => moveStage(idx, 1)}
                                                                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white rounded hover:bg-slate-800 text-[10px]"
                                                                title="تأخير الترتيب"
                                                            >
                                                                ▼
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleStage(stgName)}
                                                            className="text-slate-500 hover:text-rose-400 w-5 h-5 flex items-center justify-center text-xs transition"
                                                            title="استبعاد هذه المرحلة"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ===== RIGHT: Stages Selection Pipeline (7 cols) ===== */}
                    <div className="lg:col-span-7 space-y-4">
                        <div className="slate-card p-5 border border-slate-700/80 shadow-xl">
                            
                            {/* Header & Presets */}
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-700/60 flex-wrap gap-2">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <i className="fas fa-sliders-h text-emerald-400 text-sm"></i>
                                        <h2 className="text-sm font-bold text-white">تحديد مراحل تشغيل هذا الأوردر</h2>
                                    </div>
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                        حدد المراحل التي سيخضع لها هذا الأوردر بالتحديد في صالة الإنتاج (مثل سنفرة، ليزر، تطريز، مغسلة...)
                                    </p>
                                </div>
                                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono border border-emerald-500/20">STEP 2</span>
                            </div>

                            {/* Presets Toolbar */}
                            <div className="p-3 bg-[#080e1a] rounded-xl border border-slate-800/80 mb-5 space-y-2">
                                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                                    <span className="flex items-center gap-1.5">
                                        <i className="fas fa-bolt text-amber-400"></i>
                                        نماذج مسارات جاهزة وسريعة:
                                    </span>
                                    <span className="text-[11px] text-emerald-400 font-mono font-bold">
                                        مفعل {selectedStages.length} من {systemStages.length}
                                    </span>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={applyStandardPreset}
                                        className="btn-slate text-xs py-1.5 px-3 bg-blue-900/30 hover:bg-blue-800/40 text-blue-300 border border-blue-500/30"
                                        title="تطبيق المراحل الأساسية الستة (دخول/خروج إنتاج، مغسلة، تعبئة)"
                                    >
                                        ⚡ المراحل الأساسية (6 مراحل)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={applySpecialWorkflowPreset}
                                        className="btn-slate text-xs py-1.5 px-3 bg-amber-900/30 hover:bg-amber-800/40 text-amber-300 border border-amber-500/30"
                                        title="تطبيق خط متقدم يحتوي على ليزر وسنفرة وتطريز ومغسلة"
                                    >
                                        ✨ مسار خاص (ليزر + سنفرة + تطريز)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={applyActivePreset}
                                        className="btn-slate text-xs py-1.5 px-3 bg-emerald-900/30 hover:bg-emerald-800/40 text-emerald-300 border border-emerald-500/30"
                                        title="تطبيق المراحل النشطة المعتمدة في إعدادات النظام"
                                    >
                                        🏭 المعتمدة بالنظام
                                    </button>
                                    <button
                                        type="button"
                                        onClick={selectAllStages}
                                        className="btn-slate text-xs py-1.5 px-2.5 text-slate-300"
                                    >
                                        تحديد الكل
                                    </button>
                                    <button
                                        type="button"
                                        onClick={clearAllStages}
                                        className="btn-slate text-xs py-1.5 px-2.5 text-rose-400 hover:bg-rose-950/30"
                                    >
                                        إلغاء الكل
                                    </button>
                                </div>
                            </div>

                            {/* Stages Accordion / Category Groups */}
                            {loadingStages ? (
                                <div className="text-center py-12 text-slate-400 text-xs flex items-center justify-center gap-2">
                                    <div style={{ width: '18px', height: '18px', border: '2px solid #334155', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
                                    <span>جاري تحميل مراحل النظام...</span>
                                </div>
                            ) : Object.keys(groupedStages).length === 0 ? (
                                <div className="text-center py-8 text-slate-500 text-xs">
                                    لا توجد مراحل مسجلة بالنظام. يرجى مراجعة إعدادات مراحل خط الإنتاج في لوحة الإدارة.
                                </div>
                            ) : (
                                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                                    {Object.entries(groupedStages).map(([catKey, stages]) => {
                                        const meta = CATEGORY_META[catKey] || {
                                            label: catKey,
                                            icon: 'fa-layer-group',
                                            color: 'text-slate-400',
                                            border: 'border-slate-700',
                                            bg: 'bg-slate-900/30'
                                        };
                                        const selectedInCat = stages.filter(s => selectedStages.includes(s.stage_name)).length;
                                        const isAllSelected = selectedInCat === stages.length;

                                        return (
                                            <div
                                                key={catKey}
                                                className={`rounded-xl border ${meta.border} ${meta.bg} p-3 transition-all`}
                                            >
                                                {/* Category Header */}
                                                <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-800/80">
                                                    <div className="flex items-center gap-2">
                                                        <i className={`fas ${meta.icon} ${meta.color} text-xs`}></i>
                                                        <span className="text-xs font-bold text-white">{meta.label}</span>
                                                        <span className={`text-[9.5px] font-mono px-2 py-0.5 rounded-full font-bold ${
                                                            selectedInCat > 0 
                                                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' 
                                                                : 'bg-slate-800 text-slate-500'
                                                        }`}>
                                                            {selectedInCat} / {stages.length}
                                                        </span>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => toggleCategory(catKey, !isAllSelected)}
                                                        className="text-[11px] font-semibold text-slate-400 hover:text-white transition"
                                                    >
                                                        {isAllSelected ? 'إلغاء القسم' : 'تحديد القسم بالكامل'}
                                                    </button>
                                                </div>

                                                {/* Stages Grid in Category */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    {stages.map((stg) => {
                                                        const isSelected = selectedStages.includes(stg.stage_name);
                                                        return (
                                                            <div
                                                                key={stg.id || stg.stage_name}
                                                                onClick={() => toggleStage(stg.stage_name)}
                                                                className={`cursor-pointer rounded-lg p-2.5 flex items-center justify-between border transition-all ${
                                                                    isSelected
                                                                        ? 'bg-[#0f2444] border-sky-500 text-white shadow-sm shadow-sky-500/10'
                                                                        : 'bg-[#0a1120]/60 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-2.5">
                                                                    <div className={`w-4 h-4 rounded flex items-center justify-center border text-[9px] transition-colors ${
                                                                        isSelected
                                                                            ? 'bg-sky-500 border-sky-400 text-white font-bold'
                                                                            : 'border-slate-600 bg-slate-800'
                                                                    }`}>
                                                                        {isSelected && <i className="fas fa-check"></i>}
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-xs font-bold block leading-snug">
                                                                            {stg.stage_name}
                                                                        </span>
                                                                        {stg.stage_code && (
                                                                            <span className="text-[9.5px] font-mono text-slate-500 block">
                                                                                {stg.stage_code}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                                                                    isSelected ? 'text-sky-300 bg-sky-950/60' : 'text-slate-600'
                                                                }`}>
                                                                    #{stg.order_index || 0}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </form>

                {/* ===== Success Modal After Order Creation ===== */}
                {createdOrderResult && (
                    <div
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(5,10,20,0.85)',
                            backdropFilter: 'blur(8px)',
                            zIndex: 9999,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '16px'
                        }}
                    >
                        <div className="slate-card max-w-lg w-full p-6 border border-sky-500/40 shadow-2xl relative animate-in fade-in zoom-in duration-200">
                            <div className="text-center mb-5">
                                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto mb-3 text-2xl shadow-lg shadow-emerald-500/20">
                                    <i className="fas fa-check"></i>
                                </div>
                                <h3 className="text-lg font-black text-white">تم فتح الأوردر وتوليد الباركود بنجاح!</h3>
                                <p className="text-xs text-slate-400 mt-1">
                                    تم تسجيل أمر التشغيل وتخصيص خط الإنتاج وتوليد الأكواد المطلوبة بدقة
                                </p>
                            </div>

                            {/* Summary Details */}
                            <div className="bg-[#080e1a] rounded-xl p-4 border border-slate-800 space-y-2.5 mb-5 text-xs">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400">رقم أمر التشغيل:</span>
                                    <strong className="text-sky-400 font-mono text-sm">{createdOrderResult.order_number}</strong>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400">اسم العميل:</span>
                                    <strong className="text-white">{createdOrderResult.customer_name}</strong>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400">الكمية المطلوبة:</span>
                                    <strong className="text-amber-400 font-mono font-bold text-sm">
                                        {createdOrderResult.target_quantity.toLocaleString('en-US')} قطعة
                                    </strong>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                                    <span className="text-slate-400">عدد المراحل المحددة:</span>
                                    <strong className="text-emerald-400 font-mono font-bold">
                                        {createdOrderResult.stages.length} مراحل
                                    </strong>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="space-y-2.5">
                                <button
                                    onClick={handlePrintDirect}
                                    className="w-full btn-slate btn-slate-primary text-xs py-2.5 px-4 font-bold flex items-center justify-center gap-2 shadow-lg shadow-sky-600/25"
                                >
                                    <i className="fas fa-print"></i>
                                    <span>طباعة استيكرات الباركود فوراً (رول حراري)</span>
                                </button>

                                <button
                                    onClick={() => triggerClusterPdfDownload(createdOrderResult.order_id, createdOrderResult.order_number, stickerFormat)}
                                    className="w-full btn-slate bg-sky-700 hover:bg-sky-600 text-white text-xs py-2.5 px-4 font-bold flex items-center justify-center gap-2 border border-sky-400/30"
                                >
                                    <i className="fas fa-file-pdf"></i>
                                    <span>تحميل ملف PDF للاستيكرات</span>
                                </button>

                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                                    <button
                                        onClick={() => navigate('/orders')}
                                        className="btn-slate bg-emerald-600 hover:bg-emerald-500 text-white text-xs py-2 px-3 font-bold flex items-center justify-center gap-1.5"
                                    >
                                        <i className="fas fa-layer-group"></i>
                                        <span>الانتقال لمتابعة الأوردر</span>
                                    </button>

                                    <button
                                        onClick={handleResetForm}
                                        className="btn-slate btn-slate-secondary text-xs py-2 px-3 font-semibold"
                                    >
                                        <span>+ فتح أوردر جديد آخر</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

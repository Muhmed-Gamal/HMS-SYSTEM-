import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import StatCard from '../components/StatCard';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../services/api';
import { playBeepSuccess, playBeepError } from '../services/audio';

const PRODUCTION_STAGES = [
    'دخول انتاج',
    'خروج انتاج',
    'دخول مغسلة',
    'خروج مغسلة',
    'دخول تعبئة',
    'خروج تعبئة',
    'تشغيل خارجي',
];

export default function ScannerPage() {
    const { user, companyName, isAdmin, isExternalOperator } = useAuth();
    const { toast } = useToast();
    const { t, isRTL } = useLanguage();
    const navigate = useNavigate();

    // Guard: Require login
    useEffect(() => {
        if (!user) {
            navigate('/login');
        }
    }, [user, navigate]);

    // Active Stage setup
    const [selectedStage, setSelectedStage] = useState(
        user?.stage_permission || 'دخول انتاج'
    );

    // Determine if this session is external processing mode
    const isExternal = isExternalOperator || selectedStage === 'تشغيل خارجي';

    // Active Stage setup (irrelevant in external mode)
    const isStageLocked = !isExternal && user?.role === 'production' && Boolean(user?.stage_permission);

    // Order state
    const [orderNumberInput, setOrderNumberInput] = useState('');
    const [customerNameInput, setCustomerNameInput] = useState('');
    const [targetQuantityInput, setTargetQuantityInput] = useState('');
    const [currentOrder, setCurrentOrder] = useState(null);
    const [orderDetails, setOrderDetails] = useState(null);
    const [loadingOrder, setLoadingOrder] = useState(false);

    // External operator sub-permission (دخول / خروج / عام)
    const operatorDirection = user?.stage_action || user?.stage_permission || 'تشغيل خارجي (عام)';

    // Barcode input state
    const [barcodeInput, setBarcodeInput] = useState('');
    const [scanning, setScanning] = useState(false);
    const [scanAnimation, setScanAnimation] = useState(''); // 'scan-flash-success' | 'scan-shake-error'
    const [lastScanResult, setLastScanResult] = useState(null); // { barcode, status: 'success' | 'error', time: string, message?: string }
    const barcodeInputRef = useRef(null);

    // External mode scan history (kept locally — server is source of truth)
    const [externalScans, setExternalScans] = useState([]);

    // Completed Modal
    const [completeModalMsg, setCompleteModalMsg] = useState(null);

    // ── Load regular order details helper ──
    const loadOrderDetails = async (orderId) => {
        const { ok, data } = await api.getOrderDetails(orderId);
        if (ok && data.success) {
            setCurrentOrder(data.order);
            setOrderDetails(data);
            if (!isStageLocked && Array.isArray(data.stages) && data.stages.length > 0) {
                const stageNames = data.stages.map(s => s.stage_name);
                if (!stageNames.includes(selectedStage)) {
                    setSelectedStage(stageNames[0]);
                }
            }
        } else {
            toast(data.message || 'فشل جلب تفاصيل الأوردر', 'error');
        }
    };

    // ── Auto-Resume saved order on page refresh ──
    const autoResumeOrder = async (session) => {
        if (!session?.orderNumber) return;
        setLoadingOrder(true);
        if (session.isExternal || isExternal) {
            try {
                const headers = { 'Content-Type': 'application/json' };
                const savedUser = localStorage.getItem('hms_user') || localStorage.getItem('freedom_user');
                if (savedUser) {
                    const u = JSON.parse(savedUser);
                    if (u?.id) headers['x-user-id'] = String(u.id);
                }
                const res = await fetch('/api/external/orders/open', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        order_number: session.orderNumber,
                        customer_name: session.customerName || undefined,
                        target_quantity: parseInt(session.targetQuantity, 10) || 0,
                        stage_direction: operatorDirection,
                    }),
                });
                const data = await res.json();
                setLoadingOrder(false);
                if (res.ok && data.success) {
                    const targetNum = Number(data.order?.target_quantity) || 0;
                    setCurrentOrder({
                        ...data.order,
                        target_quantity: targetNum,
                        is_external: true
                    });
                    if (targetNum > 0) setTargetQuantityInput(String(targetNum));
                    if (data.order?.customer_name) setCustomerNameInput(data.order.customer_name);
                    setExternalScans(data.recent_scans || []);
                    toast(`🔄 تم استعادة جلسة التشغيل الخارجي للأوردر [${session.orderNumber}] تلقائياً`, 'info');
                    setTimeout(() => barcodeInputRef.current?.focus(), 200);
                }
            } catch (e) {
                setLoadingOrder(false);
            }
        } else {
            try {
                const { ok, data } = await api.checkOrder(session.orderNumber);
                setLoadingOrder(false);
                if (ok && data.exists) {
                    await loadOrderDetails(data.order.id);
                    toast(`🔄 تم استعادة جلسة الأوردر [${session.orderNumber}] تلقائياً`, 'info');
                    setTimeout(() => barcodeInputRef.current?.focus(), 200);
                }
            } catch (e) {
                setLoadingOrder(false);
            }
        }
    };

    // Auto-load session from localStorage on initial render
    useEffect(() => {
        if (!user) return;
        const savedSessionRaw = localStorage.getItem('hms_active_scanner_session') || localStorage.getItem('freedom_active_scanner_session');
        if (!savedSessionRaw) return;
        try {
            const savedSession = JSON.parse(savedSessionRaw);
            if (savedSession && savedSession.orderNumber) {
                setOrderNumberInput(savedSession.orderNumber);
                if (savedSession.stage) setSelectedStage(savedSession.stage);
                if (savedSession.customerName) setCustomerNameInput(savedSession.customerName);
                if (savedSession.targetQuantity) setTargetQuantityInput(String(savedSession.targetQuantity));
                autoResumeOrder(savedSession);
            }
        } catch (e) {
            console.error('Failed to parse saved scanner session:', e);
        }
    }, [user]);

    // ── Open Order ──
    const handleOpenOrder = async () => {
        const orderNum = orderNumberInput.trim();
        if (!orderNum) {
            toast('يرجى إدخال رقم الأوردر أولاً', 'warning');
            return;
        }

        setLoadingOrder(true);

        // ── External mode: open/create in ExternalOrders (never touches regular Orders) ──
        if (isExternal) {
            try {
                const headers = { 'Content-Type': 'application/json' };
                const savedUser = localStorage.getItem('hms_user') || localStorage.getItem('freedom_user');
                if (savedUser) {
                    const u = JSON.parse(savedUser);
                    if (u?.id) headers['x-user-id'] = String(u.id);
                }
                const res = await fetch('/api/external/orders/open', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        order_number: orderNum,
                        customer_name: customerNameInput.trim() || undefined,
                        target_quantity: parseInt(targetQuantityInput, 10) || 0,
                        stage_direction: operatorDirection,
                    }),
                });
                const data = await res.json();
                setLoadingOrder(false);

                if (!res.ok || !data.success) {
                    toast(data.message || 'تعذر فتح أمر التشغيل الخارجي', 'error');
                    return;
                }

                const targetNum = Number(data.order?.target_quantity) || 0;
                setCurrentOrder({
                    ...data.order,
                    target_quantity: targetNum,
                    is_external: true
                });
                if (targetNum > 0) {
                    setTargetQuantityInput(String(targetNum));
                }
                if (data.order?.customer_name) {
                    setCustomerNameInput(data.order.customer_name);
                }
                setExternalScans(data.recent_scans || []);

                // حفظ الجلسة في localStorage لاستعادتها عند الريفريش
                localStorage.setItem('hms_active_scanner_session', JSON.stringify({
                    orderNumber: orderNum,
                    customerName: data.order?.customer_name || customerNameInput.trim() || '',
                    targetQuantity: targetNum,
                    stage: selectedStage,
                    isExternal: true
                }));

                const targetText = targetNum > 0 ? ` (المستهدف: ${targetNum} قطعة)` : '';
                toast(
                    data.is_new
                        ? `✅ أمر تشغيل خارجي جديد: [${orderNum}]${targetText} — العداد جاهز`
                        : `▶ استئناف التشغيل الخارجي: [${orderNum}] (سابقاً: ${data.order.total_scanned} قطعة)${targetText}`,
                    'success'
                );
                setTimeout(() => barcodeInputRef.current?.focus(), 150);
            } catch (err) {
                setLoadingOrder(false);
                toast('خطأ في الاتصال بالخادم', 'error');
            }
            return;
        }

        // ── Regular mode: check against factory Orders ──
        const { ok, data } = await api.checkOrder(orderNum);
        setLoadingOrder(false);

        if (!ok || !data.exists) {
            toast(`الأوردر (${orderNum}) غير موجود في النظام. يرجى التأكد من الرقم.`, 'error', 4500);
            return;
        }

        const order = data.order;
        if (order.status === 'closed') {
            toast(`الأوردر (${orderNum}) مكتمل ومغلق في النظام بالكامل.`, 'warning', 4500);
        }

        await loadOrderDetails(order.id);

        // حفظ الجلسة في localStorage لاستعادتها عند الريفريش
        localStorage.setItem('hms_active_scanner_session', JSON.stringify({
            orderNumber: orderNum,
            customerName: order.customer_name || '',
            targetQuantity: order.target_quantity || 0,
            stage: selectedStage,
            isExternal: false
        }));

        toast(`تم فتح الأوردر: ${orderNum} | المرحلة: ${selectedStage}`, 'success');
        setTimeout(() => barcodeInputRef.current?.focus(), 150);
    };

    // ── Reset and Close Order session ──
    const handleCloseOrder = () => {
        localStorage.removeItem('hms_active_scanner_session');
        localStorage.removeItem('freedom_active_scanner_session');
        setCurrentOrder(null);
        setOrderDetails(null);
        setOrderNumberInput('');
        setCustomerNameInput('');
        setTargetQuantityInput('');
        setBarcodeInput('');
        setExternalScans([]);
        toast('تم إنهاء جلسة العمل الحالية للأوردر', 'info');
    };

    // ── Handle Barcode Scan ──
    const handleBarcodeSubmit = async (e) => {
        if (e) e.preventDefault();

        if (!currentOrder) {
            toast('يرجى فتح الأوردر أولاً قبل البدء بالمسح', 'warning');
            return;
        }

        const barcode = barcodeInput.trim();
        if (!barcode) return;

        setScanning(true);

        // ── External mode scan ──
        if (isExternal || currentOrder.is_external) {
            try {
                const headers = { 'Content-Type': 'application/json' };
                const savedUser = localStorage.getItem('hms_user') || localStorage.getItem('freedom_user');
                if (savedUser) {
                    const u = JSON.parse(savedUser);
                    if (u?.id) headers['x-user-id'] = String(u.id);
                }
                const res = await fetch('/api/external/scan', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        order_id: currentOrder.id,
                        barcode,
                        scanned_by: user?.full_name || user?.username || 'مشغل خارجي',
                        scan_type: operatorDirection,
                    }),
                });
                const data = await res.json();
                setScanning(false);
                setBarcodeInput('');

                if (res.ok && data.success) {
                    playBeepSuccess();
                    setScanAnimation('scan-flash-success');
                    setLastScanResult({
                        barcode,
                        status: 'success',
                        time: new Date().toLocaleTimeString('ar-EG-u-nu-latn'),
                        scanned_quantity: data.total_scanned,
                        target_quantity: data.target_quantity
                    });
                    setTimeout(() => setScanAnimation(''), 450);
                    // Update local counter
                    setCurrentOrder(prev => ({
                        ...prev,
                        total_scanned: data.total_scanned,
                        target_quantity: Number(data.target_quantity) || Number(prev?.target_quantity) || 0
                    }));
                    // Prepend new scan to local list
                    setExternalScans(prev => [{
                        id: Date.now(),
                        barcode,
                        scanned_by: user?.full_name || user?.username,
                        created_at: new Date().toISOString(),
                    }, ...prev.slice(0, 99)]);

                    if (data.is_completed) {
                        setCompleteModalMsg(`🎉 تم التتميم بنجاح! تم مسح كامل الكمية المستلمة (${data.total_scanned} من ${data.target_quantity} قطعة) لأمر التشغيل الخارجي [${currentOrder.order_number}].`);
                    } else {
                        const remainingMsg = data.target_quantity > 0 ? ` — متبقي: ${data.remaining_quantity}` : '';
                        toast(`✅ مسح صحيح: [${barcode}] — الإجمالي: ${data.total_scanned}${remainingMsg}`, 'success', 1800);
                    }
                } else {
                    playBeepError();
                    setScanAnimation('scan-shake-error');
                    setLastScanResult({
                        barcode,
                        status: 'error',
                        time: new Date().toLocaleTimeString('ar-EG-u-nu-latn'),
                        message: data.message || 'الكود مكرر أو غير صالح'
                    });
                    setTimeout(() => setScanAnimation(''), 450);
                    toast(data.message || 'الكود مكرر أو حدث خطأ', 'error', 3500);
                }
            } catch (err) {
                setScanning(false);
                setBarcodeInput('');
                playBeepError();
                setLastScanResult({
                    barcode,
                    status: 'error',
                    time: new Date().toLocaleTimeString('ar-EG-u-nu-latn'),
                    message: 'خطأ في الاتصال بالسيرفر'
                });
                toast('خطأ في الاتصال بالخادم', 'error');
            }
            setTimeout(() => barcodeInputRef.current?.focus(), 100);
            return;
        }

        // ── Regular scan ──
        const scannedBy = user?.full_name || user?.username || 'سكانر';
        const { ok, data } = await api.scanStage({
            order_id: currentOrder.id,
            stage_name: selectedStage,
            scanned_barcode: barcode,
            scanned_by: scannedBy,
        });

        setScanning(false);
        setBarcodeInput('');

        if (ok && data.success) {
            playBeepSuccess();
            setScanAnimation('scan-flash-success');
            setLastScanResult({
                barcode,
                status: 'success',
                time: new Date().toLocaleTimeString('ar-EG-u-nu-latn'),
                scanned_quantity: data.scanned_quantity,
                target_quantity: data.target_quantity
            });
            setTimeout(() => setScanAnimation(''), 450);

            await loadOrderDetails(currentOrder.id);

            if (data.is_completed) {
                setCompleteModalMsg(data.message || 'تم اكتمال العدد المطلوب وإغلاق المرحلة بنجاح.');
            } else {
                toast(
                    `كود صحيح [${barcode}] — الممسوح: ${(data.scanned_quantity || 0).toLocaleString(
                        'en-US'
                    )}/${(data.target_quantity || 0).toLocaleString('en-US')}`,
                    'success',
                    1800
                );
            }
        } else {
            playBeepError();
            setScanAnimation('scan-shake-error');
            setLastScanResult({
                barcode,
                status: 'error',
                time: new Date().toLocaleTimeString('ar-EG-u-nu-latn'),
                message: data.message || 'الكود غير مطابق أو ممسوح مسبقاً'
            });
            setTimeout(() => setScanAnimation(''), 450);
            toast(data.message || 'الكود غير مطابق أو ممسوح مسبقاً', 'error', 3500);
        }

        setTimeout(() => barcodeInputRef.current?.focus(), 100);
    };

    // ── Stats calculation ──
    const stageLog = orderDetails?.stages?.find((s) => s.stage_name === selectedStage);
    const scannedQty   = isExternal ? (currentOrder?.total_scanned || 0) : (stageLog ? Number(stageLog.scanned_quantity) : 0);
    const targetQty    = Number(currentOrder?.target_quantity) || 0;
    const remainingQty = targetQty > 0 ? Math.max(0, targetQty - scannedQty) : 0;
    const progressPct  = targetQty > 0 ? Math.min(100, Math.round((scannedQty / targetQty) * 100)) : (isExternal ? 0 : 0);

    const stageMovements  = isExternal ? [] : (orderDetails?.movements || []).filter((m) => m.stage_name === selectedStage);
    const uniquePieces    = isExternal
        ? new Set(externalScans.map(s => s.barcode)).size
        : new Set(stageMovements.map((m) => m.barcode)).size;
    const recentMovements = isExternal ? externalScans : stageMovements.slice(-100).reverse();

    return (
        <div className="navy-slate-bg min-h-screen flex flex-col">
            <Header
                title={isExternal ? 'محطة التشغيل الخارجي والمسح المفتوح' : t('scanner.title')}
                subtitle={isExternal ? `${companyName} | مسح مفتوح — أي باركود` : (user?.stage_permission ? `${companyName} | ${t('common.stage')}: ${user.stage_permission}` : `${companyName} | ${t('scanner.subtitle')}`)}
                badgeText={isExternal ? 'EXTERNAL' : 'STATION'}
                activePage="scanner"
            />

            <main className="flex-1 p-3 sm:p-5 max-w-6xl w-full mx-auto space-y-4">
                {/* Session Settings & Order Opener */}
                <div className="slate-card p-5">
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-700/60">
                        <div className="flex items-center gap-2">
                            <i className={`fas ${isExternal ? 'fa-boxes text-cyan-400' : 'fa-sliders-h text-blue-400'} text-xs`}></i>
                            <h2 className="text-xs sm:text-sm font-bold text-white">
                                {isExternal ? 'جلسة التشغيل الخارجي' : 'جلسة المسح الحالية'}
                            </h2>
                            {isExternal && (
                                <span className="badge-clean text-[10px] font-bold" style={{background:'rgba(6,182,212,0.15)',color:'#22d3ee',border:'1px solid rgba(6,182,212,0.3)'}}>
                                    مسح مفتوح — بدون قيود باركود
                                </span>
                            )}
                        </div>
                        <span className="badge-clean badge-neutral text-[10px] font-mono">{isExternal ? 'EXT-STATION' : 'STATION #01'}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Stage Selector — hidden in external mode */}
                        {!isExternal && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                    المرحلة الإنتاجية {isStageLocked ? 'المقيدة' : 'الحالية'}
                                </label>
                                {isStageLocked ? (
                                    <input
                                        type="text"
                                        readOnly
                                        value={selectedStage}
                                        className="slate-input font-mono font-bold text-blue-300 bg-[#0a1120] cursor-not-allowed"
                                    />
                                ) : (
                                    <select
                                        value={selectedStage}
                                        onChange={(e) => {
                                            const newStg = e.target.value;
                                            setSelectedStage(newStg);
                                            try {
                                                const sess = JSON.parse(localStorage.getItem('hms_active_scanner_session') || localStorage.getItem('freedom_active_scanner_session') || '{}');
                                                sess.stage = newStg;
                                                localStorage.setItem('hms_active_scanner_session', JSON.stringify(sess));
                                            } catch (err) {}
                                        }}
                                        className="slate-input font-bold text-white cursor-pointer"
                                    >
                                        {(orderDetails?.stages && orderDetails.stages.length > 0
                                            ? orderDetails.stages.map((s) => s.stage_name)
                                            : PRODUCTION_STAGES
                                        ).map((stg) => (
                                            <option key={stg} value={stg}>
                                                {stg}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        )}

                        {/* External mode: direction badge + target quantity input */}
                        {isExternal && (
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">وضع التشغيل والاتجاه</label>
                                <div className="slate-input font-mono font-bold flex items-center gap-2"
                                     style={{color:'#22d3ee', background:'rgba(6,182,212,0.08)', border:'1px solid rgba(6,182,212,0.3)'}}>
                                    <i className="fas fa-satellite-dish text-xs"></i>
                                    {operatorDirection}
                                </div>
                            </div>
                        )}

                        {/* External mode: Customer Name input (only before order is opened) */}
                        {isExternal && !currentOrder && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                    اسم العميل / جهة التوريد الخارجية
                                </label>
                                <input
                                    type="text"
                                    value={customerNameInput}
                                    onChange={e => setCustomerNameInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && !currentOrder && handleOpenOrder()}
                                    placeholder="اسم العميل أو المصنع المورد (مثال: مصنع النور)..."
                                    className="slate-input text-white"
                                    style={{borderColor: 'rgba(6,182,212,0.4)'}}
                                />
                                <p className="text-[10.5px] text-slate-400 mt-1">يُسجل ويثبت في تقارير وتتبع أمر التشغيل الخارجي</p>
                            </div>
                        )}

                        {/* External mode: target quantity input (only before order is opened) */}
                        {isExternal && !currentOrder && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                    الكمية الكلية المستلمة من الخارج
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={targetQuantityInput}
                                    onChange={e => setTargetQuantityInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && !currentOrder && handleOpenOrder()}
                                    placeholder="أدخل الكمية المستهدفة للتتميم... (اختياري)"
                                    className="slate-input font-mono"
                                    style={{borderColor: 'rgba(6,182,212,0.4)'}}
                                />
                                <p className="text-[10.5px] text-slate-400 mt-1">بعد اكتمال الكمية سيظهر تنبيه التتميم التلقائي</p>
                            </div>
                        )}

                        {/* Order Number Input */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                {isExternal ? 'رقم أمر التشغيل الخارجي *' : 'رقم أمر الشغل / الأوردر *'}
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={orderNumberInput}
                                    onChange={(e) => setOrderNumberInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !currentOrder && handleOpenOrder()}
                                    disabled={Boolean(currentOrder) || loadingOrder}
                                    placeholder={isExternal ? 'اكتب رقم أمر التشغيل الخارجي (مثال: EXT-101)...' : 'اكتب رقم الأوردر للفتح...'}
                                    className="slate-input font-mono text-white"
                                />
                                {!currentOrder ? (
                                    <button
                                        onClick={handleOpenOrder}
                                        disabled={loadingOrder}
                                        className="btn-slate btn-slate-primary whitespace-nowrap px-4 py-2 text-xs font-semibold"
                                        style={isExternal ? {background:'rgba(6,182,212,0.2)', borderColor:'rgba(6,182,212,0.5)', color:'#22d3ee'} : {}}
                                    >
                                        {loadingOrder ? (
                                            <i className="fas fa-circle-notch fa-spin text-xs"></i>
                                        ) : (
                                            <span className="flex items-center gap-1.5">
                                                <i className={`fas ${isExternal ? 'fa-boxes' : 'fa-unlock-alt'} text-xs`}></i>
                                                <span>فتح</span>
                                            </span>
                                        )}
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleCloseOrder}
                                        className="btn-slate btn-slate-danger whitespace-nowrap px-4 py-2 text-xs font-semibold"
                                    >
                                        <span className="flex items-center gap-1.5">
                                            <i className="fas fa-times-circle text-xs"></i>
                                            <span>إنهاء</span>
                                        </span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Detected Customer & Info Box */}
                    {currentOrder && (
                        <div className="mt-4 pt-4 border-t border-slate-700/60">
                            {isExternal ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-3.5 rounded-xl border text-xs"
                                     style={{background:'rgba(6,182,212,0.06)', borderColor:'rgba(6,182,212,0.25)'}}>
                                    <div>
                                        <span className="text-slate-400 block text-[11px] mb-0.5">نوع الأمر والاتجاه</span>
                                        <strong className="font-bold flex items-center gap-1.5" style={{color:'#22d3ee'}}>
                                            <i className="fas fa-satellite-dish text-[10px]"></i>
                                            <span>{currentOrder.stage_direction || operatorDirection || 'تشغيل خارجي'}</span>
                                        </strong>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block text-[11px] mb-0.5">العميل / جهة التوريد</span>
                                        <strong className="font-bold text-cyan-300 truncate block">
                                            {currentOrder.customer_name || 'غير محدد'}
                                        </strong>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block text-[11px] mb-0.5">الكمية المستهدفة (المطلوبة)</span>
                                        <strong className="font-mono font-bold" style={{color: targetQty > 0 ? '#fbbf24' : '#94a3b8'}}>
                                            {targetQty > 0 ? `${targetQty.toLocaleString('en-US')} قطعة` : '∞ مفتوح (بدون حد)'}
                                        </strong>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block text-[11px] mb-0.5">إجمالي الممسوح</span>
                                        <strong className="font-mono font-bold text-emerald-400">
                                            {`${scannedQty.toLocaleString('en-US')} قطعة`}
                                        </strong>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block text-[11px] mb-0.5">المتبقي للتتميم</span>
                                        <strong className="font-mono font-bold" style={{color: targetQty > 0 && remainingQty === 0 ? '#10b981' : '#f43f5e'}}>
                                            {targetQty > 0 ? `${remainingQty.toLocaleString('en-US')} قطعة` : '—'}
                                        </strong>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block text-[11px] mb-0.5">حالة التتميم</span>
                                        <span className="font-semibold" style={{color: targetQty > 0 && scannedQty >= targetQty ? '#10b981' : (currentOrder.status === 'closed' ? '#10b981' : '#22d3ee')}}>
                                            {targetQty > 0 && scannedQty >= targetQty ? '✅ مكتمل التتميم' : (currentOrder.status === 'closed' ? 'مكتمل ومغلق' : 'قيد المسح')}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl border text-xs"
                                     style={{background:'#0a1120', borderColor:'rgba(148,163,184,0.1)'}}>
                                    <div>
                                        <span className="text-slate-400 block text-[11px] mb-0.5">العميل</span>
                                        <strong className="font-bold text-white">{currentOrder.customer_name || 'عميل'}</strong>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block text-[11px] mb-0.5">الكمية المستهدفة</span>
                                        <strong className="font-mono font-bold text-amber-400">
                                            {`${(currentOrder.target_quantity || 0).toLocaleString('en-US')} قطعة`}
                                        </strong>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block text-[11px] mb-0.5">أنشئ بواسطة</span>
                                        <strong className="text-slate-300 font-mono text-xs">{currentOrder.created_by || 'النظام'}</strong>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block text-[11px] mb-0.5">حالة الأمر</span>
                                        <span className="font-semibold" style={{color: currentOrder.status === 'closed' ? '#10b981' : '#fbbf24'}}>
                                            {currentOrder.status === 'closed' ? 'مكتمل ومغلق' : 'قيد التشغيل'}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Counters & Progress */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard
                        label={isExternal ? 'الكمية المستهدفة' : 'المستهدف بالأوردر'}
                        value={targetQty > 0 ? targetQty.toLocaleString('en-US') : (isExternal ? '∞ مفتوح' : '0')}
                        colorClass={isExternal ? 'text-cyan-400' : 'text-amber-400'}
                        icon="fas fa-bullseye"
                    />
                    <StatCard
                        label={isExternal ? 'إجمالي الممسوح' : 'الممسوح بالمرحلة'}
                        value={scannedQty ? scannedQty.toLocaleString('en-US') : '0'}
                        colorClass="text-emerald-400"
                        icon="fas fa-check-double"
                    />
                    <StatCard
                        label={isExternal ? 'المتبقي للتتميم' : 'المتبقي للإنجاز'}
                        value={(isExternal && targetQty === 0) ? '—' : (remainingQty ? remainingQty.toLocaleString('en-US') : '0')}
                        colorClass="text-rose-400"
                        icon="fas fa-hourglass-half"
                    />
                    <StatCard
                        label="قطع ممسوحة فريدة"
                        value={uniquePieces ? uniquePieces.toLocaleString('en-US') : '0'}
                        colorClass={isExternal ? 'text-cyan-400' : 'text-blue-400'}
                        icon="fas fa-barcode"
                    />
                </div>

                {/* Progress Bar Card */}
                <div className="slate-card p-4">
                    <div className="flex justify-between items-center text-xs mb-2">
                        <span className="text-slate-300 font-medium">
                            {isExternal
                                ? (targetQty > 0 ? `نسبة إنجاز التشغيل الخارجي (${scannedQty} من ${targetQty})` : 'عداد التشغيل الخارجي (مفتوح بلا حد)')
                                : `نسبة إنجاز المرحلة الحالية (${selectedStage})`}
                        </span>
                        <span className="font-mono font-bold" style={{color: isExternal ? '#22d3ee' : '#fbbf24'}}>
                            {isExternal
                                ? (targetQty > 0 ? `${progressPct}%` : `${scannedQty} قطعة`)
                                : `${progressPct}%`}
                        </span>
                    </div>
                    <div className="w-full bg-[#0a1120] rounded-full h-2.5 overflow-hidden border border-slate-700/60">
                        <div
                            className="h-2.5 rounded-full transition-all duration-300"
                            style={{
                                width: isExternal ? (targetQty > 0 ? `${progressPct}%` : '100%') : `${progressPct}%`,
                                background: isExternal
                                    ? (progressPct >= 100 ? '#10b981' : 'linear-gradient(90deg, rgba(6,182,212,0.7), rgba(34,211,238,0.9))')
                                    : (progressPct >= 100 ? '#10b981' : '#d4af67'),
                            }}
                        ></div>
                    </div>
                </div>

                {/* Barcode Scanner Precision HUD Input */}
                <div className={`relative overflow-hidden transition-all duration-300 rounded-2xl ${
                    currentOrder ? 'scanner-hud-glow' : ''
                }`}
                    style={{
                        background: currentOrder ? 'linear-gradient(145deg, #091226, #060b18)' : 'linear-gradient(145deg, #0a1120, #070c18)',
                        border: currentOrder ? '1px solid rgba(56,189,248,0.4)' : '1px solid rgba(148,163,184,0.1)',
                        boxShadow: currentOrder ? '0 10px 30px -5px rgba(0, 0, 0, 0.6), 0 0 25px -5px rgba(56, 189, 248, 0.25)' : 'inset 0 1px 0 rgba(255,255,255,0.02)',
                        padding: '22px',
                    }}>

                    {/* Animated top accent when active */}
                    {currentOrder && (
                        <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-sky-500 via-cyan-400 to-indigo-500" />
                    )}

                    {/* Subtle scanning laser sweep across the card */}
                    {currentOrder && <div className="scanner-laser-line" />}

                    <form onSubmit={handleBarcodeSubmit}>
                        <div className="flex items-center justify-between mb-3.5">
                            <label className="text-xs font-bold text-slate-200 flex items-center gap-2.5">
                                <span className={`w-2.5 h-2.5 rounded-full ${currentOrder ? 'bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]' : 'bg-slate-700'}`}></span>
                                <span className="text-[13px]">{isExternal
                                    ? 'مسح الباركود الخارجي (قارئ ليزر أو يدوي)'
                                    : 'مسح أو كتابة كود القطعة (قارئ ليزر أو يدوي)'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline border border-slate-700/60 bg-slate-900/60 px-2 py-0.5 rounded">High-Speed Laser Input</span>
                            </label>
                            {currentOrder ? (
                                <span className="text-[10.5px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/30 flex items-center gap-1.5 shadow-[0_0_10px_rgba(16,185,129,0.15)]">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                                    ONLINE & READY
                                </span>
                            ) : (
                                <span className="text-[10.5px] font-mono font-medium text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20 flex items-center gap-1.5">
                                    <i className="fas fa-lock text-[9px]"></i>
                                    STANDBY
                                </span>
                            )}
                        </div>

                        <div className="flex gap-2.5">
                            <div className="relative flex-1">
                                <input
                                    ref={barcodeInputRef}
                                    type="text"
                                    value={barcodeInput}
                                    onChange={(e) => setBarcodeInput(e.target.value)}
                                    disabled={!currentOrder || scanning}
                                    placeholder={
                                        currentOrder
                                            ? 'مرر جهاز قارئ الباركود أو اكتب الكود واضغط Enter...'
                                            : 'يرجى فتح الأوردر أولاً لتفعيل محطة مسح الباركود...'
                                    }
                                    className={`w-full font-mono font-bold tracking-wider focus:outline-none transition-all duration-200 ${scanAnimation}`}
                                    style={{
                                        background: currentOrder ? 'rgba(3,7,18,0.95)' : 'rgba(7,12,24,0.6)',
                                        border: currentOrder ? '1.5px solid rgba(56,189,248,0.5)' : '1px solid rgba(148,163,184,0.1)',
                                        borderRadius: '14px',
                                        padding: '14px 46px 14px 42px',
                                        color: '#f8fafc',
                                        fontSize: '15px',
                                        boxShadow: currentOrder ? 'inset 0 2px 8px rgba(0,0,0,0.6), 0 0 0 3px rgba(56,189,248,0.08)' : 'inset 0 2px 4px rgba(0,0,0,0.4)',
                                    }}
                                    autoComplete="off"
                                />
                                <i className={`fas fa-barcode absolute right-4 top-1/2 -translate-y-1/2 text-lg transition-colors ${
                                    currentOrder ? 'text-sky-400 animate-pulse' : 'text-slate-600'
                                }`}></i>
                                {barcodeInput && (
                                    <button
                                        type="button"
                                        onClick={() => setBarcodeInput('')}
                                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs p-1.5 transition-colors"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={!currentOrder || scanning}
                                className="px-6 py-3.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                                style={currentOrder ? {
                                    background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                                    color: '#fff',
                                    boxShadow: '0 4px 18px rgba(2,132,199,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
                                    border: '1px solid rgba(56,189,248,0.5)',
                                } : {
                                    background: 'rgba(148,163,184,0.06)',
                                    color: '#475569',
                                    border: '1px solid rgba(148,163,184,0.08)',
                                }}
                            >
                                <i className="fas fa-arrow-down text-xs"></i>
                                <span>تسجيل المسح</span>
                            </button>
                        </div>
                    </form>

                    {/* HUD Live Feedback Bar: Last scanned item */}
                    {lastScanResult && currentOrder && (
                        <div className={`mt-3.5 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs transition-all duration-200 ${
                            lastScanResult.status === 'success' ? 'text-emerald-300' : 'text-rose-300'
                        }`}>
                            <div className="flex items-center gap-2">
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                                    lastScanResult.status === 'success'
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                }`}>
                                    <i className={`fas ${lastScanResult.status === 'success' ? 'fa-check' : 'fa-times'}`}></i>
                                </span>
                                <span className="text-slate-400 font-medium">آخر باركود مسجل:</span>
                                <span className="font-mono font-bold tracking-wider text-white bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/60">
                                    {lastScanResult.barcode}
                                </span>
                                {lastScanResult.message && (
                                    <span className="text-[11px] text-rose-400 font-sans">({lastScanResult.message})</span>
                                )}
                            </div>
                            <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
                                <span><i className="far fa-clock ml-1 text-slate-500"></i>{lastScanResult.time}</span>
                                {lastScanResult.scanned_quantity !== undefined && (
                                    <span className="text-sky-300 font-bold bg-sky-950/60 px-2 py-0.5 rounded border border-sky-500/30">
                                        الحصيلة: {lastScanResult.scanned_quantity}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Scanned Movements Table */}
                <div className="slate-card p-5">
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-700/60">
                        <div className="flex items-center gap-2">
                            <i className="fas fa-history text-blue-400 text-xs"></i>
                            <h2 className="text-xs sm:text-sm font-bold text-white">
                                {isExternal ? 'سجل الباركودات الممسوحة خلال هذه الجلسة' : 'سجل القطع الممسوحة مؤخراً'}
                            </h2>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                            {recentMovements.length} {isExternal ? 'باركود' : 'حركة'} مسجلة
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="slate-table w-full">
                            <thead>
                                <tr>
                                    <th className="p-3 text-center w-12 font-bold">#</th>
                                    <th className="p-3 font-bold">كود الباركود</th>
                                    {!isExternal && <th className="p-3 text-center font-bold">الكمية</th>}
                                    {!isExternal && <th className="p-3 font-bold">العميل</th>}
                                    {!isExternal && <th className="p-3 font-bold">رقم الأوردر</th>}
                                    <th className="p-3 font-bold">المشغل</th>
                                    {isExternal && <th className="p-3 font-bold">وقت المسح</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {recentMovements.length === 0 ? (
                                    <tr>
                                        <td colSpan={isExternal ? 4 : 6} className="text-center py-8 text-slate-500 text-xs">
                                            <i className="fas fa-barcode text-xl mb-1.5 block text-slate-700"></i>
                                            {isExternal ? 'لا توجد باركودات ممسوحة في هذه الجلسة بعد' : 'لا توجد قطع ممسوحة في هذه المرحلة بعد'}
                                        </td>
                                    </tr>
                                ) : (
                                    recentMovements.map((m, idx) => {
                                        const isLastScanned = lastScanResult?.barcode === m.barcode && idx === 0;
                                        return (
                                            <tr key={m.id || idx} className={`transition-all duration-200 ${
                                                isLastScanned
                                                    ? 'bg-sky-500/10 border-l-2 border-sky-400'
                                                    : 'hover:bg-slate-800/40'
                                            }`}>
                                                <td className="p-3 text-slate-500 font-mono text-xs text-center">
                                                    {isLastScanned ? (
                                                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                                                    ) : (
                                                        idx + 1
                                                    )}
                                                </td>
                                                <td className="p-3 font-mono font-bold text-xs sm:text-sm tracking-wide"
                                                    style={{color: isExternal ? '#22d3ee' : '#34d399'}}>
                                                    <span className="flex items-center gap-1.5">
                                                        <span>{m.barcode}</span>
                                                        {isLastScanned && (
                                                            <span className="text-[9px] font-sans font-bold bg-sky-500/20 text-sky-300 px-1.5 py-0.2 rounded border border-sky-500/30">
                                                                الآن
                                                            </span>
                                                        )}
                                                    </span>
                                                </td>
                                                {!isExternal && <td className="p-3 text-center font-bold text-slate-200 text-xs font-mono">1</td>}
                                                {!isExternal && <td className="p-3 text-slate-300 text-xs font-medium">{currentOrder?.customer_name || 'عميل'}</td>}
                                                {!isExternal && <td className="p-3 text-slate-400 text-xs font-mono">{currentOrder?.order_number || '--'}</td>}
                                                <td className="p-3 text-blue-300 text-xs font-medium font-mono">
                                                    <span className="flex items-center gap-1">
                                                        <i className="fas fa-user-circle text-[10px] text-blue-400/70"></i>
                                                        <span>{m.scanned_by || '--'}</span>
                                                    </span>
                                                </td>
                                                {isExternal && (
                                                    <td className="p-3 text-slate-400 text-xs font-mono">
                                                        {m.created_at ? new Date(m.created_at).toLocaleTimeString('ar-EG-u-nu-latn') : '--'}
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Order Stage Complete Modal */}
            {completeModalMsg && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(10,17,32,0.7)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 9995,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                    }}
                >
                    <div className="slate-card p-6 sm:p-7 w-full max-w-[420px] text-center shadow-2xl">
                        <div className="w-14 h-14 rounded-full mx-auto mb-3.5 flex items-center justify-center text-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <i className="fas fa-check-circle"></i>
                        </div>
                        <h3 className="text-white text-base font-bold mb-1.5">اكتملت المرحلة بنجاح!</h3>
                        <p className="text-slate-300 text-xs leading-relaxed mb-5">{completeModalMsg}</p>
                        <button
                            onClick={() => setCompleteModalMsg(null)}
                            className="btn-slate btn-slate-primary w-full py-2.5 text-xs font-semibold"
                        >
                            إغلاق ومتابعة
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

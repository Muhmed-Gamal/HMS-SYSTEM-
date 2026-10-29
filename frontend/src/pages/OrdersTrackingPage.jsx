import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Header from '../components/Header';
import StatCard from '../components/StatCard';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { api, getAuthHeaders } from '../services/api';
import { 
    printBarcodesWindow, 
    printOrderTrackingReport, 
    printComprehensiveReportWindow, 
    printUnscannedReportWindow,
    printExternalOrderReport,
    printExternalComprehensiveReport
} from '../services/print';
import { formatStandardDate as formatDate, getNowFormatted } from '../services/timeSync';

const PRODUCTION_STAGES = [
    'دخول انتاج',
    'خروج انتاج',
    'دخول مغسلة',
    'خروج مغسلة',
    'دخول تعبئة',
    'خروج تعبئة',
];

export default function OrdersTrackingPage() {
    const { user, isAdmin, isSuperAdmin, isFactoryOwner, isITSupport, canCreateOrders, canAccessRecycleBin, companyName } = useAuth();
    const { toast, confirm, showProgress, updateProgress, closeProgress, showAlert } = useToast();
    const { t, isRTL, language, translateStage } = useLanguage();
    const navigate = useNavigate();

    // Guard: Redirect if not logged in or unauthorized role
    useEffect(() => {
        if (!user) {
            navigate('/login');
        } else if (user.role === 'external_operator') {
            window.location.href = '/index.html';
        } else if (user.role === 'external_admin') {
            window.location.href = '/external_tracking.html';
        } else if (user.role === 'production') {
            navigate('/');
        }
    }, [user, navigate]);

    // Data states
    const [orders, setOrders] = useState([]);
    const [deletedOrdersList, setDeletedOrdersList] = useState([]);
    const [showRecycleBinModal, setShowRecycleBinModal] = useState(false);
    const [recycleLoading, setRecycleLoading] = useState(false);
    const [stats, setStats] = useState({ total_orders: 0, active_orders: 0, closed_orders: 0, total_barcodes: 0 });
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'closed' | 'factory' | 'external'

    // Barcode Generator state
    const [genOrderNumber, setGenOrderNumber] = useState('');
    const [genCustomerName, setGenCustomerName] = useState('');
    const [genTargetQty, setGenTargetQty] = useState('');
    const [stickerFormat, setStickerFormat] = useState('roll_35x80');
    const [generating, setGenerating] = useState(false);
    const [lastGenerated, setLastGenerated] = useState(null);

    // Modals
    const [detailsModalData, setDetailsModalData] = useState(null); // { order, stages, movements }
    const [unscannedBarcodes, setUnscannedBarcodes] = useState([]); // raw list from API
    const [unscannedLoading, setUnscannedLoading] = useState(false);
    const [unscannedFilterStage, setUnscannedFilterStage] = useState('ALL');
    const [unscannedSearch, setUnscannedSearch] = useState('');
    const [unscannedDisplayLimit, setUnscannedDisplayLimit] = useState(100);

    // Order Stages Modification state
    const [availableSystemStages, setAvailableSystemStages] = useState([]);
    const [selectedNewStageToAdd, setSelectedNewStageToAdd] = useState('');
    const [addingStageLoading, setAddingStageLoading] = useState(false);

    const [comprehensiveModalOpen, setComprehensiveModalOpen] = useState(false);
    const [comprehensiveData, setComprehensiveData] = useState(null);
    const [compReportTimestamp, setCompReportTimestamp] = useState('');

    // Fetch all orders & stats
    const loadAll = async () => {
        setLoading(true);
        const [ordersRes, statsRes] = await Promise.all([api.getOrders(), api.getStats()]);
        setLoading(false);

        if (ordersRes.ok && ordersRes.data.success) {
            setOrders(ordersRes.data.orders || []);
        } else {
            toast('فشل تحميل الأوردرات', 'error');
        }

        if (statsRes.ok && statsRes.data.success) {
            setStats(statsRes.data.stats || {});
        }
    };

    useEffect(() => {
        if (user) {
            loadAll();
            if (window.location.hash && window.location.hash.startsWith('#order=')) {
                const hashId = window.location.hash.replace('#order=', '');
                if (hashId) {
                    handleViewDetails(hashId);
                }
            }
        }
    }, [user]);

    // تحميل قائمة مراحل النظام الكاملة لاستخدامها عند إضافة مراحل جديدة لأوردر قائم
    useEffect(() => {
        api.getStages().then(res => {
            if (res.ok && res.data.success && Array.isArray(res.data.stages)) {
                setAvailableSystemStages(res.data.stages.map(s => s.stage_name));
            }
        }).catch(() => {});
    }, []);

    // Filtered orders list by search query & status chip
    const filteredOrders = useMemo(() => {
        let list = orders;
        if (statusFilter === 'active') {
            list = list.filter((o) => o.status !== 'closed');
        } else if (statusFilter === 'closed') {
            list = list.filter((o) => o.status === 'closed');
        } else if (statusFilter === 'factory') {
            list = list.filter((o) => !o.is_external);
        } else if (statusFilter === 'external') {
            list = list.filter((o) => o.is_external);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            list = list.filter(
                (o) =>
                    (o.order_number && o.order_number.toLowerCase().includes(q)) ||
                    (o.customer_name && o.customer_name.toLowerCase().includes(q))
            );
        }
        return list;
    }, [orders, searchQuery, statusFilter]);

    // الإحصائيات الشاملة المتزامنة تماماً مع الأوامر المعروضة بالجدول
    const unifiedStats = useMemo(() => {
        const factoryOrdersCount = orders.filter((o) => !o.is_external).length;
        const externalOrdersCount = orders.filter((o) => o.is_external).length;
        const totalOrdersCount = orders.length || stats.total_orders || 0;

        const activeFactoryCount = orders.filter((o) => !o.is_external && o.status !== 'closed').length;
        const activeExternalCount = orders.filter((o) => o.is_external && o.status !== 'closed').length;
        const totalActiveCount = activeFactoryCount + activeExternalCount;

        const closedFactoryCount = orders.filter((o) => !o.is_external && o.status === 'closed').length;
        const closedExternalCount = orders.filter((o) => o.is_external && o.status === 'closed').length;
        const totalClosedCount = closedFactoryCount + closedExternalCount;

        const externalScansCount = orders
            .filter((o) => o.is_external)
            .reduce((sum, o) => sum + (Number(o.total_scanned) || 0), 0) || Number(stats.external_pieces_scanned || stats.total_external_scans) || 0;

        const factoryBarcodesCount = Number(stats.total_barcodes) || 0;
        const totalAllBarcodesCount = factoryBarcodesCount + externalScansCount;

        return {
            totalOrders: totalOrdersCount,
            factoryOrders: factoryOrdersCount || stats.factory_orders || 0,
            externalOrders: externalOrdersCount || stats.external_orders || 0,
            activeOrders: totalActiveCount,
            activeFactory: activeFactoryCount || stats.factory_active_orders || 0,
            activeExternal: activeExternalCount || stats.active_external_orders || 0,
            closedOrders: totalClosedCount,
            closedFactory: closedFactoryCount || stats.factory_closed_orders || 0,
            closedExternal: closedExternalCount || stats.closed_external_orders || 0,
            factoryBarcodes: factoryBarcodesCount,
            externalScans: externalScansCount,
            totalAllBarcodes: totalAllBarcodesCount,
        };
    }, [orders, stats]);

    // Handle Barcode Generation
    const handleGenerateBarcodes = async (e) => {
        e.preventDefault();
        const orderNum = genOrderNumber.trim();
        const custName = genCustomerName.trim() || 'عميل تجاري';
        const targetQty = parseInt(genTargetQty, 10);

        if (!orderNum || !targetQty || targetQty <= 0) {
            toast('يرجى ملء رقم أمر الشغل والكمية المستهدفة بشكل صحيح', 'warning');
            return;
        }

        if (targetQty > 200000) {
            toast('أقصى كمية مسموحة للتوليد هي 200,000 قطعة', 'warning');
            return;
        }

        setGenerating(true);
        showProgress(
            'جاري توليد الأكواد...',
            `يتم توليد ${targetQty.toLocaleString('en-US')} باركود فريد. قد يستغرق ذلك بضع ثوانٍ للكميات الكبيرة.`
        );

        let fakeProg = 10;
        const progInterval = setInterval(() => {
            fakeProg = Math.min(92, fakeProg + Math.random() * 18);
            updateProgress(Math.round(fakeProg));
        }, 300);

        const { ok, data } = await api.generateBarcodes({
            order_number: orderNum,
            customer_name: custName,
            target_quantity: targetQty,
        });

        clearInterval(progInterval);

        if (ok && data.success) {
            updateProgress(100, 'اكتمل التوليد بنجاح!');
            setTimeout(() => {
                closeProgress();
                setGenerating(false);
                const orderId = data.order_id || data.orderId;
                setLastGenerated({
                    orderId,
                    order_number: orderNum,
                    customer_name: custName,
                    total_generated: targetQty,
                });
                toast(`تم توليد ${targetQty.toLocaleString('en-US')} كود بنجاح للأوردر (${orderNum})`, 'success', 5000);
                loadAll();
            }, 400);
        } else {
            closeProgress();
            setGenerating(false);
            showAlert('خطأ في التوليد', data.message || 'فشل توليد الأكواد', 'error');
        }
    };

    // Trigger Cluster PDF Download
    const triggerClusterPdfDownload = async (orderId, orderNum, force = false, format = 'roll_35x80') => {
        const formatNames = {
            roll_35x80: 'رول استيكر 3.5×8 سم',
            roll_80x35: 'رول استيكر 8×3.5 سم',
            sheet_a4: 'ورق A4 مقسم',
        };
        const formatTitle = formatNames[format] || '3.5 سم × 8 سم';

        showProgress(
            'جاري استخراج استيكرات الباركود...',
            `يتم الآن تجهيز رول الاستيكر (${formatTitle}) لمكن الباركود بدقة المتجهات (Vector)`
        );

        try {
            const res = await fetch(
                `/api/orders/${orderId}/pdf/generate?format=${encodeURIComponent(format)}${force ? '&force=true' : ''}`,
                {
                    method: 'POST',
                    headers: getAuthHeaders(),
                }
            );
            const data = await res.json();

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
                setTimeout(() => {
                    if (a.parentNode) a.parentNode.removeChild(a);
                }, 2000);
            };

            if (data.status === 'ready') {
                updateProgress(100, 'الملف جاهز لمكن الباركود! جاري بدء التحميل...');
                setTimeout(() => {
                    closeProgress();
                    downloadFile(`/api/orders/${orderId}/pdf/download?format=${encodeURIComponent(format)}`);
                    toast('تم تحميل ملف استيكرات الباركود بنجاح 🏷️', 'success');
                }, 400);
                return;
            }

            // Polling
            let attempts = 0;
            const maxAttempts = 1200;
            const timer = setInterval(async () => {
                attempts++;
                try {
                    const stRes = await fetch(
                        `/api/orders/${orderId}/pdf/status?format=${encodeURIComponent(format)}`,
                        {
                            headers: getAuthHeaders(),
                        }
                    );
                    const stData = await stRes.json();

                    if (stData.success) {
                        if (stData.status === 'ready') {
                            clearInterval(timer);
                            updateProgress(100, 'اكتمل استخراج استيكرات الباركود بنجاح!');
                            setTimeout(() => {
                                closeProgress();
                                downloadFile(`/api/orders/${orderId}/pdf/download?format=${encodeURIComponent(format)}`);
                                toast('تم تحميل رول استيكرات الباركود بنجاح 🏷️', 'success');
                            }, 400);
                        } else if (stData.status === 'error' || stData.status === 'frozen') {
                            clearInterval(timer);
                            closeProgress();
                            showAlert('خطأ في استخراج PDF', stData.message || 'حدث خطأ أثناء معالجة الملف، يرجى إعادة المحاولة.', 'error');
                        } else if (stData.status === 'processing') {
                            const pct = stData.progress || Math.min(95, Math.round(attempts * 1.5));
                            updateProgress(pct, stData.message || `جاري التجهيز... ${pct}%`);
                        }
                    }
                } catch (e) {
                    // ignore temporary fetch error during polling
                }

                if (attempts >= maxAttempts) {
                    clearInterval(timer);
                    closeProgress();
                    showAlert('مهلة المعالجة', 'استغرقت معالجة الـ PDF وقتاً طويلاً، يمكنك الضغط مجدداً لتفقد حالة الملف.');
                }
            }, 500);
        } catch (err) {
            closeProgress();
            showAlert('خطأ في الاتصال', 'تعذر الاتصال بخادم الـ PDF', 'error');
        }
    };

    // Print Barcodes (pure window print or prompt PDF if huge)
    const handlePrintOrderBarcodes = async (orderId, orderNum, customerName) => {
        showProgress('جاري فحص باركودات الأوردر...');
        try {
            const firstPage = await fetch(`/api/orders/${orderId}/barcodes?page=1&pageSize=1000`, {
                headers: getAuthHeaders(),
            });
            const firstData = await firstPage.json();
            closeProgress();

            if (!firstData.success) {
                showAlert('خطأ', 'فشل جلب باركودات الأوردر', 'error');
                return;
            }

            if (firstData.total > 1000) {
                const downloadOk = await confirm(
                    'طباعة كمية كبيرة لمكن الباركود',
                    `هذا الأوردر يحتوي على ${firstData.total.toLocaleString(
                        'en-US'
                    )} استيكر. فتح هذا العدد الضخم في المتصفح سيسبب بطء وتجميد الشاشة.\n\nمن الأفضل والأسرع تحميل ملف PDF الجاهز لرول مكن الباركود (3.5 سم × 8 سم) للطباعة فوراً وبأعلى دقة. هل تريد تحميل الـ PDF الآن؟`,
                    'نعم، تحميل PDF رول الاستيكر (موصى به)',
                    'إلغاء'
                );
                if (downloadOk) {
                    triggerClusterPdfDownload(orderId, orderNum, false, stickerFormat);
                }
                return;
            }

            printBarcodesWindow({
                order_number: orderNum,
                customer_name: customerName,
                barcodes: firstData.barcodes,
            });
        } catch (err) {
            closeProgress();
            showAlert('خطأ', 'تعذر جلب باركودات الأوردر للطباعة', 'error');
        }
    };

    // Delete Order
    const handleDeleteOrder = async (orderId, orderNumber) => {
        const ok = await confirm(
            'تأكيد الحذف النهائي',
            `هل أنت متأكد من حذف الأوردر (${orderNumber}) وجميع سجلاته وشفراته نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`
        );
        if (!ok) return;

        showProgress('جاري الحذف...', 'يتم حذف الأوردر وجميع سجلاته التابعة...');
        const { ok: resOk, data } = await api.deleteOrder(orderId);
        closeProgress();

        if (resOk && data.success) {
            toast('تم حذف الأوردر بنجاح', 'success');
            loadAll();
        } else {
            showAlert('خطأ في الحذف', data.message || 'تعذر حذف الأوردر', 'error');
        }
    };

    // إضافة مرحلة جديدة لأمر التشغيل الحالي المفتوح
    const handleAddStageToCurrentOrder = async (orderId) => {
        if (!selectedNewStageToAdd) {
            toast('يرجى اختيار اسم المرحلة المطلوبة أولاً', 'warning');
            return;
        }
        setAddingStageLoading(true);
        const { ok, data } = await api.addOrderStage(orderId, selectedNewStageToAdd);
        setAddingStageLoading(false);
        if (ok && data.success) {
            toast(data.message, 'success');
            setSelectedNewStageToAdd('');
            await handleViewDetails(orderId);
            await loadAll();
        } else {
            showAlert('فشل الإضافة', data.message || 'تعذر إضافة المرحلة للأوردر', 'error');
        }
    };

    // إلغاء/حذف مرحلة من أمر التشغيل الحالي (بشرط عدم وجود مسحات أو شغل سابق)
    const handleDeleteStageFromCurrentOrder = async (orderId, stageName) => {
        const ok = await confirm(
            `تأكيد إلغاء مرحلة [${stageName}]`,
            `هل أنت متأكد من إلغاء واستبعاد مرحلة [${stageName}] من هذا الأوردر نهائياً؟ يشترط النظام عدم وجود أي مسحات أو شغل سابق عليها.`
        );
        if (!ok) return;

        showProgress('جاري إلغاء المرحلة...', 'يتم التحقق من عدم وجود مسحات سابقة وحذف المرحلة بأمان...');
        const { ok: resOk, data } = await api.deleteOrderStage(orderId, stageName);
        closeProgress();

        if (resOk && data.success) {
            toast(data.message, 'success');
            await handleViewDetails(orderId);
            await loadAll();
        } else {
            showAlert('تعذر الإلغاء', data.message || 'فشل إلغاء المرحلة', 'error');
        }
    };

    // تعيين مرحلة كبداية إلزامية للأوردر
    const handleSetPrimaryStageForOrder = async (orderId, stageName) => {
        showProgress('جاري تعيين مرحلة البداية...', `يتم تعيين مرحلة [${stageName}] كبداية إلزامية للأوردر...`);
        const { ok: resOk, data } = await api.setOrderPrimaryStage(orderId, stageName);
        closeProgress();
        if (resOk && data.success) {
            toast(data.message, 'success');
            await handleViewDetails(orderId);
            await loadAll();
        } else {
            showAlert('فشل تعيين البداية', data?.message || 'تعذر تعيين مرحلة البداية', 'error');
        }
    };

    // جلب قائمة الأوردرات المحذوفة
    const loadDeletedOrders = async () => {
        setRecycleLoading(true);
        try {
            const { ok, data } = await api.getDeletedOrders();
            if (ok && data.success) {
                setDeletedOrdersList(data.deleted_orders || []);
            } else {
                toast(data?.message || 'فشل جلب الأوردرات المحذوفة', 'error');
            }
        } catch (e) {
            console.error('Error loading deleted orders:', e);
        } finally {
            setRecycleLoading(false);
        }
    };

    const openRecycleBin = () => {
        setShowRecycleBinModal(true);
        loadDeletedOrders();
    };

    // استرجاع أوردر محذوف
    const handleRestoreOrder = async (delId, orderNumber) => {
        const ok = await confirm(
            `استرجاع الأوردر (${orderNumber})`,
            `هل تريد بالتأكيد استرجاع هذا الأوردر المحذوف بالكامل مع جميع مراحله وأكواد الباركود إلى خط الإنتاج؟`
        );
        if (!ok) return;

        showProgress('جاري استرجاع الأوردر...', 'يتم إعادة بناء الأوردر ومراحله وأكواده في النظام...');
        const { ok: resOk, data } = await api.restoreDeletedOrder(delId);
        closeProgress();

        if (resOk && data.success) {
            toast(data.message, 'success');
            await loadDeletedOrders();
            await loadAll();
        } else {
            showAlert('فشل الاسترجاع', data?.message || 'تعذر استرجاع الأوردر', 'error');
        }
    };

    // Print External Order Report
    const handlePrintExternalOrderReport = async (orderId, mode = 'print') => {
        try {
            toast(mode === 'pdf' ? 'جاري تجهيز تقرير أمر التشغيل الخارجي للتحميل كـ PDF...' : 'جاري تجهيز تقرير أمر التشغيل الخارجي للطباعة...', 'info', 1200);
            const { ok, data } = await api.getOrderDetails(orderId);
            if (ok && data.success) {
                printExternalOrderReport({
                    order: data.order,
                    scans: data.movements || [],
                    printedBy: user
                }, mode);
            } else {
                toast(data.message || 'فشل جلب تفاصيل التقرير', 'error');
            }
        } catch (err) {
            toast('خطأ في إعداد التقرير للطباعة', 'error');
        }
    };

    // Load unscanned barcodes for a given stage
    const loadUnscannedBarcodes = async (orderId, stage = 'ALL') => {
        setUnscannedLoading(true);
        const { ok, data } = await api.getUnscannedBarcodes(orderId, stage);
        setUnscannedLoading(false);
        if (ok && data.success) {
            setUnscannedBarcodes(data.barcodes || []);
        } else {
            setUnscannedBarcodes([]);
        }
    };

    // Open Order Details Modal
    const handleViewDetails = async (orderId) => {
        showProgress('جاري تحميل تفاصيل الأوردر...');
        const { ok, data } = await api.getOrderDetails(orderId);
        closeProgress();

        if (ok && data.success) {
            setDetailsModalData(data);
            setUnscannedFilterStage('ALL');
            setUnscannedSearch('');
            setUnscannedDisplayLimit(100);
            window.location.hash = '#order=' + orderId;
            // Load all unscanned barcodes immediately
            loadUnscannedBarcodes(orderId, 'ALL');
        } else {
            showAlert('خطأ', data.message || 'فشل جلب تفاصيل الأوردر', 'error');
        }
    };

    // Close Details Modal & clear hash
    const handleCloseDetailsModal = () => {
        setDetailsModalData(null);
        if (window.location.hash && window.location.hash.startsWith('#order=')) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    };

    // Open Comprehensive Report Modal
    const handleOpenComprehensiveReport = async () => {
        showProgress('جاري إعداد التقرير الشامل...');
        const { ok, data } = await api.getComprehensiveReport();
        closeProgress();

        if (ok && data.success) {
            setComprehensiveData(data.orders || []);
            setCompReportTimestamp(getNowFormatted());
            setComprehensiveModalOpen(true);
        } else {
            showAlert('خطأ', 'فشل جلب بيانات التقرير الشامل', 'error');
        }
    };

    // Filter unscanned codes inside Details Modal
    const filteredUnscannedCodes = useMemo(() => {
        let list = unscannedBarcodes; // array of barcode strings
        if (unscannedSearch.trim()) {
            const q = unscannedSearch.trim().toLowerCase();
            list = list.filter((code) => code && code.toLowerCase().includes(q));
        }
        return list;
    }, [unscannedBarcodes, unscannedSearch]);

    // Copy Unscanned Barcodes
    const handleCopyUnscanned = () => {
        if (!filteredUnscannedCodes.length) {
            toast('لا توجد باركودات لنسخها', 'warning');
            return;
        }
        const text = filteredUnscannedCodes.join('\n');
        navigator.clipboard.writeText(text);
        toast(`تم نسخ ${filteredUnscannedCodes.length} باركود للحافظة بنجاح`, 'success');
    };

    // 1. طباعة الشفرات غير الممسوحة كرول استيكرات مكن باركود (نفس مقاس وشكل الأكواد الأصلية تماماً 3.5×8 سم)
    const handlePrintUnscannedStickers = () => {
        if (!filteredUnscannedCodes || !filteredUnscannedCodes.length) {
            toast('لا توجد شفرات مفقودة في هذه التصفية لطباعتها', 'warning');
            return;
        }

        const stageTitle = unscannedFilterStage === 'ALL' ? '' : ` (${unscannedFilterStage})`;
        printBarcodesWindow({
            order_number: detailsModalData?.order?.order_number || 'ORDER',
            customer_name: (detailsModalData?.order?.customer_name || 'قطعة ملابس') + stageTitle,
            barcodes: filteredUnscannedCodes,
        });
    };

    // 2. طباعة كشف الشفرات غير الممسوحة على ورق A4 كمستند تدقيق رسمي
    const handlePrintUnscannedA4Report = () => {
        if (!filteredUnscannedCodes || !filteredUnscannedCodes.length) {
            toast('لا توجد شفرات مفقودة في هذه التصفية لطباعتها', 'warning');
            return;
        }

        printUnscannedReportWindow({
            order_number: detailsModalData?.order?.order_number || 'ORDER',
            customer_name: detailsModalData?.order?.customer_name || '-',
            stage_name: unscannedFilterStage,
            barcodes: filteredUnscannedCodes,
            printedBy: user
        });
    };

    return (
        <div className="navy-slate-bg min-h-screen flex flex-col">
            <Header
                title={t('orders.title')}
                subtitle={`${companyName} | ${t('orders.subtitle')}`}
                badgeText="DASHBOARD"
                activePage="orders"
            />

            <main className="flex-1 p-3 sm:p-5 max-w-6xl w-full mx-auto space-y-4">
                {/* Metric Tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                    <StatCard 
                        label={t('orders.stat_total_orders')} 
                        value={unifiedStats.totalOrders} 
                        colorClass="text-white font-mono" 
                        icon="fas fa-layer-group" 
                        subValue={
                            <span>
                                <strong className="text-blue-400">{unifiedStats.factoryOrders}</strong> {t('common.factory')} · <strong className="text-cyan-400">{unifiedStats.externalOrders}</strong> {t('common.external')}
                            </span>
                        }
                    />
                    <StatCard 
                        label={t('orders.stat_active_orders')} 
                        value={unifiedStats.activeOrders} 
                        colorClass="text-amber-400 font-mono" 
                        icon="fas fa-hourglass-half" 
                        subValue={
                            <span>
                                <strong className="text-amber-300">{unifiedStats.activeFactory}</strong> {t('common.factory')} · <strong className="text-cyan-300">{unifiedStats.activeExternal}</strong> {t('common.external')}
                            </span>
                        }
                    />
                    <StatCard 
                        label={t('orders.stat_closed_orders')} 
                        value={unifiedStats.closedOrders} 
                        colorClass="text-emerald-400 font-mono" 
                        icon="fas fa-check-circle" 
                        subValue={
                            <span>
                                <strong className="text-emerald-300">{unifiedStats.closedFactory}</strong> {t('common.factory')} · <strong className="text-cyan-300">{unifiedStats.closedExternal}</strong> {t('common.external')}
                            </span>
                        }
                    />
                    <StatCard
                        label={t('orders.stat_total_barcodes')}
                        value={unifiedStats.totalAllBarcodes.toLocaleString('en-US')}
                        colorClass="text-blue-400 font-mono"
                        icon="fas fa-barcode"
                        subValue={
                            <span>
                                <strong className="text-blue-300">{unifiedStats.factoryBarcodes.toLocaleString('en-US')}</strong> {t('common.factory')} · <strong className="text-cyan-300">{unifiedStats.externalScans.toLocaleString('en-US')}</strong> {t('common.external')}
                            </span>
                        }
                    />
                </div>

                {/* Quick Action & Info Strip */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center text-base flex-shrink-0">
                            <i className="fas fa-layer-group"></i>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-sm font-bold text-white">{t('orders.title')}</h2>
                                <span className="text-[10px] bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded-md font-mono border border-sky-500/20">LIVE TRACKING</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {t('orders.subtitle')}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:flex items-center gap-2 w-full md:w-auto">
                        {canCreateOrders && (
                            <Link
                                to="/create-order"
                                className="btn-slate btn-slate-primary text-xs py-2 px-3.5 flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-plus-circle text-xs"></i>
                                <span>{t('orders.btn_new_order')}</span>
                            </Link>
                        )}
                        <button
                            onClick={handleOpenComprehensiveReport}
                            className="btn-slate btn-slate-secondary text-xs py-2 px-3 flex items-center justify-center gap-1.5"
                            title={t('orders.btn_print_report')}
                        >
                            <i className="fas fa-file-alt text-slate-400"></i>
                            <span>{t('orders.btn_print_report')}</span>
                        </button>
                        {canAccessRecycleBin && (
                            <button
                                onClick={openRecycleBin}
                                className="btn-slate text-xs py-2 px-3 flex items-center justify-center gap-1.5 border-rose-500/40 text-rose-300 hover:bg-rose-500/15 transition shadow-sm"
                                title="عرض سجل الأوردرات المحذوفة ومعرفة من قام بحذفها وتاريخ ووقت الحذف مع إمكانية استرجاعها"
                            >
                                <i className="fas fa-trash-restore text-rose-400"></i>
                                <span>{language === 'ar' ? 'سلة المحذوفات واسترجاع الأوردرات' : 'Recycle Bin & Restore'}</span>
                            </button>
                        )}
                        <button
                            onClick={loadAll}
                            className="btn-slate btn-slate-secondary text-xs py-2 px-3 flex items-center justify-center gap-1.5 col-span-1 sm:col-span-2 md:col-span-1"
                            title={t('common.refresh')}
                        >
                            <i className="fas fa-sync-alt text-slate-400"></i>
                            <span>{t('common.refresh')}</span>
                        </button>
                    </div>
                </div>

                {/* Orders Table Card */}
                <div className="slate-card p-5">
                    {/* Table Header & Toolbar */}
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 mb-4 border-b border-slate-800">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center text-xs">
                                <i className="fas fa-clipboard-list"></i>
                            </div>
                            <h2 className="text-sm font-bold text-white">{t('orders.title')}</h2>
                            <span className="badge-clean badge-neutral font-mono text-[10px]">
                                {filteredOrders.length} / {orders.length}
                            </span>
                        </div>

                        {/* Search & Status Filters Bar */}
                        <div className="flex items-center gap-2.5 w-full lg:w-auto flex-wrap sm:flex-nowrap">
                            {/* Status Filter Chips */}
                            <div className="filter-chips">
                                {[
                                    { key: 'all', label: t('orders.tab_all'), count: orders.length, activeClass: 'active' },
                                    { key: 'active', label: t('orders.tab_active'), count: unifiedStats.activeOrders, activeClass: 'active-amber' },
                                    { key: 'closed', label: t('orders.tab_closed'), count: unifiedStats.closedOrders, activeClass: 'active-green' },
                                    { key: 'external', label: t('orders.tab_external'), count: unifiedStats.externalOrders, activeClass: 'active' },
                                ].map((tab) => (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => setStatusFilter(tab.key)}
                                        className={`filter-chip ${statusFilter === tab.key ? tab.activeClass : ''}`}
                                    >
                                        <span>{tab.label}</span>
                                        <span className="count-badge text-[10px] h-[18px] min-w-[18px] px-1">
                                            {tab.count}
                                        </span>
                                    </button>
                                ))}
                            </div>

                            {/* Search Input */}
                            <div className="w-full sm:w-64 relative flex-shrink-0">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={t('orders.search_placeholder')}
                                    className={`slate-input text-xs ${isRTL ? 'pr-8 pl-7' : 'pl-8 pr-7'} py-1.5 w-full`}
                                />
                                <i className={`fas fa-search absolute ${isRTL ? 'right-2.5' : 'left-2.5'} top-1/2 -translate-y-1/2 text-slate-500 text-xs`}></i>
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className={`absolute ${isRTL ? 'left-2.5' : 'right-2.5'} top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs`}
                                        title={t('orders.clear_search')}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="slate-table w-full">
                            <thead>
                                <tr>
                                    <th className="p-3 text-center w-12 font-bold">#</th>
                                    <th className="p-3 font-bold">{t('orders.col_order_no')}</th>
                                    <th className="p-3 font-bold">{t('orders.col_client')}</th>
                                    <th className="p-3 text-center font-bold">{t('orders.col_quantity')}</th>
                                    <th className="p-3 text-center font-bold min-w-[140px]">{t('orders.col_progress')}</th>
                                    <th className="p-3 text-center font-bold">{t('orders.col_status')}</th>
                                    <th className="p-3 text-center font-bold">{t('orders.col_actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="7" className="text-center py-10 text-slate-400 text-xs">
                                            <i className="fas fa-circle-notch fa-spin text-lg mb-2 block text-blue-400"></i>
                                            {t('common.loading')}
                                        </td>
                                    </tr>
                                ) : filteredOrders.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="py-12">
                                            <div className="empty-state">
                                                <div className="empty-state-icon">
                                                    <i className="fas fa-search"></i>
                                                </div>
                                                <div className="empty-state-title">{t('orders.empty_title')}</div>
                                                <div className="empty-state-desc">
                                                    {t('orders.empty_desc')}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredOrders.map((o, idx) => {
                                        const isClosed = o.status === 'closed';
                                        let pct = 0;
                                        if (isClosed) {
                                            pct = 100;
                                        } else if (typeof o.overall_completion_rate === 'number') {
                                            pct = Math.min(100, Math.round(o.overall_completion_rate));
                                        } else {
                                            const totalScanned = (o.stages || []).reduce((sum, s) => sum + (Number(s.scanned_quantity) || 0), 0);
                                            const targetQty = Number(o.target_quantity) || 0;
                                            const maxScans = targetQty * ((o.stages && o.stages.length) || 6);
                                            pct = maxScans > 0 ? Math.min(100, Math.round((totalScanned / maxScans) * 100)) : 0;
                                        }
                                        const barColor = isClosed ? '#10b981' : pct >= 80 ? '#10b981' : pct >= 50 ? '#38bdf8' : pct >= 20 ? '#fbbf24' : '#64748b';

                                        return (
                                            <tr key={o.id} className="hover:bg-slate-800/40 transition">
                                                <td className="p-3 text-slate-500 font-mono text-xs text-center">{idx + 1}</td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-bold text-white font-mono text-xs sm:text-sm tracking-wide">
                                                            {o.order_number}
                                                        </span>
                                                        {o.is_external ? (
                                                            <span className="badge-clean text-[9.5px] font-bold" style={{background:'rgba(6,182,212,0.18)', color:'#22d3ee', border:'1px solid rgba(6,182,212,0.35)'}}>
                                                                🏭 {t('common.external')}
                                                            </span>
                                                        ) : (
                                                            <span className="badge-clean text-[9.5px] font-bold" style={{background:'rgba(59,130,246,0.12)', color:'#93c5fd', border:'1px solid rgba(59,130,246,0.25)'}}>
                                                                🏢 {t('common.factory')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                        {formatDate(o.created_at)}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-slate-300 text-xs font-medium">
                                                    {o.is_external ? (
                                                        <span className="text-cyan-300 font-medium">
                                                            {o.customer_name || (language === 'ar' ? 'تشغيل خارجي مفتوح' : 'Open External')}
                                                        </span>
                                                    ) : (
                                                        o.customer_name || '-'
                                                    )}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <span className="font-bold font-mono text-xs" style={{color: o.is_external ? '#22d3ee' : '#fbbf24'}}>
                                                        {(o.target_quantity || 0).toLocaleString('en-US')}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 mr-1">
                                                        {o.is_external ? (language === 'ar' ? 'ممسوح' : 'scans') : t('common.piece')}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <div className="w-full bg-[#0a1120] rounded-full h-2 overflow-hidden border border-slate-700/60 mb-1">
                                                        <div
                                                            className="h-2 rounded-full transition-all duration-300"
                                                            style={{
                                                                width: `${pct}%`,
                                                                background: o.is_external ? 'linear-gradient(90deg, #0e7490, #22d3ee)' : barColor
                                                            }}
                                                        ></div>
                                                    </div>
                                                    <span className="text-[11px] font-mono font-bold" style={{ color: o.is_external ? '#22d3ee' : barColor }}>
                                                        {o.is_external ? `${(o.total_scanned || 0)} ${language === 'ar' ? 'مسحة' : 'scans'}` : `${pct}%`}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center">
                                                    {isClosed ? (
                                                        <span className="badge-clean badge-green text-[10px]">
                                                            <span className="badge-clean-dot"></span> {t('orders.status_closed')}
                                                        </span>
                                                    ) : o.is_external ? (
                                                        <span className="badge-clean text-[10px] font-bold" style={{background:'rgba(6,182,212,0.15)', color:'#22d3ee', border:'1px solid rgba(6,182,212,0.3)'}}>
                                                            <span className="badge-clean-dot" style={{background:'#22d3ee'}}></span> {t('orders.status_open')}
                                                        </span>
                                                    ) : (
                                                        <span className="badge-clean badge-amber text-[10px]">
                                                            <span className="badge-clean-dot"></span> {t('orders.status_open')}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                                        <button
                                                            onClick={() => handleViewDetails(o.id)}
                                                            className="btn-slate btn-slate-secondary text-[11px] py-1 px-2.5"
                                                            title={t('common.details')}
                                                        >
                                                            <i className="fas fa-chart-bar text-[10px] text-blue-400"></i> {t('common.details')}
                                                        </button>
                                                        {o.is_external ? (
                                                            <>
                                                                <button
                                                                    onClick={() => handlePrintExternalOrderReport(o.id, 'print')}
                                                                    className="btn-slate btn-slate-secondary text-[11px] py-1 px-2 text-cyan-300"
                                                                    title="Print A4"
                                                                >
                                                                    <i className="fas fa-print text-[10px]"></i> A4
                                                                </button>
                                                                <button
                                                                    onClick={() => handlePrintExternalOrderReport(o.id, 'pdf')}
                                                                    className="btn-slate btn-slate-secondary text-[11px] py-1 px-2 text-rose-400"
                                                                    title="PDF Download"
                                                                >
                                                                    <i className="fas fa-file-pdf text-[10px]"></i> PDF
                                                                </button>
                                                                <a
                                                                    href="/external_tracking.html"
                                                                    className="btn-slate btn-slate-secondary text-[11px] py-1 px-2 text-cyan-300"
                                                                    title={t('nav.external_tracking')}
                                                                >
                                                                    <i className="fas fa-truck-loading text-[10px]"></i> {t('common.external')}
                                                                </a>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={() =>
                                                                        triggerClusterPdfDownload(o.id, o.order_number, false, stickerFormat)
                                                                    }
                                                                    className="btn-slate btn-slate-secondary text-[11px] py-1 px-2 text-rose-400"
                                                                >
                                                                    <i className="fas fa-file-pdf text-[10px]"></i> PDF
                                                                </button>
                                                                <button
                                                                    onClick={() =>
                                                                        handlePrintOrderBarcodes(o.id, o.order_number, o.customer_name)
                                                                    }
                                                                    className="btn-slate btn-slate-primary text-[11px] py-1 px-2"
                                                                >
                                                                    <i className="fas fa-print text-[10px]"></i> {t('common.print')}
                                                                </button>
                                                            </>
                                                        )}
                                                        {isAdmin && (
                                                            <button
                                                                onClick={() => handleDeleteOrder(o.id, o.order_number)}
                                                                className="btn-slate btn-slate-danger text-[11px] py-1 px-2"
                                                                title={t('common.delete')}
                                                            >
                                                                <i className="fas fa-trash-alt text-[10px]"></i> {t('common.delete')}
                                                            </button>
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
            </main>

            {/* ===== Modal سلة محذوفات الأوردرات وسجل الحذف والاسترجاع ===== */}
            {showRecycleBinModal && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(10,17,32,0.85)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 9995,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                    }}
                >
                    <div
                        className="w-full max-w-5xl rounded-2xl border border-rose-500/30 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
                        style={{ background: 'linear-gradient(135deg, #0b1120 0%, #171d33 100%)' }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-rose-500/20 bg-rose-950/20">
                            <div className="flex items-center gap-3">
                                <span className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 text-base">
                                    <i className="fas fa-trash-restore"></i>
                                </span>
                                <div>
                                    <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                                        <span>{language === 'ar' ? 'سلة محذوفات الأوردرات وسجل الحذف' : 'Deleted Orders Audit & Restore'}</span>
                                        <span className="badge-clean badge-red text-[10px]">
                                            {deletedOrdersList.length} {language === 'ar' ? 'محذوف' : 'deleted'}
                                        </span>
                                    </h3>
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                        {language === 'ar'
                                            ? 'يوثق هذا السجل تلقائياً من قام بحذف أي أوردر وتاريخ ووقت الحذف بدقة لمنع الأخطاء، مع إمكانية استرجاعه فوراً.'
                                            : 'Audit log of all deleted orders with timestamps, user identity, and full restore capability.'
                                        }
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowRecycleBinModal(false)}
                                className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-4 overflow-y-auto flex-1 space-y-3">
                            {recycleLoading ? (
                                <div className="text-center py-12 text-slate-400 text-xs">
                                    <i className="fas fa-circle-notch fa-spin text-xl mb-2 block text-rose-400"></i>
                                    {language === 'ar' ? 'جاري تحميل سجل المحذوفات...' : 'Loading deleted orders...'}
                                </div>
                            ) : deletedOrdersList.length === 0 ? (
                                <div className="text-center py-12 text-slate-400 text-xs">
                                    <i className="fas fa-check-circle text-3xl mb-2 text-emerald-400 block"></i>
                                    {language === 'ar' ? 'لا توجد أي أوردرات محذوفة في السجل حالياً.' : 'No deleted orders found.'}
                                </div>
                            ) : (
                                <div className="overflow-x-auto rounded-xl border border-slate-700/60 bg-[#090e1c]">
                                    <table className="slate-table w-full text-xs">
                                        <thead>
                                            <tr>
                                                <th className="p-2.5 font-bold">رقم الأوردر</th>
                                                <th className="p-2.5 font-bold">اسم العميل</th>
                                                <th className="p-2.5 text-center font-bold">الكمية</th>
                                                <th className="p-2.5 font-bold text-rose-300">من قام بالحذف</th>
                                                <th className="p-2.5 text-center font-bold text-amber-300">تاريخ ووقت الحذف</th>
                                                <th className="p-2.5 text-center font-bold">الحركات السابقة</th>
                                                <th className="p-2.5 text-center font-bold">استرجاع</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {deletedOrdersList.map((del) => (
                                                <tr key={del.id} className="hover:bg-slate-800/40 border-b border-slate-800">
                                                    <td className="p-2.5 font-mono font-bold text-white">
                                                        {del.order_number}
                                                    </td>
                                                    <td className="p-2.5 text-slate-300 font-semibold">
                                                        {del.customer_name}
                                                    </td>
                                                    <td className="p-2.5 text-center font-mono font-bold text-amber-400">
                                                        {Number(del.target_quantity).toLocaleString('en-US')}
                                                    </td>
                                                    <td className="p-2.5 font-bold text-rose-400">
                                                        <div className="flex items-center gap-1.5">
                                                            <i className="fas fa-user-times text-xs"></i>
                                                            <span>{del.deleted_by}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-2.5 text-center font-mono text-slate-300 text-[11px]">
                                                        {del.deleted_at ? new Date(del.deleted_at).toLocaleString('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                                                    </td>
                                                    <td className="p-2.5 text-center font-mono text-slate-400">
                                                        {del.movements_count || 0}
                                                    </td>
                                                    <td className="p-2.5 text-center">
                                                        <button
                                                            onClick={() => handleRestoreOrder(del.id, del.order_number)}
                                                            className="btn-slate text-[11px] py-1 px-3 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/20 font-bold flex items-center gap-1 mx-auto shadow-sm"
                                                            title="استرجاع هذا الأوردر بكل مراحله وأكواد الباركود إلى خط الإنتاج"
                                                        >
                                                            <i className="fas fa-undo-alt text-[10px]"></i>
                                                            <span>{language === 'ar' ? 'استرجاع الأوردر' : 'Restore'}</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-3 bg-slate-900/60 border-t border-slate-800 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setShowRecycleBinModal(false)}
                                className="btn-slate btn-slate-secondary text-xs py-1.5 px-4"
                            >
                                {language === 'ar' ? 'إغلاق' : 'Close'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Modal 1: تفاصيل الأوردر (Order Sheet) ===== */}
            {detailsModalData && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(10,17,32,0.75)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 9990,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                    }}
                >
                    <div className="modal-content slate-card w-full max-w-5xl max-h-[92vh] overflow-hidden shadow-2xl p-0 flex flex-col">
                        {/* Modal Header */}
                        <div className="border-b border-slate-700/60 p-4 sm:p-5 flex-shrink-0 bg-[#0a1120]">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="brand-mark">
                                        <i className="fas fa-barcode"></i>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-sm sm:text-base font-bold text-white">
                                                {language === 'ar' ? 'بطاقة تتبع إنتاج ومسح الأوردر' : 'Work Order Production Tracking Card'}
                                            </h2>
                                            <span className="badge-clean badge-blue font-mono text-xs">
                                                {detailsModalData.order?.order_number}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                            {companyName} | Industrial Tracking Sheet
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleCloseDetailsModal}
                                        className="btn-slate btn-slate-secondary w-8 h-8 p-0 flex items-center justify-center text-slate-400 hover:text-white"
                                    >
                                        <i className="fas fa-times text-xs"></i>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-5">
                            {/* Meta info cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 bg-[#0a1120] p-4 rounded-xl border border-slate-700/60">
                                <div>
                                    <span className="text-slate-400 block text-[11px]">{t('common.order_no')}</span>
                                    <strong className="text-white font-mono text-xs">{detailsModalData.order?.order_number}</strong>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[11px]">{t('common.client')}</span>
                                    <strong className="text-slate-200 text-xs">{detailsModalData.order?.customer_name || '-'}</strong>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[11px]">{t('common.target_quantity')}</span>
                                    <strong className="text-amber-400 font-mono text-xs">
                                        {(detailsModalData.order?.target_quantity || 0).toLocaleString('en-US')}
                                    </strong>
                                </div>
                                {isAdmin && (
                                    <div>
                                        <span className="text-slate-400 block text-[11px]">{language === 'ar' ? 'أنشئ بواسطة' : 'Created By'}</span>
                                        <strong className="text-blue-400 font-mono text-xs flex items-center gap-1">
                                            <i className="fas fa-user-edit text-[10px]"></i>
                                            {detailsModalData.order?.created_by || (language === 'ar' ? 'إدارة النظام' : 'System Admin')}
                                        </strong>
                                    </div>
                                )}
                                <div>
                                    <span className="text-slate-400 block text-[11px]">{language === 'ar' ? 'تاريخ وساعة الفتح' : 'Open Timestamp'}</span>
                                    <strong className="text-slate-300 font-mono text-[10px] block" title={detailsModalData.order?.created_at}>
                                        {formatDate(detailsModalData.order?.created_at)}
                                    </strong>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[11px]">{language === 'ar' ? 'تاريخ وساعة الإغلاق' : 'Close Timestamp'}</span>
                                    <strong className={`font-mono text-[10px] block ${detailsModalData.order?.completed_at ? 'text-emerald-400' : 'text-slate-400'}`}>
                                        {detailsModalData.order?.completed_at ? formatDate(detailsModalData.order?.completed_at) : (detailsModalData.order?.last_activity_at ? `${language === 'ar' ? 'آخر مسح:' : 'Last scan:'} ${formatDate(detailsModalData.order?.last_activity_at)}` : (language === 'ar' ? 'قيد التشغيل' : 'In-Progress'))}
                                    </strong>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[11px]">{t('common.status')}</span>
                                    <strong className="text-emerald-400 text-xs block">
                                        {detailsModalData.order?.status === 'closed' || detailsModalData.order?.is_all_completed ? (language === 'ar' ? '✅ مكتمل ومغلق' : '✅ Closed') : (language === 'ar' ? '⏳ قيد التشغيل' : '⏳ In-Progress')}
                                    </strong>
                                </div>
                            </div>

                            {/* 6 Stages Breakdown */}
                            <div className="slate-card p-4">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                                    <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                                        <i className="fas fa-layer-group text-blue-400 text-xs"></i>
                                        <span>{language === 'ar' ? 'سجل تتبع ومراقبة مراحل الإنتاج ومسؤولي المسح' : 'Production Pipeline Stages Audit & Scanners'}</span>
                                    </h4>
                                    {isAdmin && (
                                        <span className="text-[11px] text-slate-400 font-mono">
                                            {language === 'ar' ? 'مسؤول الفتح الأصلي:' : 'Created By:'} <strong className="text-amber-300">{detailsModalData.order?.created_by || (language === 'ar' ? 'النظام' : 'System')}</strong>
                                        </span>
                                    )}
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="slate-table w-full">
                                        <thead>
                                            <tr>
                                                <th className="p-2.5 font-bold">{t('common.stage')}</th>
                                                <th className="p-2.5 text-center font-bold">{t('common.target_quantity')}</th>
                                                <th className="p-2.5 text-center font-bold">{language === 'ar' ? 'الممسوح الفعلي' : 'Actual Scanned'}</th>
                                                <th className="p-2.5 text-center font-bold">{language === 'ar' ? 'المتبقي' : 'Remaining'}</th>
                                                <th className="p-2.5 text-center font-bold min-w-[110px]">{t('common.completion_rate')}</th>
                                                <th className="p-2.5 font-bold text-blue-400">{language === 'ar' ? 'مشغلو المسح (الموظفون)' : 'Scan Operators'}</th>
                                                <th className="p-2.5 text-center font-bold text-slate-300">{language === 'ar' ? 'أول ضربة (بدء المسح)' : 'First Scan'}</th>
                                                <th className="p-2.5 text-center font-bold text-slate-300">{language === 'ar' ? 'آخر ضربة (إغلاق / توقف)' : 'Last Scan'}</th>
                                                <th className="p-2.5 text-center font-bold">{t('common.status')}</th>
                                                {(canCreateOrders || isAdmin || isITSupport) && !detailsModalData.order?.is_external && (
                                                    <th className="p-2.5 text-center font-bold text-amber-300">{language === 'ar' ? 'التحكم بالمرحلة (إلغاء / بداية إلزامية)' : 'Stage Control'}</th>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(detailsModalData.stages || []).map((stg, stgIdx) => {
                                                const sQty = Number(stg.scanned_quantity) || 0;
                                                const tQty = Number(stg.target_quantity) || Number(detailsModalData.order?.target_quantity) || 0;
                                                const rem = Math.max(0, tQty - sQty);
                                                const pct = tQty > 0 ? Math.min(100, Math.round((sQty / tQty) * 100)) : 0;
                                                const isStgClosed = stg.status === 'closed' || (tQty > 0 && sQty >= tQty);
                                                const isPrimaryStage = stgIdx === 0;

                                                return (
                                                    <tr key={stg.id || stg.stage_name} className="hover:bg-slate-800/40">
                                                        <td className="p-2.5 font-bold text-white text-xs">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span>{translateStage(stg.stage_name)}</span>
                                                                {isPrimaryStage && (
                                                                    <span className="badge-clean text-[9.5px] font-bold" style={{background:'rgba(245,158,11,0.15)',color:'#fbbf24',border:'1px solid rgba(245,158,11,0.3)'}} title="المرحلة الإلزامية الأولى بالترتيب - لا تتخطاها أي مرحلة أخرى">
                                                                        👑 {language === 'ar' ? 'البداية الإلزامية' : 'Primary Stage'}
                                                                    </span>
                                                                )}
                                                                {stg.sessions_count > 1 && (
                                                                    <span className="badge-clean badge-amber text-[9px] font-mono mr-1.5" title="تم استئناف الشغل على هذه المرحلة أكثر من مرة">
                                                                        {stg.sessions_count} {language === 'ar' ? 'فترات تشغيل' : 'sessions'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="p-2.5 text-center font-mono font-bold text-amber-400 text-xs">
                                                            {tQty.toLocaleString('en-US')}
                                                        </td>
                                                        <td className="p-2.5 text-center font-mono font-bold text-emerald-400 text-xs">
                                                            {sQty.toLocaleString('en-US')}
                                                        </td>
                                                        <td className="p-2.5 text-center font-mono text-rose-400 text-xs">
                                                            {rem.toLocaleString('en-US')}
                                                        </td>
                                                        <td className="p-2.5 text-center">
                                                            <div className="w-full bg-[#0a1120] rounded-full h-2 overflow-hidden border border-slate-700/60 mb-1">
                                                                <div
                                                                    className="h-2 rounded-full transition-all duration-300"
                                                                    style={{
                                                                        width: `${pct}%`,
                                                                        background: isStgClosed ? '#10b981' : '#d4af67',
                                                                    }}
                                                                ></div>
                                                            </div>
                                                            <span className="text-[11px] font-mono font-bold">{pct}%</span>
                                                        </td>
                                                        <td className="p-2.5 text-blue-300 text-xs font-mono">
                                                            {stg.scanners_list ? (
                                                                <span className="flex items-center gap-1">
                                                                    <i className="fas fa-barcode text-[10px] text-blue-400"></i>
                                                                    <strong>{stg.scanners_list}</strong>
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-500">—</span>
                                                            )}
                                                        </td>
                                                        <td className="p-2.5 text-center text-slate-300 font-mono text-[10px]">
                                                            {stg.first_scan ? formatDate(stg.first_scan) : <span className="text-slate-500">لم يبدأ بعد</span>}
                                                        </td>
                                                        <td className="p-2.5 text-center text-slate-300 font-mono text-[10px]">
                                                            {stg.last_scan ? (
                                                                <div>
                                                                    <span>{formatDate(stg.last_scan)}</span>
                                                                    {isStgClosed && <span className="text-emerald-400 text-[9px] block">تم الإغلاق والاكتمال</span>}
                                                                </div>
                                                            ) : (
                                                                <span className="text-slate-500">—</span>
                                                            )}
                                                        </td>
                                                        <td className="p-2.5 text-center">
                                                            {isStgClosed ? (
                                                                <span className="badge-clean badge-green text-[10px]">مكتملة ومغلقة</span>
                                                            ) : sQty > 0 ? (
                                                                <span className="badge-clean badge-amber text-[10px]">جارٍ العمل</span>
                                                            ) : (
                                                                <span className="badge-clean badge-neutral text-[10px]">في الانتظار</span>
                                                            )}
                                                        </td>
                                                        {(canCreateOrders || isAdmin || isITSupport) && !detailsModalData.order?.is_external && (
                                                            <td className="p-2.5 text-center">
                                                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                                                    {!isPrimaryStage && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleSetPrimaryStageForOrder(detailsModalData.order.id, stg.stage_name)}
                                                                            className="btn-slate text-[10.5px] py-1 px-2 border-amber-500/40 text-amber-300 hover:bg-amber-500/15 whitespace-nowrap"
                                                                            title="تعيين هذه المرحلة لتكون هي المرحلة الأولى الإلزامية التي يبدأ منها الأوردر"
                                                                        >
                                                                            👑 {language === 'ar' ? 'تعيين كبداية إلزامية' : 'Set as Primary'}
                                                                        </button>
                                                                    )}
                                                                    {sQty === 0 ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteStageFromCurrentOrder(detailsModalData.order.id, stg.stage_name)}
                                                                            className="btn-slate btn-slate-danger text-[10.5px] py-1 px-2 whitespace-nowrap"
                                                                            title="إلغاء واستبعاد هذه المرحلة لعدم وجود أي شغل أو مسحات سابقة عليها"
                                                                        >
                                                                            <i className="fas fa-trash-alt text-[10px]"></i> {language === 'ar' ? 'إلغاء' : 'Cancel'}
                                                                        </button>
                                                                    ) : (
                                                                        <span className="text-[10px] text-slate-500 font-bold flex items-center justify-center gap-1" title="لا يمكن إلغاء هذه المرحلة لوجود مسحات وشغل سابق عليها">
                                                                            <i className="fas fa-lock text-slate-400 text-[10px]"></i> محصنة
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* إضافة مرحلة جديدة لأمر التشغيل هذا */}
                                {(canCreateOrders || isAdmin || isITSupport) && !detailsModalData.order?.is_external && (
                                    <div className="mt-3.5 p-3 rounded-xl bg-[#090e1c] border border-slate-700/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center text-xs flex-shrink-0">
                                                <i className="fas fa-plus"></i>
                                            </div>
                                            <div>
                                                <span className="text-xs font-bold text-white block">إضافة مرحلة جديدة لأمر التشغيل هذا</span>
                                                <span className="text-[10.5px] text-slate-400">يمكنك إلحاق مراحل إنتاج إضافية بالأوردر وسيتم إدراجها بنفس كمية الأمر المطلوبة</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                            <select
                                                value={selectedNewStageToAdd}
                                                onChange={(e) => setSelectedNewStageToAdd(e.target.value)}
                                                className="slate-input text-xs py-1.5 px-3 min-w-[210px] text-white cursor-pointer"
                                            >
                                                <option value="">⚡ اختر مرحلة لإضافتها للأوردر...</option>
                                                {availableSystemStages
                                                    .filter(stg => !(detailsModalData.stages || []).some(s => s.stage_name === stg))
                                                    .map(stg => (
                                                        <option key={stg} value={stg}>{stg}</option>
                                                    ))
                                                }
                                            </select>
                                            <button
                                                type="button"
                                                disabled={!selectedNewStageToAdd || addingStageLoading}
                                                onClick={() => handleAddStageToCurrentOrder(detailsModalData.order.id)}
                                                className="btn-slate btn-slate-primary text-xs py-1.5 px-3.5 whitespace-nowrap font-bold shadow-md shadow-sky-500/20"
                                            >
                                                {addingStageLoading ? (
                                                    <i className="fas fa-circle-notch fa-spin text-xs"></i>
                                                ) : (
                                                    <span className="flex items-center gap-1.5">
                                                        <i className="fas fa-plus-circle text-xs"></i>
                                                        <span>إضافة المرحلة</span>
                                                    </span>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* سجل فترات التشغيل وتوقف واستئناف العمل (Sessions Audit Trail) */}
                            {detailsModalData.stage_sessions && Object.keys(detailsModalData.stage_sessions).length > 0 && (
                                <div className="slate-card p-4 bg-gradient-to-br from-[#0a1120] to-[#0f172a] border border-blue-500/30">
                                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-700/60">
                                        <div className="flex items-center gap-2">
                                            <i className="fas fa-history text-blue-400 text-xs"></i>
                                            <h4 className="text-xs sm:text-sm font-bold text-white">
                                                سجل تفصيلي: فترات فتح وقفل واستئناف العمل بكل مرحلة
                                            </h4>
                                        </div>
                                        <span className="badge-clean badge-blue text-[9px] font-mono">AUDIT TRAIL</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {Object.entries(detailsModalData.stage_sessions).map(([stageName, sessions]) => (
                                            <div key={stageName} className="p-3 rounded-lg bg-slate-900/80 border border-slate-800">
                                                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-800">
                                                    <span className="font-bold text-xs text-amber-300 flex items-center gap-1.5">
                                                        <i className="fas fa-industry text-[10px]"></i>
                                                        {stageName}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                        {sessions.length} {sessions.length > 1 ? 'جلسات / استئناف' : 'جلسة واحدة'}
                                                    </span>
                                                </div>
                                                <div className="space-y-2">
                                                    {sessions.map((sess) => (
                                                        <div key={sess.session_num} className="flex items-start justify-between text-[11px] p-2 rounded bg-slate-800/40 border border-slate-700/40">
                                                            <div>
                                                                <span className="font-bold text-slate-200 block">
                                                                    الفترة #{sess.session_num}: المشغل (<strong>{sess.scanned_by}</strong>)
                                                                </span>
                                                                <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                                                                    من: <strong className="text-slate-300">{formatDate(sess.started_at)}</strong>
                                                                </span>
                                                                <span className="text-[10px] text-slate-400 font-mono block">
                                                                    إلى: <strong className="text-slate-300">{formatDate(sess.ended_at)}</strong>
                                                                </span>
                                                            </div>
                                                            <div className="text-left font-mono">
                                                                <span className="badge-clean badge-green text-[9px] block mb-0.5">
                                                                    +{sess.scanned_pieces} قطعة
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Unscanned Barcodes Card */}
                            <div className="slate-card p-4">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                                    <div className="flex items-center gap-2">
                                        <i className="fas fa-exclamation-triangle text-amber-400 text-xs"></i>
                                        <h4 className="text-xs sm:text-sm font-bold text-white">القطع المتبقية ولم تُمسح</h4>
                                        <span className="badge-clean badge-amber font-mono text-[10px]">
                                            {unscannedLoading ? '...' : `${filteredUnscannedCodes.length} قطعة`}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap">
                                        {/* Stage filter */}
                                        <select
                                            value={unscannedFilterStage}
                                            onChange={(e) => {
                                                const stage = e.target.value;
                                                setUnscannedFilterStage(stage);
                                                if (detailsModalData?.order?.id) {
                                                    loadUnscannedBarcodes(detailsModalData.order.id, stage);
                                                }
                                            }}
                                            className="slate-input text-xs py-1 px-2 cursor-pointer"
                                        >
                                            <option value="ALL">كل الشفرات (لم تُضرب إطلاقاً)</option>
                                            {PRODUCTION_STAGES.map((s) => (
                                                <option key={s} value={s}>
                                                    لم تُضرب في: {s}
                                                </option>
                                            ))}
                                        </select>

                                        {/* Search */}
                                        <input
                                            type="text"
                                            value={unscannedSearch}
                                            onChange={(e) => setUnscannedSearch(e.target.value)}
                                            placeholder="بحث في الأكواد..."
                                            className="slate-input text-xs py-1 px-2 w-32"
                                        />

                                        <button
                                            onClick={handleCopyUnscanned}
                                            className="btn-slate btn-slate-secondary text-xs py-1 px-2.5 flex items-center gap-1.5"
                                            title="نسخ الأكواد إلى الحافظة"
                                        >
                                            <i className="fas fa-copy"></i> نسخ
                                        </button>

                                        <button
                                            onClick={handlePrintUnscannedStickers}
                                            className="btn-slate text-xs py-1 px-2.5 flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold shadow-md shadow-emerald-950/40 border border-emerald-500/40"
                                            title="طباعة استيكرات مكن الباركود الحراري بنفس مقاس وتصميم الأصل تماماً (3.5×8 سم)"
                                        >
                                            <i className="fas fa-barcode"></i> طباعة استيكرات (3.5×8)
                                        </button>

                                        <button
                                            onClick={handlePrintUnscannedA4Report}
                                            className="btn-slate btn-slate-primary text-xs py-1 px-2.5 flex items-center gap-1.5"
                                            title="طباعة كشف حصر وتدقيق رسمي A4"
                                        >
                                            <i className="fas fa-print"></i> طباعة A4
                                        </button>

                                        <button
                                            onClick={() => {
                                                if (!filteredUnscannedCodes || !filteredUnscannedCodes.length) {
                                                    toast('لا توجد شفرات مفقودة في هذه التصفية لطباعتها', 'warning');
                                                    return;
                                                }
                                                printUnscannedReportWindow({
                                                    order_number: detailsModalData?.order?.order_number || 'ORDER',
                                                    customer_name: detailsModalData?.order?.customer_name || '-',
                                                    stage_name: unscannedFilterStage,
                                                    barcodes: filteredUnscannedCodes,
                                                    printedBy: user
                                                }, 'pdf');
                                            }}
                                            className="btn-slate bg-sky-600 hover:bg-sky-500 text-white text-xs py-1 px-2.5 flex items-center gap-1.5 border border-sky-400/40"
                                            title="تحميل كشف حصر وتدقيق رسمي A4 كملف PDF"
                                        >
                                            <i className="fas fa-file-pdf"></i> تحميل PDF
                                        </button>
                                    </div>
                                </div>

                                <div className="max-h-56 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 p-2 bg-[#0a1120] rounded-xl border border-slate-700/60 font-mono text-xs">
                                    {unscannedLoading ? (
                                        <div className="col-span-full text-center py-6 text-amber-400 text-xs flex items-center justify-center gap-2">
                                            <div style={{width:'16px',height:'16px',border:'2px solid #334155',borderTopColor:'#f59e0b',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}></div>
                                            جاري التحميل...
                                        </div>
                                    ) : filteredUnscannedCodes.length === 0 ? (
                                        <div className="col-span-full text-center py-6 text-slate-500 text-xs">
                                            ✅ لا توجد قطع متبقية في هذا التصفية (كافة القطع تم مسحها بنجاح)
                                        </div>
                                    ) : (
                                        filteredUnscannedCodes.slice(0, unscannedDisplayLimit).map((code, i) => (
                                            <div
                                                key={i}
                                                className="p-1.5 rounded-md bg-[#131f37] border border-slate-700/60 text-center text-amber-300 text-[11px] truncate"
                                            >
                                                {code}
                                            </div>
                                        ))
                                    )}
                                </div>

                                {filteredUnscannedCodes.length > unscannedDisplayLimit && (
                                    <div className="text-center mt-2">
                                        <button
                                            onClick={() => setUnscannedDisplayLimit((prev) => prev + 100)}
                                            className="text-xs text-blue-400 hover:underline font-mono"
                                        >
                                            عرض 100 كود إضافي...
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="border-t border-slate-700/60 p-4 bg-[#0a1120] flex justify-between items-center flex-shrink-0 flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => {
                                        if (detailsModalData.order?.is_external) {
                                            printExternalOrderReport({
                                                order: detailsModalData.order,
                                                scans: detailsModalData.movements || [],
                                                printedBy: user
                                            }, 'print');
                                        } else {
                                            printOrderTrackingReport({
                                                order: detailsModalData.order,
                                                stages: detailsModalData.stages,
                                                unscannedCount: detailsModalData.unscanned_count,
                                                movements: detailsModalData.movements,
                                                printedBy: user
                                            }, 'print');
                                        }
                                    }}
                                    className="btn-slate btn-slate-primary text-xs py-2 px-3 shadow-lg shadow-sky-500/20"
                                    title="طباعة التقرير مباشرة"
                                >
                                    <i className="fas fa-print"></i> طباعة كارت التتبع (A4)
                                </button>
                                <button
                                    onClick={() => {
                                        if (detailsModalData.order?.is_external) {
                                            printExternalOrderReport({
                                                order: detailsModalData.order,
                                                scans: detailsModalData.movements || [],
                                                printedBy: user
                                            }, 'pdf');
                                        } else {
                                            printOrderTrackingReport({
                                                order: detailsModalData.order,
                                                stages: detailsModalData.stages,
                                                unscannedCount: detailsModalData.unscanned_count,
                                                movements: detailsModalData.movements,
                                                printedBy: user
                                            }, 'pdf');
                                        }
                                    }}
                                    className="btn-slate bg-sky-600 hover:bg-sky-500 text-white text-xs py-2 px-3 shadow-lg shadow-sky-600/25 border border-sky-400/40"
                                    title="تنزيل التقرير كملف PDF وحفظه بالجهاز"
                                >
                                    <i className="fas fa-file-pdf"></i> تحميل كارت التتبع PDF
                                </button>
                                {filteredUnscannedCodes.length > 0 && (
                                    <>
                                        <button
                                            onClick={() => printUnscannedReportWindow({
                                                order_number: detailsModalData.order?.order_number,
                                                customer_name: detailsModalData.order?.customer_name,
                                                stage_name: unscannedFilterStage,
                                                barcodes: filteredUnscannedCodes,
                                                printedBy: user
                                            }, 'print')}
                                            className="btn-slate btn-slate-danger text-xs py-2 px-3"
                                            title="طباعة تقرير الشفرات الناقصة"
                                        >
                                            <i className="fas fa-print"></i> طباعة الناقصة ({filteredUnscannedCodes.length})
                                        </button>
                                        <button
                                            onClick={() => printUnscannedReportWindow({
                                                order_number: detailsModalData.order?.order_number,
                                                customer_name: detailsModalData.order?.customer_name,
                                                stage_name: unscannedFilterStage,
                                                barcodes: filteredUnscannedCodes,
                                                printedBy: user
                                            }, 'pdf')}
                                            className="btn-slate bg-rose-700 hover:bg-rose-600 text-white text-xs py-2 px-3 border border-rose-500/40"
                                            title="تنزيل تقرير الشفرات الناقصة كملف PDF"
                                        >
                                            <i className="fas fa-file-pdf"></i> تحميل الناقصة PDF
                                        </button>
                                    </>
                                )}
                            </div>
                            <button
                                onClick={handleCloseDetailsModal}
                                className="btn-slate btn-slate-secondary text-xs py-2 px-4"
                            >
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Modal 2: التقرير الشامل (Comprehensive Factory Operations Report) ===== */}
            {comprehensiveModalOpen && comprehensiveData && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(10,17,32,0.8)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 9991,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                    }}
                >
                    <div className="modal-content slate-card w-full max-w-6xl max-h-[94vh] overflow-hidden shadow-2xl p-0 flex flex-col">
                        {/* Report Header */}
                        <div className="border-b border-slate-700/60 p-4 sm:p-5 bg-[#0a1120] flex justify-between items-center flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="brand-mark">
                                    <i className="fas fa-file-invoice"></i>
                                </div>
                                <div>
                                    <h2 className="text-sm sm:text-base font-bold text-white">
                                        التقرير الشامل لتتبع إنتاج ومسح المصنع
                                    </h2>
                                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                        {companyName} | Comprehensive Factory Operations Sheet
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="text-left font-mono text-xs">
                                    <div className="text-[10px] text-slate-400">تاريخ التقرير</div>
                                    <div className="font-bold text-slate-200">{compReportTimestamp}</div>
                                </div>
                                <button
                                    onClick={() => setComprehensiveModalOpen(false)}
                                    className="btn-slate btn-slate-secondary w-8 h-8 p-0 flex items-center justify-center text-slate-400 hover:text-white"
                                >
                                    <i className="fas fa-times text-xs"></i>
                                </button>
                            </div>
                        </div>

                        {/* Report Body */}
                        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-6">
                            {/* Summary Metrics */}
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                <StatCard
                                    label="إجمالي الأوردرات"
                                    value={comprehensiveData.length}
                                    subValue={`${comprehensiveData.filter(o => !o.is_external).length} مصنع · ${comprehensiveData.filter(o => o.is_external).length} خارجي`}
                                    colorClass="text-white"
                                />
                                <StatCard
                                    label="أوردرات قيد التشغيل"
                                    value={comprehensiveData.filter((o) => o.status !== 'closed').length}
                                    subValue={`${comprehensiveData.filter(o => !o.is_external && o.status !== 'closed').length} مصنع · ${comprehensiveData.filter(o => o.is_external && o.status !== 'closed').length} خارجي`}
                                    colorClass="text-amber-400"
                                />
                                <StatCard
                                    label="أوردرات مكتملة"
                                    value={comprehensiveData.filter((o) => o.status === 'closed').length}
                                    subValue={`${comprehensiveData.filter(o => !o.is_external && o.status === 'closed').length} مصنع · ${comprehensiveData.filter(o => o.is_external && o.status === 'closed').length} خارجي`}
                                    colorClass="text-emerald-400"
                                />
                                <StatCard
                                    label="إجمالي الكميات المستهدفة"
                                    value={comprehensiveData
                                        .reduce((acc, o) => acc + (Number(o.target_quantity) || 0), 0)
                                        .toLocaleString('en-US')}
                                    colorClass="text-blue-400"
                                />
                                <StatCard
                                    label="متوسط نسبة الإنجاز"
                                    value={
                                        comprehensiveData.length
                                            ? Math.round(
                                                  comprehensiveData.reduce(
                                                      (acc, o) => acc + (Number(o.overall_completion_rate) || 0),
                                                      0
                                                  ) / comprehensiveData.length
                                              ) + '%'
                                            : '0%'
                                    }
                                    colorClass="text-white font-mono"
                                />
                            </div>

                            {/* Comprehensive Table */}
                            <div className="overflow-x-auto">
                                <table className="slate-table w-full text-xs">
                                    <thead>
                                        <tr>
                                            <th className="p-3 text-center w-10">#</th>
                                            <th className="p-3 font-bold">رقم الأوردر</th>
                                            <th className="p-3 font-bold">العميل</th>
                                            <th className="p-3 text-center font-bold">الكمية</th>
                                            <th className="p-3 text-center font-bold text-blue-400">أنشئ بواسطة</th>
                                            <th className="p-3 text-center font-bold text-slate-300">تاريخ الفتح</th>
                                            {PRODUCTION_STAGES.map((stg) => (
                                                <th key={stg} className="p-3 text-center font-bold">
                                                    {stg}
                                                </th>
                                            ))}
                                            <th className="p-3 text-center font-bold">الحالة</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {comprehensiveData.map((o, idx) => (
                                            <tr key={o.id || idx} className="hover:bg-slate-800/40">
                                                <td className="p-3 text-slate-500 font-mono text-center">{idx + 1}</td>
                                                <td className="p-3 font-bold text-white font-mono">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span>{o.order_number}</span>
                                                        {o.is_external && (
                                                            <span className="badge-clean text-[9px] font-bold" style={{ background: 'rgba(6,182,212,0.18)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.35)' }}>
                                                                خارجي
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-slate-300">{o.customer_name || '-'}</td>
                                                <td className="p-3 text-center font-mono font-bold" style={{ color: o.is_external ? '#22d3ee' : '#fbbf24' }}>
                                                    {(o.target_quantity || 0).toLocaleString('en-US')}
                                                </td>
                                                <td className="p-3 text-center text-blue-300 font-mono text-xs">
                                                    {isAdmin ? (o.created_by || 'إدارة النظام') : '—'}
                                                </td>
                                                <td className="p-3 text-center text-slate-300 font-mono text-[10px]" title={o.created_at}>
                                                    {formatDate(o.created_at)}
                                                </td>
                                                {o.is_external ? (
                                                    <td colSpan={PRODUCTION_STAGES.length} className="p-3 text-center">
                                                        <div className="inline-flex items-center gap-2 bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 px-3 py-1.5 rounded-lg font-mono text-xs">
                                                            <span className="bg-cyan-500 text-slate-950 font-bold px-2 py-0.5 rounded text-[10px]">
                                                                🏭 أمر تشغيل خارجي
                                                            </span>
                                                            <span className="font-sans text-slate-300 font-medium">({o.external_operation || 'تشغيل خارجي'}):</span>
                                                            <span className="font-bold text-white">{(o.scanned_quantity || 0).toLocaleString('en-US')}</span>
                                                            <span className="text-slate-400">/ {(o.target_quantity || 0).toLocaleString('en-US')} ممسوح</span>
                                                            <span className="text-cyan-400 font-bold">({o.overall_completion_rate || 0}%)</span>
                                                        </div>
                                                    </td>
                                                ) : (
                                                    PRODUCTION_STAGES.map((stgName) => {
                                                        const s = (o.stages || []).find((x) => x.stage_name === stgName);
                                                        const sQty = s ? Number(s.scanned_quantity) : 0;
                                                        const tQty = Number(o.target_quantity) || 1;
                                                        const pct = Math.min(100, Math.round((sQty / tQty) * 100));

                                                        return (
                                                            <td key={stgName} className="p-3 text-center font-mono" title={s?.scanners_list ? `المشغل: ${s.scanners_list}\nأول مسح: ${formatDate(s.first_scan)}\nآخر مسح: ${formatDate(s.last_scan)}` : 'لم تبدأ بعد'}>
                                                                <div className="font-bold text-slate-200">
                                                                    {sQty.toLocaleString('en-US')}
                                                                </div>
                                                                <div className="text-[10px] text-slate-400">{pct}%</div>
                                                                {s?.scanners_list && (
                                                                    <div className="text-[9px] text-blue-300 truncate max-w-[80px] mx-auto mt-0.5 font-sans" title={s.scanners_list}>
                                                                        👤 {s.scanners_list}
                                                                    </div>
                                                                )}
                                                            </td>
                                                        );
                                                    })
                                                )}
                                                <td className="p-3 text-center">
                                                    {o.status === 'closed' ? (
                                                        <span className="badge-clean badge-green text-[10px]">مكتمل</span>
                                                    ) : o.is_external ? (
                                                        <span className="badge-clean text-[10px] font-bold" style={{ background: 'rgba(6,182,212,0.15)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.3)' }}>
                                                            قيد التشغيل
                                                        </span>
                                                    ) : (
                                                        <span className="badge-clean badge-amber text-[10px]">جارٍ</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Official Print Audit Block */}
                            <div className="mt-6 p-4 rounded-xl border border-slate-700/60 bg-[#0a1120] flex flex-wrap justify-between items-center gap-4 text-xs">
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-400 font-medium">مستخرج التقرير:</span>
                                    <span className="text-sky-400 font-bold font-mono">{user?.name || user?.username || 'مدير النظام'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-400 font-medium">تاريخ الاستخراج:</span>
                                    <span className="text-slate-300 font-mono">{compReportTimestamp}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-400 font-medium">النظام:</span>
                                    <span className="text-emerald-400 font-semibold font-mono">{companyName || 'HMS Group'} · Automated Auditing Engine</span>
                                </div>
                            </div>
                        </div>

                        {/* Report Footer */}
                        <div className="border-t border-slate-700/60 p-4 bg-[#0a1120] flex justify-between items-center flex-shrink-0 flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => printComprehensiveReportWindow({
                                        orders: comprehensiveData,
                                        timestamp: compReportTimestamp,
                                        stagesList: PRODUCTION_STAGES,
                                        printedBy: user
                                    }, 'print')}
                                    className="btn-slate btn-slate-primary text-xs py-2 px-4 shadow-lg shadow-sky-500/20"
                                    title="طباعة التقرير الشامل مباشرة"
                                >
                                    <i className="fas fa-print"></i> طباعة التقرير الشامل (A4)
                                </button>
                                <button
                                    onClick={() => printComprehensiveReportWindow({
                                        orders: comprehensiveData,
                                        timestamp: compReportTimestamp,
                                        stagesList: PRODUCTION_STAGES,
                                        printedBy: user
                                    }, 'pdf')}
                                    className="btn-slate bg-sky-600 hover:bg-sky-500 text-white text-xs py-2 px-4 shadow-lg shadow-sky-600/25 border border-sky-400/40"
                                    title="تنزيل التقرير الشامل كملف PDF وحفظه بالجهاز"
                                >
                                    <i className="fas fa-file-pdf"></i> تحميل التقرير الشامل PDF
                                </button>
                            </div>
                            <button
                                onClick={() => setComprehensiveModalOpen(false)}
                                className="btn-slate btn-slate-secondary text-xs py-2 px-4"
                            >
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

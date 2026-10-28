import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../services/api';

export default function DashboardPage() {
    const { user, companyName, canCreateOrders, isFactoryOwner } = useAuth();
    const { toast } = useToast();
    const { t, translateStage, isRTL, language } = useLanguage();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [overviewData, setOverviewData] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [selectedStageName, setSelectedStageName] = useState('ALL');
    const [orderSearchQuery, setOrderSearchQuery] = useState('');
    const [activeFilterTab, setActiveFilterTab] = useState('all'); // all, active, critical, completed

    const loadDashboardData = async (isManual = false) => {
        if (isManual) setRefreshing(true);
        else if (!overviewData) setLoading(true);

        const { ok, data } = await api.getDashboardOverview();
        if (ok && data.success) {
            setOverviewData(data);
            setLastUpdated(new Date());
        } else {
            const statsRes = await api.getStats();
            if (statsRes.ok && statsRes.data.success) {
                setOverviewData({
                    summary: statsRes.data.stats,
                    stages_distribution: [],
                    top_scanners: [],
                    live_activity: [],
                    priority_orders: []
                });
                setLastUpdated(new Date());
            } else {
                toast(t('common.error'), 'error');
            }
        }
        setLoading(false);
        setRefreshing(false);
    };

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        loadDashboardData();
        const interval = setInterval(() => loadDashboardData(false), 20000);
        return () => clearInterval(interval);
    }, [user]);

    const isArabic = language === 'ar';

    const summary = overviewData?.summary || {};
    const stages = overviewData?.stages_distribution || [];
    const topScanners = overviewData?.top_scanners || [];
    const liveActivity = overviewData?.live_activity || [];
    const priorityOrders = overviewData?.priority_orders || [];

    // Core Metrics
    const totalOrders = (summary.factory_orders || 0) + (summary.external_orders || 0);
    const activeOrders = (summary.factory_active_orders || 0) + (summary.external_active_orders || 0);
    const closedOrders = Math.max(0, totalOrders - activeOrders);
    const totalScans = (summary.factory_scans || 0) + (summary.external_scans || 0);
    const totalPieces = Number(summary.total_target_pieces || 0);
    const totalScannedPieces = stages.reduce((acc, s) => acc + (Number(s.total_scanned) || 0), 0);
    const factoryPacePct = totalPieces > 0 ? Math.min(100, Math.round((totalScannedPieces / totalPieces) * 100)) : 0;
    const completionRate = totalOrders > 0 ? Math.round((closedOrders / totalOrders) * 100) : 0;

    // Factory Floor Health: Find any Bottlenecks
    const bottleneckStage = useMemo(() => {
        if (!stages.length) return null;
        let slowest = stages[0];
        let minRatio = 999999;
        stages.forEach(stg => {
            const scanned = Number(stg.total_scanned) || 0;
            const target = Number(stg.total_target) || 1;
            const ratio = scanned / target;
            if (ratio < minRatio && stg.active_orders_count > 0) {
                minRatio = ratio;
                slowest = stg;
            }
        });
        return slowest;
    }, [stages]);

    // Filtered orders list
    const filteredOrders = useMemo(() => {
        return priorityOrders.filter(ord => {
            const matchesSearch = !orderSearchQuery || 
                (ord.order_number && ord.order_number.toLowerCase().includes(orderSearchQuery.toLowerCase())) ||
                (ord.customer_name && ord.customer_name.toLowerCase().includes(orderSearchQuery.toLowerCase()));
            
            if (!matchesSearch) return false;

            const pct = ord.completion_rate || 0;
            if (activeFilterTab === 'active') return pct < 100;
            if (activeFilterTab === 'critical') return pct < 40 && pct > 0;
            if (activeFilterTab === 'completed') return pct >= 100;
            return true;
        });
    }, [priorityOrders, orderSearchQuery, activeFilterTab]);

    return (
        <div className="min-h-screen flex flex-col bg-[#050811] text-slate-100 antialiased selection:bg-sky-500/30 selection:text-white font-sans">
            <Header
                title={t('dashboard.title')}
                subtitle={`${companyName} | ${t('common.app_tagline')}`}
                badgeText={isFactoryOwner ? (isArabic ? 'غرفة عمليات المالك' : 'OWNER COCKPIT') : 'MES SMART FLOOR'}
                activePage="dashboard"
            />

            <main className="flex-1 p-3.5 sm:p-5 max-w-[1520px] w-full mx-auto space-y-4">

                {/* ═══════════════════════════════════════════════════════════
                    1. TOP EXECUTIVE TELEMETRY STRIP (5 High-Density Panels)
                   ═══════════════════════════════════════════════════════════ */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">

                    {/* Telemetry 1: Factory Pulse / OEE Speed */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0c182e] to-[#070d1a] border border-sky-500/30 p-4 shadow-xl">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10.5px] uppercase font-bold tracking-wider text-slate-400">
                                {isArabic ? 'نبض المصنع والتشغيل' : 'Factory Floor Pulse'}
                            </span>
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#10b981]"></span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black font-mono text-white tracking-tight">
                                {loading ? '...' : `${factoryPacePct}%`}
                            </span>
                            <span className="text-[10px] text-emerald-400 font-bold font-mono">
                                {isArabic ? 'إنجاز شامل' : 'Throughput'}
                            </span>
                        </div>
                        <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-3 border border-slate-800">
                            <div 
                                className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400"
                                style={{ width: `${factoryPacePct}%` }}
                            ></div>
                        </div>
                        <div className="mt-2 text-[9.5px] text-slate-500 flex justify-between font-mono">
                            <span>{totalScannedPieces.toLocaleString('en-US')} {isArabic ? 'ممسوح' : 'done'}</span>
                            <span>{totalPieces.toLocaleString('en-US')} {isArabic ? 'مطلوب' : 'target'}</span>
                        </div>
                    </div>

                    {/* Telemetry 2: Orders Fleet Status */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0c182e] to-[#070d1a] border border-slate-800 p-4 shadow-xl">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10.5px] uppercase font-bold tracking-wider text-slate-400">
                                {isArabic ? 'أسطول الأوردرات' : 'Orders Fleet'}
                            </span>
                            <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                {activeOrders} {isArabic ? 'جاري' : 'live'}
                            </span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black font-mono text-amber-400 tracking-tight">
                                {loading ? '...' : totalOrders.toLocaleString('en-US')}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                                {isArabic ? 'أمر تشغيل' : 'Total Orders'}
                            </span>
                        </div>
                        <div className="mt-3.5 flex items-center justify-between text-[10px] font-mono border-t border-slate-800/80 pt-2 text-slate-400">
                            <span>{isArabic ? 'داخلي:' : 'In:'} <strong className="text-sky-300">{summary.factory_orders || 0}</strong></span>
                            <span>{isArabic ? 'خارجي:' : 'Ext:'} <strong className="text-cyan-300">{summary.external_orders || 0}</strong></span>
                            <span>{isArabic ? 'مغلق:' : 'Done:'} <strong className="text-emerald-400">{closedOrders}</strong></span>
                        </div>
                    </div>

                    {/* Telemetry 3: Verified Barcode Lasers */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0c182e] to-[#070d1a] border border-slate-800 p-4 shadow-xl">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10.5px] uppercase font-bold tracking-wider text-slate-400">
                                {isArabic ? 'مسحات الباركود المؤكدة' : 'Verified Scans'}
                            </span>
                            <i className="fas fa-barcode text-emerald-400 text-xs"></i>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black font-mono text-emerald-400 tracking-tight">
                                {loading ? '...' : totalScans.toLocaleString('en-US')}
                            </span>
                            <span className="text-[10px] text-emerald-500/80 font-mono font-bold">100% OK</span>
                        </div>
                        <div className="mt-3.5 flex items-center justify-between text-[10px] font-mono border-t border-slate-800/80 pt-2 text-slate-400">
                            <span>{isArabic ? 'صالة المصنع:' : 'Floor:'} <strong className="text-white">{summary.factory_total_scans || 0}</strong></span>
                            <span>{isArabic ? 'مغاسل وموردين:' : 'Ext:'} <strong className="text-white">{summary.external_total_scans || 0}</strong></span>
                        </div>
                    </div>

                    {/* Telemetry 4: Factory Completion Rate */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0c182e] to-[#070d1a] border border-slate-800 p-4 shadow-xl">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10.5px] uppercase font-bold tracking-wider text-slate-400">
                                {isArabic ? 'معدل تسليم الأوردرات' : 'Fulfillment Rate'}
                            </span>
                            <i className="fas fa-circle-check text-cyan-400 text-xs"></i>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black font-mono text-cyan-400 tracking-tight">
                                {loading ? '...' : `${completionRate}%`}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                                {closedOrders} / {totalOrders}
                            </span>
                        </div>
                        <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-3 border border-slate-800">
                            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${completionRate}%` }}></div>
                        </div>
                        <div className="mt-2 text-[9.5px] text-slate-400 flex justify-between font-mono">
                            <span>{isArabic ? 'أوردرات جاهزة للتسليم' : 'Completed Batches'}</span>
                            <span className="text-cyan-300 font-bold">{closedOrders}</span>
                        </div>
                    </div>

                    {/* Telemetry 5: Active Floor Health / Alert Radar */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0c182e] to-[#070d1a] border border-slate-800 p-4 shadow-xl col-span-2 sm:col-span-1">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10.5px] uppercase font-bold tracking-wider text-slate-400">
                                {isArabic ? 'مؤشر عنق الزجاجة' : 'Floor Health & Alert'}
                            </span>
                            <i className={`fas fa-triangle-exclamation ${bottleneckStage ? 'text-amber-400' : 'text-emerald-400'} text-xs`}></i>
                        </div>
                        {bottleneckStage ? (
                            <div>
                                <div className="text-sm font-bold text-amber-300 truncate font-mono">
                                    {translateStage(bottleneckStage.stage_name)}
                                </div>
                                <div className="text-[10.5px] text-slate-400 mt-0.5">
                                    {isArabic ? 'المرحلة الأكثر حاجة لتكثيف العمل' : 'Needs attention to prevent bottleneck'}
                                </div>
                                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
                                    <span>{isArabic ? 'أوردرات عالقة:' : 'Orders in queue:'}</span>
                                    <strong className="text-amber-400">{bottleneckStage.active_orders_count}</strong>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="text-sm font-bold text-emerald-400">
                                    {isArabic ? 'مسار الإنتاج متزن ومثالي' : 'Smooth Production Flow'}
                                </div>
                                <div className="text-[10.5px] text-slate-400 mt-0.5">
                                    {isArabic ? 'كافة المراحل تعمل بتدفق سلس' : 'Zero bottlenecks detected'}
                                </div>
                                <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-emerald-400">
                                    ✓ OPTIMAL SPEED
                                </div>
                            </div>
                        )}
                    </div>

                </div>

                {/* ═══════════════════════════════════════════════════════════
                    2. MAIN INNOVATIVE SECTION: SHOP-FLOOR PRODUCTION PIPELINE
                    (Visual Stage Conveyor with Connected Flow Nodes)
                   ═══════════════════════════════════════════════════════════ */}
                <div className="rounded-2xl bg-[#090f1e] border border-slate-800/90 p-4 sm:p-5 shadow-2xl">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-800">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-500 flex items-center justify-center text-white text-sm shadow-md shadow-sky-500/20">
                                <i className="fas fa-network-wired"></i>
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-sm sm:text-base font-black text-white tracking-wide">
                                        {isArabic ? 'خريطة مسار صالة الإنتاج المباشرة (Factory Conveyor Stream)' : 'Live Shop-Floor Stage Flow'}
                                    </h2>
                                    <span className="px-2 py-0.5 rounded text-[9.5px] font-mono font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                                        STAGE PIPELINE
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                    {isArabic 
                                        ? 'متابعة تدفق القطع خطوة بخطوة من بداية خط الإنتاج وحتى التغليف والتسليم النهائي' 
                                        : 'Sequential piece throughput across all active production stages'}
                                </p>
                            </div>
                        </div>

                        {/* Stage Selector Filter */}
                        <div className="flex items-center gap-2 self-end sm:self-auto">
                            <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                                {isArabic ? 'تركيز العرض:' : 'Filter Stage:'}
                            </span>
                            <select
                                value={selectedStageName}
                                onChange={(e) => setSelectedStageName(e.target.value)}
                                className="bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-200 px-3 py-1.5 font-medium cursor-pointer hover:border-sky-500/50 transition focus:outline-none focus:border-sky-400"
                            >
                                <option value="ALL">{isArabic ? '✨ كامل خط الإنتاج (الكل)' : '✨ All Stages'}</option>
                                {stages.map((stg) => (
                                    <option key={stg.stage_name} value={stg.stage_name}>
                                        {translateStage(stg.stage_name)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Stage Conveyor Track (Grid of Connected Interactive Stage Nodes) */}
                    {stages.length === 0 ? (
                        <div className="py-12 text-center text-slate-500 text-xs">
                            <i className="fas fa-industry text-3xl text-slate-700 mb-2 block"></i>
                            {t('dashboard.no_pipeline_data')}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                            {stages
                                .filter(s => selectedStageName === 'ALL' || s.stage_name === selectedStageName)
                                .map((stg, idx) => {
                                    const sQty = Number(stg.total_scanned) || 0;
                                    const tQty = Number(stg.total_target) || 1;
                                    const pct = tQty > 0 ? Math.min(100, Math.round((sQty / tQty) * 100)) : 0;
                                    const isComplete = pct >= 100;
                                    const isSlowest = bottleneckStage && bottleneckStage.stage_name === stg.stage_name;

                                    return (
                                        <div
                                            key={stg.stage_name || idx}
                                            className={`relative flex flex-col justify-between rounded-xl p-3.5 transition-all duration-200 border ${
                                                isComplete 
                                                    ? 'bg-gradient-to-b from-emerald-950/20 to-slate-900/90 border-emerald-500/30' 
                                                    : isSlowest
                                                    ? 'bg-gradient-to-b from-amber-950/20 to-slate-900/90 border-amber-500/40 shadow-lg shadow-amber-500/5'
                                                    : 'bg-slate-900/70 border-slate-800 hover:border-sky-500/40'
                                            }`}
                                        >
                                            {/* Stage Step Number Pill */}
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`w-5 h-5 rounded-md flex items-center justify-center font-mono text-[10px] font-black ${
                                                        isComplete 
                                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                                            : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                                                    }`}>
                                                        {idx + 1}
                                                    </span>
                                                    <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">
                                                        {isArabic ? `المرحلة ${idx + 1}` : `Phase ${idx + 1}`}
                                                    </span>
                                                </div>
                                                <span className={`text-[11px] font-black font-mono ${
                                                    isComplete ? 'text-emerald-400' : isSlowest ? 'text-amber-400' : 'text-sky-400'
                                                }`}>
                                                    {pct}%
                                                </span>
                                            </div>

                                            {/* Stage Name */}
                                            <div className="mb-3">
                                                <h3 className="text-xs font-bold text-white truncate" title={stg.stage_name}>
                                                    {translateStage(stg.stage_name)}
                                                </h3>
                                                <span className="text-[9.5px] font-mono text-slate-400 mt-0.5 block">
                                                    {stg.active_orders_count > 0 
                                                        ? `${stg.active_orders_count} ${isArabic ? 'أوردر نشط' : 'orders queue'}` 
                                                        : (isArabic ? 'خامل حالياً' : 'Idle')}
                                                </span>
                                            </div>

                                            {/* Visual Progress Bar */}
                                            <div className="w-full bg-[#060a14] rounded-full h-2 overflow-hidden border border-slate-800 mb-2.5">
                                                <div
                                                    className="h-full rounded-full transition-all duration-500"
                                                    style={{
                                                        width: `${pct}%`,
                                                        background: isComplete
                                                            ? 'linear-gradient(90deg, #10b981, #34d399)'
                                                            : isSlowest
                                                            ? 'linear-gradient(90deg, #d97706, #fbbf24)'
                                                            : 'linear-gradient(90deg, #0284c7, #38bdf8)'
                                                    }}
                                                ></div>
                                            </div>

                                            {/* Quantity Counter */}
                                            <div className="flex items-center justify-between text-[10px] font-mono pt-2 border-t border-slate-800/80 text-slate-400">
                                                <span>{isArabic ? 'ممسوح:' : 'Done:'} <strong className="text-emerald-400">{sQty.toLocaleString('en-US')}</strong></span>
                                                <span>{isArabic ? 'مستهدف:' : 'Goal:'} <strong className="text-slate-300">{tQty > 1 ? tQty.toLocaleString('en-US') : '—'}</strong></span>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>

                {/* ═══════════════════════════════════════════════════════════
                    3. SPLIT WORKSTATION:
                    - Left (70%): Live Orders Audit Board with Tabs & Search
                    - Right (30%): Operator Rankings & Live Barcode Laser Stream
                   ═══════════════════════════════════════════════════════════ */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                    {/* ── Left Column: Live Orders Matrix (8 cols) ── */}
                    <div className="lg:col-span-8 rounded-2xl bg-[#090f1e] border border-slate-800 p-4 sm:p-5 shadow-xl flex flex-col justify-between">
                        <div>
                            {/* Header with Search and Filter Tabs */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-800">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 text-xs">
                                        <i className="fas fa-layer-group"></i>
                                    </div>
                                    <div>
                                        <h3 className="text-xs sm:text-sm font-bold text-white">
                                            {isArabic ? 'لوحة تدقيق ومتابعة الأوردرات الجارية' : 'Active Production Orders Fleet'}
                                        </h3>
                                        <p className="text-[10px] text-slate-400">
                                            {isArabic ? 'مراقبة فورية لمراحل كل أوردر ومقارنة الممسوح بالمستهدف' : 'Live progress inspection by work order'}
                                        </p>
                                    </div>
                                </div>

                                {/* Filter Tabs */}
                                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-[10.5px] font-medium">
                                    <button
                                        onClick={() => setActiveFilterTab('all')}
                                        className={`px-2.5 py-1 rounded-lg transition ${activeFilterTab === 'all' ? 'bg-sky-500 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        {isArabic ? 'الكل' : 'All'} ({priorityOrders.length})
                                    </button>
                                    <button
                                        onClick={() => setActiveFilterTab('active')}
                                        className={`px-2.5 py-1 rounded-lg transition ${activeFilterTab === 'active' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        {isArabic ? 'قيد العمل' : 'Active'}
                                    </button>
                                    <button
                                        onClick={() => setActiveFilterTab('critical')}
                                        className={`px-2.5 py-1 rounded-lg transition ${activeFilterTab === 'critical' ? 'bg-rose-500 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        {isArabic ? 'متأخر (<40%)' : 'Needs Push'}
                                    </button>
                                </div>
                            </div>

                            {/* Quick Search inside Orders */}
                            <div className="mb-3">
                                <div className="relative">
                                    <i className={`fas fa-magnifying-glass absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-500 text-xs`}></i>
                                    <input
                                        type="text"
                                        value={orderSearchQuery}
                                        onChange={(e) => setOrderSearchQuery(e.target.value)}
                                        placeholder={isArabic ? 'بحث سريع برقم الأوردر أو اسم العميل...' : 'Filter by order number or customer...'}
                                        className={`w-full bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-white ${isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'} py-2 focus:outline-none focus:border-sky-500 transition`}
                                    />
                                </div>
                            </div>

                            {/* Filtered Orders Table / Cards */}
                            {filteredOrders.length === 0 ? (
                                <div className="py-12 text-center text-slate-500 text-xs">
                                    <i className="fas fa-boxes-packing text-2xl text-slate-700 mb-2 block"></i>
                                    {isArabic ? 'لا توجد أوردرات مطابقة للبحث' : 'No matching orders found'}
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                                    {filteredOrders.map((ord) => {
                                        const pct = ord.completion_rate || 0;
                                        const isFinished = pct >= 100;
                                        const isCritical = pct < 40 && pct > 0;

                                        return (
                                            <div
                                                key={ord.id}
                                                className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 hover:border-slate-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <span className="font-mono text-xs font-black text-white bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 flex-shrink-0">
                                                        {ord.order_number}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-bold text-white truncate">
                                                            {ord.customer_name || (isArabic ? 'عميل عام' : 'Standard Client')}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 font-mono">
                                                            {(ord.target_quantity || 0).toLocaleString('en-US')} {t('common.pieces')}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Mini progress bar & percentage */}
                                                <div className="flex items-center gap-3 w-full sm:w-64">
                                                    <div className="flex-1">
                                                        <div className="w-full bg-[#060a14] rounded-full h-2 overflow-hidden border border-slate-800">
                                                            <div
                                                                className="h-full rounded-full transition-all duration-500"
                                                                style={{
                                                                    width: `${pct}%`,
                                                                    background: isFinished 
                                                                        ? '#10b981' 
                                                                        : isCritical 
                                                                        ? 'linear-gradient(90deg, #ef4444, #f97316)' 
                                                                        : 'linear-gradient(90deg, #0284c7, #38bdf8)'
                                                                }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                    <span className={`text-xs font-black font-mono flex-shrink-0 ${
                                                        isFinished ? 'text-emerald-400' : isCritical ? 'text-rose-400' : 'text-sky-400'
                                                    }`}>
                                                        {pct}%
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Bottom Link to Full Table */}
                        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                            <span>
                                {isArabic ? 'المعروض حالياً:' : 'Showing:'}{' '}
                                <strong className="text-white">{filteredOrders.length}</strong> {isArabic ? 'من' : 'of'}{' '}
                                <strong className="text-amber-400">{priorityOrders.length}</strong> {isArabic ? 'أوردر' : 'orders'}
                            </span>
                            <Link to="/orders" className="text-sky-400 hover:text-sky-300 flex items-center gap-1 font-sans font-medium">
                                <span>{isArabic ? 'فتح جدول الأوردرات والتفاصيل الشاملة' : 'View Full Tracking Log'}</span>
                                <i className={`fas fa-arrow-${isRTL ? 'left' : 'right'} text-[10px]`}></i>
                            </Link>
                        </div>
                    </div>

                    {/* ── Right Column: Top Scanners & Live Ticker (4 cols) ── */}
                    <div className="lg:col-span-4 space-y-4">

                        {/* Operators Leaderboard */}
                        <div className="rounded-2xl bg-[#090f1e] border border-slate-800 p-4 shadow-xl">
                            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800">
                                <div className="flex items-center gap-2">
                                    <i className="fas fa-trophy text-amber-400 text-xs"></i>
                                    <h3 className="text-xs sm:text-sm font-bold text-white">
                                        {isArabic ? 'إنتاجية العمال والمشغلين اليوم' : 'Daily Operator Output'}
                                    </h3>
                                </div>
                                <span className="text-[9.5px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                    TOP 6
                                </span>
                            </div>

                            {topScanners.length === 0 ? (
                                <div className="py-6 text-center text-slate-500 text-xs">
                                    <i className="fas fa-user-clock text-2xl text-slate-700 mb-1 block"></i>
                                    {t('dashboard.no_scanners_data')}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {topScanners.slice(0, 5).map((sc, idx) => {
                                        const medals = ['text-amber-400', 'text-slate-300', 'text-amber-600'];
                                        const isTop3 = idx < 3;
                                        return (
                                            <div
                                                key={sc.scanned_by || idx}
                                                className="p-2 rounded-xl bg-slate-900/50 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between gap-2.5 text-xs transition"
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className={`w-5 h-5 rounded-md flex items-center justify-center font-mono text-[10px] font-black flex-shrink-0 ${
                                                        isTop3 ? 'bg-amber-500/15 border border-amber-500/30 ' + medals[idx] : 'bg-slate-800 text-slate-400 border border-slate-700'
                                                    }`}>
                                                        {idx + 1}
                                                    </span>
                                                    <span className="font-bold text-white truncate">
                                                        {sc.scanned_by}
                                                    </span>
                                                </div>

                                                <div className="font-mono text-right flex-shrink-0">
                                                    <span className="text-xs font-black text-emerald-400 block">
                                                        {Number(sc.scan_count || 0).toLocaleString('en-US')}
                                                    </span>
                                                    <span className="text-[8.5px] text-slate-500">{isArabic ? 'قطعة' : 'pcs'}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Live Feed Ticker */}
                        <div className="rounded-2xl bg-[#090f1e] border border-slate-800 p-4 shadow-xl">
                            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                                    <h3 className="text-xs sm:text-sm font-bold text-white">
                                        {isArabic ? 'نبض الباركود الحي (Live Stream)' : 'Realtime Scan Feed'}
                                    </h3>
                                </div>
                                <span className="text-[9.5px] font-mono text-emerald-400">LIVE</span>
                            </div>

                            <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
                                {liveActivity.length === 0 ? (
                                    <div className="py-6 text-center text-slate-500 text-xs">
                                        {t('dashboard.no_live_data')}
                                    </div>
                                ) : (
                                    liveActivity.slice(0, 7).map((act, i) => (
                                        <div
                                            key={act.id || i}
                                            className="p-1.5 px-2 rounded-lg bg-slate-900/60 border border-slate-800/70 hover:border-slate-700 flex items-center justify-between text-[10.5px] transition"
                                        >
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${act.source_type === 'external' ? 'bg-cyan-400' : 'bg-sky-400'}`}></span>
                                                <span className="font-mono font-bold text-white tracking-wider text-[10.5px] truncate">
                                                    {act.barcode}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1.5 font-mono text-[9.5px] flex-shrink-0">
                                                <span className="text-sky-300 bg-sky-950/60 px-1.5 py-0.2 rounded border border-sky-500/20">
                                                    {translateStage(act.stage_name)}
                                                </span>
                                                <span className="text-slate-500">
                                                    {act.created_at ? new Date(act.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                    </div>

                </div>

            </main>
        </div>
    );
}

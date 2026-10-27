import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../services/api';

export default function DashboardPage() {
    const { user, companyName, canCreateOrders, canManageUsers } = useAuth();
    const { toast } = useToast();
    const { t, translateStage, isRTL, language } = useLanguage();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [overviewData, setOverviewData] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

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

    const summary = overviewData?.summary || {};
    const stages = overviewData?.stages_distribution || [];
    const topScanners = overviewData?.top_scanners || [];
    const liveActivity = overviewData?.live_activity || [];
    const priorityOrders = overviewData?.priority_orders || [];

    const totalOrders = (summary.factory_orders || 0) + (summary.external_orders || 0);
    const activeOrders = (summary.factory_active_orders || 0) + (summary.external_active_orders || 0);
    const closedOrders = Math.max(0, totalOrders - activeOrders);
    const totalScans = (summary.factory_scans || 0) + (summary.external_scans || 0);
    const completionRate = totalOrders > 0 ? Math.round((closedOrders / totalOrders) * 100) : 0;
    const totalPieces = Number(summary.total_target_pieces || 0);

    const isArabic = language === 'ar';

    return (
        <div className="min-h-screen flex flex-col bg-[#060a12] text-slate-100 antialiased selection:bg-sky-500/30 selection:text-white">
            <Header
                title={t('dashboard.title')}
                subtitle={`${companyName} | ${t('common.app_tagline')}`}
                badgeText="EXECUTIVE COMMAND"
                activePage="dashboard"
            />

            <main className="flex-1 p-3.5 sm:p-5 max-w-[1400px] w-full mx-auto space-y-4">

                {/* ── Top Executive Hero Bar ── */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0d1627] via-[#091122] to-[#070d1a] border border-slate-700/50 p-4 sm:p-5 shadow-2xl backdrop-blur-md">
                    {/* Background Subtle Ambient Glow */}
                    <div className="absolute -top-16 -right-16 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none"></div>
                    <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

                    <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-600 to-cyan-400 p-[1px] shadow-lg shadow-sky-500/20">
                                <div className="w-full h-full bg-[#080e1c] rounded-2xl flex items-center justify-center">
                                    <i className="fas fa-industry text-lg bg-gradient-to-r from-sky-400 to-cyan-300 bg-clip-text text-transparent"></i>
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center gap-2.5">
                                    <h1 className="text-base sm:text-lg font-black text-white tracking-wide">
                                        {isArabic ? 'مركز القيادة والرقابة التنفيذي' : 'Factory Command Center'}
                                    </h1>
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                        LIVE 24/7
                                    </span>
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {isArabic
                                        ? `مرحباً ${user?.fullname || user?.username}، نظرة موحدة وشاملة على خطوط التشغيل ونسب الإنجاز فورياً`
                                        : `Welcome ${user?.fullname || user?.username}, Real-time factory overview and production metrics`}
                                </p>
                            </div>
                        </div>

                        {/* Top Right Quick Metrics & Refresh */}
                        <div className="flex items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
                            <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700/60 shadow-inner">
                                <div className="flex flex-col text-right">
                                    <span className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">
                                        {isArabic ? 'آخر تحديث' : 'Last Sync'}
                                    </span>
                                    <span className="font-mono text-xs font-bold text-sky-400">
                                        {lastUpdated ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
                                    </span>
                                </div>
                                <div className="h-6 w-px bg-slate-700/80"></div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">
                                        {isArabic ? 'مراحل التشغيل' : 'Stages'}
                                    </span>
                                    <span className="font-mono text-xs font-bold text-white">
                                        {summary.active_stages_count || stages.length || 6} {isArabic ? 'مرحلة' : 'active'}
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={() => loadDashboardData(true)}
                                disabled={refreshing}
                                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600/70 text-slate-200 hover:text-white transition flex items-center gap-1.5 text-xs font-medium cursor-pointer shadow-sm active:scale-95"
                                title={t('common.refresh')}
                            >
                                <i className={`fas fa-rotate text-xs ${refreshing ? 'fa-spin text-sky-400' : 'text-slate-400'}`}></i>
                                <span className="hidden sm:inline">{t('common.refresh')}</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── 5 Key Performance Cards (Industrial Glass Style) ── */}
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {/* KPI 1: Orders */}
                    <div className="relative group overflow-hidden rounded-2xl bg-gradient-to-b from-[#0e172a] to-[#090f1e] p-4 border border-sky-500/20 hover:border-sky-500/40 transition-all duration-300 shadow-lg">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[11px] font-bold text-slate-300">
                                {t('dashboard.kpi_total_orders')}
                            </span>
                            <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center border border-sky-500/20 text-xs">
                                <i className="fas fa-boxes-stacked"></i>
                            </div>
                        </div>
                        <div className="text-2xl font-black font-mono text-white tracking-tight">
                            {loading ? <span className="inline-block w-12 h-6 bg-slate-800 rounded animate-pulse" /> : totalOrders.toLocaleString('en-US')}
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                            <span>{isArabic ? 'داخلي:' : 'In:'} <strong className="text-sky-300">{summary.factory_orders || 0}</strong></span>
                            <span>{isArabic ? 'خارجي:' : 'Ext:'} <strong className="text-cyan-300">{summary.external_orders || 0}</strong></span>
                        </div>
                    </div>

                    {/* KPI 2: Active */}
                    <div className="relative group overflow-hidden rounded-2xl bg-gradient-to-b from-[#0e172a] to-[#090f1e] p-4 border border-amber-500/20 hover:border-amber-500/40 transition-all duration-300 shadow-lg">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[11px] font-bold text-slate-300">
                                {t('dashboard.kpi_active_orders')}
                            </span>
                            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 text-xs">
                                <i className="fas fa-bolt"></i>
                            </div>
                        </div>
                        <div className="text-2xl font-black font-mono text-amber-400 tracking-tight">
                            {loading ? <span className="inline-block w-12 h-6 bg-slate-800 rounded animate-pulse" /> : activeOrders.toLocaleString('en-US')}
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                            <span>{isArabic ? 'قيد العمل بالمصنع' : 'In production'}</span>
                            <span className="text-emerald-400 font-bold">{closedOrders} {isArabic ? 'مغلق' : 'closed'}</span>
                        </div>
                    </div>

                    {/* KPI 3: Scans */}
                    <div className="relative group overflow-hidden rounded-2xl bg-gradient-to-b from-[#0e172a] to-[#090f1e] p-4 border border-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300 shadow-lg">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[11px] font-bold text-slate-300">
                                {t('dashboard.kpi_total_scans')}
                            </span>
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 text-xs">
                                <i className="fas fa-barcode"></i>
                            </div>
                        </div>
                        <div className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
                            {loading ? <span className="inline-block w-12 h-6 bg-slate-800 rounded animate-pulse" /> : totalScans.toLocaleString('en-US')}
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                            <span>{isArabic ? 'مسحات الليزر المؤكدة' : 'Verified scans'}</span>
                            <span className="text-emerald-400 font-bold">100%</span>
                        </div>
                    </div>

                    {/* KPI 4: Completion Rate */}
                    <div className="relative group overflow-hidden rounded-2xl bg-gradient-to-b from-[#0e172a] to-[#090f1e] p-4 border border-cyan-500/20 hover:border-cyan-500/40 transition-all duration-300 shadow-lg">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[11px] font-bold text-slate-300">
                                {t('dashboard.kpi_completion_rate')}
                            </span>
                            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20 text-xs">
                                <i className="fas fa-circle-check"></i>
                            </div>
                        </div>
                        <div className="text-2xl font-black font-mono text-cyan-400 tracking-tight">
                            {loading ? <span className="inline-block w-12 h-6 bg-slate-800 rounded animate-pulse" /> : `${completionRate}%`}
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                            <span>{closedOrders} {isArabic ? 'من' : 'of'} {totalOrders}</span>
                            <div className="w-14 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-cyan-400 h-full rounded-full" style={{ width: `${completionRate}%` }}></div>
                            </div>
                        </div>
                    </div>

                    {/* KPI 5: Total Target Pieces */}
                    <div className="relative group overflow-hidden rounded-2xl bg-gradient-to-b from-[#0e172a] to-[#090f1e] p-4 border border-violet-500/20 hover:border-violet-500/40 transition-all duration-300 shadow-lg col-span-2 sm:col-span-1">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[11px] font-bold text-slate-300">
                                {isArabic ? 'المستهدف الكلي للقطع' : 'Target Volume'}
                            </span>
                            <div className="w-7 h-7 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center border border-violet-500/20 text-xs">
                                <i className="fas fa-layer-group"></i>
                            </div>
                        </div>
                        <div className="text-2xl font-black font-mono text-violet-300 tracking-tight">
                            {loading ? <span className="inline-block w-12 h-6 bg-slate-800 rounded animate-pulse" /> : totalPieces.toLocaleString('en-US')}
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                            <span>{isArabic ? 'قطعة مطلوبة' : 'Pcs Required'}</span>
                            <span className="text-violet-400 font-bold">{isArabic ? 'شامل' : 'Total'}</span>
                        </div>
                    </div>
                </div>

                {/* ── Executive Quick Navigation Bar ── */}
                <div className="rounded-2xl bg-[#0b1220] border border-slate-800/90 p-3 shadow-md">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {canCreateOrders && (
                            <Link
                                to="/create-order"
                                className="group flex items-center justify-between p-3 rounded-xl bg-slate-900/90 hover:bg-sky-950/40 border border-slate-800 hover:border-sky-500/40 transition-all duration-200"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 group-hover:bg-sky-500 group-hover:text-white transition flex items-center justify-center text-xs">
                                        <i className="fas fa-plus"></i>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs font-bold text-white group-hover:text-sky-300 transition">
                                            {t('dashboard.card_create_order')}
                                        </div>
                                        <div className="text-[9.5px] text-slate-400">
                                            {isArabic ? 'توليد كود وتشغيل' : 'Open new work order'}
                                        </div>
                                    </div>
                                </div>
                                <i className={`fas fa-chevron-${isRTL ? 'left' : 'right'} text-slate-600 group-hover:text-sky-400 text-xs transition transform group-hover:translate-x-1`}></i>
                            </Link>
                        )}

                        <Link
                            to="/orders"
                            className="group flex items-center justify-between p-3 rounded-xl bg-slate-900/90 hover:bg-emerald-950/40 border border-slate-800 hover:border-emerald-500/40 transition-all duration-200"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition flex items-center justify-center text-xs">
                                    <i className="fas fa-table-list"></i>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs font-bold text-white group-hover:text-emerald-300 transition">
                                        {isArabic ? 'تتبع الأوردرات والتفاصيل' : 'Order Tracking'}
                                    </div>
                                    <div className="text-[9.5px] text-slate-400">
                                        {isArabic ? 'متابعة شاملة وجداول' : 'Audit logs & reports'}
                                    </div>
                                </div>
                            </div>
                            <i className={`fas fa-chevron-${isRTL ? 'left' : 'right'} text-slate-600 group-hover:text-emerald-400 text-xs transition transform group-hover:translate-x-1`}></i>
                        </Link>

                        <Link
                            to="/"
                            className="group flex items-center justify-between p-3 rounded-xl bg-slate-900/90 hover:bg-cyan-950/40 border border-slate-800 hover:border-cyan-500/40 transition-all duration-200"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500 group-hover:text-white transition flex items-center justify-center text-xs">
                                    <i className="fas fa-qrcode"></i>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs font-bold text-white group-hover:text-cyan-300 transition">
                                        {t('dashboard.card_scanner')}
                                    </div>
                                    <div className="text-[9.5px] text-slate-400">
                                        {isArabic ? 'مسح باركود العمال' : 'Production Barcode Scan'}
                                    </div>
                                </div>
                            </div>
                            <i className={`fas fa-chevron-${isRTL ? 'left' : 'right'} text-slate-600 group-hover:text-cyan-400 text-xs transition transform group-hover:translate-x-1`}></i>
                        </Link>

                        <a
                            href="/external_tracking.html"
                            className="group flex items-center justify-between p-3 rounded-xl bg-slate-900/90 hover:bg-indigo-950/40 border border-slate-800 hover:border-indigo-500/40 transition-all duration-200"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition flex items-center justify-center text-xs">
                                    <i className="fas fa-truck-moving"></i>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs font-bold text-white group-hover:text-indigo-300 transition">
                                        {t('dashboard.card_ext_tracking')}
                                    </div>
                                    <div className="text-[9.5px] text-slate-400">
                                        {isArabic ? 'المغاسل والموردين' : 'External Vendors & Suppliers'}
                                    </div>
                                </div>
                            </div>
                            <i className={`fas fa-chevron-${isRTL ? 'left' : 'right'} text-slate-600 group-hover:text-indigo-400 text-xs transition transform group-hover:translate-x-1`}></i>
                        </a>
                    </div>
                </div>

                {/* ── Main Production Matrix (2 Columns Layout) ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                    {/* Left/Main Column: Stages Flow + Active Priority Orders */}
                    <div className="lg:col-span-2 space-y-4">

                        {/* Production Pipeline Card */}
                        <div className="rounded-2xl bg-[#0b1220] border border-slate-800/90 p-4 sm:p-5 shadow-xl">
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center border border-sky-500/20 text-xs">
                                        <i className="fas fa-diagram-project"></i>
                                    </div>
                                    <div>
                                        <h3 className="text-xs sm:text-sm font-bold text-white">
                                            {t('dashboard.pipeline_title')}
                                        </h3>
                                        <p className="text-[10px] text-slate-400">
                                            {isArabic ? 'توزيع ونسب إنجاز المراحل خطوة بخطوة في صالة الإنتاج' : 'Stage-by-stage factory pipeline throughput'}
                                        </p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-1 rounded-lg text-[9.5px] font-mono font-bold bg-slate-900 border border-slate-700 text-slate-300">
                                    AUDIT
                                </span>
                            </div>

                            {stages.length === 0 ? (
                                <div className="py-8 text-center text-slate-500 text-xs">
                                    <i className="fas fa-layer-group text-2xl text-slate-700 mb-2 block"></i>
                                    {t('dashboard.no_pipeline_data')}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {stages.map((stg, i) => {
                                        const sQty = Number(stg.total_scanned) || 0;
                                        const tQty = Number(stg.total_target) || 1;
                                        const pct = tQty > 0 ? Math.min(100, Math.round((sQty / tQty) * 100)) : 0;
                                        const isFinished = pct >= 100;

                                        return (
                                            <div
                                                key={stg.stage_name || i}
                                                className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 hover:border-slate-700 transition"
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="w-5 h-5 rounded-md bg-sky-500/10 text-sky-400 font-mono text-[10px] font-bold flex items-center justify-center border border-sky-500/20 flex-shrink-0">
                                                            {i + 1}
                                                        </span>
                                                        <span className="text-xs font-bold text-white truncate">
                                                            {translateStage(stg.stage_name)}
                                                        </span>
                                                    </div>
                                                    <span className={`text-[10.5px] font-mono font-bold ${isFinished ? 'text-emerald-400' : 'text-sky-400'}`}>
                                                        {pct}%
                                                    </span>
                                                </div>

                                                <div className="w-full bg-[#070c18] rounded-full h-2 overflow-hidden border border-slate-800/80 mb-2">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-700"
                                                        style={{
                                                            width: `${pct}%`,
                                                            background: isFinished
                                                                ? 'linear-gradient(90deg, #10b981, #34d399)'
                                                                : pct > 50
                                                                ? 'linear-gradient(90deg, #0284c7, #38bdf8)'
                                                                : 'linear-gradient(90deg, #1e3a5f, #0284c7)'
                                                        }}
                                                    ></div>
                                                </div>

                                                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                                                    <span>
                                                        {isArabic ? 'الممسوح:' : 'Scanned:'} <strong className="text-emerald-400">{sQty.toLocaleString('en-US')}</strong>
                                                    </span>
                                                    <span>
                                                        {isArabic ? 'المستهدف:' : 'Target:'} <strong className="text-slate-300">{tQty > 1 ? tQty.toLocaleString('en-US') : '—'}</strong>
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                                <span>
                                    {isArabic ? 'إجمالي مستهدف المصنع:' : 'Total Target Volume:'}{' '}
                                    <strong className="text-amber-400">{totalPieces.toLocaleString('en-US')} {isArabic ? 'قطعة' : 'pcs'}</strong>
                                </span>
                                <Link to="/orders" className="text-sky-400 hover:text-sky-300 flex items-center gap-1 font-sans font-medium text-xs">
                                    <span>{t('dashboard.view_detailed_reports')}</span>
                                    <i className={`fas fa-arrow-${isRTL ? 'left' : 'right'} text-[10px]`}></i>
                                </Link>
                            </div>
                        </div>

                        {/* Priority Orders Card */}
                        <div className="rounded-2xl bg-[#0b1220] border border-slate-800/90 p-4 sm:p-5 shadow-xl">
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20 text-xs">
                                        <i className="fas fa-fire-flame-curved"></i>
                                    </div>
                                    <div>
                                        <h3 className="text-xs sm:text-sm font-bold text-white">
                                            {t('dashboard.priority_title')}
                                        </h3>
                                        <p className="text-[10px] text-slate-400">
                                            {isArabic ? 'أحدث أوامر التشغيل الجارية ونسبة التقدم الحالية' : 'Active priority production orders'}
                                        </p>
                                    </div>
                                </div>
                                <Link to="/orders" className="text-xs text-sky-400 hover:underline font-mono">
                                    {t('common.all')} ({totalOrders})
                                </Link>
                            </div>

                            {priorityOrders.length === 0 ? (
                                <div className="py-8 text-center text-slate-500 text-xs">
                                    <i className="fas fa-check-circle text-2xl text-emerald-600/50 mb-2 block"></i>
                                    {t('dashboard.no_priority_data')}
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {priorityOrders.slice(0, 5).map((ord) => {
                                        const pct = ord.completion_rate || 0;
                                        return (
                                            <div
                                                key={ord.id}
                                                className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 flex items-center justify-between gap-3 transition"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <span className="font-mono text-xs font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                                                            {ord.order_number}
                                                        </span>
                                                        <span className="text-xs font-semibold text-slate-300 truncate">
                                                            {ord.customer_name || (isArabic ? 'عميل عام' : 'Standard Client')}
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-[#070c18] rounded-full h-1.5 overflow-hidden border border-slate-800/80">
                                                        <div
                                                            className="h-full rounded-full transition-all duration-500"
                                                            style={{
                                                                width: `${pct}%`,
                                                                background: pct >= 100 ? '#10b981' : '#38bdf8'
                                                            }}
                                                        ></div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3 font-mono flex-shrink-0 text-right">
                                                    <div>
                                                        <span className="text-xs font-bold text-sky-400 block">{pct}%</span>
                                                        <span className="text-[9.5px] text-slate-500">
                                                            {(ord.target_quantity || 0).toLocaleString('en-US')} {t('common.pieces')}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                    </div>

                    {/* Right Column: Top Scanners Leaderboard & Live Audit Feed */}
                    <div className="space-y-4">

                        {/* Top Scanners Leaderboard */}
                        <div className="rounded-2xl bg-[#0b1220] border border-slate-800/90 p-4 sm:p-5 shadow-xl">
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 text-xs">
                                        <i className="fas fa-trophy"></i>
                                    </div>
                                    <div>
                                        <h3 className="text-xs sm:text-sm font-bold text-white">
                                            {t('dashboard.leaderboard_title')}
                                        </h3>
                                        <p className="text-[10px] text-slate-400">
                                            {isArabic ? 'أعلى إنتاجية للمشغلين والعمال اليوم' : 'Daily operator productivity ranking'}
                                        </p>
                                    </div>
                                </div>
                                <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                    TODAY
                                </span>
                            </div>

                            {topScanners.length === 0 ? (
                                <div className="py-8 text-center text-slate-500 text-xs">
                                    <i className="fas fa-user-clock text-2xl text-slate-700 mb-2 block"></i>
                                    {t('dashboard.no_scanners_data')}
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {topScanners.slice(0, 5).map((sc, idx) => {
                                        const medals = ['text-amber-400', 'text-slate-300', 'text-amber-600'];
                                        const isTop3 = idx < 3;
                                        return (
                                            <div
                                                key={sc.scanned_by || idx}
                                                className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between gap-3 transition"
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono text-xs font-black flex-shrink-0 ${
                                                        isTop3 ? 'bg-amber-500/15 border border-amber-500/30 ' + medals[idx] : 'bg-slate-800 text-slate-400 border border-slate-700'
                                                    }`}>
                                                        {idx + 1}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <span className="text-xs font-bold text-white block truncate">
                                                            {sc.scanned_by}
                                                        </span>
                                                        <span className="text-[9.5px] text-slate-500 font-mono">
                                                            {sc.last_seen ? new Date(sc.last_seen).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : t('common.active')}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="font-mono text-right flex-shrink-0">
                                                    <span className="text-xs font-black text-emerald-400 block">
                                                        {Number(sc.scan_count || 0).toLocaleString('en-US')}
                                                    </span>
                                                    <span className="text-[9px] text-slate-500">{isArabic ? 'قطعة' : 'pcs'}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Live Barcode Scan Activity Feed */}
                        <div className="rounded-2xl bg-[#0b1220] border border-slate-800/90 p-4 sm:p-5 shadow-xl">
                            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                                    <h3 className="text-xs sm:text-sm font-bold text-white">
                                        {t('dashboard.live_ticker_title')}
                                    </h3>
                                </div>
                                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                    LIVE FEED
                                </span>
                            </div>

                            <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 custom-scroll">
                                {liveActivity.length === 0 ? (
                                    <div className="text-center py-8 text-slate-500 text-xs">
                                        {t('dashboard.no_live_data')}
                                    </div>
                                ) : (
                                    liveActivity.slice(0, 10).map((act, i) => (
                                        <div
                                            key={act.id || i}
                                            className="p-2 rounded-xl bg-slate-900/50 border border-slate-800/70 hover:border-slate-700 flex items-center justify-between text-xs transition"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${act.source_type === 'external' ? 'bg-cyan-400' : 'bg-sky-400'}`}></span>
                                                <span className="font-mono font-bold text-white tracking-wider text-[11px] truncate">
                                                    {act.barcode}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 font-mono text-[10px] flex-shrink-0">
                                                <span className="text-sky-300 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-500/20">
                                                    {translateStage(act.stage_name)}
                                                </span>
                                                <span className="text-slate-400">
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

import React, { useState, useEffect } from 'react';
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
        <div className="min-h-screen flex flex-col bg-[#050811] text-slate-100 antialiased selection:bg-sky-500/30 selection:text-white">
            <Header
                title={t('dashboard.title')}
                subtitle={`${companyName} | ${t('common.app_tagline')}`}
                badgeText={isFactoryOwner ? (isArabic ? 'لوحة المالك التنفيذية' : 'OWNER BOARD') : 'FACTORY RADAR'}
                activePage="dashboard"
            />

            <main className="flex-1 p-3 sm:p-5 max-w-[1440px] w-full mx-auto space-y-4">

                {/* ── 1. Top Executive Control Header ── */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0a1224] via-[#08101e] to-[#060b16] border border-slate-700/60 p-4 sm:p-5 shadow-2xl backdrop-blur-md">
                    <div className="absolute -top-20 -right-20 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none"></div>
                    <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

                    <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-600 via-cyan-500 to-indigo-600 p-[1.5px] shadow-lg shadow-sky-500/20">
                                <div className="w-full h-full bg-[#070d1a] rounded-2xl flex items-center justify-center">
                                    <i className={`fas ${isFactoryOwner ? 'fa-building-user text-amber-400' : 'fa-industry text-sky-400'} text-lg`}></i>
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <h1 className="text-base sm:text-lg font-black text-white tracking-wide">
                                        {isFactoryOwner
                                            ? (isArabic ? 'لوحة المتابعة الشاملة لصاحب المصنع' : 'Factory Owner Executive Cockpit')
                                            : (isArabic ? 'مركز الرقابة ومتابعة الإنتاج' : 'Factory Command Center')}
                                    </h1>
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                        LIVE RADAR
                                    </span>
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {isArabic
                                        ? `مرحباً بك ${user?.fullname || user?.username} — موجز لحظي دقيق لكافة خطوط التشغيل ونسب الإنجاز بالأرقام`
                                        : `Welcome, ${user?.fullname || user?.username} — Precision factory throughput and operational status`}
                                </p>
                            </div>
                        </div>

                        {/* Top Right Quick Metrics & Actions */}
                        <div className="flex items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
                            <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-slate-700/60 shadow-inner">
                                <div className="flex flex-col text-right">
                                    <span className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">
                                        {isArabic ? 'المزامنة' : 'Sync'}
                                    </span>
                                    <span className="font-mono text-xs font-bold text-sky-400">
                                        {lastUpdated ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
                                    </span>
                                </div>
                                <div className="h-6 w-px bg-slate-700/80"></div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">
                                        {isArabic ? 'المراحل النشطة' : 'Stages'}
                                    </span>
                                    <span className="font-mono text-xs font-bold text-white">
                                        {stages.length || 6} {isArabic ? 'مراحل' : 'active'}
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

                {/* ── 2. Top-Level Executive Numbers (KPI Strip) ── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {/* KPI 1 */}
                    <div className="rounded-2xl bg-gradient-to-b from-[#0d1629] to-[#070d1a] p-4 border border-sky-500/20 shadow-lg hover:border-sky-500/40 transition">
                        <div className="flex justify-between items-start mb-1.5">
                            <span className="text-[11px] font-bold text-slate-300">{t('dashboard.kpi_total_orders')}</span>
                            <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center border border-sky-500/20 text-xs">
                                <i className="fas fa-boxes-stacked"></i>
                            </div>
                        </div>
                        <div className="text-2xl font-black font-mono text-white tracking-tight">
                            {loading ? <span className="inline-block w-12 h-6 bg-slate-800 rounded animate-pulse" /> : totalOrders.toLocaleString('en-US')}
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                            <span>{isArabic ? 'مصنع:' : 'In:'} <strong className="text-sky-300">{summary.factory_orders || 0}</strong></span>
                            <span>{isArabic ? 'خارجي:' : 'Ext:'} <strong className="text-cyan-300">{summary.external_orders || 0}</strong></span>
                        </div>
                    </div>

                    {/* KPI 2 */}
                    <div className="rounded-2xl bg-gradient-to-b from-[#0d1629] to-[#070d1a] p-4 border border-amber-500/20 shadow-lg hover:border-amber-500/40 transition">
                        <div className="flex justify-between items-start mb-1.5">
                            <span className="text-[11px] font-bold text-slate-300">{t('dashboard.kpi_active_orders')}</span>
                            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 text-xs">
                                <i className="fas fa-bolt"></i>
                            </div>
                        </div>
                        <div className="text-2xl font-black font-mono text-amber-400 tracking-tight">
                            {loading ? <span className="inline-block w-12 h-6 bg-slate-800 rounded animate-pulse" /> : activeOrders.toLocaleString('en-US')}
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                            <span>{isArabic ? 'على خط الإنتاج' : 'In production'}</span>
                            <span className="text-emerald-400 font-bold">{closedOrders} {isArabic ? 'مكتمل' : 'done'}</span>
                        </div>
                    </div>

                    {/* KPI 3 */}
                    <div className="rounded-2xl bg-gradient-to-b from-[#0d1629] to-[#070d1a] p-4 border border-emerald-500/20 shadow-lg hover:border-emerald-500/40 transition">
                        <div className="flex justify-between items-start mb-1.5">
                            <span className="text-[11px] font-bold text-slate-300">{t('dashboard.kpi_total_scans')}</span>
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 text-xs">
                                <i className="fas fa-barcode"></i>
                            </div>
                        </div>
                        <div className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
                            {loading ? <span className="inline-block w-12 h-6 bg-slate-800 rounded animate-pulse" /> : totalScans.toLocaleString('en-US')}
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                            <span>{isArabic ? 'مسحات مؤكدة' : 'Verified scans'}</span>
                            <span className="text-emerald-400 font-bold">100%</span>
                        </div>
                    </div>

                    {/* KPI 4 */}
                    <div className="rounded-2xl bg-gradient-to-b from-[#0d1629] to-[#070d1a] p-4 border border-cyan-500/20 shadow-lg hover:border-cyan-500/40 transition">
                        <div className="flex justify-between items-start mb-1.5">
                            <span className="text-[11px] font-bold text-slate-300">{t('dashboard.kpi_completion_rate')}</span>
                            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20 text-xs">
                                <i className="fas fa-circle-check"></i>
                            </div>
                        </div>
                        <div className="text-2xl font-black font-mono text-cyan-400 tracking-tight">
                            {loading ? <span className="inline-block w-12 h-6 bg-slate-800 rounded animate-pulse" /> : `${completionRate}%`}
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                            <span>{closedOrders} / {totalOrders} {isArabic ? 'أوردر' : 'orders'}</span>
                            <span className="text-cyan-400 font-bold">{completionRate}%</span>
                        </div>
                    </div>

                    {/* KPI 5 */}
                    <div className="rounded-2xl bg-gradient-to-b from-[#0d1629] to-[#070d1a] p-4 border border-violet-500/20 shadow-lg hover:border-violet-500/40 transition col-span-2 sm:col-span-1">
                        <div className="flex justify-between items-start mb-1.5">
                            <span className="text-[11px] font-bold text-slate-300">{isArabic ? 'إجمالي حمولة القطع' : 'Total Volume'}</span>
                            <div className="w-7 h-7 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center border border-violet-500/20 text-xs">
                                <i className="fas fa-layer-group"></i>
                            </div>
                        </div>
                        <div className="text-2xl font-black font-mono text-violet-300 tracking-tight">
                            {loading ? <span className="inline-block w-12 h-6 bg-slate-800 rounded animate-pulse" /> : totalPieces.toLocaleString('en-US')}
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                            <span>{isArabic ? 'قطعة مستهدفة' : 'Target Pcs'}</span>
                            <span className="text-violet-400 font-bold">{isArabic ? 'بالمصنع' : 'Active'}</span>
                        </div>
                    </div>
                </div>

                {/* ── 3. Balanced Grid (Pipeline vs Priority Orders) ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                    {/* Section A: Complete Pipeline Throughput */}
                    <div className="rounded-2xl bg-[#090f1e] border border-slate-800 p-4 sm:p-5 shadow-xl flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800/90">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center border border-sky-500/20 text-xs">
                                        <i className="fas fa-diagram-project"></i>
                                    </div>
                                    <div>
                                        <h3 className="text-xs sm:text-sm font-bold text-white">
                                            {t('dashboard.pipeline_title')}
                                        </h3>
                                        <p className="text-[10px] text-slate-400">
                                            {isArabic ? 'مسار العمل وتدفق القطع داخل كل مرحلة إنتاج' : 'Factory stages throughput and progress'}
                                        </p>
                                    </div>
                                </div>
                                <span className="px-2 py-0.5 rounded-md text-[9.5px] font-mono font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                                    PIPELINE
                                </span>
                            </div>

                            {stages.length === 0 ? (
                                <div className="py-10 text-center text-slate-500 text-xs">
                                    <i className="fas fa-layer-group text-2xl text-slate-700 mb-2 block"></i>
                                    {t('dashboard.no_pipeline_data')}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {stages.map((stg, i) => {
                                        const sQty = Number(stg.total_scanned) || 0;
                                        const tQty = Number(stg.total_target) || 1;
                                        const pct = tQty > 0 ? Math.min(100, Math.round((sQty / tQty) * 100)) : 0;
                                        const isFinished = pct >= 100;

                                        return (
                                            <div
                                                key={stg.stage_name || i}
                                                className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition"
                                            >
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="w-5 h-5 rounded-md bg-slate-800 text-slate-300 font-mono text-[10px] font-bold flex items-center justify-center border border-slate-700 flex-shrink-0">
                                                            {i + 1}
                                                        </span>
                                                        <span className="text-xs font-bold text-white truncate">
                                                            {translateStage(stg.stage_name)}
                                                        </span>
                                                        {stg.active_orders_count > 0 && (
                                                            <span className="text-[9.5px] font-mono text-sky-400 bg-sky-500/10 px-1.5 py-0.2 rounded border border-sky-500/20">
                                                                {stg.active_orders_count} {isArabic ? 'أوردر' : 'ord'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 font-mono text-xs">
                                                        <span className="text-emerald-400 font-bold">{sQty.toLocaleString('en-US')}</span>
                                                        <span className="text-slate-600">/</span>
                                                        <span className="text-slate-400">{tQty > 1 ? tQty.toLocaleString('en-US') : '—'}</span>
                                                        <span className={`font-bold ml-1 ${isFinished ? 'text-emerald-400' : 'text-sky-400'}`}>
                                                            ({pct}%)
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="w-full bg-[#060a14] rounded-full h-2 overflow-hidden border border-slate-800">
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
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                            <span>
                                {isArabic ? 'مجموع المستهدف:' : 'Total Volume:'}{' '}
                                <strong className="text-amber-400">{totalPieces.toLocaleString('en-US')} {isArabic ? 'قطعة' : 'pcs'}</strong>
                            </span>
                            <Link to="/orders" className="text-sky-400 hover:text-sky-300 flex items-center gap-1 font-sans font-medium">
                                <span>{isArabic ? 'فتح جدول الأوردرات والتفاصيل' : 'Open Detailed Order Audit'}</span>
                                <i className={`fas fa-arrow-${isRTL ? 'left' : 'right'} text-[10px]`}></i>
                            </Link>
                        </div>
                    </div>

                    {/* Section B: Active Priority Orders Monitoring */}
                    <div className="rounded-2xl bg-[#090f1e] border border-slate-800 p-4 sm:p-5 shadow-xl flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800/90">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 text-xs">
                                        <i className="fas fa-list-check"></i>
                                    </div>
                                    <div>
                                        <h3 className="text-xs sm:text-sm font-bold text-white">
                                            {isArabic ? 'أوامر التشغيل الجارية والمستهدفة' : 'Active Production Orders'}
                                        </h3>
                                        <p className="text-[10px] text-slate-400">
                                            {isArabic ? 'متابعة حية لكل أوردر، نسبة الإنجاز، واسم العميل' : 'Live progress and customer breakdown'}
                                        </p>
                                    </div>
                                </div>
                                <Link to="/orders" className="text-xs text-sky-400 hover:underline font-mono">
                                    {isArabic ? `عرض الكل (${totalOrders})` : `All (${totalOrders})`}
                                </Link>
                            </div>

                            {priorityOrders.length === 0 ? (
                                <div className="py-10 text-center text-slate-500 text-xs">
                                    <i className="fas fa-check-circle text-2xl text-emerald-600/50 mb-2 block"></i>
                                    {t('dashboard.no_priority_data')}
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {priorityOrders.slice(0, 6).map((ord) => {
                                        const pct = ord.completion_rate || 0;
                                        return (
                                            <div
                                                key={ord.id}
                                                className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between gap-3 transition"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <span className="font-mono text-xs font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                                                            {ord.order_number}
                                                        </span>
                                                        <span className="text-xs font-semibold text-slate-300 truncate">
                                                            {ord.customer_name || (isArabic ? 'عميل عام' : 'Client')}
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-[#060a14] rounded-full h-1.5 overflow-hidden border border-slate-800">
                                                        <div
                                                            className="h-full rounded-full transition-all duration-500"
                                                            style={{
                                                                width: `${pct}%`,
                                                                background: pct >= 100 ? '#10b981' : '#38bdf8'
                                                            }}
                                                        ></div>
                                                    </div>
                                                </div>

                                                <div className="font-mono flex-shrink-0 text-right">
                                                    <span className={`text-xs font-bold block ${pct >= 100 ? 'text-emerald-400' : 'text-sky-400'}`}>
                                                        {pct}%
                                                    </span>
                                                    <span className="text-[9.5px] text-slate-500">
                                                        {(ord.target_quantity || 0).toLocaleString('en-US')} {t('common.pieces')}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                            <span>
                                {isArabic ? 'الأوردرات الجارية:' : 'Active orders:'}{' '}
                                <strong className="text-sky-400">{activeOrders}</strong>
                            </span>
                            <Link to="/orders" className="text-sky-400 hover:text-sky-300 flex items-center gap-1 font-sans font-medium">
                                <span>{isArabic ? 'تصدير وطباعة تقرير' : 'Reports & Print'}</span>
                                <i className={`fas fa-arrow-${isRTL ? 'left' : 'right'} text-[10px]`}></i>
                            </Link>
                        </div>
                    </div>

                </div>

                {/* ── 4. Lower Dual Stream (Leaderboard + Live Feed) ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                    {/* Left: Top Scanners Leaderboard */}
                    <div className="rounded-2xl bg-[#090f1e] border border-slate-800 p-4 sm:p-5 shadow-xl">
                        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/90">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 text-xs">
                                    <i className="fas fa-trophy"></i>
                                </div>
                                <div>
                                    <h3 className="text-xs sm:text-sm font-bold text-white">
                                        {isArabic ? 'إنتاجية المشغلين والعمال اليوم' : 'Daily Operator Productivity'}
                                    </h3>
                                    <p className="text-[10px] text-slate-400">
                                        {isArabic ? 'ترتيب أعلى المشغلين إنجازاً وسرعة اليوم' : 'Top operator scan throughput'}
                                    </p>
                                </div>
                            </div>
                            <span className="text-[9.5px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                TOP PRODUCERS
                            </span>
                        </div>

                        {topScanners.length === 0 ? (
                            <div className="py-8 text-center text-slate-500 text-xs">
                                <i className="fas fa-user-clock text-2xl text-slate-700 mb-2 block"></i>
                                {t('dashboard.no_scanners_data')}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {topScanners.slice(0, 6).map((sc, idx) => {
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

                    {/* Right: Live Ticker Feed */}
                    <div className="rounded-2xl bg-[#090f1e] border border-slate-800 p-4 sm:p-5 shadow-xl">
                        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/90">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 text-xs">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                                </div>
                                <div>
                                    <h3 className="text-xs sm:text-sm font-bold text-white">
                                        {isArabic ? 'سجل ضربات الباركود المباشر' : 'Live Barcode Stream'}
                                    </h3>
                                    <p className="text-[10px] text-slate-400">
                                        {isArabic ? 'آخر القطع الممسوحة في خط الإنتاج لحظياً' : 'Real-time piece verification stream'}
                                    </p>
                                </div>
                            </div>
                            <span className="text-[9.5px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                REALTIME
                            </span>
                        </div>

                        <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
                            {liveActivity.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 text-xs">
                                    {t('dashboard.no_live_data')}
                                </div>
                            ) : (
                                liveActivity.slice(0, 8).map((act, i) => (
                                    <div
                                        key={act.id || i}
                                        className="p-2 rounded-xl bg-slate-900/50 border border-slate-800/70 hover:border-slate-700 flex items-center justify-between text-xs transition"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${act.source_type === 'external' ? 'bg-cyan-400' : 'bg-sky-400'}`}></span>
                                            <span className="font-mono font-bold text-white tracking-wider text-[11px] truncate">
                                                {act.barcode}
                                            </span>
                                            <span className="text-slate-400 text-[10px] hidden sm:inline">
                                                [{act.order_number || t('common.order')}]
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

            </main>
        </div>
    );
}

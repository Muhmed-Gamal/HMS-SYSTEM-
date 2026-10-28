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

    const isArabic = language === 'ar';

    const summary = overviewData?.summary || {};
    const stages = overviewData?.stages_distribution || [];
    const topScanners = overviewData?.top_scanners || [];
    const liveActivity = overviewData?.live_activity || [];
    const priorityOrders = overviewData?.priority_orders || [];

    // Macro Metrics
    const totalOrders = (summary.factory_orders || 0) + (summary.external_orders || 0);
    const activeOrders = (summary.factory_active_orders || 0) + (summary.external_active_orders || 0);
    const closedOrders = Math.max(0, totalOrders - activeOrders);
    const totalScans = (summary.factory_scans || 0) + (summary.external_scans || 0);
    const totalTargetPieces = Number(summary.total_target_pieces || 0);
    const totalScannedPieces = stages.reduce((acc, s) => acc + (Number(s.total_scanned) || 0), 0);
    const overallProgress = totalTargetPieces > 0 ? Math.min(100, Math.round((totalScannedPieces / totalTargetPieces) * 100)) : 0;
    const fulfillmentRate = totalOrders > 0 ? Math.round((closedOrders / totalOrders) * 100) : 0;

    return (
        <div className="min-h-screen flex flex-col bg-[#070b14] text-slate-100 antialiased selection:bg-sky-500/30 selection:text-white">
            <Header
                title={t('dashboard.title')}
                subtitle={`${companyName} | ${t('common.app_tagline')}`}
                badgeText={isFactoryOwner ? (isArabic ? 'لوحة المالك التنفيذية' : 'OWNER EXECUTIVE') : 'OVERVIEW'}
                activePage="dashboard"
            />

            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-6">

                {/* ── 1. Hero Summary & Status Pill ── */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                                {isArabic ? 'الملخص التنفيذي للمصنع' : 'Executive Overview'}
                            </h1>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                {isArabic ? 'شغال ومحدث' : 'SYSTEM LIVE'}
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                            {isArabic 
                                ? `مرحباً بك ${user?.fullname || user?.username} — موجز مباشر لسير العمل وحالة الإنتاج بدون أي تفاصيل مشتتة` 
                                : `Welcome ${user?.fullname || user?.username} — Clean high-level macro view of all factory operations`}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                        <span className="text-[11px] font-mono text-slate-500">
                            {lastUpdated ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                        <button
                            onClick={() => loadDashboardData(true)}
                            disabled={refreshing}
                            className="p-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                            title={t('common.refresh')}
                        >
                            <i className={`fas fa-rotate text-xs ${refreshing ? 'fa-spin text-sky-400' : 'text-slate-400'}`}></i>
                            <span>{t('common.refresh')}</span>
                        </button>
                    </div>
                </div>

                {/* ── 2. The 3 Macro-Pillars (Clean, Huge Numbers, High Air) ── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    {/* Pillar 1: Production Volume Progress */}
                    <div className="p-5 rounded-2xl bg-[#0c1322] border border-slate-800/90 shadow-xl relative overflow-hidden">
                        <div className="flex justify-between items-center text-xs font-semibold text-slate-400 mb-2">
                            <span>{isArabic ? 'إجمالي إنجاز القطع' : 'Production Volume'}</span>
                            <span className="text-emerald-400 font-mono font-bold">{overallProgress}%</span>
                        </div>
                        <div className="text-3xl font-black font-mono text-white tracking-tight">
                            {loading ? '...' : totalScannedPieces.toLocaleString('en-US')}
                            <span className="text-xs font-normal text-slate-400 mr-2 font-sans">
                                {isArabic ? `/ ${totalTargetPieces.toLocaleString('en-US')} قطعة` : `/ ${totalTargetPieces.toLocaleString('en-US')} pcs`}
                            </span>
                        </div>
                        <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden mt-4 border border-slate-800">
                            <div 
                                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-700" 
                                style={{ width: `${overallProgress}%` }}
                            ></div>
                        </div>
                        <p className="text-[10.5px] text-slate-500 mt-2 font-mono">
                            {isArabic ? 'القطع الممسوحة في صالة الإنتاج' : 'Total scanned units on floor'}
                        </p>
                    </div>

                    {/* Pillar 2: Active Orders Queue */}
                    <div className="p-5 rounded-2xl bg-[#0c1322] border border-slate-800/90 shadow-xl relative overflow-hidden">
                        <div className="flex justify-between items-center text-xs font-semibold text-slate-400 mb-2">
                            <span>{isArabic ? 'الأوردرات الجارية' : 'Active Orders Queue'}</span>
                            <span className="text-amber-400 font-mono font-bold">{activeOrders} {isArabic ? 'جارية' : 'running'}</span>
                        </div>
                        <div className="text-3xl font-black font-mono text-amber-400 tracking-tight">
                            {loading ? '...' : activeOrders}
                            <span className="text-xs font-normal text-slate-400 mr-2 font-sans">
                                {isArabic ? `/ ${totalOrders} إجمالي الأوردرات` : `/ ${totalOrders} total orders`}
                            </span>
                        </div>
                        <div className="mt-4 flex items-center gap-4 text-xs font-mono text-slate-400 border-t border-slate-800/70 pt-2.5">
                            <span>{isArabic ? 'مصنع:' : 'In-House:'} <strong className="text-white">{summary.factory_active_orders || 0}</strong></span>
                            <span>{isArabic ? 'خارجي:' : 'Outsourced:'} <strong className="text-white">{summary.external_active_orders || 0}</strong></span>
                            <span>{isArabic ? 'مكتمل:' : 'Closed:'} <strong className="text-emerald-400">{closedOrders}</strong></span>
                        </div>
                    </div>

                    {/* Pillar 3: Order Fulfillment Rate */}
                    <div className="p-5 rounded-2xl bg-[#0c1322] border border-slate-800/90 shadow-xl relative overflow-hidden">
                        <div className="flex justify-between items-center text-xs font-semibold text-slate-400 mb-2">
                            <span>{isArabic ? 'معدل تسليم الأوردرات' : 'Fulfillment Rate'}</span>
                            <span className="text-cyan-400 font-mono font-bold">{fulfillmentRate}%</span>
                        </div>
                        <div className="text-3xl font-black font-mono text-cyan-400 tracking-tight">
                            {loading ? '...' : `${fulfillmentRate}%`}
                            <span className="text-xs font-normal text-slate-400 mr-2 font-sans">
                                {isArabic ? `(${closedOrders} أوردر تم تسليمه)` : `(${closedOrders} closed)`}
                            </span>
                        </div>
                        <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden mt-4 border border-slate-800">
                            <div 
                                className="h-full rounded-full bg-cyan-400 transition-all duration-700" 
                                style={{ width: `${fulfillmentRate}%` }}
                            ></div>
                        </div>
                        <p className="text-[10.5px] text-slate-500 mt-2 font-mono">
                            {totalScans.toLocaleString('en-US')} {isArabic ? 'مسحة ليزر مؤكدة بالنظام' : 'verified barcode scans'}
                        </p>
                    </div>

                </div>

                {/* ── 3. Clean 2-Card Workstation (Stages Flow + Active Orders) ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                    {/* Card A: Clean Stage Progress */}
                    <div className="p-5 sm:p-6 rounded-2xl bg-[#0c1322] border border-slate-800/90 shadow-xl flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                                <div>
                                    <h2 className="text-sm font-bold text-white">
                                        {isArabic ? 'مراحل خط الإنتاج' : 'Production Pipeline'}
                                    </h2>
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                        {isArabic ? 'متابعة نسبة إنجاز كل مرحلة في المصنع' : 'Progress per manufacturing stage'}
                                    </p>
                                </div>
                                <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                                    {stages.length} {isArabic ? 'مراحل' : 'stages'}
                                </span>
                            </div>

                            {stages.length === 0 ? (
                                <div className="py-8 text-center text-slate-500 text-xs">
                                    {t('dashboard.no_pipeline_data')}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {stages.map((stg, i) => {
                                        const sQty = Number(stg.total_scanned) || 0;
                                        const tQty = Number(stg.total_target) || 1;
                                        const pct = tQty > 0 ? Math.min(100, Math.round((sQty / tQty) * 100)) : 0;
                                        const isDone = pct >= 100;

                                        return (
                                            <div key={stg.stage_name || i} className="group">
                                                <div className="flex justify-between items-center text-xs mb-1">
                                                    <span className="font-bold text-white flex items-center gap-2">
                                                        <span className="w-4 h-4 rounded-full bg-slate-800 text-[9px] font-mono flex items-center justify-center text-slate-400">
                                                            {i + 1}
                                                        </span>
                                                        {translateStage(stg.stage_name)}
                                                    </span>
                                                    <div className="font-mono text-xs flex items-center gap-2">
                                                        <span className="text-slate-400">{sQty.toLocaleString('en-US')} / {tQty.toLocaleString('en-US')}</span>
                                                        <span className={`font-bold ${isDone ? 'text-emerald-400' : 'text-sky-400'}`}>
                                                            {pct}%
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800/80">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-500"
                                                        style={{
                                                            width: `${pct}%`,
                                                            background: isDone ? '#10b981' : '#0284c7'
                                                        }}
                                                    ></div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                            <span>{isArabic ? 'إجمالي القطع المستهدفة:' : 'Target:'} <strong className="text-amber-400">{totalTargetPieces.toLocaleString('en-US')}</strong></span>
                            <Link to="/orders" className="text-sky-400 hover:text-sky-300 font-sans font-medium flex items-center gap-1">
                                <span>{isArabic ? 'فتح التفاصيل' : 'Details'}</span>
                                <i className={`fas fa-arrow-${isRTL ? 'left' : 'right'} text-[10px]`}></i>
                            </Link>
                        </div>
                    </div>

                    {/* Card B: Clean Top Priority Orders */}
                    <div className="p-5 sm:p-6 rounded-2xl bg-[#0c1322] border border-slate-800/90 shadow-xl flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                                <div>
                                    <h2 className="text-sm font-bold text-white">
                                        {isArabic ? 'أهم الأوردرات الجارية' : 'Active Orders Focus'}
                                    </h2>
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                        {isArabic ? 'أحدث أوامر التشغيل ونسبة إنجازها' : 'Top work orders and status'}
                                    </p>
                                </div>
                                <Link to="/orders" className="text-xs text-sky-400 hover:underline font-mono">
                                    {isArabic ? `عرض الكل (${totalOrders})` : `All (${totalOrders})`}
                                </Link>
                            </div>

                            {priorityOrders.length === 0 ? (
                                <div className="py-8 text-center text-slate-500 text-xs">
                                    {t('dashboard.no_priority_data')}
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {priorityOrders.slice(0, 5).map((ord) => {
                                        const pct = ord.completion_rate || 0;
                                        const isDone = pct >= 100;

                                        return (
                                            <div
                                                key={ord.id}
                                                className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-3 hover:border-slate-700 transition"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-mono text-xs font-bold text-white">
                                                            {ord.order_number}
                                                        </span>
                                                        <span className="text-xs text-slate-400 truncate">
                                                            ({ord.customer_name || (isArabic ? 'عميل عام' : 'Client')})
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                                                        <div
                                                            className="h-full rounded-full transition-all duration-500"
                                                            style={{
                                                                width: `${pct}%`,
                                                                background: isDone ? '#10b981' : '#38bdf8'
                                                            }}
                                                        ></div>
                                                    </div>
                                                </div>

                                                <div className="font-mono text-right flex-shrink-0">
                                                    <span className={`text-xs font-bold block ${isDone ? 'text-emerald-400' : 'text-sky-400'}`}>
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

                        <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                            <span>{isArabic ? 'الأوردرات الجارية:' : 'Active:'} <strong className="text-white">{activeOrders}</strong></span>
                            <Link to="/orders" className="text-sky-400 hover:text-sky-300 font-sans font-medium flex items-center gap-1">
                                <span>{isArabic ? 'جدول الأوردرات بالكامل' : 'Full Table'}</span>
                                <i className={`fas fa-arrow-${isRTL ? 'left' : 'right'} text-[10px]`}></i>
                            </Link>
                        </div>
                    </div>

                </div>

                {/* ── 4. Minimalist Footer Action (Only what matters) ── */}
                <div className="p-4 rounded-2xl bg-[#0c1322] border border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 text-slate-400">
                        <i className="fas fa-circle-info text-sky-400"></i>
                        <span>
                            {isArabic 
                                ? 'للاطلاع على الأرقام الدقيقة لكل استيكر ومسحة وتفاصيل تواريخ العمليات، توجه لشاشة تتبع الأوردرات.' 
                                : 'For piece-by-piece barcode audit trails and timestamps, visit the Orders Tracking page.'}
                        </span>
                    </div>

                    <Link
                        to="/orders"
                        className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold transition flex items-center gap-2 flex-shrink-0 shadow-lg shadow-sky-600/20"
                    >
                        <i className="fas fa-layer-group text-xs"></i>
                        <span>{isArabic ? 'متابعة تفاصيل الأوردرات' : 'Go to Orders Tracking'}</span>
                    </Link>
                </div>

            </main>
        </div>
    );
}

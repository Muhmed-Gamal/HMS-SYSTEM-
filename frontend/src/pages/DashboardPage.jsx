import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import StatCard from '../components/StatCard';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../services/api';

export default function DashboardPage() {
    const { user, companyName, canCreateOrders, canManageUsers } = useAuth();
    const { toast } = useToast();
    const { t, isRTL } = useLanguage();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [overviewData, setOverviewData] = useState(null);

    const loadDashboardData = async (isManual = false) => {
        if (isManual) setRefreshing(true);
        else setLoading(true);

        const { ok, data } = await api.getDashboardOverview();
        if (ok && data.success) {
            setOverviewData(data);
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
            } else {
                toast(t('common.error'), 'error');
            }
        }

        setLoading(false);
        setRefreshing(false);
    };

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        loadDashboardData();

        // Silent background sync every 15s
        const interval = setInterval(() => {
            loadDashboardData(false);
        }, 15000);

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

    return (
        <div className="min-h-screen flex flex-col bg-[#070b14] text-slate-100">
            <Header
                title={t('dashboard.title')}
                subtitle={`${companyName} | ${t('common.app_tagline')}`}
                badgeText="COMMAND CENTER"
                activePage="dashboard"
            />

            <main className="flex-1 p-3 sm:p-5 max-w-7xl w-full mx-auto space-y-4">

                {/* ── Top Bar: Welcome + System Health + Refresh ── */}
                <div className="slate-card p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-lg shadow-md shadow-sky-500/20"
                            style={{ background: 'linear-gradient(135deg, #0284c7, #2563eb)', border: '1px solid rgba(56,189,248,0.4)' }}>
                            <i className="fas fa-chart-line"></i>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-base sm:text-lg font-black text-white">
                                    {t('dashboard.title')}
                                </h1>
                                <span className="badge-clean text-[10px] font-mono font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20">
                                    LIVE AUDIT
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {t('dashboard.subtitle')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                        {/* System Status Pill */}
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-xs font-mono">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
                            <span className="text-slate-300 font-semibold">{t('dashboard.status_online')}</span>
                            <span className="text-slate-600">|</span>
                            <span className="text-cyan-400 font-bold">{summary.active_stages_count || 6} {t('common.stage')}</span>
                        </div>

                        {/* Refresh Button */}
                        <button
                            onClick={() => loadDashboardData(true)}
                            disabled={refreshing}
                            className="btn-slate btn-slate-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 cursor-pointer"
                            title={t('common.refresh')}
                        >
                            <i className={`fas fa-sync-alt text-xs ${refreshing ? 'fa-spin text-sky-400' : ''}`}></i>
                            <span className="hidden sm:inline">{t('common.refresh')}</span>
                        </button>
                    </div>
                </div>

                {/* ── Executive KPI Grid ── */}
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard
                        label={t('dashboard.kpi_total_orders')}
                        value={loading ? '...' : totalOrders.toLocaleString('en-US')}
                        colorClass="text-sky-400"
                        icon="fas fa-boxes"
                        subValue={t('dashboard.kpi_factory_ext_sub', { factory: summary.factory_orders || 0, external: summary.external_orders || 0 })}
                    />

                    <StatCard
                        label={t('dashboard.kpi_active_orders')}
                        value={loading ? '...' : activeOrders.toLocaleString('en-US')}
                        colorClass="text-amber-400"
                        icon="fas fa-spinner"
                        subValue={t('dashboard.kpi_factory_ext_sub', { factory: summary.factory_active_orders || 0, external: summary.external_active_orders || 0 })}
                    />

                    <StatCard
                        label={t('dashboard.kpi_total_scans')}
                        value={loading ? '...' : totalScans.toLocaleString('en-US')}
                        colorClass="text-emerald-400"
                        icon="fas fa-barcode"
                        subValue={t('dashboard.kpi_scans_sub')}
                    />

                    <StatCard
                        label={t('dashboard.kpi_completion_rate')}
                        value={loading ? '...' : `${completionRate}%`}
                        colorClass="text-cyan-400"
                        icon="fas fa-chart-pie"
                        subValue={t('dashboard.kpi_completion_sub', { closed: closedOrders, total: totalOrders })}
                    />
                </div>

                {/* ── Admin Fast Execution Hub ── */}
                <div className="slate-card p-4 bg-gradient-to-r from-[#0b1426] via-[#0e1933] to-[#0a1224] border border-sky-500/25">
                    <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-700/60">
                        <div className="flex items-center gap-2">
                            <i className="fas fa-bolt text-amber-400 text-xs"></i>
                            <h3 className="text-xs sm:text-sm font-bold text-white">{t('dashboard.admin_hub_title')}</h3>
                        </div>
                        <span className="badge-clean badge-blue text-[9.5px] font-mono">ADMIN HUB</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {canCreateOrders && (
                            <Link
                                to="/create-order"
                                className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-700/60 hover:border-sky-500/40 transition-all flex flex-col justify-between group"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center text-sm group-hover:scale-110 transition-transform">
                                        <i className="fas fa-plus"></i>
                                    </span>
                                    <i className={`fas fa-arrow-${isRTL ? 'left' : 'right'} text-[10px] text-slate-500 group-hover:text-sky-400 transition-colors`}></i>
                                </div>
                                <div>
                                    <span className="text-xs font-bold text-white block">{t('dashboard.card_create_order')}</span>
                                    <span className="text-[10px] text-slate-400">{t('dashboard.card_create_order_desc')}</span>
                                </div>
                            </Link>
                        )}

                        <a
                            href="/external_tracking.html"
                            className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-700/60 hover:border-cyan-500/40 transition-all flex flex-col justify-between group"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-sm group-hover:scale-110 transition-transform">
                                    <i className="fas fa-truck-loading"></i>
                                </span>
                                <i className={`fas fa-arrow-${isRTL ? 'left' : 'right'} text-[10px] text-slate-500 group-hover:text-cyan-400 transition-colors`}></i>
                            </div>
                            <div>
                                <span className="text-xs font-bold text-white block">{t('dashboard.card_ext_tracking')}</span>
                                <span className="text-[10px] text-slate-400">{t('dashboard.card_ext_tracking_desc')}</span>
                            </div>
                        </a>

                        <Link
                            to="/"
                            className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-700/60 hover:border-emerald-500/40 transition-all flex flex-col justify-between group"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-sm group-hover:scale-110 transition-transform">
                                    <i className="fas fa-barcode"></i>
                                </span>
                                <i className={`fas fa-arrow-${isRTL ? 'left' : 'right'} text-[10px] text-slate-500 group-hover:text-emerald-400 transition-colors`}></i>
                            </div>
                            <div>
                                <span className="text-xs font-bold text-white block">{t('dashboard.card_scanner')}</span>
                                <span className="text-[10px] text-slate-400">{t('dashboard.card_scanner_desc')}</span>
                            </div>
                        </Link>

                        {canManageUsers && (
                            <Link
                                to="/admin"
                                className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-700/60 hover:border-amber-500/40 transition-all flex flex-col justify-between group"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-sm group-hover:scale-110 transition-transform">
                                        <i className="fas fa-user-shield"></i>
                                    </span>
                                    {summary.locked_users > 0 && (
                                        <span className="badge-clean badge-red text-[9px] font-mono font-bold animate-pulse">
                                            {summary.locked_users}
                                        </span>
                                    )}
                                </div>
                                <div>
                                    <span className="text-xs font-bold text-white block">{t('dashboard.card_manage_users')}</span>
                                    <span className="text-[10px] text-slate-400">{t('dashboard.card_manage_users_desc')}</span>
                                </div>
                            </Link>
                        )}
                    </div>
                </div>

                {/* ── Mid Section: Stages Pipeline Distribution & Top Scanners ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    
                    {/* Factory Stages Pipeline */}
                    <div className="lg:col-span-2 slate-card p-5 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-700/60">
                                <div className="flex items-center gap-2">
                                    <i className="fas fa-industry text-sky-400 text-xs"></i>
                                    <h3 className="text-xs sm:text-sm font-bold text-white">{t('dashboard.pipeline_title')}</h3>
                                </div>
                                <span className="text-[10.5px] font-mono text-slate-400">PIPELINE AUDIT</span>
                            </div>

                            {stages.length === 0 ? (
                                <div className="text-center py-10 text-slate-500 text-xs">
                                    <i className="fas fa-layer-group text-2xl text-slate-700 mb-2 block"></i>
                                    {t('dashboard.no_pipeline_data')}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {stages.map((stg, i) => {
                                        const sQty = Number(stg.total_scanned) || 0;
                                        const tQty = Number(stg.total_target) || 1;
                                        const pct = tQty > 0 ? Math.min(100, Math.round((sQty / tQty) * 100)) : 0;

                                        return (
                                            <div key={stg.stage_name || i} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                                                <div className="flex justify-between items-center text-xs mb-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-5 h-5 rounded-md bg-sky-500/10 text-sky-400 font-mono text-[10px] font-bold flex items-center justify-center border border-sky-500/20">
                                                            {i + 1}
                                                        </span>
                                                        <span className="font-bold text-white">{stg.stage_name}</span>
                                                        {stg.active_orders_count > 0 && (
                                                            <span className="text-[9.5px] text-slate-400 font-mono">
                                                                ({stg.active_orders_count})
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="font-mono text-xs flex items-center gap-2">
                                                        <strong className="text-emerald-400">{sQty.toLocaleString('en-US')}</strong>
                                                        <span className="text-slate-500">/</span>
                                                        <span className="text-slate-400">{tQty > 1 ? tQty.toLocaleString('en-US') : '—'}</span>
                                                        <span className="text-sky-300 font-bold mr-1">({pct}%)</span>
                                                    </div>
                                                </div>
                                                <div className="w-full bg-[#070d19] rounded-full h-2 overflow-hidden border border-slate-800">
                                                    <div
                                                        className="h-2 rounded-full transition-all duration-500"
                                                        style={{
                                                            width: `${pct}%`,
                                                            background: pct >= 100 ? '#10b981' : 'linear-gradient(90deg, #0284c7, #38bdf8)'
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
                            <span>{t('common.total')}: <strong className="text-amber-400">{Number(summary.total_target_pieces || 0).toLocaleString('en-US')}</strong></span>
                            <Link to="/orders" className="text-sky-400 hover:text-sky-300 flex items-center gap-1">
                                <span>{t('orders.title')}</span>
                                <i className={`fas fa-chevron-${isRTL ? 'left' : 'right'} text-[9px]`}></i>
                            </Link>
                        </div>
                    </div>

                    {/* Top Scanners Leaderboard */}
                    <div className="slate-card p-5 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-700/60">
                                <div className="flex items-center gap-2">
                                    <i className="fas fa-trophy text-amber-400 text-xs"></i>
                                    <h3 className="text-xs sm:text-sm font-bold text-white">{t('dashboard.leaderboard_title')}</h3>
                                </div>
                                <span className="badge-clean badge-amber text-[9px] font-mono">LEADERBOARD</span>
                            </div>

                            {topScanners.length === 0 ? (
                                <div className="text-center py-10 text-slate-500 text-xs">
                                    <i className="fas fa-user-clock text-2xl text-slate-700 mb-2 block"></i>
                                    {t('dashboard.no_scanners_data')}
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {topScanners.map((sc, idx) => {
                                        const medals = ['text-amber-400', 'text-slate-300', 'text-amber-600'];
                                        const isTop3 = idx < 3;

                                        return (
                                            <div
                                                key={sc.scanned_by || idx}
                                                className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3"
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono text-xs font-black ${
                                                        isTop3 ? 'bg-amber-500/10 border border-amber-500/30 ' + medals[idx] : 'bg-slate-800 text-slate-400'
                                                    }`}>
                                                        {idx + 1}
                                                    </span>
                                                    <div>
                                                        <span className="text-xs font-bold text-white block">{sc.scanned_by}</span>
                                                        <span className="text-[9.5px] text-slate-400 font-mono">
                                                            {sc.last_seen ? new Date(sc.last_seen).toLocaleTimeString('en-US') : t('common.active')}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="font-mono text-right">
                                                    <span className="text-xs font-bold text-emerald-400 block">
                                                        {Number(sc.scan_count || 0).toLocaleString('en-US')}
                                                    </span>
                                                    <span className="text-[9px] text-slate-500">{t('common.barcode')}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-800/80 text-center">
                            <span className="text-[11px] text-slate-400">
                                {t('dashboard.leaderboard_subtitle')}
                            </span>
                        </div>
                    </div>

                </div>

                {/* ── Bottom Section: Live Activity Ticker & Priority Orders ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                    {/* Live Laser Activity Feed */}
                    <div className="slate-card p-5">
                        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-700/60">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                                <h3 className="text-xs sm:text-sm font-bold text-white">{t('dashboard.live_ticker_title')}</h3>
                            </div>
                            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                LIVE TICKER
                            </span>
                        </div>

                        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                            {liveActivity.length === 0 ? (
                                <div className="text-center py-10 text-slate-500 text-xs">
                                    {t('dashboard.no_live_data')}
                                </div>
                            ) : (
                                liveActivity.map((act, i) => (
                                    <div
                                        key={act.id || i}
                                        className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between text-xs"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${act.source_type === 'external' ? 'bg-cyan-400' : 'bg-sky-400'}`}></span>
                                            <span className="font-mono font-bold text-white tracking-wider">
                                                {act.barcode}
                                            </span>
                                            <span className="text-slate-400 font-sans text-[11px]">
                                                [{act.order_number || t('common.order')}]
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-3 font-mono text-[11px]">
                                            <span className="text-sky-300 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-500/20">
                                                {act.stage_name}
                                            </span>
                                            <span className="text-slate-300 font-sans">{act.scanned_by}</span>
                                            <span className="text-slate-500 text-[10px]">
                                                {act.created_at ? new Date(act.created_at).toLocaleTimeString('en-US') : ''}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Active Priority Orders */}
                    <div className="slate-card p-5">
                        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-700/60">
                            <div className="flex items-center gap-2">
                                <i className="fas fa-tasks text-sky-400 text-xs"></i>
                                <h3 className="text-xs sm:text-sm font-bold text-white">{t('dashboard.priority_title')}</h3>
                            </div>
                            <Link to="/orders" className="text-xs text-sky-400 hover:underline">
                                {t('common.all')} ({totalOrders})
                            </Link>
                        </div>

                        <div className="space-y-2.5">
                            {priorityOrders.length === 0 ? (
                                <div className="text-center py-10 text-slate-500 text-xs">
                                    {t('dashboard.no_priority_data')}
                                </div>
                            ) : (
                                priorityOrders.map((ord) => (
                                    <div
                                        key={ord.id}
                                        className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <strong className="text-white font-mono text-xs">{ord.order_number}</strong>
                                                <span className="text-slate-400 text-xs font-medium">({ord.customer_name || 'Client'})</span>
                                            </div>
                                            <div className="w-full bg-[#070d19] rounded-full h-1.5 overflow-hidden border border-slate-800">
                                                <div
                                                    className="h-1.5 rounded-full bg-sky-400"
                                                    style={{ width: `${ord.completion_rate}%` }}
                                                ></div>
                                            </div>
                                        </div>

                                        <div className="font-mono pl-1 text-right">
                                            <span className="text-xs font-bold text-sky-400 block">
                                                {ord.completion_rate}%
                                            </span>
                                            <span className="text-[9.5px] text-slate-400">
                                                {(ord.target_quantity || 0).toLocaleString('en-US')} {t('common.quantity')}
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

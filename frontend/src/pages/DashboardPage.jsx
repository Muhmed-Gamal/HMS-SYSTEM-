import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../services/api';

// ── Mini KPI Card ──────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon, color, loading }) {
    const colorMap = {
        sky:     { text: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20',     glow: 'shadow-sky-500/10' },
        amber:   { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   glow: 'shadow-amber-500/10' },
        emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', glow: 'shadow-emerald-500/10' },
        cyan:    { text: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20',    glow: 'shadow-cyan-500/10' },
        rose:    { text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    glow: 'shadow-rose-500/10' },
    };
    const c = colorMap[color] || colorMap.sky;
    return (
        <div className={`slate-card p-4 flex items-center gap-3 shadow-lg ${c.glow}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.bg} border ${c.border}`}>
                <i className={`${icon} ${c.text} text-sm`}></i>
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[10.5px] text-slate-400 font-medium truncate">{label}</p>
                <p className={`text-lg font-black font-mono leading-tight ${c.text}`}>
                    {loading ? <span className="inline-block w-12 h-4 bg-slate-700 rounded animate-pulse" /> : value}
                </p>
                {sub && <p className="text-[10px] text-slate-500 font-mono truncate">{sub}</p>}
            </div>
        </div>
    );
}

// ── Quick Action Button ────────────────────────────────────────────────────────
function QuickAction({ to, href, icon, label, color, badge }) {
    const colorMap = {
        sky:     'text-sky-400   bg-sky-500/10   border-sky-500/30   hover:border-sky-400/60   hover:bg-sky-500/15',
        cyan:    'text-cyan-400  bg-cyan-500/10  border-cyan-500/30  hover:border-cyan-400/60  hover:bg-cyan-500/15',
        emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-400/60 hover:bg-emerald-500/15',
        amber:   'text-amber-400 bg-amber-500/10 border-amber-500/30 hover:border-amber-400/60 hover:bg-amber-500/15',
    };
    const cls = `relative p-3 rounded-xl border transition-all duration-200 flex flex-col items-center gap-1.5 text-center cursor-pointer ${colorMap[color] || colorMap.sky}`;
    const inner = (
        <>
            {badge > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse z-10">
                    {badge}
                </span>
            )}
            <i className={`${icon} text-base`}></i>
            <span className="text-[10px] font-semibold leading-tight">{label}</span>
        </>
    );
    if (href) return <a href={href} className={cls}>{inner}</a>;
    return <Link to={to} className={cls}>{inner}</Link>;
}

export default function DashboardPage() {
    const { user, companyName, canCreateOrders, canManageUsers } = useAuth();
    const { toast } = useToast();
    const { t, translateStage, isRTL, language } = useLanguage();
    const navigate = useNavigate();

    const [loading, setLoading]         = useState(true);
    const [refreshing, setRefreshing]   = useState(false);
    const [overviewData, setOverviewData] = useState(null);
    const [lastUpdated, setLastUpdated]  = useState(null);

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

    const summary        = overviewData?.summary || {};
    const stages         = overviewData?.stages_distribution || [];
    const topScanners    = overviewData?.top_scanners || [];
    const liveActivity   = overviewData?.live_activity || [];
    const priorityOrders = overviewData?.priority_orders || [];

    const totalOrders    = (summary.factory_orders || 0) + (summary.external_orders || 0);
    const activeOrders   = (summary.factory_active_orders || 0) + (summary.external_active_orders || 0);
    const closedOrders   = Math.max(0, totalOrders - activeOrders);
    const totalScans     = (summary.factory_scans || 0) + (summary.external_scans || 0);
    const completionRate = totalOrders > 0 ? Math.round((closedOrders / totalOrders) * 100) : 0;
    const totalPieces    = Number(summary.total_target_pieces || 0);

    const now = new Date();
    const greetHour = now.getHours();
    const greeting = language === 'ar'
        ? (greetHour < 12 ? 'صباح الخير' : greetHour < 18 ? 'مساء الخير' : 'مساء النور')
        : (greetHour < 12 ? 'Good morning' : greetHour < 18 ? 'Good afternoon' : 'Good evening');

    return (
        <div className="min-h-screen flex flex-col bg-[#070b14] text-slate-100">
            <Header
                title={t('dashboard.title')}
                subtitle={`${companyName} | ${t('common.app_tagline')}`}
                badgeText="COMMAND CENTER"
                activePage="dashboard"
            />

            <main className="flex-1 p-3 sm:p-4 max-w-7xl w-full mx-auto space-y-4">

                {/* ── Welcome Bar ─────────────────────────────────────────── */}
                <div className="slate-card px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg,#0284c7,#2563eb)', border: '1px solid rgba(56,189,248,0.35)' }}>
                            <i className="fas fa-chart-line text-sm"></i>
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">
                                {greeting}، <span className="text-sky-400">{user?.username}</span>
                            </p>
                            <p className="text-[10.5px] text-slate-400 truncate">{t('dashboard.subtitle')}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Live pulse */}
                        <div className="hidden sm:flex items-center gap-1.5 text-[10.5px] font-mono text-slate-300 bg-slate-900/70 border border-slate-700/50 px-2.5 py-1 rounded-lg">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span className="text-emerald-400 font-bold">LIVE</span>
                            {lastUpdated && (
                                <span className="text-slate-500 text-[9.5px]">
                                    {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                            )}
                        </div>

                        <button
                            onClick={() => loadDashboardData(true)}
                            disabled={refreshing}
                            className="btn-slate btn-slate-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 cursor-pointer"
                        >
                            <i className={`fas fa-sync-alt text-xs ${refreshing ? 'fa-spin text-sky-400' : ''}`}></i>
                            <span className="hidden sm:inline">{t('common.refresh')}</span>
                        </button>
                    </div>
                </div>

                {/* ── KPI Strip (5 cards) ──────────────────────────────────── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <KpiCard
                        label={t('dashboard.kpi_total_orders')}
                        value={totalOrders.toLocaleString('en-US')}
                        sub={`${language === 'ar' ? 'مصنع' : 'Factory'} ${summary.factory_orders || 0} · ${language === 'ar' ? 'خارجي' : 'Ext'} ${summary.external_orders || 0}`}
                        icon="fas fa-boxes" color="sky" loading={loading}
                    />
                    <KpiCard
                        label={t('dashboard.kpi_active_orders')}
                        value={activeOrders.toLocaleString('en-US')}
                        sub={`${language === 'ar' ? 'منتهي' : 'Closed'}: ${closedOrders}`}
                        icon="fas fa-spinner" color="amber" loading={loading}
                    />
                    <KpiCard
                        label={t('dashboard.kpi_total_scans')}
                        value={totalScans.toLocaleString('en-US')}
                        sub={language === 'ar' ? 'إجمالي المسح' : 'Total Scans'}
                        icon="fas fa-barcode" color="emerald" loading={loading}
                    />
                    <KpiCard
                        label={t('dashboard.kpi_completion_rate')}
                        value={`${completionRate}%`}
                        sub={`${closedOrders} / ${totalOrders}`}
                        icon="fas fa-chart-pie" color="cyan" loading={loading}
                    />
                    <KpiCard
                        label={language === 'ar' ? 'إجمالي القطع المستهدفة' : 'Total Target Pieces'}
                        value={totalPieces > 999 ? `${(totalPieces / 1000).toFixed(1)}K` : totalPieces.toLocaleString('en-US')}
                        sub={language === 'ar' ? 'قطعة في كل الأوردرات' : 'pieces across all orders'}
                        icon="fas fa-layer-group" color="rose" loading={loading}
                    />
                </div>

                {/* ── Quick Actions ────────────────────────────────────────── */}
                <div className="slate-card p-3">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
                        <i className="fas fa-bolt text-amber-400 text-xs"></i>
                        <span className="text-xs font-bold text-white">{t('dashboard.admin_hub_title')}</span>
                        <span className="ml-auto text-[9.5px] font-mono text-slate-500">QUICK ACTIONS</span>
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-4 gap-2">
                        {canCreateOrders && (
                            <QuickAction to="/create-order" icon="fas fa-plus" label={t('dashboard.card_create_order')} color="sky" />
                        )}
                        <QuickAction to="/orders" icon="fas fa-list-alt" label={language === 'ar' ? 'تتبع الأوردرات' : 'Track Orders'} color="emerald" />
                        <QuickAction to="/" icon="fas fa-barcode" label={t('dashboard.card_scanner')} color="cyan" />
                        <QuickAction href="/external_tracking.html" icon="fas fa-truck-loading" label={t('dashboard.card_ext_tracking')} color="amber" />
                        {canManageUsers && (
                            <QuickAction to="/admin" icon="fas fa-user-shield" label={t('dashboard.card_manage_users')} color="amber" badge={summary.locked_users || 0} />
                        )}
                    </div>
                </div>

                {/* ── Main Body: 3-column grid ─────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                    {/* ── Col 1+2: Pipeline + Priority Orders (stacked) ─────── */}
                    <div className="lg:col-span-2 space-y-4">

                        {/* Stage Pipeline */}
                        <div className="slate-card p-4">
                            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-700/60">
                                <div className="flex items-center gap-2">
                                    <i className="fas fa-industry text-sky-400 text-xs"></i>
                                    <h3 className="text-xs sm:text-sm font-bold text-white">{t('dashboard.pipeline_title')}</h3>
                                </div>
                                <span className="text-[9.5px] font-mono text-slate-500">PIPELINE AUDIT</span>
                            </div>

                            {stages.length === 0 ? (
                                <div className="py-6 text-center text-slate-500 text-xs">
                                    <i className="fas fa-layer-group text-2xl text-slate-700 mb-1 block"></i>
                                    {t('dashboard.no_pipeline_data')}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {stages.map((stg, i) => {
                                        const sQty = Number(stg.total_scanned) || 0;
                                        const tQty = Number(stg.total_target) || 1;
                                        const pct  = tQty > 0 ? Math.min(100, Math.round((sQty / tQty) * 100)) : 0;
                                        const isComplete = pct >= 100;

                                        return (
                                            <div key={stg.stage_name || i} className="flex items-center gap-2 group">
                                                {/* Rank badge */}
                                                <span className="w-5 h-5 rounded-md bg-slate-800 border border-slate-700 text-slate-400 font-mono text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                                                    {i + 1}
                                                </span>

                                                {/* Bar section */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <span className="text-xs font-bold text-white truncate">{translateStage(stg.stage_name)}</span>
                                                            {stg.active_orders_count > 0 && (
                                                                <span className="text-[9px] text-sky-400 font-mono flex-shrink-0">
                                                                    ×{stg.active_orders_count}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 font-mono text-[10.5px] flex-shrink-0 ml-2">
                                                            <span className={isComplete ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
                                                                {sQty.toLocaleString('en-US')}
                                                            </span>
                                                            <span className="text-slate-600">/</span>
                                                            <span className="text-slate-500">{tQty > 1 ? tQty.toLocaleString('en-US') : '—'}</span>
                                                            <span className={`font-bold ml-0.5 ${isComplete ? 'text-emerald-400' : 'text-sky-400'}`}>
                                                                {pct}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800/80">
                                                        <div
                                                            className="h-1.5 rounded-full transition-all duration-500"
                                                            style={{
                                                                width: `${pct}%`,
                                                                background: isComplete
                                                                    ? '#10b981'
                                                                    : pct > 60
                                                                    ? 'linear-gradient(90deg,#0284c7,#22d3ee)'
                                                                    : 'linear-gradient(90deg,#1e3a5f,#0284c7)'
                                                            }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Status icon */}
                                                <span className="flex-shrink-0 text-[10px]">
                                                    {isComplete
                                                        ? <i className="fas fa-check-circle text-emerald-400"></i>
                                                        : <i className="fas fa-circle-notch text-slate-600 fa-spin" style={{ animationDuration: '3s' }}></i>
                                                    }
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[10.5px]">
                                <span className="text-slate-500 font-mono">
                                    {language === 'ar' ? 'إجمالي المستهدف' : 'Total target'}:
                                    <strong className="text-amber-400 ml-1">{Number(summary.total_target_pieces || 0).toLocaleString('en-US')}</strong>
                                </span>
                                <Link to="/orders" className="text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium">
                                    <span>{t('dashboard.view_detailed_reports')}</span>
                                    <i className={`fas fa-chevron-${isRTL ? 'left' : 'right'} text-[9px]`}></i>
                                </Link>
                            </div>
                        </div>

                        {/* Priority Orders */}
                        <div className="slate-card p-4">
                            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-700/60">
                                <div className="flex items-center gap-2">
                                    <i className="fas fa-fire text-rose-400 text-xs"></i>
                                    <h3 className="text-xs sm:text-sm font-bold text-white">{t('dashboard.priority_title')}</h3>
                                </div>
                                <Link to="/orders" className="text-[10.5px] text-sky-400 hover:underline font-medium">
                                    {t('common.all')} ({totalOrders})
                                </Link>
                            </div>

                            {priorityOrders.length === 0 ? (
                                <div className="py-6 text-center text-slate-500 text-xs">
                                    <i className="fas fa-check-double text-emerald-600 text-2xl mb-1 block"></i>
                                    {t('dashboard.no_priority_data')}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {priorityOrders.map((ord) => {
                                        const pct = ord.completion_rate || 0;
                                        const barColor = pct >= 90 ? '#10b981' : pct >= 50 ? '#38bdf8' : '#f59e0b';
                                        return (
                                            <div key={ord.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors">
                                                {/* Completion ring placeholder */}
                                                <div className="relative w-9 h-9 flex-shrink-0">
                                                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                                                        <circle cx="18" cy="18" r="14" fill="none" stroke="#1e293b" strokeWidth="3.5" />
                                                        <circle
                                                            cx="18" cy="18" r="14" fill="none"
                                                            stroke={barColor} strokeWidth="3.5"
                                                            strokeDasharray={`${pct * 0.879} 87.9`}
                                                            strokeLinecap="round"
                                                        />
                                                    </svg>
                                                    <span className="absolute inset-0 flex items-center justify-center text-[8.5px] font-mono font-bold text-white">
                                                        {pct}%
                                                    </span>
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-baseline gap-1.5">
                                                        <strong className="text-white font-mono text-xs">{ord.order_number}</strong>
                                                        <span className="text-slate-400 text-[10.5px] truncate">{ord.customer_name || 'Client'}</span>
                                                    </div>
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                        {(ord.target_quantity || 0).toLocaleString('en-US')} {t('common.pieces')}
                                                    </span>
                                                </div>

                                                <span className={`text-[9.5px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                                                    pct >= 100
                                                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                                                        : 'text-sky-400 bg-sky-500/10 border-sky-500/30'
                                                }`}>
                                                    {pct >= 100 ? '✓' : `${pct}%`}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Col 3: Right sidebar (Leaderboard + Live Feed) ─────── */}
                    <div className="space-y-4">

                        {/* Top Scanners Leaderboard */}
                        <div className="slate-card p-4">
                            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-700/60">
                                <div className="flex items-center gap-2">
                                    <i className="fas fa-trophy text-amber-400 text-xs"></i>
                                    <h3 className="text-xs font-bold text-white">{t('dashboard.leaderboard_title')}</h3>
                                </div>
                                <span className="text-[9px] font-mono text-amber-400/70">TODAY</span>
                            </div>

                            {topScanners.length === 0 ? (
                                <div className="py-6 text-center text-slate-500 text-xs">
                                    <i className="fas fa-user-clock text-2xl text-slate-700 mb-1 block"></i>
                                    {t('dashboard.no_scanners_data')}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {topScanners.slice(0, 6).map((sc, idx) => {
                                        const medals   = ['text-amber-400', 'text-slate-300', 'text-orange-500'];
                                        const medalBg  = ['bg-amber-500/15 border-amber-500/30', 'bg-slate-700/50 border-slate-600/40', 'bg-orange-500/10 border-orange-500/20'];
                                        const isTop3   = idx < 3;
                                        const maxCount = topScanners[0]?.scan_count || 1;
                                        const barPct   = Math.round((sc.scan_count / maxCount) * 100);

                                        return (
                                            <div key={sc.scanned_by || idx} className="flex items-center gap-2">
                                                <span className={`w-5 h-5 rounded-md flex items-center justify-center font-mono text-[9.5px] font-black flex-shrink-0 border ${
                                                    isTop3 ? `${medalBg[idx]} ${medals[idx]}` : 'bg-slate-800 border-slate-700 text-slate-500'
                                                }`}>
                                                    {idx + 1}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-baseline mb-0.5">
                                                        <span className="text-[11px] font-bold text-white truncate">{sc.scanned_by}</span>
                                                        <span className="text-[10px] font-mono font-bold text-emerald-400 flex-shrink-0 ml-1">
                                                            {Number(sc.scan_count || 0).toLocaleString('en-US')}
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-slate-900 rounded-full h-1 overflow-hidden">
                                                        <div
                                                            className="h-1 rounded-full"
                                                            style={{
                                                                width: `${barPct}%`,
                                                                background: isTop3 ? '#f59e0b' : '#334155'
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Live Activity Feed */}
                        <div className="slate-card p-4">
                            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-700/60">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                                    <h3 className="text-xs font-bold text-white">{t('dashboard.live_ticker_title')}</h3>
                                </div>
                                <span className="text-[9.5px] font-mono text-emerald-400">LIVE</span>
                            </div>

                            <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-0.5">
                                {liveActivity.length === 0 ? (
                                    <div className="py-6 text-center text-slate-500 text-xs">
                                        <i className="fas fa-satellite-dish text-2xl text-slate-700 mb-1 block"></i>
                                        {t('dashboard.no_live_data')}
                                    </div>
                                ) : (
                                    liveActivity.map((act, i) => (
                                        <div
                                            key={act.id || i}
                                            className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/50 border border-slate-800/60 hover:border-slate-700/80 transition-colors text-[10.5px]"
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${act.source_type === 'external' ? 'bg-cyan-400' : 'bg-sky-400'}`}></span>
                                            <span className="font-mono font-bold text-white tracking-wider truncate flex-1">
                                                {act.barcode}
                                            </span>
                                            <span className="text-sky-300 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-500/20 flex-shrink-0 text-[9px]">
                                                {translateStage(act.stage_name)}
                                            </span>
                                            <span className="text-slate-500 text-[9px] flex-shrink-0">
                                                {act.created_at ? new Date(act.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </span>
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

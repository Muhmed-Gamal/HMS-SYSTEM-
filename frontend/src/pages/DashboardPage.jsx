import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../services/api';

/* ─────────────────────────────────────────────────────────────────────────
   SVG LINE CHART — pure real data, no fallbacks
────────────────────────────────────────────────────────────────────────── */
function LineChart({ data = [], color = '#38bdf8', height = 130 }) {
    if (data.length < 2) {
        return (
            <div className="w-full flex items-center justify-center text-slate-600 text-xs" style={{ height }}>
                {data.length === 0 ? 'لا توجد بيانات بعد — ستظهر بعد أول عملية مسح' : '...'}
            </div>
        );
    }
    const W = 500, H = height;
    const max = Math.max(...data.map(d => d.value), 1);
    const xs = data.map((_, i) => (i / (data.length - 1)) * W);
    const ys = data.map(d => H - 8 - ((d.value / max) * (H - 24)));
    const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ');
    const areaPath = linePath + ` L${W},${H} L0,${H} Z`;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none">
            <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.20" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#lineGrad)" />
            <path d={linePath} fill="none" stroke={color} strokeWidth="2.5"
                strokeLinejoin="round" strokeLinecap="round" />
            {xs.map((x, i) => (
                <circle key={i} cx={x} cy={ys[i]} r="3.5"
                    fill={color} stroke="#0c1322" strokeWidth="2" />
            ))}
        </svg>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
   SVG BAR CHART — real hourly / daily data
────────────────────────────────────────────────────────────────────────── */
function BarChart({ data = [], height = 110 }) {
    if (data.length === 0) {
        return (
            <div className="w-full flex items-center justify-center text-slate-600 text-xs" style={{ height }}>
                لا يوجد نشاط اليوم بعد
            </div>
        );
    }
    const W = 300, H = height;
    const max = Math.max(...data.map(d => d.total), 1);
    const bw = Math.max(10, (W - 24) / data.length - 6);
    const gap = data.length > 1 ? (W - 24 - bw * data.length) / (data.length - 1) : 0;

    return (
        <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full"
            style={{ height: H + 18 }} preserveAspectRatio="none">
            {data.map((d, i) => {
                const fH  = Math.max(2, ((d.factory || 0)  / max) * (H - 8));
                const eH  = Math.max(0, ((d.external || 0) / max) * (H - 8));
                const x   = 12 + i * (bw + gap);
                const isTop = d.total === max;
                return (
                    <g key={i}>
                        <rect x={x} y={H - fH - eH} width={bw} height={eH} rx="2"
                            fill="#22d3ee" opacity={isTop ? 1 : 0.65} />
                        <rect x={x} y={H - fH} width={bw} height={fH} rx="2"
                            fill="#38bdf8" opacity={isTop ? 1 : 0.5} />
                        <text x={x + bw / 2} y={H + 13} textAnchor="middle"
                            fontSize="8.5" fill={isTop ? '#94a3b8' : '#475569'}>
                            {d.label}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
   SVG DONUT — real completion %
────────────────────────────────────────────────────────────────────────── */
function DonutChart({ pct = 0, size = 110, color = '#38bdf8', sublabel = '' }) {
    const r = 44, cx = 60, cy = 60;
    const circ = 2 * Math.PI * r;
    const dash = (Math.min(pct, 100) / 100) * circ;
    return (
        <svg width={size} height={size} viewBox="0 0 120 120">
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth="12" />
            {pct > 0 && (
                <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="12"
                    strokeDasharray={`${dash} ${circ}`}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${cx} ${cy})`}
                    style={{ transition: 'stroke-dasharray 1s ease' }} />
            )}
            <text x={cx} y={cy - 5} textAnchor="middle"
                fontSize="17" fontWeight="900" fill="white">
                {pct > 0 ? `${pct}%` : '—'}
            </text>
            <text x={cx} y={cy + 11} textAnchor="middle"
                fontSize="7.5" fill="#64748b">{sublabel}</text>
        </svg>
    );
}

/* ─────────────────────────────────────────────────────────────────────────
   STAT CARD SKELETON
────────────────────────────────────────────────────────────────────────── */
function StatCard({ label, value, sub, icon, color = 'sky', pulse = false, loading = false }) {
    const colors = {
        sky:     { border: 'border-sky-500',     ring: 'ring-sky-500/20',     icon: 'bg-sky-500/10 border-sky-500/20 text-sky-400',     trend: 'text-sky-400' },
        emerald: { border: 'border-emerald-500', ring: 'ring-emerald-500/20', icon: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', trend: 'text-emerald-400' },
        amber:   { border: 'border-amber-500',   ring: 'ring-amber-500/20',   icon: 'bg-amber-500/10 border-amber-500/20 text-amber-400',   trend: 'text-amber-400' },
        cyan:    { border: 'border-cyan-500',     ring: 'ring-cyan-500/20',     icon: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',     trend: 'text-cyan-400' },
    };
    const c = colors[color];
    return (
        <div className={`relative overflow-hidden rounded-2xl bg-[#0c1322] border p-4 sm:p-5 flex flex-col gap-1 shadow-xl transition-all duration-300
            ${pulse ? `${c.border} ring-2 ${c.ring}` : `border-slate-800 hover:${c.border.replace('border-', 'border-')}/40`}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-current/5 to-transparent pointer-events-none opacity-10" />
            <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                <div className={`w-7 h-7 rounded-lg border flex items-center justify-center text-xs ${c.icon}`}>
                    <i className={`fas ${icon}`} />
                </div>
            </div>
            {loading ? (
                <div className="h-8 w-20 bg-slate-700/50 rounded animate-pulse mt-1" />
            ) : (
                <div className="text-3xl font-black font-mono text-white tracking-tight">{value}</div>
            )}
            {sub && <div className={`text-[10px] font-mono ${c.trend}`}>{sub}</div>}
        </div>
    );
}

/* ═════════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD
═════════════════════════════════════════════════════════════════════════ */
export default function DashboardPage() {
    const { user, companyName, canCreateOrders, isFactoryOwner } = useAuth();
    const { toast } = useToast();
    const { t, isRTL, language } = useLanguage();
    const navigate = useNavigate();

    const [loading, setLoading]         = useState(true);
    const [refreshing, setRefreshing]   = useState(false);
    const [data, setData]               = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [pulse, setPulse]             = useState(false);
    const [chartTab, setChartTab]       = useState('today'); // 'today' | 'week'

    const prevTotalScans = useRef(0);
    const isAr = language === 'ar';

    /* ── loader ── */
    const load = async (manual = false) => {
        if (manual) setRefreshing(true);
        else if (!data) setLoading(true);

        const { ok, data: d } = await api.getDashboardOverview();
        if (ok && d?.success) {
            // pulse on new scan
            const cur = d.summary?.total_scans || 0;
            if (prevTotalScans.current > 0 && cur > prevTotalScans.current) {
                setPulse(true);
                setTimeout(() => setPulse(false), 2000);
            }
            prevTotalScans.current = cur;
            setData(d);
            setLastUpdated(new Date());
        } else if (!data) {
            // only show error toast on first load failure
            toast(t('common.error'), 'error');
        }
        setLoading(false);
        setRefreshing(false);
    };

    const [orderFilter, setOrderFilter] = useState('all'); // 'all' | order_number

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        load();
        // معايشة حية لحظية: تحديث دوري سريع كل 4 ثوانٍ لمتابعة جميع الأوردرات وعمليات المسح الحية
        const iv = setInterval(() => load(false), 4000);
        return () => clearInterval(iv);
    }, [user]);

    /* ── real computed metrics — zero if nothing ── */
    const summary   = data?.summary         || {};
    const stages    = data?.stages_distribution || [];
    const scanners  = data?.top_scanners    || [];
    const activity  = data?.live_activity   || [];
    const orders    = data?.priority_orders || [];
    const hourly    = data?.hourly_activity || [];
    const daily     = data?.daily_movement  || [];

    const totalOrders   = Number(summary.total_orders)   || 0;
    const activeOrders  = Number(summary.active_orders)  || 0;
    const closedOrders  = Number(summary.closed_orders)  || 0;
    const totalScans    = Number(summary.total_scans)    || 0;
    const todayScans    = Number(summary.today_scans)    || 0;
    const todayFactory  = Number(summary.today_factory_scans)  || 0;
    const todayExternal = Number(summary.today_external_scans) || 0;
    const totalPieces   = Number(summary.total_target_pieces)  || 0;
    const activeDevices = Number(summary.active_devices_count) || 0;

    // real scanned pieces — sum of all OrderStages scanned_quantity
    const scannedPieces = stages.reduce((a, s) => a + (Number(s.total_scanned) || 0), 0);

    // real completion pct — 0 if no target
    const completionPct = totalPieces > 0
        ? Math.min(100, Math.round((scannedPieces / totalPieces) * 100))
        : 0;

    /* ── Analytics line chart — real daily_movement data ── */
    const analyticsLine = useMemo(() => {
        if (chartTab === 'week' && daily.length > 0) {
            return daily.map(d => ({
                label: d.day_name
                    ? d.day_name.substring(0, 3)
                    : (d.date || '').substring(5),
                value: Number(d.total_scans) || 0,
            }));
        }
        if (chartTab === 'today' && hourly.length > 0) {
            // show hourly points for today
            return hourly.map(h => ({
                label: `${h.hour}h`,
                value: Number(h.total_scans) || 0,
            }));
        }
        return []; // genuinely empty — no data yet
    }, [chartTab, daily, hourly]);

    /* ── Daily activity bar chart — real hourly data ── */
    const activityBars = useMemo(() => {
        if (hourly.length > 0) {
            return hourly.map(h => ({
                label: `${h.hour}h`,
                factory:  Number(h.factory_scans)  || 0,
                external: Number(h.external_scans) || 0,
                total:    Number(h.total_scans)    || 0,
            }));
        }
        return []; // no scans today yet
    }, [hourly]);

    /* ── Recent events table — معايشة حية لكافة الأوردرات والمسحات الحية ── */
    const filteredActivity = useMemo(() => {
        if (orderFilter === 'all') return activity;
        return activity.filter(a => a.order_number === orderFilter);
    }, [activity, orderFilter]);

    const recentRows = useMemo(() => filteredActivity.slice(0, 30).map(a => ({
        code:    a.barcode     || '—',
        order:   a.order_number || '—',
        client:  a.customer_name || '',
        stage:   a.stage_name  || (a.source_type === 'external' ? (isAr ? 'خارجي' : 'External') : '—'),
        by:      a.scanned_by  || '—',
        type:    a.source_type || 'factory',
        time:    a.created_at
            ? new Date(a.created_at).toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : '—',
    })), [filteredActivity, isAr]);

    /* ── Order tracking (right panel) — متابعة حية لجميع الأوردرات الشغالة ── */
    const trackingList = useMemo(() => orders.map(o => ({
        rawOrder: o.order_number,
        id:     o.order_number || `#${o.id}`,
        label:  o.customer_name || (isAr ? 'غير محدد' : 'Unnamed'),
        pct:    Number(o.completion_rate) || 0,
        status: o.status === 'closed' ? 'closed' : 'active',
        target: Number(o.target_quantity) || 0,
        scanned: Number(o.total_scanned) || 0,
        lastScan: o.last_scan_at ? new Date(o.last_scan_at).toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : null,
    })), [orders, isAr]);

    /* ── peak for annotation ── */
    const peakVal = analyticsLine.length > 0
        ? Math.max(...analyticsLine.map(d => d.value))
        : null;

    /* ════════════════════════════════════════════════════════ RENDER ═══ */
    return (
        <div className="min-h-screen flex flex-col bg-[#070b14] text-slate-100 antialiased font-sans">
            <Header
                title={t('dashboard.title')}
                subtitle={`${companyName} | ${t('common.app_tagline')}`}
                badgeText={isFactoryOwner ? (isAr ? 'لوحة المالك' : 'OWNER') : 'LIVE'}
                activePage="dashboard"
            />

            <main className="flex-1 px-4 sm:px-6 py-5 max-w-[1600px] w-full mx-auto space-y-5">

                {/* ══ WELCOME BAR ══ */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-3 flex-wrap">
                            {isAr
                                ? `مرحباً، ${user?.username || ''}`
                                : `Welcome, ${user?.username || ''}`}
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold transition-all duration-300
                                ${pulse
                                    ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400 scale-110'
                                    : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${pulse ? 'bg-emerald-400 animate-ping' : 'bg-emerald-500 animate-pulse'}`} />
                                {pulse ? (isAr ? '⚡ نبض مسح حي الآن!' : 'LIVE SCAN!') : (isAr ? 'بث حي ومباشر (4ث)' : 'LIVE SYNC (4s)')}
                            </span>
                        </h1>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {lastUpdated
                                ? (isAr
                                    ? `آخر تحديث: ${lastUpdated.toLocaleTimeString('ar-EG')}`
                                    : `Last sync: ${lastUpdated.toLocaleTimeString('en-US')}`)
                                : (isAr ? 'جاري التحميل...' : 'Loading...')}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {canCreateOrders && (
                            <Link to="/create-order"
                                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-lg shadow-sky-600/20 flex items-center gap-2 transition active:scale-95">
                                <i className="fas fa-plus" />
                                {isAr ? 'أمر تشغيل جديد' : '+ New Order'}
                            </Link>
                        )}
                        <button onClick={() => load(true)} disabled={refreshing}
                            className="p-2 rounded-xl bg-[#0c1322] hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                            title={isAr ? 'تحديث يدوي' : 'Manual refresh'}>
                            <i className={`fas fa-rotate text-sm ${refreshing ? 'animate-spin text-sky-400' : ''}`} />
                        </button>
                        <Link to="/orders"
                            className="px-3 py-2 rounded-xl bg-[#0c1322] hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-2 transition">
                            <i className="fas fa-download text-xs text-slate-400" />
                            {isAr ? 'تصدير' : 'Export'}
                        </Link>
                    </div>
                </div>

                {/* ══ ROW 1 — KPI CARDS ══ */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <StatCard
                        label={isAr ? 'مسحات اليوم' : 'Scans Today'}
                        value={todayScans.toLocaleString('en-US')}
                        sub={todayFactory > 0 || todayExternal > 0
                            ? `${todayFactory} ${isAr ? 'مصنع' : 'factory'} · ${todayExternal} ${isAr ? 'خارجي' : 'ext'}`
                            : (isAr ? 'لا يوجد مسح اليوم بعد' : 'No scans yet today')}
                        icon="fa-barcode" color="sky" pulse={pulse} loading={loading} />

                    <StatCard
                        label={isAr ? 'إجمالي الأوردرات' : 'Total Orders'}
                        value={totalOrders.toLocaleString('en-US')}
                        sub={`${activeOrders} ${isAr ? 'نشط' : 'active'} · ${closedOrders} ${isAr ? 'مغلق' : 'closed'}`}
                        icon="fa-clipboard-list" color="emerald" loading={loading} />

                    <StatCard
                        label={isAr ? 'إجمالي المسحات' : 'Total Scans'}
                        value={totalScans > 999 ? `${(totalScans / 1000).toFixed(1)}k` : totalScans.toLocaleString('en-US')}
                        sub={`${activeDevices} ${isAr ? 'جهاز نشط (آخر ساعتين)' : 'active devices (last 2h)'}`}
                        icon="fa-wave-square" color="amber" loading={loading} />

                    <StatCard
                        label={isAr ? 'القطع المنجزة' : 'Pieces Done'}
                        value={scannedPieces > 999 ? `${(scannedPieces / 1000).toFixed(1)}k` : scannedPieces.toLocaleString('en-US')}
                        sub={totalPieces > 0
                            ? `${isAr ? 'من' : 'of'} ${totalPieces.toLocaleString('en-US')} ${isAr ? 'مستهدف' : 'target'}`
                            : (isAr ? 'لا يوجد أوردرات بعد' : 'No orders yet')}
                        icon="fa-layer-group" color="cyan" loading={loading} />
                </div>

                {/* ══ ROW 2 — LINE CHART + BAR CHART ══ */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                    {/* Analytics Line Chart — 8 cols */}
                    <div className="lg:col-span-8 rounded-2xl bg-[#0c1322] border border-slate-800 p-4 sm:p-5 shadow-xl">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-3">
                            <div>
                                <h3 className="text-sm font-bold text-white">
                                    {isAr ? 'تحليلات نشاط المسح' : 'Scanning Analytics'}
                                </h3>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                    {isAr
                                        ? (chartTab === 'today' ? 'الحركة الساعية لليوم الحالي' : 'حركة المسح لآخر 7 أيام')
                                        : (chartTab === 'today' ? 'Hourly scan activity — today' : 'Daily scan movement — last 7 days')}
                                </p>
                            </div>
                            <div className="flex items-center gap-1 bg-[#070b14] rounded-lg p-0.5 border border-slate-800 self-start">
                                {[
                                    { key: 'today', label: isAr ? 'اليوم' : 'Today' },
                                    { key: 'week',  label: isAr ? '7 أيام' : '7 Days' },
                                ].map(tab => (
                                    <button key={tab.key}
                                        onClick={() => setChartTab(tab.key)}
                                        className={`px-2.5 py-1 rounded text-[10px] font-bold transition
                                            ${chartTab === tab.key ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Legend + peak */}
                        <div className="flex items-center gap-4 mb-3 flex-wrap">
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                                {isAr ? 'مسح المصنع' : 'Factory scans'}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                                {isAr ? 'المسح الخارجي' : 'External scans'}
                            </div>
                            {peakVal !== null && peakVal > 0 && (
                                <div className="ms-auto text-[10px] font-mono text-sky-400 font-bold">
                                    Peak: {peakVal.toLocaleString('en-US')}
                                </div>
                            )}
                        </div>

                        <LineChart data={analyticsLine} color="#38bdf8" height={130} />

                        {/* X-axis labels */}
                        {analyticsLine.length >= 2 && (
                            <div className="flex justify-between mt-1 px-0.5">
                                {analyticsLine.map((d, i) => (
                                    <span key={i} className="text-[9px] font-mono text-slate-600">{d.label}</span>
                                ))}
                            </div>
                        )}

                        <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                            <span>
                                {isAr ? 'إجمالي آخر 7 أيام:' : '7-day total:'}{' '}
                                <strong className="text-emerald-400">
                                    {daily.reduce((a, d) => a + (Number(d.total_scans) || 0), 0).toLocaleString('en-US')}
                                </strong>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                {isAr ? 'بث حي لحظي متواصل (كل 4 ثوانٍ)' : 'Live real-time feed (every 4s)'}
                            </span>
                        </div>
                    </div>

                    {/* Daily Activity Bar Chart — 4 cols */}
                    <div className="lg:col-span-4 rounded-2xl bg-[#0c1322] border border-slate-800 p-4 sm:p-5 shadow-xl flex flex-col">
                        <div className="mb-3">
                            <h3 className="text-sm font-bold text-white">
                                {isAr ? 'نشاط اليوم بالساعة' : 'Today by Hour'}
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                                {isAr ? 'توزيع المسح على ساعات اليوم' : 'Scan distribution per hour'}
                            </p>
                        </div>

                        <div className="flex-1 flex items-end min-h-[120px]">
                            <BarChart data={activityBars} height={110} />
                        </div>

                        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-500 font-mono">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-sky-500" />{isAr ? 'مصنع' : 'Factory'}</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-cyan-400" />{isAr ? 'خارجي' : 'External'}</span>
                            <span className="ms-auto text-slate-600">
                                {isAr ? `اليوم: ${todayScans} مسحة` : `Today: ${todayScans} scans`}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ══ ROW 3 — RECENT EVENTS TABLE + RIGHT PANEL ══ */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                    {/* Recent Scan Events Table — 8 cols */}
                    <div className="lg:col-span-8 rounded-2xl bg-[#0c1322] border border-slate-800 shadow-xl overflow-hidden">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-5 py-4 border-b border-slate-800 gap-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        <span>{isAr ? 'معايشة حية لعمليات المسح اللحظية' : 'Live Real-time Scan Feed'}</span>
                                        <span className="badge-clean badge-green text-[9px] font-mono font-bold px-1.5 py-0.5">
                                            LIVE RADAR
                                        </span>
                                    </h3>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                    {isAr
                                        ? `متابعة حية لكافة حركات المسح عبر جميع الأوردرات والخطوط الإنتاجية لحظة بلحظة (${filteredActivity.length} مسحة حديثة)`
                                        : `Live monitoring across all orders and stages (${filteredActivity.length} recent scans)`}
                                </p>
                            </div>

                            {/* فلتر الأوردرات لمشاهدة أوردر بعينه أو كافة الأوردرات حياً */}
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <select
                                    value={orderFilter}
                                    onChange={(e) => setOrderFilter(e.target.value)}
                                    className="bg-slate-900 border border-slate-700/80 text-sky-300 text-xs rounded-lg px-2.5 py-1.5 focus:border-sky-500 font-mono cursor-pointer"
                                    title={isAr ? 'تصفية حركات المسح حسب الأوردر' : 'Filter by Order'}
                                >
                                    <option value="all">⚡ {isAr ? 'كافة الأوردرات والخطوط' : 'All Orders & Stages'}</option>
                                    {trackingList.map(t => (
                                        <option key={t.rawOrder} value={t.rawOrder}>
                                            {t.rawOrder} ({t.label})
                                        </option>
                                    ))}
                                </select>
                                <Link to="/orders"
                                    className="text-[10px] text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 transition whitespace-nowrap">
                                    {isAr ? 'إدارة الأوردرات' : 'Orders'}
                                    <i className={`fas fa-arrow-${isRTL ? 'left' : 'right'} text-[9px]`} />
                                </Link>
                            </div>
                        </div>

                        <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                            {recentRows.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-slate-600 gap-2">
                                    <i className="fas fa-barcode text-3xl opacity-30" />
                                    <p className="text-xs">
                                        {isAr ? 'لا توجد عمليات مسح مسجلة بعد' : 'No scan events recorded yet'}
                                    </p>
                                    <p className="text-[10px] text-slate-700">
                                        {isAr ? 'ستظهر البيانات بمجرد بدء المسح في الماسح' : 'Data appears as soon as scanning begins'}
                                    </p>
                                </div>
                            ) : (
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-800/60 text-slate-500 text-[10px] uppercase font-bold sticky top-0 bg-[#0c1322] z-10">
                                            <th className="px-5 py-2.5 text-start">{isAr ? 'الباركود' : 'Barcode'}</th>
                                            <th className="px-3 py-2.5 text-start">{isAr ? 'الأوردر / العميل' : 'Order / Client'}</th>
                                            <th className="px-3 py-2.5 text-start">{isAr ? 'المرحلة' : 'Stage'}</th>
                                            <th className="px-3 py-2.5 text-start">{isAr ? 'بواسطة' : 'Scanned By'}</th>
                                            <th className="px-3 py-2.5 text-start">{isAr ? 'النوع' : 'Type'}</th>
                                            <th className="px-3 py-2.5 text-start">{isAr ? 'الوقت بالثانية' : 'Time'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentRows.map((row, i) => (
                                            <tr key={i}
                                                className={`border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors
                                                    ${pulse && i === 0 ? 'bg-sky-500/5 border-sky-500/20' : ''}`}>
                                                <td className="px-5 py-2.5 font-mono text-sky-400 font-bold text-[11px] max-w-[140px] truncate">
                                                    {row.code}
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-300 text-[11px]">
                                                    <div className="font-mono font-bold text-white flex items-center gap-1">
                                                        <span>{row.order}</span>
                                                        {row.order !== '—' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setOrderFilter(row.order)}
                                                                className="text-[9px] text-sky-400/80 hover:text-sky-300 underline"
                                                                title={isAr ? 'حصر المعايشة على هذا الأوردر' : 'Filter by this order'}
                                                            >
                                                                [تتبع]
                                                            </button>
                                                        )}
                                                    </div>
                                                    {row.client && (
                                                        <div className="text-[9.5px] text-slate-400 truncate max-w-[130px]">{row.client}</div>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-800 border border-slate-700 text-slate-300">
                                                        {row.stage}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-slate-400">{row.by}</td>
                                                <td className="px-3 py-3">
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                                        row.type === 'external'
                                                            ? 'bg-cyan-500/10 text-cyan-400'
                                                            : 'bg-sky-500/10 text-sky-400'}`}>
                                                        {row.type === 'external' ? (isAr ? 'خارجي' : 'Ext') : (isAr ? 'مصنع' : 'Fact')}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-slate-500 font-mono text-[10px]">{row.time}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    {/* Right panel: Donut + Order Tracking — 4 cols */}
                    <div className="lg:col-span-4 flex flex-col gap-4">

                        {/* Completion Donut */}
                        <div className="rounded-2xl bg-[#0c1322] border border-slate-800 p-4 sm:p-5 shadow-xl">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-white">
                                    {isAr ? 'نسبة الإنجاز الكلي' : 'Overall Completion'}
                                </h3>
                                <span className={`text-[9px] font-mono px-2 py-0.5 rounded border font-bold
                                    ${completionPct === 0 ? 'bg-slate-800 text-slate-500 border-slate-700' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                                    {completionPct > 0 ? 'LIVE' : (isAr ? 'لا بيانات' : 'NO DATA')}
                                </span>
                            </div>

                            <div className="flex items-center gap-4">
                                <DonutChart
                                    pct={completionPct}
                                    size={110}
                                    color={completionPct >= 100 ? '#10b981' : completionPct > 50 ? '#38bdf8' : '#f59e0b'}
                                    sublabel={isAr ? 'مكتمل' : 'Done'}
                                />
                                <div className="flex flex-col gap-2 text-[11px] text-slate-400">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-sky-400" />
                                        {isAr ? 'قطع منجزة' : 'Pieces done'}
                                    </div>
                                    <div className="font-mono font-bold text-white">
                                        {scannedPieces.toLocaleString('en-US')}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="w-2 h-2 rounded-full bg-slate-600" />
                                        {isAr ? 'المستهدف الكلي' : 'Total target'}
                                    </div>
                                    <div className="font-mono font-bold text-slate-400">
                                        {totalPieces > 0 ? totalPieces.toLocaleString('en-US') : '—'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Order Tracking */}
                        <div className="rounded-2xl bg-[#0c1322] border border-slate-800 p-4 sm:p-5 shadow-xl flex-1">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        <span>{isAr ? 'متابعة حية لكافة الأوردرات' : 'All Active Orders'}</span>
                                        <span className="badge-clean badge-amber text-[9px] font-mono px-1.5 py-0.2">
                                            {trackingList.length}
                                        </span>
                                    </h3>
                                    <p className="text-[10px] text-slate-500 mt-0.5">
                                        {isAr ? 'تحديث حي بنسب الإنجاز لكل أوردر' : 'Real-time order progress'}
                                    </p>
                                </div>
                                <Link to="/orders"
                                    className="text-[10px] text-sky-400 hover:text-sky-300 font-semibold transition">
                                    {isAr ? 'جدول الأوردرات' : 'All Orders'}
                                </Link>
                            </div>

                            {trackingList.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-slate-600 gap-1.5">
                                    <i className="fas fa-clipboard-list text-2xl opacity-30" />
                                    <p className="text-xs">
                                        {isAr ? 'لا توجد أوردرات نشطة' : 'No active orders'}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                                    {trackingList.map((item, i) => (
                                        <div key={i} className="space-y-1.5">
                                            <div className="flex items-center justify-between text-[11px]">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-mono text-sky-400 font-bold">{item.id}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setOrderFilter(orderFilter === item.rawOrder ? 'all' : item.rawOrder)}
                                                        className={`text-[9px] px-1 rounded transition ${orderFilter === item.rawOrder ? 'bg-sky-500 text-white font-bold' : 'text-slate-400 hover:text-sky-300'}`}
                                                        title={isAr ? 'تصفية حركات المسح لهذا الأوردر' : 'Filter stream by this order'}
                                                    >
                                                        {orderFilter === item.rawOrder ? '✓ نشط' : '⚡ تتبع'}
                                                    </button>
                                                </div>
                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold
                                                    ${item.status === 'closed'
                                                        ? 'bg-emerald-500/10 text-emerald-400'
                                                        : 'bg-amber-500/10 text-amber-400'}`}>
                                                    {item.status === 'closed'
                                                        ? (isAr ? 'مكتمل' : 'Done')
                                                        : (isAr ? 'جارٍ' : 'Active')}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-[10px] text-slate-400">
                                                <span className="truncate max-w-[160px]">{item.label}</span>
                                                {item.lastScan && (
                                                    <span className="text-[9px] text-emerald-400 font-mono flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                        {item.lastScan}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-700
                                                            ${item.pct >= 100 ? 'bg-emerald-500' : item.pct > 50 ? 'bg-sky-500' : 'bg-amber-500'}`}
                                                        style={{ width: `${item.pct}%` }} />
                                                </div>
                                                <span className="text-[9px] font-mono text-slate-500 w-8 text-end">{item.pct}%</span>
                                            </div>
                                            {item.target > 0 && (
                                                <div className="text-[9px] text-slate-600 font-mono">
                                                    {isAr ? `المستهدف: ${item.target.toLocaleString('en-US')} قطعة` : `Target: ${item.target.toLocaleString('en-US')} pcs`}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Top Scanner */}
                            {scanners.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-[10px]">
                                        <i className="fas fa-star" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[9px] text-slate-500 uppercase font-bold">
                                            {isAr ? 'الأكثر مسحاً' : 'Top Scanner'}
                                        </div>
                                        <div className="text-xs font-bold text-white truncate">
                                            {scanners[0]?.username || scanners[0]?.scanned_by || '—'}
                                        </div>
                                    </div>
                                    <span className="text-sm font-mono font-black text-amber-400">
                                        {Number(scanners[0]?.scan_count || 0).toLocaleString('en-US')}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </main>
        </div>
    );
}

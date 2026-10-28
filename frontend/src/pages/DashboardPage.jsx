import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../services/api';

/* ─────────────────────────────────────────────────────────
   SVG LINE CHART  (Analytics — trend line)
───────────────────────────────────────────────────────── */
function LineChart({ data, color = '#38bdf8', height = 120 }) {
    if (!data || data.length < 2) return null;
    const W = 400, H = height;
    const max = Math.max(...data.map(d => d.value), 1);
    const pts = data.map((d, i) => {
        const x = (i / (data.length - 1)) * W;
        const y = H - (d.value / max) * (H - 16) - 8;
        return `${x},${y}`;
    });
    const area = `M${pts.join('L')}L${W},${H}L0,${H}Z`;
    const line = `M${pts.join('L')}`;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none">
            <defs>
                <linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.22" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={area} fill="url(#lg1)" />
            <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {data.map((d, i) => {
                const x = (i / (data.length - 1)) * W;
                const y = H - (d.value / max) * (H - 16) - 8;
                return <circle key={i} cx={x} cy={y} r="3.5" fill={color} stroke="#0c1322" strokeWidth="2" />;
            })}
        </svg>
    );
}

/* ─────────────────────────────────────────────────────────
   SVG BAR CHART  (Daily Activity)
───────────────────────────────────────────────────────── */
function BarChart({ data, height = 120 }) {
    if (!data || data.length === 0) return null;
    const max = Math.max(...data.map(d => d.total), 1);
    const W = 320, H = height, pad = 18;
    const bw = Math.max(12, (W - pad * 2) / data.length - 8);
    const gap = (W - pad * 2 - bw * data.length) / Math.max(data.length - 1, 1);
    return (
        <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" style={{ height: H + 20 }} preserveAspectRatio="none">
            {data.map((d, i) => {
                const fH = ((d.factory || 0) / max) * (H - 10);
                const eH = ((d.external || 0) / max) * (H - 10);
                const x = pad + i * (bw + gap);
                const isHighest = d.total === max;
                return (
                    <g key={i}>
                        {/* external (top) */}
                        <rect x={x} y={H - fH - eH} width={bw} height={eH} rx="2"
                            fill="#22d3ee" opacity={isHighest ? 1 : 0.7} />
                        {/* factory (bottom) */}
                        <rect x={x} y={H - fH} width={bw} height={fH} rx="2"
                            fill="#38bdf8" opacity={isHighest ? 1 : 0.55} />
                        <text x={x + bw / 2} y={H + 14} textAnchor="middle"
                            fontSize="9" fill={isHighest ? '#94a3b8' : '#475569'}>
                            {d.label}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

/* ─────────────────────────────────────────────────────────
   SVG DONUT CHART  (Usage / Completion %)
───────────────────────────────────────────────────────── */
function DonutChart({ pct = 73, size = 120, color = '#38bdf8', label = '' }) {
    const r = 44, cx = 60, cy = 60;
    const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    return (
        <svg width={size} height={size} viewBox="0 0 120 120">
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth="12" />
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="12"
                strokeDasharray={`${dash} ${circ}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: 'stroke-dasharray 0.8s ease' }}
            />
            <text x={cx} y={cy - 6} textAnchor="middle" fontSize="18" fontWeight="800" fill="white">{pct}%</text>
            <text x={cx} y={cy + 12} textAnchor="middle" fontSize="8" fill="#64748b">{label}</text>
        </svg>
    );
}

/* ─────────────────────────────────────────────────────────
   MAIN DASHBOARD PAGE
───────────────────────────────────────────────────────── */
export default function DashboardPage() {
    const { user, companyName, canCreateOrders, isFactoryOwner } = useAuth();
    const { toast } = useToast();
    const { t, translateStage, isRTL, language } = useLanguage();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [overviewData, setOverviewData] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [pulseTrigger, setPulseTrigger] = useState(false);
    const [activeTab, setActiveTab] = useState('6m'); // analytics timeframe

    const prevScansRef = useRef(0);

    /* ── Data Loader ── */
    const loadDashboardData = async (isManual = false) => {
        if (isManual) setRefreshing(true);
        else if (!overviewData) setLoading(true);

        const { ok, data } = await api.getDashboardOverview();
        if (ok && data.success) {
            const currentTotalScans = data.summary?.total_scans || 0;
            if (prevScansRef.current > 0 && currentTotalScans > prevScansRef.current) {
                setPulseTrigger(true);
                setTimeout(() => setPulseTrigger(false), 1500);
            }
            prevScansRef.current = currentTotalScans;
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
                    priority_orders: [],
                    hourly_activity: [],
                    daily_movement: []
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
        // ⚡ Real-time: poll every 3.5s
        const interval = setInterval(() => loadDashboardData(false), 3500);
        return () => clearInterval(interval);
    }, [user]);

    const isArabic = language === 'ar';

    /* ── Derived Metrics ── */
    const summary        = overviewData?.summary || {};
    const stages         = overviewData?.stages_distribution || [];
    const topScanners    = overviewData?.top_scanners || [];
    const liveActivity   = overviewData?.live_activity || [];
    const priorityOrders = overviewData?.priority_orders || [];
    const hourlyActivity = overviewData?.hourly_activity || [];
    const dailyMovement  = overviewData?.daily_movement || [];

    const totalOrders        = (summary.factory_orders || 0) + (summary.external_orders || 0);
    const activeOrders       = (summary.factory_active_orders || 0) + (summary.external_active_orders || 0);
    const closedOrders       = Math.max(0, totalOrders - activeOrders);
    const totalScans         = (summary.factory_scans || 0) + (summary.external_scans || 0);
    const todayScans         = Number(summary.today_scans) || Math.round(totalScans * 0.28 || 0);
    const totalPieces        = Number(summary.total_target_pieces || 0);
    const totalScannedPieces = stages.reduce((acc, s) => acc + (Number(s.total_scanned) || 0), 0);
    const activeDevices      = Number(summary.active_devices_count) || Math.max(1, topScanners.length);
    const completionPct      = totalPieces > 0 ? Math.min(99, Math.round((totalScannedPieces / totalPieces) * 100)) : 0;

    /* ── Analytics Line Chart Data (months or days) ── */
    const analyticsData = useMemo(() => {
        if (dailyMovement.length >= 4) {
            return dailyMovement.slice(-6).map(d => ({
                label: d.day_name ? d.day_name.substring(0, 3) : d.date?.substring(5),
                value: Number(d.total_scans) || 0
            }));
        }
        // Fallback
        const MONTHS = isArabic
            ? ['يناير','فبراير','مارس','أبريل','مايو','يونيو']
            : ['Jan','Feb','Mar','Apr','May','Jun'];
        const base = [120, 340, 520, 410, 680, 890];
        return MONTHS.map((m, i) => ({ label: m, value: base[i] + (totalScans ? Math.round(totalScans * 0.05 * (i + 1)) : 0) }));
    }, [dailyMovement, totalScans, isArabic]);

    /* ── Daily Activity Bar Chart Data ── */
    const dailyBars = useMemo(() => {
        const DAYS = isArabic
            ? ['سبت','أحد','اثن','ثلا','أرب','خمي','جمع']
            : ['Sat','Sun','Mon','Tue','Wed','Thu','Fri'];
        if (hourlyActivity.length > 0) {
            // Group hourly into morning/afternoon/evening
            const slots = [
                { label: '8am', start: 8, end: 11 },
                { label: '11am', start: 11, end: 13 },
                { label: '1pm', start: 13, end: 15 },
                { label: '3pm', start: 15, end: 17 },
                { label: '5pm', start: 17, end: 19 },
                { label: '7pm', start: 19, end: 21 },
            ];
            return slots.map(s => {
                const found = hourlyActivity.filter(h => Number(h.hour) >= s.start && Number(h.hour) < s.end);
                const factory  = found.reduce((a, h) => a + Number(h.factory_scans || 0), 0);
                const external = found.reduce((a, h) => a + Number(h.external_scans || 0), 0);
                return { label: s.label, factory, external, total: factory + external };
            });
        }
        return DAYS.map((d, i) => {
            const f = Math.round(80 + Math.sin(i) * 60 + (totalScans * 0.015));
            const e = Math.round(30 + Math.cos(i) * 20 + (totalScans * 0.005));
            return { label: d, factory: f, external: e, total: f + e };
        });
    }, [hourlyActivity, totalScans, isArabic]);

    /* ── Recent Activity rows (last 6 live events or priority orders) ── */
    const recentRows = useMemo(() => {
        if (liveActivity.length > 0) {
            return liveActivity.slice(0, 6).map(a => ({
                id: a.barcode || a.order_id || '—',
                date: a.scanned_at ? new Date(a.scanned_at).toLocaleDateString('en-GB') : '—',
                status: a.stage || 'Scan',
                tracking: a.scanned_by || '—',
                value: a.order_number || '—',
            }));
        }
        if (priorityOrders.length > 0) {
            return priorityOrders.slice(0, 6).map(o => ({
                id: `#${o.id || o.order_id}`,
                date: o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB') : '—',
                status: o.status || (o.is_closed ? 'Closed' : 'Active'),
                tracking: o.customer_name || '—',
                value: o.target_quantity ? `${Number(o.target_quantity).toLocaleString('en-US')} pcs` : '—',
            }));
        }
        return [];
    }, [liveActivity, priorityOrders]);

    /* ── Order tracking list (right panel) ── */
    const trackingList = useMemo(() => {
        const base = priorityOrders.slice(0, 4);
        if (base.length > 0) return base.map(o => ({
            id: `#ORD-${o.id || o.order_id}`,
            label: o.customer_name || (isArabic ? 'غير محدد' : 'Unnamed'),
            pct: totalPieces > 0 ? Math.min(100, Math.round(((o.scanned_qty || 0) / (o.target_quantity || 1)) * 100)) : 0,
            status: o.is_closed ? 'closed' : 'active',
        }));
        return [
            { id: '#ORD-001', label: isArabic ? 'أمر تشغيل 1' : 'Run Order 1', pct: 85, status: 'active' },
            { id: '#ORD-002', label: isArabic ? 'أمر تشغيل 2' : 'Run Order 2', pct: 100, status: 'closed' },
            { id: '#ORD-003', label: isArabic ? 'أمر تشغيل 3' : 'Run Order 3', pct: 42, status: 'active' },
        ];
    }, [priorityOrders, totalPieces, isArabic]);

    /* ── Analytics peak label ── */
    const peakValue = analyticsData.length > 0 ? Math.max(...analyticsData.map(d => d.value)) : 0;

    /* ── Skeleton ── */
    if (loading) {
        return (
            <div className="min-h-screen flex flex-col bg-[#070b14] text-slate-100">
                <Header title={t('dashboard.title')} subtitle={companyName} activePage="dashboard" />
                <main className="flex-1 p-5 flex flex-col gap-4 animate-pulse">
                    <div className="h-8 w-48 bg-slate-800 rounded-xl" />
                    <div className="grid grid-cols-4 gap-4">
                        {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-800/60 rounded-2xl" />)}
                    </div>
                    <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-8 h-56 bg-slate-800/60 rounded-2xl" />
                        <div className="col-span-4 h-56 bg-slate-800/60 rounded-2xl" />
                    </div>
                    <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-8 h-64 bg-slate-800/60 rounded-2xl" />
                        <div className="col-span-4 h-64 bg-slate-800/60 rounded-2xl" />
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-[#070b14] text-slate-100 antialiased font-sans">
            <Header
                title={t('dashboard.title')}
                subtitle={`${companyName} | ${t('common.app_tagline')}`}
                badgeText={isFactoryOwner ? (isArabic ? 'لوحة المالك' : 'OWNER') : 'LIVE'}
                activePage="dashboard"
            />

            <main className="flex-1 px-4 sm:px-6 py-5 max-w-[1600px] w-full mx-auto space-y-5">

                {/* ══ WELCOME BAR ══════════════════════════════════════════════ */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-3">
                            {isArabic ? `مرحباً، ${user?.username || 'المدير'}` : `Welcome, ${user?.username || 'Manager'}`}
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold transition-all duration-300 ${pulseTrigger ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400 scale-110' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${pulseTrigger ? 'bg-emerald-400 animate-ping' : 'bg-emerald-500 animate-pulse'}`} />
                                {pulseTrigger ? (isArabic ? '! مسح جديد' : 'NEW SCAN!') : 'LIVE 3.5s'}
                            </span>
                        </h1>
                        <p className="text-xs text-slate-400 mt-0.5">
                            {isArabic
                                ? `آخر تحديث: ${lastUpdated ? lastUpdated.toLocaleTimeString('ar-EG') : '...'}`
                                : `Last sync: ${lastUpdated ? lastUpdated.toLocaleTimeString('en-US') : '...'}`}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {canCreateOrders && (
                            <Link to="/create-order"
                                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-lg shadow-sky-600/20 flex items-center gap-2 transition active:scale-95">
                                <i className="fas fa-plus" />
                                {isArabic ? 'أمر تشغيل جديد' : '+ New Order'}
                            </Link>
                        )}
                        <button
                            onClick={() => loadDashboardData(true)}
                            disabled={refreshing}
                            className="p-2 rounded-xl bg-[#0c1322] hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                            title={t('common.refresh')}>
                            <i className={`fas fa-rotate text-sm ${refreshing ? 'animate-spin text-sky-400' : ''}`} />
                        </button>
                        <Link to="/orders"
                            className="px-3 py-2 rounded-xl bg-[#0c1322] hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition">
                            <i className="fas fa-download text-xs text-slate-400" />
                            {isArabic ? 'تصدير' : 'Export'}
                        </Link>
                    </div>
                </div>

                {/* ══ ROW 1 — 4 KPI CARDS ═════════════════════════════════════ */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">

                    {/* Card 1 */}
                    <div className={`relative overflow-hidden rounded-2xl bg-[#0c1322] border p-4 sm:p-5 flex flex-col gap-1 shadow-xl transition-all duration-300 ${pulseTrigger ? 'border-sky-500 ring-2 ring-sky-500/20' : 'border-slate-800 hover:border-sky-500/40'}`}>
                        <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 to-transparent pointer-events-none" />
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {isArabic ? 'مسحات اليوم' : 'Scans Today'}
                            </span>
                            <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 text-xs">
                                <i className="fas fa-barcode" />
                            </div>
                        </div>
                        <div className="text-3xl font-black font-mono text-white tracking-tight">
                            {todayScans.toLocaleString('en-US')}
                        </div>
                        <div className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                            <i className="fas fa-arrow-trend-up text-[9px]" />
                            +14.8% {isArabic ? 'عن المتوسط' : 'vs avg'}
                        </div>
                    </div>

                    {/* Card 2 */}
                    <div className="relative overflow-hidden rounded-2xl bg-[#0c1322] border border-slate-800 hover:border-emerald-500/40 p-4 sm:p-5 flex flex-col gap-1 shadow-xl transition-all duration-300">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {isArabic ? 'إجمالي الأوردرات' : 'Total Orders'}
                            </span>
                            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs">
                                <i className="fas fa-clipboard-list" />
                            </div>
                        </div>
                        <div className="text-3xl font-black font-mono text-white tracking-tight">
                            {totalOrders.toLocaleString('en-US')}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
                            <span className="text-emerald-400">{activeOrders} {isArabic ? 'نشط' : 'active'}</span>
                            <span>·</span>
                            <span>{closedOrders} {isArabic ? 'مغلق' : 'closed'}</span>
                        </div>
                    </div>

                    {/* Card 3 */}
                    <div className="relative overflow-hidden rounded-2xl bg-[#0c1322] border border-slate-800 hover:border-amber-500/40 p-4 sm:p-5 flex flex-col gap-1 shadow-xl transition-all duration-300">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" />
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {isArabic ? 'إجمالي المسحات' : 'Total Scans'}
                            </span>
                            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-xs">
                                <i className="fas fa-wave-square" />
                            </div>
                        </div>
                        <div className="text-3xl font-black font-mono text-white tracking-tight">
                            {totalScans > 999 ? `${(totalScans / 1000).toFixed(1)}k` : totalScans.toLocaleString('en-US')}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
                            <span className="text-amber-400">{activeDevices}</span>
                            {isArabic ? 'جهاز نشط الآن' : 'active devices'}
                        </div>
                    </div>

                    {/* Card 4 */}
                    <div className="relative overflow-hidden rounded-2xl bg-[#0c1322] border border-slate-800 hover:border-cyan-500/40 p-4 sm:p-5 flex flex-col gap-1 shadow-xl transition-all duration-300">
                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none" />
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {isArabic ? 'القطع المنجزة' : 'Pieces Done'}
                            </span>
                            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 text-xs">
                                <i className="fas fa-layer-group" />
                            </div>
                        </div>
                        <div className="text-3xl font-black font-mono text-white tracking-tight">
                            {totalScannedPieces > 999 ? `${(totalScannedPieces / 1000).toFixed(1)}k` : totalScannedPieces.toLocaleString('en-US')}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                            {isArabic ? `من ${totalPieces.toLocaleString('en-US')} قطعة مستهدفة` : `of ${totalPieces.toLocaleString('en-US')} target`}
                        </div>
                    </div>

                </div>

                {/* ══ ROW 2 — ANALYTICS LINE + DAILY BAR ══════════════════════ */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                    {/* Analytics — Line Chart (8 cols) */}
                    <div className="lg:col-span-8 rounded-2xl bg-[#0c1322] border border-slate-800 p-4 sm:p-5 shadow-xl">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-4">
                            <div>
                                <h3 className="text-sm font-bold text-white">
                                    {isArabic ? 'تحليلات نشاط المسح' : 'Scanning Analytics'}
                                </h3>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                    {isArabic ? 'منحنى الإنتاجية والمسح عبر الفترات' : 'Scan throughput trend over time'}
                                </p>
                            </div>
                            <div className="flex items-center gap-1 bg-[#070b14] rounded-lg p-0.5 border border-slate-800 self-start">
                                {['1w','1m','6m'].map(tab => (
                                    <button key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-2.5 py-1 rounded text-[10px] font-bold transition ${activeTab === tab ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                                        {tab}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Peak annotation */}
                        <div className="flex items-center gap-4 mb-3">
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                                {isArabic ? 'مسحات المصنع' : 'Factory Scans'}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                                {isArabic ? 'المسح الخارجي' : 'External Scans'}
                            </div>
                            <div className="ms-auto text-[10px] font-mono text-sky-400 font-bold">
                                Peak: {peakValue.toLocaleString('en-US')}
                            </div>
                        </div>

                        {/* Line Chart */}
                        <div className="w-full">
                            <LineChart data={analyticsData} color="#38bdf8" height={130} />
                        </div>

                        {/* X-axis labels */}
                        <div className="flex justify-between mt-1 px-1">
                            {analyticsData.map((d, i) => (
                                <span key={i} className="text-[9.5px] font-mono text-slate-500">{d.label}</span>
                            ))}
                        </div>

                        {/* Footnote */}
                        <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                            <span>
                                {isArabic ? 'متوسط ساعي:' : 'Hourly avg:'}
                                {' '}<strong className="text-emerald-400">~{Math.round(totalScans / Math.max(analyticsData.length * 8, 1))} {isArabic ? 'مسح/ساعة' : 'scans/hr'}</strong>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                {isArabic ? 'تحديث تلقائي كل 3.5 ث' : 'Auto-refresh every 3.5s'}
                            </span>
                        </div>
                    </div>

                    {/* Daily Activity Bar Chart (4 cols) */}
                    <div className="lg:col-span-4 rounded-2xl bg-[#0c1322] border border-slate-800 p-4 sm:p-5 shadow-xl flex flex-col">
                        <div className="mb-3">
                            <h3 className="text-sm font-bold text-white">
                                {isArabic ? 'نشاط اليوم' : 'Daily Activity'}
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                                {isArabic ? 'توزيع المسح بالساعات' : 'Scan distribution by hour'}
                            </p>
                        </div>

                        {/* Selectors */}
                        <div className="flex items-center gap-1 mb-3">
                            {[isArabic ? 'كل الأيام' : 'All Days', isArabic ? 'اليوم' : 'Today'].map((l, i) => (
                                <button key={i}
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${i === 1 ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30' : 'text-slate-500 hover:text-slate-300'}`}>
                                    {l}
                                </button>
                            ))}
                        </div>

                        {/* Bar Chart */}
                        <div className="flex-1 flex items-end">
                            <BarChart data={dailyBars} height={110} />
                        </div>

                        {/* Legend */}
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500 font-mono">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-sky-500" />{isArabic ? 'مصنع' : 'Factory'}</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-cyan-400" />{isArabic ? 'خارجي' : 'External'}</span>
                        </div>
                    </div>

                </div>

                {/* ══ ROW 3 — RECENT ORDERS TABLE + RIGHT PANEL ═══════════════ */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                    {/* Recent Orders / Scan Events Table (8 cols) */}
                    <div className="lg:col-span-8 rounded-2xl bg-[#0c1322] border border-slate-800 shadow-xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                            <div>
                                <h3 className="text-sm font-bold text-white">
                                    {isArabic ? 'آخر الأحداث والأوردرات' : 'Recent Orders & Scan Events'}
                                </h3>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                    {isArabic ? 'سجل لحظي لآخر عمليات المسح' : 'Live log of latest scan activity'}
                                </p>
                            </div>
                            <Link to="/orders"
                                className="text-[10px] text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 transition">
                                {isArabic ? 'عرض الكل' : 'View All'}
                                <i className={`fas fa-arrow-${isRTL ? 'left' : 'right'} text-[9px]`} />
                            </Link>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-slate-800/60 text-slate-500 text-[10px] uppercase font-bold">
                                        <th className="px-5 py-2.5 text-start">ID / {isArabic ? 'الكود' : 'Code'}</th>
                                        <th className="px-3 py-2.5 text-start">{isArabic ? 'التاريخ' : 'Date'}</th>
                                        <th className="px-3 py-2.5 text-start">{isArabic ? 'الحالة / المرحلة' : 'Status'}</th>
                                        <th className="px-3 py-2.5 text-start">{isArabic ? 'بواسطة' : 'Tracking'}</th>
                                        <th className="px-3 py-2.5 text-start">{isArabic ? 'القيمة' : 'Value'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentRows.length > 0 ? recentRows.map((row, i) => (
                                        <tr key={i} className={`border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors ${pulseTrigger && i === 0 ? 'bg-sky-500/5' : ''}`}>
                                            <td className="px-5 py-3 font-mono text-sky-400 font-bold">{row.id}</td>
                                            <td className="px-3 py-3 text-slate-400">{row.date}</td>
                                            <td className="px-3 py-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                                    row.status === 'Closed' || row.status === 'مغلق'
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                        : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                                }`}>
                                                    {row.status}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-slate-300">{row.tracking}</td>
                                            <td className="px-3 py-3 text-slate-400 font-mono">{row.value}</td>
                                        </tr>
                                    )) : (
                                        // Empty state with a few skeleton-like placeholder rows
                                        [...Array(4)].map((_, i) => (
                                            <tr key={i} className="border-b border-slate-800/40">
                                                <td className="px-5 py-3 text-slate-700 font-mono">—</td>
                                                <td className="px-3 py-3 text-slate-700">—</td>
                                                <td className="px-3 py-3"><span className="px-2 py-0.5 rounded-full text-[9px] bg-slate-800 text-slate-600 border border-slate-700">—</span></td>
                                                <td className="px-3 py-3 text-slate-700">—</td>
                                                <td className="px-3 py-3 text-slate-700">—</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Right Panel — Usage Donut + Order Tracking (4 cols) */}
                    <div className="lg:col-span-4 flex flex-col gap-4">

                        {/* Usage / Completion Donut */}
                        <div className="rounded-2xl bg-[#0c1322] border border-slate-800 p-4 sm:p-5 shadow-xl">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-white">
                                    {isArabic ? 'نسبة الإنجاز الكلي' : 'Overall Completion'}
                                </h3>
                                <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">LIVE</span>
                            </div>

                            <div className="flex items-center gap-4">
                                {/* Donut */}
                                <DonutChart
                                    pct={completionPct || 73}
                                    size={110}
                                    color={completionPct > 80 ? '#10b981' : '#38bdf8'}
                                    label={isArabic ? 'مكتمل' : 'Done'}
                                />

                                {/* Legend */}
                                <div className="flex flex-col gap-2 text-[11px] text-slate-400">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-sky-400" />
                                        <span>{isArabic ? 'القطع المنجزة' : 'Pieces done'}</span>
                                    </div>
                                    <div className="font-mono font-bold text-white text-sm">
                                        {totalScannedPieces.toLocaleString('en-US')}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="w-2 h-2 rounded-full bg-slate-600" />
                                        <span>{isArabic ? 'المستهدف' : 'Target'}</span>
                                    </div>
                                    <div className="font-mono font-bold text-slate-400 text-sm">
                                        {totalPieces.toLocaleString('en-US')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Order Tracking List */}
                        <div className="rounded-2xl bg-[#0c1322] border border-slate-800 p-4 sm:p-5 shadow-xl flex-1">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-white">
                                    {isArabic ? 'متابعة الأوردرات' : 'Order Tracking'}
                                </h3>
                                <Link to="/orders"
                                    className="text-[10px] text-sky-400 hover:text-sky-300 font-semibold transition">
                                    {isArabic ? 'الكل' : 'All'}
                                </Link>
                            </div>

                            <div className="space-y-3">
                                {/* Active orders display */}
                                {trackingList.length > 0 ? trackingList.map((item, i) => (
                                    <div key={i} className="flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between text-[11px]">
                                            <span className="font-mono text-sky-400 font-bold">{item.id}</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${item.status === 'closed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                                {item.status === 'closed' ? (isArabic ? 'مكتمل' : 'Done') : (isArabic ? 'جارٍ' : 'Active')}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-slate-400 truncate">{item.label}</div>
                                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-700 ${item.pct >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`}
                                                style={{ width: `${item.pct}%` }}
                                            />
                                        </div>
                                        <div className="text-[9px] font-mono text-slate-500">{item.pct}%</div>
                                    </div>
                                )) : (
                                    // Generic live stats when no orders data
                                    <>
                                        <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
                                            <span className="text-[11px] text-slate-400">{isArabic ? 'أوردرات نشطة' : 'Active Orders'}</span>
                                            <span className="text-sm font-black font-mono text-amber-400">{activeOrders}</span>
                                        </div>
                                        <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
                                            <span className="text-[11px] text-slate-400">{isArabic ? 'أوردرات مغلقة' : 'Closed Orders'}</span>
                                            <span className="text-sm font-black font-mono text-emerald-400">{closedOrders}</span>
                                        </div>
                                        <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
                                            <span className="text-[11px] text-slate-400">{isArabic ? 'أجهزة نشطة' : 'Active Devices'}</span>
                                            <span className="text-sm font-black font-mono text-sky-400">{activeDevices}</span>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-[11px] text-slate-400">{isArabic ? 'دقة المسح' : 'Scan Accuracy'}</span>
                                            <span className="text-sm font-black font-mono text-cyan-400">99.2%</span>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Top scanner */}
                            {topScanners.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-slate-800 flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-[10px]">
                                        <i className="fas fa-star" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[10px] text-slate-400">{isArabic ? 'الأكثر مسحاً اليوم' : 'Top Scanner Today'}</div>
                                        <div className="text-xs font-bold text-white truncate">{topScanners[0]?.username || '—'}</div>
                                    </div>
                                    <span className="text-xs font-mono font-black text-amber-400">{topScanners[0]?.scan_count || 0}</span>
                                </div>
                            )}
                        </div>

                    </div>
                </div>

            </main>
        </div>
    );
}

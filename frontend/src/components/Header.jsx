import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getNowFormatted } from '../services/timeSync';

export default function Header({ title, subtitle, badgeText = 'DASHBOARD', activePage = '' }) {
    const { 
        user, logout, 
        isAdmin, isSuperAdmin, isMasterOwner,
        isProduction, isAdminView, isExternalOperator, isExternalAdmin, 
        canCreateOrders, canManageUsers, canViewOrders, companyName 
    } = useAuth();
    const { confirm } = useToast();
    const navigate = useNavigate();
    const [liveTime, setLiveTime] = useState(() => getNowFormatted(true));

    // قواعد الصلاحيات الموحدة للناف بار
    const canViewCreateOrder = isSuperAdmin || isAdmin || canCreateOrders;
    const canViewStandardOrders = isSuperAdmin || isAdmin || canViewOrders || (!isProduction && !isExternalOperator && !isExternalAdmin);
    const canViewExternal = isSuperAdmin || isAdmin || isExternalAdmin || isAdminView || canViewOrders;
    const canViewScanner = !isExternalAdmin;
    const canViewAdmin = isSuperAdmin || isAdmin || isExternalAdmin || canManageUsers;
    const canViewPresentation = isSuperAdmin || isAdmin;

    useEffect(() => {
        const timer = setInterval(() => {
            setLiveTime(getNowFormatted(true));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const handleLogout = async () => {
        const ok = await confirm('تسجيل الخروج', 'هل أنت متأكد من إنهاء جلسة العمل الحالية؟');
        if (ok) {
            logout();
            navigate('/login');
        }
    };

    const getRoleBadge = () => {
        if (!user) return null;
        if (isSuperAdmin || ['gamal', 'auf'].includes((user.username || '').toLowerCase())) {
            return (
                <span className="badge-clean text-[10.5px] px-2.5 py-0.5 rounded-md flex items-center gap-1.5 font-bold" style={{background:'linear-gradient(135deg,#78350f,#92400e)',color:'#fef3c7',border:'1px solid #b45309',boxShadow:'0 1px 4px rgba(0,0,0,0.3)'}}>
                    <i className="fas fa-crown text-amber-300 text-[10px]"></i> مالك السيستم
                </span>
            );
        }
        if (user.role === 'admin') {
            return <span className="badge-clean badge-red text-[10.5px] px-2.5 py-0.5 rounded-md font-bold">مدير نظام</span>;
        }
        if (user.role === 'admin_view') {
            return <span className="badge-clean badge-blue text-[10.5px] px-2.5 py-0.5 rounded-md font-bold">متابع إداري</span>;
        }
        if (user.role === 'external_operator') {
            return (
                <span className="badge-clean text-[10.5px] px-2.5 py-0.5 rounded-md font-bold" style={{background:'rgba(6,182,212,0.15)',color:'#22d3ee',border:'1px solid rgba(6,182,212,0.3)'}}>
                    <span className="badge-clean-dot" style={{background:'#22d3ee'}}></span> مشغل خارجي
                </span>
            );
        }
        if (user.role === 'external_admin') {
            return (
                <span className="badge-clean text-[10.5px] px-2.5 py-0.5 rounded-md font-bold" style={{background:'rgba(6,182,212,0.15)',color:'#22d3ee',border:'1px solid rgba(6,182,212,0.3)'}}>
                    <span className="badge-clean-dot" style={{background:'#22d3ee'}}></span> مشرف خارجي
                </span>
            );
        }
        return (
            <span className="badge-clean badge-green text-[10.5px] px-2.5 py-0.5 rounded-md font-bold">
                مشغل: {user.stage_permission || 'إنتاج'}
            </span>
        );
    };

    const getUserInitial = () => {
        if (!user?.username) return 'U';
        return user.username.charAt(0).toUpperCase();
    };

    return (
        <header className="no-print sticky top-0 z-40 border-b border-slate-800/70"
            style={{ background: 'rgba(7,11,22,0.97)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>

            {/* Top accent gradient line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500" />

            <div className="max-w-7xl mx-auto px-3 sm:px-5 flex items-center justify-between gap-3 h-14">

                {/* ── LEFT: Logo + CTA ── */}
                <div className="flex items-center gap-2.5 flex-shrink-0">
                    <Link to="/orders" className="flex items-center gap-2 group">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm transition-transform group-hover:scale-105"
                            style={{ background: 'linear-gradient(135deg, #0ea5e9, #2563eb)', boxShadow: '0 0 14px rgba(14,165,233,0.3), inset 0 1px 0 rgba(255,255,255,0.2)' }}>
                            <i className="fas fa-barcode"></i>
                        </div>
                        <div className="hidden sm:flex flex-col leading-none">
                            <div className="flex items-center gap-1.5">
                                <span className="text-sm font-black text-white tracking-wide group-hover:text-sky-300 transition-colors">HMS</span>
                                <span className="text-[9px] font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20 font-mono">SYSTEM</span>
                            </div>
                            <span className="text-[9px] text-slate-500 font-mono mt-0.5">Industrial Platform</span>
                        </div>
                    </Link>

                    {canViewCreateOrder && (
                        <>
                            <div className="h-5 w-px bg-slate-800 hidden md:block"></div>
                            <Link
                                to="/create-order"
                                className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                                    activePage === 'create-order'
                                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm shadow-blue-500/30 border border-sky-400/50'
                                        : 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 border border-sky-500/25'
                                }`}
                            >
                                <i className="fas fa-plus-circle text-xs"></i>
                                <span>أوردر جديد</span>
                            </Link>
                        </>
                    )}
                </div>

                {/* ── CENTER: Nav ── */}
                <nav className="flex items-center gap-0.5 p-1 rounded-xl overflow-x-auto no-scrollbar flex-1 justify-center"
                    style={{ background: 'rgba(5,9,20,0.8)', border: '1px solid rgba(148,163,184,0.07)' }}>

                    {canViewCreateOrder && (
                        <Link to="/create-order"
                            className={`flex md:hidden items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap flex-shrink-0 transition-all ${
                                activePage === 'create-order'
                                    ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white'
                                    : 'text-sky-400 bg-sky-500/10 border border-sky-500/20'
                            }`}>
                            <i className="fas fa-plus-circle text-xs"></i>
                            <span>+ أوردر</span>
                        </Link>
                    )}

                    {canViewStandardOrders && (
                        <Link to="/orders"
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap flex-shrink-0 font-semibold ${
                                activePage === 'orders'
                                    ? 'text-white font-bold shadow-sm'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                            }`}
                            style={activePage === 'orders' ? { background: 'linear-gradient(135deg,#1e40af,#2563eb)', boxShadow: '0 2px 8px rgba(37,99,235,0.3)', border: '1px solid rgba(96,165,250,0.3)' } : {}}>
                            <i className="fas fa-layer-group text-xs"></i>
                            <span>الأوردرات</span>
                        </Link>
                    )}

                    {canViewExternal && (
                        <a href="/external_tracking.html"
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap flex-shrink-0 font-semibold ${
                                activePage === 'external'
                                    ? 'text-white font-bold'
                                    : 'text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10'
                            }`}
                            style={activePage === 'external' ? { background: 'linear-gradient(135deg,#0e7490,#0891b2)', boxShadow: '0 2px 8px rgba(6,182,212,0.3)', border: '1px solid rgba(34,211,238,0.3)' } : {}}>
                            <i className="fas fa-truck-loading text-xs"></i>
                            <span>التشغيل الخارجي</span>
                        </a>
                    )}

                    {canViewScanner && (
                        <Link to="/"
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap flex-shrink-0 font-semibold ${
                                activePage === 'scanner'
                                    ? 'text-white font-bold'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                            }`}
                            style={activePage === 'scanner' ? { background: 'linear-gradient(135deg,#3730a3,#4f46e5)', boxShadow: '0 2px 8px rgba(79,70,229,0.3)', border: '1px solid rgba(129,140,248,0.3)' } : {}}>
                            <i className="fas fa-barcode text-xs"></i>
                            <span>السكانر</span>
                        </Link>
                    )}

                    {canViewAdmin && (
                        <Link to="/admin"
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap flex-shrink-0 font-semibold ${
                                activePage === 'admin'
                                    ? 'text-white font-bold'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                            }`}
                            style={activePage === 'admin' ? { background: 'linear-gradient(135deg,#6b21a8,#7c3aed)', boxShadow: '0 2px 8px rgba(124,58,237,0.3)', border: '1px solid rgba(167,139,250,0.3)' } : {}}>
                            <i className="fas fa-users-cog text-xs"></i>
                            <span>المستخدمين</span>
                        </Link>
                    )}

                    {canViewPresentation && (
                        <a href="/presentation.html" target="_blank" rel="noreferrer"
                            className="flex md:hidden items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 whitespace-nowrap flex-shrink-0 font-semibold">
                            <i className="fas fa-file-powerpoint text-xs"></i>
                            <span>البرزنتيشن</span>
                        </a>
                    )}
                </nav>

                {/* ── RIGHT: Utilities + Profile ── */}
                <div className="flex items-center gap-2 flex-shrink-0">

                    {/* Mobile: profile + logout */}
                    <div className="flex items-center gap-1.5 md:hidden">
                        <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                            style={{ background: '#0f172a', border: '1px solid rgba(148,163,184,0.12)' }}>
                            {getRoleBadge()}
                            {user?.username && (
                                <span className="font-mono font-bold text-white text-[11px] truncate max-w-[80px]">{user.username}</span>
                            )}
                        </div>
                        <button onClick={handleLogout}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-all"
                            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.22)' }}
                            title="تسجيل الخروج">
                            <i className="fas fa-sign-out-alt"></i>
                        </button>
                    </div>

                    {/* Desktop utilities */}
                    <div className="hidden md:flex items-center gap-2">

                        {canViewPresentation && (
                            <a href="/presentation.html" target="_blank" rel="noreferrer"
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/20 transition-all font-medium"
                                title="الملف التعريفي للنظام">
                                <i className="fas fa-file-powerpoint text-xs"></i>
                                <span className="hidden xl:inline">البرزنتيشن</span>
                            </a>
                        )}

                        <div className="h-5 w-px bg-slate-800/80"></div>

                        {/* Live clock */}
                        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono text-slate-300"
                            style={{ background: 'rgba(7,13,25,0.8)', border: '1px solid rgba(148,163,184,0.07)' }}>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_5px_rgba(52,211,153,0.5)]"></span>
                            <span>{liveTime}</span>
                        </div>

                        {/* User capsule */}
                        <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl"
                            style={{ background: '#0d1627', border: '1px solid rgba(148,163,184,0.12)' }}>
                            <div className="w-5 h-5 rounded-full text-white text-[10px] font-black flex items-center justify-center font-mono"
                                style={{ background: 'linear-gradient(135deg, #0ea5e9, #4f46e5)' }}>
                                {getUserInitial()}
                            </div>
                            {user?.username && (
                                <span className="text-xs font-mono font-bold text-white">{user.username}</span>
                            )}
                            {getRoleBadge()}
                        </div>

                        <button onClick={handleLogout}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-all hover:scale-105"
                            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.22)' }}
                            title="تسجيل الخروج">
                            <i className="fas fa-sign-out-alt"></i>
                        </button>
                    </div>
                </div>

            </div>
        </header>
    );
}

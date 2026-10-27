import React, { useState, useEffect, useRef } from 'react';
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
    const [moreOpen, setMoreOpen] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const moreRef = useRef(null);

    // Permissions
    const canViewCreateOrder = isSuperAdmin || isAdmin || canCreateOrders;
    const canViewStandardOrders = isSuperAdmin || isAdmin || canViewOrders || (!isProduction && !isExternalOperator && !isExternalAdmin);
    const canViewExternal = isSuperAdmin || isAdmin || isExternalAdmin || isAdminView || canViewOrders;
    const canViewScanner = !isExternalAdmin;
    const canViewAdmin = isSuperAdmin || isAdmin || isExternalAdmin || canManageUsers;
    const canViewPresentation = isSuperAdmin || isAdmin;

    // Primary nav links (always visible)
    const primaryLinks = [
        { to: '/dashboard', label: 'الداشبورد', icon: 'fas fa-chart-line', page: 'dashboard', show: true },
        { to: '/orders', label: 'الأوردرات', icon: 'fas fa-layer-group', page: 'orders', show: canViewStandardOrders },
        { to: '/', label: 'السكانر', icon: 'fas fa-barcode', page: 'scanner', show: canViewScanner },
    ].filter(l => l.show);

    // Secondary nav links → go into "More" dropdown
    const secondaryLinks = [
        { to: '/create-order', label: 'أوردر جديد', icon: 'fas fa-plus-circle', page: 'create-order', show: canViewCreateOrder, accent: 'sky' },
        { href: '/external_tracking.html', label: 'التشغيل الخارجي', icon: 'fas fa-truck-loading', page: 'external', show: canViewExternal },
        { to: '/admin', label: 'إدارة المستخدمين', icon: 'fas fa-users-cog', page: 'admin', show: canViewAdmin },
        { href: '/presentation.html', label: 'الملف التعريفي', icon: 'fas fa-file-powerpoint', page: 'presentation', show: canViewPresentation, newTab: true, accent: 'amber' },
    ].filter(l => l.show);

    const hasActiveSecondary = secondaryLinks.some(l => l.page === activePage);

    useEffect(() => {
        const timer = setInterval(() => setLiveTime(getNowFormatted(true)), 1000);
        return () => clearInterval(timer);
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Close mobile menu on route change
    useEffect(() => { setMobileOpen(false); }, [activePage]);

    const handleLogout = async () => {
        const ok = await confirm('تسجيل الخروج', 'هل أنت متأكد من إنهاء جلسة العمل الحالية؟');
        if (ok) { logout(); navigate('/login'); }
    };

    const getRoleBadge = () => {
        if (!user) return null;
        if (isSuperAdmin || ['gamal', 'auf'].includes((user.username || '').toLowerCase())) {
            return (
                <span className="badge-clean text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 font-bold"
                    style={{ background: 'linear-gradient(135deg,#78350f,#92400e)', color: '#fef3c7', border: '1px solid #b45309' }}>
                    <i className="fas fa-crown text-amber-300 text-[9px]"></i> مالك
                </span>
            );
        }
        if (user.role === 'admin') return <span className="badge-clean badge-red text-[10px] px-2 py-0.5 rounded-md font-bold">مدير</span>;
        if (user.role === 'admin_view') return <span className="badge-clean badge-blue text-[10px] px-2 py-0.5 rounded-md font-bold">متابع</span>;
        if (user.role === 'external_operator') return (
            <span className="badge-clean text-[10px] px-2 py-0.5 rounded-md font-bold" style={{ background: 'rgba(6,182,212,0.15)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.3)' }}>
                <span className="badge-clean-dot" style={{ background: '#22d3ee' }}></span> خارجي
            </span>
        );
        if (user.role === 'external_admin') return (
            <span className="badge-clean text-[10px] px-2 py-0.5 rounded-md font-bold" style={{ background: 'rgba(6,182,212,0.15)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.3)' }}>
                <span className="badge-clean-dot" style={{ background: '#22d3ee' }}></span> مشرف خارجي
            </span>
        );
        return <span className="badge-clean badge-green text-[10px] px-2 py-0.5 rounded-md font-bold">{user.stage_permission || 'مشغل'}</span>;
    };

    const getUserInitial = () => (!user?.username ? 'U' : user.username.charAt(0).toUpperCase());

    // Shared nav link class
    const navLinkClass = (page) =>
        `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap flex-shrink-0 ${activePage === page
            ? 'bg-sky-500/15 text-sky-400 font-bold border border-sky-500/30 shadow-sm shadow-sky-500/10'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 font-medium border border-transparent'
        }`;

    const renderNavLink = (link) => {
        const cls = navLinkClass(link.page);
        if (link.href) {
            return (
                <a key={link.page} href={link.href} target={link.newTab ? '_blank' : undefined} rel="noreferrer" className={cls}>
                    <i className={`${link.icon} text-xs`}></i>
                    <span>{link.label}</span>
                </a>
            );
        }
        return (
            <Link key={link.page} to={link.to} className={cls}>
                <i className={`${link.icon} text-xs`}></i>
                <span>{link.label}</span>
            </Link>
        );
    };

    return (
        <header className="no-print sticky top-0 z-40 border-b border-slate-800/70"
            style={{ background: 'rgba(7,11,22,0.97)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>

            {/* Top gradient accent */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500" />

            <div className="max-w-7xl mx-auto px-3 sm:px-5 flex items-center justify-between gap-3 h-14">

                {/* ── LEFT: Logo ── */}
                <Link to="/orders" className="flex items-center gap-2 group flex-shrink-0">
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

                {/* ── CENTER: Primary Nav + More Dropdown ── */}
                <nav className="flex items-center gap-0.5 p-1 rounded-xl flex-1 justify-center"
                    style={{ background: 'rgba(5,9,20,0.8)', border: '1px solid rgba(148,163,184,0.07)' }}>

                    {/* Primary links */}
                    {primaryLinks.map(renderNavLink)}

                    {/* Divider */}
                    {secondaryLinks.length > 0 && (
                        <div className="h-4 w-px bg-slate-700/60 mx-0.5 flex-shrink-0"></div>
                    )}

                    {/* ── "More" dropdown ── */}
                    {secondaryLinks.length > 0 && (
                        <div className="relative flex-shrink-0" ref={moreRef}>
                            <button
                                onClick={() => setMoreOpen(v => !v)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap font-medium border ${hasActiveSecondary || moreOpen
                                    ? 'bg-sky-500/15 text-sky-400 font-bold border-sky-500/30 shadow-sm shadow-sky-500/10'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
                                    }`}
                            >
                                <i className="fas fa-th-large text-xs"></i>
                                <span className="hidden sm:inline">المزيد</span>
                                <i className={`fas fa-chevron-down text-[9px] transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`}></i>
                            </button>

                            {/* Dropdown panel */}
                            {moreOpen && (
                                <div className="absolute top-full mt-2 right-0 w-52 rounded-xl overflow-hidden z-50"
                                    style={{
                                        background: 'rgba(8,13,28,0.98)',
                                        border: '1px solid rgba(148,163,184,0.12)',
                                        boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(14,165,233,0.05)',
                                        backdropFilter: 'blur(20px)',
                                    }}>
                                    {/* Dropdown header */}
                                    <div className="px-3 py-2 border-b border-slate-800/80">
                                        <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">قائمة الأدوات</span>
                                    </div>
                                    <div className="p-1.5 flex flex-col gap-0.5">
                                        {secondaryLinks.map(link => {
                                            const isActive = activePage === link.page;
                                            const cls = `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all w-full text-right ${isActive
                                                ? 'bg-sky-500/15 text-sky-400 font-bold border border-sky-500/20'
                                                : link.accent === 'amber'
                                                    ? 'text-amber-400 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20'
                                                    : link.accent === 'sky'
                                                        ? 'text-sky-400 hover:bg-sky-500/10 border border-transparent hover:border-sky-500/20'
                                                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent'
                                                }`;
                                            const content = (
                                                <>
                                                    <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-sky-500/20' : 'bg-slate-800/60'}`}>
                                                        <i className={`${link.icon} text-[10px]`}></i>
                                                    </div>
                                                    <span>{link.label}</span>
                                                    {link.newTab && <i className="fas fa-external-link-alt text-[9px] text-slate-600 mr-auto"></i>}
                                                </>
                                            );
                                            if (link.href) {
                                                return (
                                                    <a key={link.page} href={link.href} target={link.newTab ? '_blank' : undefined}
                                                        rel="noreferrer" className={cls} onClick={() => setMoreOpen(false)}>
                                                        {content}
                                                    </a>
                                                );
                                            }
                                            return (
                                                <Link key={link.page} to={link.to} className={cls} onClick={() => setMoreOpen(false)}>
                                                    {content}
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </nav>

                {/* ── RIGHT: Clock + User + Logout ── */}
                <div className="flex items-center gap-2 flex-shrink-0">

                    {/* Live clock — desktop only */}
                    <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono text-slate-300"
                        style={{ background: 'rgba(7,13,25,0.8)', border: '1px solid rgba(148,163,184,0.07)' }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_5px_rgba(52,211,153,0.5)]"></span>
                        <span>{liveTime}</span>
                    </div>

                    {/* User capsule */}
                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl"
                        style={{ background: '#0d1627', border: '1px solid rgba(148,163,184,0.12)' }}>
                        <div className="w-5 h-5 rounded-full text-white text-[10px] font-black flex items-center justify-center font-mono flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #0ea5e9, #4f46e5)' }}>
                            {getUserInitial()}
                        </div>
                        {user?.username && (
                            <span className="hidden sm:block text-xs font-mono font-bold text-white truncate max-w-[80px]">{user.username}</span>
                        )}
                        {getRoleBadge()}
                    </div>

                    {/* Logout */}
                    <button onClick={handleLogout}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-all hover:scale-105"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.22)' }}
                        title="تسجيل الخروج">
                        <i className="fas fa-sign-out-alt"></i>
                    </button>
                </div>

            </div>
        </header>
    );
}

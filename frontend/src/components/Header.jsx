import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { getNowFormatted } from '../services/timeSync';

export default function Header({ title, subtitle, badgeText = 'DASHBOARD', activePage = '' }) {
    const {
        user, logout,
        isAdmin, isSuperAdmin, isMasterOwner, isFactoryOwner,
        isProduction, isAdminView, isExternalOperator, isExternalAdmin,
        canCreateOrders, canManageUsers, canViewOrders, companyName
    } = useAuth();
    const { confirm } = useToast();
    const { language, changeLanguage, t, isRTL } = useLanguage();
    const navigate = useNavigate();
    const [liveTime, setLiveTime] = useState(() => getNowFormatted(true));
    const [moreOpen, setMoreOpen] = useState(false);
    const moreRef = useRef(null);

    // هل المستخدم لديه صلاحية إدارة النظام لتغيير اللغة
    const canSwitchLanguage = isAdmin || isSuperAdmin || isMasterOwner || isFactoryOwner;

    // الصلاحيات
    const canViewCreateOrder = (isSuperAdmin || isAdmin || canCreateOrders) && !isFactoryOwner;
    const canViewStandardOrders = isSuperAdmin || isAdmin || isFactoryOwner || canViewOrders || (!isProduction && !isExternalOperator && !isExternalAdmin);
    const canViewExternal = (isSuperAdmin || isAdmin || isExternalAdmin || isAdminView || canViewOrders) && !isFactoryOwner;
    const canViewScanner = !isExternalAdmin && !isFactoryOwner;
    const canViewAdmin = (isSuperAdmin || isAdmin || isExternalAdmin || canManageUsers) && !isFactoryOwner;
    const canViewPresentation = Boolean(
        user && ['gamal', 'auf'].includes((user.username || '').toLowerCase())
    );

    // الروابط الأساسية (Primary)
    const primaryLinks = [
        { to: '/dashboard', label: t('nav.dashboard'), icon: 'fas fa-chart-line', page: 'dashboard', show: true },
        { to: '/orders', label: t('nav.orders'), icon: 'fas fa-layer-group', page: 'orders', show: canViewStandardOrders },
        { to: '/', label: t('nav.scanner'), icon: 'fas fa-barcode', page: 'scanner', show: canViewScanner },
    ].filter(l => l.show);

    // الروابط الثانوية (Secondary Dropdown)
    const secondaryLinks = [
        { to: '/create-order', label: t('nav.create_order'), icon: 'fas fa-plus-circle', page: 'create-order', show: canViewCreateOrder, accent: 'sky' },
        { href: '/external_tracking.html', label: t('nav.external_tracking'), icon: 'fas fa-truck-loading', page: 'external', show: canViewExternal },
        { to: '/admin', label: t('nav.user_management'), icon: 'fas fa-users-cog', page: 'admin', show: canViewAdmin },
        { href: '/presentation.html', label: t('nav.presentation'), icon: 'fas fa-file-powerpoint', page: 'presentation', show: canViewPresentation, newTab: true, accent: 'amber' },
    ].filter(l => l.show);

    const hasActiveSecondary = secondaryLinks.some(l => l.page === activePage);

    useEffect(() => {
        const timer = setInterval(() => setLiveTime(getNowFormatted(true)), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const handler = (e) => {
            if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleLogout = async () => {
        const ok = await confirm(t('nav.logout_confirm_title'), t('nav.logout_confirm_msg'));
        if (ok) { logout(); navigate('/login'); }
    };

    const getRoleBadge = () => {
        if (!user) return null;
        if (isSuperAdmin || ['gamal', 'auf'].includes((user.username || '').toLowerCase())) {
            return (
                <span className="badge-clean text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 font-bold"
                    style={{ background: 'linear-gradient(135deg,#78350f,#92400e)', color: '#fef3c7', border: '1px solid #b45309' }}>
                    <i className="fas fa-crown text-amber-300 text-[9px]"></i> {t('nav.system_owner')}
                </span>
            );
        }
        if (user.role === 'admin') return <span className="badge-clean badge-red text-[10px] px-2 py-0.5 rounded-md font-bold">{t('nav.admin')}</span>;
        if (user.role === 'factory_owner') return (
            <span className="badge-clean text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 font-bold"
                style={{ background: 'linear-gradient(135deg, rgba(2,132,199,0.25), rgba(99,102,241,0.25))', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.4)' }}>
                <i className="fas fa-building-user text-sky-400 text-[10px]"></i> {language === 'ar' ? 'صاحب المصنع' : 'Factory Owner'}
            </span>
        );
        if (user.role === 'admin_view') return <span className="badge-clean badge-blue text-[10px] px-2 py-0.5 rounded-md font-bold">{t('nav.viewer')}</span>;
        if (user.role === 'external_operator') return (
            <span className="badge-clean text-[10px] px-2 py-0.5 rounded-md font-bold" style={{ background: 'rgba(6,182,212,0.15)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.3)' }}>
                <span className="badge-clean-dot" style={{ background: '#22d3ee' }}></span> {t('nav.external_op')}
            </span>
        );
        if (user.role === 'external_admin') return (
            <span className="badge-clean text-[10px] px-2 py-0.5 rounded-md font-bold" style={{ background: 'rgba(6,182,212,0.15)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.3)' }}>
                <span className="badge-clean-dot" style={{ background: '#22d3ee' }}></span> {t('nav.external_admin')}
            </span>
        );
        return <span className="badge-clean badge-green text-[10px] px-2 py-0.5 rounded-md font-bold">{user.stage_permission || t('nav.production_op')}</span>;
    };

    const getUserInitial = () => (!user?.username ? 'U' : user.username.charAt(0).toUpperCase());

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

            {/* Top gradient line */}
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
                        <span className="text-[9px] text-slate-500 font-mono mt-0.5">{t('nav.system_badge')}</span>
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

                    {/* "More" dropdown */}
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
                                <span className="hidden sm:inline">{t('nav.more')}</span>
                                <i className={`fas fa-chevron-down text-[9px] transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`}></i>
                            </button>

                            {/* Dropdown panel */}
                            {moreOpen && (
                                <div className={`absolute top-full mt-2 ${isRTL ? 'right-0' : 'left-0'} w-52 rounded-xl overflow-hidden z-50`}
                                    style={{
                                        background: 'rgba(8,13,28,0.98)',
                                        border: '1px solid rgba(148,163,184,0.12)',
                                        boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(14,165,233,0.05)',
                                        backdropFilter: 'blur(20px)',
                                    }}>
                                    <div className="px-3 py-2 border-b border-slate-800/80">
                                        <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">{t('nav.tools_menu')}</span>
                                    </div>
                                    <div className="p-1.5 flex flex-col gap-0.5">
                                        {secondaryLinks.map(link => {
                                            const isActive = activePage === link.page;
                                            const cls = `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all w-full ${isRTL ? 'text-right' : 'text-left'} ${isActive
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
                                                    {link.newTab && <i className={`fas fa-external-link-alt text-[9px] text-slate-600 ${isRTL ? 'mr-auto' : 'ml-auto'}`}></i>}
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

                {/* ── RIGHT: Language Switcher (Admin Only) + Clock + User + Logout ── */}
                <div className="flex items-center gap-2 flex-shrink-0">

                    {/* Admin-Only Language Switcher Pill */}
                    {canSwitchLanguage && (
                        <div className="flex items-center bg-[#070e1c] rounded-lg p-0.5 border border-slate-700/70 shadow-inner"
                            title={t('nav.lang_toggle_tip')}>
                            <button
                                onClick={() => changeLanguage('ar')}
                                className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono transition-all flex items-center gap-1 ${
                                    language === 'ar'
                                        ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/30 font-black'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                                }`}
                            >
                                <span>ع</span>
                            </button>
                            <button
                                onClick={() => changeLanguage('en')}
                                className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono transition-all flex items-center gap-1 ${
                                    language === 'en'
                                        ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/30 font-black'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                                }`}
                            >
                                <span>EN</span>
                            </button>
                        </div>
                    )}

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
                        title={t('nav.logout')}>
                        <i className="fas fa-sign-out-alt"></i>
                    </button>
                </div>

            </div>
        </header>
    );
}

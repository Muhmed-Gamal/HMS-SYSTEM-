import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try {
            const saved = localStorage.getItem('hms_user') || localStorage.getItem('freedom_user');
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    });

    const [companyName, setCompanyName] = useState('نظام الباركود وتتبع الإنتاج الصناعي HMS');
    const [isMasterGeneral, setIsMasterGeneral] = useState(false);
    const [licenseInfo, setLicenseInfo] = useState(null);

    const reloadSystemInfo = async () => {
        try {
            const res = await fetch('/api/system/info');
            const data = await res.json();
            if (data && data.company_name) {
                setCompanyName(data.company_name);
                setIsMasterGeneral(Boolean(data.is_master));
                setLicenseInfo(data);
                try {
                    localStorage.setItem('hms_system_info', JSON.stringify(data));
                } catch (e) {}
                document.title = data.system_title || `${data.company_name} | نظام الباركود الصناعي HMS`;
            }
        } catch (e) {}
    };

    // جلب اسم الشركة من ترخيص النظام فورياً عند تحميل التطبيق
    useEffect(() => {
        reloadSystemInfo();
    }, []);

    const login = (userData, token) => {
        localStorage.setItem('hms_user', JSON.stringify(userData));
        localStorage.setItem('freedom_user', JSON.stringify(userData));
        if (token) {
            localStorage.setItem('hms_token', token);
            localStorage.setItem('freedom_token', token);
        }
        setUser(userData);
    };

    const logout = () => {
        localStorage.removeItem('hms_user');
        localStorage.removeItem('freedom_user');
        localStorage.removeItem('hms_token');
        localStorage.removeItem('freedom_token');
        localStorage.removeItem('hms_system_info');
        localStorage.removeItem('freedom_system_info');
        setUser(null);
    };

    const isMasterOwner = Boolean(
        user && (
            user.role === 'superadmin' ||
            user.is_master ||
            ['gamal', 'auf'].includes((user.username || '').toLowerCase())
        )
    );
    const isSuperAdmin = isMasterOwner || user?.role === 'superadmin';
    const isAdmin = isSuperAdmin || user?.role === 'admin';
    const isProduction = !isSuperAdmin && user?.role === 'production';
    const isAdminView = !isSuperAdmin && user?.role === 'admin_view';
    const isExternalOperator = !isSuperAdmin && user?.role === 'external_operator';
    const isExternalAdmin = !isSuperAdmin && user?.role === 'external_admin';
    const canCreateOrders = isSuperAdmin || isAdmin || Boolean(user?.can_create_orders);
    const canManageUsers = isSuperAdmin || isAdmin || Boolean(user?.can_manage_users);
    const canPrintReports = isSuperAdmin || isAdmin || Boolean(user?.can_print_reports);
    const canViewOrders = isSuperAdmin || Boolean(user?.can_view_orders);

    return (
        <AuthContext.Provider value={{ 
            user, login, logout, 
            isAdmin, isSuperAdmin, isMasterOwner,
            isProduction, isAdminView, isExternalOperator, isExternalAdmin, 
            canCreateOrders, canManageUsers, canPrintReports, canViewOrders,
            companyName, setCompanyName, licenseInfo, isMasterGeneral, reloadSystemInfo 
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}

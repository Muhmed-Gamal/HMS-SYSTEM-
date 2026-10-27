import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translations } from '../i18n/translations';
import { api } from '../services/api';
import { useToast } from './ToastContext';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
    const { toast } = useToast();

    // القيمة الابتدائية من التخزين المحلي أو 'ar' افتراضياً
    const [language, setLanguageState] = useState(() => {
        try {
            return localStorage.getItem('hms_language') || 'ar';
        } catch (e) {
            return 'ar';
        }
    });

    const isRTL = language === 'ar';
    const dir = isRTL ? 'rtl' : 'ltr';

    // تطبيق الاتجاه واللغة على وسم <html> فورياً
    const applyDomLanguage = useCallback((lang) => {
        const isAr = lang === 'ar';
        document.documentElement.setAttribute('dir', isAr ? 'rtl' : 'ltr');
        document.documentElement.setAttribute('lang', lang);
    }, []);

    // مزامنة اللغة المركزية من الخادم عند بدء التطبيق
    const syncWithServer = useCallback(async () => {
        try {
            const { ok, data } = await api.getSystemInfo();
            if (ok && data && data.system_language) {
                const serverLang = data.system_language;
                if (serverLang !== language) {
                    setLanguageState(serverLang);
                    localStorage.setItem('hms_language', serverLang);
                    applyDomLanguage(serverLang);
                }
            }
        } catch (err) {
            console.warn('Could not sync system language from server:', err);
        }
    }, [language, applyDomLanguage]);

    useEffect(() => {
        applyDomLanguage(language);
        syncWithServer();
    }, []);

    // دالة الترجمة الذكية مع دعم المسارات المتداخلة والمتغيرات
    const t = useCallback((path, params = {}) => {
        if (!path) return '';

        const keys = path.split('.');
        let current = translations[language] || translations['ar'];

        for (const k of keys) {
            if (current && typeof current === 'object' && k in current) {
                current = current[k];
            } else {
                // تراجع للغة البديلة إن لم توجد الترجمة
                let fallback = translations['ar'];
                for (const fk of keys) {
                    if (fallback && typeof fallback === 'object' && fk in fallback) {
                        fallback = fallback[fk];
                    } else {
                        return path; // إرجاع المفتاح نفسه كحل أخير
                    }
                }
                current = fallback;
                break;
            }
        }

        if (typeof current !== 'string') return path;

        // استبدال المتغيرات {key} بالقيم المرسلة
        let result = current;
        Object.entries(params).forEach(([k, v]) => {
            result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), v !== undefined && v !== null ? v : '');
        });

        return result;
    }, [language]);

    // تغيير لغة النظام - مخصص لمدير النظام (Admin)
    const changeLanguage = async (newLang) => {
        if (!['ar', 'en'].includes(newLang)) return;
        if (newLang === language) return;

        try {
            const { ok, data } = await api.setSystemLanguage(newLang);
            if (ok && data.success) {
                setLanguageState(newLang);
                localStorage.setItem('hms_language', newLang);
                applyDomLanguage(newLang);
                const toastMsg = newLang === 'ar' 
                    ? 'تم تغيير لغة النظام بالكامل إلى العربية بنجاح' 
                    : 'System language switched to English successfully';
                toast(toastMsg, 'success');
            } else {
                toast(data?.error || 'فشل تغيير لغة النظام. العملية مخصصة لمدير النظام فقط', 'error');
            }
        } catch (err) {
            console.error('Error in changeLanguage:', err);
            toast('تعذر الاتصال بالسيرفر لتغيير لغة النظام', 'error');
        }
    };

    const value = {
        language,
        dir,
        isRTL,
        t,
        changeLanguage,
        syncWithServer,
    };

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}

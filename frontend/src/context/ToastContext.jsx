import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const [confirmState, setConfirmState] = useState(null);
    const [progressState, setProgressState] = useState(null);
    const [alertState, setAlertState] = useState(null);
    const confirmResolverRef = useRef(null);

    const toast = useCallback((message, type = 'info', duration = 3500) => {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, message, type }]);

        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
    }, []);

    const confirm = useCallback((title, message, yesText = 'تأكيد', noText = 'إلغاء') => {
        return new Promise((resolve) => {
            confirmResolverRef.current = resolve;
            setConfirmState({ title, message, yesText, noText });
        });
    }, []);

    const handleConfirmClose = (result) => {
        if (confirmResolverRef.current) {
            confirmResolverRef.current(result);
            confirmResolverRef.current = null;
        }
        setConfirmState(null);
    };

    const showProgress = useCallback((title, message, percent = 0) => {
        setProgressState({ title, message, percent });
    }, []);

    const updateProgress = useCallback((percent, message) => {
        setProgressState((prev) => {
            if (!prev) return null;
            return {
                ...prev,
                percent,
                message: message !== undefined ? message : prev.message,
            };
        });
    }, []);

    const closeProgress = useCallback(() => {
        setProgressState(null);
    }, []);

    const showAlert = useCallback((title, message, type = 'info') => {
        setAlertState({ title, message, type });
    }, []);

    const closeAlert = useCallback(() => {
        setAlertState(null);
    }, []);

    return (
        <ToastContext.Provider
            value={{
                toast,
                confirm,
                showProgress,
                updateProgress,
                closeProgress,
                showAlert,
                closeAlert,
            }}
        >
            {children}

            {/* Toasts Container */}
            <div
                style={{
                    position: 'fixed',
                    top: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    pointerEvents: 'none',
                    maxWidth: '480px',
                    width: '90%',
                }}
            >
                {toasts.map((t) => {
                    const styles = {
                        success: { bg: '#132338', border: 'rgba(16,185,129,0.3)', text: '#34d399', icon: 'fa-check-circle' },
                        error: { bg: '#231520', border: 'rgba(239,68,68,0.3)', text: '#f87171', icon: 'fa-times-circle' },
                        warning: { bg: '#251e15', border: 'rgba(245,158,11,0.3)', text: '#fbbf24', icon: 'fa-exclamation-circle' },
                        info: { bg: '#131f37', border: 'rgba(59,130,246,0.3)', text: '#60a5fa', icon: 'fa-info-circle' },
                    };
                    const s = styles[t.type] || styles.info;

                    return (
                        <div
                            key={t.id}
                            style={{
                                background: s.bg,
                                border: `1px solid ${s.border}`,
                                color: '#f8fafc',
                                padding: '10px 16px',
                                borderRadius: '10px',
                                fontSize: '13px',
                                fontFamily: 'var(--font-ar, sans-serif)',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '10px',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                                pointerEvents: 'auto',
                                cursor: 'pointer',
                                direction: 'rtl',
                            }}
                            onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
                        >
                            <div className="flex items-center gap-2.5">
                                <i className={`fas ${s.icon}`} style={{ color: s.text, fontSize: '15px' }}></i>
                                <span className="font-semibold text-xs sm:text-[12.5px]">{t.message}</span>
                            </div>
                            <span className="text-slate-400 mr-2 text-sm">&times;</span>
                        </div>
                    );
                })}
            </div>

            {/* Confirm Dialog */}
            {confirmState && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(10,17,32,0.7)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 9991,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                    }}
                >
                    <div className="slate-card p-6 sm:p-7 w-full max-w-[400px] text-center shadow-2xl">
                        <div className="w-12 h-12 rounded-full mx-auto mb-3.5 flex items-center justify-center text-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <i className="fas fa-exclamation-triangle"></i>
                        </div>
                        <h3 className="text-white text-base font-bold mb-1.5">{confirmState.title}</h3>
                        <p className="text-slate-300 text-xs leading-relaxed mb-5 whitespace-pre-line">{confirmState.message}</p>
                        <div className="flex gap-2.5">
                            <button
                                onClick={() => handleConfirmClose(true)}
                                className="btn-slate btn-slate-primary flex-1 py-2 text-xs font-semibold"
                            >
                                {confirmState.yesText}
                            </button>
                            <button
                                onClick={() => handleConfirmClose(false)}
                                className="btn-slate btn-slate-secondary flex-1 py-2 text-xs font-semibold"
                            >
                                {confirmState.noText}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Progress / Loading Modal */}
            {progressState && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(10,17,32,0.7)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 9992,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                    }}
                >
                    <div className="slate-card p-6 sm:p-7 w-full max-w-[380px] text-center shadow-2xl">
                        <div className="w-12 h-12 rounded-full mx-auto mb-3.5 flex items-center justify-center text-lg bg-blue-500/15 text-blue-400 border border-blue-500/30">
                            <i className="fas fa-circle-notch fa-spin"></i>
                        </div>
                        <h3 className="text-white text-base font-bold mb-1">{progressState.title}</h3>
                        <p className="text-slate-300 text-xs leading-relaxed mb-4">{progressState.message}</p>
                        <div className="w-full bg-[#0a1120] rounded-full h-2 overflow-hidden border border-slate-700/60 mb-2">
                            <div
                                className="h-2 rounded-full bg-blue-500 transition-all duration-150"
                                style={{ width: `${progressState.percent}%` }}
                            ></div>
                        </div>
                        <div className="text-xs font-mono font-bold text-blue-400">{Math.round(progressState.percent)}%</div>
                    </div>
                </div>
            )}

            {/* General Alert Modal */}
            {alertState && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(10,17,32,0.7)',
                        backdropFilter: 'blur(8px)',
                        zIndex: 9993,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                    }}
                >
                    <div className="slate-card p-6 w-full max-w-xs text-center shadow-xl">
                        <h3 className="text-white text-sm font-bold mb-1">{alertState.title}</h3>
                        <p className="text-slate-300 text-xs leading-relaxed mb-4">{alertState.message}</p>
                        <button
                            onClick={closeAlert}
                            className="btn-slate btn-slate-secondary w-full py-1.5 text-xs font-semibold"
                        >
                            إغلاق
                        </button>
                    </div>
                </div>
            )}
        </ToastContext.Provider>
    );
}

export function useToast() {
    return useContext(ToastContext);
}

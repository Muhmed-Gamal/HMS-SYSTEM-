import React from 'react';

export default function StatCard({ label, value, colorClass = 'text-white', icon, subValue, trend }) {
    return (
        <div className="group relative flex flex-col justify-between overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
            style={{
                background: 'linear-gradient(145deg, #0e1628 0%, #0b1120 100%)',
                border: '1px solid rgba(148,163,184,0.10)',
                borderRadius: '14px',
                padding: '16px 18px',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.35)',
            }}>
            {/* Left accent bar — colored by value type via colorClass */}
            <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full opacity-70"
                style={{ background: colorClass.includes('amber') ? '#f59e0b' : colorClass.includes('rose') ? '#f43f5e' : colorClass.includes('emerald') ? '#10b981' : colorClass.includes('cyan') ? '#06b6d4' : '#38bdf8' }} />

            <div>
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-semibold text-slate-400 tracking-wide">{label}</span>
                    {icon && (
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                            style={{ background: 'rgba(148,163,184,0.06)', border: '1px solid rgba(148,163,184,0.10)' }}>
                            <i className={`${icon} text-[11px] text-slate-500 group-hover:text-sky-400 transition-colors`}></i>
                        </div>
                    )}
                </div>
                <div className={`font-mono font-black tracking-tight text-2xl sm:text-[28px] leading-none ${colorClass}`}>
                    {value !== undefined && value !== null ? value : '—'}
                </div>
            </div>

            {(subValue || trend) && (
                <div className="text-[11px] text-slate-500 font-mono mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between">
                    <span>{subValue}</span>
                    {trend && (
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold">
                            {trend}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

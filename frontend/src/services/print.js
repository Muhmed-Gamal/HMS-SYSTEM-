/**
 * HMS Barcode System - Printing & Export Services
 * Handles Ultra-High-Definition Print Formats for:
 * 1. 35mm x 80mm & 80mm x 35mm Thermal Barcode Rolls (JsBarcode Engine)
 * 2. Official Order Production & Barcode Audit Sheet (A4 Landscape / Portrait)
 * 3. Comprehensive Factory Operations & Audit Sheet (A4 Landscape Multi-Page)
 * 4. Missing / Unscanned Barcode Stage Audit Sheet (A4 Multi-Column)
 * 5. Official External Order Tracking & Tally Audit Sheet (A4 Portrait)
 * 6. Comprehensive External Operations Master Audit Sheet (A4 Landscape)
 */

import { getNowFormatted, formatStandardDate, getSyncedDate } from './timeSync';

const FONT_AR_FAMILY = "'IBM Plex Sans Arabic', 'Alexandria', 'Cairo', Arial, sans-serif";
const FONT_MONO_FAMILY = "'JetBrains Mono', 'Space Grotesk', 'Courier New', monospace";

const fmtN = (n, fallback = '0') => (n == null || isNaN(Number(n))) ? fallback : Number(n).toLocaleString('en-US');

function getPrintedByUser(explicitUser) {
    if (explicitUser && typeof explicitUser === 'string') return explicitUser;
    if (explicitUser && typeof explicitUser === 'object') {
        return explicitUser.full_name || explicitUser.name || explicitUser.username || explicitUser.user_id || 'المستخدم الحالي';
    }
    try {
        const saved = localStorage.getItem('hms_user') || localStorage.getItem('freedom_user');
        if (saved) {
            const u = JSON.parse(saved);
            return u.full_name || u.name || u.username || u.user_id || 'المستخدم الحالي';
        }
    } catch (e) {}
    return 'إدارة النظام';
}

function getSystemBrand() {
    try {
        const cached = localStorage.getItem('hms_system_info') || localStorage.getItem('freedom_system_info');
        if (cached) {
            const data = JSON.parse(cached);
            if (data && data.company_name) {
                return {
                    nameAr: data.company_name,
                    nameEn: data.company_en || 'HMS INDUSTRIAL BARCODE SYSTEM',
                    logo: data.is_master ? 'HMS' : (data.company_name.slice(0, 3).toUpperCase() || 'HMS'),
                    sub: data.is_master ? 'نظام الباركود ومتابعة الإنتاج الصناعي HMS' : 'إدارة ومتابعة العمليات ومراقبة الجودة'
                };
            }
        }
    } catch (e) {}
    return {
        nameAr: 'نظام الباركود وتتبع الإنتاج الصناعي',
        nameEn: 'INDUSTRIAL BARCODE SYSTEM',
        logo: 'SYS',
        sub: 'نظام إدارة ومتابعة الإنتاج ومراقبة الجودة والباركود'
    };
}

export function generateReportActionBar({ title, tag, fileName, isLandscape = false, mode = 'print' }) {
    const cleanFileName = (fileName || 'report').replace(/[^\w\u0600-\u06FF\s-]/g, '_').replace(/\s+/g, '_') + '.pdf';
    return {
        topBarHtml: `
        <div class="report-top-bar no-print">
            <div class="top-bar-brand">
                <span class="top-bar-dot"></span>
                <strong class="top-bar-title">${title}</strong>
                <span class="top-bar-tag">${tag || 'OFFICIAL REPORT'}</span>
            </div>
            <div class="top-bar-actions">
                <button id="pdfDownloadBtn" onclick="if(window.handleDownloadPdf){window.handleDownloadPdf()}else{window.print()}" class="top-btn btn-pdf" title="تحميل التقرير كملف PDF وحفظه بالجهاز">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    <span>تحميل كملف PDF</span>
                </button>
                <button onclick="window.print()" class="top-btn btn-print" title="إرسال التقرير مباشرة إلى الطابعة">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                    <span>طباعة التقرير</span>
                </button>
                <button onclick="window.close()" class="top-btn btn-close" title="إغلاق هذه النافذة">
                    <span>✕ إغلاق</span>
                </button>
            </div>
        </div>
        `,
        topBarCss: `
        @media screen {
            body { padding-top: 54px !important; }
            .report-top-bar {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                height: 48px;
                background: #0f172a;
                border-bottom: 1px solid #334155;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 16px;
                z-index: 999999;
                box-shadow: 0 4px 12px rgba(0,0,0,0.25);
                font-family: ${FONT_AR_FAMILY};
                direction: rtl;
            }
            .top-bar-brand { display: flex; align-items: center; gap: 8px; color: #f8fafc; font-size: 13px; font-weight: 700; }
            .top-bar-dot { width: 8px; height: 8px; border-radius: 50%; background: #38bdf8; display: inline-block; }
            .top-bar-title { color: #fff; font-size: 13px; }
            .top-bar-tag { font-size: 10px; padding: 2px 6px; background: #1e293b; color: #94a3b8; border-radius: 4px; border: 1px solid #475569; font-family: ${FONT_MONO_FAMILY}; }
            .top-bar-actions { display: flex; align-items: center; gap: 8px; }
            .top-btn {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 14px;
                font-size: 12px;
                font-weight: 700;
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s ease;
                border: none;
                outline: none;
                font-family: ${FONT_AR_FAMILY};
            }
            .btn-pdf {
                background: linear-gradient(135deg, #0284c7, #0369a1);
                color: #fff;
                border: 1px solid #38bdf8;
                box-shadow: 0 2px 4px rgba(2, 132, 199, 0.3);
            }
            .btn-pdf:hover { background: #0369a1; }
            .btn-print {
                background: #334155;
                color: #f1f5f9;
                border: 1px solid #475569;
            }
            .btn-print:hover { background: #475569; color: #fff; }
            .btn-close {
                background: transparent;
                color: #94a3b8;
                border: 1px solid #334155;
                padding: 6px 10px;
            }
            .btn-close:hover { background: #dc2626; color: #fff; border-color: #dc2626; }
        }
        @media print {
            .report-top-bar, .no-print { display: none !important; }
            body { padding-top: 0 !important; }
        }
        `,
        scriptHtml: `
        <script src="/js/html2pdf.bundle.min.js"></script>
        <script>
            if (!window.html2pdf) {
                var s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                document.head.appendChild(s);
            }
            window.handleDownloadPdf = function() {
                const btn = document.getElementById('pdfDownloadBtn');
                const origHtml = btn ? btn.innerHTML : '';
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = '<span>⏳ جاري توليد PDF...</span>';
                }
                const element = document.querySelector('.sheet') || document.body;
                const opt = {
                    margin: ${isLandscape ? '[4, 4, 4, 4]' : '[5, 5, 5, 5]'},
                    filename: '${cleanFileName}',
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, logging: false },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: '${isLandscape ? 'landscape' : 'portrait'}' }
                };
                function doSave() {
                    window.html2pdf().set(opt).from(element).save().then(function() {
                        if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
                    }).catch(function(e) {
                        console.error('PDF Export Error:', e);
                        window.print();
                        if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
                    });
                }
                if (window.html2pdf) {
                    doSave();
                } else {
                    const checker = setInterval(function() {
                        if (window.html2pdf) {
                            clearInterval(checker);
                            doSave();
                        }
                    }, 200);
                    setTimeout(function() {
                        clearInterval(checker);
                        if (!window.html2pdf) {
                            window.print();
                            if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
                        }
                    }, 3000);
                }
            };

            window.onload = function() {
                const mode = '${mode || 'print'}';
                if (mode === 'pdf') {
                    setTimeout(function() {
                        if (window.handleDownloadPdf) window.handleDownloadPdf();
                    }, 400);
                } else {
                    setTimeout(function() { window.print(); }, 400);
                }
            };
        </script>
        `
    };
}

/**
 * 1. طباعة رول استيكرات الباركود (35mm x 80mm) لمكن الباركود الحراري
 */
export function printBarcodesWindow({ order_number, customer_name, barcodes }) {
    if (!barcodes || barcodes.length === 0) {
        alert('لا توجد أكواد جاهزة للطباعة');
        return;
    }

    const printWin = window.open('', '_blank');
    if (!printWin) {
        alert('يرجى السماح بفتح النوافذ المنبثقة (Popups) في المتصفح لطباعة الباركود.');
        return;
    }

    const _orderNum = JSON.stringify(order_number);
    const _custName = JSON.stringify(customer_name || 'قطعة ملابس');
    const _barcodes = JSON.stringify(barcodes);

    printWin.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head>
        <title>استيكرات باركود - ${order_number}</title>
        <meta charset="UTF-8">
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
        <style>
            @page { size: 35mm 80mm; margin: 0; }
            * { box-shadow: none !important; text-shadow: none !important; filter: none !important; }
            html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: ${FONT_AR_FAMILY}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .sticker-container { display: block; }
            .sticker {
                width: 35mm; height: 80mm;
                box-sizing: border-box;
                padding: 3.5mm 2mm 3mm 2mm;
                page-break-after: always;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                overflow: hidden; text-align: center;
                border-bottom: 1px dashed #ccc;
            }
            @media print { .sticker { border-bottom: none; } }
            
            /* 1. رقم الأوردر */
            .order-label {
                font-size: 11px;
                font-weight: 900;
                color: #000;
                font-family: ${FONT_MONO_FAMILY};
                line-height: 1.1;
                margin-bottom: 1.5mm;
                letter-spacing: 0.5px;
            }
            
            /* 2. اسم العميل */
            .customer-label {
                font-size: 9.5px;
                font-weight: 700;
                color: #111;
                line-height: 1.15;
                margin-bottom: 2mm;
                width: 100%;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            /* 3. الشفرة (Barcode) */
            .barcode-box {
                width: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
                margin: 0.5mm 0;
            }
            .barcode-svg {
                max-width: 32mm;
                height: 28mm;
                display: block;
            }
            
            /* 4. السيريال تحت الشفرة */
            .serial-label {
                font-size: 9.5px;
                font-family: ${FONT_MONO_FAMILY};
                font-weight: 900;
                color: #000;
                letter-spacing: 0.5px;
                line-height: 1;
                margin-top: 1.5mm;
                word-break: break-all;
            }
        </style></head><body>
        <div class="sticker-container" id="container"></div>
        <script>
            const barcodes=${_barcodes};
            const orderNum=${_orderNum};
            const custName=${_custName};
            const c=document.getElementById('container');
            const BATCH=100;
            function renderBatch(start){
                const end=Math.min(start+BATCH,barcodes.length);
                const frag=document.createDocumentFragment();
                for(let i=start;i<end;i++){
                    const st=document.createElement('div');st.className='sticker';
                    st.innerHTML=
                        '<div class="order-label">'+orderNum+'</div>'+
                        '<div class="customer-label">'+custName+'</div>'+
                        '<div class="barcode-box"><svg id="s'+i+'" class="barcode-svg"></svg></div>'+
                        '<div class="serial-label">'+barcodes[i]+'</div>';
                    frag.appendChild(st);
                }
                c.appendChild(frag);
                barcodes.slice(start,end).forEach(function(_,j){
                    try{JsBarcode('#s'+(start+j),barcodes[start+j],{format:'CODE128',width:1.2,height:70,displayValue:false,margin:0});}catch(e){}
                });
                if(end<barcodes.length){setTimeout(function(){renderBatch(end);},10);}
                else{setTimeout(function(){window.print();},500);}
            }
            renderBatch(0);
        <\/script></body></html>`);
    printWin.document.close();
}

/**
 * 2. طباعة كارت متابعة أمر التشغيل الفردي A4 الرسمي فائق الدقة والتفصيل
 */
export function printOrderTrackingReport({ order, stages, unscannedCount, movements, generatedDate, printedBy }, mode = 'print') {
    const printWin = window.open('', '_blank');
    if (!printWin) {
        alert('يرجى السماح بفتح النوافذ المنبثقة للطباعة');
        return;
    }

    const printUser = getPrintedByUser(printedBy);
    const actionBar = generateReportActionBar({
        title: `بطاقة تتبع إنتاج أمر الشغل - ${order.order_number}`,
        tag: 'ORDER AUDIT SHEET',
        fileName: `كارت_تتبع_أوردر_${order.order_number}`,
        isLandscape: false,
        mode
    });
    const tQty = Number(order.target_quantity) || 0;
    const isClosed = order.status === 'closed';
    const reportRef = `FGE-ORD-${order.order_number}-${Math.floor(1000 + Math.random() * 9000)}`;
    const dateStr = generatedDate ? formatStandardDate(generatedDate) : getNowFormatted();
    const brand = getSystemBrand();

    // حساب الإجماليات والمعدل الكلي
    const stagesList = stages || [];
    const totalScansAllStages = stagesList.reduce((acc, s) => acc + (Number(s.scanned_quantity) || 0), 0);
    const maxPossibleScans = tQty * (stagesList.length || 6);
    const overallCompletionRate = order.overall_completion_rate != null
        ? order.overall_completion_rate
        : (maxPossibleScans > 0 ? Math.min(100, Math.round((totalScansAllStages / maxPossibleScans) * 100)) : (isClosed ? 100 : 0));

    const openedAt = order.created_at ? formatStandardDate(order.created_at) : '-';
    const closedAt = order.closed_at ? formatStandardDate(order.closed_at) : (isClosed ? 'مغلق ومكتمل' : 'قيد التشغيل والمسح');

    // كشف الفروق بين المراحل المتتالية (Stage Balance Check)
    let dropOffWarnings = [];
    for (let i = 0; i < stagesList.length - 1; i++) {
        const cur = stagesList[i];
        const next = stagesList[i + 1];
        const curScans = Number(cur.scanned_quantity) || 0;
        const nextScans = Number(next.scanned_quantity) || 0;
        if (curScans > nextScans) {
            const diff = curScans - nextScans;
            dropOffWarnings.push(`يوجد عدد (${fmtN(diff)}) قطعة أنجزت مرحلة [${cur.stage_name}] ولم تُمسح بعد في مرحلة [${next.stage_name}].`);
        }
    }

    let stagesRows = stagesList.map((s, idx) => {
        const sq = Number(s.scanned_quantity) || 0;
        const stq = Number(s.target_quantity) || tQty;
        const rem = Math.max(0, stq - sq);
        const pct = stq > 0 ? Math.min(100, Math.round((sq / stq) * 100)) : 0;
        const isDone = s.status === 'closed' || (stq > 0 && sq >= stq);
        const lastActivity = s.closed_at || s.last_scan || s.updated_at || s.created_at;

        return `<tr>
            <td style="text-align:center;font-weight:bold;font-family:${FONT_MONO_FAMILY};">${idx + 1}</td>
            <td style="font-weight:700;">${s.stage_name}</td>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-weight:700;">${fmtN(stq)}</td>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-weight:700;color:#047857;">${fmtN(sq)}</td>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-weight:700;color:${rem > 0 ? '#b91c1c' : '#047857'};">${fmtN(rem)}</td>
            <td style="text-align:center;">
                <div style="font-family:${FONT_MONO_FAMILY};font-weight:800;font-size:12px;">${pct}%</div>
                <div style="height:6px;width:100%;background:#e2e8f0;border-radius:3px;overflow:hidden;margin-top:3px;">
                    <div style="height:100%;width:${pct}%;background:${isDone ? '#10b981' : '#0284c7'};"></div>
                </div>
            </td>
            <td>${s.closed_by || s.scanned_by || s.scanners_list || 'مشرف الصالة'}</td>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-size:9.5px;color:#475569;">${lastActivity ? formatStandardDate(lastActivity) : '-'}</td>
            <td style="text-align:center;">
                <span class="badge ${isDone ? 'badge-success' : 'badge-progress'}">${isDone ? 'مكتملة' : 'قيد التشغيل'}</span>
            </td>
        </tr>`;
    }).join('');

    // سجل حركات وتواريخ المسح (بدون شفرات باركود بناءً على رغبة الإدارة)
    const movList = movements || [];
    const movRows = movList.slice(0, 100).map((m, i) => `
        <tr>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-size:9.5px;">${i + 1}</td>
            <td style="font-family:${FONT_MONO_FAMILY};font-weight:800;color:#0284c7;">${order.order_number}</td>
            <td style="font-weight:600;">${order.customer_name || '-'}</td>
            <td style="font-weight:700;">${m.stage_name || '-'}</td>
            <td>${m.scanned_by || '-'}</td>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-size:9.5px;color:#0f172a;font-weight:700;">${m.created_at ? formatStandardDate(m.created_at) : '-'}</td>
        </tr>
    `).join('');

    printWin.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head>
        <title>بطاقة تتبع إنتاج أمر الشغل - ${order.order_number}</title>
        <meta charset="UTF-8">
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap">
        <style>
            @page { size: A4 portrait; margin: 8mm 8mm 10mm 8mm; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-shadow: none !important; text-shadow: none !important; filter: none !important; }
            body { margin: 0; padding: 0; font-family: ${FONT_AR_FAMILY}; font-size: 11px; color: #0f172a; background: #fff; line-height: 1.4; }
            .sheet { width: 100%; max-width: 820px; margin: 0 auto; }
            .header-bar { border-bottom: 2.5px solid #0284c7; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start; }
            .brand-box { display: flex; align-items: center; gap: 10px; }
            .brand-logo { width: 44px; height: 44px; background: #0f172a; color: #38bdf8; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; font-family: ${FONT_MONO_FAMILY}; }
            .brand-names h1 { margin: 0; font-size: 15px; font-weight: 800; color: #0f172a; }
            .brand-names p { margin: 2px 0 0; font-size: 10px; color: #475569; font-weight: 600; }
            .title-box { text-align: center; }
            .title-box h2 { margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; }
            .title-box .doc-badge { display: inline-block; background: #f0f9ff; border: 1px solid #bae6fd; color: #0284c7; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; margin-top: 3px; }
            .meta-box { text-align: left; font-family: ${FONT_MONO_FAMILY}; font-size: 9.5px; }
            .meta-box strong { display: block; font-size: 11px; color: #0f172a; }

            .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; }
            .info-grid-item span { color: #64748b; font-size: 9px; display: block; margin-bottom: 1px; font-weight: 600; }
            .info-grid-item strong { color: #0f172a; font-weight: 800; font-size: 11px; }

            .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 12px; }
            .kpi-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; text-align: center; }
            .kpi-label { font-size: 9.5px; color: #64748b; font-weight: 700; }
            .kpi-val { font-size: 15px; font-weight: 800; margin-top: 3px; font-family: ${FONT_MONO_FAMILY}; color: #0f172a; }
            .kpi-sub { font-size: 8px; color: #64748b; font-family: ${FONT_MONO_FAMILY}; margin-top: 2px; }

            .details-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10.5px; }
            .details-table th { background: #0f172a; color: #fff; padding: 6px 8px; border: 1px solid #0f172a; font-weight: 700; font-size: 10px; text-align: right; }
            .details-table td { padding: 6px 8px; border: 1px solid #cbd5e1; }
            .details-table tbody tr:nth-child(even) { background: #f8fafc; }

            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; }
            .badge-success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
            .badge-progress { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }

            .alert-box { background: #fffbeb; border: 1px solid #fef3c7; border-right: 4px solid #f59e0b; border-radius: 4px; padding: 8px 12px; margin-bottom: 12px; font-size: 10px; color: #92400e; }
            .alert-box strong { display: block; margin-bottom: 3px; font-size: 10.5px; }

            ${actionBar.topBarCss}
            .printed-by-box { display: flex; justify-content: space-between; align-items: center; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 12px; margin-top: 14px; page-break-inside: avoid; font-size: 9.5px; }
            .print-meta-item { display: flex; align-items: center; gap: 6px; }
            .meta-title { color: #64748b; font-weight: 600; }
            .meta-value { color: #0f172a; font-weight: 800; }
        </style></head><body>
        ${actionBar.topBarHtml}
        <div class="sheet">
            <div class="header-bar">
                <div class="brand-box">
                    <div class="brand-logo">${brand.logo}</div>
                    <div class="brand-names">
                        <h1>${brand.nameEn}</h1>
                        <p>${brand.nameAr} · ${brand.sub}</p>
                    </div>
                </div>
                <div class="title-box">
                    <h2>بطاقة تتبع مسح وإنتاج أمر الشغل</h2>
                    <span class="doc-badge">ORDER INDUSTRIAL TRACKING AUDIT</span>
                </div>
                <div class="meta-box">
                    <span>Reference:</span>
                    <strong>${reportRef}</strong>
                    <span>Date: ${dateStr}</span>
                </div>
            </div>

            <!-- تفاصيل الأوردر الكاملة -->
            <div class="info-grid">
                <div class="info-grid-item"><span>رقم أمر التشغيل</span><strong style="color:#0284c7;font-family:${FONT_MONO_FAMILY};">${order.order_number}</strong></div>
                <div class="info-grid-item"><span>اسم العميل / الجهة</span><strong>${order.customer_name || '-'}</strong></div>
                <div class="info-grid-item"><span>نوع خط الإنتاج</span><strong>خط مصنع داخلي (6 مراحل)</strong></div>
                <div class="info-grid-item"><span>الحالة التشغيلية</span><strong style="color:${isClosed ? '#166534' : '#b45309'};">${isClosed ? 'مكتمل ومغلق' : 'قيد التشغيل والمسح'}</strong></div>
                <div class="info-grid-item"><span>تاريخ ووقت الفتح</span><strong style="font-family:${FONT_MONO_FAMILY};">${openedAt}</strong></div>
                <div class="info-grid-item"><span>أنشئ بواسطة</span><strong>${order.created_by || 'إدارة الإنتاج'}</strong></div>
                <div class="info-grid-item"><span>تاريخ ووقت الإغلاق</span><strong style="font-family:${FONT_MONO_FAMILY};">${closedAt}</strong></div>
                <div class="info-grid-item"><span>أُغلق بواسطة</span><strong>${order.closed_by || (isClosed ? 'مدير الصالة' : '—')}</strong></div>
            </div>

            <!-- كروت المؤشرات الخمسة -->
            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="kpi-label">الكمية المستهدفة</div>
                    <div class="kpi-val">${fmtN(tQty)}</div>
                    <div class="kpi-sub">قطعة مستهدفة</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">حركات المسح الكلية</div>
                    <div class="kpi-val" style="color:#0e7490;">${fmtN(totalScansAllStages)}</div>
                    <div class="kpi-sub">إجمالي الضربات</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">معدل الإنجاز العام</div>
                    <div class="kpi-val" style="color:${overallCompletionRate >= 100 ? '#166534' : '#0284c7'};">${overallCompletionRate}%</div>
                    <div class="kpi-sub">${overallCompletionRate >= 100 ? 'تم الإنجاز بالكامل' : 'نسبة تقدم المراحل'}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">شفرات غير ممسوحة</div>
                    <div class="kpi-val" style="color:${(unscannedCount || 0) > 0 ? '#b91c1c' : '#166534'};">${fmtN(unscannedCount || 0)}</div>
                    <div class="kpi-sub">${(unscannedCount || 0) > 0 ? 'مفقودة / متأخرة' : 'مطابقة 100%'}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">حالة أمر الشغل</div>
                    <div class="kpi-val" style="font-size:12px;color:${isClosed ? '#166534' : '#d97706'};">${isClosed ? 'مكتمل ومغلق' : 'قيد التشغيل'}</div>
                    <div class="kpi-sub">${isClosed ? 'تم الفحص والاعتماد' : 'جاري تداول القطع'}</div>
                </div>
            </div>

            ${dropOffWarnings.length > 0 ? `
            <div class="alert-box">
                <strong>⚠️ مؤشر توازن انسياب القطع بين المراحل (Process Bottleneck Analysis):</strong>
                ${dropOffWarnings.map(w => `<div>• ${w}</div>`).join('')}
            </div>
            ` : ''}

            <!-- جدول مراحل الإنتاج الصناعية الست -->
            <table class="details-table">
                <thead>
                    <tr>
                        <th style="width:30px;text-align:center;">#</th>
                        <th>المرحلة الإنتاجية</th>
                        <th style="text-align:center;">المستهدف</th>
                        <th style="text-align:center;">الممسوح الفعلي</th>
                        <th style="text-align:center;">المتبقي</th>
                        <th style="width:110px;text-align:center;">نسبة الإنجاز</th>
                        <th>مسؤول المرحلة</th>
                        <th style="text-align:center;">آخر نشاط مسح</th>
                        <th style="width:80px;text-align:center;">الحالة</th>
                    </tr>
                </thead>
                <tbody>
                    ${stagesRows}
                </tbody>
            </table>

            <!-- سجل تواريخ وأوقات حركات المسح الأخيرة -->
            ${movList.length > 0 ? `
            <div style="font-size:11px;font-weight:800;color:#0f172a;margin:12px 0 6px;border-right:3.5px solid #0284c7;padding-right:8px;">
                سجل تواريخ وأوقات حركات وتدقيق المسح بالصالة (أحدث ${Math.min(100, movList.length)} حركة مسجلة)
            </div>
            <table class="details-table">
                <thead>
                    <tr>
                        <th style="width:30px;text-align:center;">م</th>
                        <th>رقم الأوردر</th>
                        <th>اسم العميل</th>
                        <th>المرحلة الصناعية</th>
                        <th>المشغل / السكانر</th>
                        <th style="text-align:center;">تاريخ ووقت حركة المسح الدقيق</th>
                    </tr>
                </thead>
                <tbody>
                    ${movRows}
                </tbody>
            </table>
            ` : ''}

            <div class="printed-by-box">
                <div class="print-meta-item">
                    <span class="meta-title">طُبع بواسطة المستخدم:</span>
                    <strong class="meta-value">${printUser}</strong>
                </div>
                <div class="print-meta-item">
                    <span class="meta-title">تاريخ ووقت الطباعة:</span>
                    <strong class="meta-value">${dateStr}</strong>
                </div>
                <div class="print-meta-item">
                    <span class="meta-title">نظام التدقيق المركزي:</span>
                    <strong class="meta-value">${brand.nameEn || brand.nameAr || 'HMS Group'} · Audit Engine</strong>
                </div>
            </div>
        </div>
        ${actionBar.scriptHtml}</body></html>`);
    printWin.document.close();
}

/**
 * 3. طباعة التقرير الشامل لجميع الأوردرات A4 بنقاء فائق وجداول هندسية شاملة التفاصيل
 */
export function printComprehensiveReportWindow({ orders, timestamp, stagesList, printedBy }, mode = 'print') {
    const printWin = window.open('', '_blank');
    if (!printWin) {
        alert('يرجى السماح بفتح النوافذ المنبثقة للطباعة');
        return;
    }

    const printUser = getPrintedByUser(printedBy);
    const brand = getSystemBrand();
    const stages = stagesList || ["دخول انتاج", "خروج انتاج", "دخول مغسلة", "خروج مغسلة", "دخول تعبئة", "خروج تعبئة"];
    const list = orders || [];
    const dateStr = timestamp ? formatStandardDate(timestamp) : getNowFormatted();
    const actionBar = generateReportActionBar({
        title: 'التقرير الشامل لتتبع إنتاج ومسح المصنع والتشغيل الخارجي',
        tag: 'COMPREHENSIVE AUDIT',
        fileName: `التقرير_الشامل_للمصنع_${dateStr.replace(/[\/\s:]/g, '_')}`,
        isLandscape: true,
        mode
    });
    const totalOrders = list.length;
    const activeC = list.filter(o => o.status !== 'closed').length;
    const closedC = totalOrders - activeC;
    const totalTarget = list.reduce((acc, o) => acc + (Number(o.target_quantity) || 0), 0);

    const factoryCount = list.filter(o => !o.is_external).length;
    const externalCount = list.filter(o => o.is_external).length;
    const activeFact = list.filter(o => !o.is_external && o.status !== 'closed').length;
    const activeExt = list.filter(o => o.is_external && o.status !== 'closed').length;
    const closedFact = list.filter(o => !o.is_external && o.status === 'closed').length;
    const closedExt = list.filter(o => o.is_external && o.status === 'closed').length;

    let totalScannedAcrossAll = 0;

    let rowsHtml = list.map((o, idx) => {
        const isClosed = o.status === 'closed';
        const tQty = Number(o.target_quantity) || 0;
        const crDate = o.created_at ? formatStandardDate(o.created_at) : '-';
        const clDate = o.closed_at ? formatStandardDate(o.closed_at) : (isClosed ? 'مغلق' : '-');

        let stagesCols = '';
        if (o.is_external) {
            const sq = Number(o.scanned_quantity ?? o.total_scanned ?? 0);
            totalScannedAcrossAll += sq;
            const pct = o.overall_completion_rate != null ? o.overall_completion_rate : (tQty > 0 ? Math.min(100, Math.round((sq / tQty) * 100)) : 0);
            stagesCols = `<td colspan="${stages.length}" style="text-align:center;background:#ecfeff;border-color:#a5f3fc;font-family:${FONT_MONO_FAMILY};color:#0e7490;padding:6px 10px;">
                <span style="display:inline-block;background:#06b6d4;color:#fff;padding:1.5px 6px;border-radius:4px;font-size:9px;font-weight:700;margin-left:6px;">🏭 تشغيل خارجي (${o.external_operation || 'خارجي'})</span>
                <strong>الممسوح: ${fmtN(sq)} / ${fmtN(tQty)}</strong>
                <span style="margin-right:6px;font-weight:700;">(${pct}%)</span>
            </td>`;
        } else {
            let orderScans = 0;
            stagesCols = stages.map(stgName => {
                const s = (o.stages || []).find(x => x.stage_name === stgName);
                const sq = s ? Number(s.scanned_quantity) : 0;
                orderScans += sq;
                const pct = tQty > 0 ? Math.min(100, Math.round((sq / tQty) * 100)) : 0;
                return `<td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-size:10px;">
                    <div style="font-weight:700;">${fmtN(sq)}</div>
                    <div style="color:#64748b;font-size:8.5px;">${pct}%</div>
                </td>`;
            }).join('');
            totalScannedAcrossAll += orderScans;
        }

        return `<tr>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};">${idx + 1}</td>
            <td style="font-weight:800;font-family:${FONT_MONO_FAMILY};color:#0284c7;">
                ${o.order_number}
                ${o.is_external ? '<span style="display:inline-block;background:#cffafe;color:#0e7490;border:1px solid #a5f3fc;padding:0 4px;border-radius:3px;font-size:8px;margin-right:4px;font-family:sans-serif;">خارجي</span>' : ''}
            </td>
            <td style="font-weight:700;">${o.customer_name || '-'}</td>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-weight:800;color:${o.is_external ? '#0891b2' : '#d97706'};">${fmtN(tQty)}</td>
            ${stagesCols}
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-size:9px;">${crDate}</td>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-size:9px;">${clDate}</td>
            <td style="text-align:center;">
                <span class="badge ${isClosed ? 'badge-success' : o.is_external ? 'badge-info' : 'badge-progress'}">${isClosed ? 'مكتمل' : 'قيد التشغيل'}</span>
            </td>
        </tr>`;
    }).join('');

    printWin.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head>
        <title>التقرير الشامل لمتابعة إنتاج المصنع والتشغيل الخارجي</title>
        <meta charset="UTF-8">
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap">
        <style>
            @page { size: A4 landscape; margin: 8mm; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-shadow: none !important; text-shadow: none !important; filter: none !important; }
            body { margin: 0; padding: 0; font-family: ${FONT_AR_FAMILY}; font-size: 11px; color: #0f172a; background: #fff; line-height: 1.35; }
            .header-bar { border-bottom: 2.5px solid #0284c7; padding-bottom: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-start; }
            .brand-box { display: flex; align-items: center; gap: 8px; }
            .brand-logo { width: 38px; height: 38px; background: #0f172a; color: #38bdf8; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; font-family: ${FONT_MONO_FAMILY}; }
            .brand-names h1 { margin: 0; font-size: 14px; font-weight: 800; color: #0f172a; }
            .brand-names p { margin: 1px 0 0; font-size: 10px; color: #475569; }
            .title-box { text-align: center; }
            .title-box h2 { margin: 0; font-size: 15px; font-weight: 800; color: #0f172a; }
            .title-box .doc-badge { display: inline-block; background: #f0f9ff; border: 1px solid #bae6fd; color: #0284c7; padding: 1.5px 6px; border-radius: 4px; font-size: 9.5px; font-weight: 700; margin-top: 2px; }

            .kpi-strip { display: flex; gap: 8px; margin-bottom: 10px; }
            .kpi-chip { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px; padding: 6px 8px; text-align: center; }
            .kpi-chip-label { font-size: 9px; color: #64748b; font-weight: 600; }
            .kpi-chip-val { font-size: 13px; font-weight: 800; font-family: ${FONT_MONO_FAMILY}; margin-top: 2px; color: #0f172a; }
            .kpi-chip-sub { font-size: 8.5px; color: #64748b; font-family: ${FONT_MONO_FAMILY}; margin-top: 2px; }

            .comp-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10px; }
            .comp-table th { background: #0f172a; color: #fff; padding: 6px 5px; border: 1px solid #0f172a; font-weight: 700; font-size: 9.5px; text-align: center; }
            .comp-table td { padding: 5px 6px; border: 1px solid #cbd5e1; }
            .comp-table tbody tr:nth-child(even) { background: #f8fafc; }
            .comp-table tfoot td { background: #0f172a; color: #fff; font-weight: 800; padding: 7px 6px; border: 1px solid #0f172a; }

            .badge { display: inline-block; padding: 1.5px 5px; border-radius: 3px; font-size: 9px; font-weight: 700; }
            .badge-success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
            .badge-progress { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
            .badge-info { background: #cffafe; color: #0e7490; border: 1px solid #a5f3fc; }

            ${actionBar.topBarCss}
            .printed-by-box { display: flex; justify-content: space-between; align-items: center; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 12px; margin-top: 12px; page-break-inside: avoid; }
            .print-meta-item { display: flex; align-items: center; gap: 6px; font-size: 9.5px; }
            .meta-title { color: #64748b; font-weight: 600; }
            .meta-value { color: #0f172a; font-weight: 800; }
        </style></head><body>
        ${actionBar.topBarHtml}
        <div class="sheet">
            <div class="header-bar">
                <div class="brand-box">
                    <div class="brand-logo">${brand.logo}</div>
                    <div class="brand-names">
                        <h1>${brand.nameEn}</h1>
                        <p>${brand.nameAr} · ${brand.sub}</p>
                    </div>
                </div>
                <div class="title-box">
                    <h2>التقرير الشامل لتتبع إنتاج ومسح المصنع والتشغيل الخارجي</h2>
                    <span class="doc-badge">COMPREHENSIVE OPERATIONS AUDIT</span>
                </div>
                <div style="text-align:left;font-family:${FONT_MONO_FAMILY};font-size:9.5px;">
                    <div>Date: <strong>${dateStr}</strong></div>
                    <div>Total Orders: <strong>${totalOrders}</strong> (${factoryCount} Factory · ${externalCount} External)</div>
                </div>
            </div>

            <div class="kpi-strip">
                <div class="kpi-chip">
                    <div class="kpi-chip-label">إجمالي الأوامر</div>
                    <div class="kpi-chip-val">${totalOrders}</div>
                    <div class="kpi-chip-sub">${factoryCount} مصنع · ${externalCount} خارجي</div>
                </div>
                <div class="kpi-chip">
                    <div class="kpi-chip-label">أوامر قيد التشغيل</div>
                    <div class="kpi-chip-val" style="color:#d97706;">${activeC}</div>
                    <div class="kpi-chip-sub">${activeFact} مصنع · ${activeExt} خارجي</div>
                </div>
                <div class="kpi-chip">
                    <div class="kpi-chip-label">أوامر مكتملة</div>
                    <div class="kpi-chip-val" style="color:#059669;">${closedC}</div>
                    <div class="kpi-chip-sub">${closedFact} مصنع · ${closedExt} خارجي</div>
                </div>
                <div class="kpi-chip">
                    <div class="kpi-chip-label">إجمالي القطع المستهدفة</div>
                    <div class="kpi-chip-val" style="color:#0284c7;">${fmtN(totalTarget)}</div>
                    <div class="kpi-chip-sub">مجموع كميات التشغيل الكلية</div>
                </div>
                <div class="kpi-chip">
                    <div class="kpi-chip-label">إجمالي حركات المسح المنفذة</div>
                    <div class="kpi-chip-val" style="color:#0f766e;">${fmtN(totalScannedAcrossAll)}</div>
                    <div class="kpi-chip-sub">إجمالي الضربات الفعلية</div>
                </div>
            </div>

            <table class="comp-table">
                <thead>
                    <tr>
                        <th style="width:25px;">#</th>
                        <th style="width:85px;">رقم الأوردر</th>
                        <th>العميل</th>
                        <th style="width:70px;">المستهدف</th>
                        ${stages.map(st => `<th>${st}</th>`).join('')}
                        <th style="width:75px;">تاريخ الفتح</th>
                        <th style="width:75px;">تاريخ الإغلاق</th>
                        <th style="width:65px;">الحالة</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="3" style="text-align:center;">الإجمالي العام لكافة أوامر التشغيل (${totalOrders} أمر)</td>
                        <td style="text-align:center;font-family:${FONT_MONO_FAMILY};">${fmtN(totalTarget)}</td>
                        <td colspan="${stages.length + 3}" style="text-align:right;font-family:${FONT_MONO_FAMILY};">
                            مجموع حركات المسح المنفذة على كافة المراحل: <strong style="color:#38bdf8;">${fmtN(totalScannedAcrossAll)}</strong> ضربة مسجلة
                        </td>
                    </tr>
                </tfoot>
            </table>

            <div class="printed-by-box">
                <div class="print-meta-item">
                    <span class="meta-title">طُبع بواسطة المستخدم:</span>
                    <strong class="meta-value">${printUser}</strong>
                </div>
                <div class="print-meta-item">
                    <span class="meta-title">تاريخ ووقت استخراج التقرير:</span>
                    <strong class="meta-value">${dateStr}</strong>
                </div>
                <div class="print-meta-item">
                    <span class="meta-title">محرك التدقيق الآلي:</span>
                    <strong class="meta-value">${brand.nameEn || brand.nameAr || 'HMS Group'} · Automated Industrial Auditing Engine</strong>
                </div>
            </div>
        </div>
        ${actionBar.scriptHtml}</body></html>`);
    printWin.document.close();
}

/**
 * 4. طباعة كشف الشفرات المفقودة / غير الممسوحة A4 (Unscanned Barcodes Audit List)
 */
export function printUnscannedReportWindow({ order_number, customer_name, stage_name, barcodes, printedBy }, mode = 'print') {
    if (!barcodes || barcodes.length === 0) {
        alert('لا توجد شفرات مفقودة في هذه المرحلة');
        return;
    }

    const printWin = window.open('', '_blank');
    if (!printWin) {
        alert('يرجى السماح بفتح النوافذ المنبثقة للطباعة');
        return;
    }

    const printUser = getPrintedByUser(printedBy);
    const brand = getSystemBrand();
    const totalCount = barcodes.length;
    const stageTitle = stage_name === 'ALL' || !stage_name ? 'لم تُضرب في أي مرحلة إطلاقاً' : `مفقودة في مرحلة: ${stage_name}`;
    const dateStr = getNowFormatted();
    const actionBar = generateReportActionBar({
        title: `كشف حصر الشفرات غير الممسوحة - ${order_number}`,
        tag: 'UNSCANNED BARCODES AUDIT',
        fileName: `كشف_الشفرات_المفقودة_${order_number}`,
        isLandscape: false,
        mode
    });

    let barcodesCols = barcodes.map((b, i) => `
        <div style="border:1px solid #cbd5e1;padding:4px 6px;border-radius:4px;display:flex;justify-content:space-between;background:#f8fafc;font-size:10px;">
            <span style="color:#64748b;font-size:9px;">#${i + 1}</span>
            <strong style="font-family:${FONT_MONO_FAMILY};">${b}</strong>
        </div>
    `).join('');

    printWin.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head>
        <title>كشف الشفرات غير الممسوحة - ${order_number}</title>
        <meta charset="UTF-8">
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap">
        <style>
            @page { size: A4 portrait; margin: 8mm; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-shadow: none !important; text-shadow: none !important; filter: none !important; }
            body { margin: 0; padding: 0; font-family: ${FONT_AR_FAMILY}; font-size: 11px; color: #0f172a; background: #fff; line-height: 1.4; }
            .sheet { width: 100%; max-width: 820px; margin: 0 auto; }
            ${actionBar.topBarCss}
            .header-bar { border-bottom: 2px solid #b91c1c; padding-bottom: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
            .brand-box { display: flex; align-items: center; gap: 8px; }
            .brand-logo { width: 36px; height: 36px; background: #b91c1c; color: #fff; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; font-family: ${FONT_MONO_FAMILY}; }
            .brand-names h1 { margin: 0; font-size: 13.5px; font-weight: 800; color: #0f172a; }
            .brand-names p { margin: 1px 0 0; font-size: 10px; color: #64748b; }
            .title-box { text-align: center; }
            .title-box h2 { margin: 0; font-size: 14px; font-weight: 800; color: #b91c1c; }
            .title-box p { margin: 1px 0 0; font-size: 10px; color: #475569; }

            .kpi-row { display: flex; gap: 8px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; padding: 6px 10px; margin-bottom: 12px; font-size: 10.5px; }
            .kpi-col { flex: 1; }
            .kpi-col strong { color: #9f1239; font-family: ${FONT_MONO_FAMILY}; }

            .grid-container { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-bottom: 15px; }

            .printed-by-box { display: flex; justify-content: space-between; align-items: center; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 14px; margin-top: 15px; page-break-inside: avoid; }
            .print-meta-item { display: flex; align-items: center; gap: 6px; font-size: 10.5px; }
            .meta-title { color: #64748b; font-weight: 600; }
            .meta-value { color: #0f172a; font-weight: 800; }
        </style></head><body>
        ${actionBar.topBarHtml}
        <div class="sheet">
            <div class="header-bar">
                <div class="brand-box">
                    <div class="brand-logo">${brand.logo}</div>
                    <div class="brand-names">
                        <h1>${brand.nameEn}</h1>
                        <p>${brand.nameAr} · كشف تدقيق وتتبع الشفرات الناقصة والمفقودة</p>
                    </div>
                </div>
                <div class="title-box">
                    <h2>كشف حصر الشفرات غير الممسوحة</h2>
                    <p>${stageTitle}</p>
                </div>
                <div style="text-align:left;font-family:${FONT_MONO_FAMILY};font-size:9.5px;">
                    <div>Date: <strong>${dateStr}</strong></div>
                    <div>Missing: <strong style="color:#b91c1c;">${fmtN(totalCount)}</strong></div>
                </div>
            </div>

            <div class="kpi-row">
                <div class="kpi-col">أمر الشغل: <strong>${order_number}</strong></div>
                <div class="kpi-col">العميل: <strong>${customer_name || '-'}</strong></div>
                <div class="kpi-col">المرحلة: <strong>${stage_name || 'الكل'}</strong></div>
                <div class="kpi-col">إجمالي الشفرات المفقودة: <strong>${fmtN(totalCount)} قطعة</strong></div>
            </div>

            <div class="grid-container">
                ${barcodesCols}
            </div>

            <div class="printed-by-box">
                <div class="print-meta-item">
                    <span class="meta-title">طُبع بواسطة المستخدم:</span>
                    <strong class="meta-value">${printUser}</strong>
                </div>
                <div class="print-meta-item">
                    <span class="meta-title">تاريخ ووقت الطباعة:</span>
                    <strong class="meta-value">${dateStr}</strong>
                </div>
                <div class="print-meta-item">
                    <span class="meta-title">نظام التدقيق:</span>
                    <strong class="meta-value">${brand.nameEn || brand.nameAr || 'HMS Group'} · Audit Engine</strong>
                </div>
            </div>
        </div>
        ${actionBar.scriptHtml}</body></html>`);
    printWin.document.close();
}

/**
 * 5. طباعة بطاقة تدقيق وتتميم أمر التشغيل الخارجي A4 الرسمية المفصلة
 */
export function printExternalOrderReport({ order, scans, printedBy }, mode = 'print') {
    const printWin = window.open('', '_blank');
    if (!printWin) {
        alert('يرجى السماح بفتح النوافذ المنبثقة للطباعة');
        return;
    }

    const printUser = getPrintedByUser(printedBy);
    const brand = getSystemBrand();
    const dateStr = getNowFormatted();
    const actionBar = generateReportActionBar({
        title: `تقرير تتميم أمر تشغيل خارجي - ${order.order_number}`,
        tag: 'EXTERNAL AUDIT REPORT',
        fileName: `تقرير_تشغيل_خارجي_${order.order_number}`,
        isLandscape: false,
        mode
    });
    const isClosed = order.status === 'closed';
    const reportRef = `FGE-EXT-${order.order_number}-${Math.floor(1000 + Math.random() * 9000)}`;
    const scanList = scans || [];
    const totalScanned = Number(order.total_scanned ?? order.scanned_quantity ?? scanList.length);
    const targetQty = Number(order.target_quantity) || 0;
    const isCompleted = targetQty > 0 && totalScanned >= targetQty;
    const remainingQty = targetQty > 0 ? Math.max(0, targetQty - totalScanned) : 0;
    const progressPct = targetQty > 0 ? Math.min(100, Math.round((totalScanned / targetQty) * 100)) : 100;
    
    const completionStatus = targetQty > 0
        ? (isCompleted ? '✅ تم التتميم الكامل على العدد الكلي بنسبة 100%' : `⏳ لم يتم التتميم بعد (الممسوح: ${fmtN(totalScanned)} من ${fmtN(targetQty)} قطعة — متبقي ${fmtN(remainingQty)} قطعة)`)
        : 'أمر تشغيل خارجي مفتوح (مسح مستمر بدون كمية محددة)';

    const openedAt = order.created_at ? formatStandardDate(order.created_at) : '-';
    const closedAt = order.closed_at ? formatStandardDate(order.closed_at) : (isClosed ? 'مغلق ومكتمل' : '— قيد التشغيل (لم يُغلق بعد) —');

    // تجميع إحصائيات المشغلين
    const scannersMap = {};
    scanList.forEach(s => {
        const u = s.scanned_by || order.created_by || 'مشغل خارجي';
        if (!scannersMap[u]) {
            scannersMap[u] = { count: 0, firstScan: s.created_at, lastScan: s.created_at };
        }
        scannersMap[u].count += 1;
        if (s.created_at && (!scannersMap[u].firstScan || new Date(s.created_at) < new Date(scannersMap[u].firstScan))) {
            scannersMap[u].firstScan = s.created_at;
        }
        if (s.created_at && (!scannersMap[u].lastScan || new Date(s.created_at) > new Date(scannersMap[u].lastScan))) {
            scannersMap[u].lastScan = s.created_at;
        }
    });

    if (Object.keys(scannersMap).length === 0 && order.created_by) {
        scannersMap[order.created_by] = { count: totalScanned, firstScan: order.created_at, lastScan: order.closed_at || order.created_at };
    }

    const scannersRows = Object.entries(scannersMap).map(([name, data], i) => {
        const count = data.count || 0;
        const pct = totalScanned > 0 ? Math.round((count / totalScanned) * 100) : 0;
        return `<tr>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};">${i + 1}</td>
            <td style="font-weight:700;">${name}</td>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-weight:700;color:#0f766e;">${fmtN(count)} قطعة</td>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-weight:700;">${pct}%</td>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-size:9.5px;">${data.firstScan ? formatStandardDate(data.firstScan) : '-'}</td>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-size:9.5px;">${data.lastScan ? formatStandardDate(data.lastScan) : '-'}</td>
        </tr>`;
    }).join('');

    // سجل تفصيلي لتواريخ وأوقات حركات المسح (بدون شفرات باركود بناءً على رغبة الإدارة)
    const scanItemsRows = scanList.slice(0, 100).map((s, idx) => `
        <tr>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-size:9.5px;">${idx + 1}</td>
            <td style="font-family:${FONT_MONO_FAMILY};font-weight:800;color:#0f766e;">${order.order_number}</td>
            <td style="font-weight:600;">${order.customer_name || 'تشغيل خارجي'}</td>
            <td>${s.scanned_by || 'مشغل خارجي'}</td>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-size:9.5px;color:#0f172a;font-weight:700;">${s.created_at ? formatStandardDate(s.created_at) : '-'}</td>
        </tr>
    `).join('');

    printWin.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head>
        <title>تقرير تتميم تشغيل خارجي - ${order.order_number}</title>
        <meta charset="UTF-8">
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap">
        <style>
            @page { size: A4 portrait; margin: 10mm 10mm 12mm 10mm; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-shadow: none !important; text-shadow: none !important; filter: none !important; }
            body { margin: 0; padding: 0; font-family: ${FONT_AR_FAMILY}; font-size: 11.5px; color: #0f172a; background: #fff; line-height: 1.45; }
            .sheet { width: 100%; max-width: 820px; margin: 0 auto; }
            .header-bar { border-bottom: 3px solid #0891b2; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start; }
            .brand-box { display: flex; align-items: center; gap: 10px; }
            .brand-logo { width: 44px; height: 44px; background: #0c1930; color: #22d3ee; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; font-family: ${FONT_MONO_FAMILY}; border: 1.5px solid #0891b2; }
            .brand-names h1 { margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; }
            .brand-names p { margin: 2px 0 0; font-size: 10.5px; color: #0891b2; font-weight: 600; }
            .title-box { text-align: center; }
            .title-box h2 { margin: 0; font-size: 17px; font-weight: 800; color: #0f172a; }
            .title-box .doc-badge { display: inline-block; background: #f0fdfa; border: 1.5px solid #99f6e4; color: #0f766e; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; margin-top: 3px; }
            .meta-box { text-align: left; font-family: ${FONT_MONO_FAMILY}; font-size: 9.5px; }
            .meta-box strong { display: block; font-size: 11px; color: #0f172a; }

            .info-banner { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; font-size: 11px; }
            .info-banner-item span { color: #64748b; font-size: 9.5px; display: block; margin-bottom: 2px; }
            .info-banner-item strong { color: #0f172a; font-weight: 700; font-size: 11.5px; }

            .completion-banner { padding: 9px 14px; border-radius: 6px; margin-bottom: 12px; font-weight: 800; font-size: 12.5px; text-align: center; border: 1.5px solid; }
            .completion-banner.done { background: #dcfce7; color: #166534; border-color: #86efac; }
            .completion-banner.pending { background: #fefce8; color: #854d0e; border-color: #fde047; }
            .completion-banner.open { background: #f0f9ff; color: #075985; border-color: #bae6fd; }

            .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
            .kpi-card { background: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 6px; padding: 10px; text-align: center; }
            .kpi-label { font-size: 10px; color: #0f766e; font-weight: 700; margin-bottom: 3px; }
            .kpi-val { font-size: 18px; font-weight: 900; font-family: ${FONT_MONO_FAMILY}; color: #115e59; }

            .section-title { font-size: 12px; font-weight: 800; color: #0f172a; margin: 12px 0 6px; border-right: 4px solid #0891b2; padding-right: 8px; }

            .details-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px; }
            .details-table th { background: #0c1930; color: #e0f2fe; padding: 6px 8px; border: 1px solid #0c1930; font-weight: 700; font-size: 10px; text-align: right; }
            .details-table td { padding: 6px 8px; border: 1px solid #e2e8f0; }
            .details-table tbody tr:nth-child(even) { background: #f0fdfa; }

            ${actionBar.topBarCss}
            .printed-by-box { display: flex; justify-content: space-between; align-items: center; background: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 6px; padding: 7px 12px; margin-top: 14px; font-size: 10px; page-break-inside: avoid; }
            .print-meta-item { display: flex; align-items: center; gap: 6px; }
            .meta-title { color: #0891b2; font-weight: 700; }
            .meta-value { color: #0f172a; font-weight: 800; font-family: ${FONT_MONO_FAMILY}; }
        </style></head><body>
        ${actionBar.topBarHtml}
        <div class="sheet">
            <div class="header-bar">
                <div class="brand-box">
                    <div class="brand-logo">EXT</div>
                    <div class="brand-names">
                        <h1>${brand.nameEn}</h1>
                        <p>${brand.nameAr} · قسم التشغيل الخارجي</p>
                    </div>
                </div>
                <div class="title-box">
                    <h2>تقرير تتميم أمر تشغيل خارجي</h2>
                    <span class="doc-badge">EXTERNAL AUDIT & TALLY REPORT</span>
                </div>
                <div class="meta-box">
                    <div>Ref: <strong>${reportRef}</strong></div>
                    <div>Date: <strong>${dateStr}</strong></div>
                </div>
            </div>

            <div class="info-banner">
                <div class="info-banner-item">
                    <span>رقم أمر التشغيل الخارجي</span>
                    <strong style="font-family:${FONT_MONO_FAMILY};color:#0f766e;font-size:12.5px;">${order.order_number}</strong>
                </div>
                <div class="info-banner-item">
                    <span>العميل / جهة التوريد الخارجية</span>
                    <strong style="color:#0f172a;">${order.customer_name || 'غير محدد'}</strong>
                </div>
                <div class="info-banner-item">
                    <span>البيان / نوع التشغيل</span>
                    <strong>${order.description || order.external_operation || 'تشغيل خارجي مفتوح'}</strong>
                </div>
                <div class="info-banner-item">
                    <span>تاريخ ووقت فتح الأمر</span>
                    <strong style="font-family:${FONT_MONO_FAMILY};">${openedAt}</strong>
                </div>
                <div class="info-banner-item">
                    <span>أنشئ بواسطة</span>
                    <strong>${order.created_by || 'مشرف التشغيل الخارجي'}</strong>
                </div>
                <div class="info-banner-item">
                    <span>تاريخ ووقت إغلاق الأمر</span>
                    <strong style="font-family:${FONT_MONO_FAMILY};color:${isClosed ? '#166534' : '#64748b'};">${closedAt}</strong>
                </div>
            </div>

            <div class="completion-banner ${targetQty > 0 ? (isCompleted ? 'done' : 'pending') : 'open'}">
                ${completionStatus}
            </div>

            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="kpi-label">الكمية المستهدفة (الاستلام)</div>
                    <div class="kpi-val">${targetQty > 0 ? fmtN(targetQty) : '∞ مفتوح'}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">إجمالي القطع الممسوحة</div>
                    <div class="kpi-val" style="color:${isCompleted ? '#166534' : '#0891b2'}">${fmtN(totalScanned)}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">المتبقي للتتميم</div>
                    <div class="kpi-val" style="color:${remainingQty === 0 && targetQty > 0 ? '#166534' : '#dc2626'}">${targetQty > 0 ? fmtN(remainingQty) : '—'}</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">نسبة الإنجاز والتتميم</div>
                    <div class="kpi-val" style="color:${progressPct >= 100 ? '#166534' : '#0891b2'}">${progressPct}%</div>
                </div>
            </div>

            <div class="section-title">المشغلون الذين عملوا وسجلوا على هذا الأمر</div>
            <table class="details-table">
                <thead>
                    <tr>
                        <th style="width:35px;text-align:center;">#</th>
                        <th>اسم المشغل</th>
                        <th style="text-align:center;">الكمية التي ضربها</th>
                        <th style="width:90px;text-align:center;">نسبة المساهمة</th>
                        <th style="text-align:center;">أول ضربة مسجلة</th>
                        <th style="text-align:center;">آخر ضربة مسجلة</th>
                    </tr>
                </thead>
                <tbody>
                    ${scannersRows || '<tr><td colspan="6" style="text-align:center;padding:12px;color:#64748b;">لا يوجد مشغلون مسجلون</td></tr>'}
                </tbody>
            </table>

            <!-- سجل تواريخ وأوقات حركات المسح -->
            ${scanList.length > 0 ? `
            <div class="section-title">سجل تواريخ وأوقات حركات وتدقيق المسح بأمر التشغيل الخارجي (أحدث ${Math.min(100, scanList.length)} حركة مسجلة)</div>
            <table class="details-table">
                <thead>
                    <tr>
                        <th style="width:35px;text-align:center;">م</th>
                        <th>رقم أمر التشغيل الخارجي</th>
                        <th>العميل / جهة التوريد</th>
                        <th>المشغل / السكانر</th>
                        <th style="text-align:center;">وقت وتاريخ المسح الدقيق</th>
                    </tr>
                </thead>
                <tbody>
                    ${scanItemsRows}
                </tbody>
            </table>
            ` : ''}

            <div class="printed-by-box">
                <div class="print-meta-item">
                    <span class="meta-title">طُبع بواسطة:</span>
                    <strong class="meta-value">${printUser}</strong>
                </div>
                <div class="print-meta-item">
                    <span class="meta-title">تاريخ ووقت الطباعة:</span>
                    <strong class="meta-value">${dateStr}</strong>
                </div>
                <div class="print-meta-item">
                    <span class="meta-title">نظام:</span>
                    <strong class="meta-value">${brand.nameAr} · External Audit Engine</strong>
                </div>
            </div>
        </div>
        ${actionBar.scriptHtml}</body></html>`);
    printWin.document.close();
}

/**
 * 6. طباعة التقرير الشامل لجميع أوامر التشغيل الخارجي A4
 */
export function printExternalComprehensiveReport({ orders, printedBy }, mode = 'print') {
    const printWin = window.open('', '_blank');
    if (!printWin) {
        alert('يرجى السماح بفتح النوافذ المنبثقة للطباعة');
        return;
    }

    const printUser = getPrintedByUser(printedBy);
    const brand = getSystemBrand();
    const dateStr = getNowFormatted();
    const actionBar = generateReportActionBar({
        title: 'التقرير الشامل لأوامر التشغيل الخارجي (مسح وتتميم)',
        tag: 'EXTERNAL OPERATIONS MASTER AUDIT',
        fileName: `التقرير_الشامل_للتشغيل_الخارجي_${dateStr.replace(/[\/\s:]/g, '_')}`,
        isLandscape: true,
        mode
    });
    const list = orders || [];
    const totalOrders = list.length;
    const totalScanned = list.reduce((sum, o) => sum + (Number(o.total_scanned ?? o.scanned_quantity) || 0), 0);
    const totalTarget = list.reduce((sum, o) => sum + (Number(o.target_quantity) || 0), 0);
    const totalRemaining = Math.max(0, totalTarget - totalScanned);
    const activeOrders = list.filter(o => o.status !== 'closed').length;
    const closedOrders = list.filter(o => o.status === 'closed').length;

    const rowsHtml = list.map((o, idx) => {
        const isClosed = o.status === 'closed';
        const targetQtyRow = Number(o.target_quantity) || 0;
        const totalScannedRow = Number(o.total_scanned ?? o.scanned_quantity) || 0;
        const isCompletedRow = targetQtyRow > 0 && totalScannedRow >= targetQtyRow;
        const remainingRow = targetQtyRow > 0 ? Math.max(0, targetQtyRow - totalScannedRow) : 0;
        const crDate = o.created_at ? formatStandardDate(o.created_at) : '-';
        const clDate = o.closed_at ? formatStandardDate(o.closed_at) : (isClosed ? 'مغلق' : '-');
        const completionLabel = targetQtyRow > 0
            ? (isCompletedRow ? 'تم التتميم' : `${fmtN(totalScannedRow)} / ${fmtN(targetQtyRow)}`)
            : '∞ مفتوح';
        return `<tr>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};">${idx + 1}</td>
            <td style="font-family:${FONT_MONO_FAMILY};font-weight:700;color:#0f766e;">${o.order_number}</td>
            <td style="font-weight:700;color:#0f172a;">${o.customer_name || '-'}</td>
            <td>${o.description || o.external_operation || 'تشغيل خارجي مفتوح'}</td>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-weight:700;color:#166534;">${fmtN(totalScannedRow)}</td>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-weight:700;color:#0f766e;">${targetQtyRow > 0 ? fmtN(targetQtyRow) : '∞'}</td>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-weight:700;color:${remainingRow > 0 ? '#b91c1c' : '#166534'};">${targetQtyRow > 0 ? fmtN(remainingRow) : '—'}</td>
            <td style="text-align:center;font-weight:700;color:${isCompletedRow ? '#166534' : (targetQtyRow > 0 ? '#b45309' : '#0369a1')};">${completionLabel}</td>
            <td>${o.scanners_list || o.created_by || 'مشغل خارجي'}</td>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-size:9.5px;">${crDate}</td>
            <td style="text-align:center;font-family:${FONT_MONO_FAMILY};font-size:9.5px;">${clDate}</td>
            <td style="text-align:center;">
                <span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;${isClosed ? 'background:#dcfce7;color:#166534;border:1px solid #bbf7d0;' : 'background:#f0fdfa;color:#0f766e;border:1px solid #99f6e4;'}">
                    ${isClosed ? 'مكتمل ومغلق' : 'قيد التشغيل'}
                </span>
            </td>
        </tr>`;
    }).join('');

    printWin.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head>
        <title>التقرير الشامل لأوامر التشغيل الخارجي</title>
        <meta charset="UTF-8">
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap">
        <style>
            @page { size: A4 landscape; margin: 8mm 8mm 10mm 8mm; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-shadow: none !important; text-shadow: none !important; filter: none !important; }
            body { margin: 0; padding: 0; font-family: ${FONT_AR_FAMILY}; font-size: 11px; color: #0f172a; background: #fff; line-height: 1.35; }
            .header-bar { border-bottom: 2.5px solid #0891b2; padding-bottom: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
            .brand-box { display: flex; align-items: center; gap: 8px; }
            .brand-logo { width: 38px; height: 38px; background: #0c1930; color: #22d3ee; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; font-family: ${FONT_MONO_FAMILY}; border: 1px solid #0891b2; }
            .brand-names h1 { margin: 0; font-size: 14px; font-weight: 800; }
            .brand-names p { margin: 1px 0 0; font-size: 10px; color: #0891b2; font-weight: 600; }
            .title-box { text-align: center; }
            .title-box h2 { margin: 0; font-size: 15px; font-weight: 800; }
            .kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 10px; }
            .kpi-box { background: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 6px; padding: 6px 10px; text-align: center; }
            .kpi-title { font-size: 9px; color: #0f766e; font-weight: 600; }
            .kpi-num { font-size: 13px; font-weight: 800; font-family: ${FONT_MONO_FAMILY}; color: #115e59; margin-top: 2px; }
            .report-table { width: 100%; border-collapse: collapse; font-size: 10px; }
            .report-table th { background: #0c1930; color: #e0f2fe; padding: 6px 8px; border: 1px solid #0c1930; text-align: right; font-weight: 700; font-size: 9.5px; }
            .report-table td { padding: 5px 8px; border: 1px solid #e2e8f0; }
            .report-table tbody tr:nth-child(even) { background: #f0fdfa; }
            .report-table tfoot td { background: #0c1930; color: #fff; font-weight: 800; padding: 6px 8px; border: 1px solid #0c1930; }

            ${actionBar.topBarCss}
            .footer-info { display: flex; justify-content: space-between; align-items: center; background: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 6px; padding: 7px 12px; margin-top: 14px; font-size: 9.5px; }
        </style></head><body>
        ${actionBar.topBarHtml}
        <div class="sheet">
            <div class="header-bar">
                <div class="brand-box">
                    <div class="brand-logo">EXT</div>
                    <div class="brand-names">
                        <h1>${brand.nameEn}</h1>
                        <p>${brand.nameAr} · تقرير التدقيق الشامل للتشغيل الخارجي</p>
                    </div>
                </div>
                <div class="title-box">
                    <h2>التقرير الشامل لأوامر التشغيل الخارجي (مسح وتتميم)</h2>
                    <span style="font-size:9.5px;color:#0891b2;font-weight:700;">EXTERNAL OPERATIONS MASTER AUDIT SHEET</span>
                </div>
                <div style="text-align:left;font-family:${FONT_MONO_FAMILY};font-size:9.5px;">
                    <div>Date: <strong>${dateStr}</strong></div>
                    <div>User: <strong>${printUser}</strong></div>
                </div>
            </div>

            <div class="kpi-row">
                <div class="kpi-box">
                    <div class="kpi-title">إجمالي أوامر التشغيل الخارجي</div>
                    <div class="kpi-num">${fmtN(totalOrders)} أوردر</div>
                </div>
                <div class="kpi-box">
                    <div class="kpi-title">إجمالي القطع المستهدفة</div>
                    <div class="kpi-num" style="color:#0284c7;">${fmtN(totalTarget)} قطعة</div>
                </div>
                <div class="kpi-box">
                    <div class="kpi-title">إجمالي القطع الممسوحة</div>
                    <div class="kpi-num" style="color:#166534;">${fmtN(totalScanned)} قطعة</div>
                </div>
                <div class="kpi-box">
                    <div class="kpi-title">أوامر قيد التشغيل (نشطة)</div>
                    <div class="kpi-num" style="color:#0f766e;">${fmtN(activeOrders)}</div>
                </div>
                <div class="kpi-box">
                    <div class="kpi-title">أوامر مكتملة ومغلقة</div>
                    <div class="kpi-num" style="color:#166534;">${fmtN(closedOrders)}</div>
                </div>
            </div>

            <table class="report-table">
                <thead>
                    <tr>
                        <th style="width:25px;text-align:center;">#</th>
                        <th>رقم الأمر</th>
                        <th>العميل / الجهة</th>
                        <th>البيان / الوصف</th>
                        <th style="text-align:center;">الممسوح فعلاً</th>
                        <th style="text-align:center;">الكمية المستهدفة</th>
                        <th style="text-align:center;">المتبقي</th>
                        <th style="text-align:center;">حالة التتميم</th>
                        <th>المشغلون</th>
                        <th style="text-align:center;">تاريخ الفتح</th>
                        <th style="text-align:center;">تاريخ الإغلاق</th>
                        <th style="text-align:center;">الحالة</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml || '<tr><td colspan="12" style="text-align:center;padding:12px;">لا توجد أوامر تشغيل خارجي مسجلة</td></tr>'}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="4" style="text-align:center;">الإجمالي العام لكافة أوامر التشغيل الخارجي (${totalOrders} أمر)</td>
                        <td style="text-align:center;font-family:${FONT_MONO_FAMILY};color:#4ade80;">${fmtN(totalScanned)}</td>
                        <td style="text-align:center;font-family:${FONT_MONO_FAMILY};color:#38bdf8;">${fmtN(totalTarget)}</td>
                        <td style="text-align:center;font-family:${FONT_MONO_FAMILY};color:#f87171;">${fmtN(totalRemaining)}</td>
                        <td colspan="5" style="text-align:left;font-size:9px;">
                            معدل التتميم العام: <strong>${totalTarget > 0 ? Math.round((totalScanned / totalTarget) * 100) : 100}%</strong>
                        </td>
                    </tr>
                </tfoot>
            </table>

            <div class="footer-info">
                <span>HMS Group · External Operations Master Auditing Engine</span>
                <span>طُبع بواسطة: <strong>${printUser}</strong> · وقت الطباعة: ${dateStr}</span>
            </div>
        </div>
        ${actionBar.scriptHtml}</body></html>`);
    printWin.document.close();
}

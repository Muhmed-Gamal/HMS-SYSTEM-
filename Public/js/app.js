/**
 * HMS Barcode System - Scanner App Logic (v3.0 Enterprise)
 * واجهة السكانر المحسّنة مع تفاعلات صوتية وبصرية عالية الدقة
 */

let currentOrder = null;

function getActiveStage() {
    const user = getCurrentUser();
    if (user && user.role === 'admin') {
        const select = document.getElementById('hallSelect');
        return select ? select.value : 'دخول انتاج';
    }
    return (user && user.stage_action) ? user.stage_action : 'دخول انتاج';
}

// ===== فتح الأوردر =====
async function lockOrStartOrder() {
    const orderNumInput = document.getElementById('orderNumber');
    if (!orderNumInput) return;
    const orderNumber = orderNumInput.value.trim();
    if (!orderNumber) {
        FreedomUI.toast('يرجى إدخال رقم الأوردر أولاً', 'warning');
        return;
    }

    const user = getCurrentUser();
    const isExternal = window.isExternalMode || (user && user.role === 'external_operator');

    const btn = document.getElementById('startOrderBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> فتح...'; }

    // ── فتح أمر تشغيل خارجي (مفتوح لأي باركود) ──
    if (isExternal) {
        try {
            const targetQtyInputVal = parseInt(document.getElementById('externalTargetQtyInput')?.value, 10) || 0;
            const customerNameVal = document.getElementById('externalCustomerNameInput')?.value?.trim() || undefined;
            const stageDirection = user?.stage_action || 'تشغيل خارجي (عام)';

            const res = await fetch('/api/external/orders/open', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    order_number: orderNumber,
                    customer_name: customerNameVal,
                    target_quantity: targetQtyInputVal,
                    stage_direction: stageDirection
                })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                FreedomUI.toast(data.message || 'تعذر فتح أمر التشغيل الخارجي', 'error');
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-unlock-alt"></i> فتح'; }
                return;
            }

            currentOrder = {
                ...data.order,
                target_quantity: Number(data.order.target_quantity) || 0,
                is_external: true
            };

            const targetInputEl = document.getElementById('externalTargetQtyInput');
            if (targetInputEl && data.order?.target_quantity > 0) {
                targetInputEl.value = data.order.target_quantity;
            }

            const custInputEl = document.getElementById('externalCustomerNameInput');
            if (custInputEl && data.order?.customer_name) {
                custInputEl.value = data.order.customer_name;
            }

            orderNumInput.disabled = true;
            document.getElementById('externalTargetQtyInput')?.setAttribute('disabled', 'true');
            document.getElementById('externalCustomerNameInput')?.setAttribute('disabled', 'true');
            if (btn) { btn.disabled = false; btn.classList.add('hidden'); }
            const closeBtn = document.getElementById('closeOrderBtn');
            if (closeBtn) closeBtn.classList.remove('hidden');

            const barcodeInput = document.getElementById('barcodeInput');
            const addBtn = document.getElementById('addBtn');
            if (barcodeInput) { barcodeInput.disabled = false; barcodeInput.focus(); }
            if (addBtn) addBtn.disabled = false;

            // تحديث بطاقة معلومات الأوردر
            document.getElementById('customerInfoBox')?.classList.remove('hidden');
            const custEl = document.getElementById('detectedCustomerName');
            const targetEl = document.getElementById('detectedTargetQty');
            const createdByContainer = document.getElementById('createdByContainer');
            const createdByEl = document.getElementById('detectedCreatedBy');
            const statusLabel = document.getElementById('orderStatusLabel');

            const targetQty = Number(currentOrder.target_quantity) || 0;
            const scannedQty = Number(currentOrder.total_scanned) || 0;
            const remQty = targetQty > 0 ? Math.max(0, targetQty - scannedQty) : 0;
            const progressPctVal = targetQty > 0 ? Math.min(100, Math.round((scannedQty / targetQty) * 100)) : 100;

            if (custEl) custEl.textContent = currentOrder.customer_name ? `تشغيل خارجي — ${currentOrder.customer_name}` : 'تشغيل خارجي مفتوح';
            if (targetEl) targetEl.textContent = targetQty > 0 ? `${targetQty.toLocaleString('en-US')} قطعة` : 'عداد مفتوح (غير مقيد)';
            if (createdByContainer) createdByContainer.style.display = 'block';
            if (createdByEl) createdByEl.textContent = currentOrder.created_by || 'مشغل خارجي';
            if (statusLabel) {
                const isClosed = currentOrder.status === 'closed';
                statusLabel.textContent = isClosed ? 'مكتمل ومغلق' : 'قيد المسح والتشغيل';
                statusLabel.className = isClosed ? 'badge-clean badge-green text-[10px]' : 'badge-clean text-[10px] font-bold';
                if (!isClosed) {
                    statusLabel.style.cssText = 'background:rgba(6,182,212,0.15);color:#22d3ee;border:1px solid rgba(6,182,212,0.3);';
                }
            }

            const el = id => document.getElementById(id);
            if (el('targetItemsCounter')) el('targetItemsCounter').textContent = targetQty > 0 ? targetQty.toLocaleString('en-US') : '∞';
            if (el('totalItemsCounter')) el('totalItemsCounter').textContent = scannedQty.toLocaleString('en-US');
            if (el('remainingItemsCounter')) el('remainingItemsCounter').textContent = targetQty > 0 ? remQty.toLocaleString('en-US') : '-';
            if (el('uniqueTypesCounter')) el('uniqueTypesCounter').textContent = (currentOrder.unique_scanned_count || (data.recent_scans ? new Set(data.recent_scans.map(s => s.barcode)).size : 0)).toLocaleString('en-US');

            const progressBar = el('scanProgressBar');
            const progressPct = el('scanProgressPct');
            if (progressBar) progressBar.style.width = targetQty > 0 ? `${progressPctVal}%` : '100%';
            if (progressPct) progressPct.textContent = targetQty > 0 ? `${progressPctVal}%` : `${scannedQty} قطعة`;

            renderMovementsTable(data.recent_scans || []);

            // حفظ الجلسة في الذاكرة المحلية لاستعادتها عند الريفريش
            localStorage.setItem('freedom_active_scanner_session', JSON.stringify({
                orderNumber: orderNumber,
                customerName: data.order?.customer_name || customerNameVal || '',
                targetQuantity: targetQty,
                stage: 'تشغيل خارجي',
                isExternal: true
            }));

            FreedomUI.toast(data.is_new 
                ? `تم فتح أمر تشغيل خارجي جديد: [${orderNumber}] - العداد جاهز` 
                : `تم استئناف أمر التشغيل الخارجي: [${orderNumber}] (السابق: ${scannedQty} قطعة)`, 
                'success');

        } catch (err) {
            console.error(err);
            FreedomUI.toast('تعذر الاتصال بالخادم أثناء فتح أمر التشغيل الخارجي', 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-unlock-alt"></i> فتح'; }
        }
        return;
    }

    try {
        const res = await fetch(`/api/orders/check/${encodeURIComponent(orderNumber)}`, { headers: authHeaders() });
        const data = await res.json();

        if (!data.exists) {
            FreedomUI.toast(`الأوردر (${orderNumber}) غير مسجل في النظام. يجب توليده أولاً.`, 'error', 4500);
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-unlock-alt"></i> فتح الأوردر'; }
            return;
        }

        const currentStage = getActiveStage();
        const stageLog = (data.stages || []).find(s => s.stage_name === currentStage);
        const scannedQty = stageLog ? Number(stageLog.scanned_quantity) : 0;
        const targetQty = Number(data.order.target_quantity) || 0;
        const isStageCompleted = stageLog && (stageLog.status === 'closed' || (targetQty > 0 && scannedQty >= targetQty));

        if (isStageCompleted) {
            FreedomUI.alert('المرحلة مكتملة', `مرحلة (${currentStage}) قد اكتملت بالكامل لهذا الأوردر وتم إغلاقها مسبقاً.`, 'warning');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-unlock-alt"></i> فتح الأوردر'; }
            return;
        }

        await loadOrderDetails(data.order.id);
        orderNumInput.disabled = true;

        if (btn) { btn.disabled = false; btn.classList.add('hidden'); }
        const closeBtn = document.getElementById('closeOrderBtn');
        if (closeBtn) closeBtn.classList.remove('hidden');

        const barcodeInput = document.getElementById('barcodeInput');
        const addBtn = document.getElementById('addBtn');
        if (barcodeInput) { barcodeInput.disabled = false; barcodeInput.focus(); }
        if (addBtn) addBtn.disabled = false;

        document.getElementById('customerInfoBox')?.classList.remove('hidden');

        // حفظ الجلسة في الذاكرة المحلية لاستعادتها عند الريفريش
        localStorage.setItem('freedom_active_scanner_session', JSON.stringify({
            orderNumber: orderNumber,
            stage: currentStage,
            isExternal: false
        }));

        FreedomUI.toast(`تم فتح الأوردر: ${orderNumber} | المرحلة: ${currentStage}`, 'success');

    } catch (err) {
        console.error(err);
        FreedomUI.toast('تعذر الاتصال بالخادم. تأكد من تشغيل السيرفر وقاعدة البيانات.', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-unlock-alt"></i> فتح الأوردر'; }
    }
}

// ===== تحميل تفاصيل الأوردر =====
async function loadOrderDetails(orderId) {
    try {
        const res = await fetch(`/api/orders/details/${orderId}`, { headers: authHeaders() });
        const data = await res.json();
        if (!data.success) {
            FreedomUI.toast(data.message || 'فشل جلب تفاصيل الأوردر', 'error');
            return;
        }

        currentOrder = data.order;
        const activeStage = getActiveStage();

        const customerElem = document.getElementById('detectedCustomerName');
        const targetElem = document.getElementById('detectedTargetQty');
        const createdByElem = document.getElementById('detectedCreatedBy');

        if (customerElem) customerElem.textContent = currentOrder.customer_name || 'عميل';
        if (targetElem) targetElem.textContent = `${(currentOrder.target_quantity || 0).toLocaleString('en-US')} قطعة`;

        // إظهار حقل "أنشئ بواسطة" فقط للمديرين والإدارة المتقدمة
        const user = getCurrentUser();
        const isAdmin = user && (user.role === 'admin' || user.role === 'superadmin');
        const createdByContainer = document.getElementById('createdByContainer');
        if (createdByContainer) {
            createdByContainer.style.display = isAdmin ? 'block' : 'none';
        }
        if (createdByElem) {
            createdByElem.textContent = isAdmin ? (currentOrder.created_by || 'النظام') : '';
        }

        const stageLog = (data.stages || []).find(s => s.stage_name === activeStage);
        const scannedQty = stageLog ? Number(stageLog.scanned_quantity) : 0;
        const targetQty = Number(currentOrder.target_quantity) || 0;
        const remainingQty = Math.max(0, targetQty - scannedQty);

        const el = id => document.getElementById(id);
        if (el('targetItemsCounter')) el('targetItemsCounter').textContent = targetQty.toLocaleString('en-US');
        if (el('totalItemsCounter')) el('totalItemsCounter').textContent = scannedQty.toLocaleString('en-US');
        if (el('remainingItemsCounter')) el('remainingItemsCounter').textContent = remainingQty.toLocaleString('en-US');

        // تحديث شريط ونسبة التقدم
        const pct = targetQty > 0 ? Math.min(100, Math.round((scannedQty / targetQty) * 100)) : 0;
        const progressBar = el('scanProgressBar');
        const progressPct = el('scanProgressPct');
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressPct) progressPct.textContent = `${pct}%`;

        const stageMovements = (data.movements || []).filter(m => m.stage_name === activeStage);
        const uniqueCounter = el('uniqueTypesCounter');
        if (uniqueCounter) uniqueCounter.textContent = new Set(stageMovements.map(m => m.barcode)).size;

        renderMovementsTable(stageMovements);

        const statusLabel = el('orderStatusLabel');
        if (statusLabel) {
            const isStageDone = stageLog && (stageLog.status === 'closed' || scannedQty >= targetQty);
            statusLabel.textContent = isStageDone ? 'مكتملة ومغلقة' : 'قيد التشغيل';
            statusLabel.className = isStageDone ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold';
        }

    } catch (err) {
        console.error('Error loading order details:', err);
    }
}

// ===== رسم جدول الحركات =====
function renderMovementsTable(movements) {
    const tbody = document.getElementById('ordersTableBody');
    if (!tbody) return;

    if (!movements || movements.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-500 text-xs">
            <i class="fas fa-barcode text-xl mb-1.5 block text-slate-700"></i>
            لا توجد قطع ممسوحة في هذه المرحلة بعد
        </td></tr>`;
        return;
    }

    const recentMovements = movements.slice(-100).reverse();

    tbody.innerHTML = recentMovements.map((m, index) => `
        <tr class="hover:bg-white/[0.02] transition-colors border-b border-white/[0.05]">
            <td class="p-3 text-slate-500 font-mono text-xs">${index + 1}</td>
            <td class="p-3 font-mono text-emerald-400 font-medium text-xs sm:text-sm tracking-wide">${m.barcode}</td>
            <td class="p-3 text-center font-bold text-slate-200 text-xs sm:text-sm">1</td>
            <td class="p-3 text-slate-300 text-xs truncate max-w-[140px]">${currentOrder?.customer_name || 'عميل'}</td>
            <td class="p-3 text-slate-400 text-xs font-mono">${currentOrder?.order_number || '--'}</td>
            <td class="p-3 text-blue-300 text-xs font-medium">${m.scanned_by || '--'}</td>
        </tr>`).join('');
}

// ===== معالجة المسح =====
async function handleBarcodeSubmit(event) {
    if (event) event.preventDefault();
    if (!currentOrder) {
        FreedomUI.toast('يرجى فتح الأوردر أولاً قبل البدء بالمسح', 'warning');
        return;
    }

    const input = document.getElementById('barcodeInput');
    if (!input) return;
    const barcode = input.value.trim();
    if (!barcode) return;

    const user = getCurrentUser();
    const stageName = getActiveStage();
    const scannedBy = (user && (user.full_name || user.username)) || 'سكانر';

    input.disabled = true;

    // ── معالجة مسح باركود التشغيل الخارجي (يقبل أي باركود) ──
    if (currentOrder && currentOrder.is_external) {
        try {
            const scanType = user?.stage_action?.includes('دخول') ? 'دخول' : (user?.stage_action?.includes('خروج') ? 'خروج' : 'عام');

            const res = await fetch('/api/external/scan', {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    order_id: currentOrder.id,
                    barcode: barcode,
                    scanned_by: scannedBy,
                    scan_type: scanType
                })
            });
            const data = await res.json();
            input.value = '';
            input.disabled = false;

            if (res.ok && data.success) {
                FreedomUI.beepSuccess();
                input.classList.remove('scan-shake-error');
                input.classList.add('scan-flash-success');
                setTimeout(() => input.classList.remove('scan-flash-success'), 450);

                currentOrder.total_scanned = data.total_scanned;
                const el = id => document.getElementById(id);
                if (el('totalItemsCounter')) el('totalItemsCounter').textContent = data.total_scanned.toLocaleString('en-US');
                
                const targetQty = Number(currentOrder.target_quantity) || Number(data.target_quantity) || 0;
                if (targetQty > 0) {
                    const rem = data.remaining_quantity !== undefined ? data.remaining_quantity : Math.max(0, targetQty - data.total_scanned);
                    const pct = Math.min(100, Math.round((data.total_scanned / targetQty) * 100));
                    if (el('remainingItemsCounter')) el('remainingItemsCounter').textContent = rem.toLocaleString('en-US');
                    if (el('scanProgressBar')) el('scanProgressBar').style.width = `${pct}%`;
                    if (el('scanProgressPct')) el('scanProgressPct').textContent = `${pct}%`;
                } else {
                    if (el('scanProgressPct')) el('scanProgressPct').textContent = `${data.total_scanned} قطعة`;
                }

                // تحديث عداد الأكواد الفريدة
                if (el('uniqueTypesCounter')) {
                    const cur = parseInt(el('uniqueTypesCounter').textContent.replace(/[^\d]/g, '') || '0', 10);
                    el('uniqueTypesCounter').textContent = (cur + 1).toLocaleString('en-US');
                }

                // إضافة الحركة فورياً في جدول الحركات
                const tbody = document.getElementById('ordersTableBody');
                if (tbody) {
                    const emptyRow = tbody.querySelector('td[colspan="6"]');
                    if (emptyRow) tbody.innerHTML = '';

                    const currentRows = tbody.querySelectorAll('tr').length;
                    const newRow = document.createElement('tr');
                    newRow.className = 'hover:bg-white/[0.02] transition-colors border-b border-white/[0.05] bg-emerald-500/15';
                    newRow.innerHTML = `
                        <td class="p-3 text-slate-500 font-mono text-xs">${currentRows + 1}</td>
                        <td class="p-3 font-mono text-emerald-400 font-bold text-xs sm:text-sm tracking-wide">${data.barcode}</td>
                        <td class="p-3 text-center font-bold text-slate-200 text-xs sm:text-sm">1</td>
                        <td class="p-3 text-purple-300 text-xs font-semibold">تشغيل خارجي [${scanType}]</td>
                        <td class="p-3 text-slate-400 text-xs font-mono">${currentOrder.order_number}</td>
                        <td class="p-3 text-blue-300 text-xs font-medium">${scannedBy}</td>
                    `;
                    tbody.insertBefore(newRow, tbody.firstChild);
                    setTimeout(() => newRow.classList.remove('bg-emerald-500/15'), 600);
                }

                if (data.is_completed) {
                    showOrderCompleteModal(`تم اكتمال التتميم بنجاح! تم الوصول للكمية المستهدفة الكلية (${targetQty} قطعة) لأمر التشغيل الخارجي [${currentOrder.order_number}].`);
                } else {
                    FreedomUI.toast(`كود مسجل [${barcode}] — الإجمالي: ${data.total_scanned.toLocaleString('en-US')}`, 'success', 1800);
                }
                input.focus();
            } else {
                FreedomUI.beepError();
                input.classList.add('scan-shake-error');
                setTimeout(() => input.classList.remove('scan-shake-error'), 450);
                FreedomUI.toast(data.message || 'الكود ممسوح مسبقاً في هذا الأوردر', 'error', 3500);
                input.focus();
            }
        } catch (err) {
            input.disabled = false;
            input.focus();
            FreedomUI.beepError();
            FreedomUI.toast('فشل إرسال المسح الخارجي إلى الخادم', 'error');
        }
        return;
    }

    try {
        const res = await fetch('/api/orders/stage-scan', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                order_id: currentOrder.id,
                stage_name: stageName,
                scanned_barcode: barcode,
                scanned_by: scannedBy
            })
        });
        const data = await res.json();

        input.value = '';
        input.disabled = false;

        if (res.ok && data.success) {
            // تفاعل بصري وسمعي فوري للنجاح
            FreedomUI.beepSuccess();
            input.classList.remove('scan-shake-error');
            input.classList.add('scan-flash-success');
            setTimeout(() => input.classList.remove('scan-flash-success'), 450);

            await loadOrderDetails(currentOrder.id);
            if (data.is_completed) {
                showOrderCompleteModal(data.message);
            } else {
                FreedomUI.toast(`كود صحيح [${barcode}] — الممسوح: ${data.scanned_quantity.toLocaleString('en-US')}/${data.target_quantity.toLocaleString('en-US')}`, 'success', 1800);
                input.focus();
            }
        } else {
            // تفاعل صوتي واهتزاز للخطأ
            FreedomUI.beepError();
            input.classList.add('scan-shake-error');
            setTimeout(() => input.classList.remove('scan-shake-error'), 450);

            FreedomUI.toast(data.message || 'الكود غير مطابق أو ممسوح مسبقاً', 'error', 3500);
            input.focus();
        }
    } catch (err) {
        input.disabled = false;
        input.focus();
        FreedomUI.beepError();
        FreedomUI.toast('فشل إرسال المسح إلى الخادم', 'error');
    }
}

// ===== نافذة اكتمال المرحلة =====
function showOrderCompleteModal(customMsg) {
    const modal = document.getElementById('orderCompleteModal');
    const msgElem = document.getElementById('orderCompleteMessage');
    if (modal && msgElem) {
        msgElem.textContent = customMsg || 'تم اكتمال العدد المطلوب وإغلاق المرحلة بنجاح.';
        modal.classList.remove('hidden');
    }
}

// ===== إنهاء الجلسة وإعادة الضبط =====
function closeAndResetOrder() {
    localStorage.removeItem('freedom_active_scanner_session');
    currentOrder = null;
    const orderNumInput = document.getElementById('orderNumber');
    if (orderNumInput) { orderNumInput.disabled = false; orderNumInput.value = ''; }

    const extTargetInput = document.getElementById('externalTargetQtyInput');
    if (extTargetInput) { extTargetInput.disabled = false; extTargetInput.value = ''; }

    const extCustInput = document.getElementById('externalCustomerNameInput');
    if (extCustInput) { extCustInput.disabled = false; extCustInput.value = ''; }

    document.getElementById('startOrderBtn')?.classList.remove('hidden');
    document.getElementById('closeOrderBtn')?.classList.add('hidden');

    const barcodeInput = document.getElementById('barcodeInput');
    const addBtn = document.getElementById('addBtn');
    if (barcodeInput) { barcodeInput.disabled = true; barcodeInput.value = ''; }
    if (addBtn) addBtn.disabled = true;

    document.getElementById('customerInfoBox')?.classList.add('hidden');

    const reset0 = id => { const el = document.getElementById(id); if (el) el.textContent = '0'; };
    reset0('targetItemsCounter');
    reset0('totalItemsCounter');
    reset0('remainingItemsCounter');
    reset0('uniqueTypesCounter');

    const progressBar = document.getElementById('scanProgressBar');
    const progressPct = document.getElementById('scanProgressPct');
    if (progressBar) progressBar.style.width = '0%';
    if (progressPct) progressPct.textContent = '0%';

    renderMovementsTable([]);
    FreedomUI.toast('تم إنهاء جلسة العمل الحالية للأوردر', 'info');
}

// ===== استعادة الجلسة تلقائياً عند إعادة تحميل الصفحة (Refresh) =====
window.addEventListener('DOMContentLoaded', () => {
    const savedRaw = localStorage.getItem('freedom_active_scanner_session');
    if (!savedRaw) return;
    try {
        const saved = JSON.parse(savedRaw);
        if (saved && saved.orderNumber) {
            const orderNumEl = document.getElementById('orderNumber');
            if (orderNumEl) orderNumEl.value = saved.orderNumber;
            if (saved.targetQuantity && document.getElementById('externalTargetQtyInput')) {
                document.getElementById('externalTargetQtyInput').value = saved.targetQuantity;
            }
            if (saved.customerName && document.getElementById('externalCustomerNameInput')) {
                document.getElementById('externalCustomerNameInput').value = saved.customerName;
            }
            // تشغيل الاستعادة تلقائياً بعد استقرار تهيئة الصفحة
            setTimeout(() => {
                if (typeof lockOrStartOrder === 'function') {
                    lockOrStartOrder();
                }
            }, 350);
        }
    } catch (e) {
        console.error('Error auto-resuming scanner session:', e);
    }
});
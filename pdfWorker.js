/**
 * HMS Barcode System - Dedicated PDF Worker Thread (High-Performance Edition)
 * يعمل في مسار معالجة مستقل تماماً (Dedicated Worker Thread)
 * مخصص لمكن طباعة الباركود الحراري (Thermal Barcode Printers) ورولات الاستيكر
 * المقاس المعتمد: العرض 3.5 سم × الطول 8 سم (35mm Width x 80mm Height)
 *
 * تحسينات الأداء:
 * 1. جلب الشفرات من قاعدة البيانات على دفعات 2000 (Chunked DB Streaming)
 * 2. معالجة الاستيكرات مع yield للـ Event Loop كل 200 استيكر
 * 3. كاش أنماط Code128 لتجنب إعادة الحساب
 * 4. Heartbeat كل 3 ثوان للعملية الأم
 * 5. 1MB write buffer لتسريع الكتابة على القرص
 */
'use strict';
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const PDFDocument = require('pdfkit');

const MM_TO_PT = 72 / 25.4;
const DB_CHUNK_SIZE = 2000;
const RENDER_CHUNK = 200;
const HEARTBEAT_MS = 3000;

const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112'
];

const FORMAT_CONFIGS = {
  roll_35x80: {
    type:'roll', orientation:'portrait', name:'3.5x8cm',
    widthPt: 35*MM_TO_PT, heightPt: 80*MM_TO_PT,
    barHeight:76, codeFontSize:8
  },
  roll_35x80_rot: {
    type:'roll', orientation:'rotated', name:'3.5x8cm rotated',
    widthPt: 35*MM_TO_PT, heightPt: 80*MM_TO_PT,
    barHeight:50, codeFontSize:8.5
  },
  roll_80x35: {
    type:'roll', orientation:'landscape', name:'8x3.5cm',
    widthPt: 80*MM_TO_PT, heightPt: 35*MM_TO_PT,
    barHeight:52, codeFontSize:10
  },
  sheet_a4: {
    type:'sheet', name:'A4',
    cols:3, rows:6, pageW:595.28, pageH:841.89, marginX:18, marginY:22
  }
};

// ===== Code128 Cache =====
const patternCache = new Map();
function encodeCode128B(text) {
  if (patternCache.has(text)) return patternCache.get(text);
  const codes = [104];
  let checkSum = 104;
  for (let i = 0; i < text.length; i++) {
    const val = text.charCodeAt(i) - 32;
    codes.push(val);
    checkSum += val * (i + 1);
  }
  codes.push(checkSum % 103);
  codes.push(106);
  const runs = [];
  for (let c = 0; c < codes.length; c++) {
    const pat = CODE128_PATTERNS[codes[c]];
    if (!pat) continue;
    for (let j = 0; j < pat.length; j++) {
      const w = parseInt(pat[j], 10);
      const bar = j % 2 === 0;
      if (runs.length > 0 && runs[runs.length-1].bar === bar) {
        runs[runs.length-1].width += w;
      } else {
        runs.push({ bar, width: w });
      }
    }
  }
  let totalModules = 0;
  for (const r of runs) totalModules += r.width;
  const result = { runs, totalModules };
  if (patternCache.size < 100000) patternCache.set(text, result);
  return result;
}

function sanitizeText(str) {
  if (!str) return '';
  return String(str).replace(/[^\x20-\x7E]/g, '');
}

function yieldToEventLoop() {
  return new Promise(resolve => setImmediate(resolve));
}

// ===== Draw Functions =====
function drawPortrait(doc, cfg, code, enc, idx, orderNum, customer) {
  const { runs, totalModules } = enc;
  const W = cfg.widthPt, H = cfg.heightPt;
  doc.addPage({ size: [W, H], margin: 0 });

  // 1. رقم الأوردر
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
     .text(orderNum, 4, 16, { width: W-8, align: 'center', ellipsis: true });

  // 2. اسم العميل
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#222222')
     .text(customer || 'عميل المصنع', 4, 32, { width: W-8, align: 'center', ellipsis: true });

  // 3. الشفرة (Barcode)
  const modW = Math.min(0.68, (W-8) / totalModules);
  const bW = totalModules * modW;
  let curX = (W - bW) / 2;
  const startY = 48, barH = cfg.barHeight || 78;

  doc.fillColor('#000000');
  for (const r of runs) {
    const w = r.width * modW;
    if (r.bar) doc.rect(curX, startY, w, barH).fill();
    curX += w;
  }

  // 4. السيريال تحت الشفرة
  doc.font('Courier-Bold').fontSize(cfg.codeFontSize || 8.5).fillColor('#000000')
     .text(code, 2, startY + barH + 5, { width: W-4, align: 'center' });
}

function drawRotated(doc, cfg, code, enc, orderNum) {
  const { runs, totalModules } = enc;
  const W = cfg.widthPt, H = cfg.heightPt;
  doc.addPage({ size: [W, H], margin: 0 });
  doc.save();
  doc.rotate(90, { origin: [W/2, H/2] });
  const rW = H, rH = W;
  const modW = Math.min(0.95, (rW-20) / totalModules);
  const rX = (rW - totalModules * modW) / 2;
  const rY = (rH - cfg.barHeight) / 2;
  let curX = rX;
  doc.fillColor('#000000');
  for (const r of runs) {
    const w = r.width * modW;
    if (r.bar) doc.rect(curX, rY, w, cfg.barHeight).fill();
    curX += w;
  }
  doc.font('Courier-Bold').fontSize(8.5).fillColor('#000000')
     .text(orderNum + '  |  ' + code, 10, rY + cfg.barHeight + 4, { width: rW-20, align: 'center' });
  doc.restore();
}

function drawLandscape(doc, cfg, code, enc, orderNum, customer) {
  const { runs, totalModules } = enc;
  const W = cfg.widthPt, H = cfg.heightPt;
  doc.addPage({ size: [W, H], margin: 0 });
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000000')
     .text(customer ? (orderNum + ' | ' + customer) : orderNum, 8, 5, { width: W-16, align: 'center' });
  const modW = Math.min(1.25, (W-16) / totalModules);
  const bW = totalModules * modW;
  let curX = (W - bW) / 2;
  const startY = 18;
  doc.fillColor('#000000');
  for (const r of runs) {
    const w = r.width * modW;
    if (r.bar) doc.rect(curX, startY, w, cfg.barHeight).fill();
    curX += w;
  }
  doc.font('Courier-Bold').fontSize(cfg.codeFontSize).fillColor('#000000')
     .text(code, 8, startY + cfg.barHeight + 3, { width: W-16, align: 'center' });
}

function drawA4(doc, cfg, code, enc, idx, orderNum, customer) {
  const { runs, totalModules } = enc;
  const COLS = cfg.cols, ROWS = cfg.rows;
  const PER_PAGE = COLS * ROWS;
  const LW = (cfg.pageW - cfg.marginX*2) / COLS;
  const LH = (cfg.pageH - cfg.marginY*2) / ROWS;
  const pi = idx % PER_PAGE;
  if (pi === 0) doc.addPage({ size: 'A4', margin: 0 });
  const col = pi % COLS, row = Math.floor(pi / COLS);
  const lx = cfg.marginX + col * LW, ly = cfg.marginY + row * LH;

  doc.lineWidth(0.5).dash(2,{space:2}).strokeColor('#94a3b8')
     .rect(lx+2, ly+2, LW-4, LH-4).stroke();
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a')
     .text(customer ? (orderNum + ' | ' + customer) : orderNum, lx+4, ly+6, { width: LW-8, align: 'center' });

  const modW = Math.min(1.15, (LW-20) / totalModules);
  const bW = totalModules * modW;
  const startX = lx + (LW - bW) / 2;
  const startY = ly + 22;
  let curX = startX;
  doc.undash().fillColor('#000000');
  for (const r of runs) {
    const w = r.width * modW;
    if (r.bar) doc.rect(curX, startY, w, 52).fill();
    curX += w;
  }
  doc.font('Courier-Bold').fontSize(8.5).fillColor('#0f172a')
     .text(code, lx+4, startY+56, { width: LW-8, align: 'center' });
}

// ===== Main =====
async function runWorker() {
  const startTime = Date.now();
  const { orderId, outputPath, dbConfig, format } = workerData;
  const selectedFormat = (format && FORMAT_CONFIGS[format]) ? format : 'roll_35x80';
  const cfg = FORMAT_CONFIGS[selectedFormat];

  const sendMsg = (msg) => { if (parentPort) parentPort.postMessage(msg); };
  const heartbeat = setInterval(() => sendMsg({ type: 'heartbeat', uptime: Date.now() - startTime }), HEARTBEAT_MS);

  let pool = null;
  const tempPath = outputPath + '.tmp';

  try {
    pool = new sql.ConnectionPool({
      ...dbConfig,
      pool: { max: 3, min: 1, idleTimeoutMillis: 30000 },
      requestTimeout: 120000,
      connectionTimeout: 30000
    });
    await pool.connect();

    // بيانات الأوردر
    const orderRes = await pool.request()
      .input('order_id', sql.Int, orderId)
      .query('SELECT order_number, customer_name FROM Orders WHERE id = @order_id');
    if (orderRes.recordset.length === 0) throw new Error('الأوردر غير موجود: ' + orderId);

    const orderNumber = orderRes.recordset[0].order_number || ('ORD-' + orderId);
    const customerName = orderRes.recordset[0].customer_name || '';
    const safeOrderNum = sanitizeText(orderNumber) || orderNumber;
    const safeCustomer = sanitizeText(customerName);

    // العدد الكلي
    const countRes = await pool.request()
      .input('order_id', sql.Int, orderId)
      .query('SELECT COUNT(*) as total FROM OrderBarcodes WHERE order_id = @order_id');
    const total = countRes.recordset[0].total;
    if (total === 0) throw new Error('لا توجد شفرات لهذا الأوردر');

    sendMsg({ type: 'progress', percent: 1, current: 0, total, message: 'جاري التجهيز...' });

    // إعداد PDF
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ws = fs.createWriteStream(tempPath, { highWaterMark: 1024 * 1024 });

    const isRoll = cfg.type === 'roll';
    const docOpts = isRoll
      ? { size: [cfg.widthPt, cfg.heightPt], margin: 0, autoFirstPage: false, bufferPages: false,
          info: { Title: 'Stickers - ' + orderNumber, Author: 'HMS Barcode System' } }
      : { size: 'A4', margin: 0, autoFirstPage: false, bufferPages: false };

    const doc = new PDFDocument(docOpts);
    doc.pipe(ws);

    // معالجة على دفعات
    let processed = 0, lastPct = 1;
    const totalChunks = Math.ceil(total / DB_CHUNK_SIZE);

    for (let chunk = 0; chunk < totalChunks; chunk++) {
      const offset = chunk * DB_CHUNK_SIZE;
      const dbRes = await pool.request()
        .input('order_id', sql.Int, orderId)
        .input('offset', sql.Int, offset)
        .input('size', sql.Int, DB_CHUNK_SIZE)
        .query('SELECT barcode FROM OrderBarcodes WHERE order_id = @order_id ORDER BY id OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY');

      const barcodes = dbRes.recordset.map(r => r.barcode);

      for (let ci = 0; ci < barcodes.length; ci++) {
        const globalIdx = offset + ci;
        const code = barcodes[ci];
        const enc = encodeCode128B(code);

        if (isRoll) {
          if (cfg.orientation === 'portrait')       drawPortrait(doc, cfg, code, enc, globalIdx, safeOrderNum, safeCustomer);
          else if (cfg.orientation === 'rotated')   drawRotated(doc, cfg, code, enc, safeOrderNum);
          else                                       drawLandscape(doc, cfg, code, enc, safeOrderNum, safeCustomer);
        } else {
          drawA4(doc, cfg, code, enc, globalIdx, safeOrderNum, safeCustomer);
        }

        processed++;

        if (processed % RENDER_CHUNK === 0) await yieldToEventLoop();

        if (processed % 500 === 0 || processed === total) {
          const pct = Math.min(99, Math.round((processed / total) * 98) + 1);
          if (pct > lastPct) {
            lastPct = pct;
            sendMsg({
              type: 'progress', percent: pct, current: processed, total,
              message: processed.toLocaleString() + ' / ' + total.toLocaleString() + ' (' + pct + '%)'
            });
          }
        }
      }
      await yieldToEventLoop();
    }

    doc.end();
    await new Promise((res, rej) => { ws.on('finish', res); ws.on('error', rej); });

    if (fs.existsSync(outputPath)) { try { fs.unlinkSync(outputPath); } catch(e){} }
    fs.renameSync(tempPath, outputPath);

    clearInterval(heartbeat);
    const stats = fs.statSync(outputPath);
    sendMsg({ type: 'done', filePath: outputPath, fileSize: stats.size, total, format: selectedFormat, elapsed: Date.now() - startTime });

  } catch (err) {
    clearInterval(heartbeat);
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch(e) {}
    sendMsg({ type: 'error', error: err.message || String(err) });
  } finally {
    if (pool) { try { await pool.close(); } catch(e){} }
  }
}

runWorker();
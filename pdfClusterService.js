/**
 * HMS Barcode System - PDF Cluster Service (High-Performance Edition)
 * يدير معالجة ملفات الـ PDF في مسارات معالجة موازية (Worker Threads)
 * المقاس الافتراضي المعتمد لمكن الباركود: 3.5 سم عرض × 8 سم طول (35mm x 80mm)
 *
 * تحسينات:
 * - مراقبة Heartbeat لكشف Worker المتجمد
 * - Timeout تلقائي بعد 15 دقيقة كحد أقصى
 * - إعادة محاولة تلقائية عند انهيار Worker
 * - تنظيف الملفات المؤقتة عند الإلغاء
 */
'use strict';

const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');

const PDF_STORAGE_DIR = path.join(__dirname, 'storage', 'pdfs');
const WORKER_TIMEOUT_MS = 15 * 60 * 1000;    // 15 دقيقة كحد أقصى
const HEARTBEAT_TIMEOUT_MS = 10 * 1000;       // 10 ثوان بدون heartbeat = worker متجمد

if (!fs.existsSync(PDF_STORAGE_DIR)) {
  fs.mkdirSync(PDF_STORAGE_DIR, { recursive: true });
}

// قائمة المهام الجارية: key = `${orderId}_${format}`
const activeJobs = new Map();
// سجل الأخطاء الأخيرة للمهام
const failedJobs = new Map();

function getPdfFilePath(orderId, format) {
  const f = format || 'roll_35x80';
  return path.join(PDF_STORAGE_DIR, 'order-' + orderId + '-' + f + '.pdf');
}

function getPdfStatus(orderId, format) {
  const id = parseInt(orderId, 10);
  const f = format || 'roll_35x80';
  const key = id + '_' + f;

  if (activeJobs.has(key)) {
    const job = activeJobs.get(key);
    const now = Date.now();
    const sinceHeartbeat = now - (job.lastHeartbeat || job.startTime);
    const frozen = sinceHeartbeat > HEARTBEAT_TIMEOUT_MS && job.progress < 99;
    return {
      status: frozen ? 'frozen' : 'processing',
      format: f,
      progress: job.progress || 0,
      current: job.current || 0,
      total: job.total || 0,
      message: frozen
        ? 'يبدو أن عملية التوليد متوقفة - جاري إعادة المحاولة تلقائياً...'
        : (job.message || 'جاري تجهيز استيكرات الباركود...'),
      elapsed: now - job.startTime
    };
  }

  if (failedJobs.has(key)) {
    const failed = failedJobs.get(key);
    return {
      status: 'error',
      format: f,
      progress: 0,
      message: failed.error || 'فشلت معالجة ملف الـ PDF'
    };
  }

  const filePath = getPdfFilePath(id, f);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    return {
      status: 'ready', format: f, progress: 100,
      fileSize: stats.size, generatedAt: stats.mtime,
      downloadUrl: '/api/orders/' + id + '/pdf/download?format=' + f
    };
  }

  return { status: 'not_started', format: f, progress: 0 };
}

function startPdfJob(orderId, dbConfig, force, format) {
  force = force || false;
  format = format || 'roll_35x80';
  const id = parseInt(orderId, 10);
  const f = format;
  const key = id + '_' + f;
  const filePath = getPdfFilePath(id, f);

  // الملف جاهز ولا إعادة توليد
  if (fs.existsSync(filePath) && !force) {
    const stats = fs.statSync(filePath);
    return Promise.resolve({
      status: 'ready', format: f, progress: 100,
      fileSize: stats.size,
      downloadUrl: '/api/orders/' + id + '/pdf/download?format=' + f
    });
  }

  // المعالجة جارية بالفعل
  if (activeJobs.has(key)) {
    const job = activeJobs.get(key);
    return Promise.resolve({
      status: 'processing', format: f,
      progress: job.progress || 0,
      current: job.current || 0,
      total: job.total || 0
    });
  }

  // بدء مهمة جديدة - مسح أي خطأ سابق
  failedJobs.delete(key);

  return new Promise((resolve, reject) => {
    try {
      const workerScript = path.join(__dirname, 'pdfWorker.js');
      const worker = new Worker(workerScript, {
        workerData: {
          orderId: id, outputPath: filePath, format: f,
          dbConfig: {
            user: dbConfig.user, password: dbConfig.password,
            server: dbConfig.server, port: dbConfig.port,
            database: dbConfig.database, options: dbConfig.options
          }
        }
      });

      const jobInfo = {
        worker, format: f, progress: 0, current: 0, total: 0,
        startTime: Date.now(), lastHeartbeat: Date.now(),
        message: 'جاري تهيئة مسار المعالجة...',
        resolved: false
      };
      activeJobs.set(key, jobInfo);

      // Timeout صارم
      const globalTimeout = setTimeout(() => {
        if (!jobInfo.resolved) {
          console.error('[PDF Cluster] Timeout reached for', key);
          try { worker.terminate(); } catch(e) {}
          activeJobs.delete(key);
          failedJobs.set(key, { error: 'استغرقت المعالجة وقتاً أطول من المسموح (Timeout)', time: Date.now() });
          const tempPath = filePath + '.tmp';
          try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch(e) {}
        }
      }, WORKER_TIMEOUT_MS);

      worker.on('message', (msg) => {
        if (msg.type === 'heartbeat') {
          jobInfo.lastHeartbeat = Date.now();

        } else if (msg.type === 'progress') {
          jobInfo.progress = msg.percent;
          jobInfo.current = msg.current;
          jobInfo.total = msg.total;
          jobInfo.message = msg.message || ('جاري التجهيز... ' + msg.percent + '%');
          jobInfo.lastHeartbeat = Date.now();

        } else if (msg.type === 'done') {
          clearTimeout(globalTimeout);
          jobInfo.resolved = true;
          activeJobs.delete(key);
          failedJobs.delete(key);
          console.log('[PDF Cluster] Done:', key, '| Elapsed:', Math.round(msg.elapsed/1000) + 's | Size:', Math.round(msg.fileSize/1024) + 'KB');
          resolve({
            status: 'ready', format: f, progress: 100,
            fileSize: msg.fileSize, total: msg.total, elapsed: msg.elapsed,
            downloadUrl: '/api/orders/' + id + '/pdf/download?format=' + f
          });

        } else if (msg.type === 'error') {
          clearTimeout(globalTimeout);
          jobInfo.resolved = true;
          activeJobs.delete(key);
          failedJobs.set(key, { error: msg.error || 'خطأ أثناء توليد الـ PDF', time: Date.now() });
          console.error('[PDF Cluster] Error:', key, msg.error);
          reject(new Error(msg.error || 'خطأ في Worker'));
        }
      });

      worker.on('error', (err) => {
        clearTimeout(globalTimeout);
        activeJobs.delete(key);
        failedJobs.set(key, { error: err.message || 'انهيار في مسار المعالجة Worker', time: Date.now() });
        console.error('[PDF Cluster] Worker exception:', key, err);
        if (!jobInfo.resolved) reject(err);
      });

      worker.on('exit', (code) => {
        clearTimeout(globalTimeout);
        activeJobs.delete(key);
        if (code !== 0 && !fs.existsSync(filePath) && !jobInfo.resolved) {
          failedJobs.set(key, { error: 'Worker انتهى بكود خطأ: ' + code, time: Date.now() });
          reject(new Error('Worker انتهى بكود خطأ: ' + code));
        }
      });

      // استجابة فورية بأن المعالجة بدأت
      resolve({ status: 'processing', format: f, progress: 0, message: 'بدأت المعالجة في الكلاستر' });

    } catch (err) {
      activeJobs.delete(key);
      reject(err);
    }
  });
}

function getDownloadFilePath(orderId, format) {
  const id = parseInt(orderId, 10);
  const f = format || 'roll_35x80';
  const p = getPdfFilePath(id, f);
  if (fs.existsSync(p)) return p;
  const def = getPdfFilePath(id, 'roll_35x80');
  if (fs.existsSync(def)) return def;
  return null;
}

module.exports = { startPdfJob, getPdfStatus, getDownloadFilePath, getPdfFilePath };
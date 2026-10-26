/**
 * HMS Barcode System - Centralized API Service
 * Handles HTTP requests, authentication headers, and standard error handling.
 */

const API_BASE = '/api';

/**
 * Returns standard authentication headers including user ID
 */
export function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    try {
        const token = localStorage.getItem('hms_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const savedUser = localStorage.getItem('hms_user') || localStorage.getItem('freedom_user');
        if (savedUser) {
            const user = JSON.parse(savedUser);
            if (user && user.id) {
                headers['x-user-id'] = String(user.id);
            }
        }
    } catch (e) {
        console.error('Error parsing auth headers user:', e);
    }
    return headers;
}

/**
 * Common fetch wrapper with JSON parsing and error handling
 */
async function request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const defaultHeaders = getAuthHeaders();

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
    };

    try {
        const response = await fetch(url, config);
        const data = await response.json();
        return { ok: response.ok, status: response.status, data };
    } catch (err) {
        console.error(`API Request Error [${endpoint}]:`, err);
        return {
            ok: false,
            status: 500,
            data: { success: false, message: 'تعذر الاتصال بالخادم. تأكد من تشغيل السيرفر وقاعدة البيانات.' },
        };
    }
}

export const api = {
    // Auth & Health
    login: (credentials) => request('/login', { method: 'POST', body: JSON.stringify(credentials) }),
    checkHealth: () => request('/health', { method: 'GET' }),

    // Orders
    getOrders: () => request('/orders', { method: 'GET' }),
    checkOrder: (orderNumber) => request(`/orders/check/${encodeURIComponent(orderNumber)}`, { method: 'GET' }),
    getOrderDetails: (id) => request(`/orders/details/${id}`, { method: 'GET' }),
    getUnscannedBarcodes: (id, stage = 'ALL') =>
        request(`/orders/${id}/unscanned?stage=${encodeURIComponent(stage)}`, { method: 'GET' }),
    deleteOrder: (id) => request(`/orders/${id}`, { method: 'DELETE' }),
    addOrderStage: (orderId, stageName) => request(`/orders/${orderId}/stages/add`, { method: 'POST', body: JSON.stringify({ stage_name: stageName }) }),
    deleteOrderStage: (orderId, stageName) => request(`/orders/${orderId}/stages/${encodeURIComponent(stageName)}`, { method: 'DELETE' }),
    setOrderPrimaryStage: (orderId, stageName) => request(`/orders/${orderId}/stages/set-primary`, { method: 'PUT', body: JSON.stringify({ stage_name: stageName }) }),

    // Scanning
    scanStage: (payload) => request('/orders/stage-scan', { method: 'POST', body: JSON.stringify(payload) }),

    // Barcode Generation & Printing
    generateBarcodes: (payload) => request('/admin/generate-barcodes', { method: 'POST', body: JSON.stringify(payload) }),
    getOrderBarcodes: (orderId) => request(`/admin/order-barcodes/${orderId}`, { method: 'GET' }),
    requestClusterPdf: (orderId, format = 'roll_35x80', force = false) => request(`/orders/${orderId}/pdf/generate?format=${encodeURIComponent(format)}${force ? '&force=true' : ''}`, {
        method: 'POST',
        body: JSON.stringify({ format })
    }),
    getClusterPdfStatus: (orderId, format = 'roll_35x80') => request(`/orders/${orderId}/pdf/status?format=${encodeURIComponent(format)}`, { method: 'GET' }),

    // Reports & Stats
    getStats: () => request('/stats', { method: 'GET' }),
    getComprehensiveReport: () => request('/reports/comprehensive', { method: 'GET' }),

    // Users & Permissions (Admin)
    getUsers: () => request('/users', { method: 'GET' }),
    createUser: (userData) => request('/users', { method: 'POST', body: JSON.stringify(userData) }),
    updateUser: (id, userData) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(userData) }),
    deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
    unlockUser: (id) => request(`/users/${id}/unlock`, { method: 'POST' }),

    // Super Admin Licensing
    getLicenseStatus: () => request('/license/status', { method: 'GET' }),
    generateLicense: (payload) => request('/license/generate', { method: 'POST', body: JSON.stringify(payload) }),
    activateLicense: (payload) => request('/license/activate', { method: 'POST', body: JSON.stringify(payload) }),

    // System Branding & Info
    getSystemInfo: () => request('/system/info', { method: 'GET' }),
    getStages: () => request('/system/stages', { method: 'GET' }),
};

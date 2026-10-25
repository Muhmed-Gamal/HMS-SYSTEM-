const api = {
    getAuthHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('hms_token');
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const savedUser = localStorage.getItem('hms_user') || localStorage.getItem('freedom_user');
        if (savedUser) {
            try {
                const user = JSON.parse(savedUser);
                if (user && user.id) headers['x-user-id'] = String(user.id);
            } catch (e) {}
        }
        return headers;
    },

    async checkHealth() {
        try {
            const response = await fetch('/api/health');
            if (!response.ok) return false;
            const data = await response.json();
            return data.connected === true;
        } catch (error) {
            return false;
        }
    },

    async getOrders() {
        try {
            const response = await fetch('/api/orders', { headers: this.getAuthHeaders() });
            if (!response.ok) throw new Error('فشل جلب الأوردرات');
            return await response.json();
        } catch (error) {
            console.error('API Get Orders Error:', error);
            return { success: false, orders: [] };
        }
    },

    async getOrderDetails(id) {
        try {
            const response = await fetch(`/api/orders/details/${id}`, { headers: this.getAuthHeaders() });
            return await response.json();
        } catch (error) {
            console.error('API Get Order Details Error:', error);
            return { success: false, message: 'فشل جلب تفاصيل الأوردر' };
        }
    },

    async checkOrder(orderNumber) {
        try {
            const response = await fetch(`/api/orders/check/${encodeURIComponent(orderNumber)}`, { headers: this.getAuthHeaders() });
            return await response.json();
        } catch (error) {
            console.error('API Check Order Error:', error);
            return { exists: false };
        }
    },

    async scanStage(payload) {
        try {
            const response = await fetch('/api/orders/stage-scan', {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(payload)
            });
            return await response.json();
        } catch (error) {
            console.error('API Scan Stage Error:', error);
            return { success: false, message: 'فشل الاتصال بالخادم عند المسح' };
        }
    },

    async generateBarcodesHighVolume(payload) {
        try {
            const response = await fetch('/api/admin/generate-barcodes', {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(payload)
            });
            return await response.json();
        } catch (error) {
            console.error('API High Volume Generation Error:', error);
            return { success: false, message: 'تعذر الاتصال بالسيرفر لتوليد الكمية الضخمة' };
        }
    },

    async deleteOrder(id) {
        try {
            const response = await fetch(`/api/orders/${id}`, {
                method: 'DELETE',
                headers: this.getAuthHeaders()
            });
            return await response.json();
        } catch (error) {
            console.error('API Delete Order Error:', error);
            return { success: false, message: 'تعذر حذف الأوردر' };
        }
    }
};
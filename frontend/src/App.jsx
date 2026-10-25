import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';

import LoginPage from './pages/LoginPage';
import ScannerPage from './pages/ScannerPage';
import OrdersTrackingPage from './pages/OrdersTrackingPage';
import CreateOrderPage from './pages/CreateOrderPage';
import AdminUsersPage from './pages/AdminUsersPage';

export default function App() {
    return (
        <AuthProvider>
            <ToastProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/" element={<ScannerPage />} />
                        <Route path="/orders" element={<OrdersTrackingPage />} />
                        <Route path="/create-order" element={<CreateOrderPage />} />
                        <Route path="/orders/new" element={<CreateOrderPage />} />
                        <Route path="/admin" element={<AdminUsersPage />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </BrowserRouter>
            </ToastProvider>
        </AuthProvider>
    );
}

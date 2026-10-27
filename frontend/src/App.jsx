import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { LanguageProvider } from './context/LanguageContext';

import LoginPage from './pages/LoginPage';
import ScannerPage from './pages/ScannerPage';
import OrdersTrackingPage from './pages/OrdersTrackingPage';
import CreateOrderPage from './pages/CreateOrderPage';
import AdminUsersPage from './pages/AdminUsersPage';
import DashboardPage from './pages/DashboardPage';

export default function App() {
    return (
        <AuthProvider>
            <ToastProvider>
                <LanguageProvider>
                    <BrowserRouter>
                        <Routes>
                            <Route path="/login" element={<LoginPage />} />
                            <Route path="/dashboard" element={<DashboardPage />} />
                            <Route path="/" element={<ScannerPage />} />
                            <Route path="/orders" element={<OrdersTrackingPage />} />
                            <Route path="/create-order" element={<CreateOrderPage />} />
                            <Route path="/orders/new" element={<CreateOrderPage />} />
                            <Route path="/admin" element={<AdminUsersPage />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </BrowserRouter>
                </LanguageProvider>
            </ToastProvider>
        </AuthProvider>
    );
}

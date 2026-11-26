// src/App.tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ADMIN_ROLES, MANAGE_ROLES } from '@/components/layout/navItems';
import { AuthProvider } from '@/context/AuthContext';
import { ConfirmProvider } from '@/context/ConfirmProvider';
import { LocationProvider } from '@/context/LocationContext';
import AdminPage from '@/features/admin/AdminPage';
import LoginPage from '@/features/auth/LoginPage';
import PasswordResetPage from '@/features/auth/PasswordResetPage';
import ConstraintsPage from '@/features/constraints/ConstraintsPage';
import DemoStartPage from '@/features/demo/DemoStartPage';
import EmployeesPage from '@/features/employees/EmployeesPage';
import PrivacyPolicyPage from '@/features/legal/PrivacyPolicyPage';
import SupportPage from '@/features/legal/SupportPage';
import LocationSettingsPage from '@/features/location-settings/LocationSettingsPage';
import SchedulePage from '@/features/schedule/SchedulePage';

/** The app's providers and its one route table. */
export default function App() {
    return (
        <AuthProvider>
            <LocationProvider>
                {/* Toasts are shown through src/lib/notify.ts */}
                <Toaster richColors closeButton dir="rtl" position="top-center" />
                {/* Provides useConfirm() and renders the single confirm dialog */}
                <ConfirmProvider>
                    <BrowserRouter>
                        <Routes>
                            {/* Public pages, without the header */}
                            <Route path="/login" element={<LoginPage />} />
                            <Route path="/reset-password" element={<PasswordResetPage />} />
                            <Route path="/privacy" element={<PrivacyPolicyPage />} />
                            <Route path="/support" element={<SupportPage />} />
                            {/* Public demo entry (the shareable link); answers "not available" on other instances */}
                            <Route path="/demo" element={<DemoStartPage />} />

                            {/* Signed-in pages, inside the header layout */}
                            <Route element={<ProtectedRoute />}>
                                <Route element={<AppLayout />}>
                                    <Route path="/" element={<SchedulePage />} />
                                    <Route path="/constraints" element={<ConstraintsPage />} />

                                    <Route element={<ProtectedRoute allowedRoles={MANAGE_ROLES} />}>
                                        <Route path="/employees" element={<EmployeesPage />} />
                                        <Route path="/location-settings" element={<LocationSettingsPage />} />
                                    </Route>

                                    <Route element={<ProtectedRoute allowedRoles={ADMIN_ROLES} />}>
                                        <Route path="/admin" element={<AdminPage />} />
                                    </Route>

                                    {/* An unknown path opens the schedule */}
                                    <Route path="*" element={<Navigate to="/" replace />} />
                                </Route>
                            </Route>
                        </Routes>
                    </BrowserRouter>
                </ConfirmProvider>
            </LocationProvider>
        </AuthProvider>
    );
}

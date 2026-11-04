import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import queryClient from '@/lib/queryClient';
import { AuthProvider } from "@/context/AuthContext";
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import SupplierPage from '@/pages/SupplierPage';
import ProtectedRoute from '@/routes/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import HomePage from '@/pages/HomePage';
import { ROLES } from '@/features/auth/types/auth.types';
import { ROUTES } from './routes';
import ManageSuppliersPage from '@/pages/ManageSuppliersPage';
import ManageUsersPage from '@/pages/ManageUsersPage';
import RoleRoute from '@/routes/RoleRoute';
import ManageSupplierTypesPage from '@/pages/ManageSupplierTypesPage';
import ProfilePage from '@/pages/ProfilePage';
import AdminActivationPage from '@/pages/AdminActivationPage';
import CreditsPage from '@/pages/CreditsPage';
import RequesterActivtyPage from '@/pages/RequesterActivityPage';
import CourierActivityPage from '@/pages/CourierActivityPage';
import ManageOrdersPage from '@/pages/ManageOrdersPage';

const AppRouter = () => {
    return (
        <BrowserRouter>
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <Routes>
                        <Route path={ROUTES.LOGIN} element={<LoginPage />} />
                        <Route path={ROUTES.REGISTER} element={<RegisterPage />} />
                        <Route path={ROUTES.ACTIVATE_ADMIN} element={<AdminActivationPage />} />

                        {/* Protected routes - redirect to login page if not authenticated */}
                        <Route element={<ProtectedRoute />}>
                            <Route element={<AppLayout />}>
                                <Route element={<RoleRoute allowedRoles={[ROLES.STUDENT, ROLES.ADMIN]} />}>
                                    <Route path={ROUTES.HOME} element={<HomePage />} />
                                    <Route path={ROUTES.SUPPLIERS} element={<SupplierPage />} />
                                    <Route path={ROUTES.PROFILE} element={<ProfilePage />} />
                                </Route>

                                <Route element={<RoleRoute allowedRoles={[ROLES.STUDENT]} />}>
                                    <Route path={ROUTES.CREDITS} element={<CreditsPage />} />
                                </Route>

                                <Route element={<RoleRoute allowedRoles={[ROLES.ADMIN]} />}>
                                    <Route path={ROUTES.ADMIN.MANAGE_USERS} element={<ManageUsersPage />} />
                                    <Route path={ROUTES.ADMIN.MANAGE_SUPPLIERS} element={<ManageSuppliersPage />} />
                                    <Route path={ROUTES.ADMIN.MANAGE_SUPPLIER_TYPES} element={<ManageSupplierTypesPage />} />
                                    <Route path={ROUTES.ADMIN.MANAGE_ORDERS} element={<ManageOrdersPage />} />
                                </Route>

                                <Route element={<RoleRoute allowedRoles={[ROLES.STUDENT]} />}>
                                    <Route path={ROUTES.REQUESTER_ACTIVITY} element={<RequesterActivtyPage />} />
                                    <Route path={ROUTES.COURIER_ACTIVITY} element={<CourierActivityPage />} />
                                </Route>
                            </Route>
                        </Route>
                    </Routes>
                </AuthProvider>
            </QueryClientProvider>
        </BrowserRouter>
    );
}

export default AppRouter;

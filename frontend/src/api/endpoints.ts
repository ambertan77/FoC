// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Supplier create, update, deactivate and activate endpoint definitions only.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

const BASE_AUTH = "/auth";
const BASE_USER = "/users";
const BASE_SUPPLIER = "/suppliers";
const BASE_ORDER = "/orders";
const BASE_CREDIT = "/credits";
const BASE_NOTIFICATION = "/notifications";

export const ENDPOINTS = {

    credit: {
        balance: `${BASE_CREDIT}/me/balance`,
        transactions: `${BASE_CREDIT}/me/transactions`,
    },

    auth: {
        login: `${BASE_AUTH}/login`,
        logout: `${BASE_AUTH}/logout`,
        refreshToken: `${BASE_AUTH}/refresh`,
        register: `${BASE_AUTH}/register`,
        adminActivation: `${BASE_AUTH}/admin-activation`,
        resendRegistrationOtp: `${BASE_AUTH}/register/resend`,
        verifyRegistration: `${BASE_AUTH}/register/verify`,
    },

    user: {
        users: BASE_USER,
        adminInvitations: `${BASE_USER}/admin-invitations`,
        userRole: (userId: string) => `${BASE_USER}/${userId}/role`,
        profile: `${BASE_USER}/me`,
        emailChange: `${BASE_USER}/me/email-change`,
        resendEmailChangeOtp: `${BASE_USER}/me/email-change/resend`,
        verifyEmailChange: `${BASE_USER}/me/email-change/verify`,
        passwordChange: `${BASE_USER}/me/password-change`,
        getUserById: (userId: string) => `${BASE_USER}/${userId}`,
    },

    supplier: {
        getAllSuppliers: `${BASE_SUPPLIER}/`,
        getActiveSuppliers: `${BASE_SUPPLIER}/active`,
        getSuppliersByIds: (ids: string[]) => {
            const query = new URLSearchParams();
            ids.forEach((id) => query.append("ids", id));
            return `${BASE_SUPPLIER}/by-ids?${query.toString()}`;
        },
        createSupplier: `${BASE_SUPPLIER}/`,
        updateSupplier: `${BASE_SUPPLIER}/:supplierId`,
        deactivateSupplier: `${BASE_SUPPLIER}/:supplierId/deactivation`,
        activateSupplier: `${BASE_SUPPLIER}/:supplierId/activation`,
        getAllSupplierTypes: `${BASE_SUPPLIER}/types`,
        countsForEachSupplierType: `${BASE_SUPPLIER}/types/count`,
        createSupplierType: `${BASE_SUPPLIER}/types`,
        deleteSupplierType: `${BASE_SUPPLIER}/types/:typeId`,
        uploadSupplierImage: `${BASE_SUPPLIER}/assets/images`,
    },

    order: {
        getOpenOrders: `${BASE_ORDER}`,
        getAllOrders: `${BASE_ORDER}/all`,
        acceptOrder: `${BASE_ORDER}/:orderId/acceptance`,
        pickUpOrder: `${BASE_ORDER}/:orderId/pickup`,
        completeOrder: `${BASE_ORDER}/:orderId/completion`,
        dropOrder: `${BASE_ORDER}/:orderId/acceptance`,
        getRequesterOrderHistory: `${BASE_ORDER}/me/requester`,
        getCourierOrderHistory: `${BASE_ORDER}/me/courier`,
        updateRequest: (orderId: string) => `${BASE_ORDER}/${orderId}`,
        createRequest: `${BASE_ORDER}`,
        receiveRequest: (orderId: string) => `${BASE_ORDER}/${orderId}/receipt`,
        failedRequest: (orderId: string) => `${BASE_ORDER}/${orderId}/failure`,
        cancelRequest: (orderId: string) => `${BASE_ORDER}/${orderId}/cancellation`,
        renewRequest: (orderId: string) => `${BASE_ORDER}/${orderId}/renewal`,
    },

    notification: {
        stream: `${BASE_NOTIFICATION}/stream`,
        list: `${BASE_NOTIFICATION}`,
        getUnreadCount: `${BASE_NOTIFICATION}/unread-count`,
        markAsRead: (notificationId: string) => `${BASE_NOTIFICATION}/${notificationId}/read`,
        markAllAsRead: `${BASE_NOTIFICATION}/read-all`,
    },
} as const;

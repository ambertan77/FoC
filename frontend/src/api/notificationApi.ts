import createApiClient from "./axios";

const notificationApi = createApiClient(
    import.meta.env.VITE_NOTIFICATION_API_BASE_URL,
);

export default notificationApi;
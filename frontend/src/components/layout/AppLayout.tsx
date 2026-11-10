import { Outlet } from "react-router-dom";
import Navbar from "@/components/navbar/Navbar";
import { NotificationProvider } from "@/context/NotificationProvider";

const AppLayout = () => {
    return (
        <>
            <NotificationProvider>
                <Navbar />
                <Outlet />
            </NotificationProvider>
        </>
    );
};

export default AppLayout;
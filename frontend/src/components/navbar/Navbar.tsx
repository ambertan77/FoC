import useAuth from "@/hooks/useAuth";
import useCreditBalance from "@/features/credit/hooks/useCreditBalance";

import { Separator } from "@/components/ui/separator";
import Logo from "@/assets/logo.png";

import DesktopNav from "./DesktopNav";
import MobileMenu from "./MobileMenu";
import UserMenu from "./UserMenu";
import CreditBalance from "./CreditBalance";
import { ROLES } from "@/features/auth/types/auth.types";
import { adminNavLinks, studentNavLinks } from "./navLinks";
import { NotificationBell } from "@/features/notification/components/NotificationBell";

const Navbar = () => {
    const { user, isAuthenticated } = useAuth();
    const credit = useCreditBalance();
    const creditBalanceProps = {
        state: credit.state,
        isBusy: credit.fetchStatus !== "idle",
        onRetry: credit.retry,
    };
    const isAdmin = user?.role === ROLES.ADMIN;
    const navLinks = isAdmin ? adminNavLinks : studentNavLinks;

    return (
        <header className="sticky top-0 z-50 w-full bg-white shadow-2xs border-b border-slate-200">
            <div className="mx-auto px-4 px-4 md:px-6 py-2">
                <div className="flex items-center h-12 gap-8">
                    <div className="flex flex-row items-center justify-center gap-2 h-full">
                        <img
                            src={Logo}
                            alt="Logo"
                            className="h-full w-fit object-contain"
                        />
                        <p className="hidden md:block font-bold text-xl text-indigo-900">Aaron</p>
                    </div>

                    {isAuthenticated && (
                        <>
                            <DesktopNav links={navLinks} />
                            <div className="ml-auto hidden md:flex items-center space-x-2">
                                {credit.state.status !== "hidden" && (
                                    <>
                                        <CreditBalance {...creditBalanceProps} />
                                        <Separator
                                            orientation="vertical"
                                            className="bg-slate-300"
                                        />
                                    </>
                                )}
                                {!isAdmin && <NotificationBell />}
                                <UserMenu />
                            </div>
                            <div className="ml-auto flex items-center gap-1 md:hidden">
                                {!isAdmin && <NotificationBell />}
                                <MobileMenu links={navLinks} creditBalance={creditBalanceProps} />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    )
}

export default Navbar;

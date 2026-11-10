import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import {
    LogOutIcon,
    MenuIcon,
    UserIcon,
} from "lucide-react";

import useAuth from "@/hooks/useAuth";
import useLogout from "@/hooks/useLogout";

import { Button } from "@/components/ui/button";
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerHeader,
    DrawerTrigger,
} from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import {
    NavigationMenu,
    NavigationMenuList,
    NavigationMenuLink,
} from "@/components/ui/navigation-menu";

import CreditBalance, { type CreditBalanceProps } from "./CreditBalance";
import type { NavLinkItem } from "./navLinks";

interface MobileMenuProps {
    links: NavLinkItem[];
    creditBalance: CreditBalanceProps;
}

const MobileMenu = ({
    links,
    creditBalance,
}: MobileMenuProps) => {
    const location = useLocation();
    const { user } = useAuth();
    const { logout } = useLogout();

    const [open, setOpen] = useState(false);

    if (!user) {
        return null;
    }

    return (
        <Drawer open={open} onOpenChange={setOpen} swipeDirection="right">
            <DrawerTrigger render={<Button variant="ghost" size="icon-lg" />}>
                <MenuIcon className="size-5" />
            </DrawerTrigger>

            <DrawerContent>
                <DrawerHeader>
                    <div className="flex items-center justify-between gap-4">
                        <span className="block min-w-0 truncate text-lg font-semibold text-indigo-500">
                            {user.username}
                        </span>
                        <DrawerClose render={<Button variant="ghost" size="icon-lg" />} >
                            <MenuIcon className="size-5"/>
                        </DrawerClose>
                    </div>
                </DrawerHeader>

                <div className="flex flex-col gap-2 p-4">
                    {creditBalance.state.status !== "hidden" && (
                        <>
                            <CreditBalance {...creditBalance} />
                            <Separator className="bg-slate-300" />
                        </>
                    )}

                    <NavigationMenu className="max-w-full">
                        <NavigationMenuList>
                            <ul className="flex w-full flex-col gap-1">
                                {links.map(
                                    ({
                                        label,
                                        href,
                                        icon: Icon,
                                    }) => (
                                        <li key={href}>
                                            <NavigationMenuLink
                                                active={
                                                    location.pathname ===
                                                    href
                                                }
                                                render={
                                                    <Link
                                                        to={href}
                                                        onClick={() =>
                                                            setOpen(false)
                                                        }
                                                        className="flex flex-row items-center gap-2"
                                                    >
                                                        <Icon className="size-5" />
                                                        {label}
                                                    </Link>
                                                }
                                            />
                                        </li>
                                    ),
                                )}
                            </ul>
                        </NavigationMenuList>
                    </NavigationMenu>

                    <Separator className="bg-slate-300" />

                    <NavigationMenu className="max-w-full">
                        <NavigationMenuList>
                            <ul className="flex w-full flex-col gap-1">
                                <li>
                                    <NavigationMenuLink
                                        active={
                                            location.pathname === "/profile"
                                        }
                                        render={
                                            <Link
                                                to="/profile"
                                                onClick={() =>
                                                    setOpen(false)
                                                }
                                                className="flex flex-row items-center gap-2"
                                            >
                                                <UserIcon className="size-5" />
                                                Profile
                                            </Link>
                                        }
                                    />
                                </li>

                                <li>
                                    <NavigationMenuLink
                                        onClick={() => {
                                            logout();
                                            setOpen(false);
                                        }}
                                        className="flex cursor-pointer items-center gap-2 text-red-600"
                                    >
                                        <LogOutIcon className="size-5" />
                                        Logout
                                    </NavigationMenuLink>
                                </li>
                            </ul>
                        </NavigationMenuList>
                    </NavigationMenu>
                </div>
            </DrawerContent>
        </Drawer>
    );
};

export default MobileMenu;

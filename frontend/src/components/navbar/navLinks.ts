import { ROUTES } from "@/routes/routes";
import type { LucideIcon } from "lucide-react";
import {
    BlocksIcon,
    BoxesIcon,
    ClipboardListIcon,
    CoinsIcon,
    HouseIcon,
    PackageIcon,
    ShapesIcon,
    UserIcon,
} from "lucide-react";

export interface NavLinkItem {
    label: string;
    href: string;
    icon: LucideIcon;
}

export const studentNavLinks: NavLinkItem[] = [
    {
        label: "Home",
        href: ROUTES.HOME,
        icon: HouseIcon,
    },
    {
        label: "Requester Activity",
        href: ROUTES.REQUESTER_ACTIVITY,
        icon: ClipboardListIcon,
    },
    {
        label: "Courier Activity",
        href: ROUTES.COURIER_ACTIVITY,
        icon: PackageIcon,
    },
    {
        label: "Suppliers",
        href: ROUTES.SUPPLIERS,
        icon: BoxesIcon,
    },
    {
        label: "Credits",
        href: ROUTES.CREDITS,
        icon: CoinsIcon,
    },
];

export const adminNavLinks: NavLinkItem[] = [
    {
        label: "Home",
        href: ROUTES.HOME,
        icon: HouseIcon,
    },
    {
        label: "Manage Users",
        href: ROUTES.ADMIN.MANAGE_USERS,
        icon: UserIcon,
    },
    {
        label: "Manage Suppliers",
        href: ROUTES.ADMIN.MANAGE_SUPPLIERS,
        icon: BlocksIcon,
    },
    {
        label: "Manage Supplier Types",
        href: ROUTES.ADMIN.MANAGE_SUPPLIER_TYPES,
        icon: ShapesIcon,
    },
    {
        label: "Manage Orders",
        href: ROUTES.ADMIN.MANAGE_ORDERS,
        icon: ClipboardListIcon,
    },
];
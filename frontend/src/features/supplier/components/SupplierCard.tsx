// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Supplier edit, deactivate and activate actions.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

import { ClockIcon, LogOutIcon, MapIcon, MapPinIcon, PencilIcon, RotateCcwIcon, StoreIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Supplier, SupplierDay } from "../types/supplier.types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import useAuth from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import { ROUTES } from "@/routes/routes";
import { formatStringToTitleCase } from "@/utils/formatText";

const DAY_ORDER: SupplierDay[] = [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
];

const DAY_ABBR: Record<SupplierDay, string> = {
    MONDAY: "Mon",
    TUESDAY: "Tue",
    WEDNESDAY: "Wed",
    THURSDAY: "Thu",
    FRIDAY: "Fri",
    SATURDAY: "Sat",
    SUNDAY: "Sun",
};

const formatTimeLabel = (value: string | Date): string => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const hours = date.getUTCHours();
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    const period = hours < 12 ? "am" : "pm";
    const displayHour = hours % 12 === 0 ? 12 : hours % 12;
    return `${displayHour}:${minutes} ${period}`;
};

interface HourGroup {
    days: SupplierDay[];
    openingTime: string;
    closingTime: string;
}

const formatHoursSummary = (openingHours: Supplier["openingHours"]): string => {
    const sorted = [...(openingHours ?? [])].sort(
        (a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day),
    );

    const groups: HourGroup[] = [];
    for (const hour of sorted) {
        const last = groups[groups.length - 1];
        const curIndex = DAY_ORDER.indexOf(hour.day);
        if (
            last &&
            DAY_ORDER.indexOf(last.days[last.days.length - 1]) === curIndex - 1 &&
            last.openingTime === hour.openingTime &&
            last.closingTime === hour.closingTime
        ) {
            last.days.push(hour.day);
        } else {
            groups.push({
                days: [hour.day],
                openingTime: hour.openingTime,
                closingTime: hour.closingTime,
            });
        }
    }

    const timeRange = (openingTime: string, closingTime: string) =>
        `${formatTimeLabel(openingTime)}–${formatTimeLabel(closingTime)}`;

    return groups
        .map(group => {
            const label = timeRange(group.openingTime, group.closingTime);
            if (group.days.length === 1) {
                return `${DAY_ABBR[group.days[0]]} ${label}`;
            }
            return `${DAY_ABBR[group.days[0]]}-${DAY_ABBR[group.days[group.days.length - 1]]} ${label}`;
        })
        .join(" · ");
};

interface SupplierCardProps {
    supplier: Supplier;
    onEdit?: () => void;
    onDeactivate?: () => void;
    onActivate?: () => void;
}

const SupplierCard = ({ supplier, onEdit, onDeactivate, onActivate }: SupplierCardProps) => {
    const { user } = useAuth();
    const isAdmin = user?.role === "ADMIN";
    const isDeactivated = supplier.status === "DEACTIVATED";
    const location = useLocation();

    return (
        <Card className={`flex flex-col gap-4 p-4 w-full h-full justify-between ${isDeactivated ? "bg-slate-50" : ""}`}>
            <div className="flex flex-col gap-4 w-full h-full">
                <div className={`aspect-[16/9] w-full overflow-hidden rounded-lg bg-slate-100 ${isDeactivated ? "grayscale opacity-50" : ""}`}>
                    {supplier.imageUrl ? (
                        <img
                            src={supplier.imageUrl}
                            alt={supplier.name}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover object-center"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                            <StoreIcon className="size-8" />
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-2.5 w-full">
                    <div className="flex items-start justify-between gap-2">
                        <Badge variant="gray">{formatStringToTitleCase(supplier.type)}</Badge>
                        <Badge variant={isDeactivated ? "muted" : "indigo900"} className="gap-1.5">
                            <span className={`size-1.5 rounded-full ${isDeactivated ? "bg-slate-400" : "bg-emerald-500"}`} />
                            {isDeactivated ? "Deactivated" : "Active"}
                        </Badge>
                    </div>


                    <div className="flex flex-col gap-1">
                        <span className="text-lg leading-none font-bold text-wrap">
                            {supplier.name}
                        </span>
                        {supplier.description && (
                            <span className="text-sm leading-none text-slate-500 text-wrap">
                                {supplier.description}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                        <MapIcon className="size-4 shrink-0" />
                        <span className="text-wrap leading-none">
                            {supplier.building}, Floor {supplier.floor}
                        </span>
                    </div>

                    {supplier.address && (
                        <div className="flex items-center gap-1.5 text-sm text-slate-500">
                            <MapPinIcon className="size-4 shrink-0" />
                            <span className="text-sm leading-none text-wrap">{supplier.address}</span>
                        </div>
                    )}

                    {supplier.openingHours && supplier.openingHours.length > 0 && (
                        <div className="flex items-center gap-1.5 text-sm text-slate-500">
                            <ClockIcon className="size-4 shrink-0" />
                            <span className="text-wrap leading-none">{formatHoursSummary(supplier.openingHours)}</span>
                        </div>
                    )}
                </div>
            </div>
            
            {isAdmin && !isDeactivated && location.pathname === ROUTES.ADMIN.MANAGE_SUPPLIERS && (
                <div className="flex items-end justify-end gap-2 border-t border-slate-200 pt-3">
                    {onEdit && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onEdit}
                        >
                            <PencilIcon className="size-4" />
                            Edit
                        </Button>
                    )}
                    {onDeactivate && (
                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={onDeactivate}
                        >
                            <LogOutIcon className="size-4" />
                            Deactivate
                        </Button>
                    )}
                </div>
            )}
            {isAdmin && isDeactivated && onActivate && location.pathname === ROUTES.ADMIN.MANAGE_SUPPLIERS && (
                <div className="flex justify-end border-t border-slate-200 pt-3">
                    <Button type="button" variant="green" size="sm" onClick={onActivate}>
                        <RotateCcwIcon className="size-4" /> Activate
                    </Button>
                </div>
            )}
        </Card>
    );
};

export default SupplierCard;

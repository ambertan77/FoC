import { Card } from "@/components/ui/card";
import { REORDERABLE_STATUSES, statusVariant, type Order, type OrderRelatedSupplierDetails, type OrderStatus, type ReorderFormInput, type ViewerRole } from "../types/order.types";
import { AlarmClockIcon, CoinsIcon, FlagIcon, InfoIcon, MapPinIcon, PencilIcon, Repeat2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import RequestActivityDetailsDialog from "./RequestActivityDetailsDialog";
import StatusUpdateDialog from "./StatusUpdateDialog";
import { Skeleton } from "@/components/ui/skeleton";
import useAuth from "@/hooks/useAuth";
import { ROLES } from "@/features/auth/types/auth.types";
import RenewRequestDialog from "./RenewRequestDialog";
import { formatStringToTitleCase } from "@/utils/formatText";
import CreateRequestDialog from "./CreateRequestDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type RequestActivityCardProps = {
    order: Order;
    isEditable?: boolean;
    isAcceptable?: boolean;
    viewerRole: ViewerRole;
    pickupSupplier?: OrderRelatedSupplierDetails;
    deliverySupplier?: OrderRelatedSupplierDetails;
    isSuppliersLoading: boolean;
}

const RequestActivityCard = ({
    order, isEditable, isAcceptable, viewerRole,
    pickupSupplier, deliverySupplier, isSuppliersLoading
}: RequestActivityCardProps) => {
    const { user } = useAuth();
    const userRole = user?.role;

    // Opening the RequestActivityDetailsDialog
    const [open, setOpen] = useState(false);

    // Editing requests
    const canEditRequest =
        (isEditable ?? true) &&
        viewerRole === "requester" &&
        order.status === "OPEN" &&
        order.courierId === null;

    // Editing request status
    const editableStatuses: Partial<Record<OrderStatus, ViewerRole>> = {
        "ACCEPTED": "courier",
        "PICKED_UP": "courier",
        "COMPLETED": "requester",
        "OPEN": "requester",
    };
    const canEditStatus = Object.keys(editableStatuses).includes(order.status) && editableStatuses[order.status] === viewerRole;
    const [openStatusUpdateDialog, setOpenStatusUpdateDialog] = useState(false);

    // Accepting requests
    const canAccept = isAcceptable ?? false;

    // Renewing expired requests
    const canRenewRequest =
        viewerRole === "requester" &&
        order.status === "EXPIRED" &&
        order.courierId === null &&
        !order.renewalPending;
    const [openRenewRequestDialog, setOpenRenewRequestDialog] = useState(false);

    const rawFeedback =
        order.status === "PENDING_RESERVATION"
            ? "Request submitted. Confirming credit reservation..."
            : order.status === "RESERVATION_FAILED"
                ? "Credit reservation failed. Please try creating the request again."
                : order.status === "EXPIRED" && order.renewalPending
                    ? "Renewal submitted. Confirming credit reservation..."
                    : order.status === "EXPIRED" && order.renewalFailureCode
                        ? "Renewal failed. Your request is still expired. Please try again."
                        : null;

    // Detect if the message ends with "..." or "…" (single Unicode ellipsis)
    const isPending = rawFeedback?.trim().endsWith("...");

    // Remove the trailing ellipsis so we don't show "…" PLUS animated dots
    const reservationFeedback = rawFeedback?.replace(/(\.\.\.|…)\s*$/, "") ?? null;

    // Re-Ordering
    const canReorder =
        viewerRole === "requester" &&
        REORDERABLE_STATUSES.has(order.status) &&
        !order.renewalPending;

    const [openCreateRequestDialog, setOpenCreateRequestDialog] = useState(false);
    const [reorderPrefill, setReorderPrefill] =
        useState<Partial<ReorderFormInput> | null>(null);

    const handleReorder = () => {
        setReorderPrefill({
            name: order.name,
            description: order.description,
            pickupSupplierId: order.pickupSupplierId,
            deliverySupplierId: order.deliverySupplierId,
            offeredCredits: String(order.offeredCredits),
            remarks: order.remarks ?? "",
            isSuppliersLoading: isSuppliersLoading,
            pickupSupplierName: pickupSupplier?.name,
            deliverySupplierName: deliverySupplier?.name,
        });

        setOpen(false); // close the RequestActivityDetailsDialog
        setOpenCreateRequestDialog(true);
    }

    // Feedback for expired requests due to completion deadline
    const completionDeadlineFeedback =
        order.status === "AUTO_FAILED" && order.completedAt === null
            ? viewerRole === "requester"
                ? "Courier failed to complete the request by the deadline. Credits have been refunded to you."
                : viewerRole === "courier"
                    ? "You failed to complete the request by the deadline. Credits have been refunded to the requester."
                    : null
            : null;

    return (
        <>
            <Card
                role="button"
                tabIndex={0}
                aria-label={`View details for ${order.name}`}
                className="flex h-full w-full cursor-pointer flex-col justify-between gap-2.5 p-4 hover:shadow-lg"
                onClick={(event) => {
                    event.preventDefault();
                    setOpen(true);
                }}
            >
                <div className="flex flex-col gap-2.5">
                    <div className="flex flex-col gap-1.5">
                        <div className="flex flex-row items-center justify-between">
                            <span className="text-lg leading-none font-bold text-wrap">
                                {order.name}
                            </span>
                            <Tooltip>
                                <TooltipTrigger
                                    render={
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-xs"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                handleReorder();
                                            }}
                                            hidden={!canReorder}
                                        >
                                            <Repeat2 className="size-4 shrink-0 text-slate-500" />
                                        </Button>
                                    } />
                                <TooltipContent>
                                    <p>Reorder</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <span className="text-sm leading-none text-slate-500 text-wrap">
                            {order.description}
                        </span>
                    </div>

                    {isSuppliersLoading ? (
                        <div className="flex items-center gap-1.5 text-sm">
                            <FlagIcon className="size-4 shrink-0 text-slate-500" />
                            <Skeleton className="h-4 w-36" />
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 text-sm text-slate-500">
                            <FlagIcon className="size-4 shrink-0" />
                            <span>{pickupSupplier?.name ?? "Pickup location unavailable"}</span>
                            {pickupSupplier?.status === "DEACTIVATED" && (
                                <span className="text-amber-800">
                                    (Inactive)
                                </span>
                            )}
                        </div>
                    )}

                    {isSuppliersLoading ? (
                        <div className="flex items-center gap-1.5 text-sm">
                            <MapPinIcon className="size-4 shrink-0 text-slate-500" />
                            <Skeleton className="h-4 w-36" />
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 text-sm text-slate-500">
                            <MapPinIcon className="size-4 shrink-0" />
                            <span>{deliverySupplier?.name ?? "Delivery location unavailable"}</span>
                            {deliverySupplier?.status === "DEACTIVATED" && (
                                <span className="text-amber-800">
                                    (Inactive)
                                </span>
                            )}
                        </div>
                    )}

                    <div className="flex flex-row items-center gap-1.5 text-sm text-slate-500">
                        <AlarmClockIcon className="size-4 shrink-0" />
                        <span className="leading-none text-wrap">
                            {format(new Date(order.expiryAt), "MMM d, yyyy, h:mm a")}
                        </span>
                    </div>

                    {reservationFeedback && viewerRole === "requester" && (
                        <div className="inline-flex flex-row items-center gap-1.5 text-sm text-indigo-800">
                            <InfoIcon className="size-4 shrink-0" />
                            <div className="text-sm">
                                <span className="leading-none">{reservationFeedback}</span>

                                {/* Dots appear only when the message is pending (ended with ... or …) */}
                                {isPending && (
                                    <span className="inline-flex items-center gap-1 ml-1 align-middle">
                                        <span className="dot animate-dot-bounce" style={{ animationDelay: "0ms" }} />
                                        <span className="dot animate-dot-bounce" style={{ animationDelay: "150ms" }} />
                                        <span className="dot animate-dot-bounce" style={{ animationDelay: "300ms" }} />
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {completionDeadlineFeedback && (
                        <div className="flex flex-row items-center gap-1.5 text-sm text-indigo-800">
                            <InfoIcon className="size-4 shrink-0" />
                            <span className="leading-none text-wrap">
                                {completionDeadlineFeedback}
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex flex-row items-center justify-between border-t-2 border-slate-200 pt-2.5">
                    <div className="flex flex-row items-center gap-1.5 text-sm font-semibold">
                        <CoinsIcon className="size-4 shrink-0" />
                        <span className="leading-none text-wrap">
                            {order.offeredCredits}
                        </span>
                    </div>
                    {canEditStatus ? (
                        <Button
                            type="button"
                            variant={statusVariant[order.status]}
                            size="sm"
                            onClick={(event) => {
                                event.stopPropagation();
                                setOpenStatusUpdateDialog(true);
                            }}
                        >
                            <PencilIcon className="shrink-0" />
                            {formatStringToTitleCase(order.status)}
                        </Button>
                    ) : canRenewRequest ?
                        (
                            <Button
                                type="button"
                                variant={statusVariant[order.status]}
                                size="sm"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setOpenRenewRequestDialog(true);
                                }}
                            >
                                <PencilIcon className="shrink-0" />
                                {formatStringToTitleCase(order.status)}
                            </Button>
                        )
                        : (
                            <Button
                                type="button"
                                variant={statusVariant[order.status]}
                                size="sm"
                                className="pointer-events-none"
                            >
                                {formatStringToTitleCase(order.status)}
                            </Button>
                        )}
                </div>
            </Card>

            <RequestActivityDetailsDialog
                order={order}
                open={open}
                onOpenChange={setOpen}
                canEditRequest={canEditRequest}
                canAccept={canAccept && userRole == ROLES.STUDENT}
                viewerRole={viewerRole}
                pickupSupplier={pickupSupplier}
                deliverySupplier={deliverySupplier}
                isSuppliersLoading={isSuppliersLoading}
                canReorder={canReorder}
                handleReorder={handleReorder}
            />

            <StatusUpdateDialog
                order={order}
                viewerRole={viewerRole}
                open={openStatusUpdateDialog}
                onOpenChange={setOpenStatusUpdateDialog}
            />

            <RenewRequestDialog
                order={order}
                open={openRenewRequestDialog}
                onOpenChange={setOpenRenewRequestDialog}
            />

            <CreateRequestDialog
                open={openCreateRequestDialog}
                onOpenChange={setOpenCreateRequestDialog}
                initialValues={reorderPrefill!}
                showTrigger={false}
            />
        </>
    );
};

export default RequestActivityCard;
import { useState } from "react";
import { format } from "date-fns";
import { useForm } from "@tanstack/react-form";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import SupplierSelect from "./SupplierSelect";
import DateTimePicker from "./DateTimePicker";
import { statusVariant, type Order, type OrderRelatedSupplierDetails, type ViewerRole } from "../types/order.types";
import { useOrderCourierDetails, useOrderRequesterDetails } from "../hooks/useOrderRelatedUserDetails";
import { createRequestSchema } from "../schemas/create-request.schema";
import useUpdateRequest from "../hooks/useUpdateRequest";
import useAcceptRequest from "../hooks/useAcceptRequest";
import { formatStringToSentenceCase, formatStringToTitleCase } from "@/utils/formatText";
import { Repeat2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

type RequestActivityDetailsDialogProps = {
    order: Order;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    canEditRequest: boolean;
    canAccept: boolean;
    viewerRole: ViewerRole;
    pickupSupplier?: OrderRelatedSupplierDetails;
    deliverySupplier?: OrderRelatedSupplierDetails;
    isSuppliersLoading: boolean;
    canReorder: boolean;
    handleReorder: () => void;
};

const DetailText = ({
    label,
    value,
    isSupplierActive = true
}: {
    label: string;
    value: string;
    isSupplierActive?: boolean;
}) => (
    <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground text-wrap">{value || "—"}
            <span className="text-amber-800">
                {isSupplierActive ? "" : " (Inactive)"}
            </span>
        </p>
    </div>
);

const RequestActivityDetailsDialog = ({
    order,
    open,
    onOpenChange,
    canEditRequest,
    canAccept,
    viewerRole,
    pickupSupplier,
    deliverySupplier,
    isSuppliersLoading,
    canReorder,
    handleReorder,
}: RequestActivityDetailsDialogProps) => {
    const [isEditing, setIsEditing] = useState(false);

    const showCourier = viewerRole !== "courier"; // show courier details if viewerRole is requester or admin
    const showRequester = viewerRole !== "requester"; // show requester details if viewerRole is courier or admin
    const courierDetailsQuery = useOrderCourierDetails(order, viewerRole, open && showCourier);
    const courierDetails = courierDetailsQuery.data;
    const requesterDetailsQuery = useOrderRequesterDetails(order, viewerRole, open && showRequester);
    const requesterDetails = requesterDetailsQuery.data;

    const { updateRequest, isPending } = useUpdateRequest();
    const { acceptRequest, isPending: isAccepting } = useAcceptRequest();

    const form = useForm({
        defaultValues: {
            name: order.name,
            description: order.description,
            pickupSupplierId: order.pickupSupplierId,
            deliverySupplierId: order.deliverySupplierId,
            offeredCredits: String(order.offeredCredits),
            expiryAt: format(new Date(order.expiryAt), "yyyy-MM-dd'T'HH:mm"),
            remarks: order.remarks ?? "",
        },
        validators: {
            onSubmit: createRequestSchema
        },
        onSubmit: async ({ value }) => {
            const payload = createRequestSchema.parse(value);

            await updateRequest({ orderId: order.id, expectedVersion: order.version, payload });
            setIsEditing(false);
        },
    });

    const closeDialog = (nextOpen: boolean) => {
        onOpenChange(nextOpen);

        if (!nextOpen) {
            form.reset();
            setIsEditing(false);
        }
    };

    const cancelEditing = () => {
        form.reset();
        setIsEditing(false);
    };

    return (
        <Dialog open={open} onOpenChange={closeDialog}>
            <DialogContent className="w-full md:max-w-xl! max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {isEditing
                            ? "Edit the details of your request"
                            : "Request Details"}
                    </DialogTitle>
                </DialogHeader>

                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (isEditing) form.handleSubmit();
                    }}
                    className="flex flex-col gap-4"
                >
                    {!canEditRequest || !isEditing ? (
                        <div className="space-y-4">
                            <DetailText
                                label="Request name"
                                value={order.name}
                            />
                            <DetailText
                                label="Description"
                                value={order.description}
                            />
                            <DetailText
                                label="Pickup location"
                                value={
                                    isSuppliersLoading
                                        ? "Loading pickup location…"
                                        : pickupSupplier?.name ?? "Pickup location unavailable"
                                }
                                isSupplierActive={pickupSupplier?.status !== "DEACTIVATED"}
                            />
                            <DetailText
                                label="Delivery location"
                                value={
                                    isSuppliersLoading
                                        ? "Loading delivery location…"
                                        : deliverySupplier?.name ?? "Delivery location unavailable"
                                }
                                isSupplierActive={deliverySupplier?.status !== "DEACTIVATED"}
                            />
                            <DetailText
                                label="Offered credits"
                                value={String(order.offeredCredits)}
                            />
                            <DetailText
                                label="Completion deadline"
                                value={format(
                                    new Date(order.expiryAt),
                                    "MMM d, yyyy, h:mm a",
                                )}
                            />
                            <DetailText label="Remarks" value={order.remarks ?? ""} />
                        </div>
                    ) : (
                        <FieldGroup>
                            <form.Field
                                name="name"
                                children={field => {
                                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                                    return (
                                        <Field data-invalid={isInvalid}>
                                            <FieldLabel htmlFor={field.name}>Request Name</FieldLabel>
                                            <Input
                                                id={field.name}
                                                name={field.name}
                                                value={field.state.value}
                                                onBlur={field.handleBlur}
                                                onChange={e => field.handleChange(e.target.value)}
                                                aria-invalid={isInvalid}
                                                disabled={!isEditing}
                                            />
                                            {isInvalid && <FieldError errors={field.state.meta.errors} />}
                                        </Field>
                                    );
                                }}
                            />
                            <form.Field
                                name="description"
                                children={field => {
                                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                                    return (
                                        <Field data-invalid={isInvalid}>
                                            <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                                            <Textarea
                                                id={field.name}
                                                name={field.name}
                                                value={field.state.value}
                                                onBlur={field.handleBlur}
                                                onChange={e => field.handleChange(e.target.value)}
                                                aria-invalid={isInvalid}
                                                disabled={!isEditing}
                                            />
                                            {isInvalid && <FieldError errors={field.state.meta.errors} />}
                                        </Field>
                                    );
                                }}
                            />

                            <div className="flex w-full flex-col gap-4 md:flex-row">
                                <form.Field
                                    name="pickupSupplierId"
                                    children={field => {
                                        const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                                        return (
                                            <Field data-invalid={isInvalid} className="min-w-0 flex-1">
                                                <FieldLabel htmlFor={field.name}>Pickup Location</FieldLabel>
                                                <SupplierSelect
                                                    value={field.state.value}
                                                    isInvalid={isInvalid}
                                                    onChange={field.handleChange}
                                                    placeholder="Select pickup location"
                                                    displayName={
                                                        isSuppliersLoading
                                                            ? "Loading pickup location…"
                                                            : pickupSupplier?.name ?? "Pickup location unavailable"
                                                    }
                                                    disabled={!isEditing}
                                                />
                                                {isInvalid && (<FieldError errors={field.state.meta.errors} />)}
                                            </Field>
                                        );
                                    }}
                                />
                                <form.Field
                                    name="deliverySupplierId"
                                    validators={{
                                        onChangeListenTo: ["pickupSupplierId"],
                                        onChange: ({ value, fieldApi }) => {
                                            const pickupId = fieldApi.form.getFieldValue("pickupSupplierId");

                                            return value && pickupId === value
                                                ? { message: "Pickup and delivery locations must be different" }
                                                : undefined;
                                        },
                                    }}
                                >
                                    {field => {
                                        const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                                        return (
                                            <Field data-invalid={isInvalid} className="min-w-0 flex-1">
                                                <FieldLabel htmlFor={field.name}>Delivery Location</FieldLabel>
                                                <SupplierSelect
                                                    value={field.state.value}
                                                    isInvalid={isInvalid}
                                                    onChange={field.handleChange}
                                                    placeholder="Select delivery location"
                                                    displayName={
                                                        isSuppliersLoading
                                                            ? "Loading delivery location…"
                                                            : deliverySupplier?.name ?? "Delivery location unavailable"
                                                    }
                                                    disabled={!isEditing}
                                                />
                                                {isInvalid && (<FieldError errors={field.state.meta.errors} />)}
                                            </Field>
                                        );
                                    }}
                                </form.Field>
                            </div>

                            <div className="flex w-full flex-col gap-4 md:flex-row">
                                <form.Field
                                    name="offeredCredits"
                                    children={field => {
                                        const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                                        return (
                                            <Field data-invalid={isInvalid}>
                                                <FieldLabel htmlFor={field.name}>Offered Credits</FieldLabel>
                                                <Input
                                                    id={field.name}
                                                    name={field.name}
                                                    value={field.state.value}
                                                    onBlur={field.handleBlur}
                                                    onChange={e => field.handleChange(e.target.value.trim())}
                                                    aria-invalid={isInvalid}
                                                    type="number"
                                                    disabled={true}
                                                />
                                                {isInvalid && <FieldError errors={field.state.meta.errors} />}
                                            </Field>
                                        );
                                    }}
                                />
                                <form.Field
                                    name="expiryAt"
                                    children={field => {
                                        const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                                        return (
                                            <Field data-invalid={isInvalid}>
                                                <FieldLabel htmlFor={field.name}>Completion Deadline</FieldLabel>
                                                <DateTimePicker
                                                    value={field.state.value}
                                                    isInvalid={isInvalid}
                                                    onChange={field.handleChange}
                                                    onBlur={field.handleBlur}
                                                    disabled={!isEditing}
                                                />
                                                {isInvalid && (<FieldError errors={field.state.meta.errors} />)}
                                            </Field>
                                        );
                                    }}
                                />
                            </div>
                            <form.Field
                                name="remarks"
                                children={field => {
                                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                                    return (
                                        <Field data-invalid={isInvalid}>
                                            <FieldLabel htmlFor={field.name}>Remarks</FieldLabel>
                                            <Textarea
                                                id={field.name}
                                                name={field.name}
                                                value={field.state.value}
                                                onBlur={field.handleBlur}
                                                onChange={e => field.handleChange(e.target.value)}
                                                aria-invalid={isInvalid}
                                                disabled={!isEditing}
                                            />
                                            {isInvalid && <FieldError errors={field.state.meta.errors} />}
                                        </Field>
                                    );
                                }}
                            />
                        </FieldGroup>
                    )}

                    {/* Show the current status of the order */}
                    <div className="flex flex-col gap-0.5">
                        <p className="text-sm font-medium">Current status</p>
                        <Button
                            type="button"
                            variant={statusVariant[order.status]}
                            className="pointer-events-none w-fit rounded-4xl h-6.5 px-2 py-0 font-normal text-sm"
                        >
                            {formatStringToTitleCase(order.status)}
                        </Button>
                    </div>

                    {/* Show the failure reason if the order has failed */}
                    {order.failureReason && (
                        <div className="flex flex-col gap-0.5">
                            <p className="text-sm font-medium">Failure reason</p>
                            <p className="text-sm text-muted-foreground text-wrap">{order.failureReason}</p>
                        </div>
                    )}

                    {/* Show the cancellation reason if the order is cancelled */}
                    {order.cancellationReason && (
                        <div className="flex flex-col gap-0.5">
                            <p className="text-sm font-medium">Cancellation reason</p>
                            <p className="text-sm text-muted-foreground text-wrap">{order.cancellationReason}</p>
                        </div>
                    )}

                    {/* Show the reservation failure code if the order has a reservation failure */}
                    {order.reservationFailureCode && (
                        <div className="flex flex-col gap-0.5">
                            <p className="text-sm font-medium">Credits reservation failure reason</p>
                            <p className="text-sm text-muted-foreground text-wrap">{formatStringToSentenceCase(order.reservationFailureCode)}</p>
                        </div>
                    )}

                    {/* Show the renewal failure code if the order has a renewal failure */}
                    {order.renewalFailureCode && (
                        <div className="flex flex-col gap-0.5">
                            <p className="text-sm font-medium">Renewal failure reason</p>
                            <p className="text-sm text-muted-foreground text-wrap">{formatStringToSentenceCase(order.renewalFailureCode)}</p>
                        </div>
                    )}

                    {/* Show the details of the requester */}
                    {showRequester && (
                        <div className="space-y-2 border-t pt-4">
                            <p className="font-medium text-base">Requester Details</p>

                            {requesterDetailsQuery.isPending ? (
                                <div className="flex w-full flex-1 items-center justify-start gap-2 text-sm text-muted-foreground">
                                    <Spinner className="size-4" />
                                    <span>Loading requester details...</span>
                                </div>
                            ) : requesterDetailsQuery.isError ? (
                                <p role="alert" className="text-sm text-destructive">
                                    Could not load requester details.
                                </p>
                            ) : requesterDetails ? (
                                <>
                                    <DetailText label="Email" value={requesterDetails.email} />
                                    <DetailText label="Username" value={requesterDetails.username} />
                                    <DetailText label="Phone" value={requesterDetails.phoneNumber} />
                                </>
                            ) : null}
                        </div>
                    )}

                    {/* Show the details of the courier */}
                    {showCourier && (
                        <div className="space-y-2 border-t pt-4">
                            <p className="font-medium text-base">Courier Details</p>

                            {!order.courierId ? (
                                <p className="text-sm text-muted-foreground">
                                    No courier has accepted this request yet.
                                </p>
                            ) : courierDetailsQuery.isPending ? (
                                <div className="flex w-full flex-1 items-center justify-start gap-2 text-sm text-muted-foreground">
                                    <Spinner className="size-4" />
                                    <span>Loading courier details...</span>
                                </div>
                            ) : courierDetailsQuery.isError ? (
                                <p role="alert" className="text-sm text-destructive">
                                    Could not load courier details.
                                </p>
                            ) : courierDetails ? (
                                <>
                                    <DetailText label="Email" value={courierDetails.email} />
                                    <DetailText label="Username" value={courierDetails.username} />
                                    <DetailText label="Phone" value={courierDetails.phoneNumber} />
                                </>
                            ) : null}
                        </div>
                    )}

                    {canEditRequest && (
                        <div className="flex justify-end gap-2">
                            {isEditing ? (
                                <>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={cancelEditing}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="submit" variant="indigo" isLoading={isPending}>
                                        Save changes
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    type="button"
                                    variant="indigo"
                                    onClick={() => setIsEditing(true)}
                                >
                                    Edit request
                                </Button>
                            )}

                        </div>
                    )}

                    {canAccept && (
                        <div className="flex justify-end gap-2">
                            <Button
                                type="submit"
                                variant="indigo"
                                isLoading={isAccepting}
                                disabled={isAccepting}
                                onClick={() => acceptRequest({ orderId: order.id, expectedVersion: order.version })}
                            >
                                Accept
                            </Button>
                        </div>
                    )}

                    {canReorder && (
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="indigo"
                                onClick={handleReorder}
                            >
                                <Repeat2 className="size-4 shrink-0" />
                                Reorder
                            </Button>
                        </div>
                    )}
                </form>
            </DialogContent>
        </Dialog >
    );
};

export default RequestActivityDetailsDialog;
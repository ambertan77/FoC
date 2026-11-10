// AI Assistance Disclosure:
// Tool: Claude Code (Opus 5.5)
// Date: 2026-10-15
// Scope: Fixed issues with UI and dialog not closing.
// Author review: Reviewed, tested, and edited by Amber Tan Junning.

import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Order, type OrderStatus, type ViewerRole } from "../types/order.types";
import { updateStatusSchema, type UpdateStatusFormData, type UpdateStatusFormInput } from "../schemas/update-status.schema";
import useDropRequest from "../hooks/useDropRequest";
import usePickUpRequest from "../hooks/usePickUpRequest";
import useCompleteRequest from "../hooks/useCompleteRequest";
import useReceiveRequest from "../hooks/useReceiveRequest";
import useFailRequest from "../hooks/useFailRequest";
import { Textarea } from "@/components/ui/textarea";
import useCancelRequest from "../hooks/useCancelRequest";

type StatusUpdateDialogProps = {
    order: Order;
    viewerRole: ViewerRole;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const StatusUpdateDialog = ({
    order,
    viewerRole,
    open,
    onOpenChange
}: StatusUpdateDialogProps) => {
    // mapping for what the next status can be, given the current status
    const STATUS_UPDATES: Partial<Record<OrderStatus, OrderStatus[]>> =
        viewerRole === "courier"
            ? {
                ACCEPTED: ["OPEN", "PICKED_UP"], // OPEN means drop acceptance
                PICKED_UP: ["COMPLETED"],
            }
            : {
                OPEN: ["CANCELED"],
                COMPLETED: ["RECEIVED", "FAILED"],
            };

    const PRETTY_PRINT_OPTIONS: Partial<Record<OrderStatus, string>> = {
        "OPEN": "Drop order",
        "PICKED_UP": "Pick up order",
        "CANCELED": "Cancel order",
        "COMPLETED": "Complete order",
        "RECEIVED": "Receive order",
        "FAILED": "Fail order",
    };

    const prettyPrintCurrentStatus = (status: OrderStatus) => {
        const words: string[] = (status as string).split("_");
        let prettyString = "";

        for (const word of words) {
            // capitalise first letter of each word and use small letters for all other letters
            const prettyWord = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() + " ";
            prettyString += prettyWord; // append word
        }

        return prettyString.trim();
    };

    // hooks
    const { dropRequest, isPending: isDropping } = useDropRequest();
    const { pickUpRequest, isPending: isPickingUp } = usePickUpRequest();
    const { completeRequest, isPending: isCompleting } = useCompleteRequest();
    const { receiveRequest, isPending: isReceiving } = useReceiveRequest();
    const { failRequest, isPending: isFailing } = useFailRequest();
    const { cancelRequest, isPending: isCanceling } = useCancelRequest();

    const updateStatus = async (
        order: Order,
        payload: UpdateStatusFormData
    ) => {
        const { newStatus, failureReason, cancellationReason } = payload;
        if (!newStatus) {
            return;
        }

        const currentStatus = order.status;
        const allowedNextStatuses = STATUS_UPDATES[currentStatus] ?? [];

        if (!allowedNextStatuses.includes(newStatus)) {
            // not allowed, simply return
            return;
        }

        if (newStatus === "OPEN") {
            // Courier drops the acceptance: ACCEPTED -> OPEN
            await dropRequest({ orderId: order.id, expectedVersion: order.version });
            return;
        } else if (newStatus === "PICKED_UP") {
            // Courier picks up the order: ACCEPTED -> PICKED_UP
            await pickUpRequest({ orderId: order.id, expectedVersion: order.version });
            return;
        } else if (newStatus === "COMPLETED") {
            // Courier completes the order: PICKED_UP -> COMPLETED
            await completeRequest({ orderId: order.id, expectedVersion: order.version });
            return;
        } else if (newStatus === "CANCELED") {
            // Requester cancels the order: OPEN -> CANCELED
            await cancelRequest({
                orderId: order.id,
                expectedVersion: order.version,
                cancellationReason: cancellationReason
            });
            return;
        } else if (newStatus === "RECEIVED") {
            // Requester receives the order: COMPLETED -> RECEIVED
            await receiveRequest({
                orderId: order.id, expectedVersion: order.version
            });
            return;
        } else if (newStatus === "FAILED") {
            // Requester fails the order: COMPLETED -> FAILED
            await failRequest({
                orderId: order.id,
                expectedVersion: order.version,
                failureReason: failureReason
            });
            return;
        }

        // unsupported new order status, simply return
        return;
    };

    const defaultValues: UpdateStatusFormInput = {
        newStatus: undefined,
        failureReason: "",
        cancellationReason: undefined,
    };

    const form = useForm({
        defaultValues: defaultValues,
        validators: {
            onSubmit: updateStatusSchema
        },
        onSubmit: async ({ value }) => {
            const payload = updateStatusSchema.parse(value);

            if (!payload.newStatus) return;

            await updateStatus(order, payload);
            closeDialog(false);
        },
    });

    const closeDialog = (nextOpen: boolean) => {
        onOpenChange(nextOpen);

        if (!nextOpen) {
            form.reset();
        }
    };

    return (
        <Dialog open={open} onOpenChange={closeDialog}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        Update Status - {order.name}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-row items-center justify-start gap-2">
                    <span className="font-medium">Current status:</span>
                    <span>{prettyPrintCurrentStatus(order.status)}</span>
                </div>

                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.handleSubmit();
                    }}
                    className="flex flex-col gap-4"
                >
                    <FieldGroup>
                        <form.Field
                            name="newStatus"
                            children={field => {
                                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                                return (
                                    <Field data-invalid={isInvalid} className="flex-1 flex-col md:flex-row items-start md:items-center justify-start gap-2 *:w-auto">
                                        <FieldLabel htmlFor={field.name} className="shrink-0">
                                            New status:
                                        </FieldLabel>
                                        <Select
                                            value={field.state.value ?? null}
                                            onValueChange={(value) => {
                                                field.handleChange(value as OrderStatus);
                                            }}
                                        >
                                            <SelectTrigger
                                                className="w-full! md:w-48! bg-white"
                                                aria-invalid={isInvalid}
                                            >
                                                <SelectValue placeholder="Select an option">
                                                    {field.state.value
                                                        ? PRETTY_PRINT_OPTIONS[field.state.value!] ?? field.state.value
                                                        : undefined}
                                                </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent alignItemWithTrigger={false}>
                                                {STATUS_UPDATES[order.status]?.map((value) => (
                                                    <SelectItem key={value} value={value}>
                                                        {PRETTY_PRINT_OPTIONS[value]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {isInvalid && (<FieldError errors={field.state.meta.errors} />)}
                                    </Field>
                                );
                            }}
                        />
                        <form.Subscribe
                            selector={state => state.values.newStatus}
                        >
                            {newStatus =>
                                newStatus === "FAILED" ? (
                                    <form.Field
                                        name="failureReason"
                                        children={field => {
                                            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                                            return (
                                                <Field data-invalid={isInvalid}>
                                                    <FieldLabel htmlFor={field.name} className="font-bold">
                                                        Failure reason:
                                                    </FieldLabel>
                                                    <Textarea
                                                        id={field.name}
                                                        name={field.name}
                                                        value={field.state.value}
                                                        onBlur={field.handleBlur}
                                                        onChange={event =>
                                                            field.handleChange(event.target.value)
                                                        }
                                                        aria-invalid={isInvalid}
                                                        placeholder="Explain why this request failed"
                                                    />
                                                    {isInvalid && (<FieldError errors={field.state.meta.errors} />)}
                                                </Field>
                                            );
                                        }}
                                    />
                                ) : null
                            }
                        </form.Subscribe>
                        <form.Subscribe selector={state => state.values.newStatus}>
                            {newStatus =>
                                newStatus === "CANCELED" ? (
                                    <form.Field
                                        name="cancellationReason"
                                        children={field => {
                                            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                                            return (
                                                <Field>
                                                    <FieldLabel htmlFor={field.name} className="font-bold">
                                                        Cancellation reason (optional):
                                                    </FieldLabel>
                                                    <Textarea
                                                        id={field.name}
                                                        name={field.name}
                                                        value={field.state.value}
                                                        onBlur={field.handleBlur}
                                                        onChange={event =>
                                                            field.handleChange(event.target.value)
                                                        }
                                                        aria-invalid={isInvalid}
                                                        placeholder="Add a reason for cancelling"
                                                    />
                                                    {isInvalid && (<FieldError errors={field.state.meta.errors} />)}

                                                </Field>
                                            );
                                        }}
                                    />
                                ) : null
                            }
                        </form.Subscribe>
                    </FieldGroup>

                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => closeDialog(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="indigo"
                            isLoading={isDropping || isPickingUp || isCompleting || isReceiving || isFailing || isCanceling}>
                            Confirm
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default StatusUpdateDialog;
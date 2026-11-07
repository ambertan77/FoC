import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import CreateRequestDialog from "@/features/order/components/CreateRequestDialog";
import RequestActivityCard from "@/features/order/components/RequestActivityCard";
import { useRequesterOrderHistory } from "@/features/order/hooks/useRequesterOrderHistory";
import { useSuppliersByIds } from "@/features/order/hooks/useSuppliersByIds";
import { ORDER_STATUSES, type OrderStatus, type SortBy, type SortOrder } from "@/features/order/types/order.types";
import { formatStringToSentenceCase } from "@/utils/formatText";
import { useState } from "react";

const PAGE_SIZE = 15;

const STATUS_LABELS: Record<string, string> = {
    ALL: "All",
    ...Object.fromEntries(
        ORDER_STATUSES.map((status) => [status, formatStringToSentenceCase(status)]),
    ),
};

const SORT_BY_LABELS: Partial<Record<SortBy, string>> = {
    createdAt: "Created date",
    expiryAt: "Completion deadline",
};

const RequesterActivtyPage = () => {
    const [openCreateRequestDialog, setOpenCreateRequestDialog] = useState(false);
    const [page, setPage] = useState(1);
    const [selectedStatus, setSelectedStatus] = useState<OrderStatus | "ALL">("ALL");
    const [sortBy, setSortBy] = useState<SortBy>("createdAt");
    const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

    const requesterOrderHistoryQuery = useRequesterOrderHistory({
        page: page,
        limit: PAGE_SIZE,
        sortBy: sortBy,
        sortOrder: sortOrder,
        ...(selectedStatus !== "ALL" && { status: selectedStatus }),
    });

    const requestsData = requesterOrderHistoryQuery.data;
    const requests = requestsData?.orders ?? [];
    const totalPages = requestsData?.pagination.totalPages ?? 0;

    // Collect unique supplier IDs from the requests to fetch their details
    const supplierIds = [
        ...new Set(
            requests.flatMap((order) => [
                order.pickupSupplierId,
                order.deliverySupplierId,
            ]),
        ),
    ];
    const suppliersQuery = useSuppliersByIds(supplierIds);

    const supplierById = new Map(
        (suppliersQuery.data ?? []).map((supplier) => [supplier.id, supplier]),
    );

    const isSuppliersLoading =
        supplierIds.length > 0 && suppliersQuery.isPending;

    const handleStatusChange = (value: OrderStatus | "ALL") => {
        setSelectedStatus(value);
        setPage(1);
    };

    const SORT_ORDER_LABELS: Record<SortOrder, string> =
        sortBy === "expiryAt"
            ? { desc: "Latest expiry first", asc: "Soonest expiry first" }
            : { desc: "Newest first", asc: "Oldest first" };

    return (
        <>
            <div className="flex flex-col items-start justify-center gap-5 px-5 md:px-10 py-5 w-full">
                <div className="flex flex-col md:flex-row items-start justify-between gap-4 w-full">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-xl md:text-2xl font-bold">My Requester Activities</h1>
                        <p className="text-sm text-muted-foreground">Click on any request to view its full details.</p>
                    </div>
                    <CreateRequestDialog
                        open={openCreateRequestDialog}
                        onOpenChange={setOpenCreateRequestDialog}
                    />
                </div>

                <div className="flex flex-wrap items-end gap-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium">Status</label>
                        <Select
                            value={selectedStatus}
                            onValueChange={(value) => {
                                handleStatusChange(value as OrderStatus | "ALL");
                            }}>
                            <SelectTrigger className="w-48 bg-white">
                                <SelectValue placeholder="Status">
                                    {STATUS_LABELS[selectedStatus]}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}>
                                <SelectItem value="ALL">All</SelectItem>
                                {ORDER_STATUSES.map((status) => (
                                    <SelectItem key={status} value={status}>
                                        {formatStringToSentenceCase(status)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium">Sort by</label>
                        <Select
                            value={sortBy}
                            onValueChange={(value) => {
                                setSortBy(value as SortBy);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="w-48 bg-white">
                                <SelectValue placeholder="Sort by">
                                    {SORT_BY_LABELS[sortBy]}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}>
                                {Object.entries(SORT_BY_LABELS).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium">Sort order</label>
                        <Select
                            value={sortOrder}
                            onValueChange={(value) => {
                                setSortOrder(value as SortOrder);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="w-48 bg-white">
                                <SelectValue placeholder="Sort order">
                                    {SORT_ORDER_LABELS[sortOrder]}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}>
                                {Object.entries(SORT_ORDER_LABELS).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {requesterOrderHistoryQuery.isLoading && (
                    <div className="flex w-full flex-1 items-center justify-center gap-2 py-16 text-muted-foreground">
                        <Spinner className="size-6" />
                        <span>Loading activities...</span>
                    </div>
                )}

                {requesterOrderHistoryQuery.isError && (
                    <p className="text-red-500">
                        Failed to load activities: {requesterOrderHistoryQuery.error.message}
                    </p>
                )}

                {!requesterOrderHistoryQuery.isLoading &&
                    !requesterOrderHistoryQuery.isError &&
                    requests.length === 0 && (
                        <p className="text-muted-foreground">No activities yet.</p>
                    )}

                {requests.length > 0 && (
                    <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                            {requests.map((order) => (
                                <RequestActivityCard
                                    key={order.id}
                                    order={order}
                                    viewerRole="requester"
                                    pickupSupplier={supplierById.get(order.pickupSupplierId)}
                                    deliverySupplier={supplierById.get(order.deliverySupplierId)}
                                    isSuppliersLoading={isSuppliersLoading}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div >

            {totalPages > 1 && (
                <Pagination className="p-2 border rounded-xl w-fit shadow-sm border-slate-200 bg-white">
                    < PaginationContent >
                        <PaginationItem>
                            <PaginationPrevious
                                href="#"
                                aria-disabled={page <= 1}
                                className={
                                    page <= 1
                                        ? "pointer-events-none opacity-50"
                                        : undefined
                                }
                                onClick={(event) => {
                                    event.preventDefault();
                                    if (page > 1) setPage(page - 1);
                                }}
                            />
                        </PaginationItem>

                        <PaginationItem>
                            <span className="px-3 text-sm">
                                Page {page} of {totalPages}
                            </span>
                        </PaginationItem>

                        <PaginationItem>
                            <PaginationNext
                                href="#"
                                aria-disabled={page >= totalPages}
                                className={
                                    page >= totalPages
                                        ? "pointer-events-none opacity-50"
                                        : undefined
                                }
                                onClick={(event) => {
                                    event.preventDefault();
                                    if (page < totalPages) setPage(page + 1);
                                }}
                            />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            )
            }
        </>
    );
};

export default RequesterActivtyPage;
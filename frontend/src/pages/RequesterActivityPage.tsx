import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CreateRequestDialog from "@/features/order/components/CreateRequestDialog";
import RequestActivityCard from "@/features/order/components/RequestActivityCard";
import { useRequesterOrderHistory } from "@/features/order/hooks/useRequesterOrderHistory";
import { useSuppliersByIds } from "@/features/order/hooks/useSuppliersByIds";
import { ORDER_STATUSES, type OrderStatus, type SortBy, type SortOrder } from "@/features/order/types/order.types";
import { formatStringToTitleCase } from "@/utils/formatText";
import { useState } from "react";

const PAGE_SIZE = 15;

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

    const handleStatusChange = (value: string) => {
        setSelectedStatus(value as OrderStatus | "ALL");
        setPage(1);
    };

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

                <Tabs value={selectedStatus} onValueChange={handleStatusChange} className="w-full">
                    <TabsList className="w-fit max-w-full h-full flex flex-nowrap items-center justify-start gap-1 overflow-x-auto overflow-y-hidden">
                        <TabsTrigger value="ALL">All</TabsTrigger>

                        {ORDER_STATUSES.map((status) => (
                            <TabsTrigger key={status} value={status}>
                                {formatStringToTitleCase(status)}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                <div className="flex flex-wrap items-end gap-4">
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
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}>
                                <SelectItem value="createdAt">Created date</SelectItem>
                                <SelectItem value="expiryAt">Completion deadline</SelectItem>
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
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}>
                                <SelectItem value="desc">
                                    {sortBy === "expiryAt" ? "Latest expiry first" : "Newest first"}
                                </SelectItem>
                                <SelectItem value="asc">
                                    {sortBy === "expiryAt" ? "Soonest expiry first" : "Oldest first"}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {requesterOrderHistoryQuery.isLoading && (
                    <div className="flex w-full flex-1 items-center justify-center gap-2 py-16">
                        <Spinner className="size-6" />
                        <span className="text-muted-foreground">Loading activities...</span>
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
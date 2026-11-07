import { useState } from "react";
import { format } from "date-fns";
import { SearchIcon } from 'lucide-react';
import { DatePickerWithRange } from "@/components/ui/date-range";
import { Field } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import RequestActivityCard from "@/features/order/components/RequestActivityCard";
import SupplierSelect from "@/features/order/components/SupplierSelect";
import { useOrderHistory } from "@/features/order/hooks/useOrderHistory";
import { useSuppliersByIds } from "@/features/order/hooks/useSuppliersByIds";
import {
    STATUS_CATEGORY_MAPPING,
    type OrderStatus,
    type OrderStatusCategory,
    type SortBy,
    type SortOrder
} from "@/features/order/types/order.types";
import { formatStringToSentenceCase, formatStringToTitleCase } from "@/utils/formatText";
import { Spinner } from "@/components/ui/spinner";

type AdminOrderDashboardProps = {
    selectedCategory: OrderStatusCategory;
}

const convertStatusToTitle = (status: OrderStatus | "ALL", category: OrderStatusCategory) => {
    if (status === "ALL") {
        if (category === "ALL") {
            return "Total Orders";
        }
        return `Total ${formatStringToTitleCase(category)} Orders`;
    }

    if (status === "PENDING_RESERVATION") {
        return "Orders Pending Reservation";
    }

    if (status === "RESERVATION_FAILED") {
        return "Orders with Failed Reservation"
    }

    if (status === "AUTO_RECEIVED") {
        return "Automatically Received Orders";
    }

    return formatStringToTitleCase(status) + " Orders";
}

const AdminOrderDashboardCard = ({
    selectedCategory
}: AdminOrderDashboardProps) => {
    const relevantOrderStatuses = STATUS_CATEGORY_MAPPING[selectedCategory];

    const [page, setPage] = useState(1);
    const [selectedStatus, setSelectedStatus] = useState<OrderStatus | "ALL">("ALL");
    const [sortBy, setSortBy] = useState<SortBy>("createdAt");
    const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
    const [supplierIdFilter, setSupplierIdFilter] = useState<string | undefined>(undefined);
    const [searchString, setSearchString] = useState<string>("");
    const [startDate, setStartDate] = useState<Date | undefined>(undefined);
    const [endDate, setEndDate] = useState<Date | undefined>(undefined);

    const orderHistoryQuery = useOrderHistory({
        page: page,
        sortBy: sortBy,
        sortOrder: sortOrder,
        statuses: selectedStatus === "ALL" ? relevantOrderStatuses : [selectedStatus],
        ...(supplierIdFilter && { filterLocation: supplierIdFilter }),
        ...(searchString && { searchString: searchString }),
        // use format for date-fns to use the actual date that the user picked in the browser
        ...(startDate && { startDate: format(startDate, "yyyy-MM-dd") }), // only store the dates
        ...(endDate && { endDate: format(endDate, "yyyy-MM-dd") }), // only store the dates
    });

    const requestsData = orderHistoryQuery.data;
    const requests = requestsData?.orders ?? [];
    const totalCount = requestsData?.pagination?.totalCount ?? 0;
    const totalPages = requestsData?.pagination.totalPages ?? 0; // LIMIT handled by backend, not passed in from frontend

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

    const handleSearchKeyInput = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchString(event.target.value);
    }

    const searchbarPlaceholder: Record<OrderStatusCategory, string> = {
        ALL: "Search all orders by name",
        LIVE: "Search live orders by name",
        PAST: "Search past orders by name",
    };

    // Status labals
    const STATUS_LABELS: Record<string, string> = {
        ALL: "All",
        ...Object.fromEntries(
            relevantOrderStatuses.map((status) => [
                status,
                formatStringToSentenceCase(status),
            ]),
        ),
    };

    // Sorting labels
    const SORT_BY_LABELS: Partial<Record<SortBy, string>> = {
        createdAt: "Creation date",
        expiryAt: "Completion deadline",
    };

    const SORT_ORDER_LABELS: Record<SortOrder, string> =
        sortBy === "expiryAt"
            ? { desc: "Latest expiry first", asc: "Soonest expiry first" }
            : { desc: "Newest first", asc: "Oldest first" };

    return (
        <>
            <div className="flex flex-col items-start justify-center gap-5 w-full">
                <div className="flex flex-col gap-1">
                    <h1 className="text-xl md:text-2xl font-bold">{totalCount} {convertStatusToTitle(selectedStatus, selectedCategory)}</h1>
                    <p className="text-sm text-muted-foreground">Showing a maximum of 15 orders per page. Click on any order to view its full details.</p>
                </div>

                <div className="flex flex-col gap-1 w-full md:w-1/2">
                    <Field className="w-full">
                        <InputGroup className="bg-white">
                            <InputGroupAddon align="inline-start">
                                <SearchIcon />
                            </InputGroupAddon>
                            <InputGroupInput
                                id="input-search-key"
                                type="text"
                                placeholder={searchbarPlaceholder[selectedCategory]}
                                onChange={handleSearchKeyInput} />
                        </InputGroup>
                    </Field>
                </div>

                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex flex-col gap-1">
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
                                {relevantOrderStatuses.map((status) => (
                                    <SelectItem key={status} value={status}>
                                        {formatStringToTitleCase(status)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex flex-col gap-1">
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

                    <div className="flex flex-col gap-1">
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

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium">Filter location</label>
                        <SupplierSelect
                            className="w-48 bg-white"
                            value={supplierIdFilter ?? ""}
                            onChange={(id) => {
                                setSupplierIdFilter(id);
                                setPage(1);
                            }}
                            placeholder="No location selected"
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium">Filter by order creation date</label>
                        <DatePickerWithRange
                            startDate={startDate}
                            endDate={endDate}
                            onChange={(startDate, endDate) => {
                                setStartDate(startDate);
                                setEndDate(endDate);
                                setPage(1);
                            }}
                        />
                    </div>
                </div>

                {orderHistoryQuery.isLoading && (
                    <div className="flex w-full flex-1 items-center justify-center gap-2 py-16 text-muted-foreground">
                        <Spinner className="size-6" />
                        <span>Loading order history...</span>
                    </div>
                )}

                {orderHistoryQuery.isError && (
                    <p className="text-red-500">
                        Failed to load order history: {orderHistoryQuery.error.message}
                    </p>
                )}

                {!orderHistoryQuery.isLoading &&
                    !orderHistoryQuery.isError &&
                    requests.length === 0 && (
                        <p className="text-muted-foreground">No order history yet.</p>
                    )}

                {requests.length > 0 && (
                    <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                            {requests.map((order) => (
                                <RequestActivityCard
                                    key={order.id}
                                    order={order}
                                    viewerRole="admin"
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

export default AdminOrderDashboardCard;
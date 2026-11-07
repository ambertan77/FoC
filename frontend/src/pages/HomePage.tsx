import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { SearchIcon } from 'lucide-react';
import SupplierSelect from "@/features/order/components/SupplierSelect";
import RequestActivityCard from "@/features/order/components/RequestActivityCard";
import { useOpenOrders } from "@/features/order/hooks/useOpenOrders";
import { useSuppliersByIds } from "@/features/order/hooks/useSuppliersByIds";
import { type SortBy, type SortOrder } from "@/features/order/types/order.types";
import { useState } from "react";
import CreateRequestDialog from "@/features/order/components/CreateRequestDialog";
import useAuth from "@/hooks/useAuth";
import { ROLES } from "@/features/auth/types/auth.types";
import { Spinner } from "@/components/ui/spinner";

const LIMIT = 15;

const HomePage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === ROLES.ADMIN;

    const [openCreateRequestDialog, setOpenCreateRequestDialog] = useState(false);
    const [page, setPage] = useState(1);
    const [sortBy, setSortBy] = useState<SortBy>("expiryAt");
    const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
    const [supplierIdFilter, setSupplierIdFilter] = useState<string | undefined>(undefined);
    const [searchString, setSearchString] = useState<string>("");

    const openOrdersQuery = useOpenOrders({
        page: page,
        limit: LIMIT,
        sortBy: sortBy,
        sortOrder: sortOrder,
        ...(supplierIdFilter && { filterLocation: supplierIdFilter }),
        ...(searchString && { searchString: searchString }),
    })

    const requestsData = openOrdersQuery.data;
    const requests = requestsData?.orders ?? [];
    const totalCount = requestsData?.pagination.totalCount ?? 0;
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

    const isSuppliersLoading = supplierIds.length > 0 && suppliersQuery.isPending;

    const handleSearchKeyInput = (event: React.ChangeEvent<HTMLInputElement>) => {
        console.log(searchString)
        setSearchString(event.target.value);
    }

    // Sorting labels
    const SORT_BY_LABELS: Partial<Record<SortBy, string>> = {
        offeredCredits: "Offered Credits",
        expiryAt: "Completion deadline",
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
                        <h1 className="text-xl md:text-2xl font-bold">{totalCount} Open Requests</h1>
                        <p className="text-sm text-muted-foreground">Click on any request to view its full details.</p>
                    </div>
                    {!isAdmin &&
                        <CreateRequestDialog
                            open={openCreateRequestDialog}
                            onOpenChange={setOpenCreateRequestDialog}
                        />
                    }
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
                                placeholder="Search for an open order"
                                onChange={handleSearchKeyInput} />
                        </InputGroup>
                    </Field>
                </div>

                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium">Filter location</label>
                        <SupplierSelect
                            className="w-48 bg-white"
                            value={supplierIdFilter ?? ""}
                            onChange={(id) => {
                                setSupplierIdFilter(id);
                                setPage(1);
                            }}
                            placeholder="No filter selected"
                        />
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
                </div>

                {openOrdersQuery.isLoading && (
                    <div className="flex w-full flex-1 items-center justify-center gap-2 py-16 text-muted-foreground">
                        <Spinner className="size-6" />
                        <span>Loading requests...</span>
                    </div>
                )}

                {openOrdersQuery.isError && (
                    <p className="text-red-500">
                        Failed to load requests: {openOrdersQuery.error.message}
                    </p>
                )}

                {!openOrdersQuery.isLoading &&
                    !openOrdersQuery.isError &&
                    requests.length === 0 && (
                        <p className="text-muted-foreground">No requests yet.</p>
                    )}

                {requests.length > 0 && (
                    <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                            {requests.map((order) => (
                                <RequestActivityCard
                                    key={order.id}
                                    order={order}
                                    viewerRole="courier"
                                    isEditable={false}
                                    isAcceptable={true}
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

export default HomePage;

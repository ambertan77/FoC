import { useState, useEffect } from "react";
import type { ChangeEvent } from "react";
import { PlusIcon, SearchIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";

import type { ParsedError } from "@/utils/errorHandler";
import {
    getAllSuppliers,
    createSupplier,
    updateSupplier,
    getAllSupplierTypes,
    deactivateSupplier,
    activateSupplier
} from "@/features/supplier/services/supplier.service";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import DeactivateModal from "@/features/supplier/components/DeactivateModal";
import type {
    Supplier,
    SupplierDay,
    CreateSupplierInput,
    SupplierType,
    SuppliersQueryParams,
    SuppliersQueryResponse
} from "@/features/supplier/types/supplier.types";
import type { SupplierFormValues } from "@/features/supplier/schemas/supplier.schema";
import { Button } from "@/components/ui/button";
import SupplierCard from "@/features/supplier/components/SupplierCard";
import { Field } from "@/components/ui/field";
import SupplierForm from "@/features/supplier/components/SupplierForm";
import SupplierModal from "@/features/supplier/components/SupplierModal";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatStringToTitleCase } from "@/utils/formatText";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";

interface OpeningHourRow {
    day: SupplierDay;
    openingTime: string;
    closingTime: string;
}

const buildPayload = (
    values: SupplierFormValues,
    openHours: OpeningHourRow[],
): CreateSupplierInput => {
    return {
        name: values.name,
        type: values.type,
        building: values.building,
        floor: values.floor,
        description: values.description,
        address: values.address,
        latitude: values.latitude?.trim() ? Number(values.latitude) : null,
        longitude: values.longitude?.trim() ? Number(values.longitude) : null,
        imageUrl: values.imageUrl ? values.imageUrl : null,
        openingHours: openHours
            .filter(hour => hour.day && hour.openingTime && hour.closingTime)
            .map(hour => ({
                day: hour.day,
                openingTime: hour.openingTime,
                closingTime: hour.closingTime,
            })),
    };
};

const ManageSuppliersPage = () => {
    const queryClient = useQueryClient();
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const [supplierToDeactivate, setSupplierToDeactivate] = useState<Supplier | null>(null);
    const [supplierToActivate, setSupplierToActivate] = useState<Supplier | null>(null);

    // keep the search string and type filter across navigations, matching the /suppliers page
    const [searchString, setSearchString] = useState(() => sessionStorage.getItem("searchString") ?? "");
    const [typeFilter, setTypeFilter] = useState(() => sessionStorage.getItem("typeFilter") ?? "all");
    useEffect(() => {
        sessionStorage.setItem("searchString", searchString);
        sessionStorage.setItem("typeFilter", typeFilter);
    }, [searchString, typeFilter]);

    const suppliersQueryParams: SuppliersQueryParams = {
        page: currentPage,
        searchString: searchString,
        typeFilter: typeFilter
    }

    const suppliersQuery = useQuery<SuppliersQueryResponse, ParsedError>({
        queryKey: ["admin-suppliers", currentPage, searchString, typeFilter],
        queryFn: () => getAllSuppliers(suppliersQueryParams),
        refetchOnMount: "always",
    });

    const suppliers: Supplier[] = suppliersQuery.data?.suppliers ?? [];
    const totalPages: number = suppliersQuery.data?.pagination?.totalPages ?? 0;

    const supplierTypesQuery = useQuery<SupplierType[], ParsedError>({
        queryKey: ["admin-supplier-types"],
        queryFn: () => getAllSupplierTypes(),
        refetchOnMount: "always",
    });

    const suppliersIsLoading = suppliersQuery.isLoading;
    const suppliersIsError = suppliersQuery.isError;
    // Backend returns 400 "No records found for this page" when there is nothing to show.
    const isNoRecords = suppliersIsError && suppliersQuery.error?.statusCode === 400;

    const supplierTypesIsLoading = supplierTypesQuery.isLoading;
    const supplierTypesIsError = supplierTypesQuery.isError;
    const supplierTypes = supplierTypesQuery.data ?? [];

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["admin-suppliers"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["admin-suppliers-total-pages"] });
        queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    };

    const goToPage = (page: number) => {
        if (page < 1 || page > totalPages || page === currentPage) return;
        setCurrentPage(page);
    };

    const handleSearchKeyInput = (event: ChangeEvent<HTMLInputElement>) => {
        setCurrentPage(1); // reset to the first page on any change in search input
        setSearchString(event.target.value);
    };

    const handleFilterInput = (filter: string) => {
        setCurrentPage(1); // reset to the first page on any change in type filter
        setTypeFilter(filter.toUpperCase());
    };

    const createMutation = useMutation({
        mutationFn: createSupplier,
        onSuccess: () => {
            toast.success("Supplier created");
            setIsCreateOpen(false);
            invalidate();
        },
        onError: (error: ParsedError) => {
            toast.error(error.message);
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, input }: { id: string; input: CreateSupplierInput }) =>
            updateSupplier(id, input),
        onSuccess: () => {
            toast.success("Supplier updated");
            setEditingSupplier(null);
            invalidate();
        },
        onError: (error: ParsedError) => {
            toast.error(error.message);
        },
    });

    const deactivateMutation = useMutation({
        mutationFn: deactivateSupplier,
        onSuccess: () => {
            toast.success("Supplier deactivated");
            setSupplierToDeactivate(null);
            invalidate();
        },
        onError: (error: ParsedError) => {
            toast.error(error.message);
        },
    });

    const activateMutation = useMutation({
        mutationFn: activateSupplier,
        onSuccess: () => {
            toast.success("Supplier activated");
            setSupplierToActivate(null);
            invalidate();
        },
        onError: (error: ParsedError) => {
            toast.error(error.message);
        },
    });

    const handleSubmitForm = (values: SupplierFormValues, openHours: OpeningHourRow[]) => {
        const payload = buildPayload(values, openHours);

        if (editingSupplier) {
            updateMutation.mutate({ id: editingSupplier.id, input: payload });
        } else {
            createMutation.mutate(payload);
        }
    };

    return (
        <>
            <div className="flex flex-col gap-4 px-5 md:px-10 py-5">
                <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                    <h1 className="text-xl md:text-2xl font-bold">Manage Suppliers</h1>
                    <SupplierModal
                        open={isCreateOpen}
                        onClose={() => setIsCreateOpen(!isCreateOpen)}
                        title="Create Supplier"
                        icon={<PlusIcon className="stroke-3" />}
                    >
                        <SupplierForm
                            submitLabel="Create Supplier"
                            isPending={createMutation.isPending}
                            onSubmit={handleSubmitForm}
                            onCancel={() => setIsCreateOpen(false)}
                        />
                    </SupplierModal>
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
                                placeholder="Search for a supplier"
                                onChange={handleSearchKeyInput} />
                        </InputGroup>
                    </Field>
                </div>

                {supplierTypesIsLoading && (
                    <Skeleton className="h-8 w-full md:w-1/2 border border-slate-200 rounded-lg" />
                )}

                {supplierTypesIsError && (
                    <p className="text-red-500">
                        Failed to load supplier types: {supplierTypesQuery.error?.message}
                    </p>
                )}

                {!supplierTypesIsLoading && !supplierTypesIsError && supplierTypes.length === 0 && (
                    <p className="text-sm text-muted-foreground">No supplier types yet.</p>
                )}

                {!supplierTypesIsLoading && (
                    <Tabs value={typeFilter} onValueChange={setTypeFilter} className="w-full">
                        <TabsList className="w-fit max-w-full h-full flex flex-nowrap items-center justify-start gap-1 overflow-x-auto overflow-y-hidden">
                            <TabsTrigger value="ALL" onClick={() => handleFilterInput("ALL")}>
                                All
                            </TabsTrigger>

                            {supplierTypes.map((type) => (
                                <TabsTrigger key={type.id} value={type.type} onClick={() => handleFilterInput(type.type)}>
                                    {formatStringToTitleCase(type.type)}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                )}
            </div>

            <div className="px-5 md:px-10 pb-10">
                {suppliersIsLoading && (
                    <div className="flex w-full flex-1 items-center justify-center gap-2 py-16">
                        <Spinner className="size-6" />
                        <span className="text-muted-foreground">Loading suppliers...</span>
                    </div>
                )}

                {suppliersIsError && !isNoRecords && (
                    <p className="text-red-500">
                        Failed to load suppliers: {suppliersQuery.error.message}
                    </p>
                )}

                {!suppliersIsLoading &&
                    (isNoRecords || (!suppliersIsError && suppliers.length === 0)) && (
                        <p className="text-muted-foreground">
                            {searchString || typeFilter !== "all"
                                ? "No suppliers match the current search and filter."
                                : (
                                    <>
                                        No suppliers yet.
                                        <br />
                                        Click “Create Supplier” to add one.
                                    </>
                                )}
                        </p>
                    )}

                {suppliers.length > 0 && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {suppliers.map(supplier => (
                                <SupplierCard
                                    key={supplier.id}
                                    supplier={supplier}
                                    onEdit={() => setEditingSupplier(supplier)}
                                    onDeactivate={() => setSupplierToDeactivate(supplier)}
                                    onActivate={() => setSupplierToActivate(supplier)}
                                />
                            ))}
                        </div>

                        {totalPages > 1 && !suppliersQuery.isLoading && (
                            <Pagination className="p-2 border rounded-xl w-fit shadow-sm border-slate-200 bg-white">
                                <PaginationContent>
                                    {currentPage > 1 && (
                                        <PaginationItem>
                                            <PaginationPrevious
                                                href="#"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    goToPage(currentPage - 1);
                                                }}
                                            />
                                        </PaginationItem>
                                    )}
                                    {Array.from({ length: totalPages }, (_, i) => (
                                        <PaginationItem key={i}>
                                            <PaginationLink
                                                href="#"
                                                isActive={currentPage === i + 1}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    goToPage(i + 1);
                                                }}
                                            >
                                                {i + 1}
                                            </PaginationLink>
                                        </PaginationItem>
                                    ))}
                                    {currentPage < totalPages && (
                                        <PaginationItem>
                                            <PaginationNext
                                                href="#"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    goToPage(currentPage + 1);
                                                }}
                                            />
                                        </PaginationItem>
                                    )}
                                </PaginationContent>
                            </Pagination>
                        )}

                        {suppliersQuery.isLoading && totalPages > 1 && (
                            <p className="text-center text-sm text-muted-foreground">
                                Loading pagination...
                            </p>
                        )}
                    </div>
                )}
            </div>

            {editingSupplier && (
                <SupplierModal
                    open={true}
                    onClose={() => setEditingSupplier(null)}
                    title="Edit Supplier"
                >
                    <SupplierForm
                        initialData={editingSupplier}
                        submitLabel="Save Changes"
                        isPending={updateMutation.isPending}
                        onSubmit={handleSubmitForm}
                        onCancel={() => setEditingSupplier(null)}
                    />
                </SupplierModal>
            )}

            {supplierToActivate && (
                <SupplierModal
                    open={true}
                    onClose={() => { if (!activateMutation.isPending) setSupplierToActivate(null); }}
                    title="Activate Supplier"
                >
                    <div className="flex flex-col gap-4">
                        <p className="text-sm">
                            Activate <span className="font-medium">{supplierToActivate.name}</span>?
                            {" "}This supplier will be available for new errand requests again.
                        </p>
                        <div className="flex justify-end gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                disabled={activateMutation.isPending}
                                onClick={() => setSupplierToActivate(null)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                variant="green"
                                isLoading={activateMutation.isPending}
                                onClick={() => activateMutation.mutate(supplierToActivate.id)}
                            >
                                Activate supplier
                            </Button>
                        </div>
                    </div>
                </SupplierModal>
            )}

            {supplierToDeactivate && (
                <SupplierModal
                    open={true}
                    onClose={() => setSupplierToDeactivate(null)}
                    title="Deactivate Supplier"
                >
                    <DeactivateModal
                        supplier={supplierToDeactivate}
                        isPending={deactivateMutation.isPending}
                        onConfirm={() => deactivateMutation.mutate(supplierToDeactivate.id)}
                        onCancel={() => setSupplierToDeactivate(null)}
                    />
                </SupplierModal>
            )}
        </>
    );
};

export default ManageSuppliersPage;

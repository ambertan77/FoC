import React, { useState, useEffect } from 'react';
import { useQuery } from "@tanstack/react-query";
import type { ParsedError } from "@/utils/errorHandler";
import { getActiveSuppliers, getAllSupplierTypes, } from "@/features/supplier/services/supplier.service";
import type { Supplier, SupplierType, SuppliersQueryParams, SuppliersQueryResponse } from "@/features/supplier/types/supplier.types";
import SupplierCard from "@/features/supplier/components/SupplierCard";
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext, PaginationLink } from "@/components/ui/pagination";
import { Field } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { SearchIcon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatStringToTitleCase } from '@/utils/formatText';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

const SupplierPage = () => {
    // does not use URL-based page number, similar to ManageSuppliersPage.tsx
    const [currentPage, setCurrentPage] = useState<number>(1);

    // ensure the search string and type filters are saved to session storage
    // so that filters are still present when navigating between pages
    const [searchString, setSearchString] = useState(() => sessionStorage.getItem("searchString") ?? "");
    const [typeFilter, setTypeFilter] = useState(() => sessionStorage.getItem("typeFilter") ?? "all"); // default to viewing all types of suppliers
    useEffect(() => {
        sessionStorage.setItem("searchString", searchString);
        sessionStorage.setItem("typeFilter", typeFilter);
    }, [searchString, typeFilter]);

    const handleSearchKeyInput = (event: React.ChangeEvent<HTMLInputElement>) => {
        console.log(searchString)
        setCurrentPage(1); // reset the page to be 1 upon any change in search input
        setSearchString(event.target.value);
    }
    const handleFilterInput = (filter: string) => {
        setCurrentPage(1); // reset the page to be 1 upon any change in type filter used
        setTypeFilter(filter.toUpperCase());
    }

    const getSuppliersParams: SuppliersQueryParams = {
        page: currentPage,
        searchString: searchString,
        typeFilter: typeFilter
    };

    const suppliersQuery = useQuery<SuppliersQueryResponse, ParsedError>({
        queryKey: ["suppliers", currentPage, searchString, typeFilter],
        queryFn: () => getActiveSuppliers(getSuppliersParams),
        refetchOnMount: "always",
    });

    const supplierTypesQuery = useQuery<SupplierType[], ParsedError>({
        queryKey: ["get-supplier-types"],
        queryFn: () => getAllSupplierTypes(),
        refetchOnMount: "always",
    });

    const suppliersIsLoading = suppliersQuery.isLoading;
    const suppliersIsError = suppliersQuery.isError;
    const suppliers: Supplier[] = suppliersQuery.data?.suppliers ?? [];
    const totalNumberOfPages: number = suppliersQuery.data?.pagination?.totalPages ?? 0;

    const supplierTypesIsLoading = supplierTypesQuery.isLoading;
    const supplierTypesIsError = supplierTypesQuery.isError;
    const supplierTypes = supplierTypesQuery.data ?? [];

    return (
        <>
            <div className="flex flex-col px-5 md:px-10 py-5 gap-4">
                <h1 className="text-xl md:text-2xl font-bold">Suppliers</h1>
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
                        Failed to load supplier types: {supplierTypesQuery.error.message}
                    </p>
                )}

                {!supplierTypesIsLoading && !supplierTypesIsError && supplierTypes.length === 0 && (
                    <p className="text-sm text-muted-foreground">No supplier types yet.</p>
                )}

                {!supplierTypesIsLoading && !supplierTypesIsError && (
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
                    <div className="flex w-full flex-1 items-center justify-center gap-2 py-16 text-muted-foreground">
                        <Spinner className="size-6" />
                        <span>Loading suppliers...</span>
                    </div>
                )}

                {suppliersIsError && (
                    <p className="text-red-500">
                        Failed to load suppliers: {suppliersQuery.error.message}
                    </p>
                )}

                {!suppliersIsLoading && !suppliersIsError && suppliers.length === 0 && (
                    <p className="text-muted-foreground">No suppliers yet.</p>
                )}

                <div className="w-full flex flex-col gap-6">
                    {suppliers.length > 0 && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {suppliers.map(supplier => (
                                <SupplierCard key={supplier.id} supplier={supplier} />
                            ))}
                        </div>
                    )}

                    {!suppliersQuery.isLoading && totalNumberOfPages > 1 && (
                        <Pagination className="p-2 border rounded-xl w-fit shadow-sm border-slate-200 bg-white">
                            <PaginationContent>
                                {currentPage > 1 && (
                                    <PaginationItem>
                                        <PaginationPrevious
                                            href="#"
                                            onClick={(e) => { e.preventDefault(); setCurrentPage(Math.max(currentPage - 1, 1)); }}
                                        />
                                    </PaginationItem>
                                )}
                                {Array.from({ length: totalNumberOfPages }, (_, i) => (
                                    <PaginationItem key={i}>
                                        <PaginationLink
                                            href="#"
                                            isActive={currentPage === i + 1}
                                            onClick={(e) => { e.preventDefault(); setCurrentPage(i + 1); }}
                                        >
                                            {i + 1}
                                        </PaginationLink>
                                    </PaginationItem>
                                ))}
                                {currentPage < totalNumberOfPages && (
                                    <PaginationItem>
                                        <PaginationNext
                                            href="#"
                                            onClick={(e) => { e.preventDefault(); setCurrentPage(Math.min(currentPage + 1, totalNumberOfPages)); }}
                                        />
                                    </PaginationItem>
                                )}
                            </PaginationContent>
                        </Pagination>
                    )}
                </div>
            </div>
        </>
    );
};

export default SupplierPage;

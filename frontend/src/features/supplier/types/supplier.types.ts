// Supplier
export type SupplierDay =
    | "MONDAY"
    | "TUESDAY"
    | "WEDNESDAY"
    | "THURSDAY"
    | "FRIDAY"
    | "SATURDAY"
    | "SUNDAY";

export type SupplierStatus = "ACTIVATED" | "DEACTIVATED";

export interface SupplierOpeningHours {
    id: string;
    supplierId: string;
    day: SupplierDay;
    openingTime: string;
    closingTime: string;
}

export interface Supplier {
    id: string;
    name: string;
    type: string;
    status: SupplierStatus;
    building: string;
    floor: string;
    description: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    imageUrl: string | null;
    createdAt: string;
    updatedAt: string;
    openingHours: SupplierOpeningHours[];
}

export interface SupplierType {
    id: string;
    type: string;
}

export interface SupplierTypeCount {
    id: string;
    type: string;
    count: number;
}

export interface CreateSupplierInput {
    name: string;
    type: string;
    building: string;
    floor: string;
    description: string;
    address: string;
    latitude?: number | null;
    longitude?: number | null;
    imageUrl?: string | null;
    openingHours?: Array<{ day: SupplierDay; openingTime: string; closingTime: string }>;
}

export type UpdateSupplierInput = Partial<CreateSupplierInput>;

export type SuppliersQueryParams = {
    status?: SupplierStatus | undefined;
    page?: number;
    searchString?: string;
    typeFilter?: string;
};

export type SuppliersQueryResponse = {
    suppliers: Supplier[];
    paginated: boolean;
    pagination: {
        limit?: number;
        page?: number;
        totalCount: number;
        totalPages?: number;
    }
}
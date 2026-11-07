import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ORDER_STATUS_CATEGORIES, type OrderStatusCategory } from "@/features/order/types/order.types";
import AdminOrderDashboardCard from "@/features/order/components/AdminOrderDashboardCard";
import { formatStringToTitleCase } from "@/utils/formatText";

const ManageOrdersPage = () => {
    const [selectedCategory, setSelectedCategory] = useState<OrderStatusCategory>("ALL");

    const handleCategoryChange = (value: string) => {
            setSelectedCategory(value as OrderStatusCategory);
            // setPage(1);
        };

    return (
        <>
            <div className="flex flex-col items-start justify-center gap-5 px-5 md:px-10 py-5 w-full">
                <Tabs value={selectedCategory} onValueChange={handleCategoryChange} className="w-full">
                    <TabsList className="w-fit max-w-full h-full flex flex-nowrap items-center justify-start gap-1 overflow-x-auto overflow-y-hidden">
                        {ORDER_STATUS_CATEGORIES.map((category) => (
                            <TabsTrigger key={category} value={category}>
                                {formatStringToTitleCase(category)}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                <div className="flex flex-col items-start justify-center gap-5">
                    <AdminOrderDashboardCard selectedCategory={selectedCategory} />
                </div>
            </div>
        </>
    );
};

export default ManageOrdersPage;
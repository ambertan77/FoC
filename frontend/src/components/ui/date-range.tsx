// AI Assistance Disclosure:
// Tool: Claude Code (Opus 5.5)
// Date: 2026-11-06
// Scope: Refactored shadcn/ui Range Picker code to use props passed in from AdminOrderDashboardCard.tsx. 
// Author review: Reviewed, tested, and edited by Amber Tan Junning.

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DatePickerWithRangeProps = {
    startDate: Date | undefined;
    endDate: Date | undefined;
    onChange: (startDate: Date | undefined, endDate: Date | undefined) => void;
    className?: string;
}

export function DatePickerWithRange({ startDate, endDate, onChange, className }: DatePickerWithRangeProps) {
    const clearSelection = () => {
        onChange(undefined, undefined); // unselect both startDate and endDate
    }

    return (
        <Field className={cn("w-60", className)}>
            <Popover>
                <PopoverTrigger render={<Button variant="outline" className="justify-start px-2.5 font-normal bg-white">
                    <CalendarIcon className={cn((!startDate || !endDate) && "text-muted-foreground", className)} data-icon="inline-start" />
                        {startDate ? (
                        endDate ? (
                        <>
                            {format(startDate, "LLL dd, y")} -{" "}
                            {format(endDate, "LLL dd, y")}
                        </>
                        ) : (
                        format(startDate, "LLL dd, y")
                        )
                    ) : (
                        <span className={cn((!startDate || !endDate) && "text-muted-foreground", className)}>Pick a date range</span>
                    )}
                </Button>} />
                <PopoverContent className="w-auto p-3" align="start">
                    <Calendar
                        mode="range"
                        defaultMonth={startDate}
                        selected={{ from: startDate, to: endDate }}
                        onSelect={(range) => onChange(range?.from, range?.to)}
                        numberOfMonths={2}
                    />

                    <Button onClick={clearSelection} className="w-fit" variant="indigo">
                        Clear Selection
                    </Button>
                </PopoverContent>
            </Popover>
        </Field>
    )
}

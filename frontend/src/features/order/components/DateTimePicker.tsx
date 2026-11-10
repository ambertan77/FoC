// AI Assistance Disclosure:
// Tool: ChatGPT (5.6 Luna)
// Date: approx. 2026-10-12
// Scope: Adjusted the date-time picker popover content width relative to its trigger element.
// Author review: Reviewed, tested, and edited by Ng See Pui.

import { format, parse } from "date-fns";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CalendarIcon } from "lucide-react";

interface DateTimePickerProps {
    value: string;
    isInvalid?: boolean;
    onChange: (value: string) => void;
    onBlur?: () => void;
    placeholder?: string;
    disabled?: boolean;
}

const parseDateTime = (value: string): Date | undefined => {
    if (!value) return undefined;

    const parsed = parse(value, "yyyy-MM-dd'T'HH:mm", new Date());

    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const DateTimePicker = ({
    value,
    isInvalid,
    onChange,
    onBlur,
    placeholder = "Select completion deadline",
    disabled = false,
}: DateTimePickerProps) => {
    const [isOpen, setIsOpen] = useState(false);

    const date = parseDateTime(value);
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = Array.from({ length: 60 }, (_, i) => i);

    const updateDate = (newDate: Date) => {
        onChange(format(newDate, "yyyy-MM-dd'T'HH:mm"));
    };

    const handleDateSelect = (selectedDate: Date | undefined) => {
        if (!selectedDate) return;

        const newDate = date ? new Date(date) : new Date();

        newDate.setFullYear(
            selectedDate.getFullYear(),
            selectedDate.getMonth(),
            selectedDate.getDate(),
        );

        updateDate(newDate);
    };

    const handleTimeChange = (
        type: "hour" | "minute",
        selectedValue: number,
    ) => {
        const newDate = date ? new Date(date) : new Date();

        if (type === "hour") {
            newDate.setHours(selectedValue);
        } else {
            newDate.setMinutes(selectedValue);
        }

        updateDate(newDate);
    };

    return (
        <Popover
            open={isOpen}
            onOpenChange={open => {
                setIsOpen(open);
                if (!open) onBlur?.();
            }}
        >
            <PopoverTrigger render={
                <Button
                    type="button"
                    variant="input"
                    disabled={disabled}
                    aria-invalid={isInvalid}
                    className={cn(
                        "w-full min-w-0 justify-between text-left font-normal",
                        !date && "text-muted-foreground",
                    )}
                >
                    <span className="truncate">
                        {date
                            ? format(date, "dd/MM/yyyy HH:mm")
                            : placeholder}
                    </span>
                    <CalendarIcon className="ml-2 h-4 w-4 shrink-0" />
                </Button>
            } />

            <PopoverContent
                align="start"
                className="w-[var(--anchor-width)] min-w-[var(--anchor-width)] max-w-[var(--anchor-width)] overflow-hidden p-0"
            >
                <div className="flex flex-col">
                    <div className="flex justify-center border-b">
                        <ScrollArea className="h-40 lg:h-full">
                            <Calendar
                                mode="single"
                                selected={date}
                                onSelect={handleDateSelect}
                            />
                        </ScrollArea>
                    </div>

                    <div className="grid grid-cols-2 divide-x">
                        <div className="min-w-0">
                            <p className="p-2 text-center text-sm font-medium">
                                Hour
                            </p>
                            <ScrollArea className="h-20 lg:h-32">
                                <div className="grid grid-cols-4 gap-1 p-2">
                                    {hours.map(hour => (
                                        <Button
                                            key={hour}
                                            type="button"
                                            size="sm"
                                            variant={
                                                date?.getHours() === hour
                                                    ? "default"
                                                    : "ghost"
                                            }
                                            className="min-w-0 px-1"
                                            onClick={() =>
                                                handleTimeChange("hour", hour)
                                            }
                                        >
                                            {hour.toString().padStart(2, "0")}
                                        </Button>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>

                        <div className="min-w-0">
                            <p className="p-2 text-center text-sm font-medium">
                                Minute
                            </p>
                            <ScrollArea className="h-20 lg:h-32">
                                <div className="grid grid-cols-3 gap-1 p-2">
                                    {minutes.map(minute => (
                                        <Button
                                            key={minute}
                                            type="button"
                                            size="sm"
                                            variant={
                                                date?.getMinutes() === minute
                                                    ? "default"
                                                    : "ghost"
                                            }
                                            className="min-w-0 px-1"
                                            onClick={() =>
                                                handleTimeChange(
                                                    "minute",
                                                    minute,
                                                )
                                            }
                                        >
                                            {minute.toString().padStart(2, "0")}
                                        </Button>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>

                    <div className="flex justify-end border-t p-2">
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => setIsOpen(false)}
                        >
                            Done
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

export default DateTimePicker;
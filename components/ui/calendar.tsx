import * as React from "react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const captionLayout = (props as { captionLayout?: string }).captionLayout ?? "buttons";
  const isDropdown = captionLayout.startsWith("dropdown");

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: "w-fit",
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        month_caption: "flex justify-center pt-1 relative items-center",
        caption_label: cn("text-sm font-medium text-slate-900", isDropdown && "sr-only"),
        nav: "space-x-1 flex items-center",
        button_previous: cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-1",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-1",
        ),

        dropdowns: "flex items-center justify-center gap-2",
        dropdown_root: "relative inline-flex items-center",
        dropdown: cn(
          "appearance-none rounded-md border border-slate-200 bg-white px-2 py-1 pr-8 text-sm font-medium text-slate-900 shadow-sm",
          "focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2",
        ),
        chevron: "absolute right-2 h-4 w-4 text-slate-500",

        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday: "text-slate-500 rounded-md w-9 font-normal text-[0.8rem]",
        weeks: "flex flex-col",
        week: "flex w-full mt-2",
        day: "h-9 w-9 p-0 text-center text-sm relative",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal text-inherit aria-selected:opacity-100",
        ),

        selected: "bg-slate-900 text-white rounded-md",
        today: "bg-slate-100 text-slate-900 rounded-md",
        outside: "text-slate-400 opacity-50",
        disabled: "text-slate-300 opacity-50",
        range_middle: "bg-slate-100 text-slate-900",
        range_start: "bg-slate-900 text-white rounded-md",
        range_end: "bg-slate-900 text-white rounded-md",
        hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  );
}

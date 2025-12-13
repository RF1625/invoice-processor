"use client";

import * as React from "react";
import { parse } from "date-fns";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type DatePickerProps = {
  id?: string;
  value: string | null;
  onChange: (next: string | null) => void;
  placeholder?: string;
  className?: string;
};

const parseYmd = (ymd: string) => {
  const d = parse(ymd, "yyyy-MM-dd", new Date());
  return Number.isFinite(d.getTime()) ? d : null;
};

export function DatePicker({ id, value, onChange, placeholder = "Select date", className }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? parseYmd(value) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          className={cn("w-full justify-between font-normal", !selected && "text-slate-500", className)}
        >
          {selected ? selected.toLocaleDateString() : placeholder}
          <ChevronDownIcon className="h-4 w-4 text-slate-600" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          selected={selected ?? undefined}
          captionLayout="dropdown"
          onSelect={(d) => {
            if (!d) {
              onChange(null);
              return;
            }
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            onChange(`${yyyy}-${mm}-${dd}`);
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

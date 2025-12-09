'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChevronLeft, ChevronRight, CalendarIcon } from 'lucide-react';
import { format, addDays, subDays, parseISO } from 'date-fns';

interface RunSheetDateNavProps {
  selectedDate: string; // YYYY-MM-DD
  availableDates: string[]; // Dates that have run sheets
  onDateChange: (date: string) => void;
}

export function RunSheetDateNav({
  selectedDate,
  availableDates,
  onDateChange,
}: RunSheetDateNavProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const currentDate = parseISO(selectedDate);

  const handlePrevDay = () => {
    const prev = subDays(currentDate, 1);
    onDateChange(format(prev, 'yyyy-MM-dd'));
  };

  const handleNextDay = () => {
    const next = addDays(currentDate, 1);
    onDateChange(format(next, 'yyyy-MM-dd'));
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      onDateChange(format(date, 'yyyy-MM-dd'));
      setCalendarOpen(false);
    }
  };

  // Convert available dates to Date objects for modifiers
  const availableDateObjects = availableDates.map((d) => parseISO(d));

  return (
    <div className="flex items-center justify-between">
      <Button variant="ghost" size="icon" onClick={handlePrevDay}>
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2">
            <span className="font-medium">
              {format(currentDate, 'EEE, d MMM yyyy')}
            </span>
            <CalendarIcon className="w-4 h-4 text-gray-500" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <Calendar
            mode="single"
            selected={currentDate}
            onSelect={handleCalendarSelect}
            modifiers={{
              hasRunSheet: availableDateObjects,
            }}
            modifiersStyles={{
              hasRunSheet: {
                fontWeight: 'bold',
                textDecoration: 'underline',
              },
            }}
          />
        </PopoverContent>
      </Popover>

      <Button variant="ghost" size="icon" onClick={handleNextDay}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

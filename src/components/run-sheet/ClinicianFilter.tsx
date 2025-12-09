'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Clinician {
  id: string;
  name: string;
}

interface ClinicianFilterProps {
  clinicians: Clinician[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function ClinicianFilter({
  clinicians,
  selectedId,
  onSelect,
}: ClinicianFilterProps) {
  return (
    <Select value={selectedId} onValueChange={onSelect}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select clinician" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Clinicians</SelectItem>
        {clinicians.map((clinician) => (
          <SelectItem key={clinician.id} value={clinician.id}>
            {clinician.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

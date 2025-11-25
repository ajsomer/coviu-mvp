'use client';

import { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface Specialist {
  id: string;
  name: string;
  specialty: string;
}

interface Filters {
  specialistId?: string;
  status?: string;
  priority?: string;
  search?: string;
}

interface RequestFiltersProps {
  onFilterChange: (filters: Filters) => void;
}

export function RequestFilters({ onFilterChange }: RequestFiltersProps) {
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [filters, setFilters] = useState<Filters>({});

  useEffect(() => {
    fetch('/api/specialists')
      .then(res => res.json())
      .then(data => setSpecialists(data.data || []));
  }, []);

  const updateFilter = (key: keyof Filters, value: string) => {
    const newFilters = {
      ...filters,
      [key]: value === 'all' ? undefined : value,
    };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  return (
    <div className="flex flex-wrap gap-4 mb-6">
      {/* Search */}
      <div className="flex-1 min-w-[200px]">
        <Input
          placeholder="Search by patient name..."
          onChange={(e) => updateFilter('search', e.target.value)}
        />
      </div>

      {/* Specialist filter */}
      <Select onValueChange={(value) => updateFilter('specialistId', value)}>
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Filter by Doctor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Doctors</SelectItem>
          {specialists.map((specialist) => (
            <SelectItem key={specialist.id} value={specialist.id}>
              {specialist.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status filter */}
      <Select onValueChange={(value) => updateFilter('status', value)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filter by Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="in_review">In Review</SelectItem>
          <SelectItem value="contacted">Contacted</SelectItem>
          <SelectItem value="scheduled">Scheduled</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>

      {/* Priority filter */}
      <Select onValueChange={(value) => updateFilter('priority', value)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filter by Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priorities</SelectItem>
          <SelectItem value="urgent">Urgent</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="normal">Normal</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { RequestFilters } from '@/components/dashboard/request-filters';
import { RequestTable } from '@/components/dashboard/request-table';

interface Filters {
  specialistId?: string;
  status?: string;
  priority?: string;
  search?: string;
}

export default function DashboardPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  });

  const fetchRequests = useCallback(async (filters: Filters = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.specialistId) params.set('specialistId', filters.specialistId);
      if (filters.status) params.set('status', filters.status);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.search) params.set('search', filters.search);

      const response = await fetch(`/api/appointments?${params.toString()}`);
      const data = await response.json();

      setRequests(data.data || []);
      setPagination(data.pagination || pagination);
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleFilterChange = (filters: Filters) => {
    fetchRequests(filters);
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Appointment Requests</h1>
        <p className="text-gray-600 mt-1">
          Manage and triage incoming appointment requests
        </p>
      </div>

      <RequestFilters onFilterChange={handleFilterChange} />

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading requests...</p>
        </div>
      ) : (
        <>
          <RequestTable requests={requests} />
          {pagination.total > 0 && (
            <div className="mt-4 text-sm text-gray-500 text-center">
              Showing {requests.length} of {pagination.total} requests
            </div>
          )}
        </>
      )}
    </div>
  );
}

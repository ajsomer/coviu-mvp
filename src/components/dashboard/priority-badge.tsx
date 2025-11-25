import { Badge } from '@/components/ui/badge';

const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: 'Low', className: 'bg-gray-100 text-gray-800 hover:bg-gray-100' },
  normal: { label: 'Normal', className: 'bg-blue-100 text-blue-800 hover:bg-blue-100' },
  high: { label: 'High', className: 'bg-orange-100 text-orange-800 hover:bg-orange-100' },
  urgent: { label: 'Urgent', className: 'bg-red-100 text-red-800 hover:bg-red-100' },
};

export function PriorityBadge({ priority }: { priority: string }) {
  const config = priorityConfig[priority] || { label: priority, className: '' };

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

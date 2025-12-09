import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

interface EmptyStateProps {
  compact?: boolean;
}

export function EmptyState({ compact = false }: EmptyStateProps) {
  if (compact) {
    return (
      <div className="text-center py-6">
        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-600 mb-3">No run sheet for this day</p>
        <Link href="/run-sheet/upload">
          <Button size="sm">
            <Upload className="w-3 h-3 mr-1" />
            Upload
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        No Run Sheet for Today
      </h3>
      <p className="text-gray-600 mb-6 max-w-md mx-auto">
        Upload screenshots of your PMS appointment schedule to automatically generate today&apos;s run sheet.
      </p>
      <Link href="/run-sheet/upload">
        <Button>
          <Upload className="w-4 h-4 mr-2" />
          Upload Screenshots
        </Button>
      </Link>
    </div>
  );
}

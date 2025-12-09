'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export interface Column {
  id: string;
  clinicianName: string | null;
  xStartPercent: number;
  xEndPercent: number;
  isTimeColumn?: boolean;
}

interface ColumnSelectorProps {
  imageUrl: string;
  columns: Column[];
  timeColumn: Column | null;
  onColumnsChange: (columns: Column[]) => void;
  onTimeColumnChange: (timeColumn: Column | null) => void;
  onConfirm: (selectedColumnIds: string[], timeColumn: Column | null) => void;
  onCancel: () => void;
  isProcessing?: boolean;
}

export function ColumnSelector({
  imageUrl,
  columns,
  timeColumn,
  onColumnsChange,
  onTimeColumnChange,
  onConfirm,
  onCancel,
  isProcessing = false,
}: ColumnSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(columns.map((c) => c.id))
  );
  const [timeColumnEnabled, setTimeColumnEnabled] = useState<boolean>(
    timeColumn !== null
  );
  const [dragState, setDragState] = useState<{
    columnId: string;
    edge: 'start' | 'end';
    isTimeColumn?: boolean;
  } | null>(null);

  // Toggle column selection
  const toggleColumn = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle time column
  const toggleTimeColumn = () => {
    setTimeColumnEnabled((prev) => !prev);
  };

  // Handle drag start on column edge
  const handleMouseDown = (
    e: React.MouseEvent,
    columnId: string,
    edge: 'start' | 'end',
    isTimeCol?: boolean
  ) => {
    e.preventDefault();
    setDragState({ columnId, edge, isTimeColumn: isTimeCol });
  };

  // Handle drag move
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragState || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));

      // Handle time column drag
      if (dragState.isTimeColumn && timeColumn) {
        const updatedTimeColumn = { ...timeColumn };
        if (dragState.edge === 'start') {
          updatedTimeColumn.xStartPercent = Math.min(percent, timeColumn.xEndPercent - 2);
        } else {
          updatedTimeColumn.xEndPercent = Math.max(percent, timeColumn.xStartPercent + 2);
        }
        onTimeColumnChange(updatedTimeColumn);
        return;
      }

      onColumnsChange(
        columns.map((col) => {
          if (col.id !== dragState.columnId) return col;

          if (dragState.edge === 'start') {
            // Don't let start go past end
            return {
              ...col,
              xStartPercent: Math.min(percent, col.xEndPercent - 5),
            };
          } else {
            // Don't let end go before start
            return {
              ...col,
              xEndPercent: Math.max(percent, col.xStartPercent + 5),
            };
          }
        })
      );
    },
    [dragState, columns, timeColumn, onColumnsChange, onTimeColumnChange]
  );

  // Handle drag end
  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  // Add/remove event listeners for drag
  useEffect(() => {
    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState, handleMouseMove, handleMouseUp]);

  const handleConfirm = () => {
    onConfirm(Array.from(selectedIds), timeColumnEnabled ? timeColumn : null);
  };

  // Colors for different columns
  const columnColors = [
    'bg-blue-500/30 border-blue-500',
    'bg-green-500/30 border-green-500',
    'bg-purple-500/30 border-purple-500',
    'bg-orange-500/30 border-orange-500',
    'bg-pink-500/30 border-pink-500',
  ];

  const timeColumnColor = 'bg-yellow-500/30 border-yellow-500';

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600">
        <p className="font-medium mb-1">Detected {columns.length} column(s)</p>
        <p>
          Select which columns to process. Drag the edges to adjust boundaries if
          needed.
        </p>
      </div>

      {/* Time column checkbox */}
      {timeColumn && (
        <div className="border-b pb-4">
          <label
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-colors w-fit',
              timeColumnEnabled
                ? timeColumnColor
                : 'border-gray-200 bg-gray-50'
            )}
          >
            <Checkbox
              checked={timeColumnEnabled}
              onCheckedChange={toggleTimeColumn}
            />
            <span className="text-sm font-medium">Time Column</span>
            <span className="text-xs text-gray-500">(for appointment times)</span>
          </label>
        </div>
      )}

      {/* Column checkboxes */}
      <div className="flex flex-wrap gap-4">
        {columns.map((col, index) => (
          <label
            key={col.id}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-colors',
              selectedIds.has(col.id)
                ? columnColors[index % columnColors.length]
                : 'border-gray-200 bg-gray-50'
            )}
          >
            <Checkbox
              checked={selectedIds.has(col.id)}
              onCheckedChange={() => toggleColumn(col.id)}
            />
            <span className="text-sm font-medium">
              {col.clinicianName || `Column ${index + 1}`}
            </span>
          </label>
        ))}
      </div>

      {/* Image with column overlays */}
      <div
        ref={containerRef}
        className="relative border rounded-lg overflow-hidden select-none"
        style={{ cursor: dragState ? 'col-resize' : 'default' }}
      >
        <img src={imageUrl} alt="Screenshot" className="w-full" draggable={false} />

        {/* Time column overlay */}
        {timeColumn && timeColumnEnabled && (
          <div
            className={cn(
              'absolute top-0 bottom-0 border-x-2 transition-opacity',
              timeColumnColor
            )}
            style={{
              left: `${timeColumn.xStartPercent}%`,
              width: `${timeColumn.xEndPercent - timeColumn.xStartPercent}%`,
            }}
          >
            {/* Time column label */}
            <div className="absolute top-2 left-2 px-2 py-1 rounded text-xs font-medium text-white bg-yellow-500">
              Time
            </div>

            {/* Drag handles */}
            <>
              {/* Left edge handle */}
              <div
                className="absolute top-0 bottom-0 left-0 w-3 cursor-col-resize hover:bg-white/50 flex items-center justify-center"
                onMouseDown={(e) => handleMouseDown(e, timeColumn.id, 'start', true)}
              >
                <div className="w-1 h-8 bg-white rounded-full shadow" />
              </div>

              {/* Right edge handle */}
              <div
                className="absolute top-0 bottom-0 right-0 w-3 cursor-col-resize hover:bg-white/50 flex items-center justify-center"
                onMouseDown={(e) => handleMouseDown(e, timeColumn.id, 'end', true)}
              >
                <div className="w-1 h-8 bg-white rounded-full shadow" />
              </div>
            </>
          </div>
        )}

        {/* Column overlays */}
        {columns.map((col, index) => {
          const isSelected = selectedIds.has(col.id);
          const colorClass = columnColors[index % columnColors.length];

          return (
            <div
              key={col.id}
              className={cn(
                'absolute top-0 bottom-0 border-x-2 transition-opacity',
                isSelected ? colorClass : 'bg-gray-500/10 border-gray-400',
                !isSelected && 'opacity-50'
              )}
              style={{
                left: `${col.xStartPercent}%`,
                width: `${col.xEndPercent - col.xStartPercent}%`,
              }}
            >
              {/* Column label */}
              <div
                className={cn(
                  'absolute top-2 left-2 px-2 py-1 rounded text-xs font-medium text-white',
                  isSelected
                    ? colorClass.split(' ')[0].replace('/30', '')
                    : 'bg-gray-500'
                )}
              >
                {col.clinicianName || `Column ${index + 1}`}
              </div>

              {/* Drag handles */}
              {isSelected && (
                <>
                  {/* Left edge handle */}
                  <div
                    className="absolute top-0 bottom-0 left-0 w-3 cursor-col-resize hover:bg-white/50 flex items-center justify-center"
                    onMouseDown={(e) => handleMouseDown(e, col.id, 'start')}
                  >
                    <div className="w-1 h-8 bg-white rounded-full shadow" />
                  </div>

                  {/* Right edge handle */}
                  <div
                    className="absolute top-0 bottom-0 right-0 w-3 cursor-col-resize hover:bg-white/50 flex items-center justify-center"
                    onMouseDown={(e) => handleMouseDown(e, col.id, 'end')}
                  >
                    <div className="w-1 h-8 bg-white rounded-full shadow" />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel} disabled={isProcessing}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={selectedIds.size === 0 || isProcessing}
        >
          {isProcessing
            ? 'Processing...'
            : `Process ${selectedIds.size} Column${selectedIds.size !== 1 ? 's' : ''}`}
        </Button>
      </div>
    </div>
  );
}

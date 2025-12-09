'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ColumnSelector, Column } from '@/components/run-sheet/ColumnSelector';
import { Loader2 } from 'lucide-react';

type UploadStep = 'upload' | 'detecting' | 'select-columns' | 'processing';

interface ProcessedColumn {
  id: string;
  clinicianName: string | null;
  appointmentCount: number;
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<UploadStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [timeColumn, setTimeColumn] = useState<Column | null>(null);
  const [isCalendarView, setIsCalendarView] = useState(false);
  const [processedColumns, setProcessedColumns] = useState<ProcessedColumn[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setImageUrl(URL.createObjectURL(file));
    setError(null);
    setStep('detecting');

    try {
      // Call column detection API
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/run-sheet/detect-columns', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to detect columns');
      }

      const data = await response.json();

      setColumns(
        data.columns.map((col: Column) => ({
          ...col,
          // Ensure we have valid percentages
          xStartPercent: col.xStartPercent || 0,
          xEndPercent: col.xEndPercent || 100,
        }))
      );
      // Set time column if detected
      if (data.timeColumn) {
        setTimeColumn({
          ...data.timeColumn,
          xStartPercent: data.timeColumn.xStartPercent || 0,
          xEndPercent: data.timeColumn.xEndPercent || 10,
        });
      } else {
        setTimeColumn(null);
      }
      setIsCalendarView(data.isCalendarView);
      setStep('select-columns');
    } catch (err) {
      console.error('Error detecting columns:', err);
      setError('Failed to analyze screenshot. Please try again.');
      setStep('upload');
    }
  };

  const handleColumnsChange = (updatedColumns: Column[]) => {
    setColumns(updatedColumns);
  };

  const handleTimeColumnChange = (updatedTimeColumn: Column | null) => {
    setTimeColumn(updatedTimeColumn);
  };

  const handleConfirmColumns = async (selectedColumnIds: string[], selectedTimeColumn: Column | null) => {
    if (!selectedFile || selectedColumnIds.length === 0) return;

    setStep('processing');
    setError(null);

    try {
      const selectedColumns = columns.filter((c) => selectedColumnIds.includes(c.id));
      const results: ProcessedColumn[] = [];

      // First, extract time data from time column if selected
      let timeData: string | null = null;
      if (selectedTimeColumn) {
        const timeColumnBlob = await cropImageToColumn(selectedFile, selectedTimeColumn);
        const timeFormData = new FormData();
        timeFormData.append('image', timeColumnBlob, 'time-column.png');

        const timeResponse = await fetch('/api/run-sheet/extract-times', {
          method: 'POST',
          body: timeFormData,
        });

        if (timeResponse.ok) {
          const timeResult = await timeResponse.json();
          timeData = JSON.stringify(timeResult.times || []);
        }
      }

      for (const column of selectedColumns) {
        // Create a cropped version of the image for this column
        const croppedBlob = await cropImageToColumn(selectedFile, column);

        // Send to processing API
        const formData = new FormData();
        formData.append('image', croppedBlob, 'column.png');
        formData.append('clinicianName', column.clinicianName || '');
        if (timeData) {
          formData.append('timeData', timeData);
        }

        const response = await fetch('/api/run-sheet/screenshots', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Failed to process column: ${column.clinicianName}`);
        }

        const data = await response.json();

        results.push({
          id: column.id,
          clinicianName: column.clinicianName,
          appointmentCount: data.appointments?.length || 0,
        });
      }

      setProcessedColumns(results);

      // Navigate to review page
      router.push('/run-sheet/review');
    } catch (err) {
      console.error('Error processing columns:', err);
      setError('Failed to process columns. Please try again.');
      setStep('select-columns');
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setImageUrl(null);
    setColumns([]);
    setTimeColumn(null);
    setError(null);
    setStep('upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddMore = () => {
    handleCancel();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Upload Schedule Screenshot</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {step === 'upload' && 'Step 1: Upload Screenshot'}
            {step === 'detecting' && 'Analyzing Screenshot...'}
            {step === 'select-columns' && 'Step 2: Select Columns to Process'}
            {step === 'processing' && 'Processing...'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {step === 'upload' && (
            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <svg
                  className="w-10 h-10 mb-3 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="mb-2 text-sm text-gray-500">
                  <span className="font-semibold">Click to upload</span> or drag and
                  drop
                </p>
                <p className="text-xs text-gray-500">
                  PNG, JPG screenshot from Gentu (MAX. 10MB)
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleFileSelect}
              />
            </label>
          )}

          {step === 'detecting' && (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-gray-600">Detecting columns in screenshot...</p>
            </div>
          )}

          {step === 'select-columns' && imageUrl && (
            <ColumnSelector
              imageUrl={imageUrl}
              columns={columns}
              timeColumn={timeColumn}
              onColumnsChange={handleColumnsChange}
              onTimeColumnChange={handleTimeColumnChange}
              onConfirm={handleConfirmColumns}
              onCancel={handleCancel}
            />
          )}

          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-gray-600">Processing selected columns...</p>
              <p className="text-sm text-gray-500">
                Extracting appointment information...
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {processedColumns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Processed: {processedColumns.length} Column(s)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {processedColumns.map((col) => (
                <div
                  key={col.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <span className="font-medium">
                    {col.clinicianName || 'Unknown'}
                  </span>
                  <span className="text-sm text-gray-600">
                    {col.appointmentCount} appointments found
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="outline" onClick={handleAddMore}>
                Add Another Screenshot
              </Button>
              <Button onClick={() => router.push('/run-sheet/review')}>
                Review Results
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Crop an image to a specific column region
 */
async function cropImageToColumn(file: File, column: Column): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Calculate pixel positions from percentages
      const xStart = Math.floor((column.xStartPercent / 100) * img.naturalWidth);
      const xEnd = Math.floor((column.xEndPercent / 100) * img.naturalWidth);
      const width = xEnd - xStart;

      canvas.width = width;
      canvas.height = img.naturalHeight;

      ctx.drawImage(
        img,
        xStart,
        0,
        width,
        img.naturalHeight,
        0,
        0,
        width,
        img.naturalHeight
      );

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        'image/png',
        1
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

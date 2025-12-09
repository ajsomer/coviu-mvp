'use client';

interface Clinician {
  id: string;
  name: string;
  appointmentCount: number;
}

interface ClinicianTabsProps {
  clinicians: Clinician[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ClinicianTabs({ clinicians, selectedId, onSelect }: ClinicianTabsProps) {
  if (clinicians.length === 0) {
    return null;
  }

  return (
    <div className="border-b">
      <nav className="flex gap-1 -mb-px">
        {clinicians.map((clinician) => (
          <button
            key={clinician.id}
            onClick={() => onSelect(clinician.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              selectedId === clinician.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {clinician.name}
            <span className="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
              {clinician.appointmentCount}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}

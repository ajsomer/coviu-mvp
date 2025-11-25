import { AppointmentForm } from '@/components/forms/appointment-form';

export default function RequestPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Request an Appointment
          </h1>
          <p className="mt-2 text-gray-600">
            Please fill out the form below to request an appointment with one of our specialists.
          </p>
        </div>

        <AppointmentForm />
      </div>
    </div>
  );
}

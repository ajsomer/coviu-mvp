import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Coviu Specialist Appointments
          </h1>
          <p className="text-xl text-gray-600">
            MVP Prototype for Appointment Request Management
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Patient Portal</CardTitle>
              <CardDescription>
                Request an appointment with a specialist
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Fill out our online form to request an appointment. You can upload your referral document and select your preferred specialist.
              </p>
              <Link href="/request">
                <Button className="w-full">Request Appointment</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Triage Dashboard</CardTitle>
              <CardDescription>
                Manage incoming appointment requests
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                View, filter, and manage all appointment requests. Update status, priority, and add notes.
              </p>
              <Link href="/dashboard">
                <Button variant="outline" className="w-full">Open Dashboard</Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 text-center text-sm text-gray-500">
          <p>Prototype Version - No Authentication Required</p>
        </div>
      </div>
    </div>
  );
}

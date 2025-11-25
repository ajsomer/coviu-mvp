'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { appointmentRequestSchema, type AppointmentRequestInput } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Specialist {
  id: string;
  name: string;
  specialty: string;
}

export function AppointmentForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Fetch specialists for dropdown
  useEffect(() => {
    fetch('/api/specialists')
      .then(res => res.json())
      .then(data => setSpecialists(data.data || []))
      .catch(err => console.error('Failed to fetch specialists:', err));
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AppointmentRequestInput>({
    resolver: zodResolver(appointmentRequestSchema),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(selectedFile.type)) {
        setUploadError('Invalid file type. Allowed: PDF, JPG, PNG');
        return;
      }
      // Validate file size (10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setUploadError('File too large. Maximum size is 10MB');
        return;
      }
      setUploadError(null);
      setFile(selectedFile);
    }
  };

  async function onSubmit(data: AppointmentRequestInput) {
    setIsSubmitting(true);

    try {
      // Upload file first if present
      let referralDocumentUrl: string | undefined;
      let referralDocumentName: string | undefined;

      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!uploadRes.ok) {
          const uploadError = await uploadRes.json();
          throw new Error(uploadError.error || 'Failed to upload file');
        }

        const uploadData = await uploadRes.json();
        referralDocumentUrl = uploadData.url;
        referralDocumentName = uploadData.name;
      }

      // Submit appointment request
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          referralDocumentUrl,
          referralDocumentName,
        }),
      });

      if (response.ok) {
        router.push('/confirmation');
      } else {
        const error = await response.json();
        console.error('Submission error:', error);
        alert('Failed to submit request. Please try again.');
      }
    } catch (error) {
      console.error('Error:', error);
      alert(error instanceof Error ? error.message : 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Patient Details */}
      <Card>
        <CardHeader>
          <CardTitle>Patient Details</CardTitle>
          <CardDescription>Please provide your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                {...register('firstName')}
                placeholder="John"
              />
              {errors.firstName && (
                <p className="text-sm text-red-500">{errors.firstName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                {...register('lastName')}
                placeholder="Smith"
              />
              {errors.lastName && (
                <p className="text-sm text-red-500">{errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">Date of Birth *</Label>
            <Input
              id="dateOfBirth"
              type="date"
              {...register('dateOfBirth')}
            />
            {errors.dateOfBirth && (
              <p className="text-sm text-red-500">{errors.dateOfBirth.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                {...register('email')}
                placeholder="john@example.com"
              />
              {errors.email && (
                <p className="text-sm text-red-500">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                type="tel"
                {...register('phone')}
                placeholder="0412 345 678"
              />
              {errors.phone && (
                <p className="text-sm text-red-500">{errors.phone.message}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Specialist Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Specialist Selection</CardTitle>
          <CardDescription>Which doctor would you like to see?</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="specialist">Select Specialist *</Label>
            <Select onValueChange={(value) => setValue('specialistId', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a specialist..." />
              </SelectTrigger>
              <SelectContent>
                {specialists.map((specialist) => (
                  <SelectItem key={specialist.id} value={specialist.id}>
                    {specialist.name} - {specialist.specialty}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.specialistId && (
              <p className="text-sm text-red-500">{errors.specialistId.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Referral Details */}
      <Card>
        <CardHeader>
          <CardTitle>Referral Details</CardTitle>
          <CardDescription>Information about your referral</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="referralDocument">Referral Document</Label>
            <Input
              id="referralDocument"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange}
            />
            <p className="text-sm text-muted-foreground">
              Upload your referral letter (PDF, JPG, or PNG, max 10MB)
            </p>
            {uploadError && (
              <p className="text-sm text-red-500">{uploadError}</p>
            )}
            {file && (
              <p className="text-sm text-green-600">Selected: {file.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="referringDoctorName">Referring Doctor Name *</Label>
            <Input
              id="referringDoctorName"
              {...register('referringDoctorName')}
              placeholder="Dr. Jane Doe"
            />
            {errors.referringDoctorName && (
              <p className="text-sm text-red-500">{errors.referringDoctorName.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="referringDoctorPhone">Referring Doctor Phone</Label>
              <Input
                id="referringDoctorPhone"
                type="tel"
                {...register('referringDoctorPhone')}
                placeholder="02 1234 5678"
              />
              {errors.referringDoctorPhone && (
                <p className="text-sm text-red-500">{errors.referringDoctorPhone.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="referringDoctorEmail">Referring Doctor Email</Label>
              <Input
                id="referringDoctorEmail"
                type="email"
                {...register('referringDoctorEmail')}
                placeholder="doctor@clinic.com"
              />
              {errors.referringDoctorEmail && (
                <p className="text-sm text-red-500">{errors.referringDoctorEmail.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="referringClinic">Referring Clinic</Label>
            <Input
              id="referringClinic"
              {...register('referringClinic')}
              placeholder="City Medical Centre"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="referralDate">Referral Date *</Label>
            <Input
              id="referralDate"
              type="date"
              {...register('referralDate')}
            />
            {errors.referralDate && (
              <p className="text-sm text-red-500">{errors.referralDate.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Submitting...' : 'Submit Appointment Request'}
      </Button>
    </form>
  );
}

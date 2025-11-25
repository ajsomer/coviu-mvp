import { TelehealthInviteModal } from '@/components/telehealth';

export default function TelehealthInvitesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Telehealth Invites</h1>
        <p className="text-muted-foreground">
          Send telehealth appointment invitations to patients
        </p>
      </div>

      <TelehealthInviteModal />
    </div>
  );
}

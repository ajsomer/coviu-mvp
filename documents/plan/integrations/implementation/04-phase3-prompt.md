# Phase 3 Implementation Prompt

Use this prompt to implement Phase 3 of the PMS integration - UI Components.

---

## Prompt

```
I need you to implement Phase 3 of the PMS (Practice Management System) integration for the Coviu run sheet application. This phase builds all UI components for connecting a PMS and managing the integration, integrated directly into the run sheet page.

## Prerequisites

Phase 1 and 2 must be completed first. You should have:
- Database schema and types
- Core services and stubbed Gentu adapter
- All API endpoints functional

## Context

Key files to reference:
- `src/app/(dashboard)/run-sheet/page.tsx` - Main run sheet page
- `src/components/run-sheet/RunSheetSidebar.tsx` - Sidebar showing appointments
- `src/components/run-sheet/AppointmentCard.tsx` - Individual appointment display
- `src/components/ui/` - shadcn/ui components
- `documents/plan/integrations/pms-abstraction-layer-plan.md` - Full architecture plan

The UI should be integrated into the existing run sheet page, NOT a separate settings page.


## UI Components to Implement

### 3.1 PMS Connection Button & Status

Add a "Connect PMS" button to the run sheet page header area. When connected, show sync status instead.

#### Location
Add to the run sheet page header, near the date navigation or clinician filter.

#### States

**Not Connected:**
```
┌─────────────────────────┐
│  🔗 Connect PMS        │
└─────────────────────────┘
```

**Connected & Synced:**
```
┌─────────────────────────────────────────┐
│  ✓ Smith Medical Centre  │  ↻ Sync Now │
│    Last sync: 5 mins ago                │
└─────────────────────────────────────────┘
```

**Syncing:**
```
┌─────────────────────────────────────────┐
│  ⟳ Syncing...                          │
└─────────────────────────────────────────┘
```

**Sync Failed:**
```
┌─────────────────────────────────────────┐
│  ⚠ Sync failed  │  ↻ Retry │  ⚙ Settings │
└─────────────────────────────────────────┘
```

#### Component: `src/components/pms/PMSConnectionStatus.tsx`

```typescript
interface PMSConnectionStatusProps {
  onConnectClick: () => void;
  onSyncClick: () => void;
  onSettingsClick: () => void;
}

// Fetches connection status from API
// Shows appropriate state
// Includes dropdown menu for settings/disconnect when connected
```


### 3.2 Setup Wizard Modal

A multi-step modal wizard for connecting a PMS.

#### Component: `src/components/pms/PMSSetupWizard.tsx`

```typescript
interface PMSSetupWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}
```

#### Step 1: Select PMS Type

```
┌──────────────────────────────────────────────────────────────┐
│  Connect Practice Management System                      [X] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Select your practice management system:                     │
│                                                              │
│  ┌────────────────────┐  ┌────────────────────┐             │
│  │                    │  │                    │             │
│  │   [Gentu Logo]     │  │  [Medirecords]     │             │
│  │                    │  │                    │             │
│  │   Gentu            │  │  Medirecords       │             │
│  │   (Magentus)       │  │  Coming Soon       │             │
│  │                    │  │                    │             │
│  └────────────────────┘  └────────────────────┘             │
│                                                              │
│  ┌────────────────────┐                                     │
│  │                    │                                     │
│  │   [Halaxy Logo]    │                                     │
│  │                    │                                     │
│  │   Halaxy           │                                     │
│  │   Coming Soon      │                                     │
│  │                    │                                     │
│  └────────────────────┘                                     │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                          [Cancel] [Next →]   │
└──────────────────────────────────────────────────────────────┘
```

**Notes:**
- Only Gentu is selectable initially
- Medirecords and Halaxy show "Coming Soon" and are disabled


#### Step 2: Connect (Gentu Pairing)

```
┌──────────────────────────────────────────────────────────────┐
│  Connect to Gentu                                        [X] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 1: Get your pairing code                              │
│                                                              │
│  1. Log in to Gentu                                         │
│  2. Go to Marketplace (left menu)                           │
│  3. Find "Coviu" and click "Add to Gentu"                   │
│  4. Copy the pairing code shown                             │
│                                                              │
│  Step 2: Enter pairing code                                 │
│                                                              │
│  ┌──────────────────────────────────────────┐               │
│  │  ABCD-1234                               │               │
│  └──────────────────────────────────────────┘               │
│                                                              │
│  [Connecting... ⟳]  OR  [Error message in red]              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                    [← Back] [Connect →]      │
└──────────────────────────────────────────────────────────────┘
```

**On success:** Show brief success message with practice name, then auto-advance.


#### Step 3: Map Practitioners

```
┌──────────────────────────────────────────────────────────────┐
│  Map Practitioners                                       [X] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Match practitioners from Gentu to your run sheet columns:  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Gentu Practitioner    │  Run Sheet Column    │ Sync  │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ Dr John Smith         │ [Dr Smith ▼]         │  ☑   │   │
│  │ Dr Sarah Jones        │ [Create new... ▼]    │  ☑   │   │
│  │ Dr Michael Williams   │ [Don't sync ▼]       │  ☐   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Dropdown options:                                          │
│  - Existing clinicians from run sheet                       │
│  - "Create new clinician"                                   │
│  - "Don't sync this practitioner"                           │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                    [← Back] [Continue →]     │
└──────────────────────────────────────────────────────────────┘
```

**Implementation notes:**
- Fetch practitioners from `GET /api/pms/connections/[id]/practitioners`
- Pre-select matches based on name similarity (fuzzy match)
- Show checkbox to enable/disable sync per practitioner
- If "Create new" selected, show inline text input for name


#### Step 4: Select Telehealth Types (Gentu only)

```
┌──────────────────────────────────────────────────────────────┐
│  Telehealth Appointment Types                            [X] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Select which appointment types are telehealth:             │
│                                                              │
│  ☑  Telehealth Consultation (30 min)      ████ (green)      │
│  ☑  Video Follow-up (15 min)              ████ (blue)       │
│  ☐  Standard Consultation (30 min)        ████ (grey)       │
│  ☐  New Patient (45 min)                  ████ (orange)     │
│  ☐  Procedure (60 min)                    ████ (red)        │
│                                                              │
│  ℹ Only telehealth appointments will sync to the run sheet  │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                    [← Back] [Continue →]     │
└──────────────────────────────────────────────────────────────┘
```

**Implementation notes:**
- Fetch from `GET /api/pms/connections/[id]/appointment-types`
- Show colour swatch from PMS
- This step is skipped for Medirecords/Halaxy (auto-detect)


#### Step 5: Confirm & Sync

```
┌──────────────────────────────────────────────────────────────┐
│  Ready to Sync                                           [X] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ✓ Connected to Smith Medical Centre                        │
│                                                              │
│  Summary:                                                   │
│  • 2 practitioners will sync                                │
│  • 2 telehealth appointment types selected                  │
│  • Sync frequency: Every 15 minutes                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  [Test Connection]                                   │    │
│  │  ✓ Connection successful (150ms)                    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                    [← Back] [Start Sync →]   │
└──────────────────────────────────────────────────────────────┘
```

**On "Start Sync":**
1. Save all mappings via API
2. Trigger initial sync
3. Close wizard
4. Show success toast
5. Refresh run sheet to show synced appointments


### 3.3 Practitioner Mapping Table

Reusable component for Step 3 of wizard.

#### Component: `src/components/pms/PractitionerMappingTable.tsx`

```typescript
interface PractitionerMapping {
  pmsPractitionerId: string;
  pmsPractitionerName: string;
  runSheetClinicianId: string | null;
  newClinicianName?: string;
  syncEnabled: boolean;
}

interface PractitionerMappingTableProps {
  practitioners: PMSPractitioner[];
  existingClinicians: { id: string; name: string }[];
  mappings: PractitionerMapping[];
  onChange: (mappings: PractitionerMapping[]) => void;
}
```


### 3.4 Telehealth Type Selector

Reusable component for Step 4 of wizard.

#### Component: `src/components/pms/TelehealthTypeSelector.tsx`

```typescript
interface TelehealthTypeConfig {
  pmsTypeId: string;
  isTelehealth: boolean;
  syncEnabled: boolean;
}

interface TelehealthTypeSelectorProps {
  appointmentTypes: PMSAppointmentType[];
  config: TelehealthTypeConfig[];
  onChange: (config: TelehealthTypeConfig[]) => void;
}
```


### 3.5 Sync Status Badge

Small badge showing sync status.

#### Component: `src/components/pms/SyncStatusBadge.tsx`

```typescript
type SyncStatus = 'success' | 'partial' | 'failed' | 'syncing' | 'never';

interface SyncStatusBadgeProps {
  status: SyncStatus;
  lastSyncAt?: Date;
  compact?: boolean;  // For use in tight spaces
}
```

**Visual states:**
- `success` - Green checkmark, "Synced 5 mins ago"
- `partial` - Yellow warning, "Partial sync"
- `failed` - Red X, "Sync failed"
- `syncing` - Spinner, "Syncing..."
- `never` - Grey dash, "Never synced"


### 3.6 PMS Settings Dropdown

Dropdown menu for managing connection when already connected.

#### Component: `src/components/pms/PMSSettingsDropdown.tsx`

```typescript
interface PMSSettingsDropdownProps {
  connection: PMSConnection;
  onSyncNow: () => void;
  onEditMappings: () => void;
  onEditTypes: () => void;
  onDisconnect: () => void;
}
```

**Menu items:**
- Sync Now
- Edit Practitioner Mappings
- Edit Telehealth Types
- View Sync History
- ---
- Disconnect


### 3.7 Appointment Card Updates

Update the existing `AppointmentCard.tsx` to show PMS source indicator.

#### Changes to `src/components/run-sheet/AppointmentCard.tsx`

Add visual indicator for PMS-sourced appointments:

```
┌─────────────────────────────────────────┐
│ 9:00 AM                          [PMS] │  ← Small badge if from PMS
│ Alice Brown                             │
│ 0412 345 678                           │
│ Telehealth Consultation                │
│                                        │
│ [Send Invite ▼]                        │
└─────────────────────────────────────────┘
```

**Implementation:**
- Check if `pmsConnectionId` is set on appointment
- Show small "PMS" or source icon badge
- Tooltip: "Synced from Gentu"


### 3.8 Run Sheet Page Integration

#### Update `src/app/(dashboard)/run-sheet/page.tsx`

Add the PMS connection UI to the page header:

```tsx
// Before (current structure)
<div className="...header...">
  <RunSheetDateNav />
  <ClinicianFilter />
</div>

// After
<div className="...header...">
  <RunSheetDateNav />
  <ClinicianFilter />
  <PMSConnectionStatus
    onConnectClick={() => setWizardOpen(true)}
    onSyncClick={handleSync}
    onSettingsClick={() => setSettingsOpen(true)}
  />
</div>

// Add wizard modal
<PMSSetupWizard
  open={wizardOpen}
  onClose={() => setWizardOpen(false)}
  onComplete={handleWizardComplete}
/>
```


## File Structure

Create the following files:

```
src/components/pms/
├── PMSConnectionStatus.tsx      # Header button/status
├── PMSSetupWizard.tsx          # Multi-step wizard modal
├── PractitionerMappingTable.tsx # Step 3 table
├── TelehealthTypeSelector.tsx   # Step 4 checkboxes
├── SyncStatusBadge.tsx         # Status indicator
├── PMSSettingsDropdown.tsx     # Settings menu
└── index.ts                    # Exports
```

Update existing files:
```
src/components/run-sheet/AppointmentCard.tsx  # Add PMS badge
src/app/(dashboard)/run-sheet/page.tsx        # Add connection UI
```


## Implementation Guidelines

### Use Existing UI Components

Use shadcn/ui components from `src/components/ui/`:
- `Dialog` - For the wizard modal
- `Button` - All buttons
- `Select` - Dropdowns
- `Checkbox` - Checkboxes
- `Input` - Text inputs
- `Badge` - Status badges
- `DropdownMenu` - Settings menu
- `Tabs` - If needed for wizard steps
- `Skeleton` - Loading states

### State Management

For the wizard, manage state locally:

```typescript
const [step, setStep] = useState(1);
const [pmsType, setPmsType] = useState<PMSType | null>(null);
const [connectionId, setConnectionId] = useState<string | null>(null);
const [mappings, setMappings] = useState<PractitionerMapping[]>([]);
const [telehealthTypes, setTelehealthTypes] = useState<TelehealthTypeConfig[]>([]);
```

### API Calls

Use fetch or a hook pattern:

```typescript
// Simple fetch
const response = await fetch('/api/pms/connections');
const data = await response.json();

// Or create a hook
function usePMSConnection() {
  const [connection, setConnection] = useState<PMSConnection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/pms/connections')
      .then(res => res.json())
      .then(data => {
        setConnection(data.connections[0] || null);
        setLoading(false);
      });
  }, []);

  return { connection, loading, refetch: () => { ... } };
}
```

### Loading & Error States

Every async operation should handle:
- Loading state (show spinner/skeleton)
- Error state (show error message with retry)
- Empty state (e.g., "No practitioners found")

### Toast Notifications

Use existing toast system for:
- "Connected successfully"
- "Sync completed"
- "Sync failed: [error]"
- "Disconnected"


## Example Component Implementation

Here's a complete example for the status component:

```tsx
// src/components/pms/PMSConnectionStatus.tsx

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link2, RefreshCw, Settings, MoreVertical } from 'lucide-react';
import { SyncStatusBadge } from './SyncStatusBadge';

interface PMSConnection {
  id: string;
  pmsType: string;
  displayName: string;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
}

interface PMSConnectionStatusProps {
  onConnectClick: () => void;
  onSyncClick: () => void;
  onSettingsClick: () => void;
}

export function PMSConnectionStatus({
  onConnectClick,
  onSyncClick,
  onSettingsClick,
}: PMSConnectionStatusProps) {
  const [connection, setConnection] = useState<PMSConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchConnection();
  }, []);

  const fetchConnection = async () => {
    try {
      const res = await fetch('/api/pms/connections');
      const data = await res.json();
      setConnection(data.connections[0] || null);
    } catch (error) {
      console.error('Failed to fetch PMS connection:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!connection) return;
    setSyncing(true);
    try {
      await fetch(`/api/pms/connections/${connection.id}/sync`, {
        method: 'POST',
      });
      await fetchConnection();
      onSyncClick();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="h-9 w-32 animate-pulse bg-muted rounded-md" />
    );
  }

  if (!connection) {
    return (
      <Button variant="outline" onClick={onConnectClick}>
        <Link2 className="h-4 w-4 mr-2" />
        Connect PMS
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md">
        <span className="text-sm font-medium">{connection.displayName}</span>
        <SyncStatusBadge
          status={syncing ? 'syncing' : (connection.lastSyncStatus as any) || 'never'}
          lastSyncAt={connection.lastSyncAt ? new Date(connection.lastSyncAt) : undefined}
          compact
        />
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleSync}
        disabled={syncing}
      >
        <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleSync}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync Now
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSettingsClick}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive">
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```


## Deliverables Checklist

After completing all tasks, you should have:

- [ ] `src/components/pms/PMSConnectionStatus.tsx`
- [ ] `src/components/pms/PMSSetupWizard.tsx`
- [ ] `src/components/pms/PractitionerMappingTable.tsx`
- [ ] `src/components/pms/TelehealthTypeSelector.tsx`
- [ ] `src/components/pms/SyncStatusBadge.tsx`
- [ ] `src/components/pms/PMSSettingsDropdown.tsx`
- [ ] `src/components/pms/index.ts`
- [ ] Updated `src/components/run-sheet/AppointmentCard.tsx` with PMS badge
- [ ] Updated `src/app/(dashboard)/run-sheet/page.tsx` with connection UI

All components should:
- Use existing shadcn/ui components
- Handle loading, error, and empty states
- Work with mock data from stubbed adapter
- Follow existing code style


## Testing

After implementation:

1. Visit the run sheet page
2. Click "Connect PMS"
3. Complete the wizard with mock data
4. Verify sync shows mock appointments
5. Test the sync button
6. Test the settings dropdown
7. Verify appointment cards show PMS badge
```

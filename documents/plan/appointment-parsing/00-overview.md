# Screenshot-Based Appointment Parsing - Implementation Overview

## Summary

This feature allows clinic staff to upload screenshots of their Gentu PMS appointment schedule, crop the relevant region, and have the system automatically extract patient appointments using Google Cloud Vision OCR. The parsed data populates a "Daily Run Sheet" displayed by clinician.

## MVP Scope

| Area | Decision |
|------|----------|
| Screenshot capture | File upload + in-browser cropping (react-image-crop) |
| Multiple screenshots | Sequential: upload → crop → add another → done |
| OCR | Google Cloud Vision (documentTextDetection) |
| Storage | Vercel Blob (existing) |
| Fields to extract | Patient name, phone, clinician, appointment time, appointment type |
| Date handling | Always "today" |
| Run sheet display | Tabs per clinician on single page |
| Review/edit | User reviews all parsed rows, can add/edit/delete before confirming |
| Post-confirmation edit | Returns to review screen |
| Re-upload | Overwrites existing data (with warning) |
| Fallback | Manual entry if parsing fails |
| Target PMS | Gentu |

## Implementation Phases

| Phase | Document | Description |
|-------|----------|-------------|
| 1 | [01-foundation.md](./01-foundation.md) | Database schema, API stubs, upload UI with cropping |
| 2 | [02-ocr-pipeline.md](./02-ocr-pipeline.md) | Image preprocessing, Google Vision integration |
| 3 | [03-parsing-engine.md](./03-parsing-engine.md) | Gentu-specific parsing logic |
| 4 | [04-review-ui.md](./04-review-ui.md) | Editable review table, add/delete rows |
| 5 | [05-run-sheet-ui.md](./05-run-sheet-ui.md) | Clinician tabs, final display |
| 6 | [06-polish.md](./06-polish.md) | Edge cases, error states, manual overrides |

## Dependencies to Install

```bash
npm install react-image-crop @google-cloud/vision sharp
```

## Environment Variables

```env
# Google Cloud Vision (JSON service account key)
GOOGLE_CLOUD_VISION_KEY={"type":"service_account","project_id":"..."}

# OCR Configuration
OCR_MAX_WIDTH=2000
OCR_DEBUG_LOGGING=true
```

## File Structure (Final)

```
src/
├── app/
│   ├── (dashboard)/
│   │   └── run-sheet/
│   │       ├── page.tsx              # Main run sheet display
│   │       ├── upload/
│   │       │   └── page.tsx          # Upload & crop flow
│   │       └── review/
│   │           └── page.tsx          # Review before confirm
│   └── api/
│       └── run-sheet/
│           ├── route.ts              # GET/DELETE run sheet
│           ├── screenshots/
│           │   └── route.ts          # POST screenshot
│           ├── appointments/
│           │   ├── route.ts          # GET/POST appointments
│           │   └── [id]/
│           │       └── route.ts      # PATCH/DELETE appointment
│           ├── confirm/
│           │   └── route.ts          # POST confirm
│           └── clinicians/
│               └── route.ts          # GET clinicians
├── components/
│   └── run-sheet/
│       ├── ScreenshotUploader.tsx
│       ├── ImageCropper.tsx
│       ├── UploadProgress.tsx
│       ├── AppointmentReviewTable.tsx
│       ├── AppointmentRow.tsx
│       ├── AddAppointmentForm.tsx
│       ├── ClinicianTabs.tsx
│       ├── RunSheetTable.tsx
│       └── EmptyState.tsx
└── lib/
    └── ocr/
        ├── google-vision.ts
        ├── preprocess.ts
        └── gentu-parser.ts
```

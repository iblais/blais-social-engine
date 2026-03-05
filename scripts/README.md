# Scripts

## import-content.ts

Imports Blais Lab content (Track 1 — Tips & Tricks, Batch 01) into Supabase.

### What it does

1. Parses `track1_captions_days1to30.txt` — splits on `DAY N:` pattern
2. For each day (1-30):
   - Reads all `DXX_slideNN.png` files from the `edited/DXX/` folder
   - Uploads each slide to Supabase Storage (`media/posts/{post_id}/{sort_order}.png`)
   - Creates a `posts` record (carousel, scheduled)
   - Creates `post_media` records for each slide
3. Schedules 1 post per day starting tomorrow, times spread between 6 AM - 8 PM EST

### Prerequisites

- Node.js 18+
- `npx tsx` available (or install tsx globally)
- Supabase project with `media` storage bucket created
- A social account already added in the app

### Environment variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
IMPORT_ACCOUNT_ID=uuid-of-blais-lab-account
```

Set these in `.env.local` at the repo root or export them before running.

### Run

```bash
npx tsx scripts/import-content.ts
```

### Source data location

```
G:\My Drive\BLAIS SOCIAL ENGINE\BLAIS_LAB_SOCIAL\TRACK_1_TIPS_AND_TRICKS\batch_01\
├── captions\track1_captions_days1to30.txt
└── edited\D01-D30\  (8-10 slides per day)
```

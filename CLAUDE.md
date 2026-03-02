# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**LegoFinder** — A mobile app that helps users identify which Lego pieces they already own and which are still missing to complete a specific set. The user enters a Lego set number, photographs individual pieces one at a time, confirms detections, and the app tracks found vs. missing parts.

## Monorepo Structure

```
legoFinder/
├── app/          # React + Vite frontend
├── server/       # Node.js + Express backend
├── CLAUDE.md
├── README.md
└── RASPBERRY_PI_SETUP.md
```

## Tech Stack

| Layer       | Technology                               |
|-------------|------------------------------------------|
| Frontend    | React 19 + Vite, TypeScript, CSS Modules |
| Backend     | Node.js, Express, TypeScript             |
| Storage     | SQLite (`better-sqlite3`) via `server/src/db.ts` |
| Vision AI   | Brickognize API (no key required)        |
| Lego Data   | Rebrickable REST API                     |

## Development Commands

### Frontend app (`/app`)
```bash
cd app
npm run dev     # Start Vite dev server (http://localhost:5173)
npm run build   # Production build
npm run preview # Preview production build
```

On a physical phone: open `http://<your-local-IP>:5173` in the mobile browser.
The `vite.config.ts` sets `host: true` so it's accessible on the LAN.

### Backend (`/server`)
```bash
cd server
npm run dev     # Start with hot reload (ts-node-dev)
npm run build   # Compile TypeScript to dist/
npm start       # Run compiled output
npm test
```

## Architecture & Data Flow

### Core User Flow
1. User types a set number → debounced `GET /api/sets/:setNum` shows a live preview (name + image) before committing.
2. User confirms → `POST /api/sessions` fetches the full parts list from Rebrickable and creates a session.
3. User photographs a piece → app normalises the image (EXIF rotation, max 1024 px), tiles it into a 2×2 grid, and sends each tile to `POST /api/sessions/:id/scan` in parallel.
4. Server calls the Brickognize API for each tile, returns the top detection (part number, confidence, bounding box). Does **not** update the session.
5. Frontend deduplicates overlapping detections across tiles (IoU threshold 0.3) and shows them one at a time in a card UI with a cropped preview.
6. User taps **Mark Found** → `POST /api/sessions/:id/mark-found` updates `foundParts`/`missingParts`.
7. User can undo via **✕** on a found part → `DELETE /api/sessions/:id/found/:partNum`.

### Session Shape
```typescript
interface Session {
  id: string;
  setNum: string;
  setName: string;
  setImgUrl: string | null;   // set box image from Rebrickable
  setParts: Part[];           // full list from Rebrickable
  foundParts: FoundPart[];    // confirmed by the user
  missingParts: Part[];       // setParts not yet confirmed
  createdAt: Date;
  lastScannedAt: Date | null;
}
```

### Backend Key Concepts
- **Sessions** are persisted in SQLite (`server/data/legofinder.db`) via `server/src/db.ts`. Created automatically on first run; delete the file to reset.
- **Set cache** (`set_cache` table) — set name, image URL, and parts list are fetched once per set number and reused across sessions.
- **Part number normalisation** — Brickognize returns `3069`, Rebrickable stores `3069b`. Both sides strip trailing letter suffixes before comparing (`normId`).
- **Image tiling** — frontend splits each photo into a 2×2 grid. Each tile is scanned independently; bounding boxes are mapped back to full-image coordinates before deduplication.

### API Routes
```
GET    /api/sets/:setNum              Lightweight set lookup: name + image (no parts)
GET    /api/sessions                  List all sessions (sorted by last scanned)
POST   /api/sessions                  Create session: { setNum } → fetches parts, returns session
GET    /api/sessions/:id              Get full session state
POST   /api/sessions/:id/scan         Body: multipart image → returns { detection } (detect only, no state change)
POST   /api/sessions/:id/mark-found   Body: { partNum } → confirms detection, updates session
DELETE /api/sessions/:id/found/:partNum  Unmark a wrongly confirmed part
DELETE /api/sessions/:id              Delete session
```

## Environment Variables

**server/.env**
```
REBRICKABLE_API_KEY=...
PORT=3000
```

**app/.env**
```
VITE_API_URL=http://localhost:3000
```
Note: when testing on a physical phone or Pi, change `VITE_API_URL` to the machine's LAN IP (e.g. `http://192.168.1.x:3000`).

## External APIs

### Rebrickable
- Base URL: `https://rebrickable.com/api/v3/lego/`
- Auth: `Authorization: key <REBRICKABLE_API_KEY>` header
- Key endpoints used:
  - `GET /sets/{set_num}/` — set name and `set_img_url`
  - `GET /sets/{set_num}/parts/?page_size=500` — paginated parts list
- Set numbers include the variant suffix, e.g. `75192-1`. The server auto-appends `-1` if omitted.

### Brickognize
- Endpoint: `POST https://api.brickognize.com/predict/parts/`
- Auth: none required
- Input: `multipart/form-data` with a `query_image` field
- Returns: top-1 part prediction with part ID, confidence score, and bounding box
- Implemented in `server/src/services/vision.ts`

## Key Files

| File | Purpose |
|------|---------|
| `server/src/services/vision.ts` | Brickognize API integration |
| `server/src/services/rebrickable.ts` | Rebrickable API client |
| `server/src/routes/sessions.ts` | Session CRUD + scan + mark-found + unmark |
| `server/src/routes/sets.ts` | Lightweight set lookup endpoint |
| `server/src/db.ts` | SQLite session store + set cache |
| `server/src/types.ts` | Shared server-side types |
| `app/src/pages/Session.tsx` | Session page + image pipeline + ScanResultPanel |
| `app/src/pages/Home.tsx` | Home page with debounced set search |
| `app/src/services/api.ts` | Frontend API client |
| `app/src/types.ts` | Shared frontend types |

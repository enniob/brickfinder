# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**LegoFinder** — A mobile app that helps users identify which Lego pieces they already own and which are still missing to complete a specific set. The user enters a Lego set number, photographs their pile of pieces, and the app tracks found vs. missing parts across multiple scans.

## Monorepo Structure

```
legoFinder/
├── app/          # React + Vite frontend
├── server/       # Node.js + Express backend
└── CLAUDE.md
```

## Tech Stack

| Layer       | Technology                              |
|-------------|----------------------------------------|
| Frontend    | React 19 + Vite, TypeScript, CSS Modules |
| Backend     | Node.js, Express, TypeScript           |
| Storage     | SQLite (`better-sqlite3`) via `server/src/db.ts` |
| Vision AI   | Anthropic Claude SDK (claude-sonnet-4-6) |
| Lego Data   | Rebrickable REST API                   |

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
1. User enters a Lego set number → app calls `POST /api/sessions` → server fetches the set's parts list from Rebrickable API and creates an in-memory session.
2. User photographs their Lego pieces → app uploads the image to `POST /api/sessions/:id/scan`.
3. Server sends the image + required parts list to Claude Vision, asking it to identify which parts are visible.
4. Server compares identified pieces against the set's parts list, updates the session's `foundParts` and `missingParts`, and returns the updated state.
5. Multiple scans are **additive** — each scan adds newly found pieces without losing progress from earlier photos.
6. App displays progress: found / total, with a list of still-missing pieces (with images from Rebrickable).

### In-Memory Session Shape
```typescript
interface Session {
  id: string;
  setNum: string;
  setName: string;
  setParts: Part[];          // full list from Rebrickable
  foundParts: FoundPart[];   // accumulated across all scans
  missingParts: Part[];      // setParts not yet found
  createdAt: Date;
}
```

### Backend Key Concepts
- **Sessions** are persisted in SQLite (`server/data/legofinder.db`) via `server/src/db.ts`. The DB file is created automatically on first run.
- **Rebrickable parts cache** — set parts fetched once per set number and stored in the `set_cache` table; reused across sessions for the same set number.
- **Vision prompt** — the prompt sent to Claude must include part numbers, names, colors, and ideally image URLs from Rebrickable so the model has visual reference to compare against the user's photo.

### API Routes
```
GET    /api/sessions              List all sessions (sorted by last scanned)
POST   /api/sessions              Create session: { setNum } → fetches parts, returns session
GET    /api/sessions/:id          Get full session state (found/missing/progress)
POST   /api/sessions/:id/scan     Body: multipart image → runs Claude vision, returns updated session
DELETE /api/sessions/:id          Clear session
```

## Environment Variables

**server/.env**
```
ANTHROPIC_API_KEY=...
REBRICKABLE_API_KEY=...
PORT=3000
```

**app/.env**
```
VITE_API_URL=http://localhost:3000
```
Note: when testing on a physical phone, change `VITE_API_URL` to your machine's LAN IP (e.g. `http://192.168.1.x:3000`).

## External APIs

### Rebrickable
- Base URL: `https://rebrickable.com/api/v3/lego/`
- Auth: `Authorization: key <REBRICKABLE_API_KEY>` header
- Key endpoints:
  - `GET /sets/{set_num}/parts/?page_size=1000` — all parts for a set
  - `GET /parts/{part_num}/` — part detail + image
- Set numbers include the variant suffix, e.g. `75192-1` for the Millennium Falcon.

### Claude Vision
- Model: `claude-sonnet-4-6`
- Pass the user's photo as a `base64` image block alongside a text prompt listing required parts.
- Ask the model to return a **JSON array** of identified `{ partNum, quantity }` objects so results can be parsed reliably.

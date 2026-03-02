# LegoFinder 🧱

LegoFinder helps you figure out which Lego pieces you already own and which ones you still need to complete a set. Enter a set number, snap a photo of a single brick, and the app identifies it and lets you confirm before tracking it as found.

## How it works

1. Enter a Lego set number (e.g. `75192` for the Millennium Falcon)
2. The app fetches the full parts list for that set from [Rebrickable](https://rebrickable.com)
3. Photograph a piece — the app tiles your image into a 2×2 grid and sends each tile to [Brickognize](https://brickognize.com) for part recognition
4. Detections are shown one at a time with a cropped preview and bounding box — tap **Mark Found** to confirm or **Skip** to ignore
5. Confirmed pieces accumulate in your **Found** list; the **Missing** list shrinks accordingly

Each scan detects a single piece and waits for your confirmation, keeping you in control of what gets marked.

## Tech stack

| Layer      | Technology                                     |
|------------|-----------------------------------------------|
| Frontend   | React 19 + Vite, TypeScript, CSS Modules      |
| Backend    | Node.js, Express, TypeScript                  |
| Storage    | SQLite (`better-sqlite3`)                     |
| Vision AI  | [Brickognize API](https://brickognize.com)    |
| Lego data  | [Rebrickable API](https://rebrickable.com/api) |

## Prerequisites

You need one API key before running the project:

### Rebrickable API key (free)
1. Create a free account at [rebrickable.com](https://rebrickable.com)
2. Go to **Account → Settings → API** and copy your key

> Part recognition is handled by [Brickognize](https://brickognize.com) — no API key required.

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-username/legoFinder.git
cd legoFinder
```

### 2. Set up the server

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env` and fill in your key:

```
REBRICKABLE_API_KEY=your_rebrickable_key_here
PORT=3000
```

### 3. Set up the app

```bash
cd app
npm install
```

The app is pre-configured to talk to `http://localhost:3000`. If you're testing on a **physical phone**, find your machine's local IP address (`ipconfig` on Windows, `ifconfig` on Mac/Linux) and create `app/.env`:

```
VITE_API_URL=http://192.168.1.x:3000
```

## Running

Open two terminals:

**Terminal 1 — backend:**
```bash
cd server
npm run dev
```

**Terminal 2 — frontend:**
```bash
cd app
npm run dev
```

Then open:
- **Desktop browser:** `http://localhost:5173`
- **Phone browser:** `http://<your-local-IP>:5173` (both devices must be on the same WiFi network)

## Using the app on your phone

The app runs in any mobile browser — no app store install needed.

1. Make sure your phone and computer are on the same WiFi network
2. Set `VITE_API_URL` to your computer's local IP (see above)
3. Open `http://<your-local-IP>:5173` in your phone's browser
4. **Scan Pieces** opens the rear camera directly; **Gallery** lets you use an existing photo

> **Tip:** On iPhone, tap the Share button → "Add to Home Screen" to get an app-like shortcut.

## Set numbers

Rebrickable identifies sets by a number and variant suffix, e.g.:
- `75192-1` — Millennium Falcon
- `10308-1` — Holiday Main Street
- `42151-1` — Bugatti Bolide

You can enter just the number (e.g. `75192`) and the app will automatically try the `-1` variant. Search for sets at [rebrickable.com](https://rebrickable.com/sets/).

## Project structure

```
legoFinder/
├── app/                        # React + Vite frontend
│   └── src/
│       ├── pages/
│       │   ├── Home.tsx        # Set number entry screen
│       │   └── Session.tsx     # Scan + ScanResultPanel + image pipeline
│       ├── services/api.ts     # Backend API client
│       └── types.ts
├── server/                     # Node.js + Express backend
│   └── src/
│       ├── routes/sessions.ts  # API endpoints
│       ├── services/
│       │   ├── rebrickable.ts  # Fetches set parts from Rebrickable
│       │   └── vision.ts       # Brickognize part recognition
│       ├── db.ts               # SQLite database (sessions + set cache)
│       └── types.ts
└── README.md
```

## API endpoints

| Method   | Path                               | Description                                               |
|----------|------------------------------------|-----------------------------------------------------------|
| `GET`    | `/api/sessions`                    | List all sessions (sorted by last scanned)                |
| `POST`   | `/api/sessions`                    | Create a session for a set `{ setNum }`                   |
| `GET`    | `/api/sessions/:id`                | Get current session state                                 |
| `POST`   | `/api/sessions/:id/scan`           | Detect one part in a photo (does **not** update session)  |
| `POST`   | `/api/sessions/:id/mark-found`     | Confirm a detection as found `{ partNum }`                |
| `DELETE` | `/api/sessions/:id/found/:partNum` | Unmark a wrongly confirmed part                           |
| `DELETE` | `/api/sessions/:id`                | Delete a session                                          |

### Two-step scan flow

`POST /api/sessions/:id/scan` returns a single detection without modifying the session:

```json
{
  "detection": {
    "partNum": "3069b",
    "partName": "Tile 1 x 2",
    "score": 0.94,
    "inMissingList": true,
    "boundingBox": { "left": 120, "upper": 80, "right": 300, "lower": 260, "imageWidth": 1024, "imageHeight": 768 }
  }
}
```

The user reviews the result and calls `POST /api/sessions/:id/mark-found` to confirm it, keeping humans in the loop.

## Notes & limitations

- **Sessions are saved to SQLite** (`server/data/legofinder.db`) and persist across server restarts. The database file is created automatically on first run. Delete it to reset all data.
- **Image tiling** — the frontend splits each photo into a 2×2 grid and scans tiles in parallel. Overlapping detections across tiles are deduplicated using bounding-box IoU (threshold 0.3). Images are also EXIF-rotated and resized to 1024 px max before upload.
- **Part number normalization** — Brickognize may return `3069` while Rebrickable stores `3069b`. The app strips trailing letter suffixes before comparing, so both match correctly.
- **Vision accuracy** — Brickognize works best with one piece centred in frame against a plain background. Multiple pieces or very small bricks may reduce accuracy.
- **Large sets** — sets with hundreds of parts will take a few seconds to load the first time while the parts list is fetched from Rebrickable. Subsequent sessions for the same set number use a local cache.

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

## License

[MIT](LICENSE)

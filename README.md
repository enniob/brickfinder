# LegoFinder 🧱

LegoFinder helps you figure out which Lego pieces you already own and which ones you still need to complete a set. Enter a set number, snap a photo of your pile of bricks, and the app identifies what's there and tracks what's missing — across as many photos as you need.

![LegoFinder screenshot placeholder](https://via.placeholder.com/600x300?text=LegoFinder)

## How it works

1. Enter a Lego set number (e.g. `75192` for the Millennium Falcon)
2. The app fetches the full parts list for that set from [Rebrickable](https://rebrickable.com)
3. Take a photo of your bricks — use your phone's camera or pick from your gallery
4. Claude's vision AI scans the image and identifies which required pieces are visible
5. The app updates your **Found** and **Missing** lists — scan more photos to find more pieces

Scans are additive, so you can photograph different piles and the app keeps accumulating what it finds.

## Tech stack

| Layer      | Technology                                     |
|------------|-----------------------------------------------|
| Frontend   | React 19 + Vite, TypeScript, CSS Modules      |
| Backend    | Node.js, Express, TypeScript                  |
| Vision AI  | [Anthropic Claude](https://anthropic.com) (`claude-sonnet-4-6`) |
| Lego data  | [Rebrickable API](https://rebrickable.com/api) |

## Prerequisites

You need two API keys before running the project:

### 1. Rebrickable API key (free)
1. Create a free account at [rebrickable.com](https://rebrickable.com)
2. Go to **Account → Settings → API** and copy your key

### 2. Anthropic API key
1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Go to **API Keys** and create a new key
3. Note: Claude API is pay-per-use. Scanning one photo costs a few cents at most

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

Edit `server/.env` and fill in your keys:

```
ANTHROPIC_API_KEY=your_anthropic_key_here
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
│       │   └── Session.tsx     # Scan + found/missing parts screen
│       ├── services/api.ts     # Backend API client
│       └── types.ts
├── server/                     # Node.js + Express backend
│   └── src/
│       ├── routes/sessions.ts  # API endpoints
│       ├── services/
│       │   ├── rebrickable.ts  # Fetches set parts from Rebrickable
│       │   └── vision.ts       # Sends images to Claude for analysis
│       ├── db.ts               # SQLite database (sessions + set cache)
│       └── types.ts
└── README.md
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sessions` | Create a session for a set `{ setNum }` |
| `GET` | `/api/sessions/:id` | Get current session state |
| `POST` | `/api/sessions/:id/scan` | Upload a photo, run vision scan |
| `DELETE` | `/api/sessions/:id` | Delete a session |

## Notes & limitations

- **Sessions are saved to SQLite** (`server/data/legofinder.db`) and persist across server restarts. The database file is created automatically on first run.
- **Vision accuracy** — Claude is good at identifying common Lego pieces but may miss uncommon parts or struggle with very cluttered photos. Spreading pieces out and taking multiple photos from different angles helps.
- **Large sets** — sets with hundreds of parts will take a few seconds to load the first time while the parts list is fetched from Rebrickable. Subsequent sessions for the same set number use a local cache.

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

## License

[MIT](LICENSE)

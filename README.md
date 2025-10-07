# Live Drawing Lite (Convex Edition)

Live Drawing Lite is a browser-based collaborative whiteboard tailored for classrooms. This refresh replaces Supabase with [Convex](https://www.convex.dev/) so that realtime drawing, presence, and session state all run through a globally replicated, low-latency data layer.

The project ships as static HTML/JS that you can host anywhere (S3, GitHub Pages, Netlify, etc.). The realtime behaviour is powered entirely by the Convex deployment you connect to from the teacher and student clients.

## Project layout

```
DEPLOY/
├── convex/             # Convex schema + server functions
├── js/                 # Shared browser modules
├── server/             # Optional Express wrapper for Render/Node hosting
├── index.html          # Landing page
├── teacher.html        # Teacher console
├── student.html        # Student client
├── canvas.html         # Legacy redirect to student view
├── features.md         # Capability overview
└── todo.md             # Follow-up ideas
```

> The original Supabase build and browser-based regression fixtures still live one level up in `../archive` and `../test`.

The teacher and student pages both load `ConvexClient` directly from the Convex CDN and talk to the functions defined in `convex/`.

## 1. Prerequisites

- Node.js 18+ and npm
- A Convex account (free tier works great) – [sign up](https://dashboard.convex.dev/)

## 2. Create & link a Convex project

Inside this folder (`Live Drawing Lite/DEPLOY/`):

```bash
npm init -y                   # only if you don't already have a package.json
npm install convex            # local dependency for CLI + type helpers
npx convex init               # sign in & create or link a Convex deployment
```

`npx convex init` writes a `convex.json` file that points at your deployment and prepares `convex/_generated/*`.

> **Note:** If you already have a Convex deployment for this project, just re-run `npx convex init` and choose “link existing project”.

## 3. Copy the provided Convex functions

The repo already includes the server logic you need:

- `convex/schema.ts` – tables for sessions, strokes, and participants
- `convex/events.ts` – lightweight event bus powering the Supabase-compatible broadcast shim
- `convex/sessions.ts` – create/end sessions & heartbeats
- `convex/drawings.ts` – append strokes, list strokes, clear canvas
- `convex/participants.ts` – presence tracking

After running `npx convex init`, keep these files in place (they will live alongside the generated folder created by Convex). If Convex generated placeholder files, replace them with the ones in this repo.

## 4. Run Convex locally

```bash
npx convex dev
```

This boots a local Convex backend, prints a dev deployment URL (something like `http://localhost:3210`). Leave this process running while you develop.

## 5. Start the front-end

The HTML files are static, so you can open them directly in a browser or run a tiny HTTP server for nicer routing from the `DEPLOY/` directory:

```bash
# example: using the built-in Python HTTP server
python3 -m http.server 5000
```

Then visit `http://localhost:5000/teacher.html` and `student.html`.

## 6. Configure the Convex URL in the UI

Both the teacher and student pages have a **Connection** form at the top:

1. Paste your Convex URL – use the dev URL from `npx convex dev` or the production URL (`https://your-project.convex.cloud`) after deployment.
2. Hit “Save connection”. The value is stored in `localStorage` and reused on the same device.
3. Teachers can now create sessions; students can join using the code displayed to them.

You can also hardcode a default by editing `js/config.js` and replacing the placeholder value if you prefer not to use the form.

## 7. Deploy to production

When you are ready to go live:

```bash
npx convex deploy             # deploy the Convex functions
# note the production Convex URL printed after deploy
```

Host the static files in `DEPLOY/` (you can ignore the sibling `archive/` and `test/` folders). Update the Connection form (or `js/config.js`) to use the production Convex URL.

## 8. Optional Node backend (Render-ready)

If you want to hide the Convex URL behind server-side configuration and ship everything as a single web service, use the lightweight Express app in `server/`.

1. From `Live Drawing Lite/DEPLOY/server`, run `npm install` followed by `npm start` to boot the server locally.  
   It serves the static site from the project root and exposes two endpoints:  
   - `GET /api/config` returns `{ convexUrl: ... }` drawn from the `CONVEX_URL` environment variable.  
   - `GET /api/health` for uptime probes.
2. The clients load `js/config-bootstrap.js`, which fetches `/api/config` on page load and pre-fills the Convex URL without baking it into the bundles. Users can still override it via the Connection form.
3. Basic rate limiting (600 req/min) plus `helmet` hardening are applied to the `/api/*` routes so routine pings don’t overload the Render instance.
4. Deploying on [Render](https://render.com/):
   - Create a “Web Service”, point it at the repo root, and set the build command to `cd DEPLOY/server && npm install`.
   - Use `cd DEPLOY/server && npm start` as the start command.
   - Add an environment variable `CONVEX_URL=https://your-project.convex.cloud` (and optionally `NODE_ENV=production`).
   - Render will serve the static UI and proxy API calls from the same origin, keeping the Convex URL off the client bundle.
5. The original Supabase browser code is still present in `teacher.html` / `student.html`, but they now import `js/convex-supabase-adapter.js`, a lightweight shim that re-implements `createClient().channel()` on top of Convex mutations/queries so you keep the exact UI/UX while swapping the realtime backend.

## 9. Handling larger classrooms

- The teacher & student clients enqueue strokes/undo/clear operations if Convex briefly disconnects, then replay them once the connection recovers, so short outages no longer drop updates.
- Heartbeats run every 20 seconds; if you expect hundreds of clients, you can widen `HEARTBEAT_INTERVAL` in `js/teacher.js` and `js/student.js` to ease backend load.
- Convex enforces stroke ownership server-side (`drawings:append/undo/redo/clear`), preventing other roles from mutating your work and ensuring undo/redo only touches the author’s strokes.
- For stress testing, simulate 50+ students with Playwright or headless browsers hitting the `/student.html` page, and monitor Convex dashboard metrics to tune rate limits if needed.

## Optional enhancements

- Gate student drawing by adding role-based permissions in `drawings:append`.
- Persist exported canvas snapshots or attachments using Convex storage.
- Add authentication (Convex Auth or third-party) for tighter access control.
- Extend `convex/events.ts` with scheduled pruning or analytics if you expect extremely long sessions; the adapter already keeps the most recent ~400 events per channel.

## Troubleshooting tips

- **Heartbeat stale?** Participants flip to “offline” if they stop sending heartbeats for ~45 seconds. Make sure the tab stays open or increase the interval in `js/teacher.js`/`js/student.js`.
- **Canvas not clearing?** Ensure the Convex client is saved via the Connection form; without a URL, mutations are skipped.
- **CORS errors?** Serve the HTML over HTTP when using a localhost Convex URL (browser security blocks file:// → http:// requests).

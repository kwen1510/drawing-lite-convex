# Live Drawing Lite — Feature Guide

## Overview
Live Drawing Lite is a realtime classroom drawing environment built for stylus devices and large classes. Teachers broadcast a session code from the dashboard while students join with a lightweight canvas optimized for smooth pen input, undo/redo, and template overlays.

## Teacher Dashboard
- **Session control**
  - Start or resume a session by entering a code and clicking `Start session`.
  - Session details (code, participant count, QR link) stay pinned to the header.
  - A reconnect bar appears automatically if Supabase drops; the dashboard retries the connection.
- **Student management**
  - Each student tile shows their live preview, last-seen timestamp, and connection dot.
  - Cards are natural-sorted, filterable by name, and can be narrowed to only flagged students.
  - A tiny flag toggle sits beside the status dot; flagged students display first when filtering.
  - Opening a tile launches the modal workspace for detailed review.
- **Modal workspace**
  - Teachers can annotate directly over the live canvas, switch tools, and adjust brush size.
  - A modal flag button stays in sync with the preview flag, allowing quick spotlighting.
  - `Stylus-only` mode, toolbar position, tool, and brush settings persist per teacher.
- **Templates & questions**
  - Broadcast graph, hanzi, or custom image templates to all students or individuals.
  - The question panel stages prompts before sending and highlights the active payload.
- **History controls**
  - Undo/redo and clear operate on teacher annotations per student.
  - `Clear all` wipes every student preview and template, keeping the session running.

## Student Canvas
- **Guarded login**
  - Students must supply a name and session code. A Supabase handshake verifies that the teacher session is live before entry.
  - Failed handshakes leave the login button enabled with an informative alert.
- **Responsive UI**
  - Stylus-first toolbar with color presets, pen/eraser, brush sizing, and stylus-only toggle.
  - Toolbar position persists per device, making left/right-handed switching instant.
  - Logout clears cached usernames and stored drawings, returning to the login form.
- **Drawing engine**
  - DPI-aware canvas with smooth Bézier interpolation and per-point streaming to Supabase.
  - Undo/redo stacks keep student-only strokes separate from teacher annotations.
  - Templates overlay beneath strokes with automatic fit adjustments per template type.

## Realtime Sync
- **Supabase channels** (`minimal-{SESSION}`) carry all events.
  - Student stroke lifecycle: `student_stroke_start`, incremental `student_stroke_point`, and `student_stroke_end`.
  - Teacher annotations mirror those events with `teacher_*` broadcasts.
  - Snapshots and template pushes ensure late joiners become fully hydrated.
- **Presence & gating**
  - The teacher replies to `teacher_presence_check` probes so only active sessions accept logins.
  - `teacher_end_session` immediately returns connected students to the login screen.
- **Resilience**
  - Teacher dashboard retries channel subscriptions after errors and surfaces a reconnect bar.
  - Students keep local snapshots in `sessionStorage` to avoid data loss during soft refreshes.

## Performance Notes
- Drawing updates batch via `requestAnimationFrame`. Active stroke maps prevent duplicate paths.
- The teacher grid reuses card nodes when sorting or filtering to minimize DOM churn.
- For large classes (~50 students):
  - Keep template images under 1–2 MB and prefer compressed formats (WEBP/PNG).
  - Encourage students to avoid excessive stroke density by tuning brush size; the canvas interpolator handles up to ~5k points per minute comfortably on iPad Pro hardware.
  - Supabase real-time comfortably supports dozens of concurrent channels, but monitor the project quota and consider rate-limit logs during peak usage.

## Deployment Tips
1. Host the project on a static server (e.g., Netlify, Vercel) with HTTPS enabled.
2. Configure Supabase credentials in `student.html` and `teacher.html`. For multi-environment setups, inject them with build-time templating instead of hardcoding.
3. Enforce Row Level Security (RLS) and rate limits on Supabase to protect channels from abuse.
4. Test latency across target geographies; Supabase regions close to your classroom yield the best results.

## Known Limitations
- The student client currently surfaces connection errors but does not auto-retry; refresh the page if a long outage occurs.
- Teacher templates rely on browser memory; extremely large images may not downscale gracefully on low-memory tablets.
- Supabase’s default plan has message throughput limits. Heavy simultaneous annotations from 50 students can approach those limits; consider upgrading if spikes are expected.

## Support Checklist
- ✅ Teacher must start the session before students can join.
- ✅ Students retain undo/redo history and unsent strokes across soft refreshes.
- ✅ Flags stay synchronized between student previews and the modal workspace.
- ✅ Teacher dashboard auto-retries real-time connections.
- ⚠️ Add a student-side reconnect strategy and queueing if network resilience becomes critical.
- ⚠️ Monitor Supabase message usage during large exam-style scenarios.


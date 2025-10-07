# Live Drawing Lite

A real-time collaborative drawing application for classrooms, featuring teacher-student interaction with Apple Pencil optimization and professional Chinese character grid templates.

## 🎯 Overview

Live Drawing Lite is a web-based drawing platform designed for educational environments. Teachers can monitor multiple student canvases in real-time, annotate directly on student work, and send templates or images for structured practice. Students can draw freely while receiving live feedback from their teacher.

## ✨ Key Features

### 🎨 **Real-Time Collaboration**
- Instant synchronization between teacher and all students
- Low-latency drawing with optimized stroke transmission
- Automatic reconnection with visual feedback
- Message validation and sequencing to prevent desync

### 👨‍🏫 **Teacher Dashboard**

#### Session Management
- **Auto-generated session codes** (6-digit alphanumeric)
- **URL parameters support** - Use `?session=CODE` to reuse the same session code
- **QR code generation** for easy student joining
- **Copy join URL** button with toast confirmation
- **Refresh protection** - Confirms before leaving to prevent accidental session end
- **Automatic student kick-out** when teacher closes/refreshes (with confirmation)

#### Canvas Monitoring
- **Grid view** of all student canvases with live updates
- **Adjustable cards per row** (Auto, 2, 3, 4 cards per row)
- **Student name display** with toggle to hide/reveal names (masked as ***)
- **Filter students** by name with real-time search
- **Activity indicators**:
  - 🟢 Green dot shows student is connected
  - ✓ Green checkmark appears when teacher has annotated
  - Pulsing border on recent activity (3-second pulse)
  - Last seen timestamp (HH:MM:SS) updates on every stroke

#### Live Annotation
- Click any student card to open **full-screen annotation modal**
- Draw directly on student's work with pen/eraser tools
- **Separate stroke ownership** - teacher and student strokes are independent
- Teacher annotations appear instantly on student's canvas
- Complete undo/redo history for annotations
- Clear annotations without affecting student's work

#### Question Templates
- **Prepare Next Question** panel with load-first, send-on-demand workflow
- Three modes:
  1. **Blank Canvas** - Clear workspace
  2. **Templates** - Pre-built grids:
     - Hanzi grid (red border, dashed center cross)
     - Graph paper (corner alignment)
     - Graph paper (cross alignment)
  3. **Image Mode** - Upload custom images (PNG, JPG, etc.)
- **Local preview** shows prepared content before sending
- **"Send next question"** clears all canvases and broadcasts new template
- Templates/images automatically sent to late joiners
- Optimized bandwidth - images sent once, not transmitted back

#### Drawing Tools
- **8 color palette** (Black, Red, Blue, Green, Yellow, Orange, Purple, Pink)
- **Pen and Eraser** tools
- **Brush size slider** (1-12px)
- **Stylus mode** - Toggles between pen-only or all inputs (mouse/touch/pen)
- **Toolbar positioning** - Move toolbar left/right for comfort
- **Complete undo/redo** with stack-based history
- **Clear canvas** with undo support
- **Apple Pencil optimized** - Smooth strokes with pressure sensitivity

#### Persistence
- **Settings auto-save** to localStorage:
  - Pen color
  - Tool selection (pen/eraser)
  - Brush size
  - Stylus mode preference
  - Toolbar position
- Settings restored on page reload

#### UI/UX
- **Modern glass-morphism design**
- **Sticky header** with session info always visible
- **Toast notifications** for user feedback (glass-like, opaque)
- **Empty state guidance** when no students connected
- **Reconnecting bar** appears during network issues
- **Responsive layout** optimized for tablets and desktops

### 👨‍🎓 **Student Canvas**

#### Session Join
- **Username persistence** - Saved in localStorage, auto-populated on return
- **Logout button** - Clear username and change identity
- **URL parameter support** - Scan QR code to auto-populate session code
- **Refresh confirmation** - Warns before reloading to prevent data loss
- **Session end handling** - Automatically kicked when teacher ends session

#### Drawing Experience
- **Full-screen canvas** with dynamic resizing
- **Apple Pencil optimization** for iPad users
- **Touch-action controls** prevent accidental gestures
- **Smooth stroke rendering** with interpolation
- **Real-time preview** of teacher annotations
- **Border indicators** show drawable area

#### Tools & Features
- Same drawing tools as teacher (colors, pen/eraser, brush size)
- **Independent undo/redo** for student work only
- **Clear canvas** removes only student's strokes, preserves teacher annotations
- **Eraser** only affects student's own strokes
- **Template/Image display** - Centered and scaled for consistent practice
- **Settings persistence** same as teacher (color, tool, size, stylus mode, toolbar position)

#### Real-Time Sync
- Strokes appear instantly on teacher's view
- Receive teacher annotations in real-time
- Template/image updates automatically
- Reconnection with state recovery
- Request snapshot on join to sync current question

### 🔒 **Session Security & Reliability**

#### Data Integrity
- **Message envelopes** with version and sequence numbers
- **Duplicate detection** prevents double-rendering
- **Out-of-order handling** via sequence tracking
- **Snapshot sync** for late joiners
- **Stroke ownership** prevents unauthorized erasure

#### Network Resilience
- **Auto-reconnect** with exponential backoff
- **Visual reconnection bar** for transparency
- **Supabase realtime** for reliable WebSocket connections
- **Broadcast acknowledgment** disabled for lower latency
- **Throttled point transmission** to prevent flooding

#### Performance Optimization
- **RequestAnimationFrame** scheduling for smooth rendering
- **IntersectionObserver** for lazy rendering of offscreen previews
- **Canvas double-buffering** via context reuse
- **Efficient hit-testing** for eraser using distance calculations
- **Batched stroke points** reduce network overhead

## 🚀 Getting Started

### Prerequisites
- Modern web browser (Chrome, Safari, Firefox, Edge)
- Internet connection for Supabase real-time features
- Supabase account (free tier works)

### Setup

1. **Clone or download** this repository

2. **Configure Supabase**:
   - Create a Supabase project at https://supabase.com
   - Get your project URL and anon key
   - Add to each HTML file (teacher.html, student.html):
   ```javascript
   window.SUPABASE_URL = 'YOUR_SUPABASE_URL';
   window.SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
   ```

3. **Open files**:
   - `index.html` - Landing page with links to teacher/student portals
   - `teacher.html` - Teacher dashboard
   - `student.html` - Student canvas
   - `canvas.html` - Standalone drawing tool (no collaboration)

### Usage

#### For Teachers:
1. Open `teacher.html` in your browser
2. Session code auto-generates (or use URL parameter: `?session=ABC123`)
3. Click "Start session" to go live
4. Share QR code or join URL with students
5. Monitor student work in real-time grid view
6. Click any card to annotate
7. Use "Prepare next question" to send templates/images

#### For Students:
1. Open `student.html` (or scan teacher's QR code)
2. Enter your name (auto-saved for next time)
3. Enter session code (auto-populated if using QR link)
4. Click "Join Session"
5. Start drawing! Your work appears on teacher's screen instantly

## 🎨 Template System

### Built-in Templates
- **Hanzi Grid**: Single-box grid for Chinese character practice with guide lines
- **Graph Paper (Corner)**: Grid aligned to canvas corners
- **Graph Paper (Cross)**: Grid with center cross for symmetry practice

### Custom Images
- Upload PNG, JPG, or other image formats
- Images fit to canvas with letterbox scaling
- Maintains aspect ratio for consistency
- Works offline with base64 encoding

### Template Workflow
1. Teacher selects mode and template/image (loads locally)
2. Preview appears in small window
3. Teacher clicks "Send next question"
4. All canvases clear (student + teacher strokes)
5. Template broadcasts to all students
6. Late joiners automatically receive current template

## 📱 Device Support

### Optimized For:
- **iPad with Apple Pencil** - Best experience
- **Wacom/Drawing tablets** - Full pressure support
- **Touch screens** - Works but pen mode recommended
- **Desktop with mouse** - Full features available

### Browser Compatibility:
- ✅ Chrome/Edge (Recommended)
- ✅ Safari (iPad/Mac)
- ✅ Firefox
- ⚠️ Internet Explorer (Not supported)

Confirmed working (Oct 2025):
- Teacher annotation uses the same stable pointer model as student
- Student strokes use Bezier smoothing (matches teacher)
- Undo/redo/clear are ownership‑aware and reliable
- Refresh protection on teacher with confirmation; students kicked only after confirm

## 🔧 Technical Architecture

### Frontend Stack
- **Pure HTML/CSS/JavaScript** - No build process required
- **Tailwind CSS** - Utility-first styling via CDN
- **Canvas API** - Native 2D drawing with DPR support
- **Pointer Events** - Unified input handling (pen/mouse/touch)

### Backend/Sync
- **Supabase Realtime** - WebSocket-based broadcasting
- **Channel-based rooms** - Isolated sessions per code
- **Event-driven architecture** - Broadcast events for all actions
- **No server-side code** - Fully client-side application

### Data Flow
1. **Student draws** → Stroke points collected
2. **Points batched** → Throttled transmission (50ms)
3. **Broadcast to channel** → Supabase relays to all subscribers
4. **Teacher receives** → Renders on card + modal (if open)
5. **Teacher annotates** → Same flow in reverse with `isTeacher: true` flag

### Storage
- **localStorage** - User preferences (teacher/student settings)
- **sessionStorage** - Temporary drawing state (student)
- **No database** - Everything is ephemeral and real-time

## 🐛 Known Limitations

1. **Refresh protection requires interaction**: Modern browsers need user gesture before `beforeunload` works. An invisible overlay captures first click to enable protection.

2. **No chat feature**: Communication is visual-only (drawing/annotation). Add voice/text separately if needed.

3. **No recording/playback**: Strokes are not persisted after session ends. Consider recording canvas to video if needed.

4. **Limited to Supabase channels**: Session capacity depends on Supabase limits (~200 concurrent connections per channel on free tier).

5. **No student-to-student visibility**: Students only see their own canvas + teacher annotations. Consider adding gallery view if needed.

## 📊 Performance Notes

- **Recommended**: Max 30 students per session for optimal performance
- **Stroke throttling**: Points sent in batches every 50ms to reduce network load
- **Canvas optimization**: Uses `requestAnimationFrame` for 60fps rendering
- **Memory management**: Old strokes persist in memory until cleared

## 🎓 Use Cases

### Education
- **Chinese character practice** with structured grids
- **Math graphing** exercises on coordinate planes
- **Art classes** with live feedback
- **Remote tutoring** one-on-one or small groups

### Professional
- **Whiteboard sessions** for remote teams
- **Design reviews** with markup capability
- **Brainstorming** with visual collaboration

## 🔐 Privacy & Data

- **No data storage**: All drawing data is ephemeral (lives only during session)
- **No user accounts**: Anonymous usernames, no authentication required
- **No analytics**: No tracking or telemetry beyond Supabase connection logs
- **Local preferences**: Settings saved locally in browser only

## 📝 Console Logging

Debug logs are included for troubleshooting:
- `[LOAD]` - Preference loading from localStorage
- `[SAVE]` - Preference saving to localStorage
- `[INIT]` - Initial state on page load
- `[UI]` - UI interactions and updates
- `[SESSION]` - Session lifecycle events

Open browser DevTools (F12 or Cmd+Option+I) to view logs.

## 🤝 Contributing

This is a standalone educational tool. Feel free to:
- Fork and modify for your needs
- Add new template types
- Improve stylus support
- Enhance UI/UX

## 📄 License

This project is provided as-is for educational purposes. Modify and use freely.

## 🙏 Credits

- **Tailwind CSS** - Styling framework
- **Supabase** - Real-time infrastructure
- **QRCode.js** - QR code generation

---

**Built with ❤️ for teachers and students**

*Last updated: October 2025*


import { ConvexClient } from "https://cdn.jsdelivr.net/npm/convex@1.14.3/dist/browser.mjs";
import { setupCanvas, drawStroke, pointerPosition } from "./canvas.js";
import { getConvexUrl, setConvexUrl, requireConvexUrl } from "./config.js";

const HEARTBEAT_INTERVAL = 20_000;
const PENDING_FLUSH_INTERVAL = 4_000;

const state = {
  client: null,
  convexUrl: "",
  sessionId: null,
  sessionCode: null,
  teacherName: "",
  tool: "pen",
  color: "#0f172a",
  size: 6,
  drawing: false,
  points: [],
  heartbeatTimer: null,
  strokesSubscription: null,
  participantsSubscription: null,
  pendingOperations: [],
  flushTimer: null,
  isFlushingPending: false,
  history: {
    canUndo: false,
    canRedo: false,
  },
};

const elements = {};

function $(selector) {
  const el = document.querySelector(selector);
  if (!el) {
    throw new Error(`Missing element: ${selector}`);
  }
  return el;
}

function updateStatus(message, tone = "info") {
  const banner = elements.statusBanner;
  if (!banner) {
    return;
  }
  banner.textContent = message;
  banner.dataset.tone = tone;
}

function toggleSessionControls(active) {
  if (!elements.startSessionBtn) {
    return;
  }
  elements.endSessionBtn.disabled = !active;
  elements.clearCanvasBtn.disabled = !active;
  elements.startSessionBtn.disabled = active;
  elements.teacherNameInput.disabled = active;
}

function resetSessionState() {
  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }
  if (state.strokesSubscription) {
    state.strokesSubscription();
    state.strokesSubscription = null;
  }
  if (state.participantsSubscription) {
    state.participantsSubscription();
    state.participantsSubscription = null;
  }
  if (state.flushTimer) {
    clearInterval(state.flushTimer);
    state.flushTimer = null;
  }
  state.sessionId = null;
  state.sessionCode = null;
  state.points = [];
  state.pendingOperations = [];
  state.history = { canUndo: false, canRedo: false };
  elements.sessionCode.textContent = "—";
  renderParticipants([]);
  toggleSessionControls(false);
  updateHistoryButtons();
}

function renderParticipants(participants) {
  const list = elements.participantList;
  list.innerHTML = "";
  if (!participants.length) {
    const li = document.createElement("li");
    li.textContent = "Nobody has joined yet.";
    li.className = "text-slate-400";
    list.appendChild(li);
  } else {
    participants
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((participant) => {
        const li = document.createElement("li");
        li.className = "flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-3 py-2";
        const name = document.createElement("span");
        name.textContent = participant.name;
        name.className = "font-medium text-white";
        const badge = document.createElement("span");
        badge.textContent =
          participant.role === "teacher"
            ? "Teacher"
            : participant.status === "online"
              ? "Online"
              : "Offline";
        badge.className =
          participant.status === "online"
            ? "rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200"
            : "rounded-full bg-slate-500/20 px-3 py-1 text-xs font-semibold text-slate-200";
        li.append(name, badge);
        list.appendChild(li);
      });
  }
  const studentCount = participants.filter((p) => p.role === "student" && p.status === "online").length;
  elements.participantCount.textContent = `${studentCount} online`;
}

function highlightToolButtons() {
  elements.toolButtons.forEach((button) => {
    if (button.dataset.tool === state.tool) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });
}

function highlightColorButtons() {
  elements.colorButtons.forEach((button) => {
    if (button.dataset.color === state.color && state.tool === "pen") {
      button.classList.add("ring-4", "ring-indigo-400/70");
    } else {
      button.classList.remove("ring-4", "ring-indigo-400/70");
    }
  });
}

function schedulePendingFlush() {
  if (state.flushTimer || !state.pendingOperations.length) {
    return;
  }
  state.flushTimer = setInterval(() => {
    flushPendingOperations().catch((error) => console.error("Pending flush failed", error));
  }, PENDING_FLUSH_INTERVAL);
}

function queueOperation(op, args) {
  state.pendingOperations.push({ op, args, attempts: 0 });
  schedulePendingFlush();
}

function shouldQueueError(error) {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = (error.message || "").toLowerCase();
  const transientTokens = ["failed to fetch", "network", "offline", "timed out", "connection", "fetch"];
  return (
    error.name === "TypeError" || transientTokens.some((token) => message.includes(token))
  );
}

async function executeOperation(client, operation) {
  switch (operation.op) {
    case "append":
      return client.mutation("drawings:append", operation.args);
    case "undo":
      return client.mutation("drawings:undo", operation.args);
    case "redo":
      return client.mutation("drawings:redo", operation.args);
    case "clear":
      return client.mutation("drawings:clear", operation.args);
    default:
      throw new Error(`Unknown operation ${operation.op}`);
  }
}

async function flushPendingOperations() {
  if (state.isFlushingPending || !state.pendingOperations.length) {
    if (!state.pendingOperations.length && state.flushTimer) {
      clearInterval(state.flushTimer);
      state.flushTimer = null;
    }
    return;
  }

  state.isFlushingPending = true;
  try {
    const client = await ensureClient();
    const remaining = [];
    for (const operation of state.pendingOperations) {
      try {
        await executeOperation(client, operation);
      } catch (error) {
        console.error("Retrying queued operation failed", error);
        operation.attempts += 1;
        if (operation.attempts < 5 && shouldQueueError(error)) {
          remaining.push(operation);
        } else {
          updateStatus(
            "A queued action could not be delivered after multiple attempts.",
            "error",
          );
        }
      }
    }
    state.pendingOperations = remaining;
    if (!state.pendingOperations.length && state.flushTimer) {
      clearInterval(state.flushTimer);
      state.flushTimer = null;
    }
  } catch (error) {
    console.error("Unable to flush pending operations", error);
  } finally {
    state.isFlushingPending = false;
  }
}

async function submitOperation(op, args) {
  let client;
  try {
    client = await ensureClient();
  } catch (error) {
    throw error;
  }
  try {
    return await executeOperation(client, { op, args });
  } catch (error) {
    if (shouldQueueError(error)) {
      queueOperation(op, args);
      updateStatus("Connection hiccup detected. We'll retry shortly.", "warn");
    }
    throw error;
  }
}

function updateHistoryState(strokes) {
  if (!state.sessionId) {
    state.history = { canUndo: false, canRedo: false };
    updateHistoryButtons();
    return;
  }
  const myStrokes = strokes.filter(
    (entry) =>
      entry.authorRole === "teacher" &&
      entry.authorName === state.teacherName,
  );
  const canUndo = myStrokes.some((entry) => entry.isDeleted !== true);
  const canRedo = myStrokes.some((entry) => entry.isDeleted === true);
  state.history = { canUndo, canRedo };
  updateHistoryButtons();
}

function updateHistoryButtons() {
  if (!elements.undoBtn || !elements.redoBtn) {
    return;
  }
  if (!state.sessionId) {
    elements.undoBtn.disabled = true;
    elements.redoBtn.disabled = true;
    return;
  }
  elements.undoBtn.disabled = !state.history.canUndo;
  elements.redoBtn.disabled = !state.history.canRedo;
}

function createClient(url) {
  if (state.client && state.convexUrl === url) {
    return state.client;
  }
  state.convexUrl = url;
  state.client = new ConvexClient(url);
  updateStatus("Connected to Convex. You can start a session.", "success");
  flushPendingOperations();
  return state.client;
}

async function ensureClient() {
  if (!state.client) {
    const url = requireConvexUrl();
    createClient(url);
  }
  return state.client;
}

async function startSession(event) {
  event.preventDefault();
  try {
    const client = await ensureClient();
    state.teacherName = elements.teacherNameInput.value.trim();
    if (!state.teacherName) {
      updateStatus("Enter your name to start a session.", "warn");
      return;
    }
    updateStatus("Creating session…");
    const { sessionId, code } = await client.mutation("sessions:create", {
      teacherName: state.teacherName,
    });
    state.sessionId = sessionId;
    state.sessionCode = code;
    elements.sessionCode.textContent = code;
    toggleSessionControls(true);
    updateHistoryButtons();
    updateStatus(`Session ready. Share code ${code} with your class.`, "success");
    heartbeat();
    state.heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL);
    subscribeToParticipants();
    subscribeToStrokes();
  } catch (error) {
    console.error(error);
    updateStatus(error.message || "Could not create session.", "error");
  }
}

async function endSession() {
  if (!state.sessionId || !state.client) {
    return;
  }
  try {
    updateStatus("Ending session…");
    await state.client.mutation("sessions:end", { sessionId: state.sessionId });
    resetSessionState();
    canvasControl.clear();
    updateStatus("Session ended. Start a new one when ready.", "info");
  } catch (error) {
    console.error(error);
    updateStatus(error.message || "Unable to end session.", "error");
  }
}

async function clearCanvas() {
  if (!state.sessionId || !state.client) {
    return;
  }
  try {
    await submitOperation("clear", {
      sessionId: state.sessionId,
      authorRole: "teacher",
      authorName: state.teacherName,
    });
    canvasControl.clear();
  } catch (error) {
    console.error(error);
    updateStatus(error.message || "Unable to clear canvas.", "error");
  }
}

async function heartbeat() {
  if (!state.client || !state.sessionId) {
    return;
  }
  try {
    await state.client.mutation("sessions:heartbeat", {
      sessionId: state.sessionId,
      name: state.teacherName,
      role: "teacher",
    });
  } catch (error) {
    console.error("Heartbeat failed", error);
  }
}

function subscribeToStrokes() {
  if (!state.client || !state.sessionId) {
    return;
  }
  if (state.strokesSubscription) {
    state.strokesSubscription();
    state.strokesSubscription = null;
  }
  state.strokesSubscription = state.client.subscribe(
    "drawings:list",
    { sessionId: state.sessionId },
    (strokes) => {
      canvasControl.clear();
      strokes
        .filter((entry) => entry.isDeleted !== true)
        .sort((a, b) => a.sequence - b.sequence)
        .forEach((entry) => drawStroke(canvasControl.ctx, entry.stroke));

      updateHistoryState(strokes);
    },
  );
}

function subscribeToParticipants() {
  if (!state.client || !state.sessionId) {
    return;
  }
  if (state.participantsSubscription) {
    state.participantsSubscription();
    state.participantsSubscription = null;
  }
  state.participantsSubscription = state.client.subscribe(
    "participants:list",
    { sessionId: state.sessionId },
    (participants) => {
      renderParticipants(participants);
    },
  );
}

async function commitStroke() {
  if (!state.sessionId || !state.client) {
    return;
  }
  if (state.points.length < 2) {
    state.points = [];
    return;
  }
  const stroke = {
    tool: state.tool,
    color: state.tool === "eraser" ? "#ffffff" : state.color,
    size: state.size,
    points: [...state.points],
  };
  state.points = [];
  try {
    await submitOperation("append", {
      sessionId: state.sessionId,
      stroke,
      authorRole: "teacher",
      authorName: state.teacherName,
    });
  } catch (error) {
    console.error(error);
    if (!shouldQueueError(error)) {
      updateStatus(error.message || "Failed to sync stroke.", "error");
    }
  }
}

function handlePointerDown(event) {
  if (!state.sessionId) {
    updateStatus("Start a session before drawing.", "warn");
    return;
  }
  state.drawing = true;
  state.points = [pointerPosition(elements.canvas, event)];
  elements.canvas.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  if (!state.drawing) {
    return;
  }
  const nextPoint = pointerPosition(elements.canvas, event);
  state.points.push(nextPoint);
  const recentPoints = state.points.slice(-2);
  drawStroke(canvasControl.ctx, {
    tool: state.tool,
    color: state.tool === "eraser" ? "#ffffff" : state.color,
    size: state.size,
    points: recentPoints.length === 2 ? recentPoints : [nextPoint],
  });
}

function handlePointerUp(event) {
  if (!state.drawing) {
    return;
  }
  if (
    typeof elements.canvas.hasPointerCapture === "function" &&
    elements.canvas.hasPointerCapture(event.pointerId)
  ) {
    elements.canvas.releasePointerCapture(event.pointerId);
  }
  state.drawing = false;
  commitStroke();
}

function attachPointerHandlers() {
  elements.canvas.addEventListener("pointerdown", handlePointerDown);
  elements.canvas.addEventListener("pointermove", handlePointerMove);
  ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
    elements.canvas.addEventListener(eventName, handlePointerUp);
  });
}

function attachToolbarHandlers() {
  elements.toolButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.tool = button.dataset.tool;
      highlightToolButtons();
      highlightColorButtons();
    });
  });
  elements.colorButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.tool = "pen";
      state.color = button.dataset.color;
      highlightToolButtons();
      highlightColorButtons();
    });
  });
  elements.brushSizeInput.addEventListener("input", (event) => {
    state.size = Number(event.target.value);
  });
}

async function handleUndo() {
  if (!state.sessionId) {
    return;
  }
  try {
    await submitOperation("undo", {
      sessionId: state.sessionId,
      authorRole: "teacher",
      authorName: state.teacherName,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Nothing to undo")) {
      updateStatus("Nothing left to undo.", "info");
    } else if (error instanceof Error) {
      updateStatus(error.message || "Undo failed.", "error");
    }
  }
}

async function handleRedo() {
  if (!state.sessionId) {
    return;
  }
  try {
    await submitOperation("redo", {
      sessionId: state.sessionId,
      authorRole: "teacher",
      authorName: state.teacherName,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Nothing to redo")) {
      updateStatus("Nothing to redo yet.", "info");
    } else if (error instanceof Error) {
      updateStatus(error.message || "Redo failed.", "error");
    }
  }
}

function loadStoredConfiguration() {
  const storedUrl = getConvexUrl();
  if (storedUrl) {
    elements.convexUrlInput.value = storedUrl;
    try {
      createClient(storedUrl);
    } catch (error) {
      console.error(error);
      updateStatus("Convex client could not be initialised. Check the URL.", "error");
    }
  }
}

async function handleConnectionSubmit(event) {
  event.preventDefault();
  const url = elements.convexUrlInput.value.trim();
  if (!url) {
    updateStatus("Enter a Convex deployment URL.", "warn");
    return;
  }
  try {
    setConvexUrl(url);
    createClient(url);
  } catch (error) {
    console.error(error);
    updateStatus("Unable to create Convex client. Double-check the URL.", "error");
  }
}

function handleBeforeUnload() {
  if (state.sessionId && state.client) {
    state.client.mutation("sessions:end", { sessionId: state.sessionId }).catch(() => {});
  }
}

const canvasControl = (() => {
  const canvas = $("#board");
  canvas.style.touchAction = "none";
  const control = setupCanvas(canvas);
  return { ...control, canvas };
})();

function init() {
  elements.canvas = canvasControl.canvas;
  elements.connectionForm = $("#connectionForm");
  elements.convexUrlInput = $("#convexUrlInput");
  elements.sessionForm = $("#sessionForm");
  elements.teacherNameInput = $("#teacherNameInput");
  elements.startSessionBtn = $("#startSessionBtn");
  elements.endSessionBtn = $("#endSessionBtn");
  elements.sessionCode = $("#sessionCode");
  elements.clearCanvasBtn = $("#clearCanvasBtn");
  elements.undoBtn = $("#undoBtn");
  elements.redoBtn = $("#redoBtn");
  elements.participantList = $("#participantList");
  elements.participantCount = $("#participantCount");
  elements.statusBanner = $("#statusBanner");
  elements.toolButtons = Array.from(document.querySelectorAll("[data-tool]"));
  elements.colorButtons = Array.from(document.querySelectorAll("[data-color]"));
  elements.brushSizeInput = $("#brushSizeInput");

  elements.connectionForm.addEventListener("submit", handleConnectionSubmit);
  elements.sessionForm.addEventListener("submit", startSession);
  elements.endSessionBtn.addEventListener("click", endSession);
  elements.clearCanvasBtn.addEventListener("click", clearCanvas);
  elements.undoBtn.addEventListener("click", handleUndo);
  elements.redoBtn.addEventListener("click", handleRedo);

  attachToolbarHandlers();
  highlightToolButtons();
  highlightColorButtons();
  attachPointerHandlers();
  loadStoredConfiguration();
  updateHistoryButtons();

  window.addEventListener("convex:config", (event) => {
    const { convexUrl } = event.detail || {};
    if (!convexUrl) {
      return;
    }
    if (!elements.convexUrlInput.value) {
      elements.convexUrlInput.value = convexUrl;
    }
    if (!state.client) {
      try {
        createClient(convexUrl);
      } catch (error) {
        console.error(error);
        updateStatus("Convex client could not be initialised. Check the URL.", "error");
      }
    }
  });

  window.addEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("online", () => {
    updateStatus("Back online. Syncing pending actions…", "info");
    flushPendingOperations();
  });
}

document.addEventListener("DOMContentLoaded", init);

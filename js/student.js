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
  studentName: "",
  tool: "pen",
  color: "#2563eb",
  size: 4,
  drawing: false,
  points: [],
  strokesSubscription: null,
  heartbeatTimer: null,
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
  if (!elements.statusBanner) {
    return;
  }
  elements.statusBanner.textContent = message;
  elements.statusBanner.dataset.tone = tone;
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
  return error.name === "TypeError" || transientTokens.some((token) => message.includes(token));
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
          updateStatus("A queued action could not be delivered after multiple attempts.", "error");
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
      entry.authorRole === "student" &&
      entry.authorName === state.studentName,
  );
  const canUndo = myStrokes.some((entry) => entry.isDeleted !== true);
  const canRedo = myStrokes.some((entry) => entry.isDeleted === true);
  state.history = { canUndo, canRedo };
  updateHistoryButtons();
}

function updateHistoryButtons() {
  if (!elements.undoBtn || !elements.redoBtn || !elements.clearMineBtn) {
    return;
  }
  if (!state.sessionId) {
    elements.undoBtn.disabled = true;
    elements.redoBtn.disabled = true;
    elements.clearMineBtn.disabled = true;
    return;
  }
  elements.undoBtn.disabled = !state.history.canUndo;
  elements.redoBtn.disabled = !state.history.canRedo;
  elements.clearMineBtn.disabled = !state.history.canUndo;
}

function createClient(url) {
  if (state.client && state.convexUrl === url) {
    return state.client;
  }
  state.convexUrl = url;
  state.client = new ConvexClient(url);
  updateStatus("Convex connection ready. Join your teacher's session.", "success");
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

function toggleSessionUI(active) {
  elements.joinSessionBtn.disabled = active;
  elements.leaveSessionBtn.disabled = !active;
  elements.studentNameInput.disabled = active;
  elements.sessionCodeInput.disabled = active;
  updateHistoryButtons();
}

function resetSession() {
  if (state.strokesSubscription) {
    state.strokesSubscription();
    state.strokesSubscription = null;
  }
  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }
  if (state.flushTimer) {
    clearInterval(state.flushTimer);
    state.flushTimer = null;
  }
  state.sessionId = null;
  state.sessionCode = null;
  state.teacherName = "";
  state.points = [];
  state.pendingOperations = [];
  state.history = { canUndo: false, canRedo: false };
  canvasControl.clear();
  elements.sessionDetails.textContent = "—";
  toggleSessionUI(false);
}

async function joinSession(event) {
  event.preventDefault();
  try {
    const client = await ensureClient();
    state.studentName = elements.studentNameInput.value.trim();
    if (!state.studentName) {
      updateStatus("Enter your name to join.", "warn");
      return;
    }
    const code = elements.sessionCodeInput.value.trim();
    if (!code) {
      updateStatus("Enter the session code provided by your teacher.", "warn");
      return;
    }
    updateStatus("Loading session…");
    const session = await client.query("sessions:lookupByCode", { code });
    state.sessionId = session._id;
    state.sessionCode = session.code;
    state.teacherName = session.teacherName;
    elements.sessionDetails.textContent = `${session.teacherName} · ${session.code}`;
    toggleSessionUI(true);
    updateHistoryButtons();
    updateStatus("You're in! Start collaborating.", "success");
    subscribeToStrokes();
    heartbeat();
    state.heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL);
    flushPendingOperations();
  } catch (error) {
    console.error(error);
    updateStatus(error.message || "Could not join session.", "error");
  }
}

async function leaveSession() {
  if (!state.sessionId || !state.client) {
    return;
  }
  resetSession();
  updateStatus("You left the session.", "info");
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

async function heartbeat() {
  if (!state.client || !state.sessionId) {
    return;
  }
  try {
    await state.client.mutation("sessions:heartbeat", {
      sessionId: state.sessionId,
      name: state.studentName,
      role: "student",
    });
  } catch (error) {
    console.error("Heartbeat failed", error);
  }
}

async function commitStroke() {
  if (!state.sessionId || !state.client) {
    state.points = [];
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
      authorRole: "student",
      authorName: state.studentName,
    });
  } catch (error) {
    console.error(error);
    if (!shouldQueueError(error)) {
      updateStatus(error.message || "Failed to sync your stroke.", "error");
    }
  }
}

function handlePointerDown(event) {
  if (!state.sessionId) {
    updateStatus("Join a session before drawing.", "warn");
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
      authorRole: "student",
      authorName: state.studentName,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Nothing to undo")) {
      updateStatus("No strokes to undo.", "info");
    } else if (error instanceof Error && !shouldQueueError(error)) {
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
      authorRole: "student",
      authorName: state.studentName,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Nothing to redo")) {
      updateStatus("Nothing to redo yet.", "info");
    } else if (error instanceof Error && !shouldQueueError(error)) {
      updateStatus(error.message || "Redo failed.", "error");
    }
  }
}

async function handleClearOwn() {
  if (!state.sessionId) {
    return;
  }
  try {
    await submitOperation("clear", {
      sessionId: state.sessionId,
      authorRole: "student",
      authorName: state.studentName,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Nothing to clear")) {
      updateStatus("You have no strokes to clear.", "info");
    } else if (error instanceof Error && !shouldQueueError(error)) {
      updateStatus(error.message || "Clear failed.", "error");
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
      updateStatus("Could not initialise Convex client. Check the URL.", "error");
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
  elements.joinForm = $("#joinForm");
  elements.studentNameInput = $("#studentNameInput");
  elements.sessionCodeInput = $("#sessionCodeInput");
  elements.joinSessionBtn = $("#joinSessionBtn");
  elements.leaveSessionBtn = $("#leaveSessionBtn");
  elements.sessionDetails = $("#sessionDetails");
  elements.statusBanner = $("#statusBanner");
  elements.toolButtons = Array.from(document.querySelectorAll("[data-tool]"));
  elements.colorButtons = Array.from(document.querySelectorAll("[data-color]"));
  elements.brushSizeInput = $("#brushSizeInput");
  elements.undoBtn = $("#undoBtn");
  elements.redoBtn = $("#redoBtn");
  elements.clearMineBtn = $("#clearMineBtn");

  elements.connectionForm.addEventListener("submit", handleConnectionSubmit);
  elements.joinForm.addEventListener("submit", joinSession);
  elements.leaveSessionBtn.addEventListener("click", leaveSession);
  elements.undoBtn.addEventListener("click", handleUndo);
  elements.redoBtn.addEventListener("click", handleRedo);
  elements.clearMineBtn.addEventListener("click", handleClearOwn);

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
        updateStatus("Could not initialise Convex client. Check the URL.", "error");
      }
    }
  });

  window.addEventListener("online", () => {
    updateStatus("Back online. Syncing pending actions…", "info");
    flushPendingOperations();
  });
}

document.addEventListener("DOMContentLoaded", init);

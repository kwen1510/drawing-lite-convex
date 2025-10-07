import compression from "compression";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const app = express();

app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(compression());
app.use(express.json());
app.use(morgan("combined"));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", limiter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/config", (_req, res) => {
  res.json({
    convexUrl: process.env.CONVEX_URL || null,
  });
});

const staticOptions = {
  extensions: ["html"],
  index: "index.html",
  setHeaders(res) {
    res.setHeader("Cache-Control", "public, max-age=3600");
  },
};

app.use(express.static(rootDir, staticOptions));

app.get("*", (_req, res) => {
  res.sendFile(path.join(rootDir, "index.html"));
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Live Drawing Lite server listening on port ${port}`);
});

import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { createSessionConfig } from "./session-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "../dist");

export function createServerApp({
  apiKey = process.env.OPENAI_API_KEY ?? "",
  openaiFetch = fetch,
  production = process.env.NODE_ENV === "production",
} = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'", "https://api.openai.com"],
          imgSrc: ["'self'", "data:"],
          mediaSrc: ["'self'", "blob:"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
        },
      },
      strictTransportSecurity: production ? undefined : false,
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, realtimeConfigured: Boolean(apiKey) });
  });

  const sessionLimiter = rateLimit({
    windowMs: 60_000,
    limit: 12,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many session attempts. Please wait a moment." },
  });

  app.post(
    "/api/realtime-session",
    sessionLimiter,
    (req, res, next) => {
      if (!req.is("application/sdp")) {
        return res.status(415).json({ error: "Expected an SDP offer." });
      }
      return next();
    },
    express.text({ type: "application/sdp", limit: "64kb" }),
    async (req, res) => {
      if (!apiKey) {
        return res.status(503).json({ error: "Realtime service is not configured." });
      }
      if (typeof req.body !== "string" || !req.body.startsWith("v=")) {
        return res.status(422).json({ error: "The SDP offer is invalid." });
      }

      const form = new FormData();
      form.set("sdp", req.body);
      form.set("session", JSON.stringify(createSessionConfig()));

      try {
        const upstream = await openaiFetch("https://api.openai.com/v1/realtime/calls", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(15_000),
        });

        if (!upstream.ok) {
          await upstream.text();
          return res.status(502).json({ error: "Could not open a realtime session. Please retry." });
        }

        return res
          .status(upstream.status)
          .type("application/sdp")
          .send(await upstream.text());
      } catch {
        return res.status(502).json({ error: "Could not open a realtime session. Please retry." });
      }
    },
  );

  app.use((error, _req, res, _next) => {
    if (error?.type === "entity.too.large") {
      return res.status(413).json({ error: "The SDP offer is too large." });
    }
    return res.status(500).json({ error: "Unexpected server error." });
  });

  if (production) {
    app.use(express.static(DIST_DIR, { index: false, maxAge: "1h" }));
    app.get("*splat", (_req, res) => res.sendFile(path.join(DIST_DIR, "index.html")));
  }

  return app;
}

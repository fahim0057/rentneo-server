import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { getDb } from "./db";
import equipmentRouter from "./routes/equipment";
import { errorHandler, notFound } from "./middleware/errors";
import { verifyToken } from "./middleware/auth";
import usersRouter from "./routes/users";
import reviewsRouter from "./routes/reviews";
import paymentsRouter from "./routes/payments";
import favoritesRouter from "./routes/favorites";
import bookingsRouter from "./routes/bookings";
import analyticsRouter from "./routes/analytics";
export const app = express();

// Behind a reverse proxy (Vercel/Render/nginx), set TRUST_PROXY so rate limiting
// sees the real client IP. Leave unset when the app is directly exposed.
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
}

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: env.clientUrls,
    credentials: true,
    maxAge: 86_400,
  })
);
// Keep the raw bytes as well: Stripe signs the exact body, and re-serialising
// parsed JSON would break signature verification.
app.use(
  express.json({
    limit: "100kb",
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    },
  })
);

// Rate-limit the API, and never let proxies/browsers cache API responses.
app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.get("/", (_req, res) => {
  res.json({ success: true, message: "RentNeo API is running" });
});

app.get("/api/health", async (_req, res) => {
  const db = await getDb();
  await db.command({ ping: 1 });
  res.json({ success: true, database: "connected", time: new Date().toISOString() });
});
app.get("/api/me", verifyToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

app.use("/api/equipment", equipmentRouter);
app.use("/api/users", usersRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/favorites", favoritesRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/analytics", analyticsRouter);
app.use(notFound);
app.use(errorHandler);

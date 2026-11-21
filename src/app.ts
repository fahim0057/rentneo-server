import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { getDb } from "./db";
import { errorHandler, notFound } from "./middleware/errors";
import { verifyAdmin, verifyOwner, verifyRenter, verifyToken } from "./middleware/auth";
export const app = express();

app.use(cors({ origin: env.clientUrls, credentials: true }));
app.use(express.json());

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
app.get("/api/test/renter", verifyToken, verifyRenter, (_req, res) => {
  res.json({ success: true, message: "Renter route OK" });
});
app.get("/api/test/owner", verifyToken, verifyOwner, (_req, res) => {
  res.json({ success: true, message: "Owner route OK" });
});
app.get("/api/test/admin", verifyToken, verifyAdmin, (_req, res) => {
  res.json({ success: true, message: "Admin route OK" });
});

app.use(notFound);
app.use(errorHandler);
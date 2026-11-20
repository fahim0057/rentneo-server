import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { getDb } from "./db";
import { errorHandler, notFound } from "./middleware/errors";

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

app.use(notFound);
app.use(errorHandler);
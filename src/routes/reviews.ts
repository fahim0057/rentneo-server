import { Router } from "express";
import { getDb } from "../db";

const router = Router();

// GET /api/reviews
router.get("/", async (_req, res) => {
  const data = await (await getDb())
    .collection("reviews")
    .find()
    .sort({ createdAt: -1 })
    .limit(12)
    .toArray();
  res.json({ success: true, data });
});

export default router;
import { Router } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getDb } from "../db";
import { AppError } from "../middleware/errors";
import { verifyAdmin, verifyToken } from "../middleware/auth";
import { parseBody } from "../lib/equipmentSchema";
import { ObjectId, type Document, type Filter } from "mongodb";
const router = Router();

// Every route in this file is admin-only
router.use(verifyToken, verifyAdmin);

const roleSchema = z.object({ role: z.enum(["customer", "owner", "admin"]) });
const users = async () => (await getDb()).collection("user");

// GET /api/users
router.get("/", async (_req, res) => {
  const data = await (await users())
    .find({}, { projection: { name: 1, email: 1, role: 1, image: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .toArray();
  res.json({ success: true, data });
});

// PATCH /api/users/:id/role
router.patch("/:id/role", async (req, res) => {
  const { role } = parseBody(roleSchema, req.body);
  const idFilter: Filter<Document> = {
    $or: [{ _id: new ObjectId(id) }, { _id: id as unknown as ObjectId }],
  };

  const result = await (await users()).findOneAndUpdate(
    idFilter,
    { $set: { role, updatedAt: new Date() } },
    { returnDocument: "after", projection: { name: 1, email: 1, role: 1 } }
  );
  if (!result) throw new AppError(404, "User not found");

  res.json({ success: true, data: result });
});

export default router;
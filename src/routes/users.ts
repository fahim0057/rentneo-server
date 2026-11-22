import { Router } from "express";
import { ObjectId, type Document, type Filter } from "mongodb";
import { z } from "zod";
import { getDb } from "../db";
import { AppError } from "../middleware/errors";
import { verifyAdmin, verifyToken } from "../middleware/auth";
import { parseBody } from "../lib/equipmentSchema";

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
  const id = req.params.id;

  if (!id) throw new AppError(400, "Invalid user id");
  if (id === req.user!.id) throw new AppError(400, "You cannot change your own role");

  // Better Auth normally stores _id as an ObjectId; keep a string fallback in case
  // the adapter is ever configured with custom ids.
  const idFilter: Filter<Document> =
    ObjectId.isValid(id) && /^[a-f\d]{24}$/i.test(id)
      ? { _id: new ObjectId(id) }
      : { _id: id as unknown as ObjectId };

  const result = await (await users()).findOneAndUpdate(
    idFilter,
    { $set: { role, updatedAt: new Date() } },
    { returnDocument: "after", projection: { name: 1, email: 1, role: 1 } }
  );
  if (!result) throw new AppError(404, "User not found");

  res.json({ success: true, data: result });
});

export default router;
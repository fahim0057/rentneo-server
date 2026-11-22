import { Router } from "express";
import { ObjectId, type Document } from "mongodb";
import { getDb } from "../db";
import { AppError } from "../middleware/errors";
import {
  verifyAdmin,
  verifyOwner,
  verifyOwnerOrAdmin,
  verifyToken,
} from "../middleware/auth";
import { equipmentSchema, parseBody, statusSchema } from "../lib/equipmentSchema";

const router = Router();
const equipment = async () => (await getDb()).collection("equipment");

function toObjectId(id: unknown): ObjectId {
  if (typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id)) {
    throw new AppError(400, "Invalid equipment id");
  }
  return new ObjectId(id);
}

// Only accept plain strings from the query string (blocks NoSQL operator injection)
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- Public ----------

// GET /api/equipment?search=&category=&rentalType=&minPrice=&maxPrice=&availability=&sort=&page=&limit=
router.get("/", async (req, res) => {
  const q = req.query;
  const filter: Document = { status: "approved" };

  const search = str(q.search);
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: rx }, { location: rx }, { category: rx }, { brand: rx }];
  }
  const category = str(q.category);
  if (category) filter.category = category;
  const rentalType = str(q.rentalType);
  if (rentalType) filter.rentalType = rentalType;

  const price: Document = {};
  const min = Number(str(q.minPrice));
  const max = Number(str(q.maxPrice));
  if (str(q.minPrice) && !Number.isNaN(min)) price.$gte = min;
  if (str(q.maxPrice) && !Number.isNaN(max)) price.$lte = max;
  if (Object.keys(price).length) filter.rentalPrice = price;

  const availability = str(q.availability);
  if (availability === "available") filter.availableQuantity = { $gt: 0 };
  if (availability === "unavailable") filter.availableQuantity = { $lte: 0 };

  const sorts: Record<string, Record<string, 1 | -1>> = {
    "price-asc": { rentalPrice: 1 },
    "price-desc": { rentalPrice: -1 },
    newest: { createdAt: -1 },
  };
  const sortBy = sorts[str(q.sort) ?? "newest"] ?? sorts.newest;

  const page = Math.max(1, Number(str(q.page)) || 1);
  const limit = Math.min(50, Math.max(1, Number(str(q.limit)) || 9));

  const col = await equipment();
  const [data, total] = await Promise.all([
    col
      .find(filter)
      .sort({ ...sortBy, _id: -1 }) // _id keeps pagination order stable
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    col.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /api/equipment/featured  (6 newest approved items)
router.get("/featured", async (_req, res) => {
  const data = await (await equipment())
    .find({ status: "approved" })
    .sort({ createdAt: -1 })
    .limit(6)
    .toArray();
  res.json({ success: true, data });
});

// GET /api/equipment/categories  (approved item count per category)
router.get("/categories", async (_req, res) => {
  const data = await (await equipment())
    .aggregate([
      { $match: { status: "approved" } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ])
    .toArray();
  res.json({ success: true, data });
});
// ---------- Owner ----------

// GET /api/equipment/mine
router.get("/mine", verifyToken, verifyOwner, async (req, res) => {
  const data = await (await equipment())
    .find({ ownerId: req.user!.id })
    .sort({ createdAt: -1 })
    .toArray();
  res.json({ success: true, data });
});

// POST /api/equipment
router.post("/", verifyToken, verifyOwner, async (req, res) => {
  const data = parseBody(equipmentSchema, req.body);
  const now = new Date();
  const doc = {
    ...data,
    ownerId: req.user!.id,
    ownerName: req.user!.name,
    ownerEmail: req.user!.email,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  const result = await (await equipment()).insertOne(doc);
  res.status(201).json({ success: true, data: { _id: result.insertedId, ...doc } });
});

// ---------- Admin ----------

// GET /api/equipment/admin/all?status=pending
router.get("/admin/all", verifyToken, verifyAdmin, async (req, res) => {
  const filter: Document = {};
  const status = str(req.query.status);
  if (status) filter.status = status;
  const data = await (await equipment()).find(filter).sort({ createdAt: -1 }).toArray();
  res.json({ success: true, data });
});

// PATCH /api/equipment/:id/status
router.patch("/:id/status", verifyToken, verifyAdmin, async (req, res) => {
  const { status } = parseBody(statusSchema, req.body);
  const result = await (await equipment()).findOneAndUpdate(
    { _id: toObjectId(req.params.id) },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!result) throw new AppError(404, "Equipment not found");
  res.json({ success: true, data: result });
});

// ---------- Any logged-in user ----------

// GET /api/equipment/:id
router.get("/:id", verifyToken, async (req, res) => {
  const doc = await (await equipment()).findOne({ _id: toObjectId(req.params.id) });
  const user = req.user!;
  const canSee =
    doc && (doc.status === "approved" || user.role === "admin" || doc.ownerId === user.id);
  if (!canSee) throw new AppError(404, "Equipment not found");
  res.json({ success: true, data: doc });
});

// PUT /api/equipment/:id  (owner of the item, or admin)
router.put("/:id", verifyToken, verifyOwnerOrAdmin, async (req, res) => {
  const col = await equipment();
  const _id = toObjectId(req.params.id);
  const existing = await col.findOne({ _id });
  if (!existing) throw new AppError(404, "Equipment not found");

  const user = req.user!;
  if (user.role === "owner" && existing.ownerId !== user.id) {
    throw new AppError(403, "You can only edit your own equipment");
  }

  const data = parseBody(equipmentSchema, req.body);
  // An owner's edit needs re-approval; an admin's edit keeps the current status
  const status = user.role === "owner" ? "pending" : existing.status;

  await col.updateOne({ _id }, { $set: { ...data, status, updatedAt: new Date() } });
  res.json({ success: true, message: "Equipment updated" });
});

// DELETE /api/equipment/:id  (owner of the item, or admin)
router.delete("/:id", verifyToken, verifyOwnerOrAdmin, async (req, res) => {
  const col = await equipment();
  const _id = toObjectId(req.params.id);
  const existing = await col.findOne({ _id });
  if (!existing) throw new AppError(404, "Equipment not found");

  const user = req.user!;
  if (user.role === "owner" && existing.ownerId !== user.id) {
    throw new AppError(403, "You can only delete your own equipment");
  }
  await col.deleteOne({ _id });
  res.json({ success: true, message: "Equipment deleted" });
});

export default router;
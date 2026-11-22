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
import {
  equipmentSchema,
  parseBody,
  statusSchema,
  STATUSES,
} from "../lib/equipmentSchema";

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

// Public listings must not leak owner contact details or demo-only flags.
const PUBLIC_PROJECTION = { ownerEmail: 0, seeded: 0 };

// Accept only finite integers; anything else falls back to the default.
const toInt = (v: unknown, fallback: number) => {
  const n = Number(str(v));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

// ---------- Public ----------

// GET /api/equipment?search=&category=&rentalType=&minPrice=&maxPrice=&availability=&sort=&page=&limit=
router.get("/", async (req, res) => {
  const q = req.query;
  const filter: Document = { status: "approved" };

  // Strip control characters (MongoDB rejects regexes containing NUL) and cap length.
  const search = str(q.search)
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 100);
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
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);
  if (hasMin && hasMax && min > max) {
    throw new AppError(400, "minPrice cannot be greater than maxPrice");
  }
  if (hasMin) price.$gte = min;
  if (hasMax) price.$lte = max;
  if (Object.keys(price).length) filter.rentalPrice = price;

  const availability = str(q.availability);
  if (availability === "available") filter.availableQuantity = { $gt: 0 };
  if (availability === "unavailable") filter.availableQuantity = { $lte: 0 };

  const sorts: Record<string, Record<string, 1 | -1>> = {
    "price-asc": { rentalPrice: 1 },
    "price-desc": { rentalPrice: -1 },
    newest: { createdAt: -1 },
  };
  const sortKey = str(q.sort);
  const sortBy =
    (sortKey && Object.hasOwn(sorts, sortKey) ? sorts[sortKey] : undefined) ?? sorts.newest;

  const requestedPage = Math.max(1, toInt(q.page, 1));
  const limit = Math.min(50, Math.max(1, toInt(q.limit, 9)));

  const col = await equipment();
  const total = await col.countDocuments(filter);
  const totalPages = Math.ceil(total / limit);
  // Clamp deep links (e.g. ?page=99) to the last real page.
  const page = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1;

  const data = await col
    .find(filter, { projection: PUBLIC_PROJECTION })
    .sort({ ...sortBy, _id: -1 }) // _id keeps pagination order stable
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();

  res.json({
    success: true,
    data,
    pagination: { page, limit, total, totalPages },
  });
});

// GET /api/equipment/featured  (6 newest approved items)
router.get("/featured", async (_req, res) => {
  const data = await (await equipment())
    .find({ status: "approved" }, { projection: PUBLIC_PROJECTION })
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
  if (status) {
    if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
      throw new AppError(400, "Invalid status filter");
    }
    filter.status = status;
  }
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
  if (!doc) throw new AppError(404, "Equipment not found");

  const user = req.user!;
  const canSee = doc.status === "approved" || user.role === "admin" || doc.ownerId === user.id;
  if (!canSee) throw new AppError(404, "Equipment not found");

  // Only admins and the owner get the owner's contact email; nobody gets demo flags.
  delete doc.seeded;
  if (user.role !== "admin" && doc.ownerId !== user.id) delete doc.ownerEmail;

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
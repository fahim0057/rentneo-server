import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db";
import { AppError } from "../middleware/errors";
import { verifyRenter, verifyToken } from "../middleware/auth";

const router = Router();

// Customers only, matching the brief
router.use(verifyToken, verifyRenter);

const favorites = async () => (await getDb()).collection("favorites");

function toObjectId(id: string): ObjectId {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new AppError(400, "Invalid equipment id");
  return new ObjectId(id);
}

// GET /api/favorites -> the favorited equipment documents themselves
router.get("/", async (req, res) => {
  const data = await (await favorites())
    .aggregate([
      { $match: { userId: req.user!.id } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "equipment",
          localField: "equipmentId",
          foreignField: "_id",
          as: "equipment",
        },
      },
      { $unwind: "$equipment" },
      { $match: { "equipment.status": "approved" } },
      { $replaceRoot: { newRoot: "$equipment" } },
    ])
    .toArray();
  res.json({ success: true, data });
});

// POST /api/favorites/:equipmentId
router.post("/:equipmentId", async (req, res) => {
  const equipmentId = toObjectId(req.params.equipmentId);

  const exists = await (await getDb())
    .collection("equipment")
    .findOne({ _id: equipmentId, status: "approved" }, { projection: { _id: 1 } });
  if (!exists) throw new AppError(404, "Equipment not found");

  // Upsert means adding the same item twice is harmless
  await (await favorites()).updateOne(
    { userId: req.user!.id, equipmentId },
    { $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
  res.status(201).json({ success: true, message: "Added to favorites" });
});

// DELETE /api/favorites/:equipmentId
router.delete("/:equipmentId", async (req, res) => {
  await (await favorites()).deleteOne({
    userId: req.user!.id,
    equipmentId: toObjectId(req.params.equipmentId),
  });
  res.json({ success: true, message: "Removed from favorites" });
});

export default router;
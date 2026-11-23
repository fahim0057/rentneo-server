import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db";
import { AppError } from "../middleware/errors";
import { verifyRenter, verifyToken } from "../middleware/auth";
import { parseBody } from "../lib/equipmentSchema";
import { toObjectId } from "../lib/ids";
import type { BookingDoc } from "../lib/bookingPayments";

const router = Router();

const reviews = async () => (await getDb()).collection("reviews");
const bookings = async () => (await getDb()).collection<BookingDoc>("bookings");

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

const reviewSchema = z.object({
  bookingId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid booking id"),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(500).default(""),
});

// Fields that are safe to show publicly. User ids and booking ids stay private.
const PUBLIC_PROJECTION = {
  name: 1,
  rating: 1,
  comment: 1,
  equipmentId: 1,
  createdAt: 1,
} as const;

// GET /api/reviews?equipmentId=&limit=
router.get("/", async (req, res) => {
  const equipmentId = str(req.query.equipmentId);
  const limit = Math.min(50, Math.max(1, Math.trunc(Number(str(req.query.limit)) || 12)));

  const filter: Record<string, unknown> = {};
  if (equipmentId) {
    filter.equipmentId = toObjectId(equipmentId, "equipment id").toHexString();
  }

  const col = await reviews();
  const [data, summary] = await Promise.all([
    col.find(filter, { projection: PUBLIC_PROJECTION }).sort({ createdAt: -1 }).limit(limit).toArray(),
    col
      .aggregate([
        { $match: filter },
        { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const average = summary[0]?.average ?? 0;
  res.json({
    success: true,
    data,
    summary: {
      average: Math.round(average * 10) / 10,
      count: summary[0]?.count ?? 0,
    },
  });
});

// GET /api/reviews/mine -> lets the rental list know which bookings are reviewed
router.get("/mine", verifyToken, async (req, res) => {
  const data = await (await reviews())
    .find({ userId: req.user!.id })
    .sort({ createdAt: -1 })
    .toArray();
  res.json({ success: true, data });
});

// POST /api/reviews -> only the renter of a completed booking can review it
router.post("/", verifyToken, verifyRenter, async (req, res) => {
  const input = parseBody(reviewSchema, req.body);
  const _id = toObjectId(input.bookingId, "booking id");

  const booking = await (await bookings()).findOne({
    _id,
    customerId: req.user!.id,
  });
  if (!booking) throw new AppError(404, "Booking not found");
  if (booking.bookingStatus !== "completed") {
    throw new AppError(400, "You can review a rental after it is completed");
  }

  const col = await reviews();
  const existing = await col.findOne({ bookingId: input.bookingId }, { projection: { _id: 1 } });
  if (existing) throw new AppError(409, "You have already reviewed this rental");

  const review = {
    bookingId: input.bookingId,
    userId: req.user!.id,
    equipmentId: booking.equipmentId,
    ownerId: booking.ownerId,
    name: booking.customerName,
    rating: input.rating,
    comment: input.comment,
    createdAt: new Date(),
  };

  try {
    const { insertedId } = await col.insertOne(review);
    res.status(201).json({
      success: true,
      data: { ...review, _id: insertedId },
    });
  } catch (err) {
    // The unique index on bookingId may win a race with the check above.
    if ((err as { code?: number }).code === 11000) {
      throw new AppError(409, "You have already reviewed this rental");
    }
    throw err;
  }
});

export default router;

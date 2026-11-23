import { Router } from "express";
import { getDb } from "../db";
import { verifyAdmin, verifyOwner, verifyToken } from "../middleware/auth";
import { CURRENCY } from "../lib/currency";

const router = Router();
const MONTHS = 12;

type Bucket = { month: string; bookings: number; revenue: number; payments: number };
type MonthRow = { _id: { year: number; month: number }; revenue: number; payments: number };
type BookingRow = { _id: { year: number; month: number }; bookings: number };

// A fixed 12-slot window ending with the current month, so the chart always has
// the same length even when some months have no activity.
function monthBuckets() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1), 1));
  const buckets = new Map<string, Bucket>();
  const list: Bucket[] = [];

  for (let i = 0; i < MONTHS; i += 1) {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const bucket = { month: date.toISOString().slice(0, 7), bookings: 0, revenue: 0, payments: 0 };
    buckets.set(bucket.month, bucket);
    list.push(bucket);
  }

  return { start, buckets, list };
}

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

function mergeMonthRows(buckets: Map<string, Bucket>, payments: MonthRow[], bookings: BookingRow[]) {
  for (const row of payments) {
    const bucket = buckets.get(monthKey(row._id.year, row._id.month));
    if (!bucket) continue;
    bucket.revenue = row.revenue;
    bucket.payments = row.payments;
  }
  for (const row of bookings) {
    const bucket = buckets.get(monthKey(row._id.year, row._id.month));
    if (bucket) bucket.bookings = row.bookings;
  }
}

// GET /api/analytics/admin
router.get("/admin", verifyToken, verifyAdmin, async (_req, res) => {
  const db = await getDb();
  const users = db.collection("user");
  const equipment = db.collection("equipment");
  const bookings = db.collection("bookings");
  const payments = db.collection("payments");
  const { start, buckets, list } = monthBuckets();

  const [
    userCount,
    equipmentCount,
    pendingApprovals,
    totalBookings,
    completedRentals,
    activeRentals,
    revenueAgg,
    paymentRows,
    bookingRows,
  ] = await Promise.all([
    users.countDocuments(),
    equipment.countDocuments(),
    equipment.countDocuments({ status: "pending" }),
    bookings.countDocuments(),
    bookings.countDocuments({ bookingStatus: "completed" }),
    bookings.countDocuments({ bookingStatus: { $in: ["confirmed", "active"] } }),
    payments
      .aggregate<{ total: number }>([
        { $match: { status: "succeeded" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
    payments
      .aggregate<MonthRow>([
        { $match: { status: "succeeded", createdAt: { $gte: start } } },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            revenue: { $sum: "$amount" },
            payments: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ])
      .toArray(),
    bookings
      .aggregate<BookingRow>([
        { $match: { createdAt: { $gte: start } } },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            bookings: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ])
      .toArray(),
  ]);

  mergeMonthRows(buckets, paymentRows, bookingRows);

  res.json({
    success: true,
    data: {
      users: userCount,
      equipment: equipmentCount,
      pendingApprovals,
      totalBookings,
      activeRentals,
      completedRentals,
      totalRevenue: revenueAgg[0]?.total ?? 0,
      currency: CURRENCY,
      monthly: list,
    },
  });
});

// GET /api/analytics/owner
router.get("/owner", verifyToken, verifyOwner, async (req, res) => {
  const ownerId = req.user!.id;
  const db = await getDb();
  const equipment = db.collection("equipment");
  const bookings = db.collection("bookings");
  const payments = db.collection("payments");
  const { start, buckets, list } = monthBuckets();

  const [
    equipmentCount,
    totalBookings,
    completedRentals,
    activeRentals,
    pendingBookings,
    earningsAgg,
    paymentRows,
    bookingRows,
  ] = await Promise.all([
    equipment.countDocuments({ ownerId }),
    bookings.countDocuments({ ownerId }),
    bookings.countDocuments({ ownerId, bookingStatus: "completed" }),
    bookings.countDocuments({ ownerId, bookingStatus: { $in: ["confirmed", "active"] } }),
    bookings.countDocuments({ ownerId, bookingStatus: "pending" }),
    payments
      .aggregate<{ total: number }>([
        { $match: { ownerId, status: "succeeded" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
    payments
      .aggregate<MonthRow>([
        { $match: { ownerId, status: "succeeded", createdAt: { $gte: start } } },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            revenue: { $sum: "$amount" },
            payments: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ])
      .toArray(),
    bookings
      .aggregate<BookingRow>([
        { $match: { ownerId, createdAt: { $gte: start } } },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            bookings: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ])
      .toArray(),
  ]);

  mergeMonthRows(buckets, paymentRows, bookingRows);

  res.json({
    success: true,
    data: {
      equipment: equipmentCount,
      totalBookings,
      pendingBookings,
      activeRentals,
      completedRentals,
      totalEarnings: earningsAgg[0]?.total ?? 0,
      currency: CURRENCY,
      monthly: list,
    },
  });
});

export default router;
